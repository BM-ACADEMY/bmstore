# Phase 5 report: developer console

Internal tools so the developer can deliver a client store in about 3 hours. **Not** self-serve and not automatic
provisioning: every store is created, built, checked and switched live by the developer. No demo content was added.

Status: **all 9 items built, one or more commits each. 614 of 614 tests pass** (26 suites; Phase 2 ended at 455).
`seed.spec.ts` used to fail between 00:00 and 04:00 IST (the demo seed backdated "today's" orders by up to 4 hours, so
they landed in yesterday); that also turned CI red on unrelated branches. Fixed in `fix(seed): keep today's demo orders …`.
The tenant-isolation gate is green: **414 tests**, now covering **21 models**.

Scope respected: changes are in `apps/api`, the new `apps/console`, one **new file** in the admin
(`apps/admin/app/api/auth/impersonate/route.ts`) and new docs/screenshots. `apps/storefront` (S3) was not touched.
`package-lock.json` changed (new workspace + `bullmq`), so expect a lock-file merge with S3. Regenerate it with `npm install` after merging.

| # | Item | Commit |
|---|------|--------|
| 1 | Policy page generator | `feat(console): policy page generator …` |
| 2 | Create store from intake (idempotent) | `feat(console): create store from intake (idempotent)` |
| 3 | Product import + bulk images (+ theme apply) | `feat(console): product import, bulk image upload and theme apply …` |
| 4 | Domain mapping, CNAME check, on-demand TLS, SSL status | `feat(console): domain mapping …` |
| 5 | Automated QA runner | `feat(console): automated QA runner …` |
| 6 | Developer console (API + web app) | `feat(console): developer console API …`, `feat(console): developer console web app (apps/console)` |
| 7 | Scheduled jobs (BullMQ) | `feat(jobs): scheduled jobs on BullMQ …` |
| 8 | Outbound n8n webhooks | `feat(webhooks): outbound n8n-ready webhooks` |
| 9 | Tests | `test(console): isolation on every new model and every console route` (plus a spec per item) |

## How to run it

```bash
docker compose up -d
npm ci
npm run migrate:deploy -w apps/api && npm run db:app-role -w apps/api
SUPERADMIN_EMAIL=you@example.com SUPERADMIN_PASSWORD='at-least-12-chars' npm run seed:superadmin -w apps/api
npm run start:dev -w apps/api            # API :3000 (also runs the BullMQ jobs; JOBS_WORKER=0 to switch off)
npm run dev -w apps/console              # console :3003. Sign in with the superadmin.
npm run dev -w apps/admin                # store admin :3001 (impersonation lands here)
```

Console env: `API_URL` (default `http://localhost:3000`) and `API_HOST` (the platform host it presents to the API, default
`admin.localhost`). New API env vars are documented at the bottom of `apps/api/.env.example`.

## What was built

### Design rules held throughout
- **Isolation.** Work inside one store goes through `ConsoleScope.inTenant`. That runs the store's own Phase 2 services
  (import, media, theme, pages) in that tenant's scope, so the Prisma extension and RLS are pinned to it. Cross-store
  reads (lists, home screen, jobs) go through the existing audited superadmin/system bypass. No new file touches
  `prisma.base`, so the gate's allowlist is unchanged.
- **New tables, all with `tenant_id` and an RLS policy:** `store_intakes`, `store_domains`, `qa_runs`, `refund_cases`,
  `outbox_events`, plus `tenants.went_live_at`. Each is classified in `SCOPES` and has a gate factory.
- **Existing enums only.** The stage badge is derived from `TenantStatus` + intake completion + latest QA + expiry,
  never stored (`src/console/stage.ts`).
- **Money is integer paise.** The console converts rupees at the edge (`toPaise`), and the API rejects fractional paise.
- **Domains and cookies.** Platform domain comes from `PLATFORM_BASE_DOMAIN` (default `store.bmtechx.in`); in production `ROOT_DOMAIN`
  defaults to it, and dev keeps `storename.localhost`. Console and admin cookies are httpOnly and host-only (no `Domain` attribute).
- **No invented reviews, ratings, counts or testimonials,** in layouts, policy text, summaries or the UI.
- **No secrets in logs or payloads.** Notifier logs mask the recipient and never log the body. Webhook URLs are never
  logged. The temporary owner password is returned once and stored only as an argon2 hash.

