# Jev auto-linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Jev (TypeSafe AI) key is stored in the app's settings, inbox items, document blocks and consolidation cards get `related-to` links to existing knowledge automatically, judged with a calibrated probability over the local search's candidates.

**Architecture:** A root CommonJS module `lib/jev.js` (like `lib/judge.js`) wraps the one HTTP endpoint and offers `judgeLinks` / `judgeKind`; the app holds the key in `data/_settings.json` behind a settings page and passes it in. Candidates always come from `packages/web/src/lib/semantic.ts`; Jev only judges. Three call sites: `addInboxItem`, a new `/api/<p>/links` route the editor calls on blur, and `consolidateSession`.

**Tech Stack:** Node ≥18 (`fetch`), Next.js App Router, vitest (`packages/web`), `node test/*.js` (root), BlockNote editor.

**Spec:** `docs/superpowers/specs/2026-09-20-jev-auto-linking-design.md`

## Global Constraints

- Nothing changes when no key is stored: every judging path returns the un-judged result at once, with no network call.
- The key never leaves the machine except to `https://api.typesafe.ai`; `GET /api/settings` returns only `{ set, last4 }`.
- One threshold `LINK_MIN = 0.85` (in `lib/jev.js`), used by every call site.
- Model `jev-latest`; `WF_JEV_MODEL` overrides.
- Request `{ state, model, questions }`; noul answer `{ type: 'noul', noul: 0.95 }`; choice answer `{ type: 'choice', choice, probabilities, confidence }`. Errors 401 invalid key, 422 validation, 429 rate limit, 529 overloaded.
- Root tests are plain `node:assert` scripts under `test/`, listed in the root `package.json` "test" script; web tests are vitest `*.test.ts` next to the lib file.
- Commit to `main` directly (prototype; no branches), each task its own commit, message in the repo's style: `<area>: <what, in one sentence> (<ids>)`.
- Comments in the repo's voice: a header comment per file saying what it is for; sparse inline comments that say why.

---

### Task 1: `lib/jev.js` — the client

**Files:**
- Create: `lib/jev.js`
- Create: `test/jev.js`
- Modify: `package.json:15` (add `node test/jev.js` to the "test" script, after `test/cards.js`)

**Interfaces:**
- Produces: `jev({ key, model?, fetch? })` → `{ enabled: boolean, ask(state, questions, { timeoutMs? }) → Promise<{ model, answers, usage }>, judgeLinks(text, candidates: {id, text}[]) → Promise<{id, p}[]>, judgeKind(text) → Promise<{ kind, p }> }`; constants `LINK_MIN = 0.85`, `DEFAULT_MODEL`, `promptVersion()` → 8-hex string.

- [ ] **Step 1: Write the failing test**

```js
// test/jev.js
'use strict';
// lib/jev (Jev auto-linking design): the client sends one systemone request with the key, parses noul and choice
// answers, retries on 429/529, and does nothing at all without a key.
const assert = require('assert');
const { jev, LINK_MIN, promptVersion } = require('../lib/jev');

const calls = [];
const fake = (responses) => async (url, init) => {
  calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
  const r = responses.shift();
  return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
};

(async () => {
  // no key: disabled, no call, empty results
  const off = jev({ key: '', fetch: fake([]) });
  assert.strictEqual(off.enabled, false);
  assert.deepStrictEqual(await off.judgeLinks('some text', [{ id: 'req:a', text: 'A' }]), []);
  assert.deepStrictEqual(await off.judgeKind('some text'), { kind: 'note', p: 0 });
  assert.strictEqual(calls.length, 0);

  // judgeLinks: one noul per candidate, keyed by index, answers back in order
  const c = jev({ key: 'k-123', fetch: fake([{ status: 200, body: { model: 'jev-1.13.0', answers: { '0': { type: 'noul', noul: 0.91 }, '1': { type: 'noul', noul: 0.12 } }, usage: { input_tokens: 10, output_tokens: 2 } } }]) });
  assert.strictEqual(c.enabled, true);
  const links = await c.judgeLinks('The checkout rounds half-up.', [{ id: 'rule:round', text: 'Prices round half-up' }, { id: 'req:login', text: 'Users log in with email' }]);
  assert.deepStrictEqual(links, [{ id: 'rule:round', p: 0.91 }, { id: 'req:login', p: 0.12 }]);
  const req = calls[0];
  assert.strictEqual(req.url, 'https://api.typesafe.ai/v1/systemone');
  assert.strictEqual(req.init.method, 'POST');
  assert.strictEqual(req.init.headers.Authorization, 'Bearer k-123');
  assert.strictEqual(req.init.body.model, 'jev-latest');
  assert.strictEqual(req.init.body.state, 'The checkout rounds half-up.');
  assert.strictEqual(req.init.body.questions['0'].type, 'noul');
  assert.ok(req.init.body.questions['0'].instructions.question.includes('`knowledge`'));
  assert.strictEqual(req.init.body.questions['0'].instructions.knowledge, 'rule:round: Prices round half-up');

  // empty candidates: no call
  assert.deepStrictEqual(await c.judgeLinks('text', []), []);
  assert.strictEqual(calls.length, 1);

  // judgeKind: a choice over the five kinds
  const k = jev({ key: 'k', fetch: fake([{ status: 200, body: { model: 'm', answers: { kind: { type: 'choice', choice: 'decision', probabilities: { decision: 0.9, requirement: 0.05, rule: 0.03, question: 0.01, note: 0.01 }, confidence: 0.88 } }, usage: {} } }]) });
  assert.deepStrictEqual(await k.judgeKind('We go with Postgres because of the team.'), { kind: 'decision', p: 0.9 });
  assert.deepStrictEqual(Object.keys(calls[1].init.body.questions.kind.criteria), ['decision', 'requirement', 'rule', 'question', 'note']);

  // 429 then 200: retried; 401: thrown with the status
  const r = jev({ key: 'k', fetch: fake([{ status: 429, body: { error: 'rate' } }, { status: 200, body: { model: 'm', answers: { '0': { type: 'noul', noul: 0.5 } }, usage: {} } }]), backoffMs: 1 });
  assert.deepStrictEqual(await r.judgeLinks('t', [{ id: 'x:y', text: 'z' }]), [{ id: 'x:y', p: 0.5 }]);
  const bad = jev({ key: 'k', fetch: fake([{ status: 401, body: { error: 'invalid key' } }]), backoffMs: 1 });
  await assert.rejects(() => bad.judgeLinks('t', [{ id: 'x:y', text: 'z' }]), /401/);

  assert.strictEqual(LINK_MIN, 0.85);
  assert.match(promptVersion(), /^[0-9a-f]{8}$/);
  console.log('jev: ok');
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/jev.js`
Expected: FAIL with `Cannot find module '../lib/jev'`

- [ ] **Step 3: Write the module**

