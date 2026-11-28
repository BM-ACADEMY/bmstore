# BM TechX Store: Roadmap

**Last updated:** 2026-11-28
**Target completion date for all remaining work (Phases 6–12): Tuesday 2026-12-08.** See §4a for the day-by-day
schedule, staffing needed and the tasks at risk.
**Based on:** branch `arshad` at `fb5f416`. That equals `main` at `226a4fb` plus one local change (docker-compose Postgres port 5433). `origin/main` is at `5c84cac` and has PR #7, which is not pulled locally.
**Also checked:** the unmerged branch `origin/claude/intelligent-edison-uezeqo` (Phase 4, 7 commits ahead of `main`).
**Sources:** `PREWORK_REPORT.md`, `PHASE1_REPORT.md` … `PHASE5_REPORT.md`, `PHASE4_REPORT.md` on the Phase 4 branch, `docs/runbooks/*`, source code, the 2026-11-28 code audit, and tracker items #112 / Order 10 / Order 5.

> This roadmap was written from reading code and reports. **No tests were run while preparing it.** Test counts are
> quoted from the phase reports and are marked as such.

---

## 1. Business vision

BM TechX Store is a **reusable e-commerce platform**, not a single shop. One shared codebase and backend serves many
client stores. Each store has its own data, branding, products, payment keys and domain.

**Goal:** our team creates a customised, working client store in **30 minutes or less of platform setup time**, using
client information that has already been collected.

**Target workflow:**

1. Collect client business information: name, description, logo, branding, contact details, address.
2. Collect products: details, images, prices, stock, variants.
3. Choose a template.
4. The platform creates a separate store.
5. Branding, theme and settings are applied.
6. Products and images are imported.
7. Payment and shipping are configured.
8. The storefront is live (preview).
9. The website, cart and checkout are verified (QA).
10. The client's domain is connected.
11. The store is handed over to the client.

**Out of the 30 minutes and tracked separately:** Razorpay KYC, DNS propagation, WhatsApp Business approval, client
delays (see §8).

---

## 2. How to read this file

**Status** describes how much of the task is done:

| Status | Meaning |
|---|---|
| **Completed** | Built as specified; evidence in code |
| **Partially Completed** | Some of it is built; the gap is named |
| **Pending** | Not started |
| **Blocked** | Cannot proceed until something outside the task happens |
| **Not Verified** | May work, but nobody has proven it in the required setting |

**Evidence level** describes how far a completed task has been proven. It is kept separate from status.

| Level | Meaning |
|---|---|
| `Code` | Exists in source on `main` |
| `Tests` | Automated tests exist for it. Pass/fail is quoted from a report unless stated |
| `Deployed` | Running on the production server |
| `Prod-verified` | Checked working on production with evidence |

**Effort** is a rough estimate in developer-days (d) and will be refined when a task is picked up.

---

## 3. Current status

### Phase summary

| Phase | Name | Status | Evidence level | Merged as |
|---|---|---|---|---|
| 0 | Pre-work A–E: security and data fixes | **Completed** | Code, Tests | in `main` (not merged through a PR) |
| 1 | Multi-store foundation | **Completed** | Code, Tests | in `main` (not merged through a PR) |
| 2 | Store admin, import, media, limits | **Mostly completed** | Code, Tests (API only) | in `main` (not merged through a PR) |
| 3 | Storefront V1 and checkout | **Partially Completed** | Code, Tests (API only) | PR #2 |
| 4 | Theme engine and layouts V2/V3 | **Partially Completed: built, NOT merged** | Code on branch only | branch `claude/intelligent-edison-uezeqo` (PR number NOT VERIFIED) |
| 5 | Developer console | **Partially Completed** | Code, Tests (API only) | PR #1 (S5), plus #3 RustFS, #5, #6, #7 deploy fixes |
| 6–12 | Remaining work | Pending | — | this roadmap |

### Deployment

**What exists:**
- A production server exists. Commit `7911dfb` synced fixes from it.
- The live API health check responded, as reported in the tracker notes for Order 10.

**What is NOT VERIFIED on production:**
- issuing certificates for new stores and custom domains
- a real checkout
- backups
- the scheduled jobs

**What does not exist:**
- **No test or staging environment exists.** Only `deploy/docker-compose.prod.yml`.
- **`docs/runbooks/DEPLOY_REPORT.md` is out of date.** It says the frontends do not exist and lists 3 migrations; there are now 18.

### Is 30 minutes possible today?

**No.** No timed run has ever been recorded. The only time target in the code is **7 working days**
(`apps/api/src/console/policies.ts:32`). §7 lists the blockers.

---

## 4. Order of work and critical path

```
CRITICAL PATH (do first, in this order where arrows show)
  R6.1 Merge Phase 4 ──► R6.2 One theme vocabulary ──┐
  R6.3 Razorpay key screen ───────────────────────────┤
  R6.4 Test environment ──────────────────────────────┼──► R6.5 Real test-mode checkout on a phone (#112)
                                                      │
                                                      └──► R11.2 First timed 30-minute rehearsal

PARALLEL TRACKS (can start now, independent of each other)
  Track A  Products:    R7.1 variant import ─► R7.2 colour × size (after R6.1)
  Track B  Onboarding:  R8.1 intake logo, R8.3 owner invite, R8.2 client form
  Track C  Testing:     R10.1 CI first-run check, R10.2 browser tests (after R6.4)
  Track D  Ops:         R6.6 production SSL check, R12.x hardening

EXTERNAL (start the paperwork early, it runs in calendar time)
  WhatsApp Business approval (R9.1), SMS/OTP provider (R9.3), Razorpay test account (R6.5)
```

