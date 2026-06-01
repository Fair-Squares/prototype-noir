#!/bin/bash
# Rent keeper: post collected rent for the demo project into the HousingFund via
# the live API route. This is what makes the "earn the rent" number REAL and
# on-chain (Phase 1.1, docs/PHASE1_YIELD_AND_RENT.md):
#
#   POST /api/fund/rent -> HousingFund.record_rent(property_id, amount)
#   -> get_total_rent_income() -> NAV = total_deposits + total_rent_income
#
# Run it once per "rent cycle" in the demo to show NAV grow from real cash flow.
#
# Usage (against a running `docker compose --profile aztec up` stack):
#   FRONTEND_URL=http://localhost:3000 bash scripts/record-rent.sh
#
# Env knobs (defaults in []):
#   FRONTEND_URL  [http://localhost:3000]
#   PROPERTY_ID   [0]      the funded project's id (Maashaven Wonen = proposal 0)
#   RENT_AMOUNT   [1500]   EUR rent to record this run
#   ACCOUNT_INDEX [0]      admin/keeper account (test0 is admin)

set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
PROPERTY_ID="${PROPERTY_ID:-0}"
RENT_AMOUNT="${RENT_AMOUNT:-1500}"
ACCOUNT_INDEX="${ACCOUNT_INDEX:-0}"

log() { printf '\n[record-rent] %s\n' "$1" >&2; }
die() { printf '\n[record-rent] FATAL: %s\n' "$1" >&2; exit 1; }
jget() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1"; }

# Resolve the admin/keeper address for the chosen account index.
ACCOUNTS_JSON=$(curl -sS "${FRONTEND_URL}/api/accounts") || die "GET /api/accounts failed"
ADDR=$(printf '%s' "$ACCOUNTS_JSON" | jget "['accounts'][${ACCOUNT_INDEX}]['address']")
[ -n "$ADDR" ] || die "could not resolve account ${ACCOUNT_INDEX}"
log "keeper=test${ACCOUNT_INDEX} (${ADDR})"

log "Recording EUR ${RENT_AMOUNT} rent for property ${PROPERTY_ID}"
RESP=$(curl -sS -w '\n%{http_code}' -H 'Content-Type: application/json' \
  -d "{\"propertyId\":${PROPERTY_ID},\"amount\":${RENT_AMOUNT},\"accountIndex\":${ACCOUNT_INDEX},\"address\":\"${ADDR}\"}" \
  "${FRONTEND_URL}/api/fund/rent") || die "POST /api/fund/rent failed (transport)"
HTTP=$(printf '%s' "$RESP" | tail -n1)
BODY=$(printf '%s' "$RESP" | sed '$d')
printf '%s\n' "$BODY" >&2
[ "$HTTP" -lt 400 ] || die "POST /api/fund/rent -> HTTP ${HTTP}"

# Report the resulting on-chain rent total + NAV.
STATS=$(curl -sS "${FRONTEND_URL}/api/fund/stats") || die "GET /api/fund/stats failed"
printf '%s' "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('[record-rent] total rent income =', d.get('totalRentIncome'), '| NAV =', d.get('navEur'))" >&2
log "Done."
