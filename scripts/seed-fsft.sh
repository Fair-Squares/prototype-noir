#!/bin/bash
# Seed tradable FSFT into all three test accounts via the REAL distribution
# flow, by driving the frontend's live API routes (which use the proven
# server-side EmbeddedWallet — far more reliable than a fresh tsx PXE).
#
#   deposit x3  ->  create proposal  ->  vote x2  ->  advance past deadline
#   ->  finalize  ->  execute (opens distribution)  ->  claim x3 (mints FSFT)
#
# After this, test0/test1/test2 each hold private FSFT (claimed from the fund's
# distribution of an executed proposal) and can place sell orders on the DEX.
#
# Usage (against a running `docker compose --profile aztec up` stack):
#   FRONTEND_URL=http://localhost:3000 bash scripts/seed-fsft.sh
#
# Env knobs (defaults in []):
#   FRONTEND_URL   [http://localhost:3000]
#   DEPOSIT_EACH   [20000]  EUR each account deposits into the fund
#   PROPOSAL_AMOUNT[60000]  FSFT pool the executed proposal distributes
#   MAX_ADVANCE    [12]     max filler txs to push the chain past the deadline

set -euo pipefail

# DEPOSIT_EACH defaults to the fund's small-deposit threshold (10000) so every
# account is "small" and is guaranteed a pro-rata share of the 30% small pool
# (on top of its FIFO share) — no depositor can claim zero. PROPOSAL_AMOUNT is
# the FSFT pool and must be <= total deposits (3 x DEPOSIT_EACH).
#
# Demo headroom (docs/TODO.md + FUTURE_DEVELOPMENT_PLAN.md §9.4 step 1): the
# funded proposal is deliberately SMALLER than total deposits (20000 of 30000),
# so after seeding the fund still shows ~10000 "Available to deploy" / "Ready to
# deploy" instead of a flat €0 — which lets the Overview demonstrate the
# available → committed flow. PROPOSAL_TITLE matches a project dossier (see
# frontend/src/lib/projectDossier.ts) so the /fund/[id] Dossier tab resolves.
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
DEPOSIT_EACH="${DEPOSIT_EACH:-10000}"
PROPOSAL_AMOUNT="${PROPOSAL_AMOUNT:-20000}"
PROPOSAL_TITLE="${PROPOSAL_TITLE:-Maashaven Wonen — Rotterdam}"
MAX_ADVANCE="${MAX_ADVANCE:-12}"
# Capped-return params: rent = ROR × acquisition value. 300 bps (3%) of a
# 500,000 home → 15,000/yr → 1,250/mo (the canonical example), so the dossier
# shows a REAL on-chain ROR and get_expected_monthly_rent matches the doc.
ROR_BPS="${ROR_BPS:-300}"
ACQUISITION_VALUE="${ACQUISITION_VALUE:-500000}"

log() { printf '\n[seed-fsft] %s\n' "$1" >&2; }
die() { printf '\n[seed-fsft] FATAL: %s\n' "$1" >&2; exit 1; }

# JSON field extractor (python3 is always present in this repo's tooling).
jget() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1"; }

# POST <path> <json-body>  -> echoes response body; dies on transport error or
# an HTTP error whose body lacks "success":true.
post() {
  local path="$1" body="$2" resp http
  resp=$(curl -sS -w '\n%{http_code}' -H 'Content-Type: application/json' -d "$body" "${FRONTEND_URL}${path}") \
    || die "POST ${path} failed (transport)"
  http=$(printf '%s' "$resp" | tail -n1)
  body=$(printf '%s' "$resp" | sed '$d')
  printf '%s' "$body"
  if [ "$http" -ge 400 ]; then
    printf '\n' >&2
    die "POST ${path} -> HTTP ${http}: ${body}"
  fi
}

get() { curl -sS "${FRONTEND_URL}$1" || die "GET $1 failed"; }

# -- 0. Resolve the three test account addresses -------------------------------
log "Resolving test accounts from ${FRONTEND_URL}/api/accounts ..."
ACCOUNTS_JSON=$(get /api/accounts)
ADDR0=$(printf '%s' "$ACCOUNTS_JSON" | jget "['accounts'][0]['address']")
ADDR1=$(printf '%s' "$ACCOUNTS_JSON" | jget "['accounts'][1]['address']")
ADDR2=$(printf '%s' "$ACCOUNTS_JSON" | jget "['accounts'][2]['address']")
[ -n "$ADDR0" ] && [ -n "$ADDR1" ] && [ -n "$ADDR2" ] || die "could not resolve 3 accounts"
log "test0=$ADDR0"
log "test1=$ADDR1"
log "test2=$ADDR2"

ADDRS=("$ADDR0" "$ADDR1" "$ADDR2")

