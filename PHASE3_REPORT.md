# Phase 3 report — Storefront V1 + checkout

Status: **all 12 numbered items built, one commit each (plus two housekeeping commits), full suite and gate green
locally.** Branch `claude/dreamy-keller-0vzqla`, PR "S3: Storefront V1 + checkout". Phase 4 was not started.

> Same caveat as before: GitHub Actions has not run from this sandbox. CI gained a "Storefront typecheck and build"
> step; the first push of this branch runs it.

| # | Commit | What |
|---|--------|------|
| 1 | `feat(storefront): Next.js storefront scaffold …` | tenant from Host, friendly unknown/suspended page, BUILDING previews, public catalogue API |
| 2 | `feat(storefront): Layout V1 pages …` | home, category + filters/sort, product, search, cart; V1 demo seed |
| 3 | `feat(checkout): guest checkout …` | schema, pricing, quote, OTP stub, shipping/coupon/COD, confirmation + track pages |
| 4 | `feat(payments): Razorpay …` | tenant keys, signature verify, webhook idempotency, Razorpay test double, jobs |
| 5 | `feat(orders): no oversell …` | conditional stock decrements, order_no sequence, unpaid-order expiry, checkout suite |
| 6 | `feat(invoice): GST invoice PDF …` | pdfkit, HSN, CGST/SGST vs IGST, customer + owner download |
| 7 | `test(notifications): …` | sender interfaces, console stubs, owner/customer/low-stock/weekly, masked logs |
| 8 | `feat(theme): …` | theme_configs → CSS custom properties; Tamil/English toggle; admin look settings aligned |
| 9 | `feat(seo): …` | metadata, OG, JSON-LD, per-tenant sitemap.xml / robots.txt, policy pages |
| 10 | `test(limits): …` | rate limits on checkout, OTP, order lookup |
| 11 | `perf(storefront): …` | next/image, priority hints, inlined CSS, contrast; Lighthouse 92–99 |
| 12 | `test(api): …` | pricing edge cases, gate extended to the new models and storefront routes, test-env fix |
| — | `design(storefront): …`, `chore: remove stray root app/` | screenshots + critique fixes; a stale directory that broke `next build` |

## How to run locally

```bash
docker compose up -d                                   # Postgres 16, Redis 7, MinIO   (or: see "no Docker" below)
cp apps/api/.env.example apps/api/.env                 # fill JWT_ACCESS_SECRET, ENCRYPTION_KEY, app-role password
cp apps/storefront/.env.example apps/storefront/.env   # API_URL=http://localhost:3000, PLATFORM_BASE_DOMAIN=localhost
npm ci
npm run migrate:deploy -w apps/api && npm run db:app-role -w apps/api
npm run seed:demo -w apps/api                          # "Sri Lakshmi Silks": V1 theme, 25 products with photos, variants, orders
npm run start:dev -w apps/api                          # API :3000
npm run dev -w apps/storefront                         # storefront :3002  ->  http://demo.localhost:3002
npm run dev -w apps/admin                              # admin :3001      ->  http://demo.localhost:3001 (owner@demo.test / demo-password-123)
```

No Docker (what this sandbox used): `npm run dev:storage -w apps/api` is a disk-backed S3 double on :9100
(`S3_ENDPOINT=http://127.0.0.1:9100 S3_BUCKET=bmstore S3_FORCE_PATH_STYLE=1 S3_PUBLIC_BASE_URL=http://localhost:9100/bmstore`,
any key/secret), and `npx ts-node test/razorpay-fake.ts` (in `apps/api`) a Razorpay double on :9200
(`RAZORPAY_API_BASE=http://127.0.0.1:9200`; `POST /__test/pay/<order_id>` simulates a captured payment and returns the
signed callback). Online payment in a real browser needs real **test-mode** keys from the store's own Razorpay
dashboard (`PUT /store/razorpay`, or the admin), because Checkout.js talks to Razorpay directly.

Tests: `npm test` and `npm run test:gate` in `apps/api` (Postgres + Redis; `bmstore_test`, Redis db 15). Lighthouse:
`docs/lighthouse/s3/README.md`. Storefront: `npm run build -w apps/storefront`.

## What was built

### 1. Tenant from Host (`apps/storefront/middleware.ts`, `apps/api/src/storefront/catalog.controller.ts`)

