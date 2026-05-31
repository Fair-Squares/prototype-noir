import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simRecordRent } from "@/lib/simulationStore";
import { getAztecTxMeta } from "@/lib/txHash";

/**
 * POST /api/fund/rent — record collected rent for a funded property (Phase 1.1,
 * the real cash-flow primitive behind "earn the rent"). Live: calls
 * HousingFund.record_rent from the admin/keeper account (contract enforces
 * admin-or-keeper). Sim: accrues to the in-memory rent income. No fabricated
 * yield: rent is posted by an authorized party, never invented.
 *
 * Body: { propertyId: number, amount: number, accountIndex?: number, address?: string }
 */
export async function POST(request: NextRequest) {
  const { propertyId, amount, accountIndex = 0, address } = await request.json();
  const pid = Number(propertyId);
  const amt = Number(amount);
  if (!Number.isInteger(pid) || pid < 0 || !Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json(
      { error: "propertyId (integer >= 0) and a positive amount are required" },
      { status: 400 }
    );
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simRecordRent(pid, amt);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Recorded €${amt.toLocaleString()} rent for property ${pid} (simulation)`,
      txHash: `sim_rent_${Date.now()}`,
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: call HousingFund.record_rent via the server wallet ─────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const account = await getTestAccount(accountIndex);
    if (address && address.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      hfArtifact,
      account.wallet
    );

    const receipt = await hfContract.methods
      .record_rent(pid, BigInt(amt))
      .send({ from: AztecAddress.fromString(account.address) });
    const meta = getAztecTxMeta(receipt);

    return NextResponse.json({
      success: true,
      message: `Recorded €${amt.toLocaleString()} rent for property ${pid}`,
      txHash: meta.txHash,
      blockNumber: meta.blockNumber,
      status: meta.status,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/rent]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
