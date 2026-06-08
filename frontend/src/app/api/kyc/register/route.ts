import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simSetKYCVerified } from "@/lib/simulationStore";
import { requireAztecTxHash } from "@/lib/txHash";

export async function POST(request: NextRequest) {
  const { userAddress, accountIndex = 0, devMode = false } = await request.json();

  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }

  // Dev/sim shortcut ONLY when NOT in live mode. Previously this fired whenever
  // NEXT_PUBLIC_DEV_MODE=true (which the live docker stack sets), so register
  // silently wrote a SIM flag and never issued the on-chain credential — while
  // /api/kyc/status reads the chain (it gates dev-mode on !isLiveModeEnabled()).
  // That mismatch left UI-registered accounts (new dev accounts) unverified.
  // Match the status route: in live mode, always register + issue on-chain.
  const forceDevMode =
    !isLiveModeEnabled() &&
    (devMode ||
      process.env.NEXT_PUBLIC_DEV_MODE === "true" ||
      process.env.NEXT_PUBLIC_SIMULATION === "true");

  // ── SDK dev-mode/testing bypass ─────────────────────────────────────────
  // This keeps local KYC flows usable even when a live PXE/node is not running.
  if (forceDevMode) {
    simSetKYCVerified(userAddress);
    return NextResponse.json({
      success: true,
      message: "KYC verified instantly (dev mode). Investor role granted.",
      verified: true,
      isInvestor: true,
      roles: ["investor"],
      source: "dev",
    });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    simSetKYCVerified(userAddress);
    return NextResponse.json({
      success: true,
      message: devMode
        ? "KYC verified instantly (dev mode). Investor role granted."
        : "KYC verified (simulation). Investor role granted.",
      verified: true,
      isInvestor: true,
      roles: ["investor"],
    });
  }

  // ── Live mode: call KYCVerifier.verify(userAddress) as admin ─────────────
  try {
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    if (!kycAddr) return NextResponse.json({ error: "NEXT_PUBLIC_KYC_VERIFIER_ADDRESS not set" }, { status: 500 });

    const { getTestAccount } = await import("@/lib/serverWallet");
    // Admin (test0) calls verify — only admin/verifiers can mark users as verified
    const admin = await getTestAccount(0);
    const adminWallet = admin.wallet;
    void accountIndex; // accountIndex is the user's index, but admin signs the tx

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");
    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, adminWallet);

    const adminAddress = AztecAddress.fromString(admin.address);
    const userAddr = AztecAddress.fromString(userAddress);

    // 1. Public registration (legacy path, used by downstream V1 callers).
    const receipt = await kycContract.methods
      .register_kyc(userAddr)
      .send({ from: adminAddress });

    // 2. V2 private credential: deliver a KycCredentialNote to the user's PXE.
    // Nonce is a current-ms timestamp; verifier records it off-chain at issuance
    // so it can compute the revocation commitment later via
    // KYCVerifier.compute_revocation_commitment(owner, nonce).
    const credentialNonce = BigInt(Date.now());
    let credentialTxHash: string | undefined;
    let credentialError: string | undefined;
    try {
      const credentialReceipt = await kycContract.methods
        .issue_credential(userAddr, credentialNonce)
        .send({ from: adminAddress });
      credentialTxHash = requireAztecTxHash(credentialReceipt);
    } catch (err: unknown) {
      // Do not fail the whole request — public registration already succeeded.
      // The user can re-issue later; downstream V1 contracts still see them as
      // verified via the public maps.
      credentialError = err instanceof Error ? err.message : String(err);
      console.warn("[kyc/register] private credential issuance failed:", credentialError);
    }

    return NextResponse.json({
      success: true,
      message: devMode ? "KYC verified instantly (dev mode). Investor role granted." : "KYC verified on-chain. Investor role granted.",
      txHash: requireAztecTxHash(receipt),
      credentialTxHash,
      credentialError,
      credentialNonce: credentialNonce.toString(),
      verified: true,
      isInvestor: true,
      roles: ["investor"],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[kyc/register]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
