import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/language";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
};

function DefaultActions() {
  const { language } = useLanguage();
  const isZh = language === "zh";

  return (
    <div className="flex items-center gap-2">
      <Input
        disabled
        placeholder={isZh ? "\u7b5b\u9009\u5360\u4f4d" : "Placeholder filter"}
        className="w-48"
      />
      <Button disabled variant="outline">
        {isZh ? "\u64cd\u4f5c" : "Action"}
      </Button>
    </div>
  );
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center">{actions ?? <DefaultActions />}</div>
    </div>
  );
}
