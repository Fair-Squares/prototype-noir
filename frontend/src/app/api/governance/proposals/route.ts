import { NextRequest, NextResponse } from "next/server";
import { getBlockNumber } from "@/lib/aztecClient";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import {
  simGetProposals,
  simCreateProposal,
  simFinalizeProposal,
  simExecuteProposal,
} from "@/lib/simulationStore";

// -- Helpers -----------------------------------------------------------------

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return value.startsWith("0x") ? BigInt(value) : BigInt(Number(value));
  if (value && typeof value === "object" && "toBigInt" in value) {
    try {
      return (value as { toBigInt: () => bigint }).toBigInt();
    } catch {
      return BigInt(0);
    }
  }
  if (value && typeof value === "object" && "toString" in value) {
    const s = (value as { toString: () => string }).toString();
    if (s) {
      try {
        return s.startsWith("0x") ? BigInt(s) : BigInt(Number(s));
      } catch {
        return BigInt(0);
      }
    }
  }
  return BigInt(0);
}

// -- GET: list proposals ------------------------------------------------------

export async function GET() {
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    return NextResponse.json({ proposals: simGetProposals(), source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    if (!govAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const admin = await getTestAccount(0);
    const wallet = admin.wallet;
    const adminAddr = AztecAddress.fromString(admin.address);

    const GovArtifactJson = await loadGeneratedArtifactJson("governance-Governance.json");
    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, wallet);

    const count = Number(await govContract.methods.get_proposal_count().simulate({ from: adminAddr }));
    const currentBlock = await getBlockNumber();
    const proposals = await Promise.all(
      Array.from({ length: count }, async (_, id) => {
        const raw = await govContract.methods.get_proposal(id).simulate({ from: adminAddr });
        const tuple = Array.isArray(raw)
          ? raw
          : [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)];

        const descHash = toBigInt(tuple[0]);
        const amount = Number(toBigInt(tuple[1]));
        const yesVotes = Number(toBigInt(tuple[2]));
        const noVotes = Number(toBigInt(tuple[3]));
        const status = Number(toBigInt(tuple[4]));
        const createdBlock = Number(toBigInt(tuple[5]));
        const deadlineBlock = Number(toBigInt(tuple[6]));

        return {
          id,
          descHash: "0x" + descHash.toString(16).padStart(64, "0"),
          amount,
          yesVotes,
          noVotes,
          status,
          title: `Proposal #${id}`,
          description: "On-chain proposal",
          createdAt: createdBlock,
          deadline: deadlineBlock,
          createdBlock,
          deadlineBlock,
          currentBlock,
        };
      })
    );

    return NextResponse.json({ proposals, source: "live" });
  } catch (error) {
    console.error("[governance/proposals] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live governance proposals" }, { status: 500 });
  }
}

