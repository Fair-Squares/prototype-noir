import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import {
  simGetProposals,
  simCreateProposal,
  simFinalizeProposal,
  simExecuteProposal,
} from "@/lib/simulationStore";

// ── GET — list proposals ──────────────────────────────────────────────────────

export async function GET() {
  // ── Simulation mode ────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json({ proposals: simGetProposals(), source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const admin = await getTestAccount(0);
    const wallet = admin.wallet;
    const adminAddr = AztecAddress.fromString(admin.address);

    const GovArtifactJson = (await import("@/artifacts/governance-Governance.json")).default;
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    const toBigInt = (value: unknown): bigint => {
      if (typeof value === "bigint") return value;
      if (typeof value === "number") return BigInt(value);
      if (typeof value === "string") return value.startsWith("0x") ? BigInt(value) : BigInt(Number(value));
      if (value && typeof value === "object" && "toBigInt" in value) {
        try { return (value as { toBigInt: () => bigint }).toBigInt(); } catch { return BigInt(0); }
      }
      if (value && typeof value === "object" && "toString" in value) {
        const s = (value as { toString: () => string }).toString();
        if (s) {
          try { return s.startsWith("0x") ? BigInt(s) : BigInt(Number(s)); } catch { return BigInt(0); }
        }
      }
      return BigInt(0);
    };

    const count = Number(await govContract.methods.get_proposal_count().simulate({ from: adminAddr }));
    const proposals = await Promise.all(
      Array.from({ length: count }, async (_, id) => {
        const raw = await govContract.methods.get_proposal(id).simulate({ from: adminAddr });
        const tuple = Array.isArray(raw)
          ? raw
          : [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
        const descHash = toBigInt(tuple[0]);
        const amount = Number(toBigInt(tuple[1]));
        const yesVotes = Number(toBigInt(tuple[2]));
        const noVotes = Number(toBigInt(tuple[3]));
        const status = Number(toBigInt(tuple[4]));

        return {
          id,
          descHash: "0x" + descHash.toString(16).padStart(64, "0"),
          amount,
          yesVotes,
          noVotes,
          status,
          deadline: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
          title: `Proposal #${id}`,
          description: "On-chain proposal",
          createdAt: 0,
        };
      })
    );

    return NextResponse.json({ proposals, source: "live" });
  } catch (error) {
    console.error("[governance/proposals] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live governance proposals" }, { status: 500 });
  }
}

// ── POST — create, finalize, or execute a proposal ───────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action = "create", title, description, amount, proposalId, accountIndex = 0, address } = body;

  // ── Simulation mode ────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    if (action === "create") {
      if (!title || !amount) {
        return NextResponse.json({ error: "title and amount required" }, { status: 400 });
      }
      const proposal = simCreateProposal(
        address ?? "0x0",
        title,
        description ?? "",
        Number(amount)
      );
      return NextResponse.json({ success: true, proposal });
    }

    if (action === "finalize") {
      const result = simFinalizeProposal(Number(proposalId));
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, message: "Proposal finalized" });
    }

    if (action === "execute") {
      const result = simExecuteProposal(Number(proposalId));
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({
        success: true,
        message: `Asset acquired — ${result.fsftMinted?.toLocaleString()} FSFT minted`,
        fsftMinted: result.fsftMinted,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode ──────────────────────────────────────────────────────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const account = await getTestAccount(accountIndex);
    const wallet = account.wallet;
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const GovArtifactJson = (await import("@/artifacts/governance-Governance.json")).default;
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    if (action === "create") {
      if (!title || !amount) {
        return NextResponse.json({ error: "title and amount required" }, { status: 400 });
      }
      // Encode title as a Field (pad to 32 bytes)
      const descHashBytes = Buffer.from(title.slice(0, 31), "utf-8");
      const descHash = BigInt("0x" + descHashBytes.toString("hex").padStart(64, "0"));
      const receipt = await govContract.methods
        .create_proposal(descHash, BigInt(amount))
        .send({ from: AztecAddress.fromString(account.address) });
      return NextResponse.json({
        success: true,
        message: `Proposal "${title}" created`,
        txHash: receipt.txHash?.toString(),
      });
    }

    if (action === "finalize") {
      const receipt = await govContract.methods
        .finalize_proposal(Number(proposalId))
        .send({ from: AztecAddress.fromString(account.address) });
      return NextResponse.json({ success: true, txHash: receipt.txHash?.toString() });
    }

    if (action === "execute") {
      // Step 1: mark proposal as executed in governance
      const receipt = await govContract.methods
        .execute_proposal(Number(proposalId))
        .send({ from: AztecAddress.fromString(account.address) });

      // Step 2: mint FSFT via fund_token — test0 is still admin (set_admin(housing_fund) removed from bootstrap)
      const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
      const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
      if (fundTokenAddr && housingFundAddr) {
        try {
          const FtArtifactJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
          const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);
          const admin = await getTestAccount(0);
          const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, admin.wallet);
          await ftContract.methods
            .mint_public(AztecAddress.fromString(housingFundAddr), BigInt(amount ?? 0))
            .send({ from: AztecAddress.fromString(admin.address) });
        } catch (mintErr) {
          console.warn("[governance/execute] FSFT mint failed:", mintErr);
        }
      }

      return NextResponse.json({ success: true, txHash: receipt.txHash?.toString() });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/proposals]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