```js
// lib/jev.js
'use strict';
// Jev (TypeSafe AI) — the decision model that judges candidate links (docs/superpowers/specs/2026-09-20-jev-auto-linking-design.md):
// one POST per judgement with a state and a map of typed questions, typed answers with calibrated probabilities back.
// Candidates always come from the local search; Jev only says, per candidate, how likely the text is about it. The
// client is bound to a key (the app's settings, or TYPESAFE_API_KEY for tests and evals); without one it is disabled
// and every method returns the empty result without a call.
const crypto = require('crypto');

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = process.env.WF_JEV_MODEL || 'jev-latest';
// above this probability a link is written automatically; below it a candidate is only a suggestion
const LINK_MIN = 0.85;
const PROMPT_VERSION = 1;

const LINK_QUESTION = 'Is the text specifically about, or does it directly depend on, the piece of knowledge in `knowledge`? Yes only if a reader of the text would want that knowledge linked from it.';
const KINDS = {
  decision: 'a choice that was made, with its reason ("we go with X because …")',
  requirement: 'what the product must do for someone ("when …, then …")',
  rule: 'a standing rule about the product or how it is built ("always …", "never …")',
  question: 'something raised and left open, without an answer',
  note: 'anything else: pasted material, an observation, a reference',
};
const KIND_QUESTION = 'Which kind of knowledge is this text?';
const promptVersion = () => crypto.createHash('sha1').update(LINK_QUESTION + KIND_QUESTION + JSON.stringify(KINDS) + '#' + PROMPT_VERSION).digest('hex').slice(0, 8);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function jev({ key, model = DEFAULT_MODEL, fetch: f = globalThis.fetch, backoffMs = 500 } = {}) {
  const enabled = !!key;

  async function ask(state, questions, { timeoutMs = 10000 } = {}) {
    if (!enabled) throw new Error('jev: no key');
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(backoffMs * 2 ** (attempt - 1));
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await f(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, state, questions }), signal: ctl.signal });
        if (r.ok) return await r.json();
        last = new Error(`jev: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
        if (r.status !== 429 && r.status !== 529) throw last; // only a rate limit or an overload is worth a retry
      } finally { clearTimeout(t); }
    }
    throw last;
  }

  // per candidate: how likely is the text about it — one noul question each, keyed by index, one call
  async function judgeLinks(text, candidates) {
    if (!enabled || !candidates.length) return [];
    const questions = {};
    candidates.forEach((c, i) => { questions[String(i)] = { type: 'noul', instructions: { knowledge: `${c.id}: ${String(c.text || '').slice(0, 400)}`, question: LINK_QUESTION } }; });
    const { answers } = await ask(text, questions);
    return candidates.map((c, i) => ({ id: c.id, p: Number(answers?.[String(i)]?.noul ?? 0) }));
  }

  // which of the five inbox kinds the text is, with the probability of the winner
  async function judgeKind(text) {
    if (!enabled) return { kind: 'note', p: 0 };
    const { answers } = await ask(text, { kind: { type: 'choice', instructions: KIND_QUESTION, criteria: KINDS } });
    const a = answers?.kind; if (!a || !a.choice) return { kind: 'note', p: 0 };
    return { kind: a.choice, p: Number(a.probabilities?.[a.choice] ?? 0) };
  }

  return { enabled, model, ask, judgeLinks, judgeKind };
}

module.exports = { jev, LINK_MIN, DEFAULT_MODEL, ENDPOINT, promptVersion };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/jev.js`
Expected: `jev: ok`

- [ ] **Step 5: Add to the test script and commit**

In `package.json` "test": insert `node test/jev.js && ` before `node test/cards.js`.

```bash
git add lib/jev.js test/jev.js package.json
git commit -m "jev: lib/jev.js — the TypeSafe client bound to a key: judgeLinks (one noul per candidate, one call) and judgeKind (a choice over the inbox kinds), retry on 429/529, disabled without a key (test/jev.js)"
```

---

### Task 2: Settings store + API

**Files:**
- Create: `packages/web/src/lib/settings.ts`
- Create: `packages/web/src/lib/settings.test.ts`
- Create: `packages/web/src/app/api/settings/route.ts`
- Create: `packages/web/src/app/api/settings/jev/test/route.ts`
- Create: `packages/web/src/lib/jev.ts` (typed bridge to `lib/jev.js`)
- Modify: `.gitignore` (add `data/_settings.json`)

**Interfaces:**
- Produces: `readSettings(root = DATA_ROOT) → Promise<Settings>`, `writeSettings(patch, root) → Promise<Settings>`, `jevKey(root) → Promise<string>`, `publicSettings(s) → { jev: { set: boolean; last4: string } }`; `Settings = { jev?: { key?: string } }`.
- Produces: `packages/web/src/lib/jev.ts`: `jevClient(): Promise<JevClient>` (bound to the stored key, or `TYPESAFE_API_KEY`), `LINK_MIN`, `promptVersion()`, type `JevClient = { enabled: boolean; ask(...); judgeLinks(text, candidates: {id: string; text: string}[]): Promise<{id: string; p: number}[]>; judgeKind(text): Promise<{kind: string; p: number}> }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/settings.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readSettings, writeSettings, jevKey, publicSettings } from './settings';