**Why this order:**
- **R6.1 and R6.2 come first:** without them every client store looks the same, which defeats "customised".
- **R6.3 comes next:** without it online payment needs a raw API call.
- **R6.4 is needed before anything is shown to a client or tested on a phone:** there is nowhere safe to test (tracker #112).
- **R6.5 is the first proof that a shopper can actually pay.**
- **Testing required before any production deploy:**
  - the full API suite and the isolation gate (`npm test`, `npm run test:gate` in `apps/api`)
  - R10.2 browser tests, once they exist
  - R6.5 on the test environment

### Critical blockers right now

| # | Blocker | Blocks | Fixed by |
|---|---|---|---|
| B1 | Phase 4 layouts not in `main`; console presets `classic/boutique/grocery/minimal` are ignored by the storefront | Customised stores | R6.1, R6.2 |
| B2 | No screen to enter Razorpay keys (only `PUT /store/razorpay` as store owner) | Online payment setup, #112 step 3 | R6.3 |
| B3 | No test environment | #112 step 2, safe client previews | R6.4 |
| B4 | Real Razorpay test-mode payment never run | Confidence that checkout works | R6.5 |
| B5 | Import has no variant columns | Fast import for fashion/size/colour catalogues | R7.1 |

---

## 4a. Delivery schedule: target 8 December 2026

**Deadline:** all Phase 6–12 tasks are scheduled to finish by **Tuesday 2026-12-08**.

**Window:** 2026-11-30 (Mon) to 2026-12-08 (Tue). That is **7 weekdays**, or **8 working days if Saturday 5 Dec is
worked**.

**Capacity check:** the effort estimates in §6 add up to about **48 developer-days**. Finishing by 8 December
therefore needs about **6 developers working in parallel** (fewer if Saturday is worked). The plan holds only if
that staffing is confirmed by 30 Nov (open decision Q-TEAM, §9). With fewer people, the **Critical** and **High**
tasks are scheduled first, and the rest move past 8 December in the order shown.

**External waits** do not depend on us and **cannot be guaranteed by 8 December**: WhatsApp approval, SMS/DLT
registration, client KYC, DNS. For those tasks the target is "integration built and tested in test mode by 8 Dec;
live once approval arrives". Applications must be submitted on **30 Nov**.

### Day-by-day plan

| Date | Track A: Platform / critical path | Track B: Products | Track C: Onboarding and integrations | Track D: Testing, QA, ops | Milestone |
|---|---|---|---|---|---|
| **Mon 30 Nov** | R6.1 merge Phase 4 (start) · R6.3 Razorpay key screen (start) · R6.4 test environment (start, after Q-ENV) · R6.8 sync branch | R7.3 several images per row | Submit WhatsApp, SMS/DLT, email, Razorpay test-account applications · R8.1 branding from intake | R10.1 CI check and required gate · R12.1 backup restore drill | Decisions Q-ENV, Q-TEAM, Q-VAR, Q-SHIP, Q-SLA answered |
| **Tue 1 Dec** | R6.1 done · R6.3 done · R6.4 done · R6.7 admin URL | R7.1 variant import (start) | R8.1 done · R9.2 email sender | R12.3 backup mount · R12.6 hardening | **Test link live (#112)** |
| **Wed 2 Dec** | R6.2 one theme vocabulary · R6.5 real Razorpay test checkout on a phone · R6.6 production SSL | R7.1 done · R7.4 category screen · R7.5 pack sizes (with R6.1) | R8.3 owner invite · R9.7 webhook secret mandatory | R10.5 Tamil review · R11.3 prepared-data standard | **Phase 6 complete** |
| **Thu 3 Dec** | R11.1 step timers | R7.2 colour × size (start) | R8.4 handover pack · R9.4 delivery rules (start) | R10.2 browser tests (start) · R10.3 create-store test | |
| **Fri 4 Dec** | R11.4 align in-code target | R7.2 (continued) · R7.6 payments in admin | R9.4 done · R9.5 refund test keys · R8.5 guided console flow (start) | R10.2 (continued) · R12.2 scheduler safety | |
| **Sat 5 Dec** | **R11.2 first timed rehearsal** | R7.2 (continued) | R8.5 done · R8.6 demo photos | R10.4 complete QA checks · R10.6 performance re-measure | **First 30-min rehearsal logged in §7** |
| **Mon 7 Dec** | Fix rehearsal findings | R7.2 done | R8.2 client intake form · R9.1 WhatsApp / R9.3 OTP built and tested in test mode | R10.2 done · R12.4 media privacy · R12.5 server hardening · R12.7 wildcard cert | **Phase 7 complete** |
| **Tue 8 Dec** | **R11.5 rehearsals 2 and 3** · full regression (`npm test`, `test:gate`, browser tests) on the test environment | — | R8.2 done · R9.6 credit note PDF | R12.8 admin Tamil · R12.9 per-store rate limits · R12.10 docs refresh | **All tasks closed or carried over with a reason; roadmap statuses updated** |

### Tasks at risk for 8 December

| Task | Why at risk | Fallback if it slips |
|---|---|---|
| R9.1 WhatsApp sender | Meta account and template approval take days | Built and tested in test mode; goes live on approval |
| R9.3 OTP provider | SMS DLT registration can take weeks | Keep OTP optional at checkout; go live on approval |
| R7.2 Colour × size | 3–5 days, touches schema, checkout and storefront | Ship R7.1 (one-option variant import) on 8 Dec; matrix follows |
| R11.5 3 rehearsals ≤ 30 min | Needs all Phase 6–8 tasks finished first; results unknown | Record actual times; open tasks for each slow stage |
| R8.2 Client intake form | 2–3 days, scheduled late | Developer enters the intake from the checklist (R11.3) |
| R12.8 Admin in Tamil | 2 days, lowest priority | Moves to the next cycle |
| R6.4 / R6.5 | Depends on decision Q-ENV and a Razorpay test account on 30 Nov | Escalate the same day; everything after Wed 2 Dec shifts |

**Rule for slips:** if a task misses its date, update its status in §6 and add a new date. Don't silently mark it
done. The 30-minute target counts as met only when §7's log shows it (R11.5).

---

## 5. History: Phases 0–5 (preserved)

Item numbers are the original numbers from each phase report. Acceptance criteria for these items are the ones in
the matching report. **Status was re-checked against source code on 2026-11-28.**

### Phase 0: Pre-work A–E (`PREWORK_REPORT.md`)

| ID | Item | Status | Evidence | References |
|---|---|---|---|---|
| PW-A | Postgres row-level security, two DB roles, boot check | Completed | Code, Tests | `prisma/migrations/20261107090000_row_level_security`, `src/prisma/rls-check.ts`, `scripts/db-app-role.ts`, `test/gate.spec.ts` |
| PW-B | `tenant_id` on variants, composite FK | Completed | Code, Tests | `migrations/20261107100000_variants_tenant_id` |
| PW-C | Fixed vocabulary as enums; money in integer paise | Completed | Code, Tests | `migrations/20261107110000_vocabulary_and_paise` |
| PW-D | Login rate limits, lockout, password reset | Completed (reset email is a stub, see R9.2) | Code, Tests | `src/auth/`, `migrations/20261107120000_login_protection_password_reset`, `test/auth-protection.spec.ts` |
| PW-E | Presigned direct-to-S3 uploads; audit cleanup | Completed | Code, Tests | `src/uploads/`, `test/uploads.spec.ts` |

### Phase 1: Multi-store foundation (`PHASE1_REPORT.md`)

| ID | Item | Status | Evidence | References |
|---|---|---|---|---|
| P1-1 | Prisma schema, migrations, compose, monorepo | Completed | Code | `apps/api/prisma/`, `docker-compose.yml` |
| P1-2 | Host → store middleware, Redis cache | Completed | Code, Tests | `src/tenancy/`, `test/tenant-resolution.spec.ts` |
| P1-3 | Tenant-scoping Prisma extension, audited superadmin bypass | Completed | Code, Tests | `src/prisma/tenant-scope.ts`, `test/tenant-scope.spec.ts` |
| P1-4 | JWT and rotating refresh tokens, role guards | Completed | Code, Tests | `src/auth/`, `test/auth.spec.ts` |
| P1-5 | Superadmin API: create, list, suspend, expiry | Completed | Code, Tests | `src/superadmin/`, `test/superadmin.spec.ts` |
| P1-6 | AES-256-GCM encryption of Razorpay keys | Completed | Code, Tests | `src/crypto/`, `test/store-secrets.spec.ts` |
| P1-7 | Tenant isolation gate test and CI workflow | Completed. First GitHub Actions run NOT VERIFIED | Code, Tests | `test/gate.spec.ts`, `.github/workflows/ci.yml` |

**Phase 1 open items (from report §"Decisions"), carried forward:**
- #2 compile-time safety and #3 variants: resolved by PW-A and PW-B.
- #8 login audit: partially done. Lockout and password reset are audited (`src/auth/auth.service.ts:97,162`); successful logins and token refreshes are not. See R12.6.
- #9 hardening: rate limits and password reset were done in PW-D. Not found in the API: helmet/CORS and request-size limits (they may live in Caddy: NOT VERIFIED) and a key-rotation procedure. Redis persistence is configured (`infra/redis`, `appendonly yes`). See R12.6.
- #15 make the gate a required check: see R10.1.
- #1 Prisma upgrade and #10 token re-check: see §9, open decisions.

### Phase 2: Store admin (`PHASE2_REPORT.md`)

| ID | Item | Status | Evidence | References |
|---|---|---|---|---|
| P2-1 | Store admin API (products, orders, customers, coupons, pages, settings, theme, dashboard) | Completed | Code, Tests | `src/catalog`, `src/orders`, `src/crm`, `src/content`, `src/settings`, `test/admin-api.spec.ts` |
| P2-2 | CSV/XLSX product import | Partially Completed: no variant columns, one image per row, top-level categories only | Code, Tests | `src/imports/import-parse.ts:6`, `test/import.spec.ts` → R7.1, R7.3 |
| P2-3 | Bulk image upload, WebP worker | Completed | Code, Tests | `src/media/media-worker.ts`, `test/media.spec.ts` |
| P2-4 | Fair-use limits | Completed | Code, Tests | `src/limits/`, `test/limits.spec.ts` |
| P2-5 | Mobile-first admin UI | Partially Completed: no category screen, no Razorpay screen, English only | Code (no UI tests) | `apps/admin/app/(app)/*` (15 screens) → R6.3, R7.4, R12.8 |
| P2-6 | Gate covers all new models and routes | Completed | Code, Tests | `test/gate.spec.ts` |
| P2-7 | Demo store seed | Completed | Code, Tests | `scripts/seed-demo.ts`, `test/seed.spec.ts` |

**Phase 2 open items:** #11 admin browser tests → R10.2. #1–6 and #12 → §9.

### Phase 3: Storefront V1 and checkout (`PHASE3_REPORT.md`, PR #2)

| ID | Item | Status | Evidence | References |
|---|---|---|---|---|
| P3-1 | Storefront scaffold, store from Host, preview mode | Completed | Code | `apps/storefront/middleware.ts`, `src/storefront/catalog.controller.ts` |
| P3-2 | Layout V1 pages (home, category, product, search, cart) | Completed (one layout only) | Code | `apps/storefront/app/page.tsx` |
| P3-3 | Guest checkout, shipping, coupon, COD, OTP | Partially Completed: OTP provider is a stub | Code, Tests | `src/storefront/checkout.service.ts`, `pricing.ts`, `otp.ts:7`, `test/checkout.spec.ts` → R9.3 |
| P3-4 | Razorpay order, signature check, webhook | Not Verified: tested only against a fake Razorpay | Code, Tests (fake) | `src/storefront/razorpay.service.ts`, `payments.service.ts`, `test/razorpay-fake.ts` → R6.5 |
| P3-5 | No oversell, order numbers, unpaid-order expiry | Completed | Code, Tests | `checkout.service.ts:131-133` |
| P3-6 | GST invoice PDF | Completed (confirm rates, §9) | Code, Tests | `src/storefront/invoice.service.ts`, `test/invoice.spec.ts` |
| P3-7 | Notifications (owner, customer, low stock, weekly) | Partially Completed: senders are stubs | Code, Tests | `src/notifications/senders.ts:4` → R9.1, R9.2 |
| P3-8 | Theme to CSS variables; Tamil/English toggle | Partially Completed: palettes and fonts do not match the console vocabulary | Code | `apps/storefront/lib/theme.ts`, `messages/ta.json` → R6.2 |
| P3-9 | SEO, sitemap, robots, policy pages | Completed | Code | `apps/storefront/app/` |
| P3-10 | Rate limits on checkout, OTP, lookup | Completed | Code, Tests | `test/storefront-limits.spec.ts` |
| P3-11 | Performance (Lighthouse 92–99) | Not Verified (report figure only, not re-measured) | Report | `docs/lighthouse/s3/` |
| P3-12 | Pricing and gate tests | Completed | Code, Tests | `test/pricing.spec.ts`, `test/gate.spec.ts` |

**Phase 3 "Stubbed / not real yet":** messages → R9.1 / R9.2, OTP → R9.3, real Razorpay → R6.5, placeholder photos → R8.6.
**Phase 3 decisions 1–13:** §9. #3 colour × size → R7.2. #12 payments in admin → R7.6. #13 browser tests → R10.2.

### Phase 4: Theme engine and layouts V2/V3 (`PHASE4_REPORT.md` on branch `claude/intelligent-edison-uezeqo`)

**Not in `main`.** Built on 2026-11-09 and never merged. Main has no `theme_engine` migration and no
`apps/storefront/layouts/`. Commit `02ecbda` on the branch already maps the console's layout names
(boutique→V1, grocery→V2, classic/minimal→V3).

| ID | Item | Status | Evidence | References |
|---|---|---|---|---|
| P4-1 | Theme engine: validated vocabulary, CSS variables, layout dispatch, owner editor with live preview | Partially Completed: on branch only | Code (branch), Tests (branch, per report) | branch: `apps/api/src/theme/theme-config.ts`, `apps/storefront/lib/theme.ts`, migration `20261109090000_theme_engine` |
| P4-2 | Layout V2 Food/Grocery (stepper grid, pack sizes, mini-cart) | Partially Completed: on branch only | Code (branch) | branch: `apps/storefront/layouts/v2/` |
| P4-3 | Layout V3 General retail/Jewellery plus accessibility pass | Partially Completed: on branch only | Code (branch) | branch: `apps/storefront/layouts/v3/` |
| P4-4 | Visitor theme switcher | Partially Completed: on branch only | Code (branch) | `options.switcherEnabled` |
| P4-5 | Theme tests, axe and tap-target sweep | Partially Completed: on branch only | Tests (branch) | branch: `apps/storefront/test/theme.test.ts`, `a11y.mjs` |
| P4-6 | Three demo stores, screenshots, report | Partially Completed: on branch only | Docs (branch) | branch: `docs/screenshots/s4/` |

→ Merging is task **R6.1**.

### Phase 5: Developer console (`PHASE5_REPORT.md`, PR #1)

| ID | Item | Status | Evidence | References |
|---|---|---|---|---|
| P5-1 | Policy page generator | Completed | Code, Tests | `src/console/policies.ts`, `test/console-policies.spec.ts` |
| P5-2 | Create store from intake (store, owner, settings, theme in one transaction) | Completed. Intake logo URL is not applied | Code, Tests | `src/console/intake.service.ts:109-123`, `test/console-intake.spec.ts` → R8.1 |
| P5-3 | Import and images from console | Completed (same import limits as P2-2) | Code, Tests | `src/console/build.*`, `test/console-build.spec.ts` |
| P5-4 | Domain mapping, DNS and SSL checks | Partially Completed: manual re-checks; production certificate issuance NOT VERIFIED | Code, Tests | `src/console/domain.service.ts`, `infra/tls-ask/server.js`, `test/console-domain.spec.ts` → R6.6 |
| P5-5 | QA runner (7 checks) | Partially Completed: owner alert passes on the stub sender, Lighthouse skipped | Code, Tests | `src/console/qa.service.ts:78,141`, `qa-probes.ts:249` → R10.4 |
| P5-6 | Console UI, lifecycle, impersonation, refunds | Completed (refund gateway is a stub without platform keys) | Code, Tests | `apps/console`, `src/console/stores.*`, `refund-gateway.ts:24` |
| P5-7 | Scheduled jobs (chasers, parking, renewals, backup check) | Completed (messages stubbed; backup mount missing) | Code, Tests | `src/jobs/platform-jobs.service.ts`, `test/console-jobs.spec.ts` → R12.3 |
| P5-8 | Outbound n8n webhooks | Completed (inactive until `N8N_WEBHOOK_URL` is set) | Code, Tests | `src/console/webhooks.ts`, `test/console-webhooks.spec.ts` |
| P5-9 | New test suites | Completed (614 tests per report; not re-run) | Tests | `apps/api/test/console-*.spec.ts` |

**Phase 5 "Integrations still stubbed":** WhatsApp/email → R9.1 / R9.2, Lighthouse → R10.4, refund API → R9.5,
credit note PDF → R9.6, n8n → config only, backup status → R12.3.
**Phase 5 decisions 1–12:** §9. #10 admin URL in production → R6.7.

### Deployment work already merged

| ID | Item | Status | Evidence | References |
|---|---|---|---|---|
| D-1 | Production compose, Caddy, tls-ask, backup, monitoring | Completed | Code, Deployed | `deploy/`, `infra/` |
| D-2 | Replace MinIO with RustFS (S8) | Completed | Code, Deployed (per commit history) | PR #3, `docs/runbooks/RUSTFS.md` |
| D-3 | Pass `DATABASE_ADMIN_URL` to api and migrate | Completed | Code, Deployed | PR #5 |
| D-4 | Sync server-only fixes; Redis noeviction | Completed | Code, Deployed | PR #6, commit `7911dfb` |
| D-5 | Console login loop fix (admin/console `/api` routes) | Completed on `origin/main`, **not pulled into local `arshad`** | Code | PR #7 |

---

## 6. Remaining work: Phases 6–12

### Phase 6: Integrate and unblock (critical path)

Objective: one `main` that can make a store look different per client, take a real test payment, and be tested
safely.

| ID | Task and description | Priority | Status | Depends on | Effort | Acceptance criteria | References |
|---|---|---|---|---|---|---|---|
| R6.1 | **Merge Phase 4 into main.** Rebase or merge `claude/intelligent-edison-uezeqo` onto current `main` (after PRs #3, #5–#7); resolve conflicts in `schema.prisma`, `settings.ts`, `catalog.service.ts`, CI. | Critical | Pending | — | 1–2 d | Migration `theme_engine` applies on a fresh DB; `npm test` and `npm run test:gate` pass; storefront `npm test` passes; V1/V2/V3 render | P4-1…P4-6, commit `02ecbda` |
| R6.2 | **One theme vocabulary.** Console presets, admin look screen and storefront use the same validated IDs; reject unknown values. | Critical | Pending | R6.1 | 0.5–1 d | Choosing Boutique / Grocery / Minimal in the console gives visibly different storefronts; `PUT /store/theme` returns 400 on unknown IDs | `src/console/layouts.ts`, `apps/admin/app/(app)/settings/theme/page.tsx`, `apps/storefront/lib/theme.ts`, `src/settings/settings.ts:30-36` |
| R6.3 | **Razorpay key screen.** Key ID, secret and webhook secret fields in the console (per store) and the store admin, with a "verify keys" button; allow test keys while BUILDING. | Critical | Pending | — | 1 d | A developer sets keys without an API call; keys never shown back; QA `payment_keys` passes with test keys before go-live and requires live keys at go-live | `src/store/store.controller.ts:31`, `src/console/qa-probes.ts` |
| R6.4 | **Test environment.** Separate stack (e.g. `*.test.store.bmtechx.in`) with its own DB, Redis and storage; never shares data or keys with production. | Critical | Pending | Decision Q-ENV (§9) | 1–2 d | A phone can open a test store over HTTPS; production containers and data untouched; documented in `docs/runbooks/` | `deploy/docker-compose.prod.yml`, `infra/caddy/` · tracker #112 step 2 |
| R6.5 | **Real Razorpay test-mode checkout on a phone.** Browse → cart → checkout → pay (test mode) → PAID → webhook received → invoice. | Critical | Blocked (by R6.3, R6.4) | R6.3, R6.4, Razorpay test account | 0.5–1 d | Recorded run with the order marked PAID through both verify and webhook; screenshots from a phone; list of anything missing written to tracker | P3-4 · tracker #112 steps 3–4 / Order 10 |
| R6.6 | **Production SSL for new stores.** Commit the nginx config (production terminates TLS in nginx, `Caddyfile.behindnginx`); prove a new subdomain and a custom domain both get valid HTTPS; tls-ask should refuse inactive stores. | High | Not Verified | — | 1 d | New store subdomain and a test custom domain serve valid certificates; tls-ask returns deny for PARKED/SUSPENDED | `infra/caddy/Caddyfile.behindnginx`, `infra/tls-ask/server.js:73`, `docs/runbooks/DNS.md` |
| R6.7 | **Confirm and fix the store admin URL in production.** Phase 5 guessed `/admin`; an unmerged remote branch `fix/store-admin-at-admin-path` exists (not inspected). | High | Not Verified | — | 0.5 d | Owner can log in at the documented admin URL for a subdomain store and a custom-domain store | PHASE5 decision #10, `ADMIN_URL_TEMPLATE` |
| R6.8 | **Sync local branch.** Pull PR #7 into working branches; decide whether the local Postgres port change (5433) should be committed. | Medium | Pending | — | 0.1 d | Local `arshad` contains `5c84cac`; port choice documented | commit `fb5f416`, PR #7 |

### Phase 7: Products, variants and catalogue

| ID | Task and description | Priority | Status | Depends on | Effort | Acceptance criteria | References |
|---|---|---|---|---|---|---|---|
| R7.1 | **Variants in bulk import.** Add variant columns (option name/value, price difference, stock, SKU) to CSV/XLSX import and template. | High | Pending | — | 1–2 d | A sheet with size variants imports in one pass; dry-run reports variant errors per row; tests added | `src/imports/import-parse.ts:6`, `product-import.service.ts`, `schema.prisma:206` |
| R7.2 | **Colour × size combinations.** Two-option variants (matrix) with stock per combination; storefront picker; cart line per combination. | High | Pending | R6.1, R7.1, decision Q-VAR | 3–5 d | A product with 3 colours × 4 sizes can be imported, shown, bought, and stock decrements on the right combination; gate covers new tables | PHASE3 decision #3, `apps/storefront/components/buy-box.tsx:15` |
| R7.3 | **Several images per product in import.** Allow multiple `image_filename` values per row. | Medium | Pending | — | 0.5 d | A row with 3 file names attaches 3 images in order | `import-parse.ts` |
| R7.4 | **Category management screen** in store admin (create, rename, order, image, Tamil name). | Medium | Pending | R6.1 (adds `name_ta`) | 1 d | Owner manages categories without import; API `/store/categories` already exists | `apps/admin/app/(app)/` |
| R7.5 | **Pack sizes for grocery** (from Phase 4). | Medium | Pending | R6.1 | in R6.1 | Pack sizes work on main after merge | P4-2 |
| R7.6 | **Payments and webhook events visible in admin.** | Low | Pending | — | 1 d | Order page lists payment attempts and webhook events | PHASE3 decision #12 |

### Phase 8: Client onboarding and handover

| ID | Task and description | Priority | Status | Depends on | Effort | Acceptance criteria | References |
|---|---|---|---|---|---|---|---|
| R8.1 | **Apply branding from intake automatically.** Use intake logo (upload, not just URL) and description in the store theme and pages. | High | Pending | R6.2 | 0.5–1 d | A store created from an intake shows the client logo and description with no extra step | `src/console/intake.service.ts`, `layouts.ts` (`themeFor` ignores `logoUrl`) |
| R8.2 | **Client-facing intake form.** A link the client (or sales) fills in, with logo, photo and product-sheet uploads; feeds the console intake for developer review. | Medium | Pending | R8.1 | 2–3 d | Developer receives a complete intake without retyping; required fields enforced; files stored per store | `src/console/intake.ts:44-57`, `apps/console/components/intake-form.tsx` |
| R8.3 | **Owner invite and first login.** Email/WhatsApp invite link instead of a pasted password; force password change on first login. | High | Pending | R9.1 or R9.2 | 1 d | Owner sets own password from a one-time link; no password is shown in the console | `intake.service.ts:107,120` |
| R8.4 | **Handover pack.** Generated summary: store URL, admin URL, how-to guide (Tamil and English), support contact, what is still pending (domain, KYC). | High | Pending | R8.3, R6.7 | 1 d | Go-live produces a handover message/PDF; listed in the store's console page | `src/console/stores.service.ts` (go-live) |
| R8.5 | **Guided "next step" flow in the console.** One checklist from intake to go-live, usable by a non-developer. | Medium | Pending | R6.3, R8.1 | 1–2 d | A non-developer team member creates a test store following the console alone (observed once) | `apps/console/components/store/*` |
| R8.6 | **Real product photos for demo stores.** | Low | Pending | — | 0.5 d | Demo stores use licensed product photos | PHASE3 "Stubbed" |

### Phase 9: Payment, messaging and shipping integrations

| ID | Task and description | Priority | Status | Depends on | Effort | Acceptance criteria | References |
|---|---|---|---|---|---|---|---|
| R9.1 | **WhatsApp sender.** Implement the WhatsApp Business API behind both notifier layers (orders and platform notices). | High | Blocked (external approval) | WhatsApp Business account and template approval | 2 d + waiting | Owner order alert and `store_live` message arrive on a real phone; QA owner-alert check uses it | `src/notifications/senders.ts:4`, `src/notify/notifier.ts` |
| R9.2 | **Email sender.** Real transport (e.g. SES/SMTP) for password reset, invites, notices. | High | Pending | Provider choice | 1 d | Password reset email arrives; bounces logged | `src/mail/mailer.service.ts:10` |
| R9.3 | **OTP provider.** SMS or WhatsApp OTP for checkout. | Medium | Blocked (provider/DLT registration) | Provider choice | 1 d + waiting | Shopper receives OTP; rate limits unchanged | `src/storefront/otp.ts:7` |
| R9.4 | **Delivery rules.** Pincode/zone serviceability and rates. | Medium | Pending | Decision Q-SHIP | 2 d | Checkout refuses or prices by pincode as configured | `src/storefront/pricing.ts:33-42` |
| R9.5 | **Platform refund API with test keys.** | Low | Pending | Platform Razorpay test keys | 0.5 d | Refund case produces a real test-mode refund id | `src/console/refund-gateway.ts:24` |
| R9.6 | **Credit note as server-side PDF with CGST/SGST split.** | Low | Pending | CA confirmation | 1 d | PDF matches the CA's format | `RefundService.creditNoteHtml` |
| R9.7 | **Make the Razorpay webhook secret mandatory with keys.** | Medium | Pending | Decision (PHASE3 #5) | 0.5 d | Online payments cannot be enabled without a webhook secret | PHASE3 decision #5 |

### Phase 10: Automated testing and QA

| ID | Task and description | Priority | Status | Depends on | Effort | Acceptance criteria | References |
|---|---|---|---|---|---|---|---|
| R10.1 | **Confirm CI on GitHub and make the gate required.** | High | Not Verified | Repo admin rights | 0.5 d | Latest `main` shows green Actions; "Tenant isolation gate" is a required check | `.github/workflows/ci.yml`, PHASE1 #15 |
| R10.2 | **Browser end-to-end tests (Playwright) in CI.** Console creates a store → storefront at phone width → cart → checkout (COD and Razorpay test double) → admin sees the order. | High | Pending | R6.1, R6.4 | 2–3 d | Tests run in CI and fail when the flow breaks; covers admin login and product add | None today (no Playwright/Cypress in repo) |
| R10.3 | **End-to-end "create store" test.** One automated test from intake JSON to go-live-ready on the API, timing each step. | High | Pending | R6.3 | 1 d | Test asserts all stages complete and records durations | `test/console-intake.spec.ts` (API part exists) |
| R10.4 | **Complete QA checks.** Lighthouse installed where QA runs; owner-alert check fails on the stub sender in production; option to block go-live on skipped checks. | Medium | Partially Completed | R9.1, R6.4 | 0.5–1 d | No "skipped" checks on production QA runs | `src/console/qa.service.ts:78,141`, `qa-probes.ts:249` |
| R10.5 | **Tamil text review** of storefront and admin wording. | Medium | Pending | — | 0.5 d | List of fixes made and applied; files listed | tracker Order 5, `apps/storefront/messages/ta.json`, `scripts/seed-demo.ts` |
| R10.6 | **Re-measure storefront performance on the test environment.** | Low | Not Verified | R6.4 | 0.5 d | Lighthouse mobile ≥ 90 on home, category, product | P3-11 |

### Phase 11: 30-minute store creation (see §7)

| ID | Task and description | Priority | Status | Depends on | Effort | Acceptance criteria | References |
|---|---|---|---|---|---|---|---|
| R11.1 | **Step timers in the console.** Record start/end per stage per store; show total platform time vs external waiting time. | High | Pending | — | 1 d | Each store page shows stage durations; data exportable | `src/console/stage.ts` |
| R11.2 | **First timed rehearsal.** Use a prepared sample client (20 products, 1 variant product, logo, COD + Razorpay test). | High | Pending | R6.1–R6.5 | 0.5 d | Times recorded in §7 log; blockers raised as tasks | §7 |
| R11.3 | **Prepared-data standard.** Client data checklist and sample sheet so information arrives ready. | High | Pending | R7.1 | 0.5 d | Checklist and sample files in `docs/`; used in R11.2 | `GET /superadmin/console/import/template` |
| R11.4 | **Align the in-code target.** Console and policies say 7 working days; Phase 5 report says ~3 hours; vision says 30 minutes. Decide what the client-facing promise is versus the internal target. | Medium | Pending | Decision Q-SLA | 0.5 d | One documented target; code/policy text match | `src/console/policies.ts:32`, `PHASE5_REPORT.md:3` |
| R11.5 | **Repeat rehearsals until the target holds** for 3 consecutive stores. | High | Pending | R11.2 | ongoing | 3 consecutive rehearsals ≤ 30 min platform time | §7 |

### Phase 12: Operational reliability, security and scale

| ID | Task and description | Priority | Status | Depends on | Effort | Acceptance criteria | References |
|---|---|---|---|---|---|---|---|
| R12.1 | **Backup restore drill on production backups.** | High | Not Verified | — | 0.5 d | Documented restore of last night's backup into a scratch DB | `infra/backup/`, `docs/runbooks/BACKUP_RESTORE.md` |
| R12.2 | **Scheduler safe with more than one API instance** (or move jobs and media worker to a separate worker container). | Medium | Pending | — | 1–2 d | Two API instances do not run jobs twice | `src/jobs/*`, `src/media/media-worker.ts` |
| R12.3 | **Backup status mount** for the backup-check job. | Medium | Pending | — | 0.25 d | Console shows real backup status | `deploy/docker-compose.prod.yml`, PHASE5 stub table |
| R12.4 | **Media privacy.** Decide whether private files (invoices, imports) must not be publicly readable at `media.<domain>`. | Medium | Pending | Decision | 1 d | Private objects need signed URLs | `infra/caddy/Caddyfile` |
| R12.5 | **Server access hardening.** Limit `deploy` user's passwordless sudo; key rotation procedure for `ENCRYPTION_KEY`. | Medium | Pending | — | 1 d | Runbook updated; rotation rehearsed on test env | `docs/runbooks/SERVER_HARDENING.md`, ciphertext prefix `v1.` |
| R12.6 | **Remaining Phase 1 hardening.** Audit successful logins and token refreshes; confirm security headers, CORS and request-size limits (API or proxy). | Medium | Partially Completed | — | 1 d | Audit rows for login/refresh; headers verified on test env | PHASE1 #8, #9, `src/auth/auth.service.ts` |
| R12.7 | **Certificate scale.** Let's Encrypt allows 50 new certificates/week per registered domain; plan wildcard cert for `*.store.bmtechx.in`. | Medium | Pending | R6.6 | 0.5–1 d | Wildcard covers subdomains; on-demand only for custom domains | `infra/caddy/Caddyfile.wildcard` (marked untested) |
| R12.8 | **Store admin in Tamil.** | Low | Pending | Decision | 2 d | Admin language toggle with full Tamil strings | `apps/admin/app/layout.tsx` (`lang="en"`) |
| R12.9 | **Per-store IP rate limits** so shoppers on one network do not block each other across stores. | Low | Pending | — | 0.5 d | Limits keyed by store + IP | `rl:login:ip:`, `checkout:ip` |
| R12.10 | **Docs refresh.** Update `DEPLOY_REPORT.md` (says frontends don't exist), `DNS.md` (SQL stopgap now replaced by console), README run notes. | Low | Pending | R6.4, R6.6 | 0.5 d | Docs match the code and server | `docs/runbooks/DEPLOY_REPORT.md`, `docs/runbooks/DNS.md` |

---

## 7. The 30-minute target

**Scope:** platform setup time only, starting from **prepared** client information (R11.3). It excludes Razorpay
KYC, DNS propagation, WhatsApp approval and client response time (§8).
**Status: NOT ACHIEVED and NOT YET MEASURED.**

| # | Stage | Proposed time budget | Done when | Current state (2026-11-28) | Blocking tasks |
|---|---|---|---|---|---|
| 1 | Client information entry | 5 min | Intake saved with all 12 required fields; logo and product sheet attached | Developer-only form or pasted JSON; logo is URL only | R8.1, R8.2, R11.3 |
| 2 | Store creation | 1 min | Store BUILDING, owner account, settings, policies created | **Automated** (one transaction) | — |
| 3 | Branding and theme | 3 min | Template chosen, logo and colours visible on storefront | Only colours reach the storefront; one layout | R6.1, R6.2, R8.1 |
| 4 | Product import and images | 8 min | All products, images and variants live; dry-run clean | Simple products: works. Variants: manual | R7.1, R7.2, R7.3 |
| 5 | Payment and shipping | 4 min | Shipping and COD set; Razorpay keys verified (test or live) | Shipping/COD from intake; **no Razorpay screen** | R6.3 |
| 6 | Storefront generation | 1 min | Preview URL opens on a phone | Automatic on store creation; no test environment | R6.4 |
| 7 | QA | 5 min | QA run passes with no failed checks; manual phone check of cart and checkout | QA automated but owner alert and Lighthouse are not real | R10.4, R6.5 |
| 8 | Client handover | 3 min | Invite sent, handover pack delivered | Password shown once, sent by hand | R8.3, R8.4 |
| | **Total** | **30 min** | | | |

**Proposed time budget** is a starting split to be corrected by rehearsals. It is not a measured figure.

### Rehearsal log (fill in during R11.2 / R11.5)

| Date | Store / sample | Stage 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Total platform time | External waits noted | Notes / new tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | — | — | — | No rehearsal run yet |

---

## 8. External dependencies (tracked outside the 30 minutes)

| Dependency | Typical wait | Needed by | Owner | Status |
|---|---|---|---|---|
| Client Razorpay KYC and live keys | days | Go-live with online payment | Client | Per store |
| BM TechX Razorpay **test** account / keys | hours | R6.5, R9.5 | BM TechX | NOT VERIFIED whether one exists |
| DNS change by client (CNAME to `store.bmtechx.in`) | minutes–48 h | Custom domain | Client | Per store |
| WhatsApp Business API account and template approval | days | R9.1, R8.3 | BM TechX | Pending |
| SMS/OTP provider and DLT registration (India) | days–weeks | R9.3 | BM TechX | Pending |
| Email provider and domain verification | hours | R9.2 | BM TechX | Pending |
| Client's CA confirming GST rates / HSN | days | Invoice correctness | Client | Per store |
| GitHub repo admin (branch protection) | hours | R10.1 | BM TechX | Pending |

---

## 9. Open decisions

**Carried forward from the reports.** These are unanswered unless marked otherwise.

| ID | Question | Source |
|---|---|---|
| Q-P1-1 | Stay on Prisma 6.x or move to 7.x? | PHASE1 #1 |
| Q-P1-7 | Audit every superadmin read, or writes only? | PHASE1 #7 |
| Q-P1-10 | Is a 15-minute window for deactivated users acceptable? | PHASE1 #10 |
| Q-P2-1 | Import default "make live" vs draft? | PHASE2 #1 |
| Q-P2-3 | Delete original images after processing (saves storage) or keep? | PHASE2 #3 |
| Q-P2-12 | Should staff be read-only on prices/customers? | PHASE2 #12 |
| Q-P3-1 | GST rates per HSN (default 5%) | PHASE3 #1 |
| Q-P3-2 | Prices inclusive of GST everywhere? | PHASE3 #2 |
| Q-P3-4 | Hold stock 30 min for unpaid online orders, or not at all? | PHASE3 #4 |
| Q-P3-6 | Separate invoice series / financial-year reset? | PHASE3 #6 |
| Q-P3-8 | Customer identity = phone (overwrites name)? | PHASE3 #8 |
| Q-P3-11 | Expiring order-status links? | PHASE3 #11 |
| Q-P5-1 | Keep the store-setup guarantee on shopper-facing refund page? | PHASE5 #1 |
| Q-P5-2 | Default return terms (48 h damaged/wrong) | PHASE5 #2 |
| Q-P5-3 | Do Saturdays count as working days? | PHASE5 #3 |
| Q-P5-5 | Block go-live on skipped QA checks? | PHASE5 #5 |
| Q-P5-7 | Default plan STANDARD and COD off for intake stores? | PHASE5 #7 |

**New decisions:**

| ID | Question | Why it matters |
|---|---|---|
| Q-TEAM | How many developers work on this until 8 Dec, and is Saturday 5 Dec a working day? | About 48 developer-days must fit before 8 Dec (§4a) |
| Q-ENV | Where does the test environment live: a separate server, or the same server with an isolated stack? | R6.4; "do not touch live" rule |
| Q-VAR | Two-option variants enough, or more (e.g. colour × size × fabric)? | R7.2 design |
| Q-SHIP | Pincode/zone rules or courier integration (which courier)? | R9.4 |
| Q-SLA | Client promise (7 working days today) vs internal target (30 min) | R11.4 |
| Q-NONDEV | Must a non-developer complete store creation alone? | R8.5 scope |
| Q-PLAN | What exactly is in the "full store plan" artifact referenced in tracker #112? | It could not be opened from this account; may contain tasks not listed here |

---

## 10. Duplicates consolidated

| Kept as | Merged references |
|---|---|
| R6.5 | P3-4 "real Razorpay not verified", PHASE3 "Stubbed" Razorpay line, tracker #112 step 3 |
| R10.2 | PHASE2 #11 (admin UI tests), PHASE3 #13 (storefront browser tests) |
| R9.1 / R9.2 | P3-7 senders, PHASE5 "Integrations still stubbed" (two notifier layers) |
| R12.6 | PHASE1 #8 (login audit), PHASE1 #9 (hardening list) |
| R6.1 | P4-1…P4-6 (the whole unmerged branch) |
| R7.2 | PHASE3 decision #3 (variant matrix, "Phase 4 question") |

---

## 11. Task counts (this file)

| Group | Completed | Partially Completed | Not Verified | Pending | Blocked | Total |
|---|---|---|---|---|---|---|
| History (PW, P1–P5, D) | 36 | 13 | 2 | 0 | 0 | 51 |
| New (R6–R12) | 0 | 2 | 5 | 38 | 3 | 48 |
| **All** | **36** | **15** | **7** | **38** | **3** | **99** |

## 12. External references

- Tracker **#112 / Order 10**: "BM TechX store: ready on test" → R6.4, R6.5
- Tracker **Order 5**: "Tamil review" → R10.5
- GitHub PRs: #1 (S5 console), #2 (S3 storefront), #3 (S8 RustFS), #5, #6, #7 (deploy fixes)
- Unmerged branches: `claude/intelligent-edison-uezeqo` (Phase 4), `fix/store-admin-at-admin-path` (not inspected)
