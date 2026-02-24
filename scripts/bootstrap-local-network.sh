#!/bin/sh
set -eu

ROOT_DIR="/workspace"
AZTEC_PXE_URL="${AZTEC_PXE_URL:-http://aztec-sandbox:8080}"
AZTEC_CLI_VERSION="${AZTEC_CLI_VERSION:-4.0.0-devnet.2-patch.1}"

log() {
  printf '[bootstrap] %s\n' "$1"
}

wait_for_pxe() {
  log "Waiting for Aztec PXE at ${AZTEC_PXE_URL}/status ..."
  until node -e "fetch('${AZTEC_PXE_URL}/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
    sleep 2
  done
  log "PXE is healthy"
}

compile_contracts() {
  for c in kyc_verifier fund_token defi_vault housing_fund governance; do
    log "Compiling contract: ${c}"
    (
      cd "${ROOT_DIR}/contracts/${c}"
      npx -y "@aztec/cli@${AZTEC_CLI_VERSION}" compile
    )
  done
}

deploy_contracts() {
  log "Installing deploy script dependencies"
  npm --prefix "${ROOT_DIR}/scripts" install

  log "Deploying contracts"
  AZTEC_PXE_URL="${AZTEC_PXE_URL}" npm --prefix "${ROOT_DIR}/scripts" run deploy
}

main() {
  wait_for_pxe
  compile_contracts
  deploy_contracts
  log "Bootstrap completed"
}

main
