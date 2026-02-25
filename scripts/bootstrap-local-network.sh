#!/bin/bash
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
GOVERNANCE_VOTING_WINDOW_BLOCKS="${GOVERNANCE_VOTING_WINDOW_BLOCKS:-10}"

CONTRACTS="kyc_verifier fund_token defi_vault housing_fund governance"
# eur_token reuses the fund_token artifact — deployed as a second instance

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

log() { printf '\n[bootstrap] %s\n' "$1" >&2; }

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
  ADMIN_ADDR=$(grep -oP 'Address:\s+\K0x[0-9a-fA-F]+' "$TMPDIR/import.log" | sed -n '1p')
  TEST1_ADDR=$(grep -oP 'Address:\s+\K0x[0-9a-fA-F]+' "$TMPDIR/import.log" | sed -n '2p')
  TEST2_ADDR=$(grep -oP 'Address:\s+\K0x[0-9a-fA-F]+' "$TMPDIR/import.log" | sed -n '3p')
  log "Accounts: test0=${ADMIN_ADDR:-unknown} test1=${TEST1_ADDR:-unknown} test2=${TEST2_ADDR:-unknown}"

  # Deploy a contract; echoes full wallet output to stderr (visible in docker logs)
  # and returns the deployed address on stdout for capture via $().
  _deploy() {
    local label=$1 artifact=$2
    shift 2
    log "Deploying ${label}..."
    # tee /dev/stderr: streams all wallet output to stderr for visibility
    # grep then captures just the address line on stdout for $() capture
    $AZTEC_WALLET_BIN deploy \
      "${ROOT_DIR}/contracts/${artifact}" \
      --init constructor \
      --from accounts:test0 \
      "$@" \
      -a "${label}" 2>&1 \
      | tee /dev/stderr \
      | grep -oP '(?i)contract\s+deployed\s+at\s+\K0x[0-9a-fA-F]+' \
      | tail -1
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

  log "DEBUG: FUND_ADDR='${FUND_ADDR}' ADMIN_ADDR='${ADMIN_ADDR}'"

  # Governance: both args are actual addresses (aliases not valid in --args)
  GOV_ADDR=$(_deploy "governance" \
    "governance/target/governance-Governance.json" \
    --args "${FUND_ADDR}" "${ADMIN_ADDR}" "${GOVERNANCE_VOTING_WINDOW_BLOCKS}")
  [ -z "$GOV_ADDR" ] && die "governance deploy failed — no address in output"

  # -- Deploy EUR token (second instance of fund_token — represents EURs stablecoin) --
  EUR_ADDR=$(_deploy "eur_token" \
    "fund_token/target/fund_token-FundToken.json" \
    --args accounts:test0)
  [ -z "$EUR_ADDR" ] && die "eur_token deploy failed — no address in output"

  log "Deployed addresses:"
  log "  KYCVerifier:  ${KYC_ADDR}"
  log "  FundToken:    ${TOKEN_ADDR}"
  log "  DeFiVault:    ${VAULT_ADDR}"
  log "  HousingFund:  ${FUND_ADDR}"
  log "  Governance:   ${GOV_ADDR}"
  log "  EurToken:     ${EUR_ADDR}"

  export KYC_ADDR TOKEN_ADDR VAULT_ADDR FUND_ADDR GOV_ADDR ADMIN_ADDR EUR_ADDR TEST1_ADDR TEST2_ADDR
}

# -- 4. Wire contracts together ------------------------------------------------

