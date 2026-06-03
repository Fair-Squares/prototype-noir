import { NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simResult } from "@/lib/aztecSim";

// Lists the real-estate deed NFTs (AIP-721) the housing fund holds. The fund
// mints a deed with token_id = proposalId + 1 when a proposal's distribution
// opens, so we enumerate proposals and keep the ones whose deed is owned by the
// fund. Valuation/amount comes from the fund's per-proposal distribution state.
export async function GET() {
  if (!isLiveModeEnabled()) {
    return NextResponse.json({ properties: [], source: "simulation" });
  }

  try {
    const nftAddr = process.env.NEXT_PUBLIC_PROPERTY_NFT_ADDRESS ?? "";
    const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";
    const fundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!nftAddr || !govAddr || !fundAddr) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_PROPERTY_NFT_ADDRESS, NEXT_PUBLIC_GOVERNANCE_ADDRESS and NEXT_PUBLIC_HOUSING_FUND_ADDRESS must be set" },
        { status: 500 }
      );
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const admin = await getTestAccount(0);
    const from = AztecAddress.fromString(admin.address);

    const GovJson = await loadGeneratedArtifactJson("governance-Governance.json");
    const gov = await Contract.at(
      AztecAddress.fromString(govAddr),
      loadContractArtifact(GovJson as Parameters<typeof loadContractArtifact>[0]),
      admin.wallet
    );
    const NftJson = await loadGeneratedArtifactJson("nft_contract-NFT.json");
    const nft = await Contract.at(
      AztecAddress.fromString(nftAddr),
      loadContractArtifact(NftJson as Parameters<typeof loadContractArtifact>[0]),
      admin.wallet
    );
    const HfJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hf = await Contract.at(
      AztecAddress.fromString(fundAddr),
      loadContractArtifact(HfJson as Parameters<typeof loadContractArtifact>[0]),
      admin.wallet
    );

    const count = Number(simResult(await gov.methods.get_proposal_count().simulate({ from })));
    const fundLc = fundAddr.toLowerCase();

    const properties: Array<{
      proposalId: number;
      tokenId: number;
      owner: string;
      valuationEur: number;
      distributionOpen: boolean;
    }> = [];

    for (let id = 0; id < count; id += 1) {
      const tokenId = id + 1; // NFT reserves token_id 0
      const owner = String(
        simResult(await nft.methods.public_owner_of(BigInt(tokenId)).simulate({ from }))
      );
      if (!owner || owner.toLowerCase() !== fundLc) continue; // deed not minted to the fund

      const dist = simResult<{
        open: boolean;
        amount: bigint;
        snapshot_total: bigint;
        small_total: bigint;
        small_pool: bigint;
        fifo_cap: bigint;
        claimed_total: bigint;
      }>(await hf.methods.get_distribution_status(id).simulate({ from }));

      properties.push({
        proposalId: id,
        tokenId,
        owner,
        valuationEur: Number(dist.amount),
        distributionOpen: Boolean(dist.open),
      });
    }

    return NextResponse.json({ properties, source: "live" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[property]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
