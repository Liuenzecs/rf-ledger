import { type FormEvent, useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatCards } from "@/components/stat-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  const isZh = language === "zh";

  const text = useMemo(
    () =>
      ({
        title: isZh ? "\u65b0\u589e" : "Add",
        description: isZh
          ? "\u5feb\u901f\u5f55\u5165\u4ea4\u6613\u8bb0\u5f55\uff0c\u9ed8\u8ba4\u4fdd\u6301\u6781\u7b80\u4f53\u9a8c\u3002"
          : "Capture transactions quickly with a focused form.",
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
        category: isZh ? "\u5206\u7c7b" : "Category",
        account: isZh ? "\u8d26\u6237" : "Account",
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
          ? "\u5206\u7c7b\u548c\u8d26\u6237\u4e0d\u80fd\u4e3a\u7a7a\u3002"
          : "Category and account are required.",
        addSuccess: isZh ? "\u63d2\u5165\u6210\u529f" : "Inserted",
        addSuccessDesc: (id: number) =>
          isZh
            ? `\u4ea4\u6613 #${id} \u5df2\u5199\u5165\u6570\u636e\u5e93\u3002`
            : `Transaction #${id} has been saved.`,
        addFail: isZh ? "\u63d2\u5165\u5931\u8d25" : "Insert failed",
        helperTitle: isZh ? "\u5feb\u6377\u5f55\u5165\u63d0\u793a" : "Quick Entry Tips",
        helperDescription: isZh
          ? "\u5f53\u524d\u63d0\u4ea4\u540e\u4f1a\u6e05\u7a7a\u91d1\u989d\u4e0e\u5907\u6ce8\uff0c\u5206\u7c7b\u4e0e\u8d26\u6237\u4f1a\u4fdd\u7559\u3002"
          : "After submit, amount and note are reset while category/account stay.",
        helperEmptyTitle: isZh ? "\u63d0\u793a\u5df2\u5c31\u7eea" : "Tips Ready",
        helperEmptyDesc: isZh
          ? "\u4f60\u53ef\u4ee5\u5148\u56fa\u5b9a\u5e38\u7528\u5206\u7c7b\u4e0e\u8d26\u6237\uff0c\u518d\u8fde\u7eed\u5f55\u5165\u591a\u6761\u4ea4\u6613\u3002"
          : "Keep category/account stable and enter records continuously.",
        helperCta: isZh ? "\u5df2\u4e86\u89e3" : "Understood"
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
                <Input
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{text.account}</p>
                <Input
                  value={form.account}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, account: event.target.value }))
                  }
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
          <CardTitle>{text.helperTitle}</CardTitle>
          <CardDescription>{text.helperDescription}</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <EmptyState
            title={text.helperEmptyTitle}
            description={text.helperEmptyDesc}
            ctaLabel={text.helperCta}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
