import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/lib/language";
import { tauriInvoke } from "@/lib/tauri";

type StatCardsSummary = {
  totalIncomeCents: number;
  totalExpenseCents: number;
  netCents: number;
  txCount: number;
};

type StatCardsProps = {
  summary?: StatCardsSummary;
  formatAmount?: (valueCents: number) => string;
};

export function StatCards({ summary, formatAmount }: StatCardsProps) {
  const { language } = useLanguage();
  const isZh = language === "zh";
  const [fallbackSummary, setFallbackSummary] = useState<StatCardsSummary | undefined>(undefined);

  const loadFallbackSummary = useCallback(async () => {
    const result = await tauriInvoke<{
      total_income_cents: number;
      total_expense_cents: number;
      net_cents: number;
      tx_count: number;
    }>("stats_summary");

    setFallbackSummary({
      totalIncomeCents: result.total_income_cents,
      totalExpenseCents: result.total_expense_cents,
      netCents: result.net_cents,
      txCount: result.tx_count
    });
  }, []);

  useEffect(() => {
    if (summary || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    void loadFallbackSummary()
      .then(() => {
        if (cancelled) {
          return;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackSummary(undefined);
        }
      });

    const handleTransactionsChanged = () => {
      void loadFallbackSummary().catch(() => {
        if (!cancelled) {
          setFallbackSummary(undefined);
        }
      });
    };
    window.addEventListener("rf-ledger:transactions-changed", handleTransactionsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("rf-ledger:transactions-changed", handleTransactionsChanged);
    };
  }, [loadFallbackSummary, summary]);

  const effectiveSummary = useMemo(() => summary ?? fallbackSummary, [summary, fallbackSummary]);

  const text = {
    income: isZh ? "\u6536\u5165" : "Income",
    expense: isZh ? "\u652f\u51fa" : "Expense",
    net: isZh ? "\u51c0\u989d" : "Net",
    noData: isZh ? "\u6682\u65e0\u6570\u636e" : "No data yet",
    txCount: isZh ? "\u4ea4\u6613\u6570" : "Transactions"
  };

  const format = (valueCents: number): string => {
    if (formatAmount) {
      return formatAmount(valueCents);
    }
    if (!effectiveSummary) {
      return "--";
    }
    const symbol = isZh ? "\u00A5" : "$";
    return `${symbol}${(valueCents / 100).toFixed(2)}`;
  };

  const items = [
    {
      label: text.income,
      value: effectiveSummary ? format(effectiveSummary.totalIncomeCents) : "--",
      tone: "text-emerald-600",
      chip: "bg-emerald-50 text-emerald-600 border-emerald-100"
    },
    {
      label: text.expense,
      value: effectiveSummary ? format(effectiveSummary.totalExpenseCents) : "--",
      tone: "text-rose-600",
      chip: "bg-rose-50 text-rose-600 border-rose-100"
    },
    {
      label: text.net,
      value: effectiveSummary ? format(effectiveSummary.netCents) : "--",
      tone: "text-slate-600",
      chip: "bg-slate-100 text-slate-600 border-slate-200"
    }
  ] as const;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="p-6 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-6 pt-0">
            <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
            <span className={`inline-flex rounded-xl border px-3 py-1 text-sm ${item.chip}`}>
              {effectiveSummary ? `${text.txCount} ${effectiveSummary.txCount}` : text.noData}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