The storefront runs on the Node.js middleware runtime so it can send the shopper's real Host upstream (undici's
`fetch` drops a custom Host). Every page asks `GET /storefront/status` once per host per 30 s: unknown host → rewrite
to the friendly page with 404, `SUSPENDED` / `PARKED` → friendly page with 403 (the API's own message), API down →
503 page, `BUILDING` → served with `X-Robots-Tag: noindex, nofollow`, `<meta name="robots">` and the preview ribbon.
Server components call the API through `lib/server/api.ts` (`http.request` with Host) behind a 60 s per-host data
cache; this is the ISR equivalent for a multi-tenant app where every store shares the same paths (the Next full-route
cache would serve store A's home to store B). Production: Caddy already routes `/api/*` on the store host to the API
and everything else to the storefront; the storefront reads `API_URL` or the compose file's `API_INTERNAL_URL`.

### 2. Layout V1 Fashion/Textile

Home (offer strip from `homepageSections[type=offer_strip]` or the real shipping rule; hero banner or typographic
hero; category circles; "Fresh in" = newest ACTIVE; "Most ordered" = units sold in the last 90 days from real orders,
hidden when there are none; contact band with call / WhatsApp). Category listing with sub-category chips, facets
computed from the current result set (price range, variant options), in-stock filter, sort, pagination, breadcrumbs
and BreadcrumbList JSON-LD; `/c/all` for everything; `/search?q=`. Product page: swipe gallery with thumbnails,
colour swatches (name → swatch colour for common saree colours, EN and TA) or chips (size / length), per-variant
price delta, stock state ("Only 2 left" / out of stock, sold-out swatches struck), quantity, add to cart, **Order on
WhatsApp** (`wa.me/<store number>?text=` with product name, variant and link), details, related products, Product
JSON-LD with per-variant offers. Cart persisted in `localStorage` keyed by store slug. Order confirmation / status page
and `/track`.

Variants are **one-dimensional** (each `variants` row is a purchasable unit; rows are grouped by `optionName` for
display). A colour × size matrix needs a schema decision (see "Decisions needed").

### 3. Guest checkout (`src/storefront/checkout.*`, `pricing.ts`, `otp.ts`)

`POST /storefront/quote` re-prices the cart from the database while the shopper types (city changes shipping, coupon,
payment mode); the browser only ever sends ids and quantities. `POST /storefront/checkout` validates (Indian mobile
normalised from `+91`/`0` prefixes, 6-digit pincode, state from the fixed list, qty 1–50, ACTIVE products, variant
required when the product has variants), computes totals and runs **one transaction**: conditional stock decrements,
customer upsert by phone (address book kept, 5 most recent), order number from `settings.next_order_seq` under the row
lock (`<order_prefix>-<seq>`), order row with the full item snapshot (`src/orders/order-items.ts` gained
`variantLabel`, `hsnCode`, `gstRateBp`, `tax`), audit row. OTP is optional: `POST /storefront/otp/send|verify` through
an `OtpProvider` interface (console stub; code hashed in Redis, 5 min, 5 attempts, per-phone and per-IP limits); a
verified phone yields a signed token the checkout request carries, recorded as `address.phoneVerified` on the order.

Money rules (`pricing.ts`, pure, integer paise): coupon `PERCENT` floors to the paise, `FLAT` caps at the subtotal,
min order / expiry / usage limit (orders with that code that are not CANCELLED); shipping: per-city override wins,
then `FLAT` / `FREE` / `FREE_ABOVE` (compared against the **discounted** subtotal); COD charge only for COD, COD
refused when disabled; **prices are GST-inclusive** (Indian retail convention): tax is carved out per line after
allocating the discount proportionally (last line absorbs rounding), rate = `products.gst_rate_bp` or
`settings.gst_rate_bp` (default 5%), zero for stores without a GSTIN; a single order above ₹2 crore is refused rather
than overflow the 32-bit Int.

### 4. Razorpay (`razorpay.service.ts`, `payments.service.ts`)

Keys are the tenant's, decrypted inside the request by `TenantSecretsService`; the browser receives only the public
`key_id`. `ONLINE` checkout creates our order (stock held, `expires_at` = now + `settings.unpaid_order_ttl_min`,
default 30), then the gateway order for the exact total (`receipt` = our order number, auto-capture), stored in the
new `payments` table; a gateway failure cancels and restocks. Checkout.js is loaded only when the shopper pays, with
UPI (intent / collect / QR) as the first block, cards / netbanking / wallets second. **Verify**: HMAC of
`order_id|payment_id` with the key secret, then a server-side fetch of the payment (order, amount, currency, status
captured/authorized) before anything is marked paid; forged signatures are audited. **Webhook**
(`POST /storefront/payments/razorpay/webhook`, URL `https://<store host>/api/storefront/payments/razorpay/webhook`):
raw body verified against the tenant's webhook secret (new `PUT /store/razorpay.webhookSecret`, encrypted like the
keys), event id inserted into `webhook_events` (unique per tenant) **before** processing so redeliveries are 200
no-ops; handles `payment.captured` / `payment.authorized` / `order.paid` (amount must match) and `payment.failed`.
`markPaid` is idempotent, reopens an order the expiry job cancelled a moment earlier (takes the stock again) and sends
the notifications exactly once. Test double: `test/razorpay-fake.ts`.

### 5. Orders

`UPDATE … WHERE stock >= qty` per line inside the transaction; a 0-row update aborts with 409 "just went out of
stock". 12 parallel checkouts for 3 units → exactly 3 orders, stock 0 (`checkout.spec.ts`). Order numbers come from
the settings sequence under the row lock; `UNIQUE (tenant_id, order_no)` backs it. The jobs service
(`src/jobs/jobs.service.ts`, `JOBS_ENABLED`, every minute) cancels and restocks unpaid online orders past
`expires_at`; `npm run jobs:weekly` runs the weekly summary on demand. CHECK constraints now keep stock and amounts
non-negative at the database level.

### 6. GST invoice (`invoice.service.ts`, `invoice.controller.ts`)

pdfkit with Noto Sans Tamil (covers Latin, ₹ and Tamil; shipped in `apps/api/assets/fonts`, copied into the image).
TAX INVOICE for GSTIN stores: seller GSTIN + state, bill-to, place of supply, per line HSN / qty / inclusive rate /
taxable value / GST @ rate, totals with CGST + SGST (same state as the GSTIN) or IGST (other state), COD "amount to
collect". Plain INVOICE with no tax lines for stores without a GSTIN. Customer download
`GET /storefront/orders/:orderNo/invoice?t=<token>` (or `phone=`), owner `GET /store/orders/:id/invoice` (link in the
admin order screen). `invoiceModel()` exposes the numbers for tests.

### 7. Notifications (`src/notifications`)

`WhatsAppSender` and `EmailSender` interfaces with console stubs (bounded in-memory outbox; logs carry a masked
recipient and the kind only, never the body). Instant owner alert (WhatsApp to the store number + email to every
active owner) and customer confirmation (WhatsApp + email if given) on COD placement or on payment confirmation for
online orders; low-stock alert when a sale crosses `settings.low_stock_threshold` (not on every sale below it);
weekly summary Monday 09:00 IST per store with a Redis once-per-week guard (orders, sales, cancelled, COD to collect,
top 5 products, low-stock count). Sample from the demo store: 11 orders · ₹47,436.50 · top "Madurai Sungudi Saree × 5".
Customer order-status page: `/track` (order number + phone) and `/order/<no>?t=<token>`.

### 8. Theme and language

`lib/theme.ts` turns the `theme_configs` row into `--sf-*` custom properties on `<html>` (palette by `palette_id`
with `primary_color` / `secondary_color` overriding it, font pair, corner radius); Tailwind utilities read those
variables (`@theme inline`), so there is one stylesheet for every store. Text-on-primary and primary-as-text are
checked for 4.5:1 and darkened if needed. V1 palette: maroon `#7A1F2B`, gold `#C9973B` (decoration only: zari
borders, rings, swatch accents), cream `#FBF5EA`, ink `#2B1B17`; Playfair Display / Inter / Noto Sans Tamil,
self-hosted. The admin "Look & logo" screen now offers the same vocabulary (Textile palette, font pairs, corners,
layout). Tamil/English: `messages/en.json`, `messages/ta.json`; host-only cookie `bm_lang`; toggle in the header
(desktop) and menu (phone).

### 9. SEO

Per-page title/description/canonical, Open Graph, Organization (layout), Product (with offers per variant) and
BreadcrumbList JSON-LD; `/sitemap.xml` and `/robots.txt` are route handlers built per host (BUILDING / unknown
hosts: `Disallow: /` + noindex; cart, checkout, order, track, search, api disallowed for LIVE stores). Policy and
content pages render from the `pages` table (scripts / handlers stripped from owner HTML).

### 10. Rate limiting

Redis fixed windows via the existing `ThrottleService` (fail open, like login): checkout 10 / 10 min per IP; OTP 5 /
10 min per phone per store and 20 / 10 min per IP; order lookup and invoice 20 / 10 min per IP; verify 30 / 10 min
per IP. 429 with `Retry-After`. Quotes are not limited.

### 11. Performance

`next/image` (AVIF/WebP, device sizes for phones, 1-day cache) for every photo; `fetchpriority=high` on the LCP image
only, everything else lazy; CSS inlined; fonts self-hosted woff2 subsets (Inter and Noto Sans Tamil variable,
Playfair not preloaded); Checkout.js loaded on demand. Lighthouse 13.6 mobile, simulated 4G, production build
(`docs/lighthouse/s3`):

| Page | Perf | A11y | BP | SEO | LCP sim. | LCP observed |
|---|---|---|---|---|---|---|
| home | 92 | 100 | 100 | 100 | 3.2 s | 0.23 s |
| category | 95 | 100 | 100 | 100 | 2.9 s | 0.16 s |
| product | 95 | 100 | 100 | 92* | 2.9 s | 0.15 s |
| cart | 99 | 100 | 100 | 54** | 0.8 s | 0.11 s |
| checkout | 94 | 100 | 100 | 58** | 2.7 s | 0.27 s |

\* one run reported a missing meta description although the HTML carries it (Next streams metadata for non-bot
user agents; an earlier run scored 100). \** cart and checkout are `noindex` on purpose. **The 2.5 s LCP target is
not met in the simulated run**: the pages are 320–360 KB and observed LCP is well under 0.3 s, but Lighthouse's
Lantern model charges the 103 KB of Next.js framework JS and the fonts to the pessimistic LCP estimate. Levers left:
drop the Tamil font when the cookie is `en`, trim client components (checkout form is the largest), or a CDN edge
cache for `_next/static`. Target 85+ overall is met on every page.

### 12. Tests

See "Test output". New suites: `pricing.spec.ts` (21), `checkout.spec.ts` (10), `payments.spec.ts` (7),
`invoice.spec.ts` (3), `notifications.spec.ts` (4), `storefront-limits.spec.ts` (3). Gate: `payments` and
`webhook_events` went through the whole matrix (app layer, RLS, raw SQL) via the DMMF (18 models now), seeded
products are ACTIVE, and a new block proves host A's public storefront never lists, prices, sells, looks up or
invoices anything of B and that B's gateway ids do nothing on A.

## Test output

```
Full suite (`npm test`, Postgres 16 + Redis 7 + in-process S3 and Razorpay doubles):

Test Suites: 22 passed, 22 total
Tests:       542 passed, 542 total   (Phase 2 ended at 455)

| Suite | Tests |
|---|---:|
| `gate.spec.ts` | 363 |
| `pricing.spec.ts` | 21 |
| `auth.spec.ts` | 19 |
| `tenant-scope.spec.ts` | 19 |
| `admin-api.spec.ts` | 15 |
| `superadmin.spec.ts` | 12 |
| `tenant-resolution.spec.ts` | 11 |
| `auth-protection.spec.ts` | 10 |
| `checkout.spec.ts` | 10 |
| `payments.spec.ts` | 7 |
| `media.spec.ts` | 6 |
| `import.spec.ts` | 6 |
| `store-secrets.spec.ts` | 6 |
| `plans.spec.ts` | 6 |
| `crypto.spec.ts` | 6 |
| `uploads.spec.ts` | 5 |
| `limits.spec.ts` | 4 |
| `notifications.spec.ts` | 4 |
| `tenant-resolver.prod.spec.ts` | 4 |
| `invoice.spec.ts` | 3 |
| `storefront-limits.spec.ts` | 3 |
| `seed.spec.ts` | 2 |
```

Gate alone (`npm run test:gate`): `Tests: 363 passed, 363 total` (Phase 2: 324).

## Things I changed outside the Phase 3 list (please review)

- **Test harness fix**: the generated Prisma client loads `apps/api/.env` when imported, which happened before the
  test defaults in `test/global-setup.ts` (`??=`). With a `.env` present the suite silently ran against the **dev**
  database and Redis db 0 (that is how I noticed: dev rate limits filled up and the dev media worker stole test rows).
  `global-setup.ts` now imports `setup-env.ts` first and `scripts/db-app-role.ts` loads dotenv only as a CLI. CI was
  unaffected (no `.env` there), laptops were.
- Removed the stray root `app/` directory (a stale copy of three admin pages left by the "recovered" merge); Next
  15.5 picked it up and refused to build the workspaces.
- `scripts/seed-demo.ts`: V1 theme, textile-looking placeholder photos (still placeholders, not product photography),
  banner, category images, variants; "today" orders now use minute offsets so the seed test does not flip around
  midnight IST.
- `GET /store/razorpay` gained `webhookConfigured`; `PUT /store/razorpay` accepts `webhookSecret`.
- Settings gained `gstRateBp`, `unpaidOrderTtlMin` (editable through `PUT /store/settings`), products `gstRateBp`.
- Order admin: cancel/return restock already existed; `order.placed` and `order.payment` audit rows now appear in the
  admin order history.

## Stubbed / not real yet

- WhatsApp and email senders, OTP provider: console + in-memory outbox (`src/notifications/senders.ts`,
  `src/storefront/otp.ts`). Swap the `useClass` lines.
- Razorpay in tests and local dev is the double; real test-mode keys were not available in the sandbox, so the
  Checkout.js → verify path was exercised through the double's signed callback, not a real Razorpay test payment.
- Product photos in the demo are generated placeholders.
- Weekly summary "sample data" is the demo store's own orders.

## Decisions needed / doubts

1. **GST rates per HSN.** Default 5% store-wide with a per-product override; the September 2025 rate changes are not
   modelled. Confirm the rate per line with the client's CA before relying on invoices. No shipping GST line.
2. **Prices inclusive of GST** everywhere (admin, storefront, invoice). If a client wants exclusive pricing it is a
   settings flag plus a different pricing branch.
3. **Variant matrix** (colour × size) is not possible with one-dimensional `variants`; today a product is either
   colours or sizes. Phase 4 question.
4. **Unpaid online orders hold stock for 30 minutes** (`unpaidOrderTtlMin`), then cancel and restock; a payment that
   lands later reopens the order even if stock went negative in between (CHECK constraint would refuse; today the
   webhook would then fail and Razorpay retries). Alternative: do not hold stock for online orders at all.
5. **Webhook secret is per store** (set in the store's Razorpay dashboard with the store's URL). Without it webhooks
   are refused and the signature-verify path alone marks orders paid; that path depends on the shopper's browser
   returning. Consider making the secret mandatory alongside the keys.
6. **Invoice numbering = order number.** Fine for most small sellers; a separate invoice series or financial-year
   reset would need a column.
7. **Coupon usage counts non-cancelled orders**, including unpaid online ones until they expire.
8. **Customer identity is the phone** (one customer row per phone per store); a second shopper using the same phone
   overwrites the name.
9. **`next/image` host allow-list** (`IMAGE_HOSTS`) must include the media/CDN host in production, or photos 400.
10. **Lighthouse LCP** (see 11).
11. **Guest order access token** is an HMAC of (tenant, order number, phone); anyone holding a confirmation link can
    read that order's status and invoice until rotated (the secret is `JWT_ACCESS_SECRET`). Acceptable for order
    pages; say if you want expiring links.
12. **Admin does not yet show** the payment rows or webhook events; `payments` are visible only through the order's
    history and the database.
13. The storefront has no automated browser test in CI; the Playwright flow used for the screenshots lives in this
    session only (same as Phase 2's admin check).

## Screenshots

`docs/screenshots/s3/`: `01-home`, `02-category`, `02b-category-filters`, `03-product`, `04-cart`, `05-checkout`,
`06-confirmation`, `07-track`, `08-menu`, `09-home-tamil` (390 × 844, 2×, production build, no console errors, no
horizontal overflow).

Critique I acted on: category circles were clipped by the scroll container; the disabled "Add to cart" looked broken
until a colour was picked (now reads "Choose Colour first"); section eyebrows repeated their titles; tertiary text was
3.97:1 on cream (now 5.75:1). Still weak, honestly: the placeholder photos make the lookbook feel flat (real
photography is the single biggest lever), the footer policy list is long on a phone, and "Fresh in" and "Most
ordered" overlap heavily on a 25-product catalogue.
