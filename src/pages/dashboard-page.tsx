import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useLanguage } from "@/lib/language";
import { tauriInvoke } from "@/lib/tauri";
import { useToast } from "@/lib/toast";

type StatsSummary = {
  total_income_cents: number;
  total_expense_cents: number;
  net_cents: number;
  tx_count: number;
};

type DailyPoint = {
  date: string;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
};

type CategoryPoint = {
  category: string;
  total_cents: number;
  count: number;
};

type RangePreset = "month" | "last30" | "custom";

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

export function DashboardPage() {
  const { language } = useLanguage();
  const { pushToast } = useToast();
  const isZh = language === "zh";

  const text = useMemo(
    () =>
      ({
        pageTitle: isZh ? "\u770b\u677f" : "Dashboard",
        pageDesc: isZh
          ? "\u6309\u65f6\u95f4\u8303\u56f4\u67e5\u770b\u6536\u5165\u3001\u652f\u51fa\u4e0e\u7c7b\u522b\u5206\u5e03\u3002"
          : "Monitor income, expense and category trends by time range.",
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
        refreshDashboard: isZh ? "\u5237\u65b0\u770b\u677f" : "Refresh Dashboard",
        income: isZh ? "\u6536\u5165" : "Income",
        expense: isZh ? "\u652f\u51fa" : "Expense",
        net: isZh ? "\u51c0\u503c" : "Net",
        categoryTitle: isZh ? "\u652f\u51fa\u7c7b\u522b Top 10" : "Expense Categories Top 10",
        categoryDesc: isZh
          ? "\u6309\u7c7b\u522b\u6c47\u603b\u652f\u51fa\u91d1\u989d\u3002"
          : "Top categories by expense amount.",
        noCategoryTitle: isZh ? "\u6682\u65e0\u7c7b\u522b\u7edf\u8ba1" : "No category statistics",
        noCategoryDesc: isZh
          ? "\u5f53\u524d\u8303\u56f4\u6ca1\u6709\u652f\u51fa\u8bb0\u5f55\u3002"
          : "No expense records in this range.",
        adjustRange: isZh ? "\u8c03\u6574\u8303\u56f4" : "Adjust Range",
        amount: isZh ? "\u91d1\u989d" : "Amount",
        category: isZh ? "\u7c7b\u522b" : "Category"
      }) as const,
    [isZh]
  );

  const initialMonth = getMonthRange();
  const [preset, setPreset] = useState<RangePreset>("month");
  const [fromInput, setFromInput] = useState(initialMonth.from);
  const [toInput, setToInput] = useState(initialMonth.to);

  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [dailyPoints, setDailyPoints] = useState<DailyPoint[]>([]);
  const [categoryPoints, setCategoryPoints] = useState<CategoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const formatCurrency = useCallback(
    (valueCents: number): string => {
      const value = valueCents / 100;
      const formatter = new Intl.NumberFormat(isZh ? "zh-CN" : "en-US", {
        style: "currency",
        currency: isZh ? "CNY" : "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return formatter.format(value);
    },
    [isZh]
  );

  const refreshStats = useCallback(
    async (showSuccessToast: boolean) => {
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

      const filters = { from: fromIso, to: toIso };
      setIsLoading(true);
      try {
        const [summaryData, dailyData, categoryData] = await Promise.all([
          tauriInvoke<StatsSummary>("stats_summary", { filters }),
          tauriInvoke<DailyPoint[]>("stats_daily", { filters }),
          tauriInvoke<CategoryPoint[]>("stats_by_category", {
            filters: { ...filters, type: "expense", top_n: 10 }
          })
        ]);

        setSummary(summaryData);
        setDailyPoints(dailyData);
        setCategoryPoints(categoryData);

        if (showSuccessToast) {
          pushToast({ title: text.statsRefreshed, variant: "success", durationMs: 1800 });
        }
      } catch (error) {
        pushToast({ title: text.statsLoadFailed, description: String(error), variant: "error" });
      } finally {
        setIsLoading(false);
      }
    },
    [
      fromInput,
      pushToast,
      text.invalidRange,
      text.invalidRangeOrder,
      text.statsLoadFailed,
      text.statsRefreshed,
      toInput
    ]
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
    void refreshStats(false);
  }, [refreshStats]);

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

  const incomeColor = "hsl(var(--chart-income))";
  const expenseColor = "hsl(var(--chart-expense))";
  const netColor = "hsl(var(--chart-net))";

  return (
    <PageShell>
      <PageHeader
        title={text.pageTitle}
        description={text.pageDesc}
        actions={
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-[120px_180px_180px_auto]">
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
              value={fromInput}
              onChange={(event) => {
                setPreset("custom");
                setFromInput(event.target.value);
              }}
            />
            <Input
              type="datetime-local"
              value={toInput}
              onChange={(event) => {
                setPreset("custom");
                setToInput(event.target.value);
              }}
            />
            <Button onClick={() => void refreshStats(true)} disabled={isLoading}>
              {isLoading ? text.loading : text.apply}
            </Button>
          </div>
        }
      />

      <StatCards summary={statSummary} formatAmount={formatCurrency} />

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
              ctaLabel={text.adjustRange}
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
                  <Bar dataKey="total" fill={expenseColor} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
