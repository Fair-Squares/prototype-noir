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
GOVERNANCE_VOTING_WINDOW_BLOCKS="${GOVERNANCE_VOTING_WINDOW_BLOCKS:-300}"
GOVERNANCE_MIN_QUORUM_VOTES="${GOVERNANCE_MIN_QUORUM_VOTES:-2}"
DEX_PRICE_BAND_BPS="${DEX_PRICE_BAND_BPS:-200}"
DEX_MAX_TTL_BLOCKS="${DEX_MAX_TTL_BLOCKS:-120}"
PROTOCOL_REWARDS_CLAIM_MIN="${PROTOCOL_REWARDS_CLAIM_MIN:-1}"
BOOTSTRAP_RETRY_ATTEMPTS="${BOOTSTRAP_RETRY_ATTEMPTS:-8}"
BOOTSTRAP_RETRY_DELAY_SECONDS="${BOOTSTRAP_RETRY_DELAY_SECONDS:-6}"
WALLET_MIN_FEE_PADDING="${WALLET_MIN_FEE_PADDING:-30}"

CONTRACTS="kyc_verifier defi_vault housing_fund governance fsft_dex protocol_rewards"
# Phase 3: FSFT, EUR, and ProtocolToken are ALL instances of the vendored AIP-20
# token_contract (deployed below with distinct immutable minters: FSFT->housing
# fund, EUR->Dripper, ProtocolToken->protocol_rewards). The bespoke fund_token
# crate has been removed.

# -- Vendored Defi-Wonderland aztec-standards (AIP-20/721 + Dripper) -----------
# Compiled from a separate Nargo workspace; artifacts land in its own target dir.
# token_contract (AIP-20: FSFT + EUR + ProtocolToken) + dripper (EUR faucet) + nft.
STANDARDS_DIR="${ROOT_DIR}/contracts/vendor/aztec-standards"
STANDARD_CONTRACTS="token_contract dripper nft_contract"

# -- Binary paths (Aztec image doesn't put these in PATH) ---------------------
# aztec CLI: the main node entrypoint
AZTEC_BIN="node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js"
# aztec-wallet: separate package for deploying/sending txs
AZTEC_WALLET_BIN="node --no-warnings /usr/src/yarn-project/cli-wallet/dest/bin/index.js"
# aztec-nargo: Aztec wrapper for Noir compile/test flows (preferred over raw nargo)
AZTEC_NARGO_BIN="$(command -v aztec-nargo 2>/dev/null || true)"
# nargo: Noir compiler. The v6 image (azteclabs/aztec, built from
# aztec-labs-eng/aztec-node) ships the pinned noir + bb binaries under
# /usr/src/labs-aztec-toolchain/bin; the pre-v6 aztecprotocol/aztec images
# kept them in the noir / barretenberg build dirs. Probe both layouts.
TOOLCHAIN_BIN="/usr/src/labs-aztec-toolchain/bin"
if [ -x "$TOOLCHAIN_BIN/nargo" ]; then
  NARGO_BIN="$TOOLCHAIN_BIN/nargo"
else
  NARGO_BIN="/usr/src/noir/noir-repo/target/release/nargo"
fi
# bb: barretenberg binary — handles AVM transpilation + VK generation.
# Docker images ship bb-avm (the AVM-enabled build); fall back to bb.
if [ -x "$TOOLCHAIN_BIN/bb-avm" ]; then
  BB_BIN="$TOOLCHAIN_BIN/bb-avm"
elif [ -x "$TOOLCHAIN_BIN/bb" ]; then
  BB_BIN="$TOOLCHAIN_BIN/bb"
elif [ -x "/usr/src/barretenberg/cpp/build/bin/bb-avm" ]; then
  BB_BIN="/usr/src/barretenberg/cpp/build/bin/bb-avm"
elif [ -x "/usr/src/barretenberg/cpp/build/bin/bb" ]; then
  BB_BIN="/usr/src/barretenberg/cpp/build/bin/bb"
else
  BB_BIN=$(command -v bb-avm 2>/dev/null || command -v bb 2>/dev/null || echo "")
fi
[ -z "$BB_BIN" ] && { log "FATAL: bb/bb-avm binary not found"; exit 1; }

# `aztec compile` resolves nargo/bb from the NARGO / BB env vars first (v6) and
# otherwise shells out to bare `nargo` / `bb` on PATH. The images do NOT put the
# toolchain on PATH, so export both forms.
if [ -x "$NARGO_BIN" ]; then
  export NARGO="$NARGO_BIN"
  case ":$PATH:" in
    *":$(dirname "$NARGO_BIN"):"*) ;;
    *) export PATH="$(dirname "$NARGO_BIN"):$PATH" ;;
  esac
fi
export BB="$BB_BIN"

