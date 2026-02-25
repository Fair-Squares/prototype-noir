import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { address, proposalId, voteYes } = await request.json().catch(() => ({}));
  const govAddr = process.env.NEXT_PUBLIC_GOVERNANCE_ADDRESS ?? "";

  return NextResponse.json(
    {
      error: "Voting requires a signed private transaction",
      action: "Browser wallet signing required — coming soon",
      details: {
        contract: govAddr,
        from: address,
        proposalId,
        voteYes,
        cli: `node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js send --from accounts:test0 --contract-address ${govAddr} --artifact /workspace/contracts/governance/target/governance-Governance.json -- vote ${proposalId} ${voteYes ? "true" : "false"}`,
      },
    },
    { status: 501 }
  );
}
