import { NextRequest, NextResponse } from "next/server";
import { isLiveModeEnabled } from "@/lib/aztecLive";
import { simGrantJourneyRole, simSetKYCVerified } from "@/lib/simulationStore";
import { getAztecTxOutcome } from "@/lib/txHash";

// J1/J2: journey roles a demo persona can request alongside verification.
// Property owner is a verifier grant (register_property_owner); council is an
// admin grant (set_council_role). test0 is both admin and seeded verifier.
type JourneyRole = "property_owner" | "council";

function parseJourneyRoles(value: unknown): JourneyRole[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("journeyRoles must be an array");
  return value.map((r) => {
    if (r !== "property_owner" && r !== "council") {
      throw new Error(`Unknown journey role: ${String(r)}`);
    }
    return r;
  });
}

export async function POST(request: NextRequest) {
  const { userAddress, accountIndex = 0, devMode = false, journeyRoles: rawRoles } = await request.json();

  if (!userAddress) {
    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
  }
  let journeyRoles: JourneyRole[];
  try {
    journeyRoles = parseJourneyRoles(rawRoles);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
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
    for (const role of journeyRoles) simGrantJourneyRole(userAddress, role);
    return NextResponse.json({
      success: true,
      message: "KYC verified instantly (dev mode). Investor role granted.",
      verified: true,
      isInvestor: true,
      roles: ["investor", ...journeyRoles.map((r) => (r === "property_owner" ? "property owner" : r))],
      source: "dev",
    });
  }

  // ── Simulation mode ──────────────────────────────────────────────────────
  if (!isLiveModeEnabled()) {
    simSetKYCVerified(userAddress);
    for (const role of journeyRoles) simGrantJourneyRole(userAddress, role);
    return NextResponse.json({
      success: true,
      message: devMode
        ? "KYC verified instantly (dev mode). Investor role granted."
        : "KYC verified (simulation). Investor role granted.",
      verified: true,
      isInvestor: true,
      roles: ["investor", ...journeyRoles.map((r) => (r === "property_owner" ? "property owner" : r))],
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
    // A mined registration can still revert (verifier authorization) — do not
    // proceed to credential issuance on a failed registration.
    const registerOutcome = getAztecTxOutcome(receipt);
    if (registerOutcome.reverted) {
      return NextResponse.json(
        { error: `KYC registration was mined but reverted on-chain: ${registerOutcome.error ?? "no revert reason in receipt"}` },
        { status: 409 }
      );
    }

    // 2. V2 private credential: deliver a KycCredentialNote to the user's PXE.
    // Nonce is a current-ms timestamp; verifier records it off-chain at issuance
    // so it can compute the revocation commitment later via
    // KYCVerifier.compute_revocation_commitment(owner, nonce).
    const credentialNonce = BigInt(Date.now());
    let credentialTxHash: string;
    try {
      const credentialReceipt = await kycContract.methods
        .issue_credential(userAddr, credentialNonce)
        .send({ from: adminAddress });
      const credentialOutcome = getAztecTxOutcome(credentialReceipt);
      if (credentialOutcome.reverted) {
        // Route into the same fail-loudly path as a thrown send below.
        throw new Error(
          `credential issuance was mined but reverted on-chain: ${credentialOutcome.error ?? "no revert reason in receipt"}`
        );
      }
      credentialTxHash = credentialOutcome.txHash;
    } catch (err: unknown) {
      // FAIL LOUDLY: the private KycCredentialNote is what every everyday
      // private flow (deposit_private / cast_vote_private / DEX place_order)
      // attests — reporting "verified" without it would mask the failure until
      // the user's next private action rejects with "no credential found".
      // Public registration already succeeded and register_kyc is idempotent,
      // so retrying this route is safe.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[kyc/register] private credential issuance failed:", msg);
      return NextResponse.json(
        {
          error:
            `Public KYC registration succeeded, but issuing your private credential failed: ${msg}. ` +
            "Please retry verification.",
          publicTxHash: registerOutcome.txHash,
        },
        { status: 500 }
      );
    }

    // J1/J2: grant any requested journey roles as the admin/verifier (test0 is
    // both). Sequential sends from the same admin account; each outcome is
    // checked — a reverted grant fails the request rather than reporting a
    // role the chain does not have.
    const grantedRoles: string[] = ["investor"];
    for (const role of journeyRoles) {
      const grantReceipt =
        role === "property_owner"
          ? await kycContract.methods.register_property_owner(userAddr).send({ from: adminAddress })
          : await kycContract.methods.set_council_role(userAddr, true).send({ from: adminAddress });
      const grantOutcome = getAztecTxOutcome(grantReceipt);
      if (grantOutcome.reverted) {
        return NextResponse.json(
          {
            error:
              `KYC registration succeeded, but granting the ${role.replace("_", " ")} role ` +
              `was mined and reverted on-chain: ${grantOutcome.error ?? "no revert reason in receipt"}. Retry the role grant.`,
            publicTxHash: registerOutcome.txHash,
          },
          { status: 409 }
        );
      }
      grantedRoles.push(role === "property_owner" ? "property owner" : "council");
    }

    return NextResponse.json({
      success: true,
      message: devMode ? "KYC verified instantly (dev mode). Investor role granted." : "KYC verified on-chain. Investor role granted.",
      txHash: registerOutcome.txHash,
      credentialTxHash,
      credentialNonce: credentialNonce.toString(),
      verified: true,
      isInvestor: true,
      roles: grantedRoles,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[kyc/register]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
