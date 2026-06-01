import type { ReactNode } from "react";

export interface Step {
  label: string;
  description?: ReactNode;
}

export interface StepperProps {
  steps: Step[];
  /** Zero-based index of the active step. Steps before it are 'done'. */
  current: number;
  className?: string;
}

type StepState = "done" | "active" | "upcoming";

function stateFor(index: number, current: number): StepState {
  if (index < current) return "done";
  if (index === current) return "active";
  return "upcoming";
}

const MARKER: Record<StepState, string> = {
  done: "border-[var(--color-success)] bg-[var(--color-success)] text-white",
  active: "border-fs-magenta bg-fs-magenta text-white",
  upcoming: "border-border-strong bg-card text-text-3",
};

const LABEL: Record<StepState, string> = {
  done: "text-text-1",
  active: "text-text-1",
  upcoming: "text-text-3",
};

/**
 * Horizontal numbered steps (vertical on mobile) with done / active / upcoming
 * states. Done steps render a check; active and upcoming render the step number.
 * Presentational only — the parent owns `current`.
 */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol
      className={`flex flex-col gap-0 sm:flex-row sm:items-start sm:gap-0 ${className ?? ""}`}
      aria-label="Progress"
    >
      {steps.map((step, i) => {
        const state = stateFor(i, current);
        const isLast = i === steps.length - 1;
        return (
          <li
            key={step.label}
            className="flex flex-1 gap-3 sm:flex-col sm:gap-2"
            aria-current={state === "active" ? "step" : undefined}
          >
            {/* Marker + connector row (horizontal on desktop) */}
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-num ${MARKER[state]}`}
                aria-hidden="true"
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              {!isLast ? (
                <span
                  aria-hidden="true"
                  className={`my-1 w-px flex-1 sm:my-0 sm:mx-2 sm:h-px sm:w-auto sm:flex-1 ${
                    state === "done" ? "bg-[var(--color-success)]" : "bg-border"
                  }`}
                />
              ) : null}
            </div>
            {/* Label */}
            <div className="pb-4 sm:pb-0">
              <p className={`text-caption font-semibold ${LABEL[state]}`}>
                {step.label}
                <span className="sr-only">
                  {state === "done"
                    ? " Completed"
                    : state === "active"
                      ? " Current step"
                      : " Upcoming"}
                </span>
              </p>
              {step.description ? (
                <p className="text-caption mt-0.5 text-text-3">
                  {step.description}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
