# Lighthouse, storefront (Phase 3)

Mobile preset (Moto G Power emulation, simulated 4G: 1.6 Mbps / 150 ms RTT, 4× CPU slowdown), Lighthouse 13.6,
Chromium 1243, against `next build && next start` of the demo store (`demo.localhost:3002`) with the API on :3000.
`*.report.json` are the raw runs (HTML reports are not committed; regenerate with the command below).

| Page | Perf | A11y | Best practices | SEO | LCP (simulated) | FCP | TBT | CLS | LCP observed (unthrottled) |
|---|---|---|---|---|---|---|---|---|---|
| home | 92 | 100 | 100 | 100 | 3.2 s | 1.0 s | 100 ms | 0 | 0.23 s |
| product | 95 | 100 | 100 | 92* | 2.9 s | 0.8 s | 80 ms | 0 | 0.15 s |
| category | 95 | 100 | 100 | 100 | 2.9 s | 0.8 s | 90 ms | 0 | 0.16 s |
| cart | 99 | 100 | 100 | 54** | 0.8 s | 0.8 s | 110 ms | 0 | 0.11 s |
| checkout | 94 | 100 | 100 | 58** | 2.7 s | 0.8 s | 150 ms | 0.04 | 0.27 s |

\* see PHASE3_REPORT.md (the one failing SEO audit on the product page is noted there).
\** cart and checkout are deliberately `noindex`; Lighthouse scores that as an SEO failure.

Regenerate:

```bash
CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome lighthouse http://demo.localhost:3002/ \
  --form-factor=mobile --screenEmulation.mobile --output=json --output=html --output-path=./home \
  --chrome-flags="--headless=new --no-sandbox --no-proxy-server"
```
