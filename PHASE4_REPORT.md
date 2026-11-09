# Phase 4 report — Theme engine + layouts V2 / V3

Status: **all six numbered items built, one commit each (plus a docs commit), full suite (552) and gate (363) green
locally, three demo tenants differing only by `theme_configs` + catalogue.** Branch `claude/intelligent-edison-uezeqo`,
PR "S4: Themes + V2/V3 layouts". Phase 5 was not started.

Scope kept to `apps/storefront`, the theme parts of `apps/admin` and `apps/api`, and new files (migration, seed
presets, tests), so merging alongside S5 should be easy. Shared files touched: `prisma/schema.prisma` (two
columns on `theme_configs`, one on `categories`), `settings.ts` (theme DTO + `GET /store/theme/vocabulary`),
`catalog.service.ts` / `present.ts` (bootstrap theme + `nameTa`), `categories.ts` (`nameTa`), admin `more` /
`settings` pages (one link each), `.github/workflows/ci.yml` (storefront `npm test` added to the existing step).

> Same caveat as earlier phases: GitHub Actions has not run from this sandbox; the first push runs it.

| # | Commit | What |
|---|--------|------|
| 1 | `feat(theme): theme engine …` | vocabulary + validation, CSS-variable engine, layout dispatch, editor with live preview |
| 2 | `feat(storefront): Layout V2 Food/Grocery …` | category-first home, stepper grid, pack sizes, mini-cart bar, cart progress + coupon, seed presets |
| 3 | `feat(storefront): Layout V3 … + accessibility pass` | V3 polish, 44 px targets everywhere, options-merge fix |
| 4 | (in 1; verified in 3) | visitor theme switcher per tenant (`options.switcherEnabled`) |
| 5 | `test(theme): …` | API specs, storefront node:test, axe + tap-target sweep |
| 6 | `docs(phase4): …` | three seeded tenants, `docs/screenshots/s4`, this report |

## How to run

```bash
# API, object store, storefront, admin as in PHASE3_REPORT.md, then:
npm run seed:demos -w apps/api        # silks (V1), foods (V2), jewels (V3): http://<slug>.localhost:3002, admin :3001
                                      # owner@<slug>.test / demo-password-123
npm test -w apps/api                  # 24 suites, 552 tests (set FAKE_S3_PORT if :9100 is taken by dev:storage)
npm run test:gate -w apps/api         # 363
npm test -w apps/storefront           # theme maths (node --test, 5 tests)
npm run test:a11y -w apps/storefront  # axe + labels + 44px over the three running stores (needs the servers up)
```

## 1. Theme engine

**One vocabulary, validated once.** `apps/api/src/theme/theme-config.ts` is the source of truth for everything a
store may put in `theme_configs`: 3 layouts, 10 curated palettes + `custom`, 6 font pairs, 3 header styles, 3
card styles, 3 hero types, 3 corner styles, 7 homepage section types with their per-type fields, and an `options`
bag (`corners`, `switcherEnabled`, `heroVideoUrl`, `bilingualLabels`). `PUT /store/theme` is a partial update:
unspecified fields keep the stored value, `options` merges, and the **whole result** must validate — a 400 lists
every problem at once (the editor shows the list). Legacy rows (`default`, `serif`, `maroon`, `cardStyle=round`)
are mapped on read, never rewritten silently. Links in sections are internal paths or http(s) only; text is
bounded; featured product ids must be UUIDs; a video hero needs an `https` URL. Migration
`20261109090000_theme_engine` adds `hero_type`, `options` (JSONB) and `categories.name_ta`.

**No stylesheet per client.** `apps/storefront/lib/theme.ts` turns the row into `--sf-*` custom properties on
`<html>` (`themeVars`): palette neutrals, primary / accent / tertiary, *contrast-checked* derivatives
(`--sf-primary-text` is darkened until it reads 4.5:1 on the page background, `--sf-on-primary` flips to ink on
light primaries, `--sf-ink-3` likewise), soft tints mixed from the background, font stacks with the Tamil
fallback, and a radius scale from the corner option. Tailwind's `@theme inline` reads those variables, so the
single built stylesheet serves every store; `data-layout` / `data-cards` on `<html>` are the only structural hooks.

**Fonts.** Six pairs, all Tamil-capable: Playfair Display + Inter, Baloo Thambi 2 + Inter, Cormorant Garamond +
Inter, Noto Serif Tamil + Noto Sans Tamil, Inter everywhere, Baloo Thambi 2 everywhere. Baloo Thambi 2 and Noto
Serif Tamil ship their own Tamil subsets (self-hosted woff2, `@font-face` with `unicode-range`); the others fall
through to Noto Sans Tamil. No third-party font requests.

