#!/bin/bash
# Fair Squares -- Bootstrap: compile, deploy, and wire all Noir contracts.
#
# Runs inside the aztec-bootstrap Docker container with the same Aztec image
# that provides nargo, bb, the aztec CLI and the @aztec-labs/* SDK packages.
# Compiles run as a parallel pool (section 2); deploy + wiring + demo seed are
# ONE node process running scripts/local-deploy.ts against the image's own SDK
# packages (section 3) -- no per-tx aztec-wallet process, no npm install.
#
# Outputs:
#   /out/.env.contracts   -- env file consumed by the frontend container
#   /workspace/frontend/.env.local -- local copy (for non-Docker dev)

set -eu

# /workspace inside the aztec-bootstrap container; FS_BOOTSTRAP_ROOT lets the
# compile stage be exercised against a checkout on a host with the aztec CLI.
ROOT_DIR="${FS_BOOTSTRAP_ROOT:-/workspace}"
OUT_DIR="${OUT_DIR:-/out}"
AZTEC_NODE_URL="${AZTEC_NODE_URL:-http://aztec:8080}"
GOVERNANCE_VOTING_WINDOW_BLOCKS="${GOVERNANCE_VOTING_WINDOW_BLOCKS:-300}"
GOVERNANCE_MIN_QUORUM_VOTES="${GOVERNANCE_MIN_QUORUM_VOTES:-2}"
DEX_PRICE_BAND_BPS="${DEX_PRICE_BAND_BPS:-200}"
DEX_MAX_TTL_BLOCKS="${DEX_MAX_TTL_BLOCKS:-120}"
PROTOCOL_REWARDS_CLAIM_MIN="${PROTOCOL_REWARDS_CLAIM_MIN:-1}"
# Wallet tuning handed to scripts/local-deploy.ts (see its header): fee cap
# headroom for the local network's volatile min fees, and the tx status every
# deploy/send is awaited to before the next dependent one is sent. The ~26
# bootstrap txs are strictly serial, so mirror the upstream local-network setup
# and wait for the L1 checkpoint ("checkpointed"); with the AutomineSequencer
# that is published in the same build, well under a second per tx.
WALLET_MIN_FEE_PADDING="${WALLET_MIN_FEE_PADDING:-30}"
BOOTSTRAP_WAIT_FOR_STATUS="${BOOTSTRAP_WAIT_FOR_STATUS:-checkpointed}"

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
AZTEC_BIN="${AZTEC_BIN:-node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js}"
# The image's own @aztec-labs/* SDK packages (yarn workspace node_modules). The
# deploy step resolves its imports from here so the SDK is exactly the node's
# version; FS_DEPLOY_NODE_MODULES overrides it for host runs.
IMAGE_NODE_MODULES="/usr/src/yarn-project/node_modules"
# aztec-nargo: Aztec wrapper for Noir compile/test flows (preferred over raw nargo)
AZTEC_NARGO_BIN="$(command -v aztec-nargo 2>/dev/null || true)"
# nargo: Noir compiler. The v6 image (azteclabs/aztec, built from
# aztec-labs-eng/aztec-node) ships the pinned noir + bb binaries under
# /usr/src/labs-aztec-toolchain/bin; the pre-v6 aztecprotocol/aztec images
# kept them in the noir / barretenberg build dirs. Probe both layouts.
TOOLCHAIN_BIN="/usr/src/labs-aztec-toolchain/bin"
if [ -x "$TOOLCHAIN_BIN/nargo" ]; then
  NARGO_BIN="$TOOLCHAIN_BIN/nargo"
elif [ -x "/usr/src/noir/noir-repo/target/release/nargo" ]; then
  NARGO_BIN="/usr/src/noir/noir-repo/target/release/nargo"
else
  # Outside the image (FS_BOOTSTRAP_ROOT host runs): whatever nargo is on PATH.
  NARGO_BIN=$(command -v nargo 2>/dev/null || echo "")
