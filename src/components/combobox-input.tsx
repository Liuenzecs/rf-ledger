import {
  type KeyboardEvent,
  type ChangeEvent,
  type FocusEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import type { SuggestionOption } from "@/lib/ledger-types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ComboboxInputProps = {
  value: string;
  onChange: (value: string) => void;
  suggestions: SuggestionOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onClear?: () => void;
  noResultsText?: string;
  countSuffix?: string;
};

export function ComboboxInput({
  value,
  onChange,
  suggestions,
  placeholder,
  required,
  disabled,
  className,
  onClear,
  noResultsText = "No matches",
  countSuffix = ""
}: ComboboxInputProps) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<string | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredSuggestions = useMemo(() => {
    if (!filterText.trim()) return suggestions;
    const lower = filterText.toLowerCase();
    return suggestions.filter((s) => s.value.toLowerCase().includes(lower));
  }, [filterText, suggestions]);

  const openDropdown = useCallback(() => {
    setFilterText("");
    setIsOpen(true);
    setActiveIndex(0);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const selectSuggestion = useCallback(
    (suggestionValue: string) => {
      selectedRef.current = suggestionValue;
      onChange(suggestionValue);
      setFilterText("");
      closeDropdown();
    },
    [onChange, closeDropdown]
  );

  const scrollActiveIntoView = useCallback(() => {
    if (!listRef.current) return;
    const activeItem = listRef.current.children[activeIndex] as HTMLElement | undefined;
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleFocus = () => {
    if (disabled) return;
    openDropdown();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    onChange(next);
    setFilterText(next);
    setIsOpen(true);
    setActiveIndex(0);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    // Delay close to allow clicks on dropdown items
    blurTimeoutRef.current = setTimeout(() => {
      // Skip if the new focus target is inside our wrapper
      if (wrapperRef.current?.contains(document.activeElement)) return;
      // If a suggestion was just selected, don't revert
      closeDropdown();
    }, 150);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openDropdown();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((prev) => {
          const next = prev + 1;
          return next >= filteredSuggestions.length ? 0 : next;
        });
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? filteredSuggestions.length - 1 : next;
        });
        break;
      case "Enter":
        if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
          event.preventDefault();
          selectSuggestion(filteredSuggestions[activeIndex].value);
        }
        break;
      case "Escape":
        event.preventDefault();
        closeDropdown();
        break;
      case "Tab":
        closeDropdown();
        break;
    }
  };

  // Scroll active item into view when navigating
  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      scrollActiveIntoView();
    }
  }, [activeIndex, isOpen, scrollActiveIntoView]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  const showClear = !!onClear && value.length > 0 && !disabled;

  return (
    <div ref={wrapperRef} className={cn("relative", className)} onBlur={handleBlur}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          className={cn(showClear && "pr-8")}
        />
        {showClear && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClear?.();
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label="Clear"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-popover shadow-md"
        >
          {filteredSuggestions.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">{noResultsText}</li>
          ) : (
            filteredSuggestions.map((suggestion, index) => (
              <li
                key={suggestion.value}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(suggestion.value);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors",
                  index === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
              >
                <span className="truncate">{suggestion.value}</span>
                {suggestion.count > 0 && (
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {suggestion.count}
                    {countSuffix}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
