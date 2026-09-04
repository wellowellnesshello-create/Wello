# Wello — Live-mode cutover checklist

Things that behave differently in Stripe live mode and can silently break
if handled the same way as test mode. Add to this doc as bugs surface.

## Status snapshot (2026-09-04 reconcile)

**Already done (verified from code / env / DB):**
- ✅ Email confirmation on partner registration — `notify-partner-registration`
  is deployed and firing. Trigger was silently 401'ing since 2026-07-24 (legacy
  service_role JWT baked into the trigger DDL got disabled); fixed today by
  adding `verify_jwt=false` to `config.toml` for the three affected fns
  (`1e5802a`). No orphan pending registrations in the DB from the outage
  window — confirmed via `select ... from businesses where status='pending'`.
- ✅ Both Stripe webhook secrets set — `STRIPE_WEBHOOK_SECRET` and
  `STRIPE_WEBHOOK_SECRET_CONNECT` are both populated on the edge-fn env
  (`supabase secrets list` confirms). Actual Dashboard endpoints still need
  verification against live-mode keys — see § below.
- ✅ Privacy policy — comprehensive modal in `src/App.jsx` triggered from
  the cookie banner (`showPrivacy`). Covers GDPR sections, data retention,
  third-party services, rights. Lawyer sign-off is a separate question, but
  the surface exists.
- ✅ `notify-partner-status` — approve/reject emails + magic-link generation.
  Same silent 401 bug as above; also fixed in `1e5802a`.
- ✅ `booking-webhook` — customer notifications + Make webhook fan-out on
  every booking. Same fix in `1e5802a`.
- ✅ SEO baseline — `public/robots.txt` + `public/sitemap.xml` shipped in
  `<commit hash>`. Homepage carries canonical, robots-index, OG, Twitter
  card meta.

**Outstanding — need external access to verify:**
- ⚠ Two Stripe webhook endpoints actually created in the **live** Dashboard
  (env vars are set but endpoints may still point at test-mode URLs). See
  § "Stripe: two webhook endpoints" below for the verify command.
- ⚠ EUR settlement currency active on the live platform. See
  § "Stripe: EUR settlement" below.
- ⚠ Connect account `business_profile.url` populated on the first live
  partner before their first payout. See § "Stripe Connect first-transfer".
- ⚠ `STRIPE_SECRET_KEY` currently points at live-mode key (not test). Can't
  distinguish from CLI (values shown as digests) — hit `stripe_diagnose` on
  admin-businesses to see mode, or check the Stripe Dashboard header.
- ⚠ WhatsApp business-initiated template delivery (63016 outside 24h session
  — see `[[project_next_session_followups]]`). Twilio support ticket pending.
- ⚠ SMS UK deliverability (21612 US→UK block on the current Twilio number).
- ⚠ Google Search Console domain verification + sitemap submission — see
  § "SEO / discoverability" below.

**Known deferred:**
- 🕒 Rewrite the three legacy-JWT `AFTER` triggers (booking-webhook,
  notify-partner-*) to use `pg_net` + Vault-resolved shared secret so the
  trigger DDL stops carrying a dead JWT string. See commit `1e5802a`
  message for the plan. Not urgent — `verify_jwt=false` is a working
  workaround.

---


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

## SEO / discoverability

**Diagnosed 2026-09-04:** wello-wellness.com did not appear in Google
search results at all, even for exact-string queries. Investigation:

- No `<meta name="robots" content="noindex">` in `index.html` or the SPA-
  rendered head. Not blocked at meta level.
- No `X-Robots-Tag` header on responses (verified via `curl -sI`).
- No Vercel deployment protection / password.
- Homepage returns proper `text/html; charset=utf-8` at the canonical
  `www.wello-wellness.com` (apex 307s to www — expected).
- **`public/robots.txt` was missing** — served 404. Google defaults to
  "crawl everything" without one but the missing file is a red flag.
- **`public/sitemap.xml` was missing** — served 404. Google relies on
  link-crawling alone with no sitemap.

**Fixes shipped:**
- `public/robots.txt` with `Allow: /` and `Sitemap:` pointer.
- `public/sitemap.xml` listing home + explore + credits + business pages.
- `index.html` gained canonical link, `<meta robots="index, follow">`,
  full Open Graph tags + Twitter card meta so WhatsApp / Facebook /
  Twitter link previews now render properly instead of a bare URL.

**Still owner action (can't be done from CLI):**
1. Verify domain in **Google Search Console** — https://search.google.com/search-console
   (either DNS TXT verification or upload an HTML meta tag to the site).
2. Submit the sitemap URL there: `https://www.wello-wellness.com/sitemap.xml`
3. Use GSC's **URL Inspection tool** on the homepage → click "Request
   indexing" to nudge the first crawl instead of waiting for Google's
   discovery engine.
4. Repeat step 3 for the Explore + Business pages if you want them
   indexed as first-tier landing pages.
5. Backlink hygiene: get one or two inbound links from indexed sites
   (Instagram bio, a partner venue's website, etc.). Google finds new
   domains fastest via inbound links, not via sitemap alone.

**Verify after the above:** `site:wello-wellness.com` on Google in
~48-72 hours. Should return at least the homepage. If it doesn't after
a week, check GSC → Coverage report for crawl errors.
