import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatCards } from "@/components/stat-cards";
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
import { useLanguage } from "@/lib/language";
import { tauriInvoke } from "@/lib/tauri";
import { useToast } from "@/lib/toast";

type TransactionType = "income" | "expense";

type Transaction = {
  id: number;
  occurred_at: string;
  amount_cents: number;
  type: TransactionType;
  category: string;
  account: string;
  note: string;
  created_at: string;
  updated_at: string;
};

type ListFiltersPayload = {
  from?: string;
  to?: string;
  type?: TransactionType;
  category?: string;
  q?: string;
  limit?: number;
};

type UpdateTransactionPatchPayload = {
  occurred_at?: string;
  amount_cents?: number;
  type?: TransactionType;
  category?: string;
  account?: string;
  note?: string;
};

type EditFormState = {
  occurredAtLocal: string;
  amountYuan: string;
  type: TransactionType;
  category: string;
  account: string;
  note: string;
};

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
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

export function ListPage() {
  const { language } = useLanguage();
  const { pushToast } = useToast();
  const isZh = language === "zh";

  const text = useMemo(
    () =>
      ({
        title: isZh ? "\u5217\u8868" : "List",
        description: isZh
          ? "\u6d4f\u89c8\u4ea4\u6613\u8bb0\u5f55\uff0c\u652f\u6301\u7b5b\u9009\u3001\u7f16\u8f91\u4e0e\u5220\u9664\u3002"
          : "Browse records with filters, edit and delete.",
        tableTitle: isZh ? "\u4ea4\u6613\u5217\u8868" : "Transactions",
        tableDesc: isZh
          ? "\u7ed3\u679c\u6765\u81ea\u672c\u5730 SQLite\uff0c\u6309\u65f6\u95f4\u5012\u5e8f\u6392\u5217\u3002"
          : "Results from local SQLite ordered by recent first.",
        filterTitle: isZh ? "\u7b5b\u9009" : "Filters",
        filterDesc: isZh
          ? "\u6309\u65e5\u671f\u8303\u56f4\u3001\u7c7b\u578b\u3001\u5206\u7c7b\u4e0e\u5173\u952e\u8bcd\u8fdb\u884c SQL \u7b5b\u9009\u3002"
          : "SQL-backed filters: date range, type, category and keyword.",
        from: isZh ? "\u5f00\u59cb\u65f6\u95f4" : "From",
        to: isZh ? "\u7ed3\u675f\u65f6\u95f4" : "To",
        allTypes: isZh ? "\u5168\u90e8\u7c7b\u578b" : "All Types",
        income: isZh ? "\u6536\u5165" : "Income",
        expense: isZh ? "\u652f\u51fa" : "Expense",
        category: isZh ? "\u5206\u7c7b" : "Category",
        keyword: isZh ? "\u5173\u952e\u8bcd" : "Keyword",
        keywordPlaceholder: isZh
          ? "\u5907\u6ce8 / \u5206\u7c7b / \u8d26\u6237"
          : "note / category / account",
        apply: isZh ? "\u5e94\u7528" : "Apply",
        reset: isZh ? "\u91cd\u7f6e" : "Reset",
        refresh: isZh ? "\u5237\u65b0" : "Refresh",
        date: isZh ? "\u65e5\u671f" : "Date",
        details: isZh ? "\u660e\u7ec6" : "Details",
        amount: isZh ? "\u91d1\u989d" : "Amount",
        actions: isZh ? "\u64cd\u4f5c" : "Actions",
        noNote: isZh ? "\u65e0\u5907\u6ce8" : "No note",
        noDataTitle: isZh ? "\u6682\u65e0\u8bb0\u5f55" : "No records",
        noDataDesc: isZh
          ? "\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u5339\u914d\u6570\u636e\u3002"
          : "No transactions match current filters.",
        noDataCta: isZh ? "\u8c03\u6574\u7b5b\u9009" : "Adjust Filters",
        edit: isZh ? "\u7f16\u8f91" : "Edit",
        del: isZh ? "\u5220\u9664" : "Delete",
        loading: isZh ? "\u52a0\u8f7d\u4e2d" : "Loading",
        loadFailed: isZh ? "\u52a0\u8f7d\u5931\u8d25" : "Load failed",
        refreshed: isZh ? "\u5217\u8868\u5df2\u5237\u65b0" : "List refreshed",
        invalidRange: isZh
          ? "\u8d77\u6b62\u65f6\u95f4\u683c\u5f0f\u65e0\u6548\u3002"
          : "Invalid date range.",
        invalidAmount: isZh
          ? "\u8bf7\u8f93\u5165\u975e 0 \u7684\u91d1\u989d\u3002"
          : "Amount must be non-zero.",
        requiredFields: isZh
          ? "\u5206\u7c7b\u548c\u8d26\u6237\u4e0d\u80fd\u4e3a\u7a7a\u3002"
          : "Category and account are required.",
        save: isZh ? "\u4fdd\u5b58" : "Save",
        saving: isZh ? "\u4fdd\u5b58\u4e2d..." : "Saving...",
        cancel: isZh ? "\u53d6\u6d88" : "Cancel",
        editTitle: isZh ? "\u7f16\u8f91\u4ea4\u6613" : "Edit Transaction",
        editDesc: isZh
          ? "\u66f4\u65b0\u540e\u5c06\u7acb\u5373\u5199\u5165\u6570\u636e\u5e93\u3002"
          : "Changes will be saved immediately.",
        updateOk: isZh ? "\u66f4\u65b0\u6210\u529f" : "Updated",
        updateFail: isZh ? "\u66f4\u65b0\u5931\u8d25" : "Update failed",
        deleteTitle: isZh ? "\u5220\u9664\u4ea4\u6613" : "Delete Transaction",
        deleteDesc: (id: number) =>
          isZh
            ? `\u786e\u8ba4\u5220\u9664\u4ea4\u6613 #${id}\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002`
            : `Delete transaction #${id}? This action cannot be undone.`,
        deleting: isZh ? "\u5220\u9664\u4e2d..." : "Deleting...",
        deleteConfirm: isZh ? "\u786e\u8ba4\u5220\u9664" : "Confirm Delete",
        deleteOk: isZh ? "\u5220\u9664\u6210\u529f" : "Deleted",
        deleteFail: isZh ? "\u5220\u9664\u5931\u8d25" : "Delete failed",
        occurredAt: isZh ? "\u53d1\u751f\u65f6\u95f4" : "Occurred At",
        type: isZh ? "\u7c7b\u578b" : "Type",
        amountYuan: isZh ? "\u91d1\u989d\uff08\u5143\uff09" : "Amount"
      }) as const,
    [isZh]
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(isZh ? "zh-CN" : "en-US", {
        style: "currency",
        currency: isZh ? "CNY" : "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
    [isZh]
  );

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const defaultFilters: ListFiltersPayload = { limit: 200 };
  const [activeFilters, setActiveFilters] = useState<ListFiltersPayload>(defaultFilters);

  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [typeInput, setTypeInput] = useState<"all" | TransactionType>("all");
  const [categoryInput, setCategoryInput] = useState("");
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

  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadTransactions = useCallback(
    async (filters: ListFiltersPayload, showSuccessToast: boolean) => {
      setIsLoading(true);
      try {
        const result = await tauriInvoke<Transaction[]>("list_transactions", { filters });
        setTransactions(result);
        if (showSuccessToast) {
          pushToast({
            title: text.refreshed,
            description: `${result.length}`,
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
    [pushToast, text.loadFailed, text.refreshed]
  );

  useEffect(() => {
    void loadTransactions(activeFilters, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildFilters = (): ListFiltersPayload | null => {
    const next: ListFiltersPayload = { limit: 200 };

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

    if (typeInput !== "all") {
      next.type = typeInput;
    }

    const category = categoryInput.trim();
    if (category) {
      next.category = category;
    }

    const q = keywordInput.trim();
    if (q) {
      next.q = q;
    }

    return next;
  };

  const handleApplyFilters = async () => {
    const next = buildFilters();
    if (!next) {
      return;
    }

    setActiveFilters(next);
    await loadTransactions(next, true);
  };

  const handleResetFilters = async () => {
    setFromInput("");
    setToInput("");
    setTypeInput("all");
    setCategoryInput("");
    setKeywordInput("");

    setActiveFilters(defaultFilters);
    await loadTransactions(defaultFilters, true);
  };

  const handleRefresh = async () => {
    await loadTransactions(activeFilters, true);
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
      pushToast({ title: text.updateOk, variant: "success" });
      window.dispatchEvent(new Event("rf-ledger:transactions-changed"));
      setEditingTx(null);
      await loadTransactions(activeFilters, false);
    } catch (error) {
      pushToast({ title: text.updateFail, description: String(error), variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTx) {
      return;
    }

    setIsDeleting(true);
    try {
      const deleted = await tauriInvoke<boolean>("delete_transaction", { id: deletingTx.id });
      if (!deleted) {
        pushToast({ title: text.deleteFail, description: `#${deletingTx.id}`, variant: "error" });
      } else {
        pushToast({ title: text.deleteOk, variant: "success" });
        window.dispatchEvent(new Event("rf-ledger:transactions-changed"));
      }
      setDeletingTx(null);
      await loadTransactions(activeFilters, false);
    } catch (error) {
      pushToast({ title: text.deleteFail, description: String(error), variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

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
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {isLoading ? text.loading : `${transactions.length}`}
            </p>
            <Button variant="outline" onClick={() => void handleRefresh()} disabled={isLoading}>
              {text.refresh}
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              title={text.noDataTitle}
              description={text.noDataDesc}
              ctaLabel={text.noDataCta}
            />
          ) : (
            <div className="space-y-3">
              <div className="hidden rounded-xl border bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[220px_1fr_180px_160px]">
                <p>{text.date}</p>
                <p>{text.details}</p>
                <p className="text-right">{text.amount}</p>
                <p className="text-right">{text.actions}</p>
              </div>

              {transactions.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted/20 md:grid md:grid-cols-[220px_1fr_180px_160px] md:items-center md:gap-3"
                >
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(item.occurred_at)}
                  </p>

                  <div className="mt-2 space-y-1 md:mt-0">
                    <p className="text-sm font-medium">
                      #{item.id} | {item.category} | {item.account}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.note || text.noNote}</p>
                  </div>

                  <p
                    className={`mt-2 text-right text-sm font-medium md:mt-0 ${item.type === "income" ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {item.type === "income" ? text.income : text.expense} |{" "}
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
                      onClick={() => setDeletingTx(item)}
                    >
                      {text.del}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.filterTitle}</CardTitle>
          <CardDescription>{text.filterDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
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

            <Input
              placeholder={text.category}
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.target.value)}
            />
            <Input
              placeholder={text.keywordPlaceholder}
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleApplyFilters()}>{text.apply}</Button>
            <Button variant="outline" onClick={() => void handleResetFilters()}>
              {text.reset}
            </Button>
            <Button variant="secondary" onClick={() => void handleRefresh()} disabled={isLoading}>
              {text.refresh}
            </Button>
          </div>
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

            <Input
              placeholder={text.category}
              value={editForm.category}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, category: event.target.value }))
              }
            />
            <Input
              placeholder={isZh ? "\u8d26\u6237" : "Account"}
              value={editForm.account}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, account: event.target.value }))
              }
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

      <Dialog
        open={deletingTx !== null}
        onOpenChange={(open) => (!open ? setDeletingTx(null) : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.deleteTitle}</DialogTitle>
            <DialogDescription>
              {deletingTx ? text.deleteDesc(deletingTx.id) : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{text.cancel}</Button>
            </DialogClose>
            <Button onClick={() => void handleDelete()} disabled={isDeleting}>
              {isDeleting ? text.deleting : text.deleteConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
