import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simDeposit } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, amount } = await request.json().catch(() => ({}));

  if (!address || !amount || amount <= 0) {
    return NextResponse.json({ error: "address and positive amount required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const result = simDeposit(address, amount);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Deposited €${amount.toLocaleString()} to housing fund (simulation)`,
      txHash: `sim_deposit_${Date.now()}`,
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: call contracts via server wallet ──────────────────────────
  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const account = await getTestAccount(accountIndex);
    const wallet = account.wallet;

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";

    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    // @aztec/aztec.js has no main export — use specific subpaths
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    // Step 1: Transfer EUR from caller to housing fund (if EUR token deployed)
    if (eurTokenAddr) {
      const EurArtifactJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
      const eurArtifact = loadContractArtifact(EurArtifactJson as Parameters<typeof loadContractArtifact>[0]);
      const eurContract = await Contract.at(AztecAddress.fromString(eurTokenAddr), eurArtifact, wallet);
      await eurContract.methods
        .transfer_public(AztecAddress.fromString(housingFundAddr), BigInt(amount))
        .send({ from: AztecAddress.fromString(account.address) });
    }

    // Step 2: Increment housing fund deposit counter
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      hfArtifact,
      wallet
    );

    const receipt = await hfContract.methods
      .deposit(BigInt(amount))
      .send({ from: AztecAddress.fromString(account.address) });

    return NextResponse.json({
      success: true,
      message: `Deposited €${amount.toLocaleString()} to housing fund`,
      txHash: receipt.txHash?.toString() ?? "unknown",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/deposit]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
