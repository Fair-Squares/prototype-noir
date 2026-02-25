import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGetKYCStatus } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    return NextResponse.json({ verified: simGetKYCStatus(address), source: "simulation" });
  }

  // ── Live mode: call is_verified() utility function on KYCVerifier ────────
  try {
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    if (!kycAddr) return NextResponse.json({ verified: false, source: "live" });

    // Use admin wallet to query (utility functions are read-only, no signing needed)
    const { getTestAccountWallet } = await import("@/lib/serverWallet");
    const wallet = await getTestAccountWallet(0);

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const KycArtifactJson = (await import("@/artifacts/kyc_verifier-KYCVerifier.json")).default;
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);

    // is_verified is #[external("utility")] unconstrained — call via simulate()
    const verified = await kycContract.methods
      .is_verified(AztecAddress.fromString(address))
      .simulate();

    return NextResponse.json({ verified: Boolean(verified), source: "live" });
  } catch (error) {
    console.warn("[kyc/status] live read failed, falling back to simulation:", error);
    return NextResponse.json({ verified: simGetKYCStatus(address), source: "simulation", fallback: true });
  }
}
