"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import SimulationModeBadge from "@/components/SimulationModeBadge";

interface PageHeroProps {
  title: string;
  subtitle: string;
  ctaHref?: string;
  ctaLabel?: string;
  badge?: boolean;
  rightContent?: ReactNode;
}

export function PageHero({
  title,
  subtitle,
  ctaHref,
  ctaLabel,
  badge = true,
  rightContent,
}: PageHeroProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      {badge && <div className="mb-2"><SimulationModeBadge /></div>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl mb-1">{title}</h1>
          <p className="text-sm text-text-2">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {rightContent}
          {ctaHref && ctaLabel && (
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center rounded-lg bg-fs-teal px-4 py-2 text-sm font-semibold text-white hover:bg-fs-teal-dark"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

interface PrimaryCardProps {
  title: string;
  value: string;
  hint?: string;
  accent?: boolean;
}

export function PrimaryCard({ title, value, hint, accent = false }: PrimaryCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-fs-teal/30 bg-fs-mint/40" : "border-border bg-card"}`}>
      <p className="text-xs uppercase tracking-wide text-text-3 mb-1">{title}</p>
      <p className={`text-2xl font-semibold ${accent ? "text-fs-teal-dark" : "text-text-1"}`}>{value}</p>
      {hint && <p className="text-xs text-text-3 mt-2">{hint}</p>}
    </div>
  );
}

interface AdvancedDetailsProps {
  summary: string;
  children: ReactNode;
}

export function AdvancedDetails({ summary, children }: AdvancedDetailsProps) {
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-text-1">
        {summary}
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
