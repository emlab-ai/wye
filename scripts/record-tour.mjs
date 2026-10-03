// Records docs/tour.gif: a slow walk through Wye's core features against the running app (WYE_URL, default
// http://localhost:3456). Needs playwright-core (PLAYWRIGHT_CORE=<path to its package dir> if it is not installed
// here), Chrome, and ffmpeg. `node scripts/record-tour.mjs` → .cache/tour/tour.webm → docs/tour.gif.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const URL = process.env.WYE_URL ?? 'http://localhost:3456';
const OUT = path.resolve('.cache/tour'); rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const SIZE = { width: 1440, height: 900 };
const P = process.env.TOUR_PRODUCT ?? 'wye', PROJECT = process.env.TOUR_PROJECT ?? 'v2';
const DOC = process.env.TOUR_DOC ?? 'requirements-shell', NODE = process.env.TOUR_NODE ?? 'req:wf2.ui.search';
const QUESTION = process.env.TOUR_QUESTION ?? 'what happens to a product\'s files when I delete it?';
const PR = process.env.TOUR_PR ?? '/zz-revisit-1/cr/d/~pr-3';
const scenes = [`/${P}/${PROJECT}`, `/${P}/${PROJECT}/d/${DOC}`, PR, `/${P}/inbox`];

const browser = await chromium.launch({ channel: 'chrome' });
// warm every page first, so the dev server does not compile on camera
{ const ctx = await browser.newContext({ viewport: SIZE }); const p = await ctx.newPage();
const errors = new Set(); p.on('console', m => { if (m.type() === 'error') errors.add(`${p.url().replace(URL, '')}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => errors.add(`${p.url().replace(URL, '')}: ${String(e).slice(0, 200)}`));
// waits for the model are cut from the video: [from, to] in seconds since recording began
const t0 = Date.now(); const now = () => (Date.now() - t0) / 1000; const cuts = [];
const waitCut = async (fn, lead = 1.5) => { const a = now() + lead; await fn(); const b = now() - 0.6; if (b - a > 1) cuts.push([a, b]); };
  for (const u of scenes) { await p.goto(URL + u, { waitUntil: 'domcontentloaded', timeout: 180000 }); await p.waitForTimeout(3000); }
  await ctx.close(); }

const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
await ctx.addInitScript(() => {
  localStorage.setItem('wf-rail', '1'); localStorage.setItem('wf-cmd-mode', 'pr');
  // the dev server's own badge is not part of the app
  document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal { display: none !important; }'; document.head.appendChild(st); });
});
const p = await ctx.newPage();
const errors = new Set(); p.on('console', m => { if (m.type() === 'error') errors.add(`${p.url().replace(URL, '')}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => errors.add(`${p.url().replace(URL, '')}: ${String(e).slice(0, 200)}`));
// waits for the model are cut from the video: [from, to] in seconds since recording began
const t0 = Date.now(); const now = () => (Date.now() - t0) / 1000; const cuts = [];
const waitCut = async (fn, lead = 1.5) => { const a = now() + lead; await fn(); const b = now() - 0.6; if (b - a > 1) cuts.push([a, b]); };
const hold = ms => p.waitForTimeout(ms);
const go = async u => { await p.goto(URL + u, { waitUntil: 'domcontentloaded', timeout: 180000 }); await hold(2500); };
const type = async (sel, text) => { await p.locator(sel).click(); await p.keyboard.type(text, { delay: 45 }); };
const scroll = async (dy, steps = 6) => { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await hold(180); } };

// 1. the product
await go(scenes[0]); await hold(2500);
// 2. a document; a requirement opened in the column
await go(scenes[1]); await p.mouse.move(700, 450); await scroll(500); await hold(1500);
const card = p.locator(`[data-id="${NODE}"] .nblock-head`).first();
if (await card.count()) { await card.scrollIntoViewIfNeeded(); await hold(800); await card.click(); await hold(4000); }
// 3. Ask: a question answered with citations, the deeper search's sources arriving
await p.keyboard.press('Meta+f'); await p.waitForSelector('.search-panel'); await hold(800);
await type('.search-in', QUESTION); await hold(1200); await p.keyboard.press('Enter');
// the fast answer: the wait before it streams is cut, then a few seconds of it streaming
await waitCut(() => p.waitForFunction(() => (document.querySelector('.ask-answer')?.textContent?.length ?? 0) > 80, null, { timeout: 90000 }).catch(() => {}));
await hold(6000);
// the deeper search's sources arriving
await waitCut(() => p.waitForSelector('.ask-chip', { timeout: 90000 }).catch(() => {}), 0.5); await hold(6000);
await p.keyboard.press('Escape'); await hold(800);
// 4. Remember: paste, and Wye files it
await p.keyboard.press('Control+m'); await p.waitForSelector('.palette'); await hold(800);
await type('.palette-in', 'From today\'s planning: Dana owns the search ranking work, and the reranker stays on for questions.'); await hold(3500);
await p.keyboard.press('Escape'); await hold(600);
// 5. a Prompt Request: the Summary of what will be built, readiness, Approve
await go(scenes[2]); await hold(2500);
const summary = p.locator('h2', { hasText: /^Summary$/ }).first();
if (await summary.count()) { await summary.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'start' })); await hold(3000); }
await p.mouse.move(700, 450); await scroll(600, 8); await hold(3000); await scroll(600, 8); await hold(2500);
// 6. the Inbox: what agents wrote, waiting for you
await go(scenes[3]); await p.mouse.move(700, 450); await hold(2000); await scroll(500, 6); await hold(3000);

await ctx.close(); await browser.close();
if (errors.size) console.log(`console errors during the tour:\n${[...errors].join('\n')}`);
const webm = readdirSync(OUT).find(f => f.endsWith('.webm')); renameSync(path.join(OUT, webm), path.join(OUT, 'tour.webm'));
// a gif at 6 fps, 1000 px wide, one palette for the whole tour — under GitHub's 10 MB for an image
const vf = 'fps=6,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
const keep = cuts.length ? `select='not(${cuts.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+')})',setpts=N/FRAME_RATE/TB,` : '';
console.log('cut:', cuts.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)} s`).join(', ') || 'nothing');
const r = spawnSync('ffmpeg', ['-y', '-i', path.join(OUT, 'tour.webm'), '-vf', keep + vf, '-loop', '0', 'docs/tour.gif'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
