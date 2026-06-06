#!/bin/bash
# Fair Squares -- aztec test runner (host CLI)
#
# Runs `aztec test` per contract using the host-installed aztec CLI
# (v4.3.0). The host CLI bundles its own TXE binary and orchestrates
# the oracle resolver automatically, so this script is intentionally
# tiny compared to the previous docker-based version.
#
# Prereq: host CLI must be installed. Install with:
#   VERSION=4.3.0 bash -i <(curl -sL https://install.aztec.network/4.3.0)
# That puts aztec / aztec-nargo / aztec-wallet / aztec-bb under
# $HOME/.aztec/current/bin and adds them to PATH via .bashrc.
#
# If you prefer the legacy docker flow, set FS_AZTEC_TEST_DOCKER=1
# and the original docker path is taken (kept for parity with CI
# images that can't install the host CLI).
#
# Usage:
#   ./scripts/aztec-test.sh                 # all 5 V2 contracts
#   ./scripts/aztec-test.sh kyc_verifier    # single contract
#
# Run time on warm cache: ~6 s per contract, ~30 s for the full suite.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

DEFAULT_CONTRACTS=(kyc_verifier housing_fund governance protocol_rewards fsft_dex)
if [ "$#" -gt 0 ]; then
  CONTRACTS=("$@")
else
  CONTRACTS=("${DEFAULT_CONTRACTS[@]}")
fi

# -- Cross-contract test staging ----------------------------------------------
# Some contracts' tests deploy a DEPENDENCY contract via `env.deploy(...)`, which
# resolves "<pkg>-<Contract>.json" from the package's OWN target dir. A
# single-contract `aztec test` only emits that package's own artifact, so we
# stage the dependency artifact (compiling the dep first if needed). `aztec test`
# preserves foreign files in target, so staging before it is safe. Extend the
# case as more cross-contract tests are added.
_stage_dep() { # _stage_dep <main_pkg> <dep_pkg> <ContractName> [dep_dir]
  local main="$1" dep="$2" contract="$3"
  # dep_dir defaults to contracts/<dep_pkg>, overridable for vendored crates
  # (e.g. the AIP-20 token lives under contracts/vendor/aztec-standards/src).
  local dep_dir="${4:-contracts/$dep}"
  local src="$ROOT_DIR/$dep_dir/target/${dep}-${contract}.json"
  local dst="$ROOT_DIR/contracts/$main/target/${main}-${contract}.json"
  if [ ! -f "$src" ]; then
    echo "[aztec-test] staging: compiling $dep (cross-contract dep of $main)..."
    ( cd "$ROOT_DIR/$dep_dir" && aztec compile >/dev/null 2>&1 ) || true
  fi
  if [ -f "$src" ]; then
    mkdir -p "$ROOT_DIR/contracts/$main/target" && cp "$src" "$dst"
    echo "[aztec-test] staged ${dep}-${contract}.json -> ${main}/target/${main}-${contract}.json"
  else
    echo "[aztec-test] WARN: could not stage $dep/$contract for $main (cross-contract test may fail)" >&2
  fi
}
stage_cross_contract_deps() {
  # The AIP-20 token is a member of the aztec-standards WORKSPACE, so its
  # artifact is emitted into the workspace-root target/, not the member dir.
  local tok_dir="contracts/vendor/aztec-standards"
  case "$1" in
    housing_fund)
      _stage_dep housing_fund kyc_verifier KYCVerifier
      # W1: the covenant-enforcement test deploys a real Governance so the fund
      # can sync a proposal's affordability covenant.
      _stage_dep housing_fund governance Governance
      ;;
    governance)       _stage_dep governance kyc_verifier KYCVerifier ;;
    protocol_rewards)
      _stage_dep protocol_rewards kyc_verifier KYCVerifier
      _stage_dep protocol_rewards token_contract Token "$tok_dir"
      ;;
    fsft_dex)
      _stage_dep fsft_dex kyc_verifier KYCVerifier
      _stage_dep fsft_dex housing_fund HousingFund
      ;;
  esac
}

