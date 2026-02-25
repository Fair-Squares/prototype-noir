/**
 * Returns the known test accounts for this devnet deployment.
 *
 * Test accounts are pre-deployed during bootstrap (aztec-wallet create-account).
 * Their addresses are deterministic from the INITIAL_TEST_* key material.
 * admin = test0 (INITIAL_TEST_SECRET_KEYS[0]).
 *
 * For the prototype we expose these as selectable "wallet" identities.
 * No browser WASM / EmbeddedWallet needed — the server knows the keys and
 * can sign transactions on behalf of any test account.
 */

import { NextResponse } from "next/server";

export interface TestAccount {
  index: number;
  alias: string;
  address: string;
  isAdmin: boolean;
}

function getTestAccounts(): TestAccount[] {
  const admin = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "";

  // Bootstrap writes test0 = admin. test1/test2 share the same devnet wallet DB
  // but their addresses aren't in .env yet. Add them here when the bootstrap
  // script is updated to export NEXT_PUBLIC_TEST1_ADDRESS etc.
  const test1 = process.env.NEXT_PUBLIC_TEST1_ADDRESS ?? "";
  const test2 = process.env.NEXT_PUBLIC_TEST2_ADDRESS ?? "";

  const accounts: TestAccount[] = [];

  if (admin) {
    accounts.push({ index: 0, alias: "test0 (admin)", address: admin, isAdmin: true });
  }
  if (test1) {
    accounts.push({ index: 1, alias: "test1", address: test1, isAdmin: false });
  }
  if (test2) {
    accounts.push({ index: 2, alias: "test2", address: test2, isAdmin: false });
  }

  // Always return at least the admin account
  if (accounts.length === 0) {
    accounts.push({
      index: 0,
      alias: "test0 (admin)",
      address: "0x0000000000000000000000000000000000000000000000000000000000000000",
      isAdmin: true,
    });
  }

  return accounts;
}

export async function GET() {
  const accounts = getTestAccounts();
  return NextResponse.json({ accounts });
}
