import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CollapsibleSectionProps = {
  open: boolean;
  onToggle: () => void;
  trigger: string;
  children: ReactNode;
};

export function CollapsibleSection({ open, onToggle, trigger, children }: CollapsibleSectionProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <span
          className={cn(
            "inline-block transition-transform duration-200 text-xs",
            open && "rotate-90"
          )}
        >
          &#9654;
        </span>
        {trigger}
      </button>
      {open && <div className="pt-3">{children}</div>}
    </div>
  );
}
