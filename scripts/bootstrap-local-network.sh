#!/bin/sh
# Fair Squares -- Bootstrap: compile, deploy, and wire all Noir contracts.
#
# Runs inside the aztec-bootstrap Docker container with the same Aztec image
# that provides nargo, aztec, and aztec-wallet CLI tools.
#
# Outputs:
#   /out/.env.contracts   -- env file consumed by the frontend container
#   /workspace/frontend/.env.local -- local copy (for non-Docker dev)

set -eu

ROOT_DIR="/workspace"
OUT_DIR="${OUT_DIR:-/out}"
AZTEC_NODE_URL="${AZTEC_NODE_URL:-http://aztec:8080}"

CONTRACTS="kyc_verifier fund_token defi_vault housing_fund governance"

# -- Binary paths (Aztec image doesn't put these in PATH) ---------------------
# aztec CLI: the main node entrypoint
AZTEC_BIN="node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js"
# aztec-wallet: separate package for deploying/sending txs
AZTEC_WALLET_BIN="node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js"
# nargo: Noir compiler (aztec fork)
NARGO_BIN="/usr/src/noir/noir-repo/target/release/nargo"

# -- Helpers -------------------------------------------------------------------

log() { printf '\n[bootstrap] %s\n' "$1"; }

die() { log "FATAL: $1"; exit 1; }

# -- 1. Wait for PXE ----------------------------------------------------------

wait_for_pxe() {
  log "Waiting for Aztec PXE at ${AZTEC_NODE_URL} ..."
  attempts=0
  max_attempts=120
  while ! curl -sf "${AZTEC_NODE_URL}/status" > /dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "$max_attempts" ]; then
      die "PXE not reachable after ${max_attempts} attempts"
    fi
    sleep 3
  done
  log "PXE is healthy"
}

# -- 2. Compile contracts ------------------------------------------------------

compile_contracts() {
  for c in $CONTRACTS; do
    log "Compiling contract: ${c}"
    cd "${ROOT_DIR}/contracts/${c}"

    # Use nargo directly (the Aztec image doesn't put aztec/nargo in PATH)
    $NARGO_BIN compile --silence-warnings 2>&1 || die "Could not compile ${c}"

    # Verify artifact was produced
    artifact_dir="${ROOT_DIR}/contracts/${c}/target"
    if [ ! -d "$artifact_dir" ] || [ -z "$(ls "$artifact_dir"/*.json 2>/dev/null)" ]; then
      die "No compilation artifact found for ${c} in ${artifact_dir}"
    fi
    log "Compiled ${c} successfully"
  done
  cd "${ROOT_DIR}"
}

# -- 2b. Generate TypeScript contract wrappers ---------------------------------

