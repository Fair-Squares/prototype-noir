import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simDeposit } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, amount } = await request.json();

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
    if (address.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";

    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }
    if (!kycAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_KYC_VERIFIER_ADDRESS not set" }, { status: 500 });
    }

    // @aztec/aztec.js has no main export — use specific subpaths
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");
    const accountAddress = AztecAddress.fromString(account.address);
    const userAddress = AztecAddress.fromString(address);

    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);

    // V2 path: fetch caller's KycCredentialNote hint from their PXE so we
    // can pass it into HousingFund.deposit_private. Fails clearly if the
    // user has not been issued a private credential yet.
    const credentialsResult = (await kycContract.methods
      .get_my_kyc_credentials(userAddress, 0)
      .simulate({ from: accountAddress })) as {
      len: bigint;
      storage: unknown[];
    };
    if (credentialsResult.len === 0n) {
      return NextResponse.json(
        {
          error:
            "No private KYC credential found for this account. Re-run KYC verification (bootstrap issue_credential, or POST /api/kyc/register) before depositing.",
        },
        { status: 403 }
      );
    }
    const hintedKycNote = credentialsResult.storage[0];

    // Step 1: Transfer EUR from caller to housing fund (still public for
    // the EUR stablecoin shadow; V2 privacy gain is on the housing-fund
    // side where the deposit position becomes a private DepositNote).
    if (eurTokenAddr) {
      const EurArtifactJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
      const eurArtifact = loadContractArtifact(EurArtifactJson as Parameters<typeof loadContractArtifact>[0]);
      const eurContract = await Contract.at(AztecAddress.fromString(eurTokenAddr), eurArtifact, wallet);
      await eurContract.methods
        .transfer_public(AztecAddress.fromString(housingFundAddr), BigInt(amount))
        .send({ from: accountAddress });
    }

    // Step 2: V2 private deposit. The DepositNote lands in caller's PXE;
    // only the aggregate total_deposits counter is updated publicly.
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      hfArtifact,
      wallet
    );

    const receipt = await hfContract.methods
      .deposit_private(BigInt(amount), hintedKycNote)
      .send({ from: accountAddress });

    return NextResponse.json({
      success: true,
      message: `Privately deposited €${amount.toLocaleString()} to housing fund`,
      txHash: requireAztecTxHash(receipt),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/deposit]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