### 1. Policy pages (`src/console/policies.ts`, `policy.service.ts`)
One template for every store: Privacy, Terms, Refund, Shipping in Markdown, filled from the tenant's name, URL,
WhatsApp/phone/email, address, GSTIN, shipping mode/rates/city rates, COD charge, and whether online payments are on.
Missing facts are left out rather than invented. The Refund page states the delivery guarantee word for word. The same
constant (`DELIVERY_GUARANTEE`) drives the refund rule, so the published text and the code cannot drift apart.
Pages use the admin's existing slugs, and `overwrite: false` keeps pages the developer edited.

### 2. Create store from intake (`src/console/intake*.ts`)
`POST /superadmin/console/intake` accepts JSON (nested `shipping` / `cod`) or a flat form (`brandColors="#a, #b"`,
`codEnabled=on`, …), and lists every validation problem at once. In one transaction it creates:
- the tenant in BUILDING (plan defaults to STANDARD)
- the intake row
- settings from the shipping/COD answers (COD is off unless the client said yes)
- theme defaults for the layout (classic / boutique / grocery / minimal, picked from the category if not given) plus brand colours
- the owner login

After that it writes the 4 policy pages and an About page.

**Idempotent** on `intakeKey`; without a key it uses business name + email. A re-run fills in missing details and
creates whatever does not exist yet. It never overwrites settings or theme the developer changed, never re-issues the
password, and never restarts the delivery clock. Five concurrent identical submissions produce one store (tested).
`PATCH …/stores/:id/intake` adds details that arrive later.

### 3. Import + images (`src/console/build.*`)
The console reuses the Phase 2 import (CSV/XLSX, per-row errors with sheet row numbers, dry run, upsert, template
download) and the presigned bulk image pipeline (WebP worker, `image_filename` matching), inside the store's scope.
Theme apply sets a layout preset plus colours plus a logo, and the logo must be the store's own upload. Usage is measured
against 2,000 products / 10 GB.

### 4. Domain mapping (`src/console/domain.service.ts`, `net-probes.ts`)
1. The developer saves the domain and the console shows the CNAME instruction pointing to `PLATFORM_BASE_DOMAIN`.
2. "Check DNS" passes when the CNAME equals the base domain, or (for apex domains) the A records match the base domain's.
3. **`tenants.custom_domain` is set only after DNS verifies.** Caddy's existing on-demand TLS asks `tls-ask`, which asks
   the API `/health` with that Host, so a certificate is requested only for verified names. Caddy needed no change.
   If DNS later stops pointing here, the domain is unrouted. Domains under the platform domain, or already used by another store, are refused.
4. "Check SSL" connects with SNI and records issuer and expiry. It reports "skipped" locally.

### 5. QA runner (`src/console/qa.service.ts`, `qa-probes.ts`)
Seven checks, each returning `pass | fail | skipped` with a plain detail and a duration. A crash fails only that
check. A run passes when nothing failed. Runs are stored in `qa_runs`.

| Check | Now |
|---|---|
| Test order placed, Invoice generated, Lighthouse mobile 85+ | `StorefrontProbe` interface. **"skipped: storefront not merged"** until S3 lands |
| Owner alert delivered | real check through the `Notifier` (stub transport, see below) |
| SSL valid | TLS probe; "SSL check skipped locally" in dev |
| 4 policy pages present | real: each must exist with real content (≥ 200 characters) |
| Payment keys working | real: decrypts the store's keys, read-only call to Razorpay. **Test-mode keys fail** (not go-live ready). COD-only stores skip |

### 6. Developer console (`apps/console` + `src/console/stores.*`, `refund*`)
Next.js 15 + Tailwind 4, mobile-first: bottom tabs at 390 px, sidebar on desktop. No horizontal overflow on any
screen (Playwright-checked). No raw ID tables. The proxy can reach `/superadmin/console/*` only.

- **Today (home):** stage counts, then a "needs attention" list ordered by severity:
  - stuck intakes
  - delivery deadline within 72 h, or missed (refund risk)
  - failed QA
  - ready to go live
  - expiring or expired stores
  - usage near the fair-use limit
  - scheduled jobs with last result and run-now (backup problems turn red)
- **Stores:** cards with stage badges (Intake received, Building, QA, Review, Live, Expiring, Parked), filters and search.
- **New store:** the intake as a form or pasted JSON. The owner password is shown once.
- **Store page tabs:**
  - Overview: next step, details, usage meters, lifecycle (suspend / unsuspend / extend expiry / impersonate), notifications & webhooks with resend, activity
  - Intake editor
  - Build: import with per-row report, bulk photos, theme, policy pages
  - Domain
  - QA & go-live, with a 390 px mobile preview
  - Refunds
