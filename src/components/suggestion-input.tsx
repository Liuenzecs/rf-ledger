import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import type { SuggestionOption } from "@/lib/ledger-types";

type SuggestionInputProps = InputHTMLAttributes<HTMLInputElement> & {
  suggestions?: SuggestionOption[];
};

export const SuggestionInput = forwardRef<HTMLInputElement, SuggestionInputProps>(
  ({ suggestions = [], ...props }, ref) => {
    const listId = useId();
    const hasSuggestions = suggestions.length > 0;

    return (
      <>
        <Input ref={ref} list={hasSuggestions ? listId : undefined} {...props} />
        {hasSuggestions ? (
          <datalist id={listId}>
            {suggestions.map((item) => (
              <option key={item.value} value={item.value} />
            ))}
          </datalist>
        ) : null}
      </>
    );
  }
);

SuggestionInput.displayName = "SuggestionInput";
