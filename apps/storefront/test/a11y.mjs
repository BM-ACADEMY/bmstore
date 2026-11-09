// Accessibility sweep over running stores at 390px: axe-core (WCAG 2.1 A/AA incl. colour contrast), labels on every
// control, and a 44x44px tap-target check on every visible interactive element.
//   STORES="silks.localhost:3002,foods.localhost:3002,jewels.localhost:3002" node test/a11y.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const stores = (process.env.STORES ?? 'silks.localhost:3002,foods.localhost:3002,jewels.localhost:3002').split(',');
const PATHS = ['/', '/c/all', 'PRODUCT', '/cart', '/checkout', '/search?q=a', '/track'];
const MIN = 44;
const browser = await chromium.launch();
let failures = 0;
for (const host of stores) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
  const page = await ctx.newPage();
  // a cart with one line so /cart and /checkout are the real pages
  await page.goto(`http://${host}/c/all`, { waitUntil: 'networkidle' });
  const first = await page.locator('a[href^="/p/"]').first().getAttribute('href');
  await page.goto(`http://${host}${first}`, { waitUntil: 'networkidle' });
  const chip = page.locator('fieldset button:not([disabled])').first();
  if (await chip.count()) await chip.click();
  await page.getByRole('button', { name: /Add to cart|Add/ }).first().click().catch(() => {});
  for (const p of PATHS) {
    const path = p === 'PRODUCT' ? first : p;
    await page.goto(`http://${host}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(async () => {
      // the Next dev-tools badge is not part of the store
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, exclude: [['nextjs-portal']] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
    });
    const small = await page.evaluate((MIN) => {
      const out = [];
      const els = document.querySelectorAll('a, button, input, select, textarea, [role=button], [role=radio], [role=tab], [role=switch]');
      for (const el of els) {
        if (el.closest('nextjs-portal') || el.closest('footer')) continue; // footer text links are a reading list, not primary targets
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        // inline links inside running text are exempt (WCAG 2.5.8 exception); everything else must be >= 44px
        if (el.tagName === 'A' && cs.display === 'inline' && el.closest('p, li, span')) continue;
        // a native radio / checkbox inside a large <label> is operated through the label
        if (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox') && el.closest('label') && el.closest('label').getBoundingClientRect().height >= MIN) continue;
        if (r.height < MIN - 0.5 || r.width < MIN - 0.5) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    }, MIN);
    const unlabeled = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
        const id = el.id;
        const ok = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (id && document.querySelector(`label[for="${id}"]`)) || el.closest('label');
        if (!ok) out.push(`${el.tagName.toLowerCase()}[name=${el.getAttribute('name')}]`);
      }
      return out;
    });
    const bad = axe.length + small.length + unlabeled.length;
    failures += bad;
    console.log(`${host}${path}: ${bad ? 'FAIL' : 'ok'}${axe.length ? ` axe=${axe.length}` : ''}${small.length ? ` small=${small.length}` : ''}${unlabeled.length ? ` unlabeled=${unlabeled.length}` : ''}`);
    for (const v of axe) console.log(`   axe ${v.impact} ${v.id}: ${v.help} -> ${v.nodes.join(' | ')}`);
    for (const s of small) console.log(`   tap < ${MIN}px: ${s}`);
    for (const u of unlabeled) console.log(`   unlabeled: ${u}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nall clear');
process.exit(failures ? 1 : 0);
