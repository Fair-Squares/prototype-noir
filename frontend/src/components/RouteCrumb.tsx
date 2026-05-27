"use client";

import { usePathname } from "next/navigation";
import { findRoute } from "@/lib/nav";

export default function RouteCrumb() {
  const pathname = usePathname() ?? "/";
  const route = findRoute(pathname);
  const path = pathname === "/" ? "/" : pathname;
  return (
    <span className="text-tag text-text-3">
      <span className="text-fs-magenta">{route?.num ?? "—"}</span>
      <span className="mx-2 opacity-40">·</span>
      <span>{path}</span>
    </span>
  );
}
