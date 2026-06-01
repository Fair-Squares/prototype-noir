import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simSetRorConfig } from "@/lib/simulationStore";
import { getAztecTxMeta } from "@/lib/txHash";

/**
 * POST /api/fund/ror — admin config for the capped-return parameters: the
 * fund-level Return on Rent (`set_ror_bps`) and, optionally, a property's
 * acquisition value (`set_acquisition_value`). Rent = ROR × acquisition value.
 * Sim: sets the in-memory ROR. Live: admin-only contract calls (the contract
 * enforces admin / admin-or-keeper). Used by scripts/seed-fsft.sh.
 *
 * Body: { rorBps: number, propertyId?: number, acquisitionValue?: number,
 *         accountIndex?: number, address?: string }
 */
export async function POST(request: NextRequest) {
  const { rorBps, propertyId, acquisitionValue, accountIndex = 0, address } = await request.json();
  const bps = Number(rorBps);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    return NextResponse.json({ error: "rorBps must be an integer in [0, 10000]" }, { status: 400 });
  }
  const hasAcq =
    propertyId !== undefined && acquisitionValue !== undefined &&
    Number.isInteger(Number(propertyId)) && Number(propertyId) >= 0 && Number(acquisitionValue) >= 0;

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simSetRorConfig(bps);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Set ROR to ${(bps / 100).toFixed(2)}% (simulation)`,
      txHash: `sim_ror_${Date.now()}`,
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: set_ror_bps (+ optional set_acquisition_value) ──────────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }
    const account = await getTestAccount(accountIndex);
    if (address && address.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, account.wallet);
    const from = AztecAddress.fromString(account.address);

    const rorReceipt = await hfContract.methods.set_ror_bps(BigInt(bps)).send({ from });
    const rorMeta = getAztecTxMeta(rorReceipt);

    let acqTxHash: string | null = null;
    if (hasAcq) {
      const acqReceipt = await hfContract.methods
        .set_acquisition_value(Number(propertyId), BigInt(Number(acquisitionValue)))
        .send({ from });
      acqTxHash = getAztecTxMeta(acqReceipt).txHash;
    }

    return NextResponse.json({
      success: true,
      message: `Set ROR to ${(bps / 100).toFixed(2)}%${hasAcq ? ` + acquisition value for property ${propertyId}` : ""}`,
      txHash: rorMeta.txHash,
      acquisitionTxHash: acqTxHash,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/ror]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
