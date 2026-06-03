import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
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
  if (!isLiveModeEnabled()) {
    const result = simClaimRent(address ?? "0x0");
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      claimed: result.claimed ?? 0,
      txHash: `sim_rent_claim_${Date.now()}`,
      message: `Withdrew €${(result.claimed ?? 0).toLocaleString()} rent (simulation)`,
    });
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

    const depositsResult = simResult<{ len: bigint; storage: unknown[] }>(
      await hfContract.methods.get_my_deposit_notes(actorAddress, 0).simulate({ from: actorAddress })
    );
    if (depositsResult.len === 0n) {
      return NextResponse.json(
        { error: "No private deposit note for this account; deposit before claiming rent." },
        { status: 403 }
      );
    }

    // Multi-note: claim_rent_private acts per (note, epoch). Loop over ALL of the
    // caller's deposit notes so a multi-deposit holder withdraws their full rent,
    // not just the first note's share. Each call nullifies its own (note, epoch),
    // so already-withdrawn notes revert with a duplicate nullifier and notes with
    // no share revert "share is zero" — both are skipped; any other error surfaces.
    const eur = AztecAddress.fromString(eurTokenAddr);
    const smallPool = BigInt(status.small_pool);
    const smallTotal = BigInt(status.small_total);
    const fifoCap = BigInt(status.fifo_cap);
    let claimedNotes = 0;
    let lastTx: string | null = null;
    for (let i = 0; i < Number(depositsResult.len); i++) {
      try {
        const receipt = await hfContract.methods
          .claim_rent_private(epoch, depositsResult.storage[i], eur, smallPool, smallTotal, fifoCap)
          .send({ from: actorAddress });
        lastTx = requireAztecTxHash(receipt);
        claimedNotes++;
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : String(err);
        if (isDuplicateNullifierError(m) || m.includes("share is zero")) continue;
        throw err;
      }
    }
    if (claimedNotes === 0) {
      return NextResponse.json(
        { error: "Nothing to withdraw: rent for this epoch is already withdrawn, or your notes have no share." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      // EUR amounts are computed privately in-circuit and not returned by the tx;
      // report the number of notes withdrawn rather than a fabricated value.
      claimed: null,
      notesClaimed: claimedNotes,
      txHash: lastTx,
      message: `Rent withdrawn privately (${claimedNotes} deposit note${claimedNotes === 1 ? "" : "s"})`,
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
