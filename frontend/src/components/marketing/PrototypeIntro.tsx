import Link from "next/link";

/** Show the target only when the fund has supplied its return parameter. */
export function PrototypeIntro({ rorPct }: { rorPct: number | null }) {
  return (
    <section className="max-w-2xl" aria-labelledby="prototype-intro-heading">
      <h1 id="prototype-intro-heading" className="text-display text-text-1">
        Affordable homes, funded together.
      </h1>
      <p className="text-body mt-3 text-text-2">
        Pool money to help buy affordable homes and share the rental income.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/demo" className="btn btn-primary">Take the 3-minute tour</Link>
        <Link href="/fund" className="btn btn-ghost">Browse homes</Link>
      </div>
      {rorPct != null ? (
        <p className="text-caption mt-4 text-text-3">
          Target rental return: {rorPct.toLocaleString("en", { maximumFractionDigits: 2 })}% per year.
          Returns aren&apos;t guaranteed.
        </p>
      ) : null}
    </section>
  );
}
