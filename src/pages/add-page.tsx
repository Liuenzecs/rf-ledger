import { type FormEvent, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatCards } from "@/components/stat-cards";
import { SuggestionInput } from "@/components/suggestion-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useFormSuggestions } from "@/lib/form-suggestions";
import { type Transaction, type TransactionType } from "@/lib/ledger-types";
import { useLanguage } from "@/lib/language";
import { tauriInvoke } from "@/lib/tauri";
import { useToast } from "@/lib/toast";

type FormState = {
  occurredOnDate: string;
  hasSpecificTime: boolean;
  occurredAtTime: string;
  type: TransactionType;
  amountYuan: string;
  category: string;
  account: string;
  note: string;
};

function todayDateLocal(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function nowTimeLocal(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function dateAndTimeToIso(dateValue: string, timeValue?: string): string | null {
  if (!dateValue) {
    return null;
  }

  const dateTime = timeValue ? `${dateValue}T${timeValue}` : `${dateValue}T00:00`;
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function AddPage() {
  const { language } = useLanguage();
  const { pushToast } = useToast();
  const { suggestions, refreshSuggestions } = useFormSuggestions();
  const isZh = language === "zh";
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const text = useMemo(
    () =>
      ({
        title: isZh ? "\u65b0\u589e" : "Add",
        description: isZh
          ? "\u5feb\u901f\u5f55\u5165\u4ea4\u6613\u8bb0\u5f55\uff0c\u7c7b\u522b\u4e0e\u652f\u4ed8\u65b9\u5f0f\u4f1a\u4f18\u5148\u7ed9\u51fa\u5386\u53f2\u5efa\u8bae\u3002"
          : "Capture transactions quickly with history suggestions for category and payment method.",
        formTitle: isZh ? "\u4ea4\u6613\u5f55\u5165" : "Transaction Form",
        formDescription: isZh
          ? "\u6309 Enter \u6216\u70b9\u51fb\u63d0\u4ea4\u5373\u53ef\u5199\u5165\u672c\u5730 SQLite\u3002"
          : "Press Enter or submit to insert into local SQLite.",
        occurredDate: isZh ? "\u4ea4\u6613\u65e5\u671f" : "Date",
        useSpecificTime: isZh ? "\u65f6\u95f4\u7cbe\u5ea6" : "Time Precision",
        dateOnly: isZh ? "\u4ec5\u65e5\u671f\uff08\u9ed8\u8ba4\uff09" : "Date only (Default)",
        dateWithTime: isZh
          ? "\u65e5\u671f + \u65f6\u95f4\uff08\u53ef\u9009\uff09"
          : "Date + time (Optional)",
        optionalTime: isZh ? "\u53ef\u9009\u65f6\u95f4" : "Optional Time",
        type: isZh ? "\u7c7b\u578b" : "Type",
        income: isZh ? "\u6536\u5165" : "Income",
        expense: isZh ? "\u652f\u51fa" : "Expense",
        amountYuan: isZh ? "\u91d1\u989d\uff08\u5143\uff09" : "Amount",
        category: isZh ? "\u7c7b\u522b" : "Category",
        categoryPlaceholder: isZh
          ? "\u8f93\u5165\u6216\u9009\u62e9\u5df2\u7528\u7c7b\u522b"
          : "Type or choose a previous category",
        account: isZh ? "\u652f\u4ed8\u65b9\u5f0f" : "Payment Method",
        accountPlaceholder: isZh
          ? "\u8f93\u5165\u6216\u9009\u62e9\u5df2\u7528\u652f\u4ed8\u65b9\u5f0f"
          : "Type or choose a previous payment method",
        note: isZh ? "\u5907\u6ce8" : "Note",
        submit: isZh ? "\u63d0\u4ea4" : "Submit",
        submitting: isZh ? "\u63d0\u4ea4\u4e2d..." : "Submitting...",
        invalidDate: isZh
          ? "\u53d1\u751f\u65f6\u95f4\u683c\u5f0f\u65e0\u6548\u3002"
          : "Invalid occurred_at datetime.",
        invalidAmount: isZh
          ? "\u8bf7\u8f93\u5165\u975e 0 \u7684\u91d1\u989d\u3002"
          : "Amount must be non-zero.",
        requiredFields: isZh
          ? "\u7c7b\u522b\u548c\u652f\u4ed8\u65b9\u5f0f\u4e0d\u80fd\u4e3a\u7a7a\u3002"
          : "Category and payment method are required.",
        addSuccess: isZh ? "\u63d2\u5165\u6210\u529f" : "Inserted",
        addSuccessDesc: (id: number) =>
          isZh
            ? `\u4ea4\u6613 #${id} \u5df2\u5199\u5165\u6570\u636e\u5e93\u3002`
            : `Transaction #${id} has been saved.`,
        addFail: isZh ? "\u63d2\u5165\u5931\u8d25" : "Insert failed",
        combosTitle: isZh ? "\u6700\u8fd1\u5e38\u7528\u7ec4\u5408" : "Recent Quick Combos",
        combosDescription: isZh
          ? "\u70b9\u51fb\u5373\u53ef\u56de\u586b\u7c7b\u578b\u3001\u7c7b\u522b\u4e0e\u652f\u4ed8\u65b9\u5f0f\uff0c\u91d1\u989d\u4e0e\u5907\u6ce8\u4f1a\u4fdd\u6301\u4e0d\u53d8\u3002"
          : "Tap to refill type, category and payment method while keeping amount and note unchanged.",
        combosEmptyTitle: isZh ? "\u6682\u65e0\u5feb\u6377\u7ec4\u5408" : "No quick combos yet",
        combosEmptyDesc: isZh
          ? "\u8fde\u7eed\u8bb0\u5f55\u51e0\u7b14\u4ea4\u6613\u540e\uff0c\u8fd9\u91cc\u4f1a\u81ea\u52a8\u51fa\u73b0\u5e38\u7528\u7ec4\u5408\u3002"
          : "After a few transactions, your most recent combinations will show up here.",
        comboUse: isZh ? "\u4f7f\u7528\u6b21\u6570" : "Used",
        comboApply: isZh ? "\u4e00\u952e\u56de\u586b" : "Apply Combo"
      }) as const,
    [isZh]
  );

  const [form, setForm] = useState<FormState>({
    occurredOnDate: todayDateLocal(),
    hasSpecificTime: false,
    occurredAtTime: nowTimeLocal(),
    type: "expense",
    amountYuan: "",
    category: isZh ? "\u9910\u996e" : "Food",
    account: isZh ? "\u73b0\u91d1" : "Cash",
    note: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyQuickCombination = (combo: {
    type: TransactionType;
    category: string;
    account: string;
  }) => {
    setForm((prev) => ({
      ...prev,
      type: combo.type,
      category: combo.category,
      account: combo.account
    }));
    window.requestAnimationFrame(() => amountInputRef.current?.focus());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const occurredAtIso = dateAndTimeToIso(
      form.occurredOnDate,
      form.hasSpecificTime ? form.occurredAtTime : undefined
    );
    if (!occurredAtIso) {
      pushToast({ title: text.addFail, description: text.invalidDate, variant: "error" });
      return;
    }

    const amountNumber = Number.parseFloat(form.amountYuan);
    if (!Number.isFinite(amountNumber) || amountNumber === 0) {
      pushToast({ title: text.addFail, description: text.invalidAmount, variant: "error" });
      return;
    }

    const amountCents = Math.round(amountNumber * 100);
    if (amountCents === 0) {
      pushToast({ title: text.addFail, description: text.invalidAmount, variant: "error" });
      return;
    }

    const category = form.category.trim();
    const account = form.account.trim();
    if (!category || !account) {
      pushToast({ title: text.addFail, description: text.requiredFields, variant: "error" });
      return;
    }

    setIsSubmitting(true);
    try {
      const inserted = await tauriInvoke<Transaction>("add_transaction", {
        payload: {
          occurred_at: occurredAtIso,
          amount_cents: amountCents,
          type: form.type,
          category,
          account,
          note: form.note.trim()
        }
      });

      await refreshSuggestions();
      pushToast({
        title: text.addSuccess,
        description: text.addSuccessDesc(inserted.id),
        variant: "success"
      });
      window.dispatchEvent(new Event("rf-ledger:transactions-changed"));

      setForm((prev) => ({
        ...prev,
        occurredOnDate: todayDateLocal(),
        occurredAtTime: nowTimeLocal(),
        amountYuan: "",
        note: ""
      }));
    } catch (error) {
      pushToast({
        title: text.addFail,
        description: String(error),
        variant: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell>
      <PageHeader title={text.title} description={text.description} />

      <StatCards />

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.formTitle}</CardTitle>
          <CardDescription>{text.formDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.occurredDate}</p>
                <Input
                  type="date"
                  value={form.occurredOnDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, occurredOnDate: event.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.useSpecificTime}</p>
                <Select
                  value={form.hasSpecificTime ? "date_time" : "date_only"}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      hasSpecificTime: event.target.value === "date_time"
                    }))
                  }
                >
                  <option value="date_only">{text.dateOnly}</option>
                  <option value="date_time">{text.dateWithTime}</option>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.optionalTime}</p>
                <Input
                  type="time"
                  value={form.occurredAtTime}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, occurredAtTime: event.target.value }))
                  }
                  disabled={!form.hasSpecificTime}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.type}</p>
                <Select
                  value={form.type}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, type: event.target.value as TransactionType }))
                  }
                >
                  <option value="income">{text.income}</option>
                  <option value="expense">{text.expense}</option>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.amountYuan}</p>
                <Input
                  type="number"
                  step="0.01"
                  ref={amountInputRef}
                  value={form.amountYuan}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, amountYuan: event.target.value }))
                  }
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.category}</p>
                <SuggestionInput
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                  placeholder={text.categoryPlaceholder}
                  suggestions={suggestions.categories}
                  required
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.account}</p>
                <SuggestionInput
                  value={form.account}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, account: event.target.value }))
                  }
                  placeholder={text.accountPlaceholder}
                  suggestions={suggestions.accounts}
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2 lg:col-span-1">
                <p className="text-sm text-muted-foreground">{text.note}</p>
                <Input
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                />
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? text.submitting : text.submit}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-6">
          <CardTitle>{text.combosTitle}</CardTitle>
          <CardDescription>{text.combosDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {suggestions.combinations.length === 0 ? (
            <EmptyState title={text.combosEmptyTitle} description={text.combosEmptyDesc} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {suggestions.combinations.map((combo) => (
                <button
                  key={`${combo.type}-${combo.category}-${combo.account}`}
                  type="button"
                  className="flex flex-col items-start gap-3 rounded-xl border bg-muted/20 p-4 text-left shadow-sm transition-colors hover:bg-muted/35"
                  onClick={() => applyQuickCombination(combo)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                        combo.type === "income"
                          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                          : "border-rose-100 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {combo.type === "income" ? text.income : text.expense}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {text.comboUse} {combo.count}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-base font-medium">{combo.category}</p>
                    <p className="text-sm text-muted-foreground">{combo.account}</p>
                  </div>

                  <span className="text-xs text-muted-foreground">{text.comboApply}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
