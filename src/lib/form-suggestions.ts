import { useCallback, useEffect, useState } from "react";
import type { FormSuggestions } from "@/lib/ledger-types";
import { tauriInvoke } from "@/lib/tauri";

const EMPTY_SUGGESTIONS: FormSuggestions = {
  categories: [],
  accounts: [],
  combinations: []
};

export function useFormSuggestions() {
  const [suggestions, setSuggestions] = useState<FormSuggestions>(EMPTY_SUGGESTIONS);

  const refreshSuggestions = useCallback(async () => {
    try {
      const result = await tauriInvoke<FormSuggestions>("get_form_suggestions");
      setSuggestions(result);
    } catch {
      setSuggestions(EMPTY_SUGGESTIONS);
    }
  }, []);

  useEffect(() => {
    void refreshSuggestions();
  }, [refreshSuggestions]);

  return {
    suggestions,
    refreshSuggestions
  };
}
