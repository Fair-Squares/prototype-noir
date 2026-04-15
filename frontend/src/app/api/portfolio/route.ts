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
    const protocolTokenAddr = process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "";
    const protocolRewardsAddr = process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "";

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const selected = await getTestAccount(accountIndex);
    const wallet = selected.wallet;
    const selectedAddr = AztecAddress.fromString(selected.address);
    const ownerAddr = AztecAddress.fromString(address);
    const isOwnAccount = selected.address.toLowerCase() === address.toLowerCase();

    let eurBalance = 0;
    let fsftBalance = 0;
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
    let privateHolderVkConfigured = false;

    if (kycAddr) {
      try {
        const KycJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
        const kycArtifact = loadContractArtifact(KycJson as Parameters<typeof loadContractArtifact>[0]);
        const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);
        investorRole = Boolean(
          await kycContract.methods.is_investor(ownerAddr).simulate({ from: selectedAddr })
        );
      } catch {
        investorRole = false;
      }
    }

    if (eurTokenAddr) {
      const EurJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
      const eurArtifact = loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]);
      const eurContract = await Contract.at(AztecAddress.fromString(eurTokenAddr), eurArtifact, wallet);
      let privateEur = 0;
      let publicEur = 0;
      if (isOwnAccount) {
        try {
          privateEur = Number(await eurContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        } catch {}
        publicEur = Number(await eurContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        eurBalance = privateEur + publicEur;
      } else {
        eurBalance = Number(await eurContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
      }
    }

    if (fundTokenAddr) {
      const FtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
      const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
      const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, wallet);
      let privateFsft = 0;
      let publicFsft = 0;
      if (isOwnAccount) {
        try {
          privateFsft = Number(await ftContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        } catch {}
        publicFsft = Number(await ftContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        fsftBalance = privateFsft + publicFsft;
      } else {
        fsftBalance = Number(await ftContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
      }
      totalSupply = Number(await ftContract.methods.total_supply().simulate({ from: selectedAddr }));
      hasPrivateHolderProof = Boolean(
        await ftContract.methods.has_private_holder_proof(ownerAddr).simulate({ from: selectedAddr })
      );
      privateHolderVkConfigured = Boolean(
        await ftContract.methods
          .get_private_holder_vk_hash()
          .simulate({ from: selectedAddr })
          .then((value: unknown) => {
            if (typeof value === "bigint") return value !== 0n;
            if (typeof value === "number") return value !== 0;
            if (typeof value === "string") return value !== "0";
            if (value && typeof value === "object" && "toString" in value) {
              return (value as { toString: () => string }).toString() !== "0";
            }
            return false;
          })
      );
    }

    if (housingFundAddr) {
      const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
      const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
      const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, wallet);

      const statsRaw = await hfContract.methods.get_fund_stats().simulate({ from: selectedAddr });
      const stats = Array.isArray(statsRaw) ? statsRaw : [0, 0, 0, 0];
      totalFundDeposits = toNumberSafe(stats[0]);
      totalInDefi = toNumberSafe(stats[1]);
      totalAllocated = toNumberSafe(stats[2]);
      available = toNumberSafe(stats[3]);

      depositTicket = Number(
        await hfContract.methods.get_user_deposit_ticket(ownerAddr).simulate({ from: selectedAddr })
      );

      const valuationRaw = await hfContract.methods.get_valuation().simulate({ from: selectedAddr });
      const valuation = Array.isArray(valuationRaw) ? valuationRaw : [0, 0, 0, 0];
      lastAssetSalePrice = toNumberSafe(valuation[0]);
      lastFsftMinted = toNumberSafe(valuation[1]);
      tokenPriceBps = toNumberSafe(valuation[2]);
    }

    if (protocolTokenAddr) {
      const PtJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");
      const ptArtifact = loadContractArtifact(PtJson as Parameters<typeof loadContractArtifact>[0]);
      const ptContract = await Contract.at(AztecAddress.fromString(protocolTokenAddr), ptArtifact, wallet);
      let privateProtocol = 0;
      let publicProtocol = 0;
      if (isOwnAccount) {
        try {
          privateProtocol = Number(await ptContract.methods.private_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        } catch {}
        publicProtocol = Number(await ptContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
        protocolTokenBalance = privateProtocol + publicProtocol;
      } else {
        protocolTokenBalance = Number(await ptContract.methods.public_balance_of(ownerAddr).simulate({ from: selectedAddr }));
      }
    }

    if (protocolRewardsAddr) {
      try {
        const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
        const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
        const rewardsContract = await Contract.at(
          AztecAddress.fromString(protocolRewardsAddr),
          rewardsArtifact,
          wallet
        );
        rewardsClaimable = Number(
          await rewardsContract.methods.get_claimable(ownerAddr).simulate({ from: selectedAddr })
        );
      } catch {
        rewardsClaimable = 0;
      }
    }

    const sharePercent = totalSupply > 0 ? Math.round((fsftBalance / totalSupply) * 10000) / 100 : 0;
    const tokenPriceEur = tokenPriceBps > 0 ? tokenPriceBps / 10000 : 0;
    const navEur = Math.max(0, totalFundDeposits + totalYield);
    const navPerFsftEur = totalSupply > 0 ? Math.round((navEur / totalSupply) * 10000) / 10000 : 0;
    const fsftMarketValue = Math.round(fsftBalance * navPerFsftEur * 100) / 100;
    const hasDepositTicket = depositTicket > 0;
    const hasFsftExposure = fsftBalance > 0 || hasPrivateHolderProof;
    const canVote = investorRole && (hasDepositTicket || hasFsftExposure);
    const privateFsftProofMode = hasPrivateHolderProof
      ? privateHolderVkConfigured
        ? "recursive-verified"
        : "aztec-private-proven"
      : "none";
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
        recursiveVkConfigured: privateHolderVkConfigured,
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
