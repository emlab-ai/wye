// Records docs/tour.gif: a walk through Wye against the running app (WYE_URL, default http://localhost:3456), with a
// caption per scene — a document and a requirement, a Prompt Request, Remember filing a pasted note, the Inbox,
// Ask (a fast cited answer and the deep agent's search), the mind map, and a table whose SQL an agent writes.
// Needs playwright-core (PLAYWRIGHT_CORE=<path to its package dir> if it is not installed here), Chrome, ffmpeg,
// and the `claude` CLI signed in. `node scripts/record-tour.mjs` → .cache/tour/tour.webm → docs/tour.gif.
// Remember and the table's query write to the product's documents; revert them after (git checkout the files).
// TOUR_SHOTS=1 also saves a screenshot per scene to .cache/tour/.
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
const DOC = process.env.TOUR_DOC ?? 'requirements-shell', NODE = process.env.TOUR_NODE ?? 'req:wf2.ui.sidebar';
const PR = process.env.TOUR_PR ?? `/${P}/${PROJECT}/d/~pr-28`;
const MAP = process.env.TOUR_MAP ?? `/${P}/${PROJECT}/d/memory-map`, MAP_NODE = process.env.TOUR_MAP_NODE ?? 'decision:memory.write-time-verdict';
const TABLE_DOC = process.env.TOUR_TABLE_DOC ?? `/${P}/${PROJECT}/d/app-agents`, TABLE_AT = Number(process.env.TOUR_TABLE_AT ?? 1);
const NOTE = process.env.TOUR_NOTE ?? 'From today\'s review: when the deep lane of Ask writes a good answer, it should be saved as a proposed fact so it is not lost — so the deep lane may write, not only read.';
const QUESTION = process.env.TOUR_QUESTION ?? 'how does Wye catch a contradiction when a decision is written?';
const TABLE_ASK = process.env.TOUR_TABLE_ASK ?? 'approved decisions across the whole product with their date and the requirements each one affects, newest first';
const SHOTS = !!process.env.TOUR_SHOTS;
const scenes = [`/${P}/${PROJECT}/d/${DOC}`, PR, `/${P}/inbox`, MAP, TABLE_DOC];

const browser = await chromium.launch({ channel: 'chrome' });
const init = () => {
  localStorage.setItem('wf-rail', '1'); localStorage.setItem('wf-cmd-mode', 'remember');
  document.addEventListener('DOMContentLoaded', () => {
    // the dev server's own badge is not part of the app
    const st = document.createElement('style');
    st.textContent = 'nextjs-portal { display: none !important; } #tour-cap { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2147483647; background: rgba(17,17,17,.92); color: #fff; font: 600 22px/1.3 -apple-system, system-ui, sans-serif; padding: 12px 22px; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.25); pointer-events: none; white-space: nowrap; } #tour-cap small { display: block; font-weight: 400; font-size: 16px; opacity: .8; margin-top: 2px; }';
    document.head.appendChild(st);
    // the scene's caption, put back whenever the page drops it
    setInterval(() => { const cap = sessionStorage.getItem('tour-cap'); if (!cap) return; let d = document.getElementById('tour-cap'); if (!d) { d = document.createElement('div'); d.id = 'tour-cap'; document.body.appendChild(d); } if (d.innerHTML !== cap) d.innerHTML = cap; }, 200);
  });
};
// warm every page first, so the dev server does not compile on camera
{ const ctx = await browser.newContext({ viewport: SIZE }); await ctx.addInitScript(init); const p = await ctx.newPage();
  for (const u of scenes) { await p.goto(URL + u, { waitUntil: 'domcontentloaded', timeout: 180000 }); await p.waitForTimeout(3000); }
  await ctx.close(); }

