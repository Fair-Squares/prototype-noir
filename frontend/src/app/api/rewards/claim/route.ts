import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simClaimRewards } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult, isDuplicateNullifierError } from "@/lib/aztecSim";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, accountIndex = 0 } = body as { address?: string; accountIndex?: number };

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  if (!isLiveModeEnabled()) {
    const result = simClaimRewards(address);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      success: true,
      claimed: result.claimed ?? 0,
      message: "Protocol rewards claimed",
      source: "simulation",
    });
  }

  try {
    const rewardsAddr = process.env.NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS ?? "";
    const protocolTokenAddr = process.env.NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS ?? "";
    if (!rewardsAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS not set" }, { status: 500 });
    }
    if (!protocolTokenAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS not set" }, { status: 500 });
    }

    const { getTestAccount } = await import("@/lib/serverWallet");
    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");

    const actor = await getTestAccount(accountIndex);
    if (address.toLowerCase() !== actor.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const actorAddress = AztecAddress.fromString(actor.address);
    const userAddress = AztecAddress.fromString(address);

    const RewardsJson = await loadGeneratedArtifactJson("protocol_rewards-ProtocolRewards.json");
    const rewardsArtifact = loadContractArtifact(RewardsJson as Parameters<typeof loadContractArtifact>[0]);
    const rewardsContract = await Contract.at(AztecAddress.fromString(rewardsAddr), rewardsArtifact, actor.wallet);

    // V2: fetch caller's RewardClaimNote hint from PXE. claim_reward_private
    // consumes the note via SingleUseClaim and privately mints the
    // protocol token to caller — recipient identity never crosses the
    // private/public boundary.
    const rewardNotesResult = simResult<{ len: bigint; storage: unknown[] }>(
      await rewardsContract.methods.get_my_reward_notes(userAddress, 0).simulate({ from: actorAddress })
    );
    if (rewardNotesResult.len === 0n) {
      return NextResponse.json(
        {
          error:
            "No private RewardClaimNote found. The admin must allocate_reward_private(epoch, you, amount) before you can claim.",
        },
        { status: 400 }
      );
    }
    // HintedNote wrapper: the payload lives at .note (same shape as
    // portfolio/route.ts and scripts/e2e/rewards-claim.e2e.ts read it).
    const hintedRewardNote = rewardNotesResult.storage[0] as { note: { amount: bigint } };
    if (typeof hintedRewardNote?.note?.amount !== "bigint") {
      throw new Error("unexpected HintedNote shape from get_my_reward_notes");
    }
    const claimedAmount = Number(hintedRewardNote.note.amount);

    const receipt = await rewardsContract.methods
      .claim_reward_private(hintedRewardNote, AztecAddress.fromString(protocolTokenAddr))
      .send({ from: actorAddress });
    // A mined claim can still revert in the public tail (pool ledger,
    // duplicate nullifier) — mirror the thrown-path mapping below.
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      const m = outcome.error ?? "";
      if (isDuplicateNullifierError(m)) {
        return NextResponse.json({ error: "You have already claimed this reward." }, { status: 409 });
      }
      return NextResponse.json(
        { error: `Reward claim was mined but reverted on-chain: ${m || "no revert reason in receipt"}` },
        { status: 409 }
      );
    }
    return NextResponse.json({
      success: true,
      claimed: claimedAmount,
      message: "Protocol rewards privately claimed",
      txHash: outcome.txHash,
      source: "live",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[rewards/claim]", msg);
    if (isDuplicateNullifierError(msg)) {
      return NextResponse.json(
        { error: "You have already claimed this reward." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
