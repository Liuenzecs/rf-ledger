import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  copyText?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
  copyText?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastContextValue = {
  pushToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function toastTone(variant: ToastVariant): string {
  if (variant === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (variant === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const isZh = language === "zh";
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    ({
      title,
      description,
      variant = "info",
      durationMs = 3200,
      copyText,
      actionLabel,
      onAction
    }: ToastInput) => {
      const id = idRef.current;
      idRef.current += 1;

      setToasts((prev) => [
        ...prev,
        { id, title, description, variant, copyText, actionLabel, onAction }
      ]);
      window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);
    },
    [dismissToast]
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);
  const copyLabel = isZh ? "\u590d\u5236" : "Copy";
  const closeLabel = isZh ? "\u5173\u95ed" : "Close";

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-sm ${toastTone(toast.variant)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.description ? (
                  <p className="break-all text-xs text-current/90">{toast.description}</p>
                ) : null}
                {toast.copyText || (toast.actionLabel && toast.onAction) ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {toast.copyText ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          if (typeof navigator !== "undefined" && navigator.clipboard) {
                            void navigator.clipboard.writeText(toast.copyText ?? "");
                          }
                        }}
                      >
                        {copyLabel}
                      </Button>
                    ) : null}
                    {toast.actionLabel && toast.onAction ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => toast.onAction?.()}
                      >
                        {toast.actionLabel}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-base leading-none"
                aria-label={closeLabel}
                onClick={() => dismissToast(toast.id)}
              >
                ×
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return value;
}
