import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simWithdraw } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, amount } = await request.json().catch(() => ({}));

  if (!address || !amount || amount <= 0) {
    return NextResponse.json({ error: "address and positive amount required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    const result = simWithdraw(address, amount);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Withdrew €${amount.toLocaleString()} from housing fund (simulation)`,
      txHash: `sim_withdraw_${Date.now()}`,
    });
  }

  // ── Live mode ────────────────────────────────────────────────────────────
  try {
    const { getTestAccountWallet } = await import("@/lib/serverWallet");
    const wallet = await getTestAccountWallet(accountIndex);

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    const { Contract, loadContractArtifact } = await import("@aztec/aztec.js");
    const { AztecAddress } = await import("@aztec/stdlib");
    const HfArtifactJson = (await import("@/artifacts/housing_fund-HousingFund.json")).default;
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      hfArtifact,
      wallet
    );

    const receipt = await hfContract.methods.withdraw(BigInt(amount)).send().wait();

    return NextResponse.json({
      success: true,
      message: `Withdrew €${amount.toLocaleString()} from housing fund`,
      txHash: receipt.txHash?.toString() ?? "unknown",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/withdraw]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
