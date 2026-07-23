#!/bin/bash
# End-to-end rotation of the Stripe Connect webhook signing secret.
#
# Runs entirely on this machine. No clipboard, no browser, no manual
# paste. Sensitive values never printed and never persisted beyond
# what's needed:
#
#   1. Generate a random ADMIN_CLI_TOKEN, set it in Supabase Function
#      env. admin_auth.ts's ephemeral bypass accepts it as admin.
#   2. Call admin-businesses (op: stripe_rotate_connect_endpoint) —
#      Edge Function creates fresh Connect endpoint via Stripe and
#      returns the new signing secret.
#   3. Set STRIPE_WEBHOOK_SECRET_CONNECT in Supabase Function secrets.
#   4. Redeploy stripe-webhook so the new env is loaded.
#   5. Verify (env probe + Stripe endpoint list) and print summary.
#   6. Unset ADMIN_CLI_TOKEN so the bypass is closed until the next
#      rotation.
#
# Requires: supabase CLI logged in, jq, openssl.
set -euo pipefail

REF="esocyyhnphjqcfjidffu"
FN_URL="https://${REF}.supabase.co/functions/v1/admin-businesses"

# Set up cleanup — unset the ephemeral token whether we succeed or fail.
cleanup() {
  unset CLI_TOKEN WHSEC ROT ENV_JSON DIAG ANON_KEY 2>/dev/null || true
  supabase secrets unset ADMIN_CLI_TOKEN >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[0/6] Fetching anon key (needed to satisfy Supabase gateway JWT check)…"
ANON_KEY="$(supabase projects api-keys --project-ref "$REF" --output json 2>/dev/null \
  | jq -r '.[] | select(.id=="anon") | .api_key')"
if [[ -z "${ANON_KEY:-}" ]]; then
  echo "ERROR: could not fetch anon key" >&2
  exit 1
fi

echo "[1/6] Generating ephemeral ADMIN_CLI_TOKEN and setting in Supabase env…"
CLI_TOKEN="$(openssl rand -hex 32)"
supabase secrets set ADMIN_CLI_TOKEN="$CLI_TOKEN" >/dev/null 2>&1
# Small pause for propagation to the function runtime (usually <1s).
sleep 2

echo "[2/6] Calling stripe_rotate_connect_endpoint…"
ROT="$(curl -sf -X POST "$FN_URL" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "X-Admin-Token: $CLI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"op":"stripe_rotate_connect_endpoint"}')" || {
    echo "ERROR: rotate call failed — check function logs" >&2
    exit 1
  }

WHSEC="$(echo "$ROT" | jq -r '.secret // empty')"
NEW_ID="$(echo "$ROT" | jq -r '.new_endpoint.id // empty')"
DELETED="$(echo "$ROT" | jq -c '.deleted // []')"

if [[ -z "$WHSEC" ]]; then
  echo "ERROR: rotate response missing secret. Response was:" >&2
  echo "$ROT" >&2
  exit 1
fi

echo "       deleted: $DELETED"
echo "       new_endpoint_id: $NEW_ID"
echo "       whsec_len: ${#WHSEC} (should be 38)"

echo "[3/6] Setting STRIPE_WEBHOOK_SECRET_CONNECT in Supabase env…"
supabase secrets set STRIPE_WEBHOOK_SECRET_CONNECT="$WHSEC" >/dev/null 2>&1
echo "       set."

echo "[4/6] Redeploying stripe-webhook…"
supabase functions deploy stripe-webhook >/dev/null 2>&1
echo "       deployed."

echo "[5/6] Verifying env shape and endpoint state…"
sleep 2  # let env propagate to newly-deployed function
ENV_JSON="$(curl -sf -X POST "$FN_URL" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "X-Admin-Token: $CLI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"op":"stripe_check_webhook_env"}')"
echo "       env: $(echo "$ENV_JSON" | jq -c '{direct: .stripe_webhook_secret, connect: .stripe_webhook_secret_connect}')"

DIAG="$(curl -sf -X POST "$FN_URL" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "X-Admin-Token: $CLI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"op":"stripe_diagnose","account_id":"acct_1TvedT2KNDM6s57w"}' || true)"
if [[ -n "$DIAG" ]]; then
  echo "       endpoints: $(echo "$DIAG" | jq -c '[.webhook_endpoints[]? | {id, probable_connect, enabled_events}]')"
fi

echo "[6/6] Cleaning up ADMIN_CLI_TOKEN (trap will run on exit)…"

echo ""
CONNECT_LEN="$(echo "$ENV_JSON" | jq -r '.stripe_webhook_secret_connect.length // 0')"
if [[ "$CONNECT_LEN" == "${#WHSEC}" ]]; then
  echo "✓ Rotation clean. Env connect length ($CONNECT_LEN) matches whsec length (${#WHSEC})."
else
  echo "✗ Length mismatch. Env connect length: $CONNECT_LEN, whsec length: ${#WHSEC}."
  exit 1
fi
