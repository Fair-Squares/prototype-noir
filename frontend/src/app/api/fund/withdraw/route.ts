import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { address, amount } = await request.json().catch(() => ({}));
  const housingFundAddr = process.env.NEXT_PUBLIC_HOUSING_FUND_ADDRESS ?? "";

  return NextResponse.json(
    {
      error: "Withdrawals require a signed private transaction",
      action: "Browser wallet signing required — coming soon",
      details: {
        contract: housingFundAddr,
        from: address,
        amount,
        cli: `node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js send --from accounts:test0 --contract-address ${housingFundAddr} --artifact /workspace/contracts/housing_fund/target/housing_fund-HousingFund.json -- withdraw ${amount}`,
      },
    },
    { status: 501 }
  );
}
