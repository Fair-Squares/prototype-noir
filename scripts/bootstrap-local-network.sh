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
# bb: barretenberg binary — handles AVM transpilation + VK generation
# Docker image has bb-avm, local installs may have bb — try both
if [ -x "/usr/src/barretenberg/cpp/build/bin/bb-avm" ]; then
  BB_BIN="/usr/src/barretenberg/cpp/build/bin/bb-avm"
elif [ -x "/usr/src/barretenberg/cpp/build/bin/bb" ]; then
  BB_BIN="/usr/src/barretenberg/cpp/build/bin/bb"
else
  BB_BIN=$(command -v bb-avm 2>/dev/null || command -v bb 2>/dev/null || echo "")
fi
[ -z "$BB_BIN" ] && { log "FATAL: bb/bb-avm binary not found"; exit 1; }

# -- Helpers -------------------------------------------------------------------

log() { printf '\n[bootstrap] %s\n' "$1"; }

die() { log "FATAL: $1"; exit 1; }

# Aztec's cli-wallet doesn't ship with 'inquirer' in the Docker image.
# Create a minimal ESM shim so the module resolves without error.
fix_inquirer() {
  INQDIR="/usr/src/yarn-project/node_modules/inquirer"
  if [ ! -d "$INQDIR" ]; then
    log "Patching missing inquirer dependency..."
    mkdir -p "$INQDIR"
    printf '{"name":"inquirer","version":"9.2.0","type":"module","exports":{".":{"import":"./index.js"}}}\n' \
      > "$INQDIR/package.json"
    printf 'const p=async()=>({});export default {prompt:p};export const prompt=p;\n' \
      > "$INQDIR/index.js"
    log "inquirer shim installed"
  fi
}

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
    artifact_dir="${ROOT_DIR}/contracts/${c}/target"
    cd "${ROOT_DIR}/contracts/${c}"

    # Step 1: compile Noir to ACIR (nargo not in PATH, use full binary path)
    $NARGO_BIN compile --silence-warnings 2>&1 || die "Could not compile ${c}"

    # Verify artifact was produced
    if [ ! -d "$artifact_dir" ] || [ -z "$(ls "$artifact_dir"/*.json 2>/dev/null)" ]; then
      die "No compilation artifact found for ${c} in ${artifact_dir}"
    fi

    # Step 2: AVM transpilation + VK generation (required for aztec-wallet deploy)
    # bb aztec_process needs an absolute path — relative paths don't resolve correctly
    log "Transpiling ${c} (AVM + VKs)..."
    $BB_BIN aztec_process -i "${artifact_dir}" 2>&1 | grep -E "Transpil|complete|Error" || die "AVM transpilation failed for ${c}"

    # Step 3: Strip __aztec_nr_internals__ prefix from function names.
    # The Aztec #[aztec] macro renames functions internally, but public_dispatch
    # uses the EXTERNAL names (no prefix). The SDK also looks up functions by
    # external name. This rename makes the artifact match what both expect.
    for json_file in "${artifact_dir}"/*.json; do
      python3 -c "
import json, re, sys
with open('${json_file}') as f: d = json.load(f)
for fn in d.get('functions', []):
    fn['name'] = re.sub(r'^__aztec_nr_internals__', '', fn['name'])
with open('${json_file}', 'w') as f: json.dump(d, f)
print('Renamed functions in ${json_file}')
" 2>&1
    done

    log "Compiled and transpiled ${c} successfully"
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
  TMPDIR=/tmp/fs-bootstrap
  mkdir -p "$TMPDIR"

  log "Importing test accounts..."
  $AZTEC_WALLET_BIN import-test-accounts 2>&1 | tee "$TMPDIR/import.log" >&2 || log "WARN: Could not import test accounts"
  ADMIN_ADDR=$(grep -oP 'Address:\s+\K0x[0-9a-fA-F]+' "$TMPDIR/import.log" | head -1)
  log "Admin address: ${ADMIN_ADDR:-unknown}"

  _deploy() {
    local label=$1 artifact=$2
    shift 2
    log "Deploying ${label}..."
    # Run deploy; tee to stderr so errors are visible in docker logs
    $AZTEC_WALLET_BIN deploy \
      "${ROOT_DIR}/contracts/${artifact}" \
      --init constructor \
      --from accounts:test0 \
      "$@" \
      -a "${label}" 2>&1 | tee "$TMPDIR/${label}.log" >&2
    local rc=${PIPESTATUS[0]}
    if [ $rc -ne 0 ]; then
      die "${label} deploy failed"
    fi
    # Extract deployed address
    grep -oP '(?i)contract\s+deployed\s+at\s+\K0x[0-9a-fA-F]+' "$TMPDIR/${label}.log" | tail -1
  }

  KYC_ADDR=$(_deploy "kyc_verifier" \
    "kyc_verifier/target/kyc_verifier-KYCVerifier.json" \
    --args accounts:test0)
  [ -z "$KYC_ADDR" ] && die "kyc_verifier deploy failed — no address in output"

  TOKEN_ADDR=$(_deploy "fund_token" \
    "fund_token/target/fund_token-FundToken.json" \
    --args accounts:test0)
  [ -z "$TOKEN_ADDR" ] && die "fund_token deploy failed — no address in output"

  VAULT_ADDR=$(_deploy "defi_vault" \
    "defi_vault/target/defi_vault-DeFiVault.json" \
    --args accounts:test0 300)
  [ -z "$VAULT_ADDR" ] && die "defi_vault deploy failed — no address in output"

  FUND_ADDR=$(_deploy "housing_fund" \
    "housing_fund/target/housing_fund-HousingFund.json" \
    --args accounts:test0)
  [ -z "$FUND_ADDR" ] && die "housing_fund deploy failed — no address in output"

  # Governance needs housing_fund address (alias won't work cross-invocation)
  log "Deploying governance..."
  $AZTEC_WALLET_BIN deploy \
    "${ROOT_DIR}/contracts/governance/target/governance-Governance.json" \
    --init constructor \
    --from accounts:test0 \
    --args "${FUND_ADDR}" accounts:test0 \
    -a governance 2>&1 | tee "$TMPDIR/governance.log" >&2
  GOV_ADDR=$(grep -oP '(?i)contract\s+deployed\s+at\s+\K0x[0-9a-fA-F]+' "$TMPDIR/governance.log" | tail -1)
  [ -z "$GOV_ADDR" ] && die "governance deploy failed — no address in output"

  log "Deployed addresses:"
  log "  KYCVerifier:  ${KYC_ADDR}"
  log "  FundToken:    ${TOKEN_ADDR}"
  log "  DeFiVault:    ${VAULT_ADDR}"
  log "  HousingFund:  ${FUND_ADDR}"
  log "  Governance:   ${GOV_ADDR}"

  export KYC_ADDR TOKEN_ADDR VAULT_ADDR FUND_ADDR GOV_ADDR ADMIN_ADDR
}

# -- 4. Wire contracts together ------------------------------------------------

wire_contracts() {
  # Use actual addresses (aliases don't persist across aztec-wallet invocations)
  log "Wiring HousingFund.set_contracts(kyc, token, vault, gov)..."
  $AZTEC_WALLET_BIN send set_contracts \
    --from accounts:test0 \
    --contract-address "${FUND_ADDR}" \
    --artifact "${ROOT_DIR}/contracts/housing_fund/target/housing_fund-HousingFund.json" \
    --args "${KYC_ADDR}" "${TOKEN_ADDR}" "${VAULT_ADDR}" "${GOV_ADDR}" \
    2>&1 >&2 || log "WARN: set_contracts failed"

  log "Wiring DeFiVault.set_housing_fund(housing_fund)..."
  $AZTEC_WALLET_BIN send set_housing_fund \
    --from accounts:test0 \
    --contract-address "${VAULT_ADDR}" \
    --artifact "${ROOT_DIR}/contracts/defi_vault/target/defi_vault-DeFiVault.json" \
    --args "${FUND_ADDR}" \
    2>&1 >&2 || log "WARN: set_housing_fund failed"

  log "Wiring FundToken.set_admin(housing_fund)..."
  $AZTEC_WALLET_BIN send set_admin \
    --from accounts:test0 \
    --contract-address "${TOKEN_ADDR}" \
    --artifact "${ROOT_DIR}/contracts/fund_token/target/fund_token-FundToken.json" \
    --args "${FUND_ADDR}" \
    2>&1 >&2 || log "WARN: set_admin failed"
}

# -- 5. Extract addresses and write env files ----------------------------------

save_addresses() {
  log "Extracting deployed contract addresses..."

  # Addresses are captured during deploy_contracts and exported
  admin_addr="${ADMIN_ADDR:-UNKNOWN}"
  kyc_addr="${KYC_ADDR:-DEPLOY_FAILED}"
  token_addr="${TOKEN_ADDR:-DEPLOY_FAILED}"
  vault_addr="${VAULT_ADDR:-DEPLOY_FAILED}"
  fund_addr="${FUND_ADDR:-DEPLOY_FAILED}"
  gov_addr="${GOV_ADDR:-DEPLOY_FAILED}"

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
  fix_inquirer
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
