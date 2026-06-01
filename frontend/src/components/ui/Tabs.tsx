"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Currently selected tab value (controlled). */
  value: string;
  onValueChange: (value: string) => void;
  /** Tabpanel content for the active tab. */
  children?: ReactNode;
  /** Accessible name for the tablist. */
  "aria-label"?: string;
  className?: string;
}

/**
 * Accessible, controlled tablist with an underline active state. Implements the
 * WAI-ARIA tabs pattern: role=tablist/tab/tabpanel, roving focus, and
 * ArrowLeft/ArrowRight + Home/End keyboard navigation (skipping disabled tabs).
 * The parent owns `value`; `children` is the active tab's panel.
 */
export function Tabs({
  tabs,
  value,
  onValueChange,
  children,
  className,
  ...rest
}: TabsProps) {
  const ariaLabel = rest["aria-label"];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const enabledIndexes = tabs
    .map((t, i) => (t.disabled ? -1 : i))
    .filter((i) => i !== -1);

  function focusTab(index: number) {
    const el = tabRefs.current[index];
    if (el) {
      el.focus();
      onValueChange(tabs[index].value);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const pos = enabledIndexes.indexOf(currentIndex);
    if (pos === -1) return;

    let nextPos: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextPos = (pos + 1) % enabledIndexes.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextPos = (pos - 1 + enabledIndexes.length) % enabledIndexes.length;
        break;
      case "Home":
        nextPos = 0;
        break;
      case "End":
        nextPos = enabledIndexes.length - 1;
        break;
      default:
        return;
    }
    if (nextPos !== null) {
      e.preventDefault();
      focusTab(enabledIndexes[nextPos]);
    }
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto border-b border-border no-scrollbar"
      >
        {tabs.map((tab, i) => {
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onValueChange(tab.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 min-h-[44px] text-body font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-fs-magenta text-text-1"
                  : "border-transparent text-text-3 hover:text-text-1"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {children != null ? (
        <div
          role="tabpanel"
          id={`tabpanel-${value}`}
          aria-labelledby={`tab-${value}`}
          className="pt-4 focus-visible:outline-none"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