fi
# The azteclabs/aztec:6.0.0 image as published today ships ONLY bb-avm +
# noir-execute under /usr/src/labs-aztec-toolchain/bin -- no nargo -- so the
# container cannot compile. In that case the artifacts must have been built on
# the HOST (`./scripts/compile-contracts.sh`, pinned by .aztec-version) and are
# only VERIFIED here (presence, freshness, aztec_version). Set
# FS_HOST_ARTIFACTS=1 to force this mode even when a nargo is found.
HOST_ARTIFACTS="${FS_HOST_ARTIFACTS:-0}"
if [ -z "$NARGO_BIN" ]; then
  HOST_ARTIFACTS=1
  echo "[bootstrap] no nargo in this image: expecting host-compiled artifacts (./scripts/compile-contracts.sh)" >&2
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
[ -z "$BB_BIN" ] && [ "$HOST_ARTIFACTS" != 1 ] && { log "FATAL: bb/bb-avm binary not found"; exit 1; }

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
[ -n "$BB_BIN" ] && export BB="$BB_BIN"

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
  # A raw `nargo compile` leftover (no AVM bytecode / VKs) is not deployable;
  # treat it as stale so the transpile step runs.
  grep -q '"transpiled":[[:space:]]*true' "$newest_artifact" || return 1
  return 0
}