// the app's settings (Jev auto-linking design §0): one json file under the data root, never committed, the key never
// returned to a browser
describe('settings', () => {
  it('round-trips, keeps the key out of the public view, removes on empty', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wf-settings-'));
    expect(await readSettings(root)).toEqual({});
    expect(await jevKey(root)).toBe('');
    const s = await writeSettings({ jev: { key: 'sk-abcdef1234' } }, root);
    expect(s.jev?.key).toBe('sk-abcdef1234');
    expect(await jevKey(root)).toBe('sk-abcdef1234');
    expect(publicSettings(s)).toEqual({ jev: { set: true, last4: '1234' } });
    const mode = (await stat(path.join(root, '_settings.json'))).mode & 0o777;
    expect(mode).toBe(0o600);
    const gone = await writeSettings({ jev: { key: '' } }, root);
    expect(gone.jev?.key ?? '').toBe('');
    expect(publicSettings(gone)).toEqual({ jev: { set: false, last4: '' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/lib/settings.test.ts`
Expected: FAIL — cannot resolve `./settings`

- [ ] **Step 3: Write the store and the bridge**

```ts
// packages/web/src/lib/settings.ts
// The app's settings (Jev auto-linking design §0): one json file at <data>/_settings.json — local to this machine,
// listed in .gitignore, mode 0600 because it holds keys. Read fresh on every use (cheap, and the page's Save is
// visible to the next request); the browser only ever sees publicSettings().
import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { DATA_ROOT } from './products';

export interface Settings { jev?: { key?: string } }

const file = (root: string) => path.join(root, '_settings.json');

export async function readSettings(root: string = DATA_ROOT): Promise<Settings> {
  try { return JSON.parse(await readFile(file(root), 'utf8')) as Settings; } catch { return {}; }
}
export async function writeSettings(patch: Settings, root: string = DATA_ROOT): Promise<Settings> {
  const cur = await readSettings(root);
  const next: Settings = { ...cur, ...(patch.jev ? { jev: { ...cur.jev, ...patch.jev } } : {}) };
  if (next.jev && !next.jev.key) delete next.jev; // an empty key removes the section
  await writeFile(file(root), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  await chmod(file(root), 0o600).catch(() => {}); // writeFile's mode only applies to a new file
  return next;
}
export async function jevKey(root: string = DATA_ROOT): Promise<string> { return (await readSettings(root)).jev?.key ?? process.env.TYPESAFE_API_KEY ?? ''; }
export function publicSettings(s: Settings): { jev: { set: boolean; last4: string } } {
  const k = s.jev?.key ?? ''; return { jev: { set: !!k, last4: k.slice(-4) } };
}
```

```ts
// packages/web/src/lib/jev.ts
// The app's Jev client (Jev auto-linking design §1): lib/jev.js bound to the key the settings hold — shared with the
// CLI and the eval suite through createRequire like the judge. Disabled without a key: every method returns the
// empty result and makes no call.
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { jevKey } from './settings';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
type Lib = { jev: (o: { key: string; model?: string }) => JevClient; LINK_MIN: number; promptVersion: () => string; DEFAULT_MODEL: string };
const lib = () => req('./lib/jev.js') as Lib;

export type JevClient = {
  enabled: boolean; model: string;
  ask: (state: unknown, questions: Record<string, unknown>, o?: { timeoutMs?: number }) => Promise<{ model: string; answers: Record<string, any>; usage: { input_tokens?: number; output_tokens?: number } }>;
  judgeLinks: (text: string, candidates: { id: string; text: string }[]) => Promise<{ id: string; p: number }[]>;
  judgeKind: (text: string) => Promise<{ kind: string; p: number }>;
};
export const LINK_MIN = () => lib().LINK_MIN;
export const promptVersion = () => lib().promptVersion();
export async function jevClient(): Promise<JevClient> { return lib().jev({ key: await jevKey() }); }
```

Routes:

```ts
// packages/web/src/app/api/settings/route.ts
import { NextResponse } from 'next/server';
import { readSettings, writeSettings, publicSettings } from '@/lib/settings';

// GET → { jev: { set, last4 } } (never the key). PUT { jev: { key } } → the same view; an empty key removes it.
export async function GET() { return NextResponse.json(publicSettings(await readSettings()), { headers: { 'cache-control': 'no-store' } }); }
export async function PUT(req: Request) {
  const body = (await req.json()) as { jev?: { key?: string } };
  if (body.jev && typeof body.jev.key !== 'string') return NextResponse.json({ error: 'invalid', message: 'jev.key must be a string' }, { status: 422 });
  return NextResponse.json(publicSettings(await writeSettings({ jev: { key: (body.jev?.key ?? '').trim() } })));
}
```

```ts
// packages/web/src/app/api/settings/jev/test/route.ts
import { NextResponse } from 'next/server';
import { jevClient } from '@/lib/jev';

// POST → one tiny question to Jev with the stored key: { ok: true, ms, model } or { error }.
export async function POST() {
  const c = await jevClient(); if (!c.enabled) return NextResponse.json({ error: 'no key stored' }, { status: 422 });
  const t0 = Date.now();
  try { const r = await c.ask('Help! My payouts have been failing for 3 days.', { urgent: { type: 'noul', instructions: 'Does this convey urgency?' } }); return NextResponse.json({ ok: true, ms: Date.now() - t0, model: r.model, noul: r.answers?.urgent?.noul }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 }); }
}
```

`.gitignore`: append a line `data/_settings.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npx vitest run src/lib/settings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/settings.ts packages/web/src/lib/settings.test.ts packages/web/src/lib/jev.ts packages/web/src/app/api/settings .gitignore
git commit -m "settings: the app's settings in data/_settings.json (0600, gitignored) — GET/PUT /api/settings shows only set + last4; /api/settings/jev/test asks Jev one question with the stored key; lib/jev.ts binds lib/jev.js to that key"
```

---

### Task 3: Settings page + rail item

**Files:**
- Create: `packages/web/src/app/[product]/settings/page.tsx`
- Create: `packages/web/src/components/SettingsJev.tsx`
- Modify: `packages/web/src/components/Rail.tsx:56` (after the `PlanFolder` line, inside `rail-menu`)
- Modify: `packages/web/src/components/TopBar.tsx:11` (`PAGE_ICONS`: add `settings: '⚙'`)
- Modify: `packages/web/src/app/globals.css` (a few rules for `.settings-key`)

**Interfaces:**
- Consumes: `GET/PUT /api/settings`, `POST /api/settings/jev/test` (Task 2).

- [ ] **Step 1: Page and component**

```tsx
// packages/web/src/app/[product]/settings/page.tsx
import { readSettings, publicSettings } from '@/lib/settings';
import { SettingsJev } from '@/components/SettingsJev';

// The app's settings (Jev auto-linking design §0). Reached from every product's rail but not about one product: what is
// stored here applies to the whole app on this machine.
export default async function SettingsPage() {
  const s = publicSettings(await readSettings());
  return (
    <div className="page">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Settings</h1><p className="sub">for the whole app on this machine — not for one product</p></header>
      <SettingsJev initial={s.jev} />
    </div>
  );
}
```

```tsx
// packages/web/src/components/SettingsJev.tsx
'use client';
import { useState } from 'react';

// The Jev key (Jev auto-linking design §0): masked field, Save / Remove, and Test — one real question with the stored
// key, its round trip shown. A stored key is what switches auto-linking on; there is no other toggle.
export function SettingsJev({ initial }: { initial: { set: boolean; last4: string } }) {
  const [state, setState] = useState(initial);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const put = async (k: string) => {
    setBusy(true); setMsg('');
    const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jev: { key: k } }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    setState(j.jev); setKey(''); setMsg(k ? 'Saved.' : 'Removed.');
  };
  const test = async () => {
    setBusy(true); setMsg('Testing…');
    const r = await fetch('/api/settings/jev/test', { method: 'POST' }); const j = await r.json(); setBusy(false);
    setMsg(r.ok ? `OK · ${j.ms} ms · ${j.model}` : `Failed: ${j.error}`);
  };
  return (
    <section className="settings-section">
      <h2>Jev (TypeSafe AI)</h2>
      <p className="muted">With a key stored, new inbox items, document blocks you edit and consolidation cards are linked to the closest existing knowledge automatically — Jev judges each candidate the local search finds, and a link is written above 85 % probability. Without a key nothing changes. Keys: <a href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">console.typesafe.ai/keys</a>.</p>
      <div className="settings-key">
        <input type="password" autoComplete="off" value={key} placeholder={state.set ? `•••• ${state.last4}` : 'paste an API key'} onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && key.trim()) put(key.trim()); }} />
        <button disabled={busy || !key.trim()} onClick={() => put(key.trim())}>Save</button>
        <button disabled={busy || !state.set} onClick={test}>Test</button>
        <button disabled={busy || !state.set} onClick={() => put('')}>Remove</button>
      </div>
      {msg && <p className={msg.startsWith('Failed') ? 'notice' : 'muted'}>{msg}</p>}
    </section>
  );
}
```

Rail (`Rail.tsx`, inside `<ul className="rail-menu">` after `<PlanFolder … />`): `{item(`${base}/settings`, 'Settings', '⚙')}`.

TopBar `PAGE_ICONS`: add `settings: '⚙'`.

`globals.css` (append):

```css
/* settings page */
.settings-section { max-width: 640px; }
.settings-key { display: flex; gap: 8px; align-items: center; margin: 12px 0; }
.settings-key input { flex: 1; min-width: 0; }
```

- [ ] **Step 2: Check it in the app**

Run: `npm run dev` (port 3456 per `packages/web`), open `http://localhost:3456/waterfall/settings`. Paste the key, Save → `•••• xxxx` placeholder; Test → `OK · nnn ms · jev-1.x`; confirm `data/_settings.json` exists with mode `-rw-------` and `git status` does not list it.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/\[product\]/settings packages/web/src/components/SettingsJev.tsx packages/web/src/components/Rail.tsx packages/web/src/components/TopBar.tsx packages/web/src/app/globals.css
git commit -m "settings: a Settings page (rail ⚙, /<product>/settings, app-wide) with the Jev key — masked, Save / Test / Remove; a stored key switches auto-linking on"
```

---

### Task 4: Candidate text + the links cache (`links.ts`, server half)

**Files:**
- Create: `packages/web/src/lib/links.ts`
- Create: `packages/web/src/lib/links.test.ts`

**Interfaces:**
- Consumes: `search(productDir, graph, q, { limit, exclude })` from `semantic.ts`; `JevClient` (Task 2); `parseBody(body)` from `graph.ts`.
- Produces:
  - `candidateText(n: GraphNode) → string` — title/text/statement/q/description of a node, ≤ 400 chars.
  - `judgeText(productDir, graph, text, opts: { jev: JevClient; exclude?: string[]; limit?: number; searchFn?: typeof search }) → Promise<{ id: string; score: number; p: number }[]>` — search hits with Jev's probability (`p = 0` for every hit when the client is disabled).
  - `confidentIds(hits) → string[]` — ids with `p ≥ LINK_MIN`, in hit order.
  - `linksFor(productDir, graph, blocks: { key: string; text: string; linked: string[] }[], jev) → Promise<Record<string, string[]>>` — confident ids per block key, cached in `<productDir>/_build/jev.json` by `sha1(text)` and prompt version.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/links.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { candidateText, judgeText, confidentIds, linksFor } from './links';
import type { GraphData, GraphNode } from './graph';
import type { JevClient } from './jev';

// automatic links (Jev auto-linking design §3): the search finds candidates, Jev judges them, the confident ones are
// the links; a block's verdict is cached by its text so it is never judged twice
const node = (id: string, body: string): GraphNode => ({ id, kind: id.split(':')[0], slug: id.split(':')[1], title: '', status: '', file: 'x.md', line: 1, body, defined: true } as unknown as GraphNode);
const graph = (nodes: GraphNode[]): GraphData => ({ generatedAt: '', modules: [], files: [], nodes, edges: [], fieldIndex: {} });
const fakeJev = (ps: Record<string, number>, calls: string[] = []): JevClient => ({
  enabled: true, model: 'fake', ask: async () => ({ model: 'fake', answers: {}, usage: {} }),
  judgeLinks: async (text, cands) => { calls.push(text); return cands.map(c => ({ id: c.id, p: ps[c.id] ?? 0 })); },
  judgeKind: async () => ({ kind: 'note', p: 0 }),
});
const off: JevClient = { ...fakeJev({}), enabled: false };
const searchFn = async () => Object.assign([{ id: 'rule:round', score: 0.7, semantic: 0.7, keyword: 0, snippet: '' }, { id: 'req:login', score: 0.4, semantic: 0.4, keyword: 0, snippet: '' }], { hidden: 0 });

describe('links', () => {
  const g = graph([node('rule:round', 'statement: prices round half-up'), node('req:login', 'title: Login\nwhen: a user signs in')]);
  it('candidateText takes the prose key of a node', () => {
    expect(candidateText(g.nodes[0])).toBe('prices round half-up');
    expect(candidateText(g.nodes[1])).toBe('Login. a user signs in');
  });
  it('judgeText attaches p to every hit; disabled → p 0, no call', async () => {
    const calls: string[] = [];
    const hits = await judgeText('/tmp/none', g, 'Checkout rounds half-up', { jev: fakeJev({ 'rule:round': 0.93, 'req:login': 0.1 }, calls), searchFn: searchFn as never });
    expect(hits).toEqual([{ id: 'rule:round', score: 0.7, p: 0.93 }, { id: 'req:login', score: 0.4, p: 0.1 }]);
    expect(calls).toEqual(['Checkout rounds half-up']);
    expect(confidentIds(hits)).toEqual(['rule:round']);
    const cold = await judgeText('/tmp/none', g, 'Checkout rounds half-up', { jev: off, searchFn: searchFn as never });
    expect(cold.map(h => h.p)).toEqual([0, 0]);
  });
  it('linksFor judges each block once and leaves out what it already links', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-links-')); await mkdir(path.join(dir, '_build'), { recursive: true });
    const calls: string[] = [];
    const j = fakeJev({ 'rule:round': 0.93, 'req:login': 0.9 }, calls);
    const blocks = [{ key: 'b1', text: 'Checkout rounds half-up', linked: ['req:login'] }, { key: 'b2', text: 'short', linked: [] }];
    expect(await linksFor(dir, g, blocks, j, searchFn as never)).toEqual({ b1: ['rule:round'] });
    expect(calls).toEqual(['Checkout rounds half-up']); // b2 is under the minimum length
    expect(await linksFor(dir, g, blocks, j, searchFn as never)).toEqual({ b1: ['rule:round'] });
    expect(calls.length).toBe(1); // cached
    const cache = JSON.parse(await readFile(path.join(dir, '_build/jev.json'), 'utf8'));
    expect(Object.keys(cache.entries).length).toBe(1);
    expect(await linksFor(dir, g, blocks, off, searchFn as never)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/lib/links.test.ts`
Expected: FAIL — cannot resolve `./links`

- [ ] **Step 3: Write `links.ts`**

```ts
// packages/web/src/lib/links.ts
// Automatic links (Jev auto-linking design §3): the local search finds candidates for a text, Jev judges each
// ("is the text about it?" → probability), and the ids above LINK_MIN are the links. judgeText is the shared step
// (inbox, editor, consolidation); linksFor is the editor's batch — per block, cached by the text's hash in
// <product>/_build/jev.json so an unchanged block is never judged twice, invalidated when the question wording changes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { search as semanticSearch } from './semantic';
import { parseBody, type GraphData, type GraphNode } from './graph';
import { LINK_MIN, promptVersion, type JevClient } from './jev';

export type JudgedHit = { id: string; score: number; p: number };
type SearchFn = typeof semanticSearch;
const TEXT_KEYS = ['title', 'text', 'statement', 'q', 'description', 'when', 'then', 'choice'];
// the ContextPanel's own minimum: below this there is nothing to judge
export const MIN_TEXT = 12;

// the sentence Jev sees for a candidate: its prose keys, in the card's order, capped
export function candidateText(n: GraphNode): string {
  const rows = parseBody(n.body ?? '');
  const parts = TEXT_KEYS.map(k => rows.find(r => r.key === k)?.value ?? '').filter(Boolean);
  return (parts.join('. ') || n.title || n.id).slice(0, 400);
}

export async function judgeText(productDir: string, graph: GraphData, text: string, opts: { jev: JevClient; exclude?: string[]; limit?: number; searchFn?: SearchFn }): Promise<JudgedHit[]> {
  const hits = await (opts.searchFn ?? semanticSearch)(productDir, graph, text, { limit: opts.limit ?? 12, exclude: opts.exclude });
  if (!opts.jev.enabled || !hits.length) return hits.map(h => ({ id: h.id, score: h.score, p: 0 }));
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const ps = await opts.jev.judgeLinks(text, hits.map(h => ({ id: h.id, text: candidateText(byId.get(h.id) ?? ({ id: h.id, body: '' } as GraphNode)) })));
  return hits.map((h, i) => ({ id: h.id, score: h.score, p: ps[i]?.p ?? 0 }));
}

export const confidentIds = (hits: JudgedHit[]): string[] => hits.filter(h => h.p >= LINK_MIN()).map(h => h.id);

type Cache = { version: string; entries: Record<string, { ids: string[]; at: string }> };
const sha = (s: string) => createHash('sha1').update(s).digest('hex');
async function readCache(file: string): Promise<Cache> {
  try { const c = JSON.parse(await readFile(file, 'utf8')) as Cache; if (c.version === promptVersion()) return c; } catch { /* cold */ }
  return { version: promptVersion(), entries: {} };
}

export async function linksFor(productDir: string, graph: GraphData, blocks: { key: string; text: string; linked: string[] }[], jev: JevClient, searchFn?: SearchFn): Promise<Record<string, string[]>> {
  if (!jev.enabled) return {};
  const file = path.join(productDir, '_build/jev.json');
  const cache = await readCache(file); let dirty = false;
  const out: Record<string, string[]> = {};
  for (const b of blocks) {
    const text = b.text.trim(); if (text.length < MIN_TEXT) continue;
    const h = sha(text);
    let ids = cache.entries[h]?.ids;
    if (!ids) {
      try { ids = confidentIds(await judgeText(productDir, graph, text, { jev, searchFn })); } catch (e) { console.warn('jev: link judgement failed —', e instanceof Error ? e.message : e); continue; }
      cache.entries[h] = { ids, at: new Date().toISOString() }; dirty = true;
    }
    const fresh = ids.filter(id => !b.linked.includes(id));
    if (fresh.length) out[b.key] = fresh;
  }
  if (dirty) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(cache)); }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npx vitest run src/lib/links.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/links.ts packages/web/src/lib/links.test.ts
git commit -m "links: lib/links — judgeText (search candidates + Jev probability), confidentIds (≥ LINK_MIN), linksFor (per block, cached by text hash in _build/jev.json)"
```

---

### Task 5: Inbox — linked on arrival, `p` in the filing suggestion

**Files:**
- Modify: `packages/web/src/lib/inbox.ts:43-52` (`addInboxItem`), `:67-83` (`suggestFiling`)
- Create: `packages/web/src/lib/inbox-jev.test.ts`
- Modify: `packages/web/src/app/api/[product]/inbox/route.ts:16-17` (POST: judge after the add)
- Modify: `packages/web/src/components/InboxList.tsx:8` and `:62` (`p` shown when present)

**Interfaces:**
- Consumes: `judgeText`, `confidentIds` (Task 4); `jevClient` (Task 2); `loadGraph` from `./graph` (already used in `consolidate.ts`).
- Produces: `linkInboxItem(productDir, graph, name, jev, searchFn?) → Promise<{ refs: string[]; type?: string }>` — judges the item, patches its head, returns what it added. `suggestFiling(productDir, graph, product, item, jev?)` → `similar: { id, score, p? }[]`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/inbox-jev.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addInboxItem, linkInboxItem, listInboxItems, suggestFiling } from './inbox';
import type { GraphData, GraphNode } from './graph';
import type { JevClient } from './jev';

// an inbox item is linked on arrival (Jev auto-linking design §2): refs merged with the confident candidates,
// linked-by: jev, and an untyped note takes the kind Jev is sure of
const node = (id: string, body: string, file = 'data/products/p/projects/x/docs/prd.md'): GraphNode => ({ id, kind: id.split(':')[0], slug: id.split(':')[1], title: '', status: '', file, line: 1, body, defined: true } as unknown as GraphNode);
const g: GraphData = { generatedAt: '', modules: [], files: [], nodes: [node('rule:round', 'statement: prices round half-up'), node('req:login', 'title: Login')], edges: [], fieldIndex: {} };
const searchFn = async () => Object.assign([{ id: 'rule:round', score: 0.7, semantic: 0.7, keyword: 0, snippet: '' }, { id: 'req:login', score: 0.4, semantic: 0.4, keyword: 0, snippet: '' }], { hidden: 0 });
const jev = (ps: Record<string, number>, kind = { kind: 'decision', p: 0.92 }): JevClient => ({ enabled: true, model: 'fake', ask: async () => ({ model: '', answers: {}, usage: {} }), judgeLinks: async (_t, c) => c.map(x => ({ id: x.id, p: ps[x.id] ?? 0 })), judgeKind: async () => kind });

describe('inbox + jev', () => {
  it('merges confident refs, marks linked-by, types an untyped note', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-jev-'));
    const name = await addInboxItem(dir, { text: 'We round half-up at checkout because of the accountant.', refs: ['req:login'] });
    const r = await linkInboxItem(dir, g, name, jev({ 'rule:round': 0.95, 'req:login': 0.2 }), searchFn as never);
    expect(r).toEqual({ refs: ['rule:round'], type: 'decision' });
    const md = await readFile(path.join(dir, 'inbox', name), 'utf8');
    expect(md).toMatch(/^refs: req:login, rule:round$/m); // explicit first, then the judged
    expect(md).toMatch(/^linked-by: jev$/m);
    expect(md).toMatch(/^type: decision$/m);
    const item = (await listInboxItems(dir)).find(i => i.name === name)!;
    expect(item.refs).toEqual(['req:login', 'rule:round']); expect(item.type).toBe('decision');
  });
  it('keeps an explicit type and writes nothing when nothing is confident', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-jev-'));
    const name = await addInboxItem(dir, { type: 'question', title: 'Which rounding?' });
    expect(await linkInboxItem(dir, g, name, jev({ 'rule:round': 0.5 }), searchFn as never)).toEqual({ refs: [] });
    const md = await readFile(path.join(dir, 'inbox', name), 'utf8');
    expect(md).not.toMatch(/linked-by/); expect(md).toMatch(/^type: question$/m);
  });
  it('suggestFiling carries p on the similar hits when a client is given', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'wf-inbox-jev-'));
    const name = await addInboxItem(dir, { text: 'Rounding at checkout' });
    const item = (await listInboxItems(dir)).find(i => i.name === name)!;
    const s = await suggestFiling(dir, g, 'p', item, jev({ 'rule:round': 0.9 }), searchFn as never);
    expect(s.similar[0]).toEqual({ id: 'rule:round', score: 0.7, p: 0.9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/lib/inbox-jev.test.ts`
Expected: FAIL — `linkInboxItem` is not exported

- [ ] **Step 3: Implement**

In `inbox.ts`, add imports `import { judgeText, confidentIds } from './links'; import { LINK_MIN, type JevClient } from './jev';` and after `addInboxItem`:

```ts
// Linked on arrival (Jev auto-linking design §2): the item's text against the closest knowledge, the confident ids
// merged into refs (explicit ones first), an untyped note typed when Jev is sure. Runs after the add returned so
// neither `wye inbox add` nor the UI waits for the call; a failure leaves the item as it was.
export async function linkInboxItem(productDir: string, graph: GraphData, name: string, jev: JevClient, searchFn?: Parameters<typeof judgeText>[3]['searchFn']): Promise<{ refs: string[]; type?: string }> {
  if (!jev.enabled) return { refs: [] };
  const item = (await listInboxItems(productDir)).find(i => i.name === name); if (!item) return { refs: [] };
  const text = [item.title, item.body, ...Object.values(item.fields)].filter(Boolean).join('. ');
  const hits = await judgeText(productDir, graph, text, { jev, limit: 15, exclude: item.refs, searchFn });
  const refs = confidentIds(hits).filter(id => !item.refs.includes(id));
  const patch: Record<string, string> = {};
  if (refs.length) { patch.refs = [...item.refs, ...refs].join(', '); patch['linked-by'] = 'jev'; }
  let type: string | undefined;
  if (item.type === 'note' && !item.fields.q && !item.fields.choice) { // came without a type: the head's default
    const k = await jev.judgeKind(text).catch(() => ({ kind: 'note', p: 0 }));
    if (k.p >= LINK_MIN() && ['decision', 'requirement', 'rule', 'question'].includes(k.kind)) { type = k.kind; patch.type = k.kind; }
  }
  if (Object.keys(patch).length) await patchHead(productDir, name, patch);
  return { refs, ...(type ? { type } : {}) };
}
```

Note: `addInboxItem` writes `type: note` for an untyped item, so "came without a type" is read as `type === 'note'` — a note explicitly typed as a note is indistinguishable and may be retyped; acceptable (the review still happens at filing).

`suggestFiling`: add parameters `jev?: JevClient, searchFn?` and replace the `hits` line:

```ts
  let hits: { id: string; score: number; p?: number }[] = [];
  try {
    hits = jev?.enabled ? await judgeText(productDir, graph, text, { jev, limit: 8, searchFn }) : (await (searchFn ?? search)(productDir, graph, text, { limit: 8 })).map(h => ({ id: h.id, score: h.score }));
  } catch { /* no model yet */ }
```

and the return type's `similar` becomes `{ id: string; score: number; p?: number }[]`.

Inbox POST route, after `const name = await addInboxItem(p.dir, body);`:

```ts
  // linked on arrival (Jev auto-linking design §2), detached: the response does not wait for the judgement
  void (async () => { const c = await jevClient(); if (!c.enabled) return; const graph = await loadGraph(p.graphPath); await linkInboxItem(p.dir, graph, name, c); })().catch(e => console.warn('jev: inbox link failed —', e instanceof Error ? e.message : e));
```

with imports `import { jevClient } from '@/lib/jev'; import { loadGraph } from '@/lib/graph'; import { linkInboxItem } from '@/lib/inbox';` (check `loadGraph`'s export name in `graph.ts` — `consolidate.ts` imports it the same way).

Inbox item GET route (`inbox/[name]/route.ts`): `const suggestion = await suggestFiling(scope.product.dir, scope.graph, product, item, await jevClient());`.

`InboxList.tsx`: `Suggestion.similar` type gets `p?: number`; the percentage becomes `<small title={s.p !== undefined ? 'Jev' : 'search'}>{Math.round((s.p ?? s.score) * 100)}%</small>`.

- [ ] **Step 4: Run the tests**

Run: `cd packages/web && npx vitest run src/lib/inbox-jev.test.ts src/lib/consolidate.test.ts`
Expected: PASS

- [ ] **Step 5: Try it live**

With the key stored: `node bin/wf.js inbox add --product waterfall --title "test jev" <<< "Every block is a node — the parser treats each yaml card as a node with an id."` then `node bin/wf.js inbox list --product waterfall` → the new item shows refs like `decision:ontology.every-block-is-a-node…`. Dismiss it afterwards from the Inbox page.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/inbox.ts packages/web/src/lib/inbox-jev.test.ts packages/web/src/app/api/\[product\]/inbox packages/web/src/components/InboxList.tsx
git commit -m "inbox: an item is linked on arrival when a Jev key is stored — refs merged with the candidates Jev is sure of (≥ 0.85, linked-by: jev), an untyped note typed by judgeKind; the filing suggestion shows Jev's probability"
```

---

### Task 6: Editor — `/api/<p>/links` route and `applyLinks`

**Files:**
- Create: `packages/web/src/app/api/[product]/links/route.ts`
- Modify: `packages/web/src/lib/links.ts` (add `applyLinks`, pure, client-safe — no node imports at the call site: put it in a new file `packages/web/src/lib/apply-links.ts` so the client bundle does not pull `node:fs`)
- Create: `packages/web/src/lib/apply-links.ts`, `packages/web/src/lib/apply-links.test.ts`
- Modify: `packages/web/src/components/DocEditor.tsx:764-774` (`retag`) and the load path (~line 705) to remember block text hashes

**Interfaces:**
- Consumes: `linksFor` (Task 4), `jevClient` (Task 2).
- Produces: `POST /api/<p>/links { blocks: [{ key, text, linked }] } → { links: { [key]: string[] } }`; `applyLinks(blocks: AnyBlock[], links: Record<string, string[]>) → { blocks: AnyBlock[]; changed: boolean }` where key = block id; `blockText(block) → string`, `blockLinked(block) → string[]` (the same extraction `publishContext` does, moved so both use it).

- [ ] **Step 1: Write the failing test**

```ts
// packages/web/src/lib/apply-links.test.ts
import { describe, it, expect } from 'vitest';
import { applyLinks, blockText, blockLinked } from './apply-links';

// links applied in the editor (Jev auto-linking design §3): a paragraph or a prose node gets the ids as tags at its
// end; a yaml card gets them merged into related-to in its body; anything else is left alone
const p = (id: string, content: unknown[]) => ({ id, type: 'paragraph', props: {}, content });
const t = (text: string) => ({ type: 'text', text, styles: {} });
const tag = (id: string) => ({ type: 'tag', props: { id } });

describe('applyLinks', () => {
  it('reads a block\'s text and links', () => {
    const b = p('b1', [t('Checkout rounds '), tag('rule:round'), t(' always')]);
    expect(blockText(b as never)).toBe('Checkout rounds  always');
    expect(blockLinked(b as never)).toEqual(['rule:round']);
  });
  it('appends tags to a paragraph, once, with a space', () => {
    const r = applyLinks([p('b1', [t('Checkout rounds half-up')])] as never, { b1: ['rule:round', 'req:pay'] });
    expect(r.changed).toBe(true);
    expect(r.blocks[0].content).toEqual([t('Checkout rounds half-up'), t(' '), tag('rule:round'), t(' '), tag('req:pay')]);
  });
  it('merges into related-to on a yaml card, no duplicates', () => {
    const card = { id: 'c1', type: 'node', props: { kind: 'decision', slug: 'x', form: 'yaml', body: 'title: X\nrelated-to: [req:a]\nstatus: proposed' }, content: [] };
    const r = applyLinks([card] as never, { c1: ['req:a', 'rule:round'] });
    expect((r.blocks[0].props as { body: string }).body).toBe('title: X\nrelated-to: [req:a, rule:round]\nstatus: proposed');
    const fresh = applyLinks([{ ...card, props: { ...card.props, body: 'title: X' } }] as never, { c1: ['rule:round'] });
    expect((fresh.blocks[0].props as { body: string }).body).toBe('title: X\nrelated-to: [rule:round]');
  });
  it('leaves code, embeds and unknown keys alone', () => {
    const code = { id: 'k', type: 'codeBlock', props: {}, content: [t('x = 1')] };
    const r = applyLinks([code, p('b2', [t('hello there world')])] as never, { k: ['req:a'], nope: ['req:b'] });
    expect(r.changed).toBe(false); expect(r.blocks[0]).toBe(code);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/lib/apply-links.test.ts`
Expected: FAIL — cannot resolve `./apply-links`

- [ ] **Step 3: Write `apply-links.ts` and the route**

```ts
// packages/web/src/lib/apply-links.ts
// Links applied in the editor (Jev auto-linking design §3), pure and client-safe: a paragraph or a prose node gets the
// ids as smart tags at its end (the prose convention — a tag in text is a related-to edge); a yaml card gets them
// merged into related-to in its body. Code, embeds, drawings and blocks not in the map are untouched.
type Inline = { type: string; text?: string; props?: { id?: string }; href?: string; content?: { text?: string }[]; styles?: Record<string, unknown> };
export type LinkBlock = { id?: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: LinkBlock[] };

const TEXT_TYPES = new Set(['paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem', 'heading', 'node']);

export function blockText(b: LinkBlock): string {
  if (!Array.isArray(b.content)) return '';
  return (b.content as Inline[]).map(i => i.type === 'text' ? i.text ?? '' : i.type === 'link' ? (i.content ?? []).map(c => c.text ?? '').join('') : '').join('');
}
export function blockLinked(b: LinkBlock): string[] {
  const items = Array.isArray(b.content) ? (b.content as Inline[]) : [];
  const linked = items.flatMap(i => i.type === 'tag' && i.props?.id ? [i.props.id] : i.type === 'link' && i.href && /^[a-z-]+:/.test(i.href) ? [i.href] : []);
  const np = b.type === 'node' ? (b.props as { kind?: string; slug?: string }) : null;
  if (np?.slug) linked.push(`${np.kind}:${np.slug}`);
  return linked;
}

function mergeRelated(body: string, ids: string[]): string {
  const lines = body.split('\n'); const i = lines.findIndex(l => /^\s*related-to:/.test(l));
  const cur = i >= 0 ? (lines[i].match(/\[(.*)\]/)?.[1] ?? lines[i].replace(/^\s*related-to:\s*/, '')).split(/[,\s]+/).filter(Boolean) : [];
  const all = [...cur, ...ids.filter(id => !cur.includes(id))];
  if (all.length === cur.length) return body;
  const line = `${i >= 0 ? lines[i].match(/^\s*/)![0] : ''}related-to: [${all.join(', ')}]`;
  if (i >= 0) lines[i] = line; else lines.push(line);
  return lines.join('\n');
}

export function applyLinks<T extends LinkBlock>(blocks: T[], links: Record<string, string[]>): { blocks: T[]; changed: boolean } {
  let changed = false;
  const out = blocks.map(b => {
    const ids = b.id ? links[b.id] : undefined; if (!ids?.length || !TEXT_TYPES.has(b.type)) return b;
    const have = blockLinked(b); const fresh = ids.filter(id => !have.includes(id)); if (!fresh.length) return b;
    const props = b.props as { form?: string; body?: string } | undefined;
    if (b.type === 'node' && props?.form === 'yaml') {
      const body = mergeRelated(props.body ?? '', fresh); if (body === (props.body ?? '')) return b;
      changed = true; return { ...b, props: { ...b.props, body } };
    }
    if (!Array.isArray(b.content)) return b;
    changed = true;
    const tail = fresh.flatMap(id => [{ type: 'text', text: ' ', styles: {} }, { type: 'tag', props: { id } }]);
    return { ...b, content: [...(b.content as unknown[]), ...tail] };
  });
  return { blocks: out, changed };
}
```

```ts
// packages/web/src/app/api/[product]/links/route.ts
import { NextResponse } from 'next/server';
import { loadScope } from '@/lib/scope';
import { jevClient } from '@/lib/jev';
import { linksFor } from '@/lib/links';

// POST { blocks: [{ key, text, linked }] } → { links: { [key]: ids } } — the ids Jev is sure each block is about
// (Jev auto-linking design §3), judged over the local search's candidates, cached by text. {} without a key.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const c = await jevClient(); if (!c.enabled) return NextResponse.json({ links: {} });
  const scope = await loadScope(product); if (!scope) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json()) as { blocks?: { key: string; text: string; linked?: string[] }[] };
  const blocks = (body.blocks ?? []).filter(b => b && typeof b.key === 'string' && typeof b.text === 'string').slice(0, 40).map(b => ({ key: b.key, text: b.text, linked: b.linked ?? [] }));
  return NextResponse.json({ links: await linksFor(scope.product.dir, scope.graph, blocks, c) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/web && npx vitest run src/lib/apply-links.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the editor**

In `DocEditor.tsx`:
1. Import `{ applyLinks, blockText, blockLinked }` from `@/lib/apply-links`; replace the two inline extractions in `publishContext` (the `text` and `linked` consts, lines ~683-686) with `blockText(block)` / `blockLinked(block)` (keep `np`/`nodeId` as is).
2. Add a ref `const judged = useRef<Map<string, string>>(new Map());` — block id → text at the last judgement (or at load). Where the document is loaded into the editor (the `editor.replaceBlocks(editor.document, blocks…)` at ~line 709), after it: `judged.current = new Map((editor.document as unknown as LinkBlock[]).map(b => [String(b.id), blockText(b)]));`.
3. New function next to `retag`:

```ts
  // Links Jev is sure of, applied on leaving the editor (Jev auto-linking design §3): the blocks whose text changed
  // since the last judgement go to /links; the ids come back as tags / related-to through applyLinks, then the save.
  const autoLink = async () => {
    if (scoped) return;
    const blocks = editor.document as unknown as LinkBlock[];
    const changed = blocks.filter(b => b.id && blockText(b).trim().length >= 12 && judged.current.get(String(b.id)) !== blockText(b));
    if (!changed.length) return;
    for (const b of changed) judged.current.set(String(b.id), blockText(b));
    let links: Record<string, string[]> = {};
    try { const r = await fetch(`/api/${product}/links`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blocks: changed.map(b => ({ key: String(b.id), text: blockText(b), linked: blockLinked(b) })) }) }); links = (await r.json()).links ?? {}; } catch { return; }
    if (!Object.keys(links).length) return;
    const now = editor.document as unknown as LinkBlock[];
    const r = applyLinks(now, links); if (!r.changed) return;
    loading.current = true; editor.replaceBlocks(editor.document, r.blocks as never); loading.current = false;
    for (const b of r.blocks) if (b.id && links[b.id]) judged.current.set(String(b.id), blockText(b));
    touched.current = true; changed(); publishContext();
  };
