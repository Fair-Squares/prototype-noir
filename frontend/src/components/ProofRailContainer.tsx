"use client";

/**
 * ProofRailContainer — thin consumer that renders the presentational
 * <ProofRail> from the shared trust-rail signals. The actual fetching happens
 * once in <ProofSignalsProvider>, so the desktop right rail and the mobile
 * collapsible strip both read the same resolved data without issuing the
 * network reads twice.
 */

import { ProofRail } from "@/components/ui";
import { useProofSignals } from "@/contexts/ProofSignalsContext";

interface ProofRailContainerProps {
  className?: string;
}

export default function ProofRailContainer({ className }: ProofRailContainerProps) {
  const { items, freshAs } = useProofSignals();
  return <ProofRail items={items} freshAs={freshAs} className={className} />;
}