require_value() {
  local label=$1
  local value=${2:-}
  [ -n "$value" ] || die "Missing required value: ${label}"
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

# -- 0. Host-compiled artifacts (HOST_ARTIFACTS=1) ----------------------------
# `aztec compile` on the host (6.x) already produces the final artifact
# (transpiled AVM bytecode + VKs, external function names, aztec_version), so
# there is nothing to post-process; every artifact must exist, be newer than its
# sources and carry the pinned aztec_version -- stale bytecode is never deployed.
_check_artifact() { # _check_artifact <label> <src_dir> <artifact.json>
  local label=$1 src_dir=$2 artifact=$3
  [ -f "$artifact" ] || die "Artifact missing for ${label}: ${artifact}
       Compile on the host first:  ./scripts/compile-contracts.sh"
  if [ -n "$(find "$src_dir" \( -name '*.nr' -o -name 'Nargo.toml' \) -newer "$artifact" 2>/dev/null | head -1)" ]; then
    die "Artifact for ${label} is OLDER than its sources: ${artifact}
       Re-run on the host:  ./scripts/compile-contracts.sh   (refusing to deploy stale bytecode)"
  fi
  local v
  v=$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write(d.transpiled ? (d.aztec_version||"") : "")' "$artifact" 2>/dev/null || true)
  [ "$v" = "$AZTEC_VERSION" ] || die "Artifact for ${label} is not a transpiled aztec ${AZTEC_VERSION} artifact (got '${v}'): ${artifact}
       Reinstall the pinned host toolchain (./scripts/ci/install-aztec.sh) and recompile."
  log "Artifact OK: ${label} (aztec ${v})"
}

require_artifacts() {
  # `ls -t`: a crate's target dir may also hold STAGED dependency artifacts
  # (scripts/aztec-test.sh copies e.g. housing_fund-KYCVerifier.json next to
  # housing_fund-HousingFund.json); the crate's own artifact is the newest.
  local c
  for c in $CONTRACTS; do
    _check_artifact "$c" "${ROOT_DIR}/contracts/${c}/src" \
      "$(ls -t "${ROOT_DIR}/contracts/${c}/target/${c}-"*.json 2>/dev/null | head -1)"
  done
  for c in $STANDARD_CONTRACTS; do
    _check_artifact "$c" "${STANDARDS_DIR}/src/${c}" \
      "$(ls -t "${STANDARDS_DIR}/target/${c}-"*.json 2>/dev/null | head -1)"
  done
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
# nargo is single-threaded (~45 s and ~0.45 GB RSS for housing_fund on the v6
# toolchain; the bb transpile + VK generation that follows adds ~1 s), so the
# nine contract compiles run as a bounded pool of background jobs, one per core
# by default (BOOTSTRAP_COMPILE_JOBS overrides). The FIRST compile that is
# actually needed runs in the foreground: it populates nargo's git-dependency
# cache (~/nargo/github.com/...), which concurrent first-time clones of the same
# dependency would race on. Each job logs to its own file, replayed on failure,
# so output never interleaves. Nothing downstream needs an artifact before
# `finish_compiles` has waited for the whole pool.
BOOTSTRAP_COMPILE_JOBS="${BOOTSTRAP_COMPILE_JOBS:-$(nproc 2>/dev/null || echo 2)}"
COMPILE_LOG_DIR=/tmp/fs-bootstrap/compile
JOB_PIDS=()
JOB_NAMES=()
JOB_STARTS=()
_dep_cache_warm=0
_standards_compiled=0

run_compile_job() { # run_compile_job <name> <function> [args...]
  local name=$1; shift
  mkdir -p "$COMPILE_LOG_DIR"
  if [ "$_dep_cache_warm" = 0 ]; then
    local t0=$SECONDS
    log "Compiling ${name} (foreground: warms the nargo dependency cache)..."
    if ! ( "$@" ) > "$COMPILE_LOG_DIR/${name}.log" 2>&1; then
      cat "$COMPILE_LOG_DIR/${name}.log" >&2
      die "${name} failed to compile"
    fi
    _dep_cache_warm=1
    log "Compiled ${name} in $((SECONDS - t0)) s"
    return 0
  fi
  while [ "$(jobs -rp | wc -l)" -ge "$BOOTSTRAP_COMPILE_JOBS" ]; do sleep 0.5; done
  log "Compiling ${name} (background, up to ${BOOTSTRAP_COMPILE_JOBS} jobs)..."
  ( "$@" ) > "$COMPILE_LOG_DIR/${name}.log" 2>&1 &
  JOB_PIDS+=("$!"); JOB_NAMES+=("$name"); JOB_STARTS+=("$SECONDS")
}

wait_compile_jobs() {
  local failed=0 i
  for i in "${!JOB_PIDS[@]}"; do
    if wait "${JOB_PIDS[$i]}"; then
      log "Compiled ${JOB_NAMES[$i]} ($((SECONDS - JOB_STARTS[i])) s after launch)"
    else
      log "${JOB_NAMES[$i]} FAILED -- its log:"
      cat "$COMPILE_LOG_DIR/${JOB_NAMES[$i]}.log" >&2
      failed=1
    fi
  done
  JOB_PIDS=(); JOB_NAMES=(); JOB_STARTS=()
  [ "$failed" = 0 ] || die "contract compilation failed (see the logs above)"
}

# One custom contract: compile + transpile + artifact fix-up. Runs in a subshell.
_compile_custom() { # _compile_custom <contract>
  local c=$1
  local artifact_dir="${ROOT_DIR}/contracts/${c}/target"
  cd "${ROOT_DIR}/contracts/${c}"

  # Step 1: compile Noir to ACIR.
  # Prefer `aztec compile` (nargo + bb aztec_process + aztec_version stamp in
  # one go; it honours the NARGO / BB env exported above); fall back to raw
  # nargo only if the wrapper is unavailable.
  local needs_transpile=0
  if $AZTEC_BIN help compile >/dev/null 2>&1; then
    $AZTEC_BIN compile 2>&1 || die "Could not compile ${c} with aztec compile"
  elif [ -n "$AZTEC_NARGO_BIN" ]; then
    "$AZTEC_NARGO_BIN" compile --silence-warnings 2>&1 || die "Could not compile ${c} with aztec-nargo"
    needs_transpile=1
  else
    $NARGO_BIN compile --silence-warnings 2>&1 || die "Could not compile ${c} with nargo fallback"
    needs_transpile=1
  fi

  # Verify artifact was produced
  if [ ! -d "$artifact_dir" ] || [ -z "$(ls "$artifact_dir"/*.json 2>/dev/null)" ]; then
    die "No compilation artifact found for ${c} in ${artifact_dir}"
  fi

  # Step 2 (raw-nargo fallback only): AVM transpilation + VK generation,
  # required for aztec-wallet deploy. `aztec compile` already did this, and on
  # v6 a second `bb aztec_process -i <dir>` over its (aztec_version-stamped)
  # output finds nothing to do, prints "No contract artifacts found" and exits
  # 1 -- which this guard used to turn into a fatal bootstrap error.
  # bb aztec_process needs an absolute path — relative paths don't resolve correctly
  if [ "$needs_transpile" = "1" ]; then
    log "Transpiling ${c} (AVM + VKs)..."
    $BB_BIN aztec_process -i "${artifact_dir}" 2>&1 | grep -E "Transpil|complete|Error" || die "AVM transpilation failed for ${c}"
  fi

  # Step 3: Strip __aztec_nr_internals__ prefix from function names.
  # The Aztec #[aztec] macro renames functions internally, but public_dispatch
  # uses the EXTERNAL names (no prefix). The SDK also looks up functions by
  # external name. This rename makes the artifact match what both expect.
  local json_file
  for json_file in "${artifact_dir}"/*.json; do
    fix_artifact "${json_file}" "${AZTEC_VERSION}" 2>&1
  done
  log "Compiled and transpiled ${c} successfully"
}

compile_contracts() {
  local c
  for c in $CONTRACTS; do
    if artifact_is_fresh "${ROOT_DIR}/contracts/${c}/src" "${ROOT_DIR}/contracts/${c}/target"; then
      log "Skipping ${c} (sources unchanged; artifact up to date)"
      continue
    fi
    # `aztec compile` has its own mtime-based skip that ignores --force, so a
    # forced rebuild has to drop the old artifacts first.
    [ "${FS_FORCE_COMPILE:-0}" = "1" ] && rm -rf "${ROOT_DIR}/contracts/${c}/target"
    run_compile_job "$c" _compile_custom "$c"
  done
}

# -- 2a. Compile vendored aztec-standards --------------------------------------
# The standards are a separate Nargo workspace; compiling a member writes its
# artifact to the workspace-level target dir (contracts/vendor/aztec-standards/
# target/<name>-<Contract>.json). We compile the Phase-1 subset (each member as
# a pool job), then `finish_compiles` runs the same AVM-transpile + VK +
# prefix-strip steps the custom contracts get over the shared target dir.
_compile_standard() { # _compile_standard <member>  (runs in a subshell)
  local c=$1
  cd "${STANDARDS_DIR}/src/${c}"
  # nargo ACIR compile (bb aztec_process in finish_compiles adds AVM transpile +
  # VKs, so the raw-nargo caveat about missing transpilation does not apply).
  if [ -n "$AZTEC_NARGO_BIN" ]; then
    "$AZTEC_NARGO_BIN" compile --silence-warnings 2>&1 || die "Could not compile standard ${c}"
  else
    $NARGO_BIN compile --silence-warnings 2>&1 || die "Could not compile standard ${c} (nargo)"
  fi
  log "Compiled standard ${c}"
}

compile_standards() {
  local std_target="${STANDARDS_DIR}/target"

  # The vendored standards never change between runs; skip the whole compile +
  # transpile when their sources are untouched.
  if artifact_is_fresh "${STANDARDS_DIR}/src" "${std_target}"; then
    log "Skipping vendored standards (sources unchanged; artifacts up to date)"
    return
  fi
  [ "${FS_FORCE_COMPILE:-0}" = "1" ] && rm -rf "${std_target}"

  local c
  for c in $STANDARD_CONTRACTS; do
    run_compile_job "standards-${c}" _compile_standard "$c"
  done
  _standards_compiled=1
}

# Waits for every compile job, then post-processes the standards workspace.
finish_compiles() {
  wait_compile_jobs
  [ "$_standards_compiled" = 1 ] || return 0

  local std_target="${STANDARDS_DIR}/target"
  if [ ! -d "$std_target" ] || [ -z "$(ls "$std_target"/*.json 2>/dev/null)" ]; then
    die "No standard artifacts found in ${std_target}"
  fi

  log "Transpiling standards (AVM + VKs)..."
  $BB_BIN aztec_process -i "${std_target}" 2>&1 | grep -E "Transpil|complete|Error" || die "AVM transpilation failed for standards"

  # Raw 'nargo compile' omits the aztec_version field that 'aztec compile' adds.
  # The generated TS artifact casts the JSON to NoirCompiledContract, which
  # requires aztec_version — fix_artifact injects it (pinned toolchain) so
  # codegen output type-checks (matches the custom contracts' value).
  local json_file
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

# -- 3. Deploy + wire + seed (one SDK process) --------------------------------
# scripts/local-deploy.ts does what ~26 separate `aztec-wallet` invocations
# used to do (each of those booted its own node process + PXE): one
# EmbeddedWallet deploys the 11 instances in minter order, wires the links,
# registers + credentials KYC for test0/1/2, drips EUR, moves test0's 500 000
# EUR into the fund and records it as a private DepositNote. ~60 s on a laptop.
#
# It runs on the image's Node (>= 22.6: TypeScript is type-stripped natively,
# no tsx) from a staging dir whose node_modules points at the image's own SDK
# packages, so no npm install happens in the container and the SDK can never
# drift from the node it talks to.

deploy_contracts() {
  local script="${ROOT_DIR}/scripts/local-deploy.ts"
  [ -f "$script" ] || die "missing ${script}"
  local stage=/tmp/fs-bootstrap/deploy
  rm -rf "$stage" && mkdir -p "$stage"
  cp "$script" "$stage/local-deploy.ts"
  printf '{ "type": "module" }\n' > "$stage/package.json"

  local modules="${FS_DEPLOY_NODE_MODULES:-}"
  if [ -z "$modules" ]; then
    if [ -d "$IMAGE_NODE_MODULES/@aztec-labs/aztec.js" ]; then
      modules="$IMAGE_NODE_MODULES"
    elif [ -d "${ROOT_DIR}/scripts/node_modules/@aztec-labs/aztec.js" ]; then
      modules="${ROOT_DIR}/scripts/node_modules"
    else
      die "no @aztec-labs SDK packages found (neither ${IMAGE_NODE_MODULES} nor scripts/node_modules); set FS_DEPLOY_NODE_MODULES"
    fi
  fi
  ln -s "$modules" "$stage/node_modules"
  log "Deploying, wiring and seeding via scripts/local-deploy.ts (SDK from ${modules})..."

  local out="$stage/out.json"
  (
    cd "$stage" && \
    FS_ROOT="${ROOT_DIR}" \
    FS_DEPLOY_OUT="$out" \
    AZTEC_NODE_URL="${AZTEC_NODE_URL}" \
    WALLET_MIN_FEE_PADDING="${WALLET_MIN_FEE_PADDING}" \
    BOOTSTRAP_WAIT_FOR_STATUS="${BOOTSTRAP_WAIT_FOR_STATUS}" \
    GOVERNANCE_VOTING_WINDOW_BLOCKS="${GOVERNANCE_VOTING_WINDOW_BLOCKS}" \
    GOVERNANCE_MIN_QUORUM_VOTES="${GOVERNANCE_MIN_QUORUM_VOTES}" \
    DEX_PRICE_BAND_BPS="${DEX_PRICE_BAND_BPS}" \
    DEX_MAX_TTL_BLOCKS="${DEX_MAX_TTL_BLOCKS}" \
    PROTOCOL_REWARDS_CLAIM_MIN="${PROTOCOL_REWARDS_CLAIM_MIN}" \
    node --no-warnings ./local-deploy.ts
  ) || die "local-deploy.ts failed (see its log above)"
  [ -s "$out" ] || die "local-deploy.ts produced no ${out}"

  # Export the addresses save_addresses() expects. Fails on any missing key.
  eval "$(node -e '
    const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const need = (obj, k) => { if (!obj[k]) { console.error("local-deploy output lacks " + k); process.exit(1); } return obj[k]; };
    const m = {
      ADMIN_ADDR: need(o.accounts, "test0"), TEST1_ADDR: need(o.accounts, "test1"), TEST2_ADDR: need(o.accounts, "test2"),
      KYC_ADDR: need(o.contracts, "kyc_verifier"), TOKEN_ADDR: need(o.contracts, "fund_token"),
      VAULT_ADDR: need(o.contracts, "defi_vault"), FUND_ADDR: need(o.contracts, "housing_fund"),
      GOV_ADDR: need(o.contracts, "governance"), DEX_ADDR: need(o.contracts, "fsft_dex"),
      EUR_ADDR: need(o.contracts, "eur_token"), DRIPPER_ADDR: need(o.contracts, "dripper"),
      PROPERTY_NFT_ADDR: need(o.contracts, "property_nft"), PROTOCOL_TOKEN_ADDR: need(o.contracts, "protocol_token"),
      REWARDS_ADDR: need(o.contracts, "protocol_rewards"),
    };
    for (const [k, v] of Object.entries(m)) { if (!/^0x[0-9a-fA-F]+$/.test(v)) { console.error(k + " is not an address: " + v); process.exit(1); } console.log(`export ${k}=${v}`); }
  ' "$out")" || die "could not read addresses from ${out}"
  log "Accounts: test0=${ADMIN_ADDR} test1=${TEST1_ADDR} test2=${TEST2_ADDR}"
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
  if [ "$HOST_ARTIFACTS" = 1 ]; then
    require_artifacts
  else
    compile_contracts
    compile_standards
    finish_compiles
  fi
  generate_typescript
  deploy_contracts
  save_addresses

  log "============================================"
  log "Bootstrap completed successfully"
  log "  Frontend:  http://localhost:3000"
  log "  Aztec PXE: ${AZTEC_NODE_URL}"
  log "============================================"
}

main
