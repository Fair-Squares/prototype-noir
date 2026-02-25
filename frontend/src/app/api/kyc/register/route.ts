import { NextRequest, NextResponse } from "next/server";

/**
 * KYC registration requires a signed admin transaction.
 *
 * To register a user via CLI (run from inside the aztec bootstrap container):
 *   aztec-wallet send --from accounts:test0 \
 *     --contract-address $KYC_VERIFIER_ADDRESS \
 *     --artifact kyc_verifier -- register_verifier <user_address>
 *
 * Browser wallet support (poseidon2 signing) is required for in-app registration.
 */
export async function POST(request: NextRequest) {
  const { userAddress } = await request.json().catch(() => ({}));

  const kycAddr = process.env.NEXT_PUBLIC_KYC_VERIFIER_ADDRESS ?? "";
  const adminAddr = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "";

  return NextResponse.json(
    {
      error: "KYC registration requires a signed admin transaction",
      action: "Use aztec-wallet CLI or wire up browser wallet signing",
      details: {
        contract: kycAddr,
        admin: adminAddr,
        targetUser: userAddress,
        cli: `node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js send --from accounts:test0 --contract-address ${kycAddr} --artifact /workspace/contracts/kyc_verifier/target/kyc_verifier-KYCVerifier.json -- verify ${userAddress}`,
      },
    },
    { status: 501 }
  );
}