```

   (`changed` the function shadows the local const — name the local `stale` instead.) In `retag`, after the existing body's last `changed();`, add `void autoLink();` — and also call it at the start of `retag` when nothing else changed: simplest is to make the last statement of `retag` unconditional: restructure so `void autoLink()` runs whenever `retag` fires (before the early `return` on unchanged expansion). Keep the ordering: expansion first (ids typed as text become tags — they count as `linked`), then `autoLink`.

4. `LinkBlock` type import from `@/lib/apply-links`.

- [ ] **Step 6: Check it in the app**

`npm run dev`; open a scratch document in the `waterfall` product (create one under a project), type a paragraph that plainly refers to an existing decision (e.g. "the parser treats each yaml card as a node with its own id, every block is a node"), click outside the editor. Expected: within a second the paragraph ends with a tag for the matching node, the save state goes through "saving → saved", `_build/jev.json` has one entry. Click back in and out: no second call (no new entry, no duplicate tag). Delete the scratch document afterwards.

- [ ] **Step 7: Run the web tests and commit**

Run: `cd packages/web && npx vitest run`
Expected: PASS

```bash
git add packages/web/src/lib/apply-links.ts packages/web/src/lib/apply-links.test.ts packages/web/src/app/api/\[product\]/links packages/web/src/components/DocEditor.tsx
git commit -m "editor: blocks whose text changed are linked on leaving the editor when a Jev key is stored — POST /api/<p>/links judges them (cached by text), applyLinks appends the confident ids as tags to a paragraph / prose node or merges them into a yaml card's related-to, then the normal save"
```

---

### Task 7: ContextPanel shows Jev's probability

**Files:**
- Modify: `packages/web/src/app/api/[product]/context/route.ts`
- Modify: `packages/web/src/components/ContextPanel.tsx:7` (Hit type), `:28` (request), `:53` (score cell)

**Interfaces:**
- Consumes: `judgeText` (Task 4), `jevClient` (Task 2), `LINK_MIN`.
- Produces: `POST /api/<p>/context { …, judge: true }` → hits carry `p?: number`, response carries `jev: boolean`.

- [ ] **Step 1: Route**

In the context route, after computing `hits`, when `body.judge`:

```ts
    const c = await jevClient();
    if (body.judge && c.enabled) {
      const judged = await judgeText(scope.product.dir, scope.graph, text, { jev: c, exclude: body.exclude, limit: Math.min(30, body.limit ?? 12) });
      const p = new Map(judged.map(h => [h.id, h.p]));
      return NextResponse.json({ hits: hits.map(h => ({ ...h, p: p.get(h.id) })), hidden: hits.hidden ?? 0, jev: true, min: LINK_MIN() });
    }
