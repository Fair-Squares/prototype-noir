import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simSetKYCVerified } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const { userAddress, accountIndex = 0, devMode = false } = await request.json().catch(() => ({}));

  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    simSetKYCVerified(userAddress);
    return NextResponse.json({
      success: true,
      message: devMode
        ? "KYC verified instantly (dev mode)"
        : "KYC verified (simulation)",
      verified: true,
    });
  }

  // ── Live mode: call KYCVerifier.verify(userAddress) as admin ─────────────
  try {
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    if (!kycAddr) return NextResponse.json({ error: "NEXT_PUBLIC_KYC_VERIFIER_ADDRESS not set" }, { status: 500 });

    const { getTestAccountWallet } = await import("@/lib/serverWallet");
    // Admin (test0) calls verify — only admin/verifiers can mark users as verified
    const adminWallet = await getTestAccountWallet(0);
    void accountIndex; // accountIndex is the user's index, but admin signs the tx

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const KycArtifactJson = (await import("@/artifacts/kyc_verifier-KYCVerifier.json")).default;
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, adminWallet);

    const receipt = await kycContract.methods
      .register_kyc(AztecAddress.fromString(userAddress))
      .send()
      .wait();

    return NextResponse.json({
      success: true,
      message: devMode ? "KYC verified instantly (dev mode)" : "KYC verified on-chain",
      txHash: receipt.txHash?.toString() ?? "unknown",
      verified: true,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[kyc/register]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