const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
await ctx.addInitScript(init);
const p = await ctx.newPage();
const errors = new Set(); p.on('console', m => { if (m.type() === 'error') errors.add(`${p.url().replace(URL, '')}: ${m.text().slice(0, 200)}`); }); p.on('pageerror', e => errors.add(`${p.url().replace(URL, '')}: ${String(e).slice(0, 200)}`));
// waits for the model are cut from the video: the page is painted magenta while one runs, and the encoder drops
// every magenta frame (wall-clock cuts drift — the recorder's clock is not the video's)
const hold = ms => p.waitForTimeout(ms);
const waitCut = async (fn, lead = 1.5) => {
  await hold(lead * 1000);
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'tour-wait'; d.style.cssText = 'position:fixed;inset:0;background:#ff00ff;z-index:2147483647'; document.documentElement.appendChild(d); });
  try { await fn(); } finally { await p.evaluate(() => document.getElementById('tour-wait')?.remove()).catch(() => {}); }
};
let shot = 0; const snap = async () => { if (SHOTS) await p.screenshot({ path: path.join(OUT, `scene-${String(++shot).padStart(2, '0')}.png`) }); };
const caption = async (title, sub = '') => {
  const html = `${title}${sub ? `<small>${sub}</small>` : ''}`;
  await p.evaluate(h => sessionStorage.setItem('tour-cap', h), html);
};
const go = async (u, title, sub) => { await p.goto(URL + u, { waitUntil: 'domcontentloaded', timeout: 180000 }); if (title) await caption(title, sub); await hold(2500); };
const type = async (sel, text, delay = 35) => { await p.locator(sel).click(); await p.keyboard.type(text, { delay }); };
const scroll = async (dy, steps = 6) => { for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy / steps); await hold(180); } };
const closeContext = async () => { const x = p.locator('.peek-bar-close').first(); if (await x.count()) await x.click().catch(() => {}); };

// 1. the definition: a document whose blocks are typed nodes; a requirement opened in the column
await go(scenes[0], '1 · Define the product', 'documents in git — every block is a typed node, every link an edge'); await p.mouse.move(700, 450); await scroll(500); await hold(1500);
const card = p.locator(`[data-id="${NODE}"] .nblock-head`).first();
if (await card.isVisible().catch(() => false)) { await card.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await hold(1500); await card.click(); await hold(4500); }
await snap();

// 2. a Prompt Request: what was asked, the blocks it proposes, what it reaches, the librarian's questions
await go(scenes[1], '2 · Ask for a change: a Prompt Request', 'a librarian agent refines it with you — definition, impact, questions — before any code'); await hold(2500); await snap();
for (const h of ['Definition', 'Impact', 'Questions']) {
  const el = p.locator('h2', { hasText: new RegExp(`^${h}$`) }).first();
  if (await el.count()) { await el.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'start' })); await hold(2600); }
}
await snap();

// 3. Remember: paste a note, an agent files it as knowledge — linked, and checked against what is known
await caption('3 · Remember: paste what was said', 'an agent splits it into statements and files each where it belongs');
await p.keyboard.press('Control+m'); await p.waitForSelector('.palette'); await hold(800);
await type('.palette-in', NOTE, 22); await hold(1500); await snap();
const started = p.waitForResponse(r => r.url().endsWith(`/api/${P}/sessions`) && r.request().method() === 'POST', { timeout: 60000 });
await p.keyboard.press('Enter');
const sid = (await (await started).json()).id;
await hold(9000); await snap();   // the agent at work in the column
// until it ends; when it asks, the person answers on camera (the first option of each question)
const finished = s => ['done', 'failed', 'cancelled'].includes(s.status);
for (let round = 0; ; round++) {
  let state = 'timeout';
  await waitCut(async () => {
    for (let i = 0; i < 120; i++) {
      if (await p.locator('.ask-options').first().isVisible().catch(() => false)) { state = 'ask'; return; }
      const s = await (await fetch(`${URL}/api/${P}/sessions/${sid}`)).json().catch(() => ({}));
      if (finished(s) || (s.live && !s.busy && i > 3)) { state = 'done'; return; }
      await hold(3000);
    }
  }, 0.5);
  if (state !== 'ask' || round > 3) break;
  const form = p.locator('.ask-options').first(); await form.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await hold(2500); await snap();
  const lists = p.locator('.ask-options');
  for (let i = 0; i < await lists.count(); i++) { await lists.nth(i).locator('.ask-opt').first().click(); await hold(900); }
  await hold(1200); await p.locator('.ask-actions .pri').first().click(); await hold(2500);
}
await hold(5000); await snap();   // what it did, in its own words

// 4. the Inbox: what the agent filed waits for a person
await go(scenes[2], '4 · Memory, waiting for you', 'new and changed knowledge is proposed — a person approves; conflicts are flagged'); await p.mouse.move(700, 450); await hold(2500);
// what Remember just filed: the decisions, then its block
const chip = p.locator('button', { hasText: /^DECISIONS/i }).first(); if (await chip.count()) { await chip.click(); await hold(1500); }
const filed = p.locator('.inbox-item, .nblock, li, article').filter({ hasText: /sav(e|es|ed|ing)\b[^.]*answer|answer[^.]*\bsav(e|es|ed)/i }).first();
if (await filed.count()) { await filed.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await hold(4500); } else { await scroll(500, 6); await hold(3000); }
await snap();