# -- 1. Each account deposits into the housing fund (creates deposit notes) -----
# Drip DEPOSIT_EACH EUR first so the seed is self-sufficient regardless of the
# account's current public balance (the deposit pulls from public EUR).
for i in 0 1 2; do
  log "Drip ${DEPOSIT_EACH} EUR (test${i})"
  post /api/fund/tokens "{\"address\":\"${ADDRS[$i]}\",\"accountIndex\":${i},\"amount\":${DEPOSIT_EACH}}" >/dev/null
  log "Deposit ${DEPOSIT_EACH} EUR -> fund (test${i})"
  post /api/fund/deposit "{\"address\":\"${ADDRS[$i]}\",\"accountIndex\":${i},\"amount\":${DEPOSIT_EACH}}" >/dev/null
done

# -- 2. Admin (test0) creates a funding proposal -------------------------------
log "Create proposal '${PROPOSAL_TITLE}' (amount ${PROPOSAL_AMOUNT})"
post /api/governance/proposals \
  "{\"action\":\"create\",\"title\":\"${PROPOSAL_TITLE}\",\"amount\":${PROPOSAL_AMOUNT},\"accountIndex\":0,\"address\":\"${ADDR0}\"}" >/dev/null

# Newest proposal id = count - 1.
PROPOSALS=$(get "/api/governance/proposals?address=${ADDR0}&accountIndex=0")
PID=$(printf '%s' "$PROPOSALS" | jget "['proposals'][-1]['id']")
log "Proposal id = ${PID}"

# -- 2b. Set the capped-return parameters (ROR + acquisition value) ------------
# Admin-only (test0). Makes the dossier show a REAL on-chain ROR instead of the
# modelled fallback, and sets the property's acquisition value for expected-rent.
log "Set ROR ${ROR_BPS}bps + acquisition ${ACQUISITION_VALUE} (property ${PID})"
post /api/fund/ror \
  "{\"rorBps\":${ROR_BPS},\"propertyId\":${PID},\"acquisitionValue\":${ACQUISITION_VALUE},\"accountIndex\":0,\"address\":\"${ADDR0}\"}" >/dev/null

# -- 3. Two accounts vote in favour (quorum = 2) -------------------------------
for i in 0 1; do
  log "Vote YES (test${i}) on proposal ${PID}"
  post /api/governance/vote \
    "{\"address\":\"${ADDRS[$i]}\",\"accountIndex\":${i},\"proposalId\":${PID},\"voteYes\":true}" >/dev/null
done

# -- 4. Advance the chain past the voting deadline -----------------------------
# Blocks advance with activity (automine). Send filler drips until currentBlock
# passes the proposal's deadline block.
advance_one() {
  post /api/fund/tokens "{\"address\":\"${ADDR0}\",\"accountIndex\":0,\"amount\":1}" >/dev/null 2>&1 || true
}
for n in $(seq 1 "$MAX_ADVANCE"); do
  P=$(get "/api/governance/proposals?address=${ADDR0}&accountIndex=0")
  CUR=$(printf '%s' "$P" | jget "['proposals'][${PID}]['currentBlock']")
  DEAD=$(printf '%s' "$P" | jget "['proposals'][${PID}]['deadlineBlock']")
  log "block ${CUR} / deadline ${DEAD}"
  if [ "$CUR" -gt "$DEAD" ]; then break; fi
  advance_one
done

# -- 5. Finalize + execute (execute also opens the distribution) ---------------
log "Finalize proposal ${PID}"
post /api/governance/proposals \
  "{\"action\":\"finalize\",\"proposalId\":${PID},\"accountIndex\":0,\"address\":\"${ADDR0}\"}" >/dev/null

log "Execute proposal ${PID} (opens distribution)"
post /api/governance/proposals \
  "{\"action\":\"execute\",\"proposalId\":${PID},\"accountIndex\":0,\"address\":\"${ADDR0}\"}" >/dev/null

# -- 6. Each depositor claims their FSFT share (minted to PRIVATE balance) ------
for i in 0 1 2; do
  log "Claim FSFT distribution (test${i})"
  post /api/governance/claim \
    "{\"proposalId\":${PID},\"accountIndex\":${i},\"address\":\"${ADDRS[$i]}\"}" >/dev/null
done

# -- 7. Report resulting FSFT balances -----------------------------------------
log "Resulting FSFT balances:"
for i in 0 1 2; do
  PF=$(get "/api/portfolio?address=${ADDRS[$i]}&accountIndex=${i}")
  BAL=$(printf '%s' "$PF" | jget "['balance']")
  printf '[seed-fsft]   test%s FSFT = %s\n' "$i" "$BAL" >&2
done
log "Done. All three accounts can now place sell orders on the DEX."
