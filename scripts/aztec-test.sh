#!/bin/bash
# Fair Squares -- aztec test runner
#
# Compiles each contract with the full aztec transpile pipeline (needed
# for TXE to load the public bytecode), launches TXE inside the pinned
# v4.3.0 Docker image, then runs nargo test --oracle-resolver against it.
#
# Usage:
#   ./scripts/aztec-test.sh              # all V2 contracts (default)
#   ./scripts/aztec-test.sh kyc_verifier # single contract
#
# Notes:
#   - Tests need the full aztec compile output (transpile + VK), not just
#     nargo compile. TXE rejects the artifact with "public bytecode has
#     not been transpiled" otherwise.
#   - TXE listens on port 8080 inside the container; we use an isolated
#     docker network so it does not collide with a local PXE.
#   - Run time is ~12-15 s per contract (cold compile included).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

DEFAULT_CONTRACTS=(kyc_verifier housing_fund governance protocol_rewards fsft_dex)
if [ "$#" -gt 0 ]; then
  CONTRACTS=("$@")
else
  CONTRACTS=("${DEFAULT_CONTRACTS[@]}")
fi

cd "$ROOT_DIR"

docker run --rm --entrypoint /bin/bash \
  -v aztec-nargo-cache:/root/nargo \
  -v "$ROOT_DIR:/workspace" \
  aztecprotocol/aztec:4.3.0 -lc "
    set -euo pipefail
    export PATH=/usr/src/noir/noir-repo/target/release:\$PATH
    echo '[aztec-test] launching TXE on :8080...'
    node --no-warnings /usr/src/yarn-project/txe/dest/bin/index.js > /tmp/txe.log 2>&1 &
    TXE_PID=\$!
    trap 'kill \$TXE_PID 2>/dev/null || true' EXIT
    for i in \$(seq 1 30); do
      sleep 1
      grep -q 'TXE listening' /tmp/txe.log 2>/dev/null && break
    done
    grep -q 'TXE listening' /tmp/txe.log || { echo '[aztec-test] TXE failed to start'; cat /tmp/txe.log; exit 1; }
    echo '[aztec-test] TXE ready.'
    PASS=0; FAIL=0
    for c in $(printf ' %q' "${CONTRACTS[@]}"); do
      echo
      echo \"================================\"
      echo \"=== \$c\"
      echo \"================================\"
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
    echo \"=========================================\"
    echo \"Summary: \$PASS passed, \$FAIL failed (of $(echo "${CONTRACTS[@]}" | wc -w))\"
    test \"\$FAIL\" -eq 0
  "
