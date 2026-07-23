# Wello — Live-mode cutover checklist

Things that behave differently in Stripe live mode and can silently break
if handled the same way as test mode. Add to this doc as bugs surface.

## Stripe: two webhook endpoints are required, not one

Stripe delivers events in two distinct scopes:

- **Direct events** (about the platform account): e.g. `checkout.session.completed`
  from Wello's own Checkout Sessions. Delivered to endpoints registered
  with `connect: false`.
- **Connect events** (about connected accounts): e.g. `account.updated` for
  Express partners as they onboard. Delivered to endpoints registered
  with `connect: true`.

A single endpoint receives one scope or the other — never both. The
`connect` flag cannot be toggled after creation.

**In test mode we hit this bug on 2026-07-21:** business 53 (`acct_1TvedT2KNDM6s57w`)
completed Stripe onboarding and generated six `account.updated` events
that never reached `stripe-webhook` because the only endpoint had
`connect: false`. Symptom: `businesses.stripe_account_status` stayed
stuck at `pending` even though the connected account was fully live on
Stripe's side.

### What live mode needs

Create **two** endpoints in the Stripe live dashboard, both pointing at
`https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/stripe-webhook`
(or the equivalent live-project URL):

| Endpoint | `connect` | `enabled_events` | Secret env var |
|---|---|---|---|
| Direct   | `false` | `checkout.session.completed` (+ anything platform-scoped) | `STRIPE_WEBHOOK_SECRET` |
| Connect  | `true`  | `account.updated` (+ any future Connect-scoped events) | `STRIPE_WEBHOOK_SECRET_CONNECT` |

The `stripe-webhook` handler tries both secrets when verifying —
Stripe signs each delivery with the endpoint's own secret, so the wrong
secret is a signature mismatch, not corrupted data.

### Fast path

The Connect endpoint can be created via the admin edge function:

```
op: 'stripe_create_connect_endpoint' on admin-businesses
```

Runs against whichever Stripe key is currently in `STRIPE_SECRET_KEY`, so
switch that env var to a live key first, invoke the op, copy the returned
`whsec_...`, then:

```
supabase secrets set STRIPE_WEBHOOK_SECRET_CONNECT=<whsec_...>
supabase functions deploy stripe-webhook
```

The direct endpoint you'll typically create by hand in the live
Dashboard (or migrate its config from test).

### Verifying end-to-end

After deploy, complete Connect onboarding for one live partner and watch
`businesses.stripe_account_status` flip from `pending` → `active`. If it
doesn't, use `op: 'stripe_diagnose'` — it reports both event scopes and
the full list of registered webhook endpoints with their `connect`
flags, which is the fastest way to see whether Connect deliveries are
reaching us.