```

(`judgeText` runs its own search; to avoid searching twice, pass the hits: add an optional `hits` parameter to `judgeText` in `links.ts` — `opts.hits ?? await search(...)` — and use it here. Add one line to `links.test.ts` asserting that passing `hits` skips the search.)

- [ ] **Step 2: Panel**

`Hit` type gets `p?: number`; the fetch body gets `judge: true`; state gets `min` (from the response, default 0.85). The score cell becomes:

```tsx
<span className={`ctx-score ${h.p !== undefined && h.p >= min ? 'ctx-sure' : ''}`} title={h.p !== undefined ? `Jev ${Math.round(h.p * 100)}% — ${h.p >= min ? 'will be linked when you leave the editor' : 'below the link threshold'} · search ${h.score.toFixed(2)}` : `semantic ${h.semantic.toFixed(2)} · keywords ${h.keyword.toFixed(2)}`}>{Math.round((h.p ?? h.score) * 100)}%</span>
```

`globals.css`: `.ctx-sure { color: var(--accent); font-weight: 600; }` (use the accent variable the file already defines for `.on`).

- [ ] **Step 3: Check in the app, run tests, commit**

With the key stored, put the cursor in a paragraph: the column shows Jev's percentages, confident ones highlighted; without the key the column is unchanged.

```bash
git add packages/web/src/app/api/\[product\]/context/route.ts packages/web/src/components/ContextPanel.tsx packages/web/src/lib/links.ts packages/web/src/lib/links.test.ts packages/web/src/app/globals.css
git commit -m "context panel: with a Jev key the closest knowledge shows Jev's probability, the ones above the threshold marked as what will be linked on leaving the editor"
```

---

### Task 8: Consolidation cards linked before they are written

**Files:**
- Modify: `packages/web/src/lib/consolidate.ts:45-55` (`candidateCard` takes `related?: string[]`), `:67-84` (`consolidateSession` judges each candidate)
- Modify: `packages/web/src/lib/consolidate.test.ts` (one new test)

**Interfaces:**
- Consumes: `judgeText`, `confidentIds` (Task 4); `jevClient` (Task 2).
- Produces: `candidateCard(id, c, s, planId, agentName, date, related?: string[])`; `consolidateSession(productDir, product, s, opts: { model?: string; jev?: JevClient; searchFn? })`.

- [ ] **Step 1: Write the failing test** (append to `consolidate.test.ts`, reuse the file's existing `Session` fixture pattern from its `consolidateSession` test around line 80)

```ts
  it('candidateCard carries related-to when links are given', () => {
    const card = candidateCard('decision:shop.round', { kind: 'decision', title: 'Round half-up', text: 'because the accountant', by: 'person', evidence: [1] }, { id: 'abc' }, 'plan:p', 'claude-code', '2026-09-20', ['rule:round', 'req:pay']);
    expect(card).toContain('  related-to: [rule:round, req:pay]');
    expect(candidateCard('decision:shop.round', { kind: 'decision', title: 'X', text: 'y', by: 'person', evidence: [] }, { id: 'abc' }, 'plan:p', 'claude-code', '2026-09-20')).not.toContain('related-to');
  });