- **Go-live** only when the latest QA passed and is less than 24 h old. It starts a 365-day plan, tells the owner, and the
  preview ribbon/noindex disappear. **Unsuspend** returns a never-live store to BUILDING (it never skips QA).
  **Extend** counts from the current expiry, and brings back a store that was suspended for expiry.
- **Impersonate:** needs a reason and is audited twice (start, redeem). It issues a one-time 2-minute code, which the
  admin's new `/api/auth/impersonate` route redeems on the **store's own host**. The result is a 15-minute owner token
  with no refresh token. A code works once, and only on its own store.
- **Renewals** (plan day 305 / 335), **Usage** (vs 2,000 / 10 GB), **Refund queue**.
- **Refund helper:**
  1. The developer enters the facts (amount incl. GST, GST, Razorpay payment id, invoice ref, documented client-side delay in working days).
  2. The rule (`refund-rule.ts`, a pure function) shows a step-by-step verdict.
  3. A human approves by **typing the amount**. The rule is re-applied at approval.
  4. The case is claimed atomically, so a double click refunds once.
  5. Razorpay refund API, test mode, then a credit note `CN/<FY>/<0001>` (printable HTML), due within 7 working days.

  Not eligible: intake incomplete, still inside the window, delivered on time, change of mind after go-live.
  Eligible: not live by the deadline, or live late for a reason other than change of mind.

### 7. Scheduled jobs (`src/jobs`)
BullMQ repeatable schedules (India time) run in the API process. Every job is idempotent through `outbox_events`
dedupe keys and can be run from the console.

| Job | Schedule | What it does |
|---|---|---|
| intake-chasers | daily | Chasers on day 2, 4, 7 (each once). Parked on day 14. Visitors see the "not open yet" notice. |
| renewal-reminders | daily | Plan day 305 and 335, once per plan period. Raises `renewal.due`. |
| expiry-suspend | hourly | Suspends LIVE stores past expiry. The owner is told. |
| backup-check | daily | Reads `infra/backup`'s `backup.nightly.last`: ok / stale (> 26 h) / failed / missing. |
| usage-warnings | daily | 80% and 95% of either limit, once a month per level. |
| weekly-summary | Monday | Stage counts, stores that went live, urgent items, open refunds. Sent to the developer. |

**Storefront notice:** a suspended, parked or expired store now answers every route with
`403 { message, code, notice: { code, title, body, whatsapp } }`, which the storefront can render as a full page.
Existing `message` values are unchanged.

### 8. Webhooks (`src/console/webhooks.ts`)
Events: `store.created`, `intake.completed`, `qa.result`, `store.live`, `renewal.due`. All go to one `N8N_WEBHOOK_URL`.

- Body: `{ id, event, occurredAt, store{…}, contact{ownerName, whatsapp, email}, data{…} }`.
- Headers: `X-BMStore-Event`, `X-BMStore-Delivery` (stable across retries), `X-BMStore-Timestamp`, `X-BMStore-Signature: sha256=HMAC(WEBHOOK_SECRET, "<ts>.<body>")`.
- Each event is recorded first, then delivered on the worker with exponential retries (6 attempts).
- Without a URL, events are recorded as `skipped`. An outage never breaks the action that raised the event.

### 9. Tests (new suites)
| Suite | Covers |
|---|---|
| `console-intake.spec.ts` | **idempotency** (same key, no key/form, 5 concurrent), partial → complete, no overwrite, clock never restarts, clashes, RBAC |
| `console-qa.spec.ts` | **QA failure paths**: policies missing/empty, keys missing/test/rejected/crash, alert undelivered/no contact, Lighthouse < 85, failed order fails invoice; skips; history isolation |
| `console-refund-rule.spec.ts` | **refund rule logic**: every branch, client delay, holidays, IST working days, paise validation, financial year; stage derivation |
| `console-isolation.spec.ts` | **cross-tenant isolation on every new model** (scoped client + console doors with foreign ids) and all 40+ console routes vs anonymous/owner/impersonation tokens |
| `gate.spec.ts` | the 5 new models through the full app-layer and RLS matrices (DMMF-driven; 16 → 21 models) |
| `console-policies`, `-build`, `-domain`, `-stores`, `-jobs`, `-webhooks` | items 1, 3, 4, 6, 7, 8 end to end |

