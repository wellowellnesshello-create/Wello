#!/bin/bash
# Companion wrapper for seed-noor-slots.mjs.
#
# Mirrors the ephemeral-secret pattern from rotate-connect-whsec.sh:
#
#   1. Fetch the project's public anon key (needed to satisfy the
#      Supabase gateway's JWT-format check on the admin-businesses
#      edge function).
#   2. Generate a random ADMIN_CLI_TOKEN and set it in Supabase
#      Function secrets. admin_auth.ts's ephemeral bypass accepts it
#      as admin for the X-Admin-Token header.
#   3. Run seed-noor-slots.mjs with the token + anon key in env.
#   4. Unconditionally unset ADMIN_CLI_TOKEN — the trap runs even on
#      failure so the bypass closes as soon as the run finishes.
#
# The service-role key is never touched. The ephemeral token lives on
# the function for however long the seed takes (typically <10 seconds)
# and is gone before you get your shell prompt back.
#
# Usage:
#   scripts/seed-noor-slots.sh               # dry run
#   scripts/seed-noor-slots.sh --apply       # actually insert
#
# Requires: supabase CLI logged in + linked to the project, jq, openssl,
# node.

set -euo pipefail

REF="esocyyhnphjqcfjidffu"
BUSINESS_ID="${BUSINESS_ID:-48}"  # Noor's id, override to seed another biz

cleanup() {
  # Best-effort. Runs on every exit path (success, failure, ctrl-c).
  # Silenced so a failed unset doesn't overwrite the actual error above.
  supabase secrets unset ADMIN_CLI_TOKEN >/dev/null 2>&1 || true
  unset ADMIN_CLI_TOKEN ANON_KEY 2>/dev/null || true
}
trap cleanup EXIT

echo "[1/3] Fetching public anon key…"
ANON_KEY="$(supabase projects api-keys --project-ref "$REF" --output json 2>/dev/null \
  | jq -r '.[] | select(.id=="anon") | .api_key')"
if [[ -z "${ANON_KEY:-}" ]]; then
  echo "ERROR: could not fetch anon key. Is the CLI logged in and linked?" >&2
  exit 1
fi

echo "[2/3] Setting ephemeral ADMIN_CLI_TOKEN on admin-businesses…"
ADMIN_CLI_TOKEN="$(openssl rand -hex 32)"
supabase secrets set ADMIN_CLI_TOKEN="$ADMIN_CLI_TOKEN" >/dev/null 2>&1
# Function runtime picks up new secrets within a second or two.
sleep 2

echo "[3/3] Running seed-noor-slots.mjs (BUSINESS_ID=$BUSINESS_ID)…"
echo ""
SUPABASE_URL="https://${REF}.supabase.co" \
SUPABASE_ANON_KEY="$ANON_KEY" \
ADMIN_CLI_TOKEN="$ADMIN_CLI_TOKEN" \
BUSINESS_ID="$BUSINESS_ID" \
  node scripts/seed-noor-slots.mjs "$@"
