import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

export function PageShell({ children, className }: PageShellProps) {
  return (
    <section className={cn("mx-auto w-full max-w-[1200px] space-y-6 px-0", className)}>
      {children}
    </section>
  );
}
