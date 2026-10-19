import { NextRequest, NextResponse } from "next/server";
import { sharePriceFromBps, shareValueAtPurchase } from "@/lib/shareValue";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetPortfolio } from "@/lib/simulationStore";
import { simResult } from "@/lib/aztecSim";

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  const accountIndex = Number(searchParams.get("accountIndex") ?? "0");

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    return NextResponse.json(simGetPortfolio(address));
  }

  try {
    const eurTokenAddr = process.env.NEXT_PUBLIC_EUR_TOKEN_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
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
    const { Contract } = await import("@aztec-labs/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec-labs/aztec.js/abi");
    const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const selected = await getTestAccount(accountIndex);
    const wallet = selected.wallet;
    const selectedAddr = AztecAddress.fromStringUnsafe(selected.address);
    const ownerAddr = AztecAddress.fromStringUnsafe(address);
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
    let protocolTokenBalance = 0;
    let rewardsClaimable = 0;
    let investorRole = false;

    // All of the on-chain reads below are independent of one another: each
    // contract's artifact load + Contract.at + .simulate() consumes only the
    // request inputs (addresses, wallet), never another read's result. Fire
    // them as parallel async blocks so the route's latency is the slowest
    // single read instead of the sum of all reads. The conditional blocks
    // (defiVault / protocolToken / protocolRewards) resolve to their default
    // when the address env var is unset, exactly as the sequential code did.

    // V2: investor status = "does this account own a non-revoked KYC credential note?"
    const kycRead = (async () => {
      const KycJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
      const kycArtifact = loadContractArtifact(KycJson as Parameters<typeof loadContractArtifact>[0]);
      const kycContract = await Contract.at(AztecAddress.fromStringUnsafe(kycAddr), kycArtifact, wallet);
      const credentialsResult = simResult<{ len: bigint }>(
        await kycContract.methods.get_my_kyc_credentials(ownerAddr, 0).simulate({ from: selectedAddr })
      );
      return credentialsResult.len > 0n;
    })();

    // EUR is an AIP-20 token (vendored standards): balance_of_private (utility)
    // and balance_of_public (view).
    const eurRead = (async () => {
      const EurJson = await loadGeneratedArtifactJson("token_contract-Token.json");
      const eurArtifact = loadContractArtifact(EurJson as Parameters<typeof loadContractArtifact>[0]);
      const eurContract = await Contract.at(AztecAddress.fromStringUnsafe(eurTokenAddr), eurArtifact, wallet);
      const [privateEur, publicEur] = await Promise.all([
        eurContract.methods
          .balance_of_private(ownerAddr)
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "EURToken.balance_of_private")),
        eurContract.methods
          .balance_of_public(ownerAddr)
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "EURToken.balance_of_public")),
      ]);
      return privateEur + publicEur;
    })();

    const ftRead = (async () => {
      const FtJson = await loadGeneratedArtifactJson("token_contract-Token.json");
      const ftArtifact = loadContractArtifact(FtJson as Parameters<typeof loadContractArtifact>[0]);
      const ftContract = await Contract.at(AztecAddress.fromStringUnsafe(fundTokenAddr), ftArtifact, wallet);
      const [privateFsft, publicFsft, supply] = await Promise.all([
        ftContract.methods
          .balance_of_private(ownerAddr)
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "FundToken.balance_of_private")),
        ftContract.methods
          .balance_of_public(ownerAddr)
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "FundToken.balance_of_public")),
        ftContract.methods
          .total_supply()
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "FundToken.total_supply")),
      ]);
      return { privateFsft, publicFsft, supply };
    })();

    const hfRead = (async () => {
      const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
      const hfArtifact = loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]);
      const hfContract = await Contract.at(AztecAddress.fromStringUnsafe(housingFundAddr), hfArtifact, wallet);

      const [stats, depositNotesResult, valuation, totalRentIncome, rentWithdrawn, rentReinvested] = await Promise.all([
        hfContract.methods
          .get_fund_stats()
          .simulate({ from: selectedAddr })
          .then((r) =>
            simResult<{
              total_deposits: bigint;
              total_in_defi: bigint;
              total_allocated: bigint;
              available: bigint;
            }>(r)
          ),
        // V2: sum the caller's private DepositNotes from their PXE-side set.
        // This replaces the V1 public deposit_tickets[ownerAddr] map read so
        // the per-user deposit position is no longer exposed in public state.
        // get_my_deposit_notes returns BoundedVec<HintedNote<DepositNote>>, so each
        // storage entry is a HintedNote whose payload is under `.note` (the amount
        // lives at `.note.amount`, not directly on the hint wrapper).
        hfContract.methods
          .get_my_deposit_notes(ownerAddr, 0)
          .simulate({ from: selectedAddr })
          .then((r) =>
            simResult<{
              len: bigint;
              storage: Array<{ note?: { amount?: bigint } } | undefined>;
            }>(r)
          ),
        hfContract.methods
          .get_valuation()
          .simulate({ from: selectedAddr })
          .then((r) =>
            simResult<{
              last_asset_sale_price: bigint;
              last_fsft_minted: bigint;
              last_token_price_bps: bigint;
              last_valuation_block: bigint;
            }>(r)
          ),
        hfContract.methods
          .get_total_rent_income()
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "HousingFund.get_total_rent_income")),
        // Public-path withdraw-vs-reinvest ledger (per-holder). Accurate for
        // public-path claims; private-path rent claims are intentionally not
        // attributed on-chain (privacy), so this is a lower bound for those.
        hfContract.methods
          .get_rent_withdrawn(ownerAddr)
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "HousingFund.get_rent_withdrawn")),
        hfContract.methods
          .get_rent_reinvested(ownerAddr)
          .simulate({ from: selectedAddr })
          .then((r) => toNumberStrict(simResult(r), "HousingFund.get_rent_reinvested")),
      ]);
      return { stats, depositNotesResult, valuation, totalRentIncome, rentWithdrawn, rentReinvested };
    })();

    const ptRead = protocolTokenAddr
      ? (async () => {
          const PtJson = await loadGeneratedArtifactJson("token_contract-Token.json");
          const ptArtifact = loadContractArtifact(PtJson as Parameters<typeof loadContractArtifact>[0]);
          const ptContract = await Contract.at(AztecAddress.fromStringUnsafe(protocolTokenAddr), ptArtifact, wallet);
          const [privateProtocol, publicProtocol] = await Promise.all([
            ptContract.methods
              .balance_of_private(ownerAddr)
              .simulate({ from: selectedAddr })
              .then((r) => toNumberStrict(simResult(r), "ProtocolToken.balance_of_private")),
            ptContract.methods
              .balance_of_public(ownerAddr)
              .simulate({ from: selectedAddr })
              .then((r) => toNumberStrict(simResult(r), "ProtocolToken.balance_of_public")),
          ]);
          return privateProtocol + publicProtocol;
        })()
      : Promise.resolve(0);

    const rewardsRead = protocolRewardsAddr
      ? (async () => {
          const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
          const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
          const rewardsContract = await Contract.at(
            AztecAddress.fromStringUnsafe(protocolRewardsAddr),
            rewardsArtifact,
            wallet
          );
          return toNumberStrict(
            simResult(await rewardsContract.methods.get_claimable(ownerAddr).simulate({ from: selectedAddr })),
            "ProtocolRewards.get_claimable"
          );
        })()
      : Promise.resolve(0);

    const [investorRoleResult, eurResult, ftResult, hfResult, ptResult, rewardsResult] =
      await Promise.all([kycRead, eurRead, ftRead, hfRead, ptRead, rewardsRead]);

    investorRole = investorRoleResult;

    eurBalance = eurResult;

    const { privateFsft, publicFsft, supply } = ftResult;
    publicFsftBalance = publicFsft;
    fsftBalance = privateFsft + publicFsftBalance;
    totalSupply = supply;

    const { stats, depositNotesResult, valuation, totalRentIncome, rentWithdrawn, rentReinvested } = hfResult;
    totalFundDeposits = toNumberStrict(stats.total_deposits, "HousingFund.get_fund_stats.total_deposits");
    totalInDefi = toNumberStrict(stats.total_in_defi, "HousingFund.get_fund_stats.total_in_defi");
    totalAllocated = toNumberStrict(stats.total_allocated, "HousingFund.get_fund_stats.total_allocated");
    available = toNumberStrict(stats.available, "HousingFund.get_fund_stats.available");

    const depositNotesLen = Number(depositNotesResult.len);
    let depositSum = 0;
    for (let i = 0; i < depositNotesLen; i++) {
      const noteAmount = depositNotesResult.storage[i]?.note?.amount ?? 0n;
      depositSum += Number(noteAmount);
    }
    depositTicket = depositSum;

    lastAssetSalePrice = toNumberStrict(valuation.last_asset_sale_price, "HousingFund.get_valuation.last_asset_sale_price");
    lastFsftMinted = toNumberStrict(valuation.last_fsft_minted, "HousingFund.get_valuation.last_fsft_minted");
    tokenPriceBps = toNumberStrict(valuation.last_token_price_bps, "HousingFund.get_valuation.last_token_price_bps");

    protocolTokenBalance = ptResult;
    rewardsClaimable = rewardsResult;

    const sharePercent = totalSupply > 0 ? Math.round((fsftBalance / totalSupply) * 10000) / 100 : 0;
    // Shares are valued at purchase price (lib/shareValue.ts), never total
    // deposits ÷ shares outstanding.
    const sharePriceEur = sharePriceFromBps(tokenPriceBps);
    // NAV = pooled CAPITAL only (deposit principal). Rent is a SEPARATE claimable
    // earnings stream and does NOT inflate NAV / share value — the holder's rent
    // is surfaced via `estimatedYield` (their pooled pro-rata rent share). See the
    // canonical model in CLAUDE.md and docs/PHASE1_YIELD_AND_RENT.md.
    const navEur = Math.max(0, totalFundDeposits);
    // Lifetime EARNED rent (pro-rata); claimable nets out the on-chain ledger.
    const rentEarned = totalSupply > 0 ? Math.round((totalRentIncome * fsftBalance) / totalSupply) : 0;
    const hasDepositTicket = depositTicket > 0;
    const hasFsftExposure = publicFsftBalance > 0;
    const canVote = investorRole && (hasDepositTicket || hasFsftExposure);
    const privateFsftProofMode = "none";
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
      // The holder's pro-rata slice of REAL on-chain rent income (record_rent),
      // not a fabricated APY. estimatedYield = lifetime EARNED (unchanged); the
      // actionable unclaimed figure is rentClaimable, net of the on-chain
      // withdraw/reinvest ledger. Zero until rent is posted.
      estimatedYield: rentEarned,
      rentEarned,
      rentWithdrawn,
      rentReinvested,
      rentClaimable: Math.max(0, rentEarned - rentWithdrawn - rentReinvested),
      tokenPriceBps,
      sharePriceEur,
      shareValueEur: shareValueAtPurchase(fsftBalance, sharePriceEur),
      navEur,
      totalRentIncome,
      lastAssetSalePrice,
      lastFsftMinted,
      protocolTokenBalance,
      protocolTokenSymbol: "FSP",
      rewardsClaimable,
      canTradeDex: investorRole,
      rewardsEligible: investorRole && (hasDepositTicket || hasFsftExposure),
      governanceEligibility: {
        investorRole,
        hasDepositTicket,
        hasFsftExposure,
        hasFsftVotingAttestation: false,
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
