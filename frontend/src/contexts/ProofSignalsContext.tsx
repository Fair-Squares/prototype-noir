"use client";

/**
 * ProofSignalsContext — fetches the trust-rail signals ONCE and shares the
 * resolved <ProofRail> props with every consumer (desktop right rail + mobile
 * collapsible strip), so the same network reads aren't issued twice.
 *
 * No data is invented: every chip maps to a concrete boolean returned by a
 * real fetch helper, and the "fresh as of" footer uses the on-chain block
 * number surfaced by the governance proposals endpoint (falling back to the
 * chain-params data-source descriptor when no proposal — and therefore no
 * block — is available yet).
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWallet } from "@/contexts/WalletContext";
import type { ProofRailItem, ProofState } from "@/components/ui";
import {
  fetchKYCProfile,
  fetchGovernanceEligibility,
  fetchProposals,
  fetchChainParams,
  type KYCProfile,
  type GovernanceEligibility,
} from "@/lib/contracts";

export interface ProofSignals {
  items: ProofRailItem[];
  freshAs: ReactNode;
}

const ProofSignalsContext = createContext<ProofSignals | null>(null);

type RawSignals = {
  kyc: KYCProfile | null;
  governance: GovernanceEligibility | null;
  /** On-chain block height when one is available, else null. */
  block: number | null;
  /** Human descriptor for the data source when no block height exists. */
  freshLabel: string | null;
  loading: boolean;
};

const EMPTY: RawSignals = {
  kyc: null,
  governance: null,
  block: null,
  freshLabel: null,
  loading: false,
};

/** ok when true; the supplied `falseState` (default "blocked") when false. */
function boolState(value: boolean | undefined, falseState: ProofState = "blocked"): ProofState {
  if (value === undefined) return "pending";
  return value ? "ok" : falseState;
}

export function ProofSignalsProvider({ children }: { children: ReactNode }) {
  const { activeAccount, isConnected } = useWallet();
  const address = activeAccount?.address ?? null;
  const accountIndex = activeAccount?.index ?? 0;
  const alias = activeAccount?.alias ?? null;

  const [raw, setRaw] = useState<RawSignals>(EMPTY);

  useEffect(() => {
    if (!address) {
      setRaw(EMPTY);
      return;
    }

    let cancelled = false;
    setRaw((s) => ({ ...s, loading: true }));

    // Each signal resolves independently. A failure on one (e.g. a governance
    // read) leaves its chip in the honest "pending"/"off" state rather than
    // masking the rest of the rail.
    const kycP = fetchKYCProfile(address).catch(() => null);
    const govP = fetchGovernanceEligibility(address, accountIndex).catch(() => null);
    const blockP = fetchProposals(address, accountIndex)
      .then((proposals) => proposals.find((p) => typeof p.currentBlock === "number")?.currentBlock ?? null)
      .catch(() => null);
    const paramsP = fetchChainParams().catch(() => null);

    Promise.all([kycP, govP, blockP, paramsP]).then(([kyc, governance, block, params]) => {
      if (cancelled) return;
      const freshLabel =
        block === null && params ? `Block production: ${params.timing.blockProductionMode}` : null;
      setRaw({ kyc, governance, block, freshLabel, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, [address, accountIndex]);

  const value = useMemo<ProofSignals>(() => {
    const { kyc, governance, block, freshLabel, loading } = raw;

    const items: ProofRailItem[] = [
      {
        label: "Wallet connected",
        state: isConnected ? "ok" : "off",
        hint: isConnected
          ? alias
            ? `Acting as ${alias}`
            : "Account selected"
          : "Select an account to begin",
      },
      {
        label: "zkPassport verified",
        state: !isConnected ? "off" : loading && !kyc ? "pending" : boolState(kyc?.verified),
        hint: !isConnected
          ? "Connect to check verification"
          : kyc?.verified
            ? "Identity credential present"
            : "Complete verification under Verification",
      },
      {
        label: "Investor role active",
        state: !isConnected ? "off" : loading && !kyc ? "pending" : boolState(kyc?.isInvestor),
        hint: !isConnected
          ? "Connect to check role"
          : kyc?.isInvestor
            ? "Eligible to deposit and trade"
            : "Granted after verification",
      },
      {
        label: "FSFT exposure",
        // Holding shares is optional, so "no exposure yet" is neutral (off), not blocked.
        state: !isConnected ? "off" : loading && !kyc ? "pending" : boolState(kyc?.hasFsftExposure, "off"),
        hint: !isConnected
          ? "Connect to check holdings"
          : kyc?.hasFsftExposure
            ? "You hold fund shares"
            : "No fund shares held yet",
      },
      {
        label: "Voting eligibility",
        state: !isConnected ? "off" : loading && !governance ? "pending" : boolState(governance?.canVote),
        hint: !isConnected
          ? "Connect to check eligibility"
          : (governance?.reason ?? "Eligibility depends on role and shares"),
      },
      {
        label: "Reward eligibility",
        state: !isConnected ? "off" : loading && !kyc ? "pending" : boolState(kyc?.rewardsEligible, "off"),
        hint: !isConnected
          ? "Connect to check rewards"
          : kyc?.rewardsEligible
            ? "Eligible for epoch rewards"
            : "Not yet eligible for rewards",
      },
    ];

    const freshAs =
      block !== null
        ? `Data fresh as of block ${block.toLocaleString()}`
        : freshLabel
          ? `Data source — ${freshLabel}`
          : isConnected
            ? "Resolving latest block…"
            : "Connect an account to refresh";

    return { items, freshAs };
  }, [raw, isConnected, alias]);

  return <ProofSignalsContext.Provider value={value}>{children}</ProofSignalsContext.Provider>;
}

export function useProofSignals(): ProofSignals {
  const ctx = useContext(ProofSignalsContext);
  if (!ctx) {
    throw new Error("useProofSignals must be used inside <ProofSignalsProvider>");
  }
  return ctx;
}
