import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simDeposit } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";
import { simResult } from "@/lib/aztecSim";

export async function POST(request: NextRequest) {
  const { address, accountIndex = 0, amount } = await request.json();

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
    // Required like its siblings: silently skipping the EUR transfer would mint
    // a deposit position for free (no fallback that lies — CLAUDE.md).
    if (!eurTokenAddr) {
      return NextResponse.json({ error: "NEXT_PUBLIC_EUR_TOKEN_ADDRESS not set" }, { status: 500 });
    }

    // @aztec-labs/aztec.js has no main export — use specific subpaths
    const { Contract, BatchCall } = await import("@aztec-labs/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec-labs/aztec.js/abi");
    const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");
    const accountAddress = AztecAddress.fromStringUnsafe(account.address);
    const userAddress = AztecAddress.fromStringUnsafe(address);

    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromStringUnsafe(kycAddr), kycArtifact, wallet);

    // V2 path: fetch caller's KycCredentialNote hint from their PXE so we
    // can pass it into HousingFund.deposit_private. Fails clearly if the
    // user has not been issued a private credential yet.
    const credentialsResult = simResult<{
      len: bigint;
      storage: unknown[];
    }>(await kycContract.methods.get_my_kyc_credentials(userAddress, 0).simulate({ from: accountAddress }));
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

    // The EUR transfer (still public for the EUR stablecoin shadow; V2 privacy
    // gain is on the housing-fund side where the deposit position becomes a
    // private DepositNote) is batched with deposit_private below into ONE tx.
    // EUR is an AIP-20 token: transfer_public_to_public(from, to, amount, _nonce).
    // from == caller (accountAddress) is self-authorized, so _nonce = 0.
    const EurArtifactJson = await loadGeneratedArtifactJson("token_contract-Token.json");
    const eurArtifact = loadContractArtifact(EurArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const eurContract = await Contract.at(AztecAddress.fromStringUnsafe(eurTokenAddr), eurArtifact, wallet);
    const eurTransferCall = eurContract.methods.transfer_public_to_public(
      accountAddress,
      AztecAddress.fromStringUnsafe(housingFundAddr),
      BigInt(amount),
      0,
    );

    // V2 private deposit. The DepositNote lands in caller's PXE;
    // only the aggregate total_deposits counter is updated publicly.
    const HfArtifactJson = await loadGeneratedArtifactJson("housing_fund-HousingFund.json");
    const hfArtifact = loadContractArtifact(HfArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const hfContract = await Contract.at(
      AztecAddress.fromStringUnsafe(housingFundAddr),
      hfArtifact,
      wallet
    );

    // Read the public deposit cursor so we can stamp the private deposit with
    // its immutable FIFO interval, global seq, and frozen small bit. The
    // contract's only_self tail equality-asserts these against the live public
    // cursors, so a stale read (or concurrent deposit) reverts the whole tx.
    const cursor = simResult<{
      cum_deposits: bigint;
      cum_small_deposits: bigint;
      deposit_seq: bigint;
      small_threshold: bigint;
    }>(await hfContract.methods.get_deposit_cursor_unconstrained().simulate({ from: accountAddress }));
    const amountU128 = BigInt(amount);
    const suppliedCumBefore = cursor.cum_deposits;
    const suppliedSeq = cursor.deposit_seq;
    const suppliedIsSmall = amountU128 <= cursor.small_threshold;

    // Atomic: one tx carries both the EUR transfer and the private deposit.
    // Previously these were two separate txs, so a deposit_private revert
    // (e.g. stale cursor under a concurrent deposit) stranded the user's EUR
    // in the fund with no DepositNote. BatchCall groups the private call and
    // the enqueued public transfer into a single ExecutionPayload — if the tx
    // reverts, both effects drop together.
    const receipt = await new BatchCall(wallet, [
      eurTransferCall,
      hfContract.methods.deposit_private(
        amountU128,
        hintedKycNote,
        suppliedCumBefore,
        suppliedSeq,
        suppliedIsSmall,
      ),
    ]).send({ from: accountAddress });

    // send() resolves even when the mined tx reverted (e.g. the only_self tail's
    // cursor equality assert lost a concurrency race) — inspect the receipt so a
    // reverted deposit is never reported as success.
    const outcome = getAztecTxOutcome(receipt);
    if (outcome.reverted) {
      return NextResponse.json(
        { error: `Deposit was mined but reverted on-chain: ${outcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Privately deposited €${amount.toLocaleString()} to housing fund`,
      txHash: outcome.txHash,
      blockNumber: outcome.blockNumber,
      status: outcome.status,
      // The EUR transfer now rides in the same tx as the deposit.
      eurTransferTxHash: outcome.txHash,
      eurTransferBlockNumber: outcome.blockNumber,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[fund/deposit]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
