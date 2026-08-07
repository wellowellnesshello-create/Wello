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

## Stripe: EUR settlement must be active on the platform

Transfers can only debit a platform balance in the same currency as the
transfer. Payouts to ES-based Connect accounts are in EUR, so the
platform needs EUR-denominated available funds — not just EUR-priced
charges that auto-convert to GBP at settlement.

**In test mode we hit this on 2026-07-23:** the platform's default
settlement currency was GBP. €-priced credit charges landed as GBP
(£86.12 available, €0 available), so a €48 transfer to business 53
failed with "insufficient available funds" — misleading: the EUR
bucket didn't exist, not that it was underfunded.

The Wise EUR IBAN was added to the live platform this week, which
should enable EUR as an additional settlement currency. Verify before
the first real payout:

1. Trigger one real €-denominated credit purchase in live mode (yourself
   or a friendly first user).
2. Wait for it to settle (usually minutes).
3. Run `op: 'stripe_balance_breakdown'` on admin-businesses against
   the live key. Look for a EUR entry under `available`. If the entry
   is present with a non-zero `card` sub-bucket, settlement is EUR.
4. If everything's still landing as GBP: Dashboard → **Settings →
   Payments → Currency conversion** (label moves around) → add EUR
   as an additional settlement currency.

Without this, the first live payout will fail with the exact "insufficient
available funds" error even though the Dashboard Balance page shows
plenty of money.

### Fast path for test-mode seeding

`op: 'stripe_seed_eur_balance'` on admin-businesses creates + confirms
a test-mode EUR PaymentIntent using `pm_card_visa`. Refuses to run
against a live key. Only useful after EUR settlement is enabled — a
seeded PI on a GBP-only platform still lands as GBP.

## Stripe Connect: first-transfer prerequisites

Two things surfaced while running the sandbox payment + payout loop
that will bite the same way in live mode if we don't check them
before the first real payout.

- **Platform Stripe balance must be funded before the first Connect
  transfer.** Test accounts start at zero available balance, and a
  freshly-live platform account is the same until its first real
  charge settles. Connect transfers debit the platform balance, so
  a "first transfer, no charges yet" run fails with `insufficient
  available funds` — different from the EUR-vs-GBP issue above and
  not fixed by adding a settlement currency alone. Trigger and
  settle a real member top-up before kicking off the first payout
  batch. In test mode, `pm_card_bypassPending` credits the balance
  instantly, which is what the sandbox-loop dev tool relies on.
- **Connect accounts need `business_profile.url` set before the
  `transfers` capability activates.** Even with full identity, TOS,
  and bank-account data, transfers stay `inactive` with
  `disabled_reason: requirements.past_due` and
  `currently_due: ["business_profile.url"]`. Setting the URL flips
  the capability to `active` immediately. Express hosted onboarding
  collects this; a Custom account wired up directly through the API
  needs it added explicitly.
