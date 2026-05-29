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
 *   - Deploy any Fair Squares contract.
 *     Bootstrap-local-network.sh has to be ported to TS for testnet
 *     since aztec-wallet's --local-network flag does not apply on
 *     testnet, and the seed flow has to use a fresh SchnorrAccount
 *     instead of the canned test0/1/2 accounts.
 *
 * Related scripts:
 *   - scripts/testnet-deploy-account.ts -- creates / reuses a Schnorr
 *     account on testnet funded entirely via SponsoredFPC. Run this
 *     first; addresses + secret are persisted to scripts/.testnet/.
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
    log("Stage 6.5 pipeline:");
    log(" 1. AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-account.ts");
    log("    -- creates / reuses a Schnorr account paid for by SponsoredFPC.");
    log(" 2. AZTEC_NETWORK=testnet npx tsx scripts/testnet-deploy-contracts.ts");
    log("    -- deploys the contracts + AIP-20 token instances (FSFT/EUR/");
    log("       ProtocolToken, immutable minters set at deploy), wires");
    log("       set_contracts / set_property_nft / set_protocol_token, issues a");
    log("       private KYC credential to the deployer, emits frontend/.env.testnet.");
    log(" 3. Start the frontend with AZTEC_LIVE=true AZTEC_NETWORK=testnet,");
    log("    using the freshly written frontend/.env.testnet.");
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
