import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

export type AppLanguage = "zh" | "en";
export type DisplayCurrency = "CNY" | "USD";

const LANGUAGE_STORAGE_KEY = "rf-ledger-language";
const CURRENCY_STORAGE_KEY = "rf-ledger-display-currency";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  locale: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "zh";
  }
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === "zh" || saved === "en") {
    return saved;
  }
  return "zh";
}

function getInitialCurrency(): DisplayCurrency {
  if (typeof window === "undefined") {
    return "CNY";
  }
  const saved = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  if (saved === "CNY" || saved === "USD") {
    return saved;
  }
  return "CNY";
}

function localeForLanguage(language: AppLanguage): string {
  return language === "zh" ? "zh-CN" : "en-US";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => getInitialLanguage());
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(() =>
    getInitialCurrency()
  );

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    }
  };

  const setDisplayCurrency = (next: DisplayCurrency) => {
    setDisplayCurrencyState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
    }
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      displayCurrency,
      setDisplayCurrency,
      locale: localeForLanguage(language)
    }),
    [displayCurrency, language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error("useLanguage must be used within LanguageProvider.");
  }
  return value;
}

export const PreferencesProvider = LanguageProvider;

export function usePreferences() {
  return useLanguage();
}
