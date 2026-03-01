import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const location = useLocation();
  const { language } = useLanguage();
  const isZh = language === "zh";

  const navItems = [
    { path: "/add", label: isZh ? "\u65b0\u589e" : "Add" },
    { path: "/list", label: isZh ? "\u5217\u8868" : "List" },
    { path: "/dashboard", label: isZh ? "\u770b\u677f" : "Dashboard" },
    { path: "/settings", label: isZh ? "\u8bbe\u7f6e" : "Settings" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-4">
          <div className="space-y-1">
            <p className="text-2xl font-semibold">RF Ledger</p>
            <p className="text-sm text-muted-foreground">
              {isZh
                ? "\u672c\u5730\u79bb\u7ebf\u8bb0\u8d26\u684c\u9762\u5e94\u7528"
                : "Local desktop bookkeeping"}
            </p>
          </div>
          <nav className="flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Button
                  key={item.path}
                  asChild
                  size="sm"
                  variant={isActive ? "default" : "ghost"}
                  className={cn("px-4")}
                >
                  <NavLink to={item.path}>{item.label}</NavLink>
                </Button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="w-full px-4 py-8 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
