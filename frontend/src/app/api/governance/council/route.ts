import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { getAztecTxOutcome } from "@/lib/txHash";
import { humanizeContractError } from "@/lib/aztecSim";
import { simCouncilReview } from "@/lib/simulationStore";

// J2: Housing Council review actions (journey step 3a). A council member
// approves a SUBMITTED listing with a 0-100 quality score (J4's ranking
// input) or rejects it (final). Role gating is on-chain (is_council).

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, listingId, action, qualityScore, accountIndex = 0 } = body as {
    address?: string;
    listingId?: number;
    action?: "approve" | "reject";
    qualityScore?: number;
    accountIndex?: number;
  };
  if (!address || listingId === undefined || !action) {
    return NextResponse.json({ error: "address, listingId and action are required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if (action === "approve" && (qualityScore == null || qualityScore < 0 || qualityScore > 100)) {
    return NextResponse.json({ error: "qualityScore (0-100) is required to approve" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    const result = simCouncilReview(address, Number(listingId), action, qualityScore);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: action === "approve" ? "Listing approved by council" : "Listing rejected by council",
      source: "simulation",
    });
  }

  try {
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec-labs/aztec.js/contracts");
    const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses");
    const { loadArtifact } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }
    const from = AztecAddress.fromStringUnsafe(actor.address);
    const gov = await Contract.at(
      AztecAddress.fromStringUnsafe(govAddr),
      await loadArtifact("governance-Governance.json"),
      actor.wallet
    );

    const receipt =
      action === "approve"
        ? await gov.methods.council_approve(Number(listingId), Number(qualityScore)).send({ from })
        : await gov.methods.council_reject(Number(listingId)).send({ from });
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      const mapped = humanizeContractError(outcome.error ?? "");
      if (mapped) return NextResponse.json({ error: mapped.message }, { status: mapped.status });
      return NextResponse.json(
        { error: `Council ${action} was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "Listing approved by council" : "Listing rejected by council",
      txHash: outcome.txHash,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/council]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
