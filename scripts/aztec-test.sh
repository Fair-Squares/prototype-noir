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