# -- Docker fallback (legacy path, opt-in) -------------------------------------
if [ "${FS_AZTEC_TEST_DOCKER:-0}" = "1" ]; then
  cd "$ROOT_DIR"
  docker run --rm --entrypoint /bin/bash \
    -v aztec-nargo-cache:/root/nargo \
    -v "$ROOT_DIR:/workspace" \
    aztecprotocol/aztec:4.3.0 -lc "
      set -euo pipefail
      export PATH=/usr/src/noir/noir-repo/target/release:\$PATH
      echo '[aztec-test] (docker) launching TXE on :8080...'
      node --no-warnings /usr/src/yarn-project/txe/dest/bin/index.js > /tmp/txe.log 2>&1 &
      TXE_PID=\$!
      trap 'kill \$TXE_PID 2>/dev/null || true' EXIT
      for i in \$(seq 1 30); do
        sleep 1
        grep -q 'TXE listening' /tmp/txe.log 2>/dev/null && break
      done
      grep -q 'TXE listening' /tmp/txe.log || { echo '[aztec-test] TXE failed to start'; cat /tmp/txe.log; exit 1; }
      PASS=0; FAIL=0
      for c in $(printf ' %q' "${CONTRACTS[@]}"); do
        echo
        echo \"=== \$c ===\"
        cd /workspace/contracts/\$c
        rm -rf target
        node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js compile 2>&1 | tail -1
        if [ \"\$c\" = housing_fund ]; then
          cp /workspace/contracts/kyc_verifier/target/kyc_verifier-KYCVerifier.json /workspace/contracts/housing_fund/target/housing_fund-KYCVerifier.json 2>/dev/null \
            || echo '[aztec-test] WARN: KYCVerifier not staged (run the full suite so kyc_verifier compiles first)'
        fi
        if nargo test --oracle-resolver http://127.0.0.1:8080 --silence-warnings; then
          PASS=\$((PASS+1))
        else
          FAIL=\$((FAIL+1))
        fi
      done
      echo
      echo \"Summary (docker): \$PASS passed, \$FAIL failed (of $(echo "${CONTRACTS[@]}" | wc -w))\"
      test \"\$FAIL\" -eq 0
    "
  exit $?
fi

# -- Host CLI path (default) ---------------------------------------------------
export PATH="$HOME/.aztec/current/bin:$HOME/.aztec/bin:$PATH"

if ! command -v aztec >/dev/null 2>&1; then
  echo "[aztec-test] aztec CLI not on PATH. Install with:" >&2
  echo "  VERSION=4.3.0 bash -i <(curl -sL https://install.aztec.network/4.3.0)" >&2
  echo "Or run with FS_AZTEC_TEST_DOCKER=1 to use the legacy docker path." >&2
  exit 1
fi

PASS=0
FAIL=0
for c in "${CONTRACTS[@]}"; do
  echo
  echo "================================"
  echo "=== $c"
  echo "================================"
  cd "$ROOT_DIR/contracts/$c"
  # Compile the MAIN contract FIRST, before staging dependency artifacts. The
  # `aztec compile` / `aztec test` wrapper skips compilation when target/ already
  # holds a .json artifact newer than every source file (see needs_recompile in
  # the @aztec/aztec CLI). A staged dependency artifact looks exactly like that,
  # so staging before the first compile would make the wrapper skip building the
  # main contract -> TXE then can't find "<pkg>-<Contract>.json". Compile first,
  # then stage deps, then `aztec test` reuses the fresh (transpiled) artifact.
  aztec compile
  stage_cross_contract_deps "$c"
  if aztec test; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
done

echo
echo "========================================="
echo "Summary: $PASS passed, $FAIL failed (of ${#CONTRACTS[@]})"
test "$FAIL" -eq 0