// 5. Ask: a cited answer in seconds, and a deeper agent searching the graph and the code in parallel
await caption('5 · Ask with ⌘F', 'a fast answer with citations, while a deeper agent searches the graph and the code');
await p.keyboard.press('Meta+f'); await p.waitForSelector('.search-panel'); await hold(800);
await type('.search-in', QUESTION, 40); await hold(1500); await p.keyboard.press('Enter');
await waitCut(() => p.waitForFunction(() => (document.querySelector('.ask-answer')?.textContent?.length ?? 0) > 80, null, { timeout: 120000 }).catch(() => {}));
await hold(6000); await snap();
await waitCut(() => p.waitForSelector('.ask-chip', { timeout: 120000 }).catch(() => {}), 0.5); await hold(5000);   // its sources arriving, its steps in the head
await waitCut(() => p.waitForFunction(() => /ready/.test(document.querySelector('.ask-more')?.textContent ?? ''), null, { timeout: 240000 }).catch(() => {}), 2);
const more = p.locator('.ask-more'); if (await more.count()) { await more.click(); await hold(1000); await p.locator('.ask-deep').first().evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'start' })).catch(() => {}); await hold(5000); }
await snap();
await p.keyboard.press('Escape'); await hold(600);

// 6. the mind map: the graph as a canvas, a node's context beside it
await go(scenes[3], '6 · Mind map', 'the same knowledge as a canvas — nodes are blocks, links are the graph’s'); await closeContext(); await hold(1000);
const fit = p.locator('button', { hasText: /^Fit$/ }).first(); if (await fit.count()) { await fit.click(); await hold(2500); }
await snap();
const mapNode = p.locator(`.react-flow__node[data-id="${MAP_NODE}"]`).first();
if (await mapNode.count()) { const b = await mapNode.boundingBox(); if (b) { await p.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 12 }); await hold(600); await p.mouse.click(b.x + 40, b.y + b.height / 2); await hold(4500); } }
await snap();

// 7. tables are SQL over the graph — the filters write it, or an agent does
await go(scenes[4], '7 · Tables are queries', 'every table is SQL over the graph — edit it, or ask an agent to write it'); await closeContext(); await hold(800);
const toggle = p.locator('.collection-filter-toggle').nth(TABLE_AT);
await toggle.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'start' })); await hold(1200); await p.mouse.wheel(0, -120); await hold(1500);
await toggle.click(); await hold(2500); await snap();
await type('.sql-ask input', TABLE_ASK, 35); await hold(800); await p.keyboard.press('Enter');
await waitCut(() => p.waitForFunction(() => !document.querySelector('.sql-ask button')?.textContent?.includes('writing'), null, { timeout: 120000 }).catch(() => {}), 1.5);
await hold(3500); await snap();
await p.mouse.move(700, 450); await scroll(450, 6); await hold(4500);
await snap();

await ctx.close(); await browser.close();
console.log(`remember session: ${sid}`);
if (errors.size) console.log(`console errors during the tour:\n${[...errors].join('\n')}`);
const webm = readdirSync(OUT).find(f => f.endsWith('.webm')); renameSync(path.join(OUT, webm), path.join(OUT, 'tour.webm'));
// the magenta frames, at a steady 25 fps: one pixel per frame is enough to tell
const px = spawnSync('ffmpeg', ['-v', 'error', '-i', path.join(OUT, 'tour.webm'), '-vf', 'fps=25,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 }).stdout;
const runs = []; for (let n = 0; n < px.length / 3; n++) {
  const magenta = px[n * 3] > 200 && px[n * 3 + 1] < 80 && px[n * 3 + 2] > 200;
  if (magenta) { const last = runs.at(-1); if (last && last[1] === n - 1) last[1] = n; else runs.push([n, n]); }
}
// a frame either side too, so no blend of the paint is left
const keep = runs.length ? `select='not(${runs.map(([a, b]) => `between(n,${Math.max(0, a - 1)},${b + 1})`).join('+')})',setpts=N/25/TB,` : '';
console.log('cut:', runs.map(([a, b]) => `${(a / 25).toFixed(1)}–${(b / 25).toFixed(1)} s`).join(', ') || 'nothing');
// a gif at 5 fps, 900 px wide, one palette for the whole tour — under GitHub's 10 MB for an image
const vf = 'fps=5,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=80:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
const r = spawnSync('ffmpeg', ['-y', '-i', path.join(OUT, 'tour.webm'), '-vf', 'fps=25,' + keep + vf, '-loop', '0', 'docs/tour.gif'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
