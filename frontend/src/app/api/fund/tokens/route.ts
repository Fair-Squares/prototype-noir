import { NextRequest, NextResponse } from "next/server";
import { callNodeRpc } from "@/lib/aztecClient";

/**
 * Returns token metadata + on-chain public balances.
 * Private FSFT balances require the user's viewing key (browser wallet).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  try {
    // Read total_supply from FundToken (slot 2)
    const tips = await callNodeRpc<{ proposed: { hash: string } }>("node_getL2Tips");
    const bh = tips.proposed.hash;
    const fundTokenAddr = process.env.NEXT_PUBLIC_FUND_TOKEN_ADDRESS ?? "";

    const totalSupplyRaw = await callNodeRpc<string>(
      "node_getPublicStorageAt",
      [bh, fundTokenAddr, "0x" + (2n).toString(16).padStart(64, "0")]
    );
    const totalSupply = totalSupplyRaw ? Number(BigInt(totalSupplyRaw)) : 0;

    return NextResponse.json({
      fundToken: {
        address: fundTokenAddr,
        symbol: "FSFT",
        name: "Fair Squares Fund Token",
        totalSupply,
        decimals: 0,
        peg: "1 FSFT = 1 EUR",
      },
      eurToken: {
        address: "native",
        symbol: "EURs",
        name: "EUR Stablecoin",
        decimals: 0,
        peg: "1 EURs = €1",
      },
      // Private balances require browser wallet (poseidon2 mapping slot + PXE decryption)
      eurBalance: 0,
      fsftBalance: 0,
      address: address || null,
      note: address ? "private-balances-require-browser-wallet" : null,
      source: "live",
    });
  } catch (error) {
    console.error("[fund/tokens]", error);
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
