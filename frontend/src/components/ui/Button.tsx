import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true: disables the button, sets data-loading, shows a spinner. */
  loading?: boolean;
  children: ReactNode;
}

/**
 * Spinner sized to the button text — pure CSS via Tailwind's animate-spin, no
 * external library. The ring is currentColor so it inherits the button's text
 * color across all variants.
 */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]"
    />
  );
}

/**
 * Button wrapping the .btn / .btn-{variant} / .btn-sm class contract from
 * globals.css. `loading` disables interaction, sets data-loading="true" (which
 * globals.css styles), and swaps in a spinner before the label.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type,
  children,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type ?? "button"}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className ?? ""}`}
      data-loading={loading ? "true" : undefined}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
