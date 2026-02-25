import { NextRequest, NextResponse } from "next/server";

/**
 * Fund deposit — requires signed transaction from the investor's account.
 *
 * CLI (inside aztec bootstrap container):
 *   aztec-wallet send --from accounts:test0 \
 *     --contract-address $HOUSING_FUND -- deposit <amount>
 */
export async function POST(request: NextRequest) {
  const { address, amount } = await request.json().catch(() => ({}));

  const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";

  return NextResponse.json(
    {
      error: "Deposits require a signed private transaction",
      action: "Browser wallet signing (poseidon2) required — coming soon",
      details: {
        contract: housingFundAddr,
        from: address,
        amount,
        cli: `node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js send --from accounts:test0 --contract-address ${housingFundAddr} --artifact /workspace/contracts/housing_fund/target/housing_fund-HousingFund.json -- deposit ${amount}`,
      },
    },
    { status: 501 }
  );
}