// -- POST: create, finalize, execute -----------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action = "create", title, description, amount, proposalId, accountIndex = 0, address } = body;

  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    if (action === "create") {
      if (!title || !amount) {
        return NextResponse.json({ error: "title and amount required" }, { status: 400 });
      }
      const proposal = simCreateProposal(
        address ?? "0x0",
        title,
        description ?? "",
        Number(amount)
      );
      return NextResponse.json({ success: true, proposal });
    }

    if (action === "finalize") {
      const result = simFinalizeProposal(Number(proposalId));
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, message: "Proposal finalized" });
    }

    if (action === "execute") {
      const result = simExecuteProposal(Number(proposalId));
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({
        success: true,
        message: `Asset acquired - ${result.fsftMinted?.toLocaleString()} FSFT minted`,
        fsftMinted: result.fsftMinted,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  try {
    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";
    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";

    if (!govAddr) return NextResponse.json({ error: "NEXT_PUBLIC_GOVERNANCE_ADDRESS not set" }, { status: 500 });

    const actor = await getTestAccount(accountIndex);
    const admin = await getTestAccount(0);

    const GovArtifactJson = await loadGeneratedArtifactJson("governance-Governance.json");
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const FtArtifactJson = await loadGeneratedArtifactJson("fund_token-FundToken.json");

    const govArtifact = loadContractArtifact(GovArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const ftArtifact = loadContractArtifact(FtArtifactJson as Parameters<typeof loadContractArtifact>[0]);

    const govContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, actor.wallet);

    if (action === "create") {
      if (!title || !amount) {
        return NextResponse.json({ error: "title and amount required" }, { status: 400 });
      }

      const descHashBytes = Buffer.from(title.slice(0, 31), "utf-8");
      const descHash = BigInt("0x" + descHashBytes.toString("hex").padStart(64, "0"));
      const receipt = await govContract.methods
        .create_proposal(descHash, BigInt(amount))
        .send({ from: AztecAddress.fromString(actor.address) });

      return NextResponse.json({
        success: true,
        message: `Proposal \"${title}\" created`,
        txHash: receipt.txHash?.toString(),
      });
    }

    if (action === "finalize") {
      const receipt = await govContract.methods
        .finalize_proposal(Number(proposalId))
        .send({ from: AztecAddress.fromString(actor.address) });
      return NextResponse.json({ success: true, txHash: receipt.txHash?.toString() });
    }

    if (action === "execute") {
      if (!fundTokenAddr || !housingFundAddr) {
        return NextResponse.json({ error: "FUND_TOKEN_ADDRESS and HOUSING_FUND_ADDRESS are required" }, { status: 500 });
      }

      // Read amount directly from on-chain proposal to avoid client tampering.
      const rawProposal = await govContract.methods
        .get_proposal(Number(proposalId))
        .simulate({ from: AztecAddress.fromString(actor.address) });
      const tuple = Array.isArray(rawProposal) ? rawProposal : [BigInt(0), BigInt(0)];
      const proposalAmount = Number(toBigInt(tuple[1]));
      if (proposalAmount <= 0) {
        return NextResponse.json({ error: "Invalid proposal amount" }, { status: 400 });
      }

      // 1) Execute proposal state transition in governance.
      // Contract authorizes only council (test0) or housing fund.
      const govAdminContract = await Contract.at(AztecAddress.fromString(govAddr), govArtifact, admin.wallet);
      const executeReceipt = await govAdminContract.methods
        .execute_proposal(Number(proposalId))
        .send({ from: AztecAddress.fromString(admin.address) });

      // 2) Reserve amount in HousingFund accounting.
      const hfContract = await Contract.at(AztecAddress.fromString(housingFundAddr), hfArtifact, admin.wallet);
      try {
        await hfContract.methods
          .reserve_for_property(BigInt(proposalAmount))
          .send({ from: AztecAddress.fromString(admin.address) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: `reserve_for_property failed: ${msg}` }, { status: 500 });
      }

      // 3) Read investor tickets and mint FSFT pro-rata to users.
      const ftContract = await Contract.at(AztecAddress.fromString(fundTokenAddr), ftArtifact, admin.wallet);
      const fundStatsRaw = await hfContract.methods
        .get_fund_stats()
        .simulate({ from: AztecAddress.fromString(admin.address) });
      const statsTuple = Array.isArray(fundStatsRaw) ? fundStatsRaw : [BigInt(0)];
      const totalDeposits = Number(toBigInt(statsTuple[0]));
      if (totalDeposits <= 0) {
        return NextResponse.json({ error: "No deposits in housing fund" }, { status: 400 });
      }

      const investorCount = Number(
        await hfContract.methods.get_investor_count().simulate({ from: AztecAddress.fromString(admin.address) })
      );

      const investors: { addr: string; ticket: number }[] = [];
      for (let i = 0; i < investorCount; i++) {
        const investorAddrObj = await hfContract.methods
          .get_investor_at(i)
          .simulate({ from: AztecAddress.fromString(admin.address) });
        const investorAddr = investorAddrObj.toString();
        if (!investorAddr || investorAddr === "0x0") continue;

        const ticket = Number(
          await hfContract.methods
            .get_user_deposit_ticket(AztecAddress.fromString(investorAddr))
            .simulate({ from: AztecAddress.fromString(admin.address) })
        );
        if (ticket > 0) investors.push({ addr: investorAddr, ticket });
      }

      if (investors.length === 0) {
        return NextResponse.json({ error: "No active investors with deposit tickets" }, { status: 400 });
      }

      let distributed = 0;
      const mints: { addr: string; amount: number }[] = investors.map((inv) => {
        const minted = Math.floor((proposalAmount * inv.ticket) / totalDeposits);
        distributed += minted;
        return { addr: inv.addr, amount: minted };
      });

      const remainder = proposalAmount - distributed;
      if (remainder > 0) {
        mints[0].amount += remainder;
        distributed += remainder;
      }

      let distributedTo = 0;
      for (const mint of mints) {
        if (mint.amount <= 0) continue;
        try {
          await ftContract.methods
            .mint_public(AztecAddress.fromString(mint.addr), BigInt(mint.amount))
            .send({ from: AztecAddress.fromString(admin.address) });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return NextResponse.json({ error: `mint_public failed for ${mint.addr}: ${msg}` }, { status: 500 });
        }
        distributedTo += 1;
      }

      // 4) Persist valuation snapshot on-chain (sale price, minted amount, token price bps).
      try {
        await hfContract.methods
          .record_asset_sale(BigInt(proposalAmount), BigInt(distributed))
          .send({ from: AztecAddress.fromString(admin.address) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: `record_asset_sale failed: ${msg}` }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        txHash: executeReceipt.txHash?.toString(),
        fsftMinted: distributed,
        distributedTo,
        message: `Executed proposal and distributed ${distributed.toLocaleString()} FSFT to ${distributedTo} investor wallets`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[governance/proposals]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
