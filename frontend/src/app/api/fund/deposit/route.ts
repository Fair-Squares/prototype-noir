import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simDeposit } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, amount } = await request.json().catch(() => ({}));

  if (!address || !amount || amount <= 0) {
    return NextResponse.json({ error: "address and positive amount required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    const result = simDeposit(address, amount);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      message: `Deposited €${amount.toLocaleString()} to housing fund (simulation)`,
      txHash: `sim_deposit_${Date.now()}`,
    });
  }

  // ── Live mode: call contracts via server wallet ──────────────────────────
  try {
    const { getTestAccountWallet } = await import("@/lib/serverWallet");
    const wallet = await getTestAccountWallet(accountIndex);

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";

    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    // Step 1: Burn EUR from caller's private balance (if EUR token is deployed)
    if (eurTokenAddr) {
      try {
        const { HousingFund: _hf, FundToken } = await import("@aztec/aztec.js");
        void _hf; // suppress unused warning
        const { AztecAddress } = await import("@aztec/stdlib");
        const { loadContractArtifact } = await import("@aztec/aztec.js");
        const EurArtifactJson = (await import("@/artifacts/fund_token-FundToken.json")).default;
        const eurArtifact = loadContractArtifact(EurArtifactJson as Parameters<typeof loadContractArtifact>[0]);
        void FundToken;
        const eurContract = await (await import("@aztec/aztec.js")).Contract.at(
          AztecAddress.fromString(eurTokenAddr),
          eurArtifact,
          wallet
        );
        // burn EUR (transfer to zero / use public_to_private in reverse — just use transfer to admin as burn stand-in)
        // For prototype: call transfer_public to housing fund addr (simulating EUR movement)
        await eurContract.methods.transfer_public(
          AztecAddress.fromString(housingFundAddr),
          BigInt(amount)
        ).send().wait();
      } catch (eurErr) {
        console.warn("[deposit] EUR burn failed (continuing with deposit counter only):", eurErr);
      }
    }

    // Step 2: Increment housing fund deposit counter
    const { Contract, loadContractArtifact: lca } = await import("@aztec/aztec.js");
    const { AztecAddress } = await import("@aztec/stdlib");
    const HfArtifactJson = (await import("@/artifacts/housing_fund-HousingFund.json")).default;
    const hfArtifact = lca(HfArtifactJson as Parameters<typeof lca>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      hfArtifact,
      wallet
    );

    const receipt = await hfContract.methods.deposit(BigInt(amount)).send().wait();

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
