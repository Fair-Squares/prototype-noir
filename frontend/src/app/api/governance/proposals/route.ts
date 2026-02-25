import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import {
  simGetProposals,
  simCreateProposal,
  simFinalizeProposal,
  simExecuteProposal,
} from "@/lib/simulationStore";

// ── GET — list proposals ──────────────────────────────────────────────────────

export async function GET() {
  // ── Simulation mode ────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    return NextResponse.json({ proposals: simGetProposals(), source: "simulation" });
  }

  try {
    const { getLiveProposals } = await import("@/lib/aztecLive");
    const proposals = await getLiveProposals();
    return NextResponse.json({ proposals, source: "live" });
  } catch (error) {
    console.error("[governance/proposals] live read failed:", error);
    return NextResponse.json({ proposals: simGetProposals(), source: "simulation", fallback: true });
  }
}

// ── POST — create, finalize, or execute a proposal ───────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action = "create", title, description, amount, proposalId, accountIndex = 0, address } = body;

  // ── Simulation mode ────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
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

  // ── Live mode ──────────────────────────────────────────────────────────
  try {
    const { getTestAccountWallet } = await import("@/lib/serverWallet");
    const wallet = await getTestAccountWallet(accountIndex);
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });

    const { Contract, loadContractArtifact } = await import("@aztec/aztec.js");
    const { AztecAddress } = await import("@aztec/stdlib");
    const GovArtifactJson = (await import("@/artifacts/governance-Governance.json")).default;
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    if (action === "create") {
      if (!title || !amount) {
        return NextResponse.json({ error: "title and amount required" }, { status: 400 });
      }
      // Hash the title as a Field value (simple: use title bytes as bigint)
      const descHashBytes = Buffer.from(title.slice(0, 31), "utf-8");
      const descHash = BigInt("0x" + descHashBytes.toString("hex").padStart(64, "0"));
      const receipt = await govContract.methods
        .create_proposal(descHash, BigInt(amount))
        .send()
        .wait();
      return NextResponse.json({
        success: true,
        message: `Proposal "${title}" created`,
        txHash: receipt.txHash?.toString(),
      });
    }

    if (action === "finalize") {
      const receipt = await govContract.methods
        .finalize_proposal(Number(proposalId))
        .send()
        .wait();
      return NextResponse.json({ success: true, txHash: receipt.txHash?.toString() });
    }

    if (action === "execute") {
      // Step 1: mark proposal as executed in governance
      const receipt = await govContract.methods
        .execute_proposal(Number(proposalId))
        .send()
        .wait();

      // Step 2: mint FSFT via fund_token (test0 is still admin)
      const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
      const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
      if (fundTokenAddr && housingFundAddr) {
        try {
          const FtArtifactJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
          const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);
          // Use test0 (admin) wallet to mint FSFT
          const adminWallet = await getTestAccountWallet(0);
          const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, adminWallet);
          await ftContract.methods
            .mint_public(AztecAddress.fromString(housingFundAddr), BigInt(amount ?? 0))
            .send()
            .wait();
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
