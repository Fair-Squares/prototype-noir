import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simClaimRent } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";
import { simResult, isDuplicateNullifierError } from "@/lib/aztecSim";

/**
 * POST /api/fund/rent/claim — WITHDRAW the holder's claimable rent as EUR
 * (the withdraw side of the withdraw-vs-reinvest choice). Sim: simClaimRent.
 * Live: HousingFund.claim_rent_private against the caller's deposit note for an
 * open rent epoch (pays EUR private->private). Mirrors /api/governance/claim.
 *
 * Body: { accountIndex?: number, address?: string, rentEpochId?: number }
 */
export async function POST(request: NextRequest) {
  const { accountIndex = 0, address, rentEpochId = 0 } = await request.json();

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simClaimRent(address ?? "0x0");
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      claimed: result.claimed ?? 0,
      txHash: `sim_rent_claim_${Date.now()}`,
      message: `Withdrew €${(result.claimed ?? 0).toLocaleString()} rent (simulation)`,
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: claim_rent_private (pays EUR from the fund) ─────────────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    if (!housingFundAddr || !eurTokenAddr) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS and NEXT_PUBLIC_EUR_TOKEN_ADDRESS must be set" },
        { status: 500 }
      );
    }

    const actor = await getTestAccount(accountIndex);
    if (address && address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, actor.wallet);
    const actorAddress = AztecAddress.fromString(actor.address);

    const epoch = Number(rentEpochId);
    const status = simResult<{
      open: boolean;
      snapshot_total: bigint;
      small_total: bigint;
      small_pool: bigint;
      fifo_cap: bigint;
    }>(await hfContract.methods.get_rent_distribution_status(epoch).simulate({ from: actorAddress }));
    if (!status.open) {
      return NextResponse.json(
        { error: `Rent epoch ${epoch} is not open. A keeper must open_rent_distribution first.` },
        { status: 400 }
      );
    }

    // claim_rent_private needs a hinted DepositNote the caller owns + the epoch
    // snapshots (re-verified in the public tail). NOTE: claims against the FIRST
    // deposit note only; multiple notes would each need their own call (one
    // nullifier per (note_hash, epoch)) — the repo's documented single-note
    // posture, same as /api/governance/claim.
    const depositsResult = simResult<{ len: bigint; storage: unknown[] }>(
      await hfContract.methods.get_my_deposit_notes(actorAddress, 0).simulate({ from: actorAddress })
    );
    if (depositsResult.len === 0n) {
      return NextResponse.json(
        { error: "No private deposit note for this account; deposit before claiming rent." },
        { status: 403 }
      );
    }
    const hintedDepositNote = depositsResult.storage[0];

    const receipt = await hfContract.methods
      .claim_rent_private(
        epoch,
        hintedDepositNote,
        AztecAddress.fromString(eurTokenAddr),
        BigInt(status.small_pool),
        BigInt(status.small_total),
        BigInt(status.fifo_cap),
      )
      .send({ from: actorAddress });

    return NextResponse.json({
      success: true,
      // The EUR amount is computed privately in-circuit and not returned by the
      // tx; report null rather than a fabricated value.
      claimed: null,
      txHash: requireAztecTxHash(receipt),
      message: "Rent withdrawn privately",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/rent/claim]", msg);
    if (isDuplicateNullifierError(msg)) {
      return NextResponse.json({ error: "You have already withdrawn rent for this epoch." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
