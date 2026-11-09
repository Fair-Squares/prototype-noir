import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

export interface FormFieldProps {
  label: ReactNode;
  /** Helper text shown under the control when there is no error. */
  hint?: ReactNode;
  /** Error text; when present it replaces the hint and tints the label. */
  error?: ReactNode;
  /** The control(s). Wire its id to `htmlFor` for label association. */
  children: ReactNode;
  /** id of the control the label points at. */
  htmlFor?: string;
  /** Marks the field visually + for screen readers as required. */
  required?: boolean;
  className?: string;
}

/**
 * Label + control + hint/error wrapper. The label uses .text-label; hint is
 * muted; error swaps in danger color and is given role=alert so it announces.
 * Pass the control's id via `htmlFor` so the label associates correctly.
 */
export function FormField({
  label,
  hint,
  error,
  children,
  htmlFor,
  required = false,
  className,
}: FormFieldProps) {
  const describedById = htmlFor
    ? error
      ? `${htmlFor}-error`
      : hint
        ? `${htmlFor}-hint`
        : undefined
    : undefined;

  // Inject aria-describedby onto the control so the hint/error announces,
  // unless the child already sets its own.
  const field =
    describedById && isValidElement(children) &&
    (children.props as { "aria-describedby"?: string })["aria-describedby"] ==
      null
      ? cloneElement(
          children as ReactElement<{ "aria-describedby"?: string }>,
          { "aria-describedby": describedById },
        )
      : children;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="text-label flex items-center gap-1">
        <span>{label}</span>
        {required ? (
          <>
            <span className="text-danger" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        ) : null}
      </label>
      {field}
      {error ? (
        <p
          id={describedById}
          role="alert"
          className="text-caption text-danger"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={describedById} className="text-caption text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
