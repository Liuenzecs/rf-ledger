import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatCards } from "@/components/stat-cards";
import { ComboboxInput } from "@/components/combobox-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormSuggestions } from "@/lib/form-suggestions";
import type {
  CountResult,
  DailySummary,
  ListFiltersPayload,
  Transaction,
  TransactionType,
  UpdateTransactionPatchPayload
} from "@/lib/ledger-types";
import { useLanguage } from "@/lib/language";
import { tauriInvoke } from "@/lib/tauri";
import { useToast } from "@/lib/toast";

type EditFormState = {
  occurredAtLocal: string;
  amountYuan: string;
  type: TransactionType;
  category: string;
  account: string;
  note: string;
};

type AppliedListFilters = Omit<ListFiltersPayload, "limit" | "offset">;
type ListDensity = "comfortable" | "compact";
type PendingDeleteEntry = {
  item: Transaction;
  timeoutId: number;
};
type FilterTag = {
  key: "range" | "type" | "category" | "account" | "q";
  label: string;
};
type DailyTransactionGroup = {
  date: string;
  items: Transaction[];
};

const PAGE_SIZE = 20;
const DELETE_UNDO_MS = 5000;
const DENSITY_STORAGE_KEY = "rf-ledger-list-density";

function getInitialDensity(): ListDensity {
  if (typeof window === "undefined") {
    return "comfortable";
  }
  return window.localStorage.getItem(DENSITY_STORAGE_KEY) === "compact" ? "compact" : "comfortable";
}

function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(locale);
}

function formatDateLabel(dateKey: string, locale: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short"
  });
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function parseTransactionType(value: string | null): TransactionType | undefined {
  if (value === "income" || value === "expense") {
    return value;
  }
  return undefined;
}