```

and, in the existing `consolidateSession` test (the one that stubs `WF_JUDGE_CMD` / the judge and checks the plan doc), pass `jev` and a `searchFn` in `opts` and assert the written card contains `related-to: [<the id the stub returns at 0.9>]`. The stub: `{ enabled: true, judgeLinks: async (_t, c) => c.map(x => ({ id: x.id, p: 0.9 })), judgeKind: async () => ({ kind: 'note', p: 0 }), ask: async () => ({ model: '', answers: {}, usage: {} }), model: 'fake' }` and `searchFn: async () => Object.assign([{ id: '<an id that exists in the test graph>', score: 0.5, semantic: 0.5, keyword: 0, snippet: '' }], { hidden: 0 })`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/web && npx vitest run src/lib/consolidate.test.ts`
Expected: FAIL — `related-to` missing

- [ ] **Step 3: Implement**

`candidateCard`: add the parameter `related: string[] = []` and, before `status`, `if (related.length) lines.push(`  related-to: [${related.join(', ')}]`);`.

`consolidateSession`: signature `opts: { model?: string; jev?: JevClient; searchFn?: SearchFn } = {}`; in the loop:

```ts
  const jev = opts.jev ?? await jevClient();
  for (const c of candidates) {
    const id = candidateSlug(product, c, taken); taken.add(id); filed.push(id);
    let related: string[] = [];
    if (jev.enabled) { try { related = confidentIds(await judgeText(productDir, graph, `${c.title}. ${c.text}`, { jev, searchFn: opts.searchFn })); } catch (e) { console.warn('jev: consolidation link failed —', e instanceof Error ? e.message : e); } }
    cards.push(candidateCard(id, c, s, page.id, s.agent, date, related));
  }
```

