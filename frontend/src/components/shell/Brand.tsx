import Link from "next/link";

interface BrandProps {
  /** Show the one-line descriptor next to the name. Default false (compact bar). */
  withTagline?: boolean;
  className?: string;
}

/**
 * Fair Squares brand lockup, linking home: the official hexagon mark + the
 * wordmark set in Nexa (the brand display face). Calm and product-like.
 */
export default function Brand({ withTagline = false, className }: BrandProps) {
  return (
    <Link
      href="/"
      aria-label="Fair Squares — home"
      className={`flex min-h-11 items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${className ?? ""}`}
      style={{ touchAction: "manipulation" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/mark-teal.png"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className="h-8 w-8 object-contain"
      />
      <span className="leading-tight">
        <span
          className="hidden text-[1.05rem] font-extrabold tracking-tight text-text-1 sm:block"
          style={{ fontFamily: "var(--font-nexa), Nexa, sans-serif" }}
        >
          Fair Squares
        </span>
        {withTagline ? (
          <span className="text-meta">Affordable-housing fund</span>
        ) : null}
      </span>
    </Link>
  );
}