# The Aztec stack version baked into this image, stamped into raw-nargo
# artifacts (see compile_standards) so codegen output type-checks.
AZTEC_VERSION="$($AZTEC_BIN --version 2>/dev/null | tail -1 | tr -d '[:space:]' || true)"
[ -n "$AZTEC_VERSION" ] || AZTEC_VERSION="$(tr -d '[:space:]' < "${ROOT_DIR}/.aztec-version")"

# -- Helpers -------------------------------------------------------------------

log() { printf '\n[bootstrap] %s\n' "$1" >&2; }

die() { log "FATAL: $1"; exit 1; }

# Incremental-build skip: a compiled+transpiled artifact in <target_dir> is
# "fresh" when it exists and no source under <src_dir> (*.nr / Nargo.toml) is
# newer than it. Lets re-bootstraps in this controlled dev env skip recompiling
# unchanged contracts (the vendored standards alone cost ~44s). Set
# FS_FORCE_COMPILE=1 to always rebuild.
artifact_is_fresh() {
  local src_dir=$1 target_dir=$2
  [ "${FS_FORCE_COMPILE:-0}" = "1" ] && return 1
  local newest_artifact
  newest_artifact=$(ls -t "$target_dir"/*.json 2>/dev/null | head -1)
  [ -z "$newest_artifact" ] && return 1
  # Any source newer than the artifact -> stale.
  [ -n "$(find "$src_dir" \( -name '*.nr' -o -name 'Nargo.toml' \) -newer "$newest_artifact" 2>/dev/null | head -1)" ] && return 1
  return 0
}

require_value() {
  local label=$1
  local value=${2:-}
  [ -n "$value" ] || die "Missing required value: ${label}"
}

is_retryable_wallet_error() {
  printf '%s' "$1" | grep -qE \
    'maxFeesPerGas\.feePerL2Gas|Timeout awaiting isMined|ECONNREFUSED|fetch failed|socket hang up|429|503|temporarily unavailable'
}

wallet_send_with_retries() {
  local mode=$1
  local label=$2
  shift 2

  local attempt=1
  local output=""
  local rc=0
  while [ "$attempt" -le "$BOOTSTRAP_RETRY_ATTEMPTS" ]; do
    log "${label} (attempt ${attempt}/${BOOTSTRAP_RETRY_ATTEMPTS})..."
    set +e
    output=$("$@" 2>&1)
    rc=$?
    set -e
    printf '%s\n' "$output" >&2

    if [ "$rc" -eq 0 ]; then
      return 0
    fi

    if [ "$attempt" -lt "$BOOTSTRAP_RETRY_ATTEMPTS" ] && is_retryable_wallet_error "$output"; then
      log "Retryable wallet error for ${label}; sleeping ${BOOTSTRAP_RETRY_DELAY_SECONDS}s"
      sleep "$BOOTSTRAP_RETRY_DELAY_SECONDS"
      attempt=$((attempt + 1))
      continue
    fi
    break
  done

  if [ "$mode" = "required" ]; then
    die "${label} failed after ${BOOTSTRAP_RETRY_ATTEMPTS} attempts"
  fi
  log "WARN: ${label} failed after ${BOOTSTRAP_RETRY_ATTEMPTS} attempts"
  return 1
}

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

# In this Aztec image version, cli-wallet computes max fees from current min fees
# using a fixed padding constant. During bootstrap that can be too low and cause
# "maxFeesPerGas.feePerL2Gas ... must be >= gasFees.feePerL2Gas" failures.
# Patch the runtime constant to provide enough headroom for local-network spikes.
fix_wallet_fee_padding() {
  fee_file="/usr/src/yarn-project/cli-wallet/dest/utils/constants.js"
  if [ ! -f "$fee_file" ]; then
    log "WARN: cli-wallet fee constants file not found at ${fee_file}"
    return
  fi

  if ! grep -q 'export const MIN_FEE_PADDING' "$fee_file"; then
    log "WARN: MIN_FEE_PADDING constant not found in cli-wallet constants"
    return
  fi

  sed -i -E "s/export const MIN_FEE_PADDING = [0-9.]+;/export const MIN_FEE_PADDING = ${WALLET_MIN_FEE_PADDING};/" "$fee_file"
  log "Set cli-wallet MIN_FEE_PADDING=${WALLET_MIN_FEE_PADDING}"
}

# Post-process a compiled artifact in place: strip the __aztec_nr_internals__
# prefix the #[aztec] macro adds to function names (public_dispatch + the SDK
# look functions up by their EXTERNAL names) and stamp aztec_version when a raw
# `nargo compile` omitted it. Uses node: the release image is a minimal
# ubuntu:noble with nodejs only (no python3), and node is also on every host.
fix_artifact() { # fix_artifact <json_file> <aztec_version>
  node -e '
    const fs = require("fs");
    const [file, version] = process.argv.slice(1);
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const fn of d.functions ?? []) fn.name = fn.name.replace(/^__aztec_nr_internals__/, "");
    if (!d.aztec_version) d.aztec_version = version;
    fs.writeFileSync(file, JSON.stringify(d));
    console.log(`Patched functions + aztec_version in ${file}`);
  ' "$1" "$2"
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
    artifact_dir="${ROOT_DIR}/contracts/${c}/target"
    cd "${ROOT_DIR}/contracts/${c}"

    if artifact_is_fresh "${ROOT_DIR}/contracts/${c}/src" "${artifact_dir}"; then
      log "Skipping ${c} (sources unchanged; artifact up to date)"
      continue
    fi

    log "Compiling contract: ${c}"

    # Step 1: compile Noir to ACIR.
    # Prefer Aztec wrapper commands; fall back to raw nargo only if wrapper is unavailable.
    if $AZTEC_BIN help compile >/dev/null 2>&1; then
      $AZTEC_BIN compile 2>&1 || die "Could not compile ${c} with aztec compile"
    elif [ -n "$AZTEC_NARGO_BIN" ]; then
      "$AZTEC_NARGO_BIN" compile --silence-warnings 2>&1 || die "Could not compile ${c} with aztec-nargo"
    else
      $NARGO_BIN compile --silence-warnings 2>&1 || die "Could not compile ${c} with nargo fallback"
    fi

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
      fix_artifact "${json_file}" "${AZTEC_VERSION}" 2>&1
    done

    log "Compiled and transpiled ${c} successfully"
  done
  cd "${ROOT_DIR}"
}

# -- 2a. Compile vendored aztec-standards --------------------------------------
# The standards are a separate Nargo workspace; compiling a member writes its
# artifact to the workspace-level target dir (contracts/vendor/aztec-standards/
# target/<name>-<Contract>.json). We compile the Phase-1 subset, then run the
# same AVM-transpile + VK + prefix-strip steps the custom contracts get.
compile_standards() {
  std_target="${STANDARDS_DIR}/target"

  # The vendored standards never change between runs; skip the whole ~44s
  # compile+transpile when their sources are untouched.
  if artifact_is_fresh "${STANDARDS_DIR}/src" "${std_target}"; then
    log "Skipping vendored standards (sources unchanged; artifacts up to date)"
    return
  fi

  for c in $STANDARD_CONTRACTS; do
    log "Compiling standard contract: ${c}"
    cd "${STANDARDS_DIR}/src/${c}"
    # nargo ACIR compile (bb aztec_process below adds AVM transpile + VKs, so the
    # raw-nargo caveat about missing transpilation does not apply here).
    if [ -n "$AZTEC_NARGO_BIN" ]; then
      "$AZTEC_NARGO_BIN" compile --silence-warnings 2>&1 || die "Could not compile standard ${c}"
    else
      $NARGO_BIN compile --silence-warnings 2>&1 || die "Could not compile standard ${c} (nargo)"
    fi
  done

  if [ ! -d "$std_target" ] || [ -z "$(ls "$std_target"/*.json 2>/dev/null)" ]; then
    die "No standard artifacts found in ${std_target}"
  fi

  log "Transpiling standards (AVM + VKs)..."
  $BB_BIN aztec_process -i "${std_target}" 2>&1 | grep -E "Transpil|complete|Error" || die "AVM transpilation failed for standards"

  # Raw 'nargo compile' omits the aztec_version field that 'aztec compile' adds.
  # The generated TS artifact casts the JSON to NoirCompiledContract, which
  # requires aztec_version — fix_artifact injects it (pinned toolchain) so
  # codegen output type-checks (matches the custom contracts' value).
  for json_file in "${std_target}"/*.json; do
    fix_artifact "${json_file}" "${AZTEC_VERSION}" 2>&1
  done
  log "Compiled and transpiled standards successfully"
  cd "${ROOT_DIR}"
}

# -- 2b. Generate TypeScript contract wrappers ---------------------------------

generate_typescript() {
  artifacts_dir="${ROOT_DIR}/frontend/src/artifacts"
  mkdir -p "${artifacts_dir}"

  for c in $CONTRACTS; do
    target_dir="${ROOT_DIR}/contracts/${c}/target"
    log "Generating TypeScript for ${c}..."
    $AZTEC_BIN codegen "${target_dir}" --outdir "${artifacts_dir}" 2>&1 || die "TypeScript codegen failed for ${c}"
  done

  # Copy raw JSON artifacts too (for loadContractArtifact usage).
  for c in $CONTRACTS; do
    target_dir="${ROOT_DIR}/contracts/${c}/target"
    cp "${target_dir}"/*.json "${artifacts_dir}/" 2>/dev/null || die "Failed to copy artifacts for ${c}"
  done

  # Standards: codegen + copy from the vendored workspace target dir.
  std_target="${STANDARDS_DIR}/target"
  log "Generating TypeScript for vendored standards..."
  $AZTEC_BIN codegen "${std_target}" --outdir "${artifacts_dir}" 2>&1 || die "TypeScript codegen failed for standards"
  cp "${std_target}"/*.json "${artifacts_dir}/" 2>/dev/null || die "Failed to copy standard artifacts"

  log "TypeScript artifacts generated in ${artifacts_dir}"
}

# -- 3. Deploy contracts -------------------------------------------------------

deploy_contracts() {
  cd "${ROOT_DIR}"
  TMPDIR=/tmp/fs-bootstrap
  mkdir -p "$TMPDIR"

  log "Importing test accounts..."
  $AZTEC_WALLET_BIN import-test-accounts 2>&1 | tee "$TMPDIR/import.log" >&2 || die "Could not import test accounts"
  ADMIN_ADDR=$(grep -oP 'Address:\s+\K0x[0-9a-fA-F]+' "$TMPDIR/import.log" | sed -n '1p')
  TEST1_ADDR=$(grep -oP 'Address:\s+\K0x[0-9a-fA-F]+' "$TMPDIR/import.log" | sed -n '2p')
  TEST2_ADDR=$(grep -oP 'Address:\s+\K0x[0-9a-fA-F]+' "$TMPDIR/import.log" | sed -n '3p')
  require_value "test0 account address" "$ADMIN_ADDR"
  require_value "test1 account address" "$TEST1_ADDR"
  require_value "test2 account address" "$TEST2_ADDR"
  log "Accounts: test0=${ADMIN_ADDR} test1=${TEST1_ADDR} test2=${TEST2_ADDR}"

  # Deploy a contract; echoes full wallet output to stderr (visible in docker logs)
  # and returns the deployed address on stdout for capture via $().
  _deploy() {
    local label=$1 artifact=$2
    shift 2
    local attempt=1
    local output=""
    local rc=0
    local address=""
    while [ "$attempt" -le "$BOOTSTRAP_RETRY_ATTEMPTS" ]; do
      log "Deploying ${label} (attempt ${attempt}/${BOOTSTRAP_RETRY_ATTEMPTS})..."
      set +e
      # DEPLOY_INIT lets callers override the initializer name (e.g. the AIP-20
      # token uses constructor_with_minter instead of the default constructor).
      output=$($AZTEC_WALLET_BIN deploy \
        "${ROOT_DIR}/contracts/${artifact}" \
        --init "${DEPLOY_INIT:-constructor}" \
        --from accounts:test0 \
        "$@" \
        -a "${label}" 2>&1)
      rc=$?
      set -e
      printf '%s\n' "$output" >&2
      address=$(printf '%s\n' "$output" | grep -oP '(?i)contract\s+deployed\s+at\s+\K0x[0-9a-fA-F]+' | tail -1 || true)

      if [ "$rc" -eq 0 ] && [ -n "$address" ]; then
        printf '%s\n' "$address"
        return 0
      fi

      if [ "$attempt" -lt "$BOOTSTRAP_RETRY_ATTEMPTS" ] && is_retryable_wallet_error "$output"; then
        log "Retryable deploy error for ${label}; sleeping ${BOOTSTRAP_RETRY_DELAY_SECONDS}s"
        sleep "$BOOTSTRAP_RETRY_DELAY_SECONDS"
        attempt=$((attempt + 1))
        continue
      fi
      break
    done
    return 1
  }

  KYC_ADDR=$(_deploy "kyc_verifier" \
    "kyc_verifier/target/kyc_verifier-KYCVerifier.json" \
    --args accounts:test0)
  [ -z "$KYC_ADDR" ] && die "kyc_verifier deploy failed — no address in output"

  VAULT_ADDR=$(_deploy "defi_vault" \
    "defi_vault/target/defi_vault-DeFiVault.json" \
    --args accounts:test0 300)
  [ -z "$VAULT_ADDR" ] && die "defi_vault deploy failed — no address in output"

  # HousingFund must precede FSFT: FSFT's immutable AIP-20 minter is the fund.
  FUND_ADDR=$(_deploy "housing_fund" \
    "housing_fund/target/housing_fund-HousingFund.json" \
    --args accounts:test0)
  [ -z "$FUND_ADDR" ] && die "housing_fund deploy failed — no address in output"

  log "DEBUG: FUND_ADDR='${FUND_ADDR}' ADMIN_ADDR='${ADMIN_ADDR}'"

  # -- Deploy FSFT as AIP-20 token (minter = housing fund) ----------------------
  # constructor_with_minter(name: str<31>, symbol: str<31>, decimals: u8, minter).
  # The fund is FSFT's permanent minter; claim_distribution mints via mint_to_*.
  TOKEN_ADDR=$(DEPLOY_INIT=constructor_with_minter _deploy "fund_token" \
    "vendor/aztec-standards/target/token_contract-Token.json" \
    --args "Fair Squares FSFT" FSFT 0 "${FUND_ADDR}")
  [ -z "$TOKEN_ADDR" ] && die "fsft (AIP-20) deploy failed — no address in output"

  # Governance: all args are actual addresses/values (aliases not valid in --args)
  GOV_ADDR=$(_deploy "governance" \
    "governance/target/governance-Governance.json" \
    --args "${FUND_ADDR}" "${KYC_ADDR}" "${TOKEN_ADDR}" "${GOVERNANCE_VOTING_WINDOW_BLOCKS}" "${GOVERNANCE_MIN_QUORUM_VOTES}")
  [ -z "$GOV_ADDR" ] && die "governance deploy failed — no address in output"

  # -- Deploy Dripper faucet (must precede EUR: EUR's minter is the Dripper) -----
  DRIPPER_ADDR=$(_deploy "dripper" \
    "vendor/aztec-standards/target/dripper-Dripper.json")
  [ -z "$DRIPPER_ADDR" ] && die "dripper deploy failed — no address in output"

  # -- Deploy EUR as AIP-20 token (minter = Dripper) ----------------------------
  # constructor_with_minter(name: str<31>, symbol: str<31>, decimals: u8, minter).
  # decimals=0 keeps whole-unit EUR semantics matching the existing frontend
  # (raw balance == whole euros), so no display rework is needed in Phase 1.
  EUR_ADDR=$(DEPLOY_INIT=constructor_with_minter _deploy "eur_token" \
    "vendor/aztec-standards/target/token_contract-Token.json" \
    --args EURs EUR 0 "${DRIPPER_ADDR}")
  [ -z "$EUR_ADDR" ] && die "eur_token (AIP-20) deploy failed — no address in output"

  # -- Deploy PropertyNFT (AIP-721 real-estate deed; minter = housing fund) -----
  # The housing fund mints a deed (token_id = proposal_id + 1) when a proposal's
  # distribution opens. constructor_with_minter(name: str<31>, symbol, minter).
  PROPERTY_NFT_ADDR=$(DEPLOY_INIT=constructor_with_minter _deploy "property_nft" \
    "vendor/aztec-standards/target/nft_contract-NFT.json" \
    --args "Fair Squares Property" FSP-RE "${FUND_ADDR}")
  [ -z "$PROPERTY_NFT_ADDR" ] && die "property_nft (AIP-721) deploy failed — no address in output"

  DEX_ADDR=$(_deploy "fsft_dex" \
    "fsft_dex/target/fsft_dex-FSFTDex.json" \
    --args accounts:test0 "${KYC_ADDR}" "${FUND_ADDR}" "${TOKEN_ADDR}" "${EUR_ADDR}" "${DEX_PRICE_BAND_BPS}" "${DEX_MAX_TTL_BLOCKS}")
  [ -z "$DEX_ADDR" ] && die "fsft_dex deploy failed — no address in output"

  # ProtocolRewards must precede ProtocolToken: the token's immutable minter is
  # this rewards contract. New constructor drops protocol_token (wired below via
  # set_protocol_token): (admin, fsft_token, housing_fund, governance, kyc, claim_min).
  REWARDS_ADDR=$(_deploy "protocol_rewards" \
    "protocol_rewards/target/protocol_rewards-ProtocolRewards.json" \
    --args accounts:test0 "${TOKEN_ADDR}" "${FUND_ADDR}" "${GOV_ADDR}" "${KYC_ADDR}" "${PROTOCOL_REWARDS_CLAIM_MIN}")
  [ -z "$REWARDS_ADDR" ] && die "protocol_rewards deploy failed — no address in output"

  # -- Deploy ProtocolToken as AIP-20 token (minter = protocol_rewards) ---------
  PROTOCOL_TOKEN_ADDR=$(DEPLOY_INIT=constructor_with_minter _deploy "protocol_token" \
    "vendor/aztec-standards/target/token_contract-Token.json" \
    --args "Fair Squares Protocol" FSP 0 "${REWARDS_ADDR}")
  [ -z "$PROTOCOL_TOKEN_ADDR" ] && die "protocol_token deploy failed — no address in output"

  log "Deployed addresses:"
  log "  KYCVerifier:  ${KYC_ADDR}"
  log "  FSFT (AIP-20):${TOKEN_ADDR}"
  log "  DeFiVault:    ${VAULT_ADDR}"
  log "  HousingFund:  ${FUND_ADDR}"
  log "  Governance:   ${GOV_ADDR}"
  log "  FSFTDex:      ${DEX_ADDR}"
  log "  EurToken:     ${EUR_ADDR}"
  log "  ProtocolToken:${PROTOCOL_TOKEN_ADDR}"
  log "  Rewards:      ${REWARDS_ADDR}"

  export KYC_ADDR TOKEN_ADDR VAULT_ADDR FUND_ADDR GOV_ADDR DEX_ADDR ADMIN_ADDR EUR_ADDR DRIPPER_ADDR PROPERTY_NFT_ADDR PROTOCOL_TOKEN_ADDR REWARDS_ADDR TEST1_ADDR TEST2_ADDR
}

# -- 4. Wire contracts together ------------------------------------------------

wire_contracts() {
  # aztec-wallet send: no --artifact flag; wallet resolves ABI from deployed
  # contract DB (populated during deploy via -a alias).
  log "Wiring HousingFund.set_contracts(kyc, token, vault, gov)..."
  wallet_send_with_retries required "HousingFund.set_contracts" \
    $AZTEC_WALLET_BIN send set_contracts \
    --from accounts:test0 \
    --contract-address "${FUND_ADDR}" \
    --args "${KYC_ADDR}" "${TOKEN_ADDR}" "${VAULT_ADDR}" "${GOV_ADDR}"

  log "Wiring HousingFund.set_property_nft(property_nft)..."
  wallet_send_with_retries required "HousingFund.set_property_nft" \
    $AZTEC_WALLET_BIN send set_property_nft \
    --from accounts:test0 \
    --contract-address "${FUND_ADDR}" \
    --args "${PROPERTY_NFT_ADDR}"

  # Wire the EUR stablecoin the fund pays rent yield from (its own public
  # balance). REQUIRED before any rent can be claimed -- without it
  # HousingFund.eur_token stays zero and claim_rent_private / reinvest_rent_private
  # revert "eur token mismatch" (surfaced by scripts/e2e/rent-claim.e2e.ts).
  log "Wiring HousingFund.set_eur_token(eur_token)..."
  wallet_send_with_retries required "HousingFund.set_eur_token" \
    $AZTEC_WALLET_BIN send set_eur_token \
    --from accounts:test0 \
    --contract-address "${FUND_ADDR}" \
    --args "${EUR_ADDR}"

  log "Wiring DeFiVault.set_housing_fund(housing_fund)..."
  wallet_send_with_retries required "DeFiVault.set_housing_fund" \
    $AZTEC_WALLET_BIN send set_housing_fund \
    --from accounts:test0 \
    --contract-address "${VAULT_ADDR}" \
    --args "${FUND_ADDR}"

  # FSFT and ProtocolToken minters are now IMMUTABLE (set at their
  # constructor_with_minter deploy to HousingFund / ProtocolRewards) -- no
  # set_admin handoff exists on the vendored AIP-20 Token. We only wire the
  # rewards->protocol_token link, which had to be deferred because the token's
  # minter (this rewards contract) must exist before the token is deployed.
  log "Wiring ProtocolRewards.set_protocol_token(protocol_token)..."
  wallet_send_with_retries required "ProtocolRewards.set_protocol_token" \
    $AZTEC_WALLET_BIN send set_protocol_token \
    --from accounts:test0 \
    --contract-address "${REWARDS_ADDR}" \
    --args "${PROTOCOL_TOKEN_ADDR}"

  # Seed KYC roles for local demo accounts so HousingFund.deposit passes its
  # investor-role gate checks.
  log "Registering KYC investor roles for test accounts..."
  wallet_send_with_retries required "KYCVerifier.register_kyc(test0)" \
    $AZTEC_WALLET_BIN send register_kyc \
    --from accounts:test0 \
    --contract-address "${KYC_ADDR}" \
    --args "${ADMIN_ADDR}"

  if [ -n "${TEST1_ADDR:-}" ]; then
    wallet_send_with_retries required "KYCVerifier.register_kyc(test1)" \
      $AZTEC_WALLET_BIN send register_kyc \
      --from accounts:test0 \
      --contract-address "${KYC_ADDR}" \
      --args "${TEST1_ADDR}"
  fi

  if [ -n "${TEST2_ADDR:-}" ]; then
    wallet_send_with_retries required "KYCVerifier.register_kyc(test2)" \
      $AZTEC_WALLET_BIN send register_kyc \
      --from accounts:test0 \
      --contract-address "${KYC_ADDR}" \
      --args "${TEST2_ADDR}"
  fi

  # -- V2: issue private KYC credential notes (delivered to each user's PXE) ----
  # Verifier-only call. Nonce is deterministic per test account so revocation
  # tooling can recompute commitments via KYCVerifier.compute_revocation_commitment.
  log "Issuing private KYC credentials..."
  wallet_send_with_retries required "KYCVerifier.issue_credential(test0)" \
    $AZTEC_WALLET_BIN send issue_credential \
    --from accounts:test0 \
    --contract-address "${KYC_ADDR}" \
    --args "${ADMIN_ADDR}" 1

  if [ -n "${TEST1_ADDR:-}" ]; then
    wallet_send_with_retries required "KYCVerifier.issue_credential(test1)" \
      $AZTEC_WALLET_BIN send issue_credential \
      --from accounts:test0 \
      --contract-address "${KYC_ADDR}" \
      --args "${TEST1_ADDR}" 2
  fi

  if [ -n "${TEST2_ADDR:-}" ]; then
    wallet_send_with_retries required "KYCVerifier.issue_credential(test2)" \
      $AZTEC_WALLET_BIN send issue_credential \
      --from accounts:test0 \
      --contract-address "${KYC_ADDR}" \
      --args "${TEST2_ADDR}" 3
  fi

  # -- Mint EUR to all test accounts via the Dripper (AIP-20) -------------------
  # drip_to_public(token_address, amount) mints `amount` to the CALLER's public
  # balance, so we send from each account to fund that account. The Dripper is
  # EUR's minter, so these are the only way to create EUR.
  log "Dripping EUR to test accounts..."
  log "  drip test0 -> ${ADMIN_ADDR} amount=600000"
  # test0 gets 600 000 EUR (will deposit 500 000, keeps 100 000 for demo)
  wallet_send_with_retries required "Dripper.drip_to_public(test0,600000)" \
    $AZTEC_WALLET_BIN send drip_to_public \
    --from accounts:test0 \
    --contract-address "${DRIPPER_ADDR}" \
    --args "${EUR_ADDR}" 600000

  # test1 gets 50 000 EUR
  if [ -n "${TEST1_ADDR:-}" ]; then
    log "  drip test1 -> ${TEST1_ADDR} amount=50000"
    wallet_send_with_retries required "Dripper.drip_to_public(test1,50000)" \
      $AZTEC_WALLET_BIN send drip_to_public \
      --from accounts:test1 \
      --contract-address "${DRIPPER_ADDR}" \
      --args "${EUR_ADDR}" 50000
  fi

  # test2 gets 50 000 EUR
  if [ -n "${TEST2_ADDR:-}" ]; then
    log "  drip test2 -> ${TEST2_ADDR} amount=50000"
    wallet_send_with_retries required "Dripper.drip_to_public(test2,50000)" \
      $AZTEC_WALLET_BIN send drip_to_public \
      --from accounts:test2 \
      --contract-address "${DRIPPER_ADDR}" \
      --args "${EUR_ADDR}" 50000
  fi

  # -- Initial housing fund deposit from test0 (500 000 EUR) -------------------
  # Transfer EUR to housing fund (test0 → housing_fund) via AIP-20.
  # transfer_public_to_public(from, to, amount, _nonce); from == caller (test0)
  # so it is self-authorized and _nonce = 0 (no authwit needed).
  log "Transferring 500000 EUR from test0 to housing fund..."
  wallet_send_with_retries required "EUR.transfer_public_to_public(test0->housing_fund)" \
    $AZTEC_WALLET_BIN send transfer_public_to_public \
    --from accounts:test0 \
    --contract-address "${EUR_ADDR}" \
    --args "${ADMIN_ADDR}" "${FUND_ADDR}" 500000 0

  # Then record the deposit as a V2 private DepositNote in test0's PXE.
  # aztec-wallet CLI cannot pass HintedNote<KycCredentialNote> args, so
  # this step uses the TS SDK helper which fetches the KYC credential
  # hint from PXE and threads it into HousingFund.deposit_private.
  # NOTE: this is best-effort and NON-fatal. A fresh EmbeddedWallet PXE
  # created here syncs from genesis and, when registering a contract whose
  # on-chain anchor is an early block, can hit "Block hash not found when
  # querying world state" because the local-network EpochTestSettler reorgs
  # early blocks out of the node's pruned world state. The public EUR
  # transfer above already credited the housing fund; the private DepositNote
  # is a demo nicety, so a failure here must NOT block frontend startup.
  # Override with FS_SEED_V2_REQUIRED=1 to make it fatal again.
  log "Recording initial deposit (V2 private path)..."
  if (
    cd "${ROOT_DIR}/scripts" && \
    AZTEC_NODE_URL="${AZTEC_NODE_URL}" \
    NEXT_PUBLIC_KYC_VERIFIER_ADDRESS="${KYC_ADDR}" \
    NEXT_PUBLIC_HOUSING_FUND_ADDRESS="${FUND_ADDR}" \
    SEED_AMOUNT=500000 \
    npx tsx seed-v2-deposit.ts
  ); then
    log "Initial housing fund balance: 500 000 EUR (V2 private deposit by test0)"
  elif [ "${FS_SEED_V2_REQUIRED:-0}" = "1" ]; then
    die "V2 seed deposit failed (FS_SEED_V2_REQUIRED=1)"
  else
    log "WARN: V2 private seed deposit failed (non-fatal). The 500 000 EUR"
    log "      public transfer to the housing fund still succeeded; only the"
    log "      private DepositNote pre-seed was skipped. Continuing bootstrap."
  fi
}

# -- 5. Extract addresses and write env files ----------------------------------

save_addresses() {
  log "Extracting deployed contract addresses..."

  # Addresses are captured during deploy_contracts and exported.
  require_value "ADMIN_ADDR" "${ADMIN_ADDR:-}"
  require_value "TEST1_ADDR" "${TEST1_ADDR:-}"
  require_value "TEST2_ADDR" "${TEST2_ADDR:-}"
  require_value "KYC_ADDR" "${KYC_ADDR:-}"
  require_value "TOKEN_ADDR" "${TOKEN_ADDR:-}"
  require_value "VAULT_ADDR" "${VAULT_ADDR:-}"
  require_value "FUND_ADDR" "${FUND_ADDR:-}"
  require_value "GOV_ADDR" "${GOV_ADDR:-}"
  require_value "DEX_ADDR" "${DEX_ADDR:-}"
  require_value "EUR_ADDR" "${EUR_ADDR:-}"
  require_value "DRIPPER_ADDR" "${DRIPPER_ADDR:-}"
  require_value "PROPERTY_NFT_ADDR" "${PROPERTY_NFT_ADDR:-}"
  require_value "PROTOCOL_TOKEN_ADDR" "${PROTOCOL_TOKEN_ADDR:-}"
  require_value "REWARDS_ADDR" "${REWARDS_ADDR:-}"

  admin_addr="${ADMIN_ADDR}"
  test1_addr="${TEST1_ADDR}"
  test2_addr="${TEST2_ADDR}"
  kyc_addr="${KYC_ADDR}"
  token_addr="${TOKEN_ADDR}"
  vault_addr="${VAULT_ADDR}"
  fund_addr="${FUND_ADDR}"
  gov_addr="${GOV_ADDR}"
  dex_addr="${DEX_ADDR}"
  eur_addr="${EUR_ADDR}"
  dripper_addr="${DRIPPER_ADDR}"
  property_nft_addr="${PROPERTY_NFT_ADDR}"
  protocol_token_addr="${PROTOCOL_TOKEN_ADDR}"
  rewards_addr="${REWARDS_ADDR}"

  env_content="# Auto-generated by bootstrap-local-network.sh
# $(date -u +%Y-%m-%dT%H:%M:%SZ)

NEXT_PUBLIC_AZTEC_PXE_URL=http://aztec:8080
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_SIMULATION=false
# AZTEC_LIVE=true enables real contract calls (local Docker only)
# Vercel deployments should set AZTEC_LIVE=false
AZTEC_LIVE=true
GOVERNANCE_VOTING_WINDOW_BLOCKS=${GOVERNANCE_VOTING_WINDOW_BLOCKS}
GOVERNANCE_MIN_QUORUM_VOTES=${GOVERNANCE_MIN_QUORUM_VOTES}
DEX_PRICE_BAND_BPS=${DEX_PRICE_BAND_BPS}
DEX_MAX_TTL_BLOCKS=${DEX_MAX_TTL_BLOCKS}
PROTOCOL_REWARDS_CLAIM_MIN=${PROTOCOL_REWARDS_CLAIM_MIN}

# Contract addresses
NEXT_PUBLIC_KYC_VERIFIER_ADDRESS=${kyc_addr}
NEXT_PUBLIC_FUND_TOKEN_ADDRESS=${token_addr}
NEXT_PUBLIC_DEFI_VAULT_ADDRESS=${vault_addr}
NEXT_PUBLIC_HOUSING_FUND_ADDRESS=${fund_addr}
NEXT_PUBLIC_GOVERNANCE_ADDRESS=${gov_addr}
NEXT_PUBLIC_FSFT_DEX_ADDRESS=${dex_addr}
NEXT_PUBLIC_EUR_TOKEN_ADDRESS=${eur_addr}
NEXT_PUBLIC_DRIPPER_ADDRESS=${dripper_addr}
NEXT_PUBLIC_PROPERTY_NFT_ADDRESS=${property_nft_addr}
NEXT_PUBLIC_PROTOCOL_TOKEN_ADDRESS=${protocol_token_addr}
NEXT_PUBLIC_PROTOCOL_REWARDS_ADDRESS=${rewards_addr}

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
  log "  FSFT (AIP-20):${token_addr} (minter: housing_fund)"
  log "  EurToken:     ${eur_addr} (EURs — AIP-20, minter: dripper)"
  log "  DeFiVault:    ${vault_addr}"
  log "  HousingFund:  ${fund_addr} (initial: 500 000 EUR)"
  log "  Governance:   ${gov_addr}"
  log "  FSFTDex:      ${dex_addr}"
  log "  ProtocolToken:${protocol_token_addr} (AIP-20, minter: protocol_rewards)"
  log "  Rewards:      ${rewards_addr}"
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
  compile_standards
  generate_typescript
  fix_inquirer
  fix_wallet_fee_padding
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
