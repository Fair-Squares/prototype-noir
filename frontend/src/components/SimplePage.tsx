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
    <section className="rounded-2xl border border-border bg-card p-5">
      {badge && (
        <div className="mb-3 opacity-80">
          <SimulationModeBadge />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1>{title}</h1>
          <p className="mt-2 text-text-2">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {rightContent}
          {ctaHref && ctaLabel && (
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center rounded-lg bg-fs-teal px-4 py-2 font-semibold text-white hover:bg-fs-teal-dark"
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
    <div
      className={`rounded-xl border p-4 ${accent ? "border-fs-teal/30 bg-fs-mint/40" : "border-border bg-card"}`}
    >
      <p className="text-meta mb-2">{title}</p>
      <p className={`text-display ${accent ? "text-fs-teal-dark" : "text-text-1"}`}>{value}</p>
      {hint && <p className="text-meta mt-2">{hint}</p>}
    </div>
  );
}

interface MetricRowItem {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}

interface MetricRowProps {
  items: MetricRowItem[];
}

export function MetricRow({ items }: MetricRowProps) {
  const colsClass =
    items.length >= 4
      ? "md:grid-cols-4"
      : items.length === 3
      ? "md:grid-cols-3"
      : items.length === 2
      ? "md:grid-cols-2"
      : "md:grid-cols-1";

  return (
    <section className={`grid grid-cols-1 gap-4 ${colsClass}`}>
      {items.map((item) => (
        <PrimaryCard
          key={item.label}
          title={item.label}
          value={item.value}
          hint={item.hint}
          accent={Boolean(item.accent)}
        />
      ))}
    </section>
  );
}

interface ActionPanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ActionPanel({ title, subtitle, children }: ActionPanelProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="text-meta mb-2">{title}</p>
      {subtitle && <h2 className="mb-3">{subtitle}</h2>}
      {children}
    </section>
  );
}

interface AdvancedDetailsProps {
  summary: string;
  children: ReactNode;
}

export function AdvancedDetails({ summary, children }: AdvancedDetailsProps) {
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-text-1">
        {summary}
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
