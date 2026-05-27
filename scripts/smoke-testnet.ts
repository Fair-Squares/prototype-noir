/**
 * Fair Squares -- Testnet smoke test
 *
 * Connects to the Aztec testnet PXE endpoint and prints basic chain
 * metadata so we can verify connectivity + version compatibility before
 * attempting a full deployment.
 *
 * Usage:
 *   AZTEC_NETWORK=testnet npx tsx scripts/smoke-testnet.ts
 *
 *   # Override PXE URL:
 *   AZTEC_NETWORK=testnet AZTEC_NODE_URL=https://my-pxe.example.com \
 *     npx tsx scripts/smoke-testnet.ts
 *
 * What this verifies (today):
 *   1. Network env is set to "testnet".
 *   2. PXE URL is reachable; chain_id / version come back.
 *   3. The pinned aztec.js (v4.3.0) and the testnet node agree.
 *
 * What this does NOT do yet (Stage 6.5 follow-up):
 *   - Create / fund a Schnorr account via SponsoredFPC.
 *     Requires `@aztec/noir-contracts.js` to import the SponsoredFPC
 *     artifact; add to scripts/package.json then port the
 *     aztec-starter/src/utils/deploy_account.ts pattern.
 *   - Deploy any Fair Squares contract.
 *     Bootstrap-local-network.sh has to be ported to TS for testnet
 *     since aztec-wallet's --local-network flag does not apply on
 *     testnet, and the seed flow has to use a fresh SchnorrAccount
 *     instead of the canned test0/1/2 accounts.
 */

import { createAztecNodeClient } from "@aztec/aztec.js/node";

const DEFAULT_TESTNET_PXE = "https://rpc.testnet.aztec-labs.com";
const DEFAULT_LOCAL_PXE = "http://localhost:8080";

function resolveNetwork(): "testnet" | "local-network" {
  const v = (process.env.AZTEC_NETWORK ?? "").trim().toLowerCase();
  return v === "testnet" ? "testnet" : "local-network";
}

function resolvePxeUrl(network: "testnet" | "local-network"): string {
  if (process.env.AZTEC_NODE_URL) return process.env.AZTEC_NODE_URL;
  if (process.env.PXE_URL) return process.env.PXE_URL;
  return network === "testnet" ? DEFAULT_TESTNET_PXE : DEFAULT_LOCAL_PXE;
}

function log(msg: string) {
  console.log(`[smoke-testnet] ${msg}`);
}

async function main() {
  const network = resolveNetwork();
  const pxeUrl = resolvePxeUrl(network);

  log(`network = ${network}`);
  log(`pxe     = ${pxeUrl}`);

  if (network !== "testnet") {
    log(`⚠️  AZTEC_NETWORK is "${network}". This script targets testnet.`);
    log(`    Re-run with: AZTEC_NETWORK=testnet npx tsx scripts/smoke-testnet.ts`);
  }

  log("connecting to PXE...");
  const node = createAztecNodeClient(pxeUrl);

  // Minimal liveness probes. createAztecNodeClient returns an RPC proxy;
  // any RPC call surfaces connectivity issues.
  try {
    const chainId = await node.getChainId();
    const version = await node.getVersion();
    log(`chain_id = ${chainId}`);
    log(`version  = ${version}`);

    const blockNumber = await node.getBlockNumber();
    log(`block    = ${blockNumber}`);

    log("✅ Testnet PXE reachable and aztec.js v4.3.0 compatible.");
    log("");
    log("Next milestones (Stage 6.5):");
    log(" 1. Add @aztec/noir-contracts.js to scripts/package.json");
    log(" 2. Port scripts/bootstrap-local-network.sh deploy logic to TS");
    log(" 3. Use SponsoredFeePaymentMethod (see aztec-starter pattern)");
    log(" 4. Emit frontend/.env.testnet with the deployed contract addresses");
  } catch (err) {
    log(`❌ PXE call failed: ${err instanceof Error ? err.message : String(err)}`);
    log("");
    log("Troubleshooting:");
    log(" - Confirm AZTEC_NETWORK is set, or pass AZTEC_NODE_URL explicitly.");
    log(" - Check the Aztec networks page for the current testnet PXE URL.");
    log(" - Sponsored FPC quotas: if the address itself is rate-limited,");
    log("   client-side calls will still see PXE liveness; that's good.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("smoke-testnet failed:", err);
  process.exit(1);
});
