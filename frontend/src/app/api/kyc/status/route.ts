import { NextRequest, NextResponse } from "next/server";
import { getLiveKYCStatus } from "@/lib/aztecLive";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  try {
    // NOTE: KYC status for a specific address requires computing a mapping
    // storage slot via poseidon2 hash, which needs barretenberg WASM.
    // Until browser wallet is wired up, this returns false conservatively.
    const verified = await getLiveKYCStatus(address);
    return NextResponse.json({ verified, address, note: verified ? null : "private-state-requires-wallet" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }
}
