import { NextResponse } from "next/server";

/** Returns the known devnet test accounts (same data as /api/accounts). */
export async function GET() {
  try {
    const { getTestAccountAddresses } = await import("@/lib/serverWallet");
    const addrs = await getTestAccountAddresses();
    return NextResponse.json({
      accounts: addrs.map((a) => ({
        alias: a.index === 0 ? "test0" : `test${a.index}`,
        address: a.address,
        isAdmin: a.isAdmin,
      })),
      source: "live",
    });
  } catch {
    const admin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "";
    const accounts = admin
      ? [{ alias: "test0", address: admin, isAdmin: true }]
      : [];
    return NextResponse.json({ accounts, source: "live" });
  }
}
