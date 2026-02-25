import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simSetKYCVerified } from "@/lib/simulationStore";

export async function POST(request: NextRequest) {
  const { userAddress, accountIndex = 0, devMode = false } = await request.json().catch(() => ({}));

  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    simSetKYCVerified(userAddress);
    return NextResponse.json({
      success: true,
      message: devMode
        ? "KYC verified instantly (dev mode)"
        : "KYC verified (simulation)",
      verified: true,
    });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
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

    const receipt = await kycContract.methods
      .register_kyc(AztecAddress.fromString(userAddress))
      .send({ from: AztecAddress.fromString(admin.address) });

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
