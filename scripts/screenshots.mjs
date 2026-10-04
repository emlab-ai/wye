// The README's screenshots: one per feature, against the running app (WYE_URL, default http://localhost:3456), into
// docs/screenshots/. Needs playwright-core (PLAYWRIGHT_CORE=<path to its package dir> if it is not installed here)
// and Chrome; Ask makes one model call. `node scripts/screenshots.mjs [name …]` takes only the named ones.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const URL = process.env.WYE_URL ?? 'http://localhost:3456';
const OUT = path.resolve('docs/screenshots'); mkdirSync(OUT, { recursive: true });
const P = 'wye', PROJECT = 'v2';
const only = new Set(process.argv.slice(2));

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('wf-rail', '1');
  document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal { display: none !important; }'; document.head.appendChild(st); });
});
const p = await ctx.newPage();
const hold = ms => p.waitForTimeout(ms);
const go = async u => { await p.goto(URL + u, { waitUntil: 'domcontentloaded', timeout: 180000 }); await hold(4000); };
const loaded = () => p.waitForFunction(() => ![...document.querySelectorAll('span, div')].some(e => !e.childElementCount && /^loading/i.test(e.textContent.trim()) && e.getBoundingClientRect().bottom > 0 && e.getBoundingClientRect().top < innerHeight), null, { timeout: 20000 }).catch(() => {});
const shot = async name => { await loaded(); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(name); };
const closePanel = async () => { const x = p.locator('.peek-bar-close').first(); if (await x.count()) await x.click().catch(() => {}); await hold(600); };

const scenes = {
  // a document of requirements, one opened in the column
  async document() {
    await go(`/${P}/${PROJECT}/d/requirements-shell`);
    const card = p.locator('[data-id="req:wf2.ui.sidebar"] .nblock-head').first();
    if (await card.isVisible().catch(() => false)) { await card.evaluate(e => e.scrollIntoView({ block: 'center' })); await hold(600); await card.click(); await hold(3000); }
    await shot('document');
  },
  // a Prompt Request: readiness, Approve, and every node the change may touch
  async pr() { await go(`/${P}/${PROJECT}/d/~pr-28`); await closePanel(); await shot('pr'); },
  async inbox() { await go(`/${P}/inbox`); await shot('inbox'); },
  async knowledge() { await go(`/${P}/knowledge`); await shot('knowledge'); },
  async types() { await go(`/${P}/types`); await shot('types'); },
  async constitution() { await go(`/${P}/constitution`); await shot('constitution'); },
  async work() { await go(`/${P}/work`); await shot('work'); },
  // Remember: the box with a note pasted, before it is sent
  async remember() {
    await go(`/${P}/${PROJECT}/d/requirements-shell`);
    await p.keyboard.press('Control+m'); await p.waitForSelector('.palette'); await hold(600);
    await p.locator('.palette-in').fill('Talked to Acme today. Their finance team needs invoices to keep the original PO number even when the invoice is regenerated. They won\'t roll out to Germany until this works.');
    await hold(1200); await shot('remember'); await p.keyboard.press('Escape');
  },
  // Ask: a question, its cited answer and the deeper search's sources
  async ask() {
    await go(`/${P}/${PROJECT}/d/requirements-shell`);
    await p.keyboard.press('Meta+f'); await p.waitForSelector('.search-panel'); await hold(600);
    await p.locator('.search-in').fill('what happens to a superseded decision, and do agents still see it?'); await hold(800); await p.keyboard.press('Enter');
    await p.waitForFunction(() => (document.querySelector('.ask-answer')?.textContent?.length ?? 0) > 400, null, { timeout: 180000 }).catch(() => {});
    await p.waitForSelector('.ask-chip', { timeout: 180000 }).catch(() => {}); await hold(8000);
    await shot('ask'); await p.keyboard.press('Escape');
  },
  // the mind map, a node's context beside it
  async map() {
    await go(`/${P}/${PROJECT}/d/memory-map`); await closePanel();
    const fit = p.locator('button', { hasText: /^Fit$/ }).first(); if (await fit.count()) { await fit.click(); await hold(1500); }
    await shot('map');
  },
  // a table's filter opened: the SQL it runs
  async table() {
    await go(`/${P}/${PROJECT}/d/app-agents`); await closePanel();
    const toggle = p.locator('.collection-filter-toggle').nth(1);
    await toggle.evaluate(e => e.scrollIntoView({ block: 'start' })); await p.mouse.wheel(0, -140); await hold(800);
    await toggle.click(); await hold(1500); await shot('table');
  },
};
for (const [name, fn] of Object.entries(scenes)) if (!only.size || only.has(name)) await fn().catch(e => console.log(`${name} failed: ${String(e).slice(0, 200)}`));
await browser.close();