wire_contracts() {
  # aztec-wallet send: no --artifact flag; wallet resolves ABI from deployed
  # contract DB (populated during deploy via -a alias).
  log "Wiring HousingFund.set_contracts(kyc, token, vault, gov)..."
  $AZTEC_WALLET_BIN send set_contracts \
    --from accounts:test0 \
    --contract-address "${FUND_ADDR}" \
    --args "${KYC_ADDR}" "${TOKEN_ADDR}" "${VAULT_ADDR}" "${GOV_ADDR}" \
    2>&1 >&2 || log "WARN: set_contracts failed"

  log "Wiring DeFiVault.set_housing_fund(housing_fund)..."
  $AZTEC_WALLET_BIN send set_housing_fund \
    --from accounts:test0 \
    --contract-address "${VAULT_ADDR}" \
    --args "${FUND_ADDR}" \
    2>&1 >&2 || log "WARN: set_housing_fund failed"

  # NOTE: We do NOT transfer FundToken (FSFT) admin to housing_fund.
  # test0 stays as FSFT admin so the API can mint FSFT when a governance
  # proposal is executed (housing_fund is wired but minting goes through test0).

  # -- Mint EUR stablecoin to all test accounts (public balances) ---------------
  log "Minting EUR to test accounts..."
  # test0 gets 600 000 EUR (will deposit 500 000, keeps 100 000 for demo)
  $AZTEC_WALLET_BIN send mint_public \
    --from accounts:test0 \
    --contract-address "${EUR_ADDR}" \
    --args "${ADMIN_ADDR}" 600000 \
    2>&1 >&2 || log "WARN: mint EUR test0 failed"

  # test1 gets 50 000 EUR
  if [ -n "${TEST1_ADDR:-}" ]; then
    $AZTEC_WALLET_BIN send mint_public \
      --from accounts:test0 \
      --contract-address "${EUR_ADDR}" \
      --args "${TEST1_ADDR}" 50000 \
      2>&1 >&2 || log "WARN: mint EUR test1 failed"
  fi

  # test2 gets 50 000 EUR
  if [ -n "${TEST2_ADDR:-}" ]; then
    $AZTEC_WALLET_BIN send mint_public \
      --from accounts:test0 \
      --contract-address "${EUR_ADDR}" \
      --args "${TEST2_ADDR}" 50000 \
      2>&1 >&2 || log "WARN: mint EUR test2 failed"
  fi

  # -- Initial housing fund deposit from test0 (500 000 EUR) -------------------
  # First transfer EUR to housing fund (test0 → housing_fund)
  log "Transferring 500000 EUR from test0 to housing fund..."
  $AZTEC_WALLET_BIN send transfer_public \
    --from accounts:test0 \
    --contract-address "${EUR_ADDR}" \
    --args "${FUND_ADDR}" 500000 \
    2>&1 >&2 || log "WARN: EUR transfer to housing fund failed"

  # Then record the deposit in housing fund counter
  log "Recording initial deposit in housing fund..."
  $AZTEC_WALLET_BIN send deposit \
    --from accounts:test0 \
    --contract-address "${FUND_ADDR}" \
    --args 500000 \
    2>&1 >&2 || log "WARN: housing fund initial deposit failed"

  log "Initial housing fund balance: 500 000 EUR (deposited by test0)"
}

# -- 5. Extract addresses and write env files ----------------------------------

save_addresses() {
  log "Extracting deployed contract addresses..."

  # Addresses are captured during deploy_contracts and exported
  admin_addr="${ADMIN_ADDR:-UNKNOWN}"
  test1_addr="${TEST1_ADDR:-UNKNOWN}"
  test2_addr="${TEST2_ADDR:-UNKNOWN}"
  kyc_addr="${KYC_ADDR:-DEPLOY_FAILED}"
  token_addr="${TOKEN_ADDR:-DEPLOY_FAILED}"
  vault_addr="${VAULT_ADDR:-DEPLOY_FAILED}"
  fund_addr="${FUND_ADDR:-DEPLOY_FAILED}"
  gov_addr="${GOV_ADDR:-DEPLOY_FAILED}"
  eur_addr="${EUR_ADDR:-DEPLOY_FAILED}"

  env_content="# Auto-generated by bootstrap-local-network.sh
# $(date -u +%Y-%m-%dT%H:%M:%SZ)

NEXT_PUBLIC_AZTEC_PXE_URL=http://aztec:8080
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_SIMULATION=false
# AZTEC_LIVE=true enables real contract calls (local Docker only)
# Vercel deployments should set AZTEC_LIVE=false
AZTEC_LIVE=true
GOVERNANCE_VOTING_WINDOW_BLOCKS=${GOVERNANCE_VOTING_WINDOW_BLOCKS}

# Contract addresses
NEXT_PUBLIC_KYC_VERIFIER_ADDRESS=${kyc_addr}
NEXT_PUBLIC_FUND_TOKEN_ADDRESS=${token_addr}
NEXT_PUBLIC_DEFI_VAULT_ADDRESS=${vault_addr}
NEXT_PUBLIC_HOUSING_FUND_ADDRESS=${fund_addr}
NEXT_PUBLIC_GOVERNANCE_ADDRESS=${gov_addr}
NEXT_PUBLIC_EUR_TOKEN_ADDRESS=${eur_addr}

# Test account addresses (written by import-test-accounts)
NEXT_PUBLIC_TEST0_ADDRESS=${admin_addr}
NEXT_PUBLIC_TEST1_ADDRESS=${test1_addr}
NEXT_PUBLIC_TEST2_ADDRESS=${test2_addr}
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
  log "  FundToken:    ${token_addr} (FSFT — admin: test0)"
  log "  EurToken:     ${eur_addr} (EURs — admin: test0)"
  log "  DeFiVault:    ${vault_addr}"
  log "  HousingFund:  ${fund_addr} (initial: 500 000 EUR)"
  log "  Governance:   ${gov_addr}"
  log "Accounts:"
  log "  test0 (admin): ${admin_addr} (600 000 EUR minted, 500 000 deposited)"
  log "  test1:         ${test1_addr} (50 000 EUR)"
  log "  test2:         ${test2_addr} (50 000 EUR)"
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
