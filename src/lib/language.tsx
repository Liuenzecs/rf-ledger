import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { FormDefaults, TransactionType } from "@/lib/ledger-types";

export type AppLanguage = "zh" | "en";
export type DisplayCurrency = "CNY" | "USD";

const LANGUAGE_STORAGE_KEY = "rf-ledger-language";
const CURRENCY_STORAGE_KEY = "rf-ledger-display-currency";
const DEFAULT_TYPE_KEY = "rf-ledger-default-type";
const DEFAULT_CATEGORY_KEY = "rf-ledger-default-category";
const DEFAULT_ACCOUNT_KEY = "rf-ledger-default-account";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  locale: string;
  formDefaults: FormDefaults;
  setFormDefaults: (defaults: FormDefaults) => void;
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

function getInitialFormDefaults(): FormDefaults {
  if (typeof window === "undefined") {
    return { defaultType: "", defaultCategory: "", defaultAccount: "" };
  }
  const defaultType = (window.localStorage.getItem(DEFAULT_TYPE_KEY) as TransactionType | "") || "";
  const defaultCategory = window.localStorage.getItem(DEFAULT_CATEGORY_KEY) || "";
  const defaultAccount = window.localStorage.getItem(DEFAULT_ACCOUNT_KEY) || "";
  return { defaultType, defaultCategory, defaultAccount };
}

function localeForLanguage(language: AppLanguage): string {
  return language === "zh" ? "zh-CN" : "en-US";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => getInitialLanguage());
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(() =>
    getInitialCurrency()
  );
  const [formDefaults, setFormDefaultsState] = useState<FormDefaults>(() =>
    getInitialFormDefaults()
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

  const setFormDefaults = (next: FormDefaults) => {
    setFormDefaultsState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEFAULT_TYPE_KEY, next.defaultType);
      window.localStorage.setItem(DEFAULT_CATEGORY_KEY, next.defaultCategory);
      window.localStorage.setItem(DEFAULT_ACCOUNT_KEY, next.defaultAccount);
    }
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      displayCurrency,
      setDisplayCurrency,
      locale: localeForLanguage(language),
      formDefaults,
      setFormDefaults
    }),
    [displayCurrency, language, formDefaults]
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
