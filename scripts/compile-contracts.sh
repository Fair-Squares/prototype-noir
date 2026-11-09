#!/bin/bash
# Fair Squares -- compile every contract with the HOST aztec toolchain (v6).
#
# Since aztec v6 the release docker image (azteclabs/aztec) is a pure runtime
# (node + anvil + aztec-wallet): it no longer ships nargo / bb, so contracts
# cannot be compiled inside the `aztec-bootstrap` container any more. Run this
# on the host BEFORE `docker compose --profile aztec up`; the bootstrap
# container then only runs codegen + deploy + wire against the bind-mounted
# artifacts (it dies with a pointer here if an artifact is missing).
#
# `aztec compile` (6.x) already emits a fully transpiled artifact (AVM bytecode
# + VKs, `transpiled: true`, `aztec_version`) with external function names, so
# the old bb aztec_process / name-strip post-processing is gone.
#
# Usage:
#   ./scripts/compile-contracts.sh            # all (vendored standards first)
#   ./scripts/compile-contracts.sh housing_fund governance   # a subset
#   FS_FORCE_COMPILE=1 ./scripts/compile-contracts.sh        # ignore freshness
#
# Prereq: host toolchain pinned in CLAUDE.md
#   VERSION=6.0.0 bash -i <(curl -sL https://install.aztec.network/6.0.0)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXPECTED_VERSION="${FS_AZTEC_VERSION:-6.0.0}"
export PATH="$HOME/.aztec/current/bin:$HOME/.aztec/bin:$PATH"

if ! command -v aztec >/dev/null 2>&1; then
  echo "[compile] aztec CLI not on PATH. Install with:" >&2
  echo "  VERSION=${EXPECTED_VERSION} bash -i <(curl -sL https://install.aztec.network/${EXPECTED_VERSION})" >&2
  exit 1
fi
ACTUAL_VERSION="$(aztec --version 2>/dev/null | tail -1 | tr -d '[:space:]')"
if [ "$ACTUAL_VERSION" != "$EXPECTED_VERSION" ]; then
  echo "[compile] aztec --version is '${ACTUAL_VERSION}', expected '${EXPECTED_VERSION}'." >&2
  echo "  aztec-up install ${EXPECTED_VERSION} && aztec-up use ${EXPECTED_VERSION}   (or set FS_AZTEC_VERSION)" >&2
  exit 1
fi

# Vendored aztec-standards members compile into the WORKSPACE target dir
# (contracts/vendor/aztec-standards/target/<crate>-<Contract>.json).
STANDARD_CRATES=(token_contract nft_contract dripper)
# Custom contracts, in dependency order (housing_fund needs governance + kyc_verifier,
# fsft_dex / protocol_rewards need housing_fund).
CUSTOM_CRATES=(kyc_verifier defi_vault governance housing_fund fsft_dex protocol_rewards)

if [ "$#" -gt 0 ]; then
  SELECTED=("$@")
else
  SELECTED=("${STANDARD_CRATES[@]}" "${CUSTOM_CRATES[@]}")
fi

# Skip when the artifact is newer than every source (*.nr / Nargo.toml).
artifact_is_fresh() {
  local src_dir=$1 artifact=$2
  [ "${FS_FORCE_COMPILE:-0}" = "1" ] && return 1
  [ -f "$artifact" ] || return 1
  [ -z "$(find "$src_dir" \( -name '*.nr' -o -name 'Nargo.toml' \) -newer "$artifact" 2>/dev/null | head -1)" ]
}

PASS=0; FAIL=0; SKIP=0
STANDARDS_DIR="$ROOT_DIR/contracts/vendor/aztec-standards"
standards_done=0
for c in "${SELECTED[@]}"; do
  case " ${STANDARD_CRATES[*]} " in
    *" $c "*)
      # The vendored standards are a Nargo WORKSPACE. `aztec compile` must run
      # from the workspace ROOT with --workspace: run from a member dir, nargo
      # still writes the artifact to the workspace-level target/, but the CLI's
      # post-processing (AVM transpile + VKs + external function names +
      # aztec_version) looks in the member's ./target and silently skips it --
      # leaving a RAW artifact that deploys broken bytecode. One root compile
      # covers all members, so later standard crates in the list are no-ops.
      [ "$standards_done" = 1 ] && continue
      standards_done=1
      stale=0
      for sc in "${STANDARD_CRATES[@]}"; do
        existing=$(ls "$STANDARDS_DIR/target/${sc}-"*.json 2>/dev/null | head -1 || true)
        if [ -z "$existing" ] || ! artifact_is_fresh "$STANDARDS_DIR/src/$sc" "$existing"; then stale=1; fi
        # A raw (non-transpiled) artifact must also be rebuilt.
        if [ -n "$existing" ] && ! python3 -c "import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get('transpiled') else 1)" "$existing"; then stale=1; fi
      done
      if [ "$stale" = 0 ]; then
        echo "[compile] vendored standards (${STANDARD_CRATES[*]}): up to date"; SKIP=$((SKIP+1)); continue
      fi
      echo; echo "[compile] === vendored standards workspace (${STANDARD_CRATES[*]})"
      if ( cd "$STANDARDS_DIR" && aztec compile --workspace ); then PASS=$((PASS+1)); else echo "[compile] vendored standards FAILED" >&2; FAIL=$((FAIL+1)); fi
      continue ;;
    *)        dir="$ROOT_DIR/contracts/$c"
              artifact_glob="$ROOT_DIR/contracts/$c/target/${c}-*.json" ;;
  esac
  # shellcheck disable=SC2086
  existing=$(ls -t $artifact_glob 2>/dev/null | head -1 || true)
  if [ -n "$existing" ] && artifact_is_fresh "$dir" "$existing"; then
    echo "[compile] $c: up to date ($(basename "$existing"))"; SKIP=$((SKIP+1)); continue
  fi
  echo; echo "[compile] === $c"
  if ( cd "$dir" && aztec compile ); then
    PASS=$((PASS+1))
  else
    echo "[compile] $c FAILED" >&2; FAIL=$((FAIL+1))
  fi
done

echo
echo "[compile] done: $PASS compiled, $SKIP up to date, $FAIL failed"
test "$FAIL" -eq 0
