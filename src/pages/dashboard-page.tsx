import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatCards } from "@/components/stat-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AccountPoint,
  CategoryPoint,
  DailyPoint,
  StatsComparison,
  StatsSummary
} from "@/lib/ledger-types";
import { useLanguage } from "@/lib/language";
import { tauriInvoke } from "@/lib/tauri";
import { useToast } from "@/lib/toast";

type RangePreset = "month" | "last30" | "custom";
type AppliedRange = {
  from: string;
  to: string;
};

type DrilldownPayload = {
  category?: string;
  account?: string;
};

function toDatetimeLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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

function getMonthRange(): { from: string; to: string } {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from: toDatetimeLocalInput(monthStart), to: toDatetimeLocalInput(now) };
}

function getLast30Range(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: toDatetimeLocalInput(from), to: toDatetimeLocalInput(now) };
}

function formatRangeLabel(from: string, to: string, locale: string): string {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return `${from} - ${to}`;
  }
  return `${fromDate.toLocaleString(locale)} - ${toDate.toLocaleString(locale)}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { language, displayCurrency, locale } = useLanguage();
  const { pushToast } = useToast();
  const isZh = language === "zh";

  const text = useMemo(
    () =>
      ({
        pageTitle: isZh ? "\u770b\u677f" : "Dashboard",
        pageDesc: isZh
          ? "\u6309\u65f6\u95f4\u8303\u56f4\u67e5\u770b\u6536\u5165\u3001\u652f\u51fa\u3001\u7c7b\u522b\u4e0e\u652f\u4ed8\u65b9\u5f0f\u5206\u5e03\u3002"
          : "Monitor income, expense, category and payment method trends by time range.",
        thisMonth: isZh ? "\u672c\u6708" : "This Month",
        last30Days: isZh ? "\u8fd130\u5929" : "Last 30 Days",
        custom: isZh ? "\u81ea\u5b9a\u4e49" : "Custom",
        apply: isZh ? "\u5e94\u7528" : "Apply",
        loading: isZh ? "\u52a0\u8f7d\u4e2d..." : "Loading...",
        invalidRange: isZh
          ? "\u65f6\u95f4\u8303\u56f4\u683c\u5f0f\u65e0\u6548\u3002"
          : "Invalid date range.",
        invalidRangeOrder: isZh
          ? "\u5f00\u59cb\u65f6\u95f4\u4e0d\u80fd\u665a\u4e8e\u7ed3\u675f\u65f6\u95f4\u3002"
          : "From must be earlier than To.",
        statsLoadFailed: isZh
          ? "\u7edf\u8ba1\u52a0\u8f7d\u5931\u8d25"
          : "Failed to load statistics",
        statsRefreshed: isZh ? "\u7edf\u8ba1\u5df2\u66f4\u65b0" : "Statistics refreshed",
        comparisonTitle: isZh ? "\u73af\u6bd4\u6458\u8981" : "Comparison Summary",
        comparisonDesc: isZh
          ? "\u4e0e\u4e0a\u4e00\u4e2a\u540c\u957f\u65f6\u95f4\u533a\u95f4\u5bf9\u6bd4\u652f\u51fa\u4e0e\u4ea4\u6613\u7b14\u6570\u53d8\u5316\u3002"
          : "Compare expense and transaction count against the previous equal-length period.",
        previousRange: isZh ? "\u5bf9\u6bd4\u533a\u95f4" : "Previous Range",
        currentValue: isZh ? "\u5f53\u524d" : "Current",
        previousValue: isZh ? "\u4e0a\u671f" : "Previous",
        deltaValue: isZh ? "\u53d8\u5316" : "Delta",
        newCompare: isZh ? "\u65b0\u589e" : "New",
        noComparable: isZh ? "\u65e0\u53ef\u6bd4\u503c" : "No baseline",
        dailyTitle: isZh ? "\u6bcf\u65e5\u8d8b\u52bf" : "Daily Trend",
        dailyDesc: isZh
          ? "\u6536\u5165/\u652f\u51fa\u67f1\u72b6 + \u51c0\u503c\u7ebf\uff08\u5355\u4f4d\uff1a\u5143\uff09\u3002"
          : "Income/Expense bars with Net line.",
        noDailyTitle: isZh
          ? "\u5f53\u524d\u8303\u56f4\u6682\u65e0\u8d8b\u52bf\u6570\u636e"
          : "No daily trend in this range",
        noDailyDesc: isZh
          ? "\u8bf7\u5728\u65b0\u589e\u9875\u5f55\u5165\u4ea4\u6613\u6216\u8c03\u6574\u65f6\u95f4\u8303\u56f4\u3002"
          : "Insert transactions on Add page or adjust range.",
        refreshDashboard: isZh
          ? "\u91cd\u65b0\u5e94\u7528\u65f6\u95f4\u8303\u56f4"
          : "Reapply Range",
        income: isZh ? "\u6536\u5165" : "Income",
        expense: isZh ? "\u652f\u51fa" : "Expense",
        net: isZh ? "\u51c0\u503c" : "Net",
        categoryTitle: isZh ? "\u652f\u51fa\u7c7b\u522b Top 10" : "Expense Categories Top 10",
        categoryDesc: isZh
          ? "\u6309\u7c7b\u522b\u6c47\u603b\u652f\u51fa\u91d1\u989d\uff0c\u70b9\u51fb\u53ef\u8df3\u8f6c\u5230\u5217\u8868\u67e5\u770b\u660e\u7ec6\u3002"
          : "Top categories by expense amount. Click a bar to drill into the list.",
        noCategoryTitle: isZh ? "\u6682\u65e0\u7c7b\u522b\u7edf\u8ba1" : "No category statistics",
        noCategoryDesc: isZh
          ? "\u5f53\u524d\u8303\u56f4\u6ca1\u6709\u652f\u51fa\u8bb0\u5f55\u3002"
          : "No expense records in this range.",
        accountTitle: isZh ? "\u652f\u4ed8\u65b9\u5f0f Top 10" : "Payment Methods Top 10",
        accountDesc: isZh
          ? "\u6309\u652f\u4ed8\u65b9\u5f0f\u6c47\u603b\u652f\u51fa\u91d1\u989d\uff0c\u70b9\u51fb\u53ef\u8df3\u8f6c\u5230\u5217\u8868\u67e5\u770b\u660e\u7ec6\u3002"
          : "Top payment methods by expense amount. Click a bar to drill into the list.",
        noAccountTitle: isZh
          ? "\u6682\u65e0\u652f\u4ed8\u65b9\u5f0f\u7edf\u8ba1"
          : "No payment method statistics",
        noAccountDesc: isZh
          ? "\u5f53\u524d\u8303\u56f4\u6ca1\u6709\u53ef\u7528\u7684\u652f\u4ed8\u65b9\u5f0f\u8bb0\u5f55\u3002"
          : "No payment method records in this range.",
        amount: isZh ? "\u91d1\u989d" : "Amount",
        category: isZh ? "\u7c7b\u522b" : "Category",
        paymentMethod: isZh ? "\u652f\u4ed8\u65b9\u5f0f" : "Payment Method",
        txCount: isZh ? "\u4ea4\u6613\u7b14\u6570" : "Transactions"
      }) as const,
    [isZh]
  );

  const initialDraftRange = getLast30Range();
  const initialAppliedRange: AppliedRange = {
    from: datetimeLocalToIso(initialDraftRange.from) ?? new Date().toISOString(),
    to: datetimeLocalToIso(initialDraftRange.to) ?? new Date().toISOString()
  };

  const [preset, setPreset] = useState<RangePreset>("last30");
  const [fromInput, setFromInput] = useState(initialDraftRange.from);
  const [toInput, setToInput] = useState(initialDraftRange.to);
  const [appliedRange, setAppliedRange] = useState<AppliedRange>(initialAppliedRange);

  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [comparison, setComparison] = useState<StatsComparison | null>(null);
  const [dailyPoints, setDailyPoints] = useState<DailyPoint[]>([]);
  const [categoryPoints, setCategoryPoints] = useState<CategoryPoint[]>([]);
  const [accountPoints, setAccountPoints] = useState<AccountPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const shouldToastOnNextLoad = useRef(false);

  const formatCurrency = useCallback(
    (valueCents: number): string =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: displayCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(valueCents / 100),
    [displayCurrency, locale]
  );

  const formatSignedCurrency = useCallback(
    (valueCents: number): string => {
      if (valueCents === 0) {
        return formatCurrency(0);
      }
      const sign = valueCents > 0 ? "+" : "-";
      return `${sign}${formatCurrency(Math.abs(valueCents))}`;
    },
    [formatCurrency]
  );

  const formatSignedCount = useCallback((value: number): string => {
    if (value === 0) {
      return "0";
    }
    return `${value > 0 ? "+" : ""}${value}`;
  }, []);

  const refreshStats = useCallback(
    async (filters: AppliedRange, showSuccessToast: boolean) => {
      setIsLoading(true);
      try {
        const [summaryData, comparisonData, dailyData, categoryData, accountData] =
          await Promise.all([
            tauriInvoke<StatsSummary>("stats_summary", { filters }),
            tauriInvoke<StatsComparison>("stats_comparison", { filters }),
            tauriInvoke<DailyPoint[]>("stats_daily", { filters }),
            tauriInvoke<CategoryPoint[]>("stats_by_category", {
              filters: { ...filters, type: "expense", top_n: 10 }
            }),
            tauriInvoke<AccountPoint[]>("stats_by_account", {
              filters: { ...filters, type: "expense", top_n: 10 }
            })
          ]);

        setSummary(summaryData);
        setComparison(comparisonData);
        setDailyPoints(dailyData);
        setCategoryPoints(categoryData);
        setAccountPoints(accountData);

        if (showSuccessToast) {
          pushToast({ title: text.statsRefreshed, variant: "success", durationMs: 1800 });
        }
      } catch (error) {
        pushToast({ title: text.statsLoadFailed, description: String(error), variant: "error" });
      } finally {
        setIsLoading(false);
      }
    },
    [pushToast, text.statsLoadFailed, text.statsRefreshed]
  );

  const handleDrilldown = useCallback(
    (payload: DrilldownPayload) => {
      const params = new URLSearchParams();
      params.set("from", appliedRange.from);
      params.set("to", appliedRange.to);
      params.set("type", "expense");
      if (payload.category) {
        params.set("category", payload.category);
      }
      if (payload.account) {
        params.set("account", payload.account);
      }
      navigate({
        pathname: "/list",
        search: `?${params.toString()}`
      });
    },
    [appliedRange.from, appliedRange.to, navigate]
  );

  useEffect(() => {
    if (preset === "month") {
      const next = getMonthRange();
      setFromInput(next.from);
      setToInput(next.to);
      return;
    }
    if (preset === "last30") {
      const next = getLast30Range();
      setFromInput(next.from);
      setToInput(next.to);
    }
  }, [preset]);

  useEffect(() => {
    const showSuccessToast = shouldToastOnNextLoad.current;
    shouldToastOnNextLoad.current = false;
    void refreshStats(appliedRange, showSuccessToast);
  }, [appliedRange, refreshStats]);

  const handleApply = () => {
    const fromIso = datetimeLocalToIso(fromInput);
    const toIso = datetimeLocalToIso(toInput);
    if (!fromIso || !toIso) {
      pushToast({
        title: text.statsLoadFailed,
        description: text.invalidRange,
        variant: "error"
      });
      return;
    }
    if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
      pushToast({
        title: text.statsLoadFailed,
        description: text.invalidRangeOrder,
        variant: "error"
      });
      return;
    }

    shouldToastOnNextLoad.current = true;
    setAppliedRange({ from: fromIso, to: toIso });
  };

  const statSummary = useMemo(
    () =>
      summary
        ? {
            totalIncomeCents: summary.total_income_cents,
            totalExpenseCents: summary.total_expense_cents,
            netCents: summary.net_cents,
            txCount: summary.tx_count
          }
        : undefined,
    [summary]
  );

  const dailyChartData = useMemo(
    () =>
      dailyPoints.map((item) => ({
        date: item.date.slice(5),
        income: item.income_cents / 100,
        expense: item.expense_cents / 100,
        net: item.net_cents / 100
      })),
    [dailyPoints]
  );

  const categoryChartData = useMemo(
    () =>
      categoryPoints.map((item) => ({
        category: item.category,
        total: item.total_cents / 100,
        count: item.count
      })),
    [categoryPoints]
  );

  const accountChartData = useMemo(
    () =>
      accountPoints.map((item) => ({
        account: item.account,
        total: item.total_cents / 100,
        count: item.count
      })),
    [accountPoints]
  );

  const comparisonCards = useMemo(() => {
    if (!comparison) {
      return [];
    }

    const expenseRatioLabel =
      comparison.expense.delta_ratio === null
        ? comparison.expense.current === 0
          ? text.noComparable
          : text.newCompare
        : `${comparison.expense.delta_ratio >= 0 ? "+" : ""}${(comparison.expense.delta_ratio * 100).toFixed(1)}%`;
    const countRatioLabel =
      comparison.tx_count.delta_ratio === null
        ? comparison.tx_count.current === 0
          ? text.noComparable
          : text.newCompare
        : `${comparison.tx_count.delta_ratio >= 0 ? "+" : ""}${(comparison.tx_count.delta_ratio * 100).toFixed(1)}%`;

    return [
      {
        key: "expense",
        label: text.expense,
        current: formatCurrency(comparison.expense.current),
        previous: formatCurrency(comparison.expense.previous),
        delta: formatSignedCurrency(comparison.expense.delta),
        ratio: expenseRatioLabel,
        tone:
          comparison.expense.delta > 0
            ? "text-rose-600"
            : comparison.expense.delta < 0
              ? "text-emerald-600"
              : "text-slate-600"
      },
      {
        key: "count",
        label: text.txCount,
        current: String(comparison.tx_count.current),
        previous: String(comparison.tx_count.previous),
        delta: formatSignedCount(comparison.tx_count.delta),
        ratio: countRatioLabel,
        tone:
          comparison.tx_count.delta > 0
            ? "text-rose-600"
            : comparison.tx_count.delta < 0
              ? "text-emerald-600"
              : "text-slate-600"
      }
    ];
  }, [
    comparison,
    formatCurrency,
    formatSignedCount,
    formatSignedCurrency,
    text.expense,
    text.newCompare,
    text.noComparable,
    text.txCount
  ]);

  const incomeColor = "hsl(var(--chart-income))";
  const expenseColor = "hsl(var(--chart-expense))";
  const netColor = "hsl(var(--chart-net))";

  return (
    <PageShell>
      <PageHeader
        title={text.pageTitle}
        description={text.pageDesc}
        actions={
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-[120px_220px_220px_auto]">
            <Select
              value={preset}
              onChange={(event) => setPreset(event.target.value as RangePreset)}
            >
              <option value="month">{text.thisMonth}</option>
              <option value="last30">{text.last30Days}</option>
              <option value="custom">{text.custom}</option>
            </Select>
            <Input
              type="datetime-local"
              className="pr-10"
              value={fromInput}
              onChange={(event) => {
                setPreset("custom");
                setFromInput(event.target.value);
              }}
            />
            <Input
              type="datetime-local"
              className="pr-10"
              value={toInput}
              onChange={(event) => {
                setPreset("custom");
                setToInput(event.target.value);
              }}
            />
            <Button onClick={handleApply} disabled={isLoading}>
              {isLoading ? text.loading : text.apply}
            </Button>
          </div>
        }
      />

      <StatCards summary={statSummary} formatAmount={formatCurrency} />

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.comparisonTitle}</CardTitle>
          <CardDescription>{text.comparisonDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          {isLoading && !comparison ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : comparison ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {comparisonCards.map((card) => (
                  <div key={card.key} className="rounded-xl border bg-muted/20 p-4 shadow-sm">
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className={`mt-2 text-2xl font-semibold ${card.tone}`}>{card.current}</p>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <p>
                        {text.previousValue}: {card.previous}
                      </p>
                      <p>
                        {text.deltaValue}: {card.delta}
                      </p>
                      <p>{card.ratio}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {text.previousRange}:{" "}
                {formatRangeLabel(comparison.previous_from, comparison.previous_to, locale)}
              </p>
            </>
          ) : (
            <EmptyState
              title={text.comparisonTitle}
              description={text.comparisonDesc}
              ctaLabel={text.refreshDashboard}
              onCtaClick={handleApply}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.dailyTitle}</CardTitle>
          <CardDescription>{text.dailyDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-[280px] w-full" />
            </div>
          ) : dailyChartData.length === 0 ? (
            <EmptyState
              title={text.noDailyTitle}
              description={text.noDailyDesc}
              ctaLabel={text.refreshDashboard}
              onCtaClick={handleApply}
            />
          ) : (
            <div className="h-[320px] w-full rounded-xl border bg-muted/20 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const keyMap: Record<string, string> = {
                        income: text.income,
                        expense: text.expense,
                        net: text.net
                      };
                      return [formatCurrency(Math.round(value * 100)), keyMap[name] ?? name];
                    }}
                  />
                  <Legend
                    formatter={(value) => {
                      const map: Record<string, string> = {
                        income: text.income,
                        expense: text.expense,
                        net: text.net
                      };
                      return map[value] ?? value;
                    }}
                  />
                  <Bar dataKey="income" name="income" fill={incomeColor} radius={[8, 8, 0, 0]} />
                  <Bar dataKey="expense" name="expense" fill={expenseColor} radius={[8, 8, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="net"
                    stroke={netColor}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="p-6">
            <CardTitle>{text.categoryTitle}</CardTitle>
            <CardDescription>{text.categoryDesc}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : categoryChartData.length === 0 ? (
              <EmptyState
                title={text.noCategoryTitle}
                description={text.noCategoryDesc}
                ctaLabel={text.refreshDashboard}
                onCtaClick={handleApply}
              />
            ) : (
              <div className="h-[320px] w-full rounded-xl border bg-muted/20 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryChartData}
                    layout="vertical"
                    margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="category" width={120} />
                    <Tooltip
                      formatter={(value: number) => [
                        formatCurrency(Math.round(value * 100)),
                        text.amount
                      ]}
                      labelFormatter={(label: string) => `${text.category}: ${label}`}
                    />
                    <Bar
                      dataKey="total"
                      fill={expenseColor}
                      radius={[0, 8, 8, 0]}
                      cursor="pointer"
                      onClick={(data) => {
                        const category = (data as { category?: string } | undefined)?.category;
                        if (category) {
                          handleDrilldown({ category });
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-6">
            <CardTitle>{text.accountTitle}</CardTitle>
            <CardDescription>{text.accountDesc}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : accountChartData.length === 0 ? (
              <EmptyState
                title={text.noAccountTitle}
                description={text.noAccountDesc}
                ctaLabel={text.refreshDashboard}
                onCtaClick={handleApply}
              />
            ) : (
              <div className="h-[320px] w-full rounded-xl border bg-muted/20 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={accountChartData}
                    layout="vertical"
                    margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="account" width={120} />
                    <Tooltip
                      formatter={(value: number) => [
                        formatCurrency(Math.round(value * 100)),
                        text.amount
                      ]}
                      labelFormatter={(label: string) => `${text.paymentMethod}: ${label}`}
                    />
                    <Bar
                      dataKey="total"
                      fill={netColor}
                      radius={[0, 8, 8, 0]}
                      cursor="pointer"
                      onClick={(data) => {
                        const account = (data as { account?: string } | undefined)?.account;
                        if (account) {
                          handleDrilldown({ account });
                        }
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