generate_typescript() {
  artifacts_dir="${ROOT_DIR}/frontend/src/artifacts"
  mkdir -p "${artifacts_dir}"

  for c in $CONTRACTS; do
    target_dir="${ROOT_DIR}/contracts/${c}/target"
    log "Generating TypeScript for ${c}..."
    $AZTEC_BIN codegen "${target_dir}" --outdir "${artifacts_dir}" 2>&1 || {
      log "WARN: codegen failed for ${c}, frontend will use simulation fallback"
    }
  done

  # Copy raw JSON artifacts too (for loadContractArtifact fallback)
  for c in $CONTRACTS; do
    target_dir="${ROOT_DIR}/contracts/${c}/target"
    cp "${target_dir}"/*.json "${artifacts_dir}/" 2>/dev/null || true
  done

  log "TypeScript artifacts generated in ${artifacts_dir}"
}

# -- 3. Deploy contracts -------------------------------------------------------

deploy_contracts() {
  cd "${ROOT_DIR}"

  log "Importing test accounts..."
  $AZTEC_WALLET_BIN import-test-accounts 2>&1 || log "WARN: Could not import test accounts (may already exist)"

  # Deploy KYCVerifier(admin)
  log "Deploying KYCVerifier..."
  $AZTEC_WALLET_BIN deploy \
    "${ROOT_DIR}/contracts/kyc_verifier/target/kyc_verifier-KYCVerifier.json" \
    --from accounts:test0 \
    --args accounts:test0 \
    -a kyc_verifier 2>&1 || die "KYCVerifier deploy failed"

  # Deploy FundToken(admin)
  log "Deploying FundToken..."
  $AZTEC_WALLET_BIN deploy \
    "${ROOT_DIR}/contracts/fund_token/target/fund_token-FundToken.json" \
    --from accounts:test0 \
    --args accounts:test0 \
    -a fund_token 2>&1 || die "FundToken deploy failed"

  # Deploy DeFiVault(admin, yield_rate_bps=300 i.e. 3% APY)
  log "Deploying DeFiVault..."
  $AZTEC_WALLET_BIN deploy \
    "${ROOT_DIR}/contracts/defi_vault/target/defi_vault-DeFiVault.json" \
    --from accounts:test0 \
    --args accounts:test0 300 \
    -a defi_vault 2>&1 || die "DeFiVault deploy failed"

  # Deploy HousingFund(admin)
  log "Deploying HousingFund..."
  $AZTEC_WALLET_BIN deploy \
    "${ROOT_DIR}/contracts/housing_fund/target/housing_fund-HousingFund.json" \
    --from accounts:test0 \
    --args accounts:test0 \
    -a housing_fund 2>&1 || die "HousingFund deploy failed"

  # Deploy Governance(housing_fund, council)
  # council = test0 for the prototype
  log "Deploying Governance..."
  $AZTEC_WALLET_BIN deploy \
    "${ROOT_DIR}/contracts/governance/target/governance-Governance.json" \
    --from accounts:test0 \
    --args contracts:housing_fund accounts:test0 \
    -a governance 2>&1 || die "Governance deploy failed"
}

# -- 4. Wire contracts together ------------------------------------------------

wire_contracts() {
  log "Wiring HousingFund.set_contracts(kyc, token, vault, gov)..."
  $AZTEC_WALLET_BIN send set_contracts \
    --from accounts:test0 \
    --contract-address contracts:housing_fund \
    --args contracts:kyc_verifier contracts:fund_token contracts:defi_vault contracts:governance \
    2>&1 || log "WARN: set_contracts failed"

  log "Wiring DeFiVault.set_housing_fund(housing_fund)..."
  $AZTEC_WALLET_BIN send set_housing_fund \
    --from accounts:test0 \
    --contract-address contracts:defi_vault \
    --args contracts:housing_fund \
    2>&1 || log "WARN: set_housing_fund failed"

  log "Wiring FundToken.set_admin(housing_fund)..."
  $AZTEC_WALLET_BIN send set_admin \
    --from accounts:test0 \
    --contract-address contracts:fund_token \
    --args contracts:housing_fund \
    2>&1 || log "WARN: set_admin failed"
}

# -- 5. Extract addresses and write env files ----------------------------------

save_addresses() {
  log "Extracting deployed contract addresses..."

  # Resolve the admin address
  admin_addr=$($AZTEC_WALLET_BIN get-alias "accounts:test0" 2>/dev/null || echo "UNKNOWN")

  # Resolve contract addresses
  kyc_addr=$($AZTEC_WALLET_BIN get-alias "contracts:kyc_verifier" 2>/dev/null || echo "DEPLOY_FAILED")
  token_addr=$($AZTEC_WALLET_BIN get-alias "contracts:fund_token" 2>/dev/null || echo "DEPLOY_FAILED")
  vault_addr=$($AZTEC_WALLET_BIN get-alias "contracts:defi_vault" 2>/dev/null || echo "DEPLOY_FAILED")
  fund_addr=$($AZTEC_WALLET_BIN get-alias "contracts:housing_fund" 2>/dev/null || echo "DEPLOY_FAILED")
  gov_addr=$($AZTEC_WALLET_BIN get-alias "contracts:governance" 2>/dev/null || echo "DEPLOY_FAILED")

  env_content="# Auto-generated by bootstrap-local-network.sh
# $(date -u +%Y-%m-%dT%H:%M:%SZ)

NEXT_PUBLIC_AZTEC_PXE_URL=http://aztec:8080
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_SIMULATION=false
AZTEC_LIVE=true

# Contract addresses
NEXT_PUBLIC_KYC_VERIFIER_ADDRESS=${kyc_addr}
NEXT_PUBLIC_FUND_TOKEN_ADDRESS=${token_addr}
NEXT_PUBLIC_DEFI_VAULT_ADDRESS=${vault_addr}
NEXT_PUBLIC_HOUSING_FUND_ADDRESS=${fund_addr}
NEXT_PUBLIC_GOVERNANCE_ADDRESS=${gov_addr}
NEXT_PUBLIC_ADMIN_ADDRESS=${admin_addr}
"

  # Write to shared volume (consumed by frontend container)
  mkdir -p "${OUT_DIR}"
  printf '%s' "$env_content" > "${OUT_DIR}/.env.contracts"
  log "Wrote ${OUT_DIR}/.env.contracts"

  # Also write a local copy for non-Docker development
  printf '%s' "$env_content" > "${ROOT_DIR}/frontend/.env.local"
  log "Wrote ${ROOT_DIR}/frontend/.env.local"

  # Print summary
  log "============================================"
  log "Contract Addresses:"
  log "  KYCVerifier:  ${kyc_addr}"
  log "  FundToken:    ${token_addr}"
  log "  DeFiVault:    ${vault_addr}"
  log "  HousingFund:  ${fund_addr}"
  log "  Governance:   ${gov_addr}"
  log "  Admin:        ${admin_addr}"
  log "============================================"
}

# -- Main ----------------------------------------------------------------------

main() {
  log "Fair Squares bootstrap starting..."
  log "  Aztec PXE: ${AZTEC_NODE_URL}"
  log "  Workspace: ${ROOT_DIR}"

  wait_for_pxe
  compile_contracts
  generate_typescript
  deploy_contracts
  wire_contracts
  save_addresses

  log "============================================"
  log "Bootstrap completed successfully"
  log "  Frontend:  http://localhost:3000"
  log "  Aztec PXE: ${AZTEC_NODE_URL}"
  log "============================================"
}

main