function parseIsoQuery(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function parseTextQuery(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePageQuery(value: string | null): number {
  const page = Number.parseInt(value ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseAppliedState(searchParams: URLSearchParams): {
  filters: AppliedListFilters;
  page: number;
} {
  return {
    filters: {
      from: parseIsoQuery(searchParams.get("from")),
      to: parseIsoQuery(searchParams.get("to")),
      type: parseTransactionType(searchParams.get("type")),
      category: parseTextQuery(searchParams.get("category")),
      account: parseTextQuery(searchParams.get("account")),
      q: parseTextQuery(searchParams.get("q"))
    },
    page: parsePageQuery(searchParams.get("page"))
  };
}

function buildSearchParams(filters: AppliedListFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.from) {
    params.set("from", filters.from);
  }
  if (filters.to) {
    params.set("to", filters.to);
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.category) {
    params.set("category", filters.category);
  }
  if (filters.account) {
    params.set("account", filters.account);
  }
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  return params;
}

function hasFilters(filters: AppliedListFilters): boolean {
  return Boolean(
    filters.from || filters.to || filters.type || filters.category || filters.account || filters.q
  );
}

function transactionMatchesFilters(item: Transaction, filters: AppliedListFilters): boolean {
  if (filters.from && item.occurred_at < filters.from) {
    return false;
  }
  if (filters.to && item.occurred_at > filters.to) {
    return false;
  }
  if (filters.type && item.type !== filters.type) {
    return false;
  }
  if (filters.category && item.category !== filters.category) {
    return false;
  }
  if (filters.account && item.account !== filters.account) {
    return false;
  }
  if (filters.q) {
    const keyword = filters.q.toLowerCase();
    const haystack = `${item.note} ${item.category} ${item.account}`.toLowerCase();
    if (!haystack.includes(keyword)) {
      return false;
    }
  }
  return true;
}

function getLocalDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 10);
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildDailySummaryMap(items: DailySummary[]): Record<string, DailySummary> {
  return items.reduce<Record<string, DailySummary>>((acc, item) => {
    acc[item.date] = item;
    return acc;
  }, {});
}

function adjustDailySummaryMap(
  summaryMap: Record<string, DailySummary>,
  item: Transaction,
  direction: 1 | -1
): Record<string, DailySummary> {
  const dateKey = getLocalDateKey(item.occurred_at);
  const current = summaryMap[dateKey] ?? {
    date: dateKey,
    income_cents: 0,
    expense_cents: 0,
    net_cents: 0,
    count: 0
  };
  const nextSummary: DailySummary = {
    ...current,
    income_cents:
      current.income_cents + (item.type === "income" ? item.amount_cents * direction : 0),
    expense_cents:
      current.expense_cents + (item.type === "expense" ? item.amount_cents * direction : 0),
    count: current.count + direction
  };
  nextSummary.net_cents = nextSummary.income_cents - nextSummary.expense_cents;

  if (nextSummary.count <= 0) {
    const { [dateKey]: _removed, ...rest } = summaryMap;
    return rest;
  }

  return {
    ...summaryMap,
    [dateKey]: nextSummary
  };
}

function groupTransactionsByDate(items: Transaction[]): DailyTransactionGroup[] {
  const groups: DailyTransactionGroup[] = [];
  for (const item of items) {
    const dateKey = getLocalDateKey(item.occurred_at);
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || lastGroup.date !== dateKey) {
      groups.push({ date: dateKey, items: [item] });
      continue;
    }
    lastGroup.items.push(item);
  }
  return groups;
}

function TypeBadge({
  type,
  incomeLabel,
  expenseLabel
}: {
  type: TransactionType;
  incomeLabel: string;
  expenseLabel: string;
}) {
  const isIncome = type === "income";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
        isIncome
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-rose-100 bg-rose-50 text-rose-700"
      }`}
    >
      {isIncome ? incomeLabel : expenseLabel}
    </span>
  );
}

export function ListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language, displayCurrency, locale } = useLanguage();
  const { pushToast } = useToast();
  const { suggestions, refreshSuggestions } = useFormSuggestions();
  const isZh = language === "zh";
  const searchSignature = searchParams.toString();
  const appliedState = useMemo(
    () => parseAppliedState(searchParams),
    [searchParams, searchSignature]
  );
  const appliedFilters = appliedState.filters;
  const currentPage = appliedState.page;

  const text = useMemo(
    () =>
      ({
        title: isZh ? "\u5217\u8868" : "List",
        description: isZh
          ? "\u6309 URL \u540c\u6b65\u7b5b\u9009\u3001\u6309\u65e5\u5206\u7ec4\u67e5\u770b\u4ea4\u6613\u8bb0\u5f55\uff0c\u652f\u6301\u7f16\u8f91\u4e0e\u64a4\u9500\u5220\u9664\u3002"
          : "Browse URL-synced grouped records with edit and undo delete.",
        tableTitle: isZh ? "\u4ea4\u6613\u5217\u8868" : "Transactions",
        tableDesc: isZh
          ? "\u7b5b\u9009\u3001\u7ffb\u9875\u3001\u5f53\u65e5\u5c0f\u8ba1\u548c\u64a4\u9500\u5220\u9664\u90fd\u57fa\u4e8e\u540e\u7aef SQL \u4e0e\u524d\u7aef URL \u540c\u6b65\u3002"
          : "Filters, pagination, daily summaries and undo delete are synced through SQL and URL state.",
        from: isZh ? "\u5f00\u59cb\u65f6\u95f4" : "From",
        to: isZh ? "\u7ed3\u675f\u65f6\u95f4" : "To",
        allTypes: isZh ? "\u5168\u90e8\u7c7b\u578b" : "All Types",
        income: isZh ? "\u6536\u5165" : "Income",
        expense: isZh ? "\u652f\u51fa" : "Expense",
        category: isZh ? "\u7c7b\u522b" : "Category",
        paymentMethod: isZh ? "\u652f\u4ed8\u65b9\u5f0f" : "Payment Method",
        keywordPlaceholder: isZh ? "\u5173\u952e\u8bcd" : "Keyword",
        apply: isZh ? "\u5e94\u7528" : "Apply",
        reset: isZh ? "\u91cd\u7f6e" : "Reset",
        refresh: isZh ? "\u5237\u65b0" : "Refresh",
        densityComfortable: isZh ? "\u8212\u9002" : "Comfortable",
        densityCompact: isZh ? "\u7d27\u51d1" : "Compact",
        densityTitle: isZh ? "\u5bc6\u5ea6" : "Density",
        date: isZh ? "\u65e5\u671f" : "Date",
        details: isZh ? "\u660e\u7ec6" : "Details",
        amount: isZh ? "\u91d1\u989d" : "Amount",
        actions: isZh ? "\u64cd\u4f5c" : "Actions",
        noNote: isZh ? "\u65e0\u5907\u6ce8" : "No note",
        noDataTitle: isZh ? "\u6682\u65e0\u8bb0\u5f55" : "No records",
        noDataDescFiltered: isZh
          ? "\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u5339\u914d\u6570\u636e\u3002"
          : "No transactions match current filters.",
        noDataDescEmpty: isZh
          ? "\u8fd8\u6ca1\u6709\u4ea4\u6613\u8bb0\u5f55\uff0c\u53ef\u4ee5\u5148\u65b0\u589e\u4e00\u7b14\u3002"
          : "There are no transactions yet. Start by adding one.",
        clearFilters: isZh ? "\u6e05\u7a7a\u7b5b\u9009" : "Clear Filters",
        goToAdd: isZh ? "\u524d\u5f80\u65b0\u589e" : "Go To Add",
        edit: isZh ? "\u7f16\u8f91" : "Edit",
        del: isZh ? "\u5220\u9664" : "Delete",
        undo: isZh ? "\u64a4\u9500" : "Undo",
        loading: isZh ? "\u52a0\u8f7d\u4e2d" : "Loading",
        loadFailed: isZh ? "\u52a0\u8f7d\u5931\u8d25" : "Load failed",
        refreshed: isZh ? "\u5217\u8868\u5df2\u5237\u65b0" : "List refreshed",
        invalidRange: isZh
          ? "\u8d77\u6b62\u65f6\u95f4\u683c\u5f0f\u65e0\u6548\u3002"
          : "Invalid date range.",
        invalidRangeOrder: isZh
          ? "\u5f00\u59cb\u65f6\u95f4\u4e0d\u80fd\u665a\u4e8e\u7ed3\u675f\u65f6\u95f4\u3002"
          : "From must be earlier than To.",
        invalidAmount: isZh
          ? "\u8bf7\u8f93\u5165\u975e 0 \u7684\u91d1\u989d\u3002"
          : "Amount must be non-zero.",
        requiredFields: isZh
          ? "\u7c7b\u522b\u548c\u652f\u4ed8\u65b9\u5f0f\u4e0d\u80fd\u4e3a\u7a7a\u3002"
          : "Category and payment method are required.",
        save: isZh ? "\u4fdd\u5b58" : "Save",
        saving: isZh ? "\u4fdd\u5b58\u4e2d..." : "Saving...",
        cancel: isZh ? "\u53d6\u6d88" : "Cancel",
        editTitle: isZh ? "\u7f16\u8f91\u4ea4\u6613" : "Edit Transaction",
        editDesc: isZh
          ? "\u66f4\u65b0\u540e\u5c06\u7acb\u5373\u5199\u5165\u6570\u636e\u5e93\u3002"
          : "Changes will be saved immediately.",
        updateOk: isZh ? "\u66f4\u65b0\u6210\u529f" : "Updated",
        updateFail: isZh ? "\u66f4\u65b0\u5931\u8d25" : "Update failed",
        deleteQueued: isZh ? "\u5df2\u79fb\u5165\u5f85\u5220\u9664" : "Queued for deletion",
        deleteQueuedDesc: (item: Transaction) =>
          isZh
            ? `#${item.id} ${item.category} / ${item.account} \u53ef\u5728 5 \u79d2\u5185\u64a4\u9500\u3002`
            : `#${item.id} ${item.category} / ${item.account} can be restored within 5 seconds.`,
        deleteFail: isZh ? "\u5220\u9664\u5931\u8d25" : "Delete failed",
        occurredAt: isZh ? "\u53d1\u751f\u65f6\u95f4" : "Occurred At",
        type: isZh ? "\u7c7b\u578b" : "Type",
        amountYuan: isZh ? "\u91d1\u989d\uff08\u5143\uff09" : "Amount",
        categoryPlaceholder: isZh
          ? "\u8f93\u5165\u6216\u9009\u62e9\u5386\u53f2\u7c7b\u522b"
          : "Type or choose a previous category",
        accountPlaceholder: isZh
          ? "\u8f93\u5165\u6216\u9009\u62e9\u5386\u53f2\u652f\u4ed8\u65b9\u5f0f"
          : "Type or choose a previous payment method",
        filtersTitle: isZh ? "\u5df2\u5e94\u7528\u7b5b\u9009" : "Active Filters",
        noFilters: isZh ? "\u5f53\u524d\u65e0\u989d\u5916\u7b5b\u9009" : "No extra filters applied",
        keywordTag: isZh ? "\u5173\u952e\u8bcd" : "Keyword",
        prevPage: isZh ? "\u4e0a\u4e00\u9875" : "Prev",
        nextPage: isZh ? "\u4e0b\u4e00\u9875" : "Next",
        page: isZh ? "\u7b2c" : "Page",
        pageOf: isZh ? "\u9875\uff0c\u5171" : "of",
        pageSuffix: isZh ? "\u9875" : "",
        total: isZh ? "\u603b\u8bb0\u5f55" : "Total",
        dailyIncome: isZh ? "\u5f53\u65e5\u6536\u5165" : "Income",
        dailyExpense: isZh ? "\u5f53\u65e5\u652f\u51fa" : "Expense",
        dailyNet: isZh ? "\u5f53\u65e5\u51c0\u503c" : "Net",
        dailyCount: isZh ? "\u5f53\u65e5\u7b14\u6570" : "Count",
        pendingOnlyTitle: isZh
          ? "\u5f53\u9875\u8bb0\u5f55\u6b63\u5728\u7b49\u5f85\u5220\u9664"
          : "All visible records are pending deletion",
        pendingOnlyDesc: isZh
          ? "\u53ef\u4ee5\u5728 Toast \u4e2d\u64a4\u9500\uff0c\u6216\u7b49\u5f85 5 \u79d2\u540e\u5b8c\u6210\u5220\u9664\u3002"
          : "Undo them from the toast, or wait 5 seconds for deletion to complete.",
        noCategoryMatches: isZh
          ? "\u65e0\u5339\u914d\u7c7b\u522b\uff0c\u76f4\u63a5\u8f93\u5165\u5373\u53ef"
          : "No matches \u2014 type your own",
        noAccountMatches: isZh
          ? "\u65e0\u5339\u914d\u652f\u4ed8\u65b9\u5f0f\uff0c\u76f4\u63a5\u8f93\u5165\u5373\u53ef"
          : "No matches \u2014 type your own",
        countUses: isZh ? " \u6b21" : ""
      }) as const,
    [isZh]
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: displayCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
    [displayCurrency, locale]
  );

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [dailySummaryMap, setDailySummaryMap] = useState<Record<string, DailySummary>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [typeInput, setTypeInput] = useState<"all" | TransactionType>("all");
  const [categoryInput, setCategoryInput] = useState("");
  const [accountInput, setAccountInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    occurredAtLocal: "",
    amountYuan: "",
    type: "expense",
    category: "",
    account: "",
    note: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [density, setDensity] = useState<ListDensity>(() => getInitialDensity());
  const [pendingDeletes, setPendingDeletes] = useState<Record<number, PendingDeleteEntry>>({});

  const pendingDeletesRef = useRef<Record<number, PendingDeleteEntry>>({});
  const flushPendingDeletesRef = useRef<() => void>(() => undefined);
  const commitPendingDeleteRef = useRef<(id: number) => Promise<void>>(async () => undefined);
  const reloadCurrentViewRef = useRef<() => Promise<void>>(async () => undefined);
  const pendingDeleteEntries = useMemo(() => Object.values(pendingDeletes), [pendingDeletes]);
  const relevantPendingDeleteEntries = useMemo(
    () =>
      pendingDeleteEntries.filter((entry) => transactionMatchesFilters(entry.item, appliedFilters)),
    [appliedFilters, pendingDeleteEntries]
  );
  const pendingDeleteCount = relevantPendingDeleteEntries.length;
  const displayedTotalCount = Math.max(0, totalCount - pendingDeleteCount);
  const totalPages = Math.max(1, Math.ceil(displayedTotalCount / PAGE_SIZE));
  const displayedPage = Math.min(currentPage, totalPages);
  const visibleTransactions = useMemo(() => {
    const pendingIds = new Set(relevantPendingDeleteEntries.map((entry) => entry.item.id));
    return transactions.filter((item) => !pendingIds.has(item.id));
  }, [relevantPendingDeleteEntries, transactions]);
  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(visibleTransactions),
    [visibleTransactions]
  );
  const effectiveDailySummaryMap = useMemo(() => {
    let nextMap = { ...dailySummaryMap };
    for (const entry of relevantPendingDeleteEntries) {
      nextMap = adjustDailySummaryMap(nextMap, entry.item, -1);
    }
    return nextMap;
  }, [dailySummaryMap, relevantPendingDeleteEntries]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
    }
  }, [density]);

  const applySearchState = useCallback(
    (filters: AppliedListFilters, page: number, replace = false) => {
      setSearchParams(buildSearchParams(filters, page), { replace });
    },
    [setSearchParams]
  );

  useEffect(() => {
    setFromInput(appliedFilters.from ? toDatetimeLocal(appliedFilters.from) : "");
    setToInput(appliedFilters.to ? toDatetimeLocal(appliedFilters.to) : "");
    setTypeInput(appliedFilters.type ?? "all");
    setCategoryInput(appliedFilters.category ?? "");
    setAccountInput(appliedFilters.account ?? "");
    setKeywordInput(appliedFilters.q ?? "");
  }, [
    appliedFilters.account,
    appliedFilters.category,
    appliedFilters.from,
    appliedFilters.q,
    appliedFilters.to,
    appliedFilters.type
  ]);

  const loadTransactions = useCallback(
    async (filters: AppliedListFilters, page: number, showSuccessToast: boolean) => {
      setIsLoading(true);

      try {
        const queryFilters: ListFiltersPayload = {
          ...filters,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE
        };

        const [items, countResult, dailySummaries] = await Promise.all([
          tauriInvoke<Transaction[]>("list_transactions", { filters: queryFilters }),
          tauriInvoke<CountResult>("count_transactions", { filters }),
          tauriInvoke<DailySummary[]>("list_daily_summaries", { filters })
        ]);

        const nextTotal = countResult.total;
        const nextTotalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        if (page > nextTotalPages) {
          applySearchState(filters, nextTotalPages, true);
          return;
        }

        setTransactions(items);
        setTotalCount(nextTotal);
        setDailySummaryMap(buildDailySummaryMap(dailySummaries));

        if (showSuccessToast) {
          pushToast({
            title: text.refreshed,
            description: `${text.total}: ${nextTotal}`,
            variant: "success",
            durationMs: 1800
          });
        }
      } catch (error) {
        pushToast({
          title: text.loadFailed,
          description: String(error),
          variant: "error"
        });
      } finally {
        setIsLoading(false);
      }
    },
    [applySearchState, pushToast, text.loadFailed, text.refreshed, text.total]
  );

  useEffect(() => {
    void loadTransactions(appliedFilters, currentPage, false);
  }, [appliedFilters, currentPage, loadTransactions]);

  useEffect(() => {
    reloadCurrentViewRef.current = () => loadTransactions(appliedFilters, currentPage, false);
  }, [appliedFilters, currentPage, loadTransactions]);

  const buildFilters = (): AppliedListFilters | null => {
    const next: AppliedListFilters = {};

    if (fromInput) {
      const iso = datetimeLocalToIso(fromInput);
      if (!iso) {
        pushToast({ title: text.loadFailed, description: text.invalidRange, variant: "error" });
        return null;
      }
      next.from = iso;
    }

    if (toInput) {
      const iso = datetimeLocalToIso(toInput);
      if (!iso) {
        pushToast({ title: text.loadFailed, description: text.invalidRange, variant: "error" });
        return null;
      }
      next.to = iso;
    }
    if (next.from && next.to && new Date(next.from).getTime() > new Date(next.to).getTime()) {
      pushToast({
        title: text.loadFailed,
        description: text.invalidRangeOrder,
        variant: "error"
      });
      return null;
    }

    if (typeInput !== "all") {
      next.type = typeInput;
    }

    const category = categoryInput.trim();
    if (category) {
      next.category = category;
    }

    const account = accountInput.trim();
    if (account) {
      next.account = account;
    }

    const q = keywordInput.trim();
    if (q) {
      next.q = q;
    }

    return next;
  };

  const handleApplyFilters = () => {
    const next = buildFilters();
    if (!next) {
      return;
    }

    applySearchState(next, 1);
  };

  const handleResetFilters = () => {
    applySearchState({}, 1);
  };

  const handleRefresh = async () => {
    await loadTransactions(appliedFilters, currentPage, true);
  };

  const openEditDialog = (item: Transaction) => {
    setEditingTx(item);
    setEditForm({
      occurredAtLocal: toDatetimeLocal(item.occurred_at),
      amountYuan: (item.amount_cents / 100).toFixed(2),
      type: item.type,
      category: item.category,
      account: item.account,
      note: item.note
    });
  };

  const handleUpdate = async () => {
    if (!editingTx) {
      return;
    }

    const occurredAtIso = datetimeLocalToIso(editForm.occurredAtLocal);
    if (!occurredAtIso) {
      pushToast({ title: text.updateFail, description: text.invalidRange, variant: "error" });
      return;
    }

    const amount = Number.parseFloat(editForm.amountYuan);
    if (!Number.isFinite(amount) || amount === 0) {
      pushToast({ title: text.updateFail, description: text.invalidAmount, variant: "error" });
      return;
    }

    const amountCents = Math.round(amount * 100);
    if (amountCents === 0) {
      pushToast({ title: text.updateFail, description: text.invalidAmount, variant: "error" });
      return;
    }

    const category = editForm.category.trim();
    const account = editForm.account.trim();
    if (!category || !account) {
      pushToast({ title: text.updateFail, description: text.requiredFields, variant: "error" });
      return;
    }

    const patch: UpdateTransactionPatchPayload = {
      occurred_at: occurredAtIso,
      amount_cents: amountCents,
      type: editForm.type,
      category,
      account,
      note: editForm.note.trim()
    };

    setIsSaving(true);
    try {
      await tauriInvoke<Transaction>("update_transaction", { id: editingTx.id, patch });
      await refreshSuggestions();
      pushToast({ title: text.updateOk, variant: "success" });
      window.dispatchEvent(new Event("rf-ledger:transactions-changed"));
      setEditingTx(null);
      await loadTransactions(appliedFilters, currentPage, false);
    } catch (error) {
      pushToast({ title: text.updateFail, description: String(error), variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelPendingDelete = useCallback((id: number) => {
    setPendingDeletes((prev) => {
      const entry = prev[id];
      if (!entry) {
        return prev;
      }
      window.clearTimeout(entry.timeoutId);
      const next = { ...prev };
      delete next[id];
      pendingDeletesRef.current = next;
      return next;
    });
    void reloadCurrentViewRef.current();
  }, []);

  const commitPendingDelete = useCallback(
    async (id: number) => {
      const entry = pendingDeletesRef.current[id];
      if (!entry) {
        return;
      }

      window.clearTimeout(entry.timeoutId);
      setPendingDeletes((prev) => {
        if (!prev[id]) {
          return prev;
        }
        const next = { ...prev };
        delete next[id];
        pendingDeletesRef.current = next;
        return next;
      });

      try {
        const deleted = await tauriInvoke<boolean>("delete_transaction", { id });
        if (!deleted) {
          throw new Error(`#${id}`);
        }

        window.dispatchEvent(new Event("rf-ledger:transactions-changed"));
        await reloadCurrentViewRef.current();
      } catch (error) {
        pushToast({ title: text.deleteFail, description: String(error), variant: "error" });
        await reloadCurrentViewRef.current();
      }
    },
    [pushToast, text.deleteFail]
  );

  useEffect(() => {
    commitPendingDeleteRef.current = commitPendingDelete;
  }, [commitPendingDelete]);

  const queueDelete = useCallback(
    (item: Transaction) => {
      if (pendingDeletesRef.current[item.id]) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        void commitPendingDeleteRef.current(item.id);
      }, DELETE_UNDO_MS);

      setTransactions((prev) => prev.filter((entry) => entry.id !== item.id));
      setPendingDeletes((prev) => {
        const next = {
          ...prev,
          [item.id]: { item, timeoutId }
        };
        pendingDeletesRef.current = next;
        return next;
      });

      pushToast({
        title: text.deleteQueued,
        description: text.deleteQueuedDesc(item),
        variant: "info",
        durationMs: DELETE_UNDO_MS,
        actionLabel: text.undo,
        onAction: () => cancelPendingDelete(item.id)
      });
    },
    [
      cancelPendingDelete,
      commitPendingDelete,
      pushToast,
      text.deleteQueued,
      text.deleteQueuedDesc,
      text.undo
    ]
  );

  const flushPendingDeletes = useCallback(() => {
    const ids = Object.keys(pendingDeletesRef.current).map((value) => Number(value));
    for (const id of ids) {
      void commitPendingDelete(id);
    }
  }, [commitPendingDelete]);

  useEffect(() => {
    flushPendingDeletesRef.current = flushPendingDeletes;
  }, [flushPendingDeletes]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleBeforeUnload = () => {
      flushPendingDeletesRef.current();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushPendingDeletesRef.current();
    };
  }, []);

  const removeFilterTag = useCallback(
    (key: FilterTag["key"]) => {
      const next: AppliedListFilters = { ...appliedFilters };
      if (key === "range") {
        delete next.from;
        delete next.to;
      }
      if (key === "type") {
        delete next.type;
      }
      if (key === "category") {
        delete next.category;
      }
      if (key === "account") {
        delete next.account;
      }
      if (key === "q") {
        delete next.q;
      }
      applySearchState(next, 1);
    },
    [appliedFilters, applySearchState]
  );

  const filterTags = useMemo(() => {
    const tags: FilterTag[] = [];

    if (appliedFilters.from || appliedFilters.to) {
      const fromLabel = appliedFilters.from
        ? formatDateTime(appliedFilters.from, locale)
        : isZh
          ? "\u4e0d\u9650"
          : "Any";
      const toLabel = appliedFilters.to
        ? formatDateTime(appliedFilters.to, locale)
        : isZh
          ? "\u4e0d\u9650"
          : "Any";
      tags.push({
        key: "range",
        label: `${text.from}: ${fromLabel} - ${text.to}: ${toLabel}`
      });
    }

    if (appliedFilters.type) {
      tags.push({
        key: "type",
        label: `${text.type}: ${appliedFilters.type === "income" ? text.income : text.expense}`
      });
    }

    if (appliedFilters.category) {
      tags.push({
        key: "category",
        label: `${text.category}: ${appliedFilters.category}`
      });
    }

    if (appliedFilters.account) {
      tags.push({
        key: "account",
        label: `${text.paymentMethod}: ${appliedFilters.account}`
      });
    }

    if (appliedFilters.q) {
      tags.push({
        key: "q",
        label: `${text.keywordTag}: ${appliedFilters.q}`
      });
    }

    return tags;
  }, [
    appliedFilters.account,
    appliedFilters.category,
    appliedFilters.from,
    appliedFilters.q,
    appliedFilters.to,
    appliedFilters.type,
    isZh,
    locale,
    text.category,
    text.expense,
    text.from,
    text.income,
    text.keywordTag,
    text.paymentMethod,
    text.to,
    text.type
  ]);

  const rowPaddingClass = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const rowTextClass = density === "compact" ? "text-xs" : "text-sm";
  const rowGapClass = density === "compact" ? "space-y-0.5" : "space-y-1";
  const isFiltered = hasFilters(appliedFilters);

  return (
    <PageShell>
      <PageHeader title={text.title} description={text.description} />

      <StatCards />

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.tableTitle}</CardTitle>
          <CardDescription>{text.tableDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(6,minmax(0,1fr))]">
            <Input
              type="datetime-local"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
              placeholder={text.from}
            />
            <Input
              type="datetime-local"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
              placeholder={text.to}
            />

            <Select
              value={typeInput}
              onChange={(event) => setTypeInput(event.target.value as "all" | TransactionType)}
            >
              <option value="all">{text.allTypes}</option>
              <option value="income">{text.income}</option>
              <option value="expense">{text.expense}</option>
            </Select>

            <ComboboxInput
              placeholder={text.category}
              value={categoryInput}
              onChange={(value) => setCategoryInput(value)}
              suggestions={suggestions.categories}
              noResultsText={text.noCategoryMatches}
              countSuffix={text.countUses}
            />
            <ComboboxInput
              placeholder={text.paymentMethod}
              value={accountInput}
              onChange={(value) => setAccountInput(value)}
              suggestions={suggestions.accounts}
              noResultsText={text.noAccountMatches}
              countSuffix={text.countUses}
            />
            <Input
              placeholder={text.keywordPlaceholder}
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleApplyFilters}>{text.apply}</Button>
              <Button variant="outline" onClick={handleResetFilters}>
                {text.reset}
              </Button>
              <Button variant="secondary" onClick={() => void handleRefresh()} disabled={isLoading}>
                {text.refresh}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{text.densityTitle}</span>
              <Button
                variant={density === "comfortable" ? "default" : "outline"}
                size="sm"
                onClick={() => setDensity("comfortable")}
              >
                {text.densityComfortable}
              </Button>
              <Button
                variant={density === "compact" ? "default" : "outline"}
                size="sm"
                onClick={() => setDensity("compact")}
              >
                {text.densityCompact}
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{text.filtersTitle}</p>
              {filterTags.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                  {text.clearFilters}
                </Button>
              ) : null}
            </div>

            {filterTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">{text.noFilters}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filterTags.map((tag) => (
                  <button
                    key={tag.key}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm shadow-sm transition-colors hover:bg-muted"
                    onClick={() => removeFilterTag(tag.key)}
                  >
                    <span>{tag.label}</span>
                    <span className="text-muted-foreground">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {isLoading ? text.loading : `${text.total}: ${displayedTotalCount}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {text.page} {displayedPage} {text.pageOf} {totalPages}
              {text.pageSuffix}
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : groupedTransactions.length === 0 ? (
            pendingDeleteCount > 0 ? (
              <EmptyState title={text.pendingOnlyTitle} description={text.pendingOnlyDesc} />
            ) : (
              <EmptyState
                title={text.noDataTitle}
                description={isFiltered ? text.noDataDescFiltered : text.noDataDescEmpty}
                ctaLabel={isFiltered ? text.clearFilters : text.goToAdd}
                onCtaClick={isFiltered ? handleResetFilters : () => navigate("/add")}
              />
            )
          ) : (
            <div className="space-y-4">
              <div className="hidden rounded-xl border bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[220px_1fr_180px_160px]">
                <p>{text.date}</p>
                <p>{text.details}</p>
                <p className="text-right">{text.amount}</p>
                <p className="text-right">{text.actions}</p>
              </div>

              {groupedTransactions.map((group) => {
                const summary =
                  effectiveDailySummaryMap[group.date] ??
                  group.items.reduce<DailySummary>(
                    (acc, item) => ({
                      date: group.date,
                      income_cents:
                        acc.income_cents + (item.type === "income" ? item.amount_cents : 0),
                      expense_cents:
                        acc.expense_cents + (item.type === "expense" ? item.amount_cents : 0),
                      net_cents:
                        acc.net_cents +
                        (item.type === "income" ? item.amount_cents : -item.amount_cents),
                      count: acc.count + 1
                    }),
                    {
                      date: group.date,
                      income_cents: 0,
                      expense_cents: 0,
                      net_cents: 0,
                      count: 0
                    }
                  );

                return (
                  <section key={group.date} className="space-y-3">
                    <div className="rounded-xl border bg-muted/20 p-4 shadow-sm">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {formatDateLabel(group.date, locale)}
                          </p>
                          <p className="text-xs text-muted-foreground">{group.date}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-emerald-700">
                            {text.dailyIncome}:{" "}
                            {currencyFormatter.format(summary.income_cents / 100)}
                          </span>
                          <span className="inline-flex rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-rose-700">
                            {text.dailyExpense}:{" "}
                            {currencyFormatter.format(summary.expense_cents / 100)}
                          </span>
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
                            {text.dailyNet}: {currencyFormatter.format(summary.net_cents / 100)}
                          </span>
                          <span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-foreground">
                            {text.dailyCount}: {summary.count}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-xl border bg-card shadow-sm transition-colors hover:bg-muted/20 md:grid md:grid-cols-[220px_1fr_180px_160px] md:items-center md:gap-3 ${rowPaddingClass}`}
                        >
                          <p className={`${rowTextClass} text-muted-foreground`}>
                            {formatDateTime(item.occurred_at, locale)}
                          </p>

                          <div className={`mt-2 ${rowGapClass} md:mt-0`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`${rowTextClass} font-medium`}>
                                #{item.id} · {item.category} · {item.account}
                              </p>
                              <TypeBadge
                                type={item.type}
                                incomeLabel={text.income}
                                expenseLabel={text.expense}
                              />
                            </div>
                            <p className={`${rowTextClass} text-muted-foreground`}>
                              {item.note || text.noNote}
                            </p>
                          </div>

                          <p
                            className={`mt-2 text-right ${rowTextClass} font-medium md:mt-0 ${
                              item.type === "income" ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {currencyFormatter.format(item.amount_cents / 100)}
                          </p>

                          <div className="mt-2 flex justify-end gap-2 md:mt-0">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                              {text.edit}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:text-rose-700"
                              onClick={() => queueDelete(item)}
                            >
                              {text.del}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applySearchState(appliedFilters, Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  {text.prevPage}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {text.page} {displayedPage} {text.pageOf} {totalPages}
                  {text.pageSuffix}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    applySearchState(appliedFilters, Math.min(totalPages, currentPage + 1))
                  }
                  disabled={currentPage >= totalPages}
                >
                  {text.nextPage}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editingTx !== null}
        onOpenChange={(open) => (!open ? setEditingTx(null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.editTitle}</DialogTitle>
            <DialogDescription>{text.editDesc}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{text.occurredAt}</p>
              <Input
                type="datetime-local"
                value={editForm.occurredAtLocal}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, occurredAtLocal: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{text.amountYuan}</p>
              <Input
                type="number"
                step="0.01"
                value={editForm.amountYuan}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, amountYuan: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{text.type}</p>
              <Select
                value={editForm.type}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, type: event.target.value as TransactionType }))
                }
              >
                <option value="income">{text.income}</option>
                <option value="expense">{text.expense}</option>
              </Select>
            </div>

            <ComboboxInput
              placeholder={text.categoryPlaceholder}
              value={editForm.category}
              onChange={(value) =>
                setEditForm((prev) => ({ ...prev, category: value }))
              }
              suggestions={suggestions.categories}
              noResultsText={text.noCategoryMatches}
              countSuffix={text.countUses}
            />
            <ComboboxInput
              placeholder={text.accountPlaceholder}
              value={editForm.account}
              onChange={(value) =>
                setEditForm((prev) => ({ ...prev, account: value }))
              }
              suggestions={suggestions.accounts}
              noResultsText={text.noAccountMatches}
              countSuffix={text.countUses}
            />
            <Input
              placeholder={isZh ? "\u5907\u6ce8" : "Note"}
              value={editForm.note}
              onChange={(event) => setEditForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{text.cancel}</Button>
            </DialogClose>
            <Button onClick={() => void handleUpdate()} disabled={isSaving}>
              {isSaving ? text.saving : text.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
