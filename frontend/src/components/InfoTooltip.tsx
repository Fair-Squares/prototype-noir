"use client";

interface InfoTooltipProps {
  text: string;
  align?: "left" | "right";
}

export default function InfoTooltip({ text, align = "left" }: InfoTooltipProps) {
  const alignClass =
    align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left";

  return (
    <span className="relative inline-flex items-center group">
      <button
        type="button"
        aria-label="More info"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-bg text-[10px] font-bold text-text-3 transition-colors hover:text-text-1"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-30 mt-2 w-56 rounded-lg border border-border bg-white px-2.5 py-2 text-[11px] leading-relaxed text-text-2 shadow-sm opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 ${alignClass} top-full translate-y-1`}
      >
        {text}
      </span>
    </span>
  );
}
