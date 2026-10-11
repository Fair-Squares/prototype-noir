import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true: disables the button, sets data-loading, shows a spinner. */
  loading?: boolean;
  /**
   * When set, renders a next/link with the identical .btn class contract —
   * the one code path for both button-CTAs and link-CTAs (UX overhaul §5.2).
   * Button-only props (loading/disabled/type/onClick) are ignored for links.
   */
  href?: string;
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
  href,
  children,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const classes = `btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className ?? ""}`;
  if (href !== undefined) {
    return (
      <Link href={href} className={classes} aria-label={props["aria-label"]}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={classes}
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
