import { Button, type ButtonProps } from "@/components/ui/button";

type EmptyStateProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaVariant?: ButtonProps["variant"];
};

export function EmptyState({
  title,
  description,
  ctaLabel,
  onCtaClick,
  ctaDisabled,
  ctaVariant = "secondary"
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-muted/30 p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-background shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-muted-foreground" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-5-5H5Zm10 1.5L19.5 10H15V5.5ZM7 12h10v1.5H7V12Zm0 3h7v1.5H7V15Z"
          />
        </svg>
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {ctaLabel ? (
        <Button disabled={ctaDisabled ?? !onCtaClick} onClick={onCtaClick} variant={ctaVariant}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