Imports: `import { jevClient, type JevClient } from './jev'; import { judgeText, confidentIds } from './links';`.

- [ ] **Step 4: Run tests, commit**

Run: `cd packages/web && npx vitest run src/lib/consolidate.test.ts`
Expected: PASS

```bash
git add packages/web/src/lib/consolidate.ts packages/web/src/lib/consolidate.test.ts
git commit -m "consolidation: each candidate card is linked before it is written when a Jev key is stored — related-to from the candidates Jev is sure of"
```

---

### Task 9: Knowledge + full test run

**Files:**
- Modify: `data/products/waterfall/projects/v2/docs/app-agents.md` (or the document that holds `req:wf2.editor.entity-from-text` — find it with `grep -rn "entity-from-text" data/products/waterfall`): add `req:wf2.link.jev` (the requirement: automatic links from a stored Jev key, three flows, threshold), `decision:wf2.jev-judges-never-finds` (candidates from the local search, Jev only judges), `decision:wf2.jev-key-in-settings` (the key in `data/_settings.json` behind a settings page, never in `_product.md`), `decision:wf2.editor-links-on-blur` (applied in the editor, never by the server, because of the `ifMatch` autosave), each as a yaml card in the repo's style; cards for `lib:jev`, `lib:links`, `lib:settings`, `component:settings-jev`, `op:api.settings`, `op:api.links`, `page:settings` — or run `npm run cards` which adds the component/lib/op/page cards under Unsorted, then move them.
- Run: `npm test` (root: runs the root scripts including `test/jev.js`, then the web suite) and `node bin/ctx.js check --root data/products/waterfall` (subcommand first).

- [ ] **Step 1: Cards and check**

Run `npm run cards`, then `node bin/ctx.js check --root data/products/waterfall` — expected: no errors. Write the four knowledge cards.

- [ ] **Step 2: Full tests**

Run: `npm test`
Expected: every root script prints its `ok` line; vitest passes.

- [ ] **Step 3: Commit**

```bash
git add data/products/waterfall
git commit -m "knowledge: req:wf2.link.jev and the three decisions behind it (Jev judges, never finds; the key in the app's settings; links applied in the editor on blur), cards for lib:jev, lib:links, lib:settings, op:api.settings, op:api.links, page:settings, component:settings-jev"
```
