import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled, isVercelSimulationMode } from "@/lib/aztecLive";
import { simGetKYCProfile } from "@/lib/simulationStore";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled() && isVercelSimulationMode()) {
    const profile = simGetKYCProfile(address);
    return NextResponse.json({ ...profile, source: "simulation" });
  }
  if (!isLiveModeEnabled()) {
    return NextResponse.json(
      { error: "Live mode is required locally. Set AZTEC_LIVE=true (simulation is Vercel-only)." },
      { status: 503 }
    );
  }

  // ── Live mode: call is_verified() utility function on KYCVerifier ────────
  try {
    const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
    if (!kycAddr) {
      return NextResponse.json({ verified: false, isInvestor: false, roles: [], source: "live" });
    }

    // Use admin wallet to query (utility functions are read-only, no signing needed)
    const { getTestAccount } = await import("@/lib/serverWallet");
    const admin = await getTestAccount(0);
    const wallet = admin.wallet;

    const { Contract } = await import("@aztec/aztec.js/contracts");
    const { loadContractArtifact } = await import("@aztec/aztec.js/abi");
    const { AztecAddress } = await import("@aztec/aztec.js/addresses");
    const { loadGeneratedArtifactJson } = await import("@/lib/artifactLoader");
    const KycArtifactJson = await loadGeneratedArtifactJson("kyc_verifier-KYCVerifier.json");
    const kycArtifact = loadContractArtifact(KycArtifactJson as Parameters<typeof loadContractArtifact>[0]);
    const kycContract = await Contract.at(AztecAddress.fromString(kycAddr), kycArtifact, wallet);

    const verified = await kycContract.methods
      .is_verified(AztecAddress.fromString(address))
      .simulate({ from: AztecAddress.fromString(admin.address) });
    const isInvestor = await kycContract.methods
      .is_investor(AztecAddress.fromString(address))
      .simulate({ from: AztecAddress.fromString(admin.address) });
    const roles: string[] = [];
    if (Boolean(isInvestor)) roles.push("investor");

    return NextResponse.json({
      verified: Boolean(verified),
      isInvestor: Boolean(isInvestor),
      roles,
      source: "live",
    });
  } catch (error) {
    console.error("[kyc/status] live read failed:", error);
    return NextResponse.json({ error: "Failed to read live KYC status" }, { status: 500 });
  }
}