**Layouts, cards, headers, heroes.** `app/page.tsx` fetches the same `/storefront/home` for every store and hands
it to `layouts/v1|v2|v3/home.tsx`; the section order and `enabled` flags come from the theme row, so the editor
preview equals what will be saved. `ProductCard` renders `portrait` / `compact` / `framed`; `Header` renders
`standard` / `centered-logo` / `minimal`; `HeroMedia` renders a single banner, an auto-advancing slider over the
uploaded banners (pauses on hover/focus, dots are 44 px buttons) or a muted looping video with banner[0] as poster.
Sections: Offer strip, Hero, Categories, Featured, Bestsellers (real 90-day sales, hidden until there are any),
About (renders only when the owner wrote something), Contact. No testimonials / social feeds.

**Editor (`apps/admin/app/(app)/settings/theme/page.tsx`, "Look & layout").** Layout cards (with a wireframe
glyph; picking one suggests its palette, fonts, header and card style), palette grid + custom hex with a contrast
note, font samples rendered in the real faces (served from the storefront's `/fonts`, CORS-enabled), header /
cards / corners, logo, hero type + video link, banners (add / reorder / remove), homepage sections (drag or
arrow reorder, on/off switch, inline text in English and Tamil, featured-product picker, About photo), demo
switcher toggle. **Live preview**: a 390 px storefront iframe on the right (full-screen sheet on phones). Colour
/ font / corner changes are posted to the iframe and applied as CSS variables instantly; structural changes
(layout, sections, header, cards, hero, images) are written to a **host-only** `bm_theme_preview` cookie and the
frame re-renders on the server — the same mechanism the demo switcher uses, and the storefront whitelists every
value it reads from it (`mergePreview`). Leaving the editor or saving clears the cookie. Verified by script:
palette click → `--sf-primary` changes with no reload; layout click → `data-layout=v2-grocer`; Discard → back,
cookie gone. The storefront sends `Content-Security-Policy: frame-ancestors 'self' admin.<platform domain>` so
only the owner's admin can frame it (see "Decisions" for the production host question).

## 2. Layout V2 Food / Grocery ("Annam Naturals")

Category-first home: short warm hero with the delivery rule, **two-column category tiles with Tamil labels**
(`Category.nameTa`, shown under the English name while `options.bilingualLabels` is on; the admin has a
Categories page to enter them), bestsellers then "Fresh this week", dense compact cards with a **pack-size
picker (250 g / 500 g / 1 kg…) and an add / − / + stepper** that writes straight to the cart, always-visible
search in the header, and a sticky **"4 items · ₹395 · View cart"** bar on phones (hidden on cart / checkout /
order pages). Product page preselects the base pack (one tap to add) and shows the per-pack price on the chips.
Cart: **free-delivery progress bar** from the `FREE_ABOVE` rule, **coupon field** validated through the quote
endpoint and handed to checkout, 44 px steppers. Low stock ("Only 3 left") on cards, product page and the
compact card badge uses `settings.lowStockThreshold`; out-of-stock packs are struck. Pack / size values come back
in natural order from the API (`250 g < 500 g < 1 kg`, `S < M < L`). Colours green `#1F6B3A` / chili `#C8381F` /
turmeric `#E3A51F` / cream `#FFF8E7`; Baloo Thambi 2 + Inter; round corners.

## 3. Layout V3 General retail / Jewellery ("Meenakshi Jewels")

Feature-block home: full-bleed banner slider with a thin rule and serif display type, **trust strip built from
configured facts only** (secure online payment appears only when a gateway is set up, COD only when enabled,
WhatsApp only with a number, otherwise the delivery rule), **"shop by style" tiles** (first category spans two
columns), framed product cards with a low-stock badge, owner-written About block. Product page: finish swatches
(gold / rose gold / antique, with sold-out ones struck) or size chips, low-stock pill, trust strip under the buy
box. Order confirmation: **"Download GST invoice (PDF)"** (plain "invoice" for stores without a GSTIN) and
**"Track order"**. Colours ink `#1D1A26` / rose `#8E4A55` / ivory `#FBF7F2`; Cormorant Garamond + Inter; sharp
corners; minimal header with a monogram.

## 4. Theme / colour switcher

`options.switcherEnabled` (editor toggle, on for the three demo tenants) mounts a floating "Theme" button: layout
(server re-render), palette and font pair (instant CSS variables), "Back to the store's own look". The choice is
the same host-only preview cookie, so it never leaks to another store on the platform domain and the saved theme
is untouched. Verified: jewels → Fashion/Textile → `data-layout=v1-textile` → reset → `v3-retail`.

## 5. Tests

| Where | What | Count |
|---|---|---:|
| `apps/api/test/theme-config.spec.ts` | validation: full theme, every problem listed, legacy ids, partial keeps stored, video needs https, sections (unknown types/keys dropped, links, bounds), corrupt rows never throw | 7 |
| `apps/api/test/theme-layouts.spec.ts` | **v1 → v2 → v3 → v1 keeps products, slugs, categories, pages, sitemap, home featured, settings and payments identical** while theme + section order follow; HTTP validation, nothing from a rejected PUT sticks, vocabulary; `nameTa` PATCH; natural pack order | 3 |
| `apps/storefront/test/theme.test.ts` | **all 10 palettes × 3 layouts pass 4.5:1 on 8 text pairs**; light custom primary darkened for text; six pairs carry the Tamil fallback; corner scale; preview whitelist | 5 |
| `apps/storefront/test/a11y.mjs` | axe-core WCAG 2.1 A/AA (incl. contrast), every control labelled, **every interactive element ≥ 44×44 at 390 px** on home, listing, product, cart, checkout, search, track × 3 stores | 21 pages, all clear |
| gate | no new models (two columns + one column); the DMMF-driven gate still covers `ThemeConfig` and `Category` | 363 |

The accessibility sweep found 391 problems on the first run (brand link 36 px, card chips 32 px, "Add" 40 px,
breadcrumbs 16 px, "View all" 20 px, sort/filter 40 px, pagination, slider dots 24 px wide, cart "Remove",
unlabelled cart thumbnail link) and 0 after the fixes in commit 3. The layout-switch spec caught a real bug
(partial `options` replaced the bag) before it shipped.

Full suite: `Test Suites: 24 passed, Tests: 552 passed` (Phase 3: 542). Gate: `363 passed`.

## 6. Proof: three tenants from one codebase

`scripts/seed-presets.ts` holds the three presets; `seed-demo.ts` is now preset-driven and `seed:demos` seeds all
three. Between the tenants **only the CSV catalogue and the `theme_configs` row differ** — not one line of code or
CSS is per client. Screenshots (390 × 844, 2×, production build, no console errors, no horizontal overflow) in
`docs/screenshots/s4/<silks|foods|jewels>/`: `01-home`, `01-home-full`, `02-category` (+ `02b-category-steppers`
for foods), `03-product`, `03-product-full`, `04-cart`, `05-checkout`, `06-confirmation`, `07-home-tamil`,
`08-switcher`; `admin/editor-phone*.png`, `editor-desktop.png`, `editor-live-v2.png` (the silks store previewed as V2).

**Critique I acted on** (all fixed before the final set): Tamil taglines and tile labels overflowed the viewport
(`overflow-wrap: anywhere`, `min-w-0` on hero text); pack chips came back alphabetically ("1 kg, 10 kg, 5 kg");
pack variants all cost the same as the base pack (seed now prices per pack); the V3 price in Cormorant pulled its
rupee glyph from a fallback (body face for prices); the V1 zari footer border leaked into V2/V3; the grocer
header said "Search sarees, blouses…"; the editor's layout cards squeezed to one word per line next to the
preview; the phone preview sheet clipped; the cart "Apply" button wrapped.

**Still weak, honestly:** the placeholder art is generated (textile stripes, kraft packs, ink-and-gold shapes) —
real photography remains the biggest lever; the V3 "shop by style" tiles need good category photos to sing;
Bestsellers and Featured overlap on 18–26-product catalogues; the floating "Theme" pill sits over content on
phones (demo-only); the admin's drag reordering is HTML5 drag (arrows are the reliable path on touch).

## Things changed outside the Phase 4 list (please review)

- `Category.nameTa` + admin Categories page (needed for the Tamil tiles; the import CSV does not carry it).
- Public settings now include `lowStockThreshold`; `present.ts` sorts variants naturally for every consumer of
  the public API (admin listing is unaffected).
- Storefront `tsconfig` gained `allowImportingTsExtensions` (node:test imports `.ts`); `axe-core` is a storefront
  devDependency; `/fonts/*` sends `Access-Control-Allow-Origin: *` (font files only).
- `next.config.ts` adds `Content-Security-Policy: frame-ancestors` for the editor preview.
- Hex colours are stored as sent (the earlier admin-api spec expects lower-case round-trips).

## Decisions needed / doubts

1. **Where does the admin run in production?** The editor previews `https://<current hostname>` (override
   `NEXT_PUBLIC_STOREFRONT_ORIGIN`, `{host}` placeholder) and relies on the host-only cookie being shared with the
   storefront, which is true when the admin is served on the store host (dev: other port) and false if it lives
   on `admin.<platform>`. Caddy also sets `X-Frame-Options: SAMEORIGIN` on every host; browsers prefer the
   storefront's `frame-ancestors`, but the Caddy header should be dropped for the storefront route (infra, not
   touched here).
2. **Hero video** is an owner-hosted https URL (the media pipeline is image-only). Fine for a YouTube-free demo;
   say if videos should go through uploads.
3. **Stale-by-a-minute**: the storefront caches bootstrap per host for 60 s, so a saved theme reaches shoppers
   within a minute (the editor says so). The preview cookie bypasses that for the owner.
4. **`options.switcherEnabled` is owner-visible** in the editor; if it should be superadmin-only (demo stores),
   move the toggle.
5. **Variants stay one-dimensional** (Phase 3 decision 3); V2 packs and V3 finishes work within that.
6. **Lighthouse** was not re-run this phase; nothing heavier was added above the fold (fonts are swap, hero
   images keep `fetchpriority=high`), but the V2 compact cards are client components, so a run is due in Phase 5.
