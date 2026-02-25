import { NextResponse } from "next/server";
import { getLiveFundStats } from "@/lib/aztecLive";

export async function GET() {
  try {
    const stats = await getLiveFundStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[fund/stats]", error);
    return NextResponse.json(
      { error: "Failed to read fund stats from chain", detail: String(error) },
      { status: 502 }
    );
  }
}