Screenshots (390 px, 2×, plus one desktop view): `docs/screenshots/s5/01-login.png` … `13-desktop-qa.png`.

## Integrations still stubbed

| Integration | Where | State now | To make it real |
|---|---|---|---|
| **WhatsApp / email notifications** (owner alerts, chasers, renewals, expiry, usage, developer alerts, weekly summary) | `src/notify/notifier.ts` | `StubNotifier`: in-memory outbox + masked log line; outbox rows say `stubbed` | Implement `Notifier` with WhatsApp Business API / SES; templates are referenced by id (`intake_chaser_1`, `renewal_day_305`, …) |
| **Storefront QA checks** (test order, invoice, Lighthouse mobile) | `src/console/qa-probes.ts` | `UnmergedStorefrontProbe` → "skipped: storefront not merged" | After S3 merges: an `HttpStorefrontProbe` (checkout API on the store host, invoice fetch, Lighthouse CLI with the mobile preset) bound in `console.module.ts` |
| **Razorpay refund API** (platform account) | `src/console/refund-gateway.ts` | Real code path, **test mode only**; with no `PLATFORM_RAZORPAY_KEY_*` it returns a marked fake `rfnd_stub_…` and the credit note says "test document" | Set test keys to exercise it; live refunds need `RAZORPAY_ALLOW_LIVE_REFUNDS=1` deliberately |
| **Credit note PDF** | `RefundService.creditNoteHtml` | Printable HTML (browser "Save as PDF"); single GST line | Server-side PDF and CGST/SGST vs IGST split if your CA wants it |
| **n8n** | `src/console/webhooks.ts` | Real HTTP delivery; recorded as `skipped` until `N8N_WEBHOOK_URL` is set | Point it at the n8n Webhook node; verify the signature with `WEBHOOK_SECRET` |
| **Backup status** | `JobsService.backupCheck` | Reads the file `infra/backup` already writes; the API container needs `BMSTORE_STATE_DIR` mounted read-only from the backup volume | Add that mount in `deploy/docker-compose.prod.yml` (outside this phase's allowed paths) |
| **SSL check locally** | `DomainService.isLocal` | Reported "skipped" in dev | Works as-is in production |

## Decisions to confirm, and things I am unsure about

1. **Refund page wording.** As asked, the Refund page states the store-delivery guarantee, but it is a promise from you
   to the store owner, published on a page shoppers read. I put it in its own section, "Store setup guarantee (between
   <store> and BM Techx)", that says it does not affect shoppers. If you would rather keep it off shopper pages
   (for example on your own site or in the client contract), it is one function to move.
2. **Shopper return terms are defaults:** damaged or wrong item reported within 48 hours, cancellation before dispatch.
   The intake has no returns question, so the developer should confirm or edit these per store.
3. **Working days** = Monday to Friday in IST, minus `WORKING_DAY_HOLIDAYS`. Say if Saturdays count.
4. **Late go-live + "change of mind"** is not eligible (the request is a change of mind after go-live); late go-live for
   any other reason is eligible. Approval needs an eligible verdict, so there is no manual override; a human can still reject.
5. **Skipped QA checks do not block go-live,** so until the storefront merges, go-live happens without the order,
   invoice and Lighthouse checks. If you want go-live blocked until S3 lands, it is one condition in `goLiveBlocker`.
6. **Test-mode Razorpay keys fail QA** ("add the live keys before go-live").
7. **Defaults:** stores created from an intake default to **STANDARD** (2,000 products), not STARTER. COD is **off**
   unless the client said yes.
8. **Parking on day 14** sets the tenant to PARKED (store answers 403 with the notice); unpark restarts the chaser clock.
9. **Impersonation actions** are audited at start and redeem; the token carries the developer id (`imp` claim), but
   individual store-admin actions during the session are not tagged yet.
10. **Store URLs** come from `STORE_URL_TEMPLATE` / `ADMIN_URL_TEMPLATE`. The defaults are `http://<host>:3002` /
    `:3001` in dev and `https://<host>` / `https://<host>/admin` in production. The production admin path is a guess,
    so please confirm how the admin is served per store.
11. **Not changed (outside allowed paths):** `.github/workflows/ci.yml` does not build `apps/console` yet, add
    `npm run build -w apps/console`. The README was left alone to avoid merge conflicts; this report holds the run notes.
12. **Shared dev role password:** the jest global setup resets the `bmstore_app` role's password (as before). If you run
    the API and the tests on the same Postgres, use the same password for both.
