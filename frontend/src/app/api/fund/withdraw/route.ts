import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simWithdraw } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, amount } = await request.json();

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
    const { getTestAccount } = await import("@/lib/serverWallet");
    const account = await getTestAccount(accountIndex);
    const wallet = account.wallet;
    if (address.toLowerCase() !== account.address.toLowerCase()) {
      return NextResponse.json({ error: "address must match selected account" }, { status: 400 });
    }

    const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";
    if (!housingFundAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_HOUSING_FUND_ADDRESS not set" }, { status: 500 });
    }

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromString(housingFundAddr),
      hfArtifact,
      wallet
    );

    const accountAddress = AztecAddress.fromString(account.address);

    // V2 path: withdraw_private consumes a whole DepositNote. Fetch the
    // caller's first note whose amount matches the requested withdraw.
    // Partial-withdraw / change-note minting is a follow-up.
    const depositsResult = simResult<{
      len: bigint;
      storage: { note: { amount: bigint } }[];
    }>(await hfContract.methods.get_my_deposit_notes(accountAddress, 0).simulate({ from: accountAddress }));
    if (depositsResult.len === 0n) {
      return NextResponse.json(
        { error: "No private deposit notes available to withdraw" },
        { status: 403 }
      );
    }
    const target = depositsResult.storage.find(
      (h) => h?.note?.amount === BigInt(amount),
    );
    if (!target) {
      return NextResponse.json(
        {
          error:
            "No DepositNote with the exact requested amount. V2 withdraw consumes a whole note; partial withdrawals are not yet implemented.",
        },
        { status: 400 }
      );
    }

    const receipt = await hfContract.methods
      .withdraw_private(target)
      .send({ from: accountAddress });

    // send() resolves even when the mined tx reverted (e.g. the public tail's
    // "insufficient available balance" assert) — never report a reverted
    // withdrawal as success.
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      return NextResponse.json(
        { error: `Withdrawal was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Privately withdrew €${amount.toLocaleString()} from housing fund`,
      txHash: outcome.txHash,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/withdraw]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
