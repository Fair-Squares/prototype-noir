import Link from "next/link";

interface BrandProps {
  /** Show the one-line descriptor next to the name. Default false (compact bar). */
  withTagline?: boolean;
  className?: string;
}

/**
 * Fair Squares wordmark + badge, linking home. Replaces the sidebar brand block
 * and the old MobileBrand. Calm and product-like — no console meta.
 */
export default function Brand({ withTagline = false, className }: BrandProps) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${className ?? ""}`}
      style={{ touchAction: "manipulation" }}
    >
      <span className="grid h-8 w-8 place-items-center rounded-md bg-fs-anthracite text-sm font-semibold text-white">
        FS
      </span>
      <span className="leading-tight">
        <span className="block font-semibold text-text-1">Fair Squares</span>
        {withTagline ? (
          <span className="text-meta">Affordable-housing fund</span>
        ) : null}
      </span>
    </Link>
  );
}
