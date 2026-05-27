import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetPortfolio } from "@/lib/simulationStore";

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

function toNumberStrict(value: unknown, fieldName: string): number {
  const parsed = toNumberSafe(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} is not a finite number`);
  }
  return parsed;
}

function expectTuple(value: unknown, expectedLength: number, methodName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${methodName} returned non-tuple response`);
  }
  if (value.length < expectedLength) {
    throw new Error(`${methodName} returned ${value.length} values, expected ${expectedLength}`);
  }
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json(simGetPortfolio(address));
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    const defiVaultAddr = process.env.NEXT_PUBLIC_DEFI_VAULT_ADDRESS ?? "";
    const protocolTokenAddr = process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "";
    const protocolRewardsAddr = process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "";

    if (!eurTokenAddr || !fundTokenAddr || !housingFundAddr || !kycAddr) {
      return NextResponse.json(
        {
          error:
            "NEXT_PUBLIC_EUR_TOKEN_ADDRESS, NEXT_PUBLIC_FUND_TOKEN_ADDRESS, NEXT_PUBLIC_HOUSING_FUND_ADDRESS, and NEXT_PUBLIC_KYC_VERIFIER_ADDRESS must be set",
        },
        { status: 500 }
      );
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const selected = await getTestAccount(accountIndex);
    const wallet = selected.wallet;
    const selectedAddr = AztecAddress.fromString(selected.address);
    const ownerAddr = AztecAddress.fromString(address);
    if (selected.address.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    let eurBalance = 0;
    let fsftBalance = 0;
    let publicFsftBalance = 0;
    let depositTicket = 0;
    let totalFundDeposits = 0;
    let totalInDefi = 0;
    let totalAllocated = 0;
    let available = 0;
    let totalSupply = 0;
    let lastAssetSalePrice = 0;
    let lastFsftMinted = 0;
    let tokenPriceBps = 0;
    let totalYield = 0;
    let protocolTokenBalance = 0;
    let rewardsClaimable = 0;
    let investorRole = false;
    let hasPrivateHolderProof = false;

    const KycJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);
    investorRole = Boolean(await kycContract.methods.is_investor(ownerAddr).simulate({ from: selectedAddr }));

    const EurJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
    const eurArtifact = loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]);
    const eurContract = await Contract.at(AztecAddress.fromString(eurTokenAddr), eurArtifact, wallet);
    const privateEur = toNumberStrict(
      await eurContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }),
      "EURToken.private_balance_of"
    );
    const publicEur = toNumberStrict(
      await eurContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }),
      "EURToken.public_balance_of"
    );
    eurBalance = privateEur + publicEur;

    const FtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
    const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
    const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, wallet);
    const privateFsft = toNumberStrict(
      await ftContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }),
      "FundToken.private_balance_of"
    );
    publicFsftBalance = toNumberStrict(
      await ftContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }),
      "FundToken.public_balance_of"
    );
    fsftBalance = privateFsft + publicFsftBalance;
    totalSupply = toNumberStrict(await ftContract.methods.total_supply().simulate({ from: selectedAddr }), "FundToken.total_supply");
    hasPrivateHolderProof = Boolean(
      await ftContract.methods.has_private_holder_proof(ownerAddr).simulate({ from: selectedAddr })
    );

    const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);

    const statsRaw = await hfContract.methods.get_fund_stats().simulate({ from: selectedAddr });
    const stats = expectTuple(statsRaw, 4, "HousingFund.get_fund_stats");
    totalFundDeposits = toNumberStrict(stats[0], "HousingFund.get_fund_stats.total_deposits");
    totalInDefi = toNumberStrict(stats[1], "HousingFund.get_fund_stats.total_in_defi");
    totalAllocated = toNumberStrict(stats[2], "HousingFund.get_fund_stats.total_allocated");
    available = toNumberStrict(stats[3], "HousingFund.get_fund_stats.available");

    depositTicket = toNumberStrict(
      await hfContract.methods.get_user_deposit_ticket(ownerAddr).simulate({ from: selectedAddr }),
      "HousingFund.get_user_deposit_ticket"
    );

    const valuationRaw = await hfContract.methods.get_valuation().simulate({ from: selectedAddr });
    const valuation = expectTuple(valuationRaw, 4, "HousingFund.get_valuation");
    lastAssetSalePrice = toNumberStrict(valuation[0], "HousingFund.get_valuation.last_asset_sale_price");
    lastFsftMinted = toNumberStrict(valuation[1], "HousingFund.get_valuation.last_fsft_minted");
    tokenPriceBps = toNumberStrict(valuation[2], "HousingFund.get_valuation.last_token_price_bps");

    if (defiVaultAddr) {
      const DvJson = await loadGeneratedArtifactJson("defi_vault-DeFiVault.json");
      const dvArtifact = loadContractArtifact(DvJson as Parameters<typeof loadContractArtifact>[0]);
      const dvContract = await Contract.at(AztecAddress.fromString(defiVaultAddr), dvArtifact, wallet);
      totalYield = toNumberStrict(
        await dvContract.methods.get_accrued_yield().simulate({ from: selectedAddr }),
        "DeFiVault.get_accrued_yield"
      );
    }

    if (protocolTokenAddr) {
      const PtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
      const ptArtifact = loadContractArtifact(PtJson as Parameters<typeof loadContractArtifact>[0]);
      const ptContract = await Contract.at(AztecAddress.fromString(protocolTokenAddr), ptArtifact, wallet);
      const privateProtocol = toNumberStrict(
        await ptContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }),
        "ProtocolToken.private_balance_of"
      );
      const publicProtocol = toNumberStrict(
        await ptContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }),
        "ProtocolToken.public_balance_of"
      );
      protocolTokenBalance = privateProtocol + publicProtocol;
    }

    if (protocolRewardsAddr) {
      const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
      const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
      const rewardsContract = await Contract.at(
        AztecAddress.fromString(protocolRewardsAddr),
        rewardsArtifact,
        wallet
      );
      rewardsClaimable = toNumberStrict(
        await rewardsContract.methods.get_claimable(ownerAddr).simulate({ from: selectedAddr }),
        "ProtocolRewards.get_claimable"
      );
    }

    const sharePercent = totalSupply > 0 ? Math.round((fsftBalance / totalSupply) * 10000) / 100 : 0;
    const tokenPriceEur = tokenPriceBps > 0 ? tokenPriceBps / 10000 : 0;
    const navEur = Math.max(0, totalFundDeposits + totalYield);
    const navPerFsftEur = totalSupply > 0 ? Math.round((navEur / totalSupply) * 10000) / 10000 : 0;
    const fsftMarketValue = Math.round(fsftBalance * navPerFsftEur * 100) / 100;
    const hasDepositTicket = depositTicket > 0;
    const hasFsftExposure = publicFsftBalance > 0 || hasPrivateHolderProof;
    const canVote = investorRole && (hasDepositTicket || hasFsftExposure);
    const privateFsftProofMode = hasPrivateHolderProof ? "aztec-private-proven" : "none";
    const governanceReason = !investorRole
      ? "Investor role required. Complete KYC first."
      : canVote
      ? "Eligible to vote."
      : "Voting requires an active position: a deposit or FSFT holdings.";

    return NextResponse.json({
      balance: fsftBalance,
      eurBalance,
      depositedAmount: depositTicket,
      totalFundDeposits,
      totalInDefi,
      totalAllocated,
      available,
      totalSupply,
      sharePercent,
      estimatedYield: Math.round(depositTicket * 0.03),
      tokenPriceBps,
      tokenPriceEur,
      navEur,
      navPerFsftEur,
      fsftMarketValue,
      lastAssetSalePrice,
      lastFsftMinted,
      totalYield,
      protocolTokenBalance,
      protocolTokenSymbol: "FSP",
      rewardsClaimable,
      canTradeDex: investorRole,
      rewardsEligible: investorRole && (hasDepositTicket || hasFsftExposure),
      governanceEligibility: {
        investorRole,
        hasDepositTicket,
        hasFsftExposure,
        hasFsftVotingAttestation: hasPrivateHolderProof,
        privateFsftProofMode,
        canVote,
        reason: governanceReason,
      },
      lockedEur: 0,
      lockedFsft: 0,
      source: "live",
    });
  } catch (error) {
    console.error("[portfolio] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live portfolio" }, { status: 500 });
  }
}
