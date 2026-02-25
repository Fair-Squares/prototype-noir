import { NextResponse } from "next/server";

/** Returns the known devnet test accounts (same data as /api/accounts). */
export async function GET() {
  const admin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "";

  const accounts = admin
    ? [{ alias: "test0", address: admin, isAdmin: true }]
    : [];

  return NextResponse.json({ accounts, source: "live" });
}
