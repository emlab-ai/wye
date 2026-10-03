# Ask — search that answers: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⌘F becomes Glean-like: ranked results over nodes, document prose, code and sessions while typing; a question streams a fast cited answer and, in parallel, a deep agent whose found sources appear live, then its own answer.

**Architecture:** A per-product SQLite index (`node:sqlite`, FTS5 + MiniLM vectors) under `packages/web/src/lib/ask/`, refreshed incrementally per source file. A retriever fuses BM25 and vectors (RRF) and expands one hop along graph edges. An orchestrator runs a tool-less `claude -p` (fast) and a read-only tool-using `claude -p` (deep) concurrently and merges their output into one SSE event stream with one citation numbering. `/api/<p>/search`, `/api/<p>/ask`, `wye ask-search`, `wye ask` and a rebuilt `SearchPanel` consume it.

**Tech Stack:** Next.js 16 route handlers, TypeScript, `node:sqlite` (Node 26, FTS5 verified), `@huggingface/transformers` MiniLM (already used), `claude` CLI subprocesses, vitest, react-markdown.

**Spec:** `docs/superpowers/specs/2026-10-03-ask-search-design.md`

## Global Constraints

- No new npm dependency. SQLite is `node:sqlite` (`DatabaseSync`); vectors are brute-force dot products in memory.
- Index file: `<product.dir>/_build/search.db`. `_build` is derived (rule:build-is-derived) — never committed.
- Sources: `node | doc | code | session`. Code root: `product.meta.repo ? path.resolve(product.meta.repo) : REPO_ROOT` (as `api/[product]/code/route.ts:15`).
- Ended / archived nodes are excluded unless `all` / `asOf` (`isCurrent`, req:memory.current-by-construction).
- Model calls go through the `claude` CLI (decision:memory.model-calls-via-cli). Binary: `process.env.WYE_CLAUDE_BIN || 'claude'`. Model: `process.env.WYE_ASK_MODEL || 'claude-sonnet-5-5'`.
- The deep lane is read-only: `--allowedTools 'Bash(wye:*)' Read Grep Glob`, disallow `Edit Write MultiEdit NotebookEdit Bash(git:*) Bash(rm:*) Bash(npm:*) Bash(node:*) Agent Task`. It never proposes (constraint:wf2.pr-is-the-persons).
- Deep cap: 20 tool calls or 120 000 ms → kill, `deep.done` with `cut: true`. Max 2 concurrent deep lanes per product.
- Typing-time search never calls a model.
- Code style: match `packages/web/src/lib/*.ts` — dense one-line helpers, a leading comment naming the req/decision, no semicolon-free style changes.
- Commits go straight to `main` (prototype rule), ending with the attribution lines from the session.

## Review Focus

1. **Empty or tiny queries** (`""`, `"a"`, `"?"`, only stop words) — expected: `/search` returns `{ hits: [] }`, `/ask` returns 422 for `q.trim().length < 3`; FTS5 never sees an empty `MATCH` (it throws). Pinned in Task 3 (`ftsQuery`) and Task 9 (route).
2. **FTS5 syntax in user text** (`"`, `*`, `-`, `NEAR`, `AND`, `:` in `req:x.y`) — expected: treated as literal words, no SQL error. Pinned in Task 3.
3. **Product without a repo / a repo path that does not exist / a huge or binary file** — expected: code source silently skipped, file >200 KB or with a NUL byte skipped. Pinned in Task 4.
4. **The person closes the panel or asks again mid-answer** — expected: both child processes are killed, no events after abort, no unhandled rejection. Pinned in Task 8.
5. **`claude` missing or exiting non-zero in one lane** — expected: that lane emits `error {lane}`, the other lane's answer still completes, the stream ends with `done`. Pinned in Task 8.

---

## File map

```
packages/web/src/lib/ask/
  types.ts         Source, ChunkRow, Hit, Citation, AskEvent — shared types (Task 1)
  embed.ts         the MiniLM embedder (moved from semantic.ts), blob pack/unpack, dot (Task 1)
  chunk.ts         nodeChunks, docChunks, codeChunks, sessionChunks — pure (Task 2)
  store.ts         SQLite schema, syncScope, vectors, bm25, ftsQuery (Task 3)
  refresh.ts       walks the four sources per product, incremental by scope mtime, embeds (Task 4)
  retrieve.ts      rrf, current filter, graph expansion, budget, hrefs (Task 5)
  claude.ts        spawnClaude: JSON lines of a claude -p stream, abortable (Task 7)
  citations.ts     Citations registry, cited numbers, [[ref]] renumbering (Task 7)
  fast.ts          fastPrompt + runFast (Task 7)
  refs.ts          refs from deep-lane tool_use / tool_result — pure (Task 8)
  deep.ts          deepArgs + runDeep (Task 8)
  ask.ts           the orchestrator: both lanes → AskEvent stream, per-product deep cap (Task 8)
  question.ts      isQuestion — client-safe (Task 10)
  reducer.ts       askReducer: AskEvent → panel state — client-safe (Task 10)
  *.test.ts        beside each file
  fixtures/        claude-stub.mjs, fast.jsonl, deep.jsonl (Task 7/8)
packages/web/src/lib/semantic.ts                       uses ask/embed (Task 1)
packages/web/src/app/api/[product]/search/route.ts    GET typing-time search (Task 6)
packages/web/src/app/api/[product]/ask/route.ts       POST SSE (Task 9)
bin/wye.js                                             ask-search, ask (Task 6, 9)
prompts/ask-fast.md, prompts/ask-deep.md               lane briefs (Task 7, 8)
packages/web/src/components/search/{useAsk.ts,AnswerView.tsx,SourceChips.tsx}  (Task 11)
packages/web/src/components/SearchPanel.tsx            rebuilt (Task 11)
packages/web/src/app/globals.css                       panel styles (Task 11)
skills/wye-agent/SKILL.md, skills/wye-context/SKILL.md mention wye ask (Task 9)
eval/ask/{questions.json,recall.js}, eval/cli.js       retrieval recall eval (Task 12)
```

Run all unit tests from `packages/web`: `npx vitest run src/lib/ask`.

---

### Task 1: Shared types and the embedder

**Files:**
- Create: `packages/web/src/lib/ask/types.ts`, `packages/web/src/lib/ask/embed.ts`
- Modify: `packages/web/src/lib/semantic.ts:13,23-31` (embedder moves out)
- Test: `packages/web/src/lib/ask/embed.test.ts`

**Interfaces:**
- Produces: the types below; `getEmbedder(): Promise<Embed>`, `toBlob`, `fromBlob`, `dot`, `EMBED_MODEL`.

- [ ] **Step 1: Write the types**

```ts
// packages/web/src/lib/ask/types.ts
// Ask (decision:wf2.ask-sources, decision:wf2.ask-two-lanes): the shapes shared by the index, the retriever, the two
// answer lanes, the API and the panel. Client-safe: no node imports.
export type Source = 'node' | 'doc' | 'code' | 'session';
export const SOURCES: Source[] = ['node', 'doc', 'code', 'session'];
// one indexed passage. id = `<source>:<ref>`; ref is what a citation opens; nodes = node ids the passage is about
export interface ChunkRow { id: string; source: Source; ref: string; title: string; text: string; nodes: string[] }
export interface Hit extends ChunkRow { score: number; via?: string; href: string | null }
export interface Citation { n: number; ref: string; source: Source; title: string; href: string | null; snippet: string }
export type AskEvent =
  | { type: 'results'; hits: Hit[]; degraded?: string }
  | { type: 'fast.delta'; text: string }
  | { type: 'fast.done'; citations: Citation[] }
  | { type: 'step'; text: string }
  | { type: 'found'; citation: Citation }
  | { type: 'deep.delta'; text: string }
  | { type: 'deep.done'; citations: Citation[]; cut?: boolean }
  | { type: 'error'; lane: 'fast' | 'deep' | 'retrieve'; message: string }
  | { type: 'done' };
export type Lane = 'fast' | 'deep';
export interface AskRequest { q: string; history?: { q: string; a: string }[]; lanes?: Lane[] }
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/web/src/lib/ask/embed.test.ts
import { describe, it, expect } from 'vitest';
import { toBlob, fromBlob, dot } from './embed';

describe('vector blobs', () => {
  it('round-trips a vector through a blob', () => {
    const v = [0.5, -0.25, 1, 0];
    expect(Array.from(fromBlob(toBlob(v)))).toEqual(v);
  });
  it('reads a blob that sits at an odd offset of a larger buffer', () => {
    const big = new Uint8Array(4 + 8); big.set(toBlob([1, 2]), 4);
    expect(Array.from(fromBlob(big.subarray(4)))).toEqual([1, 2]);
  });
  it('dot multiplies pairwise', () => { expect(dot([1, 2, 3], new Float32Array([1, 0, 2]))).toBe(7); });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`Cannot find module './embed'`)

Run: `cd packages/web && npx vitest run src/lib/ask/embed.test.ts`

- [ ] **Step 4: Implement `embed.ts`** (the embedder body is moved verbatim from `semantic.ts:23-31`)

```ts
// packages/web/src/lib/ask/embed.ts
// The local sentence model (transformers.js MiniLM, ~23 MB, cached under .cache/models), shared by the semantic
// context search and the Ask index; vectors are normalised, so a dot product is the cosine. Nothing leaves the machine.
import path from 'node:path';
import { REPO_ROOT } from '../products';

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export type Embed = (texts: string[]) => Promise<number[][]>;
let embedder: Promise<Embed> | null = null;
export function getEmbedder(): Promise<Embed> {
  if (!embedder) embedder = (async () => {
    const tf = await import('@huggingface/transformers');
    tf.env.cacheDir = path.join(REPO_ROOT, '.cache/models');
    const fe = await tf.pipeline('feature-extraction', EMBED_MODEL, { dtype: 'q8' });
    return async (texts: string[]) => { const out = await fe(texts, { pooling: 'mean', normalize: true }); return out.tolist() as number[][]; };
  })();
  embedder.catch(() => { embedder = null; });   // a failed load (no network on first run) is retried next time
  return embedder;
}
export const toBlob = (v: ArrayLike<number>): Uint8Array => new Uint8Array(new Float32Array(v).buffer);
// copy: a blob from SQLite may sit at an offset that is not 4-aligned
export const fromBlob = (b: Uint8Array): Float32Array => new Float32Array(b.slice().buffer);
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
```

- [ ] **Step 5: Point `semantic.ts` at it.** Delete `semantic.ts` lines 13 (`const MODEL = …`) and 23-31 (`let embedder …` through `getEmbedder`'s closing `}`), and add:

```ts
import { getEmbedder, EMBED_MODEL as MODEL } from './ask/embed';
```

(`MODEL` keeps its uses in the cache tag at `:47`.) Remove the now-unused `REPO_ROOT` import only if nothing else in the file uses it (`grep -n REPO_ROOT src/lib/semantic.ts`).

- [ ] **Step 6: Run tests + typecheck — expect PASS**

Run: `cd packages/web && npx vitest run src/lib/ask src/lib/embed.test.ts && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib/ask packages/web/src/lib/semantic.ts
git commit -m "ask: shared types and the MiniLM embedder in lib/ask/embed"
```

---

### Task 2: Chunkers

**Files:**
- Create: `packages/web/src/lib/ask/chunk.ts`
- Test: `packages/web/src/lib/ask/chunk.test.ts`

**Interfaces:**
- Consumes: `ChunkRow` (Task 1); `nodeText` from `../semantic`; `blockHash` from `../anchors`; `HIDDEN_KINDS` from `../graph`; `Session` from `../session-types`.
- Produces:
  - `nodeChunks(graph: GraphData): ChunkRow[]`
  - `docChunks(file: string, md: string): ChunkRow[]` — `file` repo-relative (`data/products/p/projects/v2/docs/x.md`)
  - `codeChunks(rel: string, text: string): ChunkRow[]`
  - `sessionChunks(s: Pick<Session, 'id' | 'instruction' | 'result' | 'log' | 'transcript'>): ChunkRow[]`
  - `mentionedIds(text: string): string[]`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/src/lib/ask/chunk.test.ts
import { describe, it, expect } from 'vitest';
import { nodeChunks, docChunks, codeChunks, sessionChunks, mentionedIds } from './chunk';
import { blockHash } from '../anchors';
import type { GraphData } from '../graph';

const g = { generatedAt: '', modules: [], files: [], fieldIndex: {}, edges: [], nodes: [
  { id: 'req:a', kind: 'req', title: 'Login works', status: 'shipped', section: '', subsection: '', body: 'id: req:a\ntitle: Login works\nthen: the person is signed in', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 3 },
  { id: 'block:x', kind: 'block', title: '', status: '', section: '', subsection: '', body: '', defined: true, file: '', line: 0 },
  { id: 'req:undef', kind: 'req', title: '', status: '', section: '', subsection: '', body: '', defined: false, file: '', line: 0 },
  { id: 'module:m', kind: 'module', title: 'M', status: '', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 1 },
] } as unknown as GraphData;

describe('nodeChunks', () => {
  it('keeps defined, visible, non-page nodes with their prose', () => {
    const c = nodeChunks(g);
    expect(c.map(x => x.id)).toEqual(['node:req:a']);
    expect(c[0]).toMatchObject({ source: 'node', ref: 'req:a', title: 'Login works', nodes: ['req:a'] });
    expect(c[0].text).toContain('signed in');
  });
});

const DOC = `---
node: module:m
title: M
---

# Shell

Intro paragraph about search and req:a.

\`\`\`yaml
- id: req:a
  title: Login works
\`\`\`

## Why

<!-- list:req -->

Because people asked.

Second paragraph.
`;
describe('docChunks', () => {
  const c = docChunks('data/products/p/projects/v2/docs/m.md', DOC);
  it('splits by heading, drops yaml cards, comments and frontmatter', () => {
    expect(c.map(x => x.title)).toEqual(['M › Shell', 'M › Why']);
    expect(c.some(x => x.text.includes('- id:'))).toBe(false);
    expect(c.some(x => x.text.includes('list:req'))).toBe(false);
    expect(c.some(x => x.text.includes('node: module'))).toBe(false);
  });
  it('refs the first paragraph block so a citation opens it', () => {
    expect(c[0].ref).toBe(`v2/m#b-${blockHash('Intro paragraph about search and req:a.')}`);
    expect(c[0].id).toBe('doc:' + c[0].ref);
  });
  it('records the node ids a passage mentions', () => { expect(c[0].nodes).toEqual(['req:a']); });
  it('splits a long section on paragraph boundaries at ~1200 chars', () => {
    const long = `# T\n\n${'a'.repeat(900)}\n\n${'b'.repeat(900)}\n`;
    const parts = docChunks('data/products/p/projects/v2/docs/t.md', long);
    expect(parts.length).toBe(2);
    expect(parts[1].ref).toBe(`v2/t#b-${blockHash('b'.repeat(900))}`);
  });
  it('maps .wye system pages to ~slugs', () => {
    expect(docChunks('data/products/p/projects/v2/.wye/goals.md', '# G\n\ntext here\n')[0].ref).toMatch(/^v2\/~goals#b-/);
  });
});

describe('codeChunks', () => {
  it('splits at top-level symbols with line ranges', () => {
    const src = `import x from 'y';\n\nexport function alpha() {\n  return 1;\n}\n\nexport const beta = () => 2;\n`;
    const c = codeChunks('lib/a.ts', src);
    expect(c.map(x => x.ref)).toEqual(['lib/a.ts:1-2', 'lib/a.ts:3-6', 'lib/a.ts:7-7']);
    expect(c[1].title).toBe('lib/a.ts › alpha');
  });
  it('falls back to 60-line windows', () => {
    const c = codeChunks('notes.txt', Array.from({ length: 130 }, (_, i) => `line ${i}`).join('\n'));
    expect(c.map(x => x.ref)).toEqual(['notes.txt:1-60', 'notes.txt:61-120', 'notes.txt:121-130']);
  });
  it('splits an oversized symbol into windows', () => {
    const body = Array.from({ length: 150 }, () => '  x++;').join('\n');
    const c = codeChunks('big.ts', `function big() {\n${body}\n}\n`);
    expect(c.length).toBe(3); expect(c[0].ref).toBe('big.ts:1-60');
  });
  it('skips blank-only pieces', () => { expect(codeChunks('e.ts', '\n\n\n')).toEqual([]); });
});

describe('sessionChunks', () => {
  it('one chunk per turn: instruction, assistant text, result', () => {
    const c = sessionChunks({ id: 'abc123', instruction: 'Fix the invite flow', result: 'Done: invite email removed',
      log: [{ t: '', line: 'started' }], transcript: [{ t: '', kind: 'assistant', text: 'Reading lib/invite.ts' }, { t: '', kind: 'tool_use', name: 'Read' }] } as never);
    expect(c.map(x => x.ref)).toEqual(['abc123#0', 'abc123#1', 'abc123#2']);
    expect(c[0].title).toBe('Session abc123 · Fix the invite flow');
    expect(c[2].text).toContain('invite email removed');
  });
});

describe('mentionedIds', () => {
  it('finds kind:slug ids, not urls or times', () => {
    expect(mentionedIds('see req:a.b and decision:wf2.x, http://x.y and 10:30')).toEqual(['req:a.b', 'decision:wf2.x']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './chunk'`)

Run: `cd packages/web && npx vitest run src/lib/ask/chunk.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/ask/chunk.ts
// The passages Ask indexes (decision:wf2.ask-sources): a node is one passage; a document's prose is cut by heading
// and at ~1 200 chars on paragraph boundaries (its yaml cards are nodes already); code is cut at top-level symbols,
// else 60-line windows; a session is one passage per turn. Pure: the walker (refresh.ts) reads the files.
import type { ChunkRow } from './types';
import type { GraphData } from '../graph';
import type { Session } from '../session-types';
import { HIDDEN_KINDS } from '../graph';
import { nodeText } from '../semantic';
import { blockHash } from '../anchors';

const DOC_MAX = 1200; const WIN = 60; const TURN_MAX = 1500;
const row = (source: ChunkRow['source'], ref: string, title: string, text: string, nodes: string[]): ChunkRow => ({ id: `${source}:${ref}`, source, ref, title, text, nodes });

const ID_RE = /(?<![\w/:.])([a-z][a-z-]*:[A-Za-z0-9_][A-Za-z0-9_.-]*[A-Za-z0-9_])/g;
export function mentionedIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ID_RE)) { const id = m[1]; if (/^(https?|mailto|data):/.test(id) || /^\d/.test(id.split(':')[1])) continue; if (!out.includes(id)) out.push(id); }
  return out;
}

export function nodeChunks(graph: GraphData): ChunkRow[] {
  return graph.nodes.filter(n => n.defined && !HIDDEN_KINDS.has(n.kind) && n.kind !== 'module')
    .map(n => row('node', n.id, n.title || n.id, nodeText(n), [n.id]));
}

// repo-relative file → `<project>/<doc>` with `~` for .wye system pages (doc.ts#docRoute)
function docKey(file: string): string | null {
  const m = file.match(/(?:^|\/)projects\/([^/]+)\/(docs|\.wye)\/([^/]+)\.md$/);
  return m ? `${m[1]}/${m[2] === '.wye' ? '~' : ''}${m[3]}` : null;
}
export function docChunks(file: string, md: string): ChunkRow[] {
  const key = docKey(file); if (!key) return [];
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const docTitle = fm?.[1].match(/^title:\s*(.*)$/m)?.[1].trim() || key.split('/')[1];
  const body = (fm ? md.slice(fm[0].length) : md)
    .replace(/^```ya?ml[\s\S]*?^```\s*$/gm, '')          // cards are nodes
    .replace(/<!--[\s\S]*?-->/g, '');
  const out: ChunkRow[] = [];
  let heading = ''; let paras: string[] = []; let cur: string[] = [];
  const flushPiece = () => {
    const paragraphs = cur.filter(p => p.trim()); cur = [];
    if (!paragraphs.length) return;
    const text = paragraphs.join('\n\n');
    out.push(row('doc', `${key}#b-${blockHash(paragraphs[0])}`, heading ? `${docTitle} › ${heading}` : docTitle, text, mentionedIds(text)));
  };
  const flushSection = () => { for (const p of paras) { if (cur.length && cur.join('\n\n').length + p.length > DOC_MAX) flushPiece(); cur.push(p); } flushPiece(); paras = []; };
  let para: string[] = [];
  const endPara = () => { if (para.length) paras.push(para.join('\n').trim()); para = []; };
  for (const line of body.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { endPara(); flushSection(); heading = h[1].trim(); continue; }
    if (!line.trim()) { endPara(); continue; }
    para.push(line);
  }
  endPara(); flushSection();
  return out;
}

const SYMBOL = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|def|func|fn|pub\s+fn|impl|struct)\s+([A-Za-z_$][\w$]*)/;
export function codeChunks(rel: string, text: string): ChunkRow[] {
  const lines = text.split('\n'); if (lines.at(-1) === '') lines.pop();
  const starts: { line: number; name: string }[] = [];
  lines.forEach((l, i) => { const m = l.match(SYMBOL); if (m) starts.push({ line: i, name: m[1] }); });
  const spans: { a: number; b: number; name?: string }[] = [];   // 0-based, inclusive
  if (!starts.length) for (let a = 0; a < lines.length; a += WIN) spans.push({ a, b: Math.min(lines.length, a + WIN) - 1 });
  else {
    if (starts[0].line > 0) spans.push({ a: 0, b: starts[0].line - 1 });
    starts.forEach((s, k) => spans.push({ a: s.line, b: (k + 1 < starts.length ? starts[k + 1].line : lines.length) - 1, name: s.name }));
  }
  const out: ChunkRow[] = [];
  for (const s of spans) for (let a = s.a; a <= s.b; a += WIN) {
    const b = Math.min(s.b, a + WIN - 1); const t = lines.slice(a, b + 1).join('\n');
    if (!t.trim()) continue;
    out.push(row('code', `${rel}:${a + 1}-${b + 1}`, s.name ? `${rel} › ${s.name}` : rel, t, mentionedIds(t)));
  }
  return out;
}

export function sessionChunks(s: Pick<Session, 'id' | 'instruction' | 'result' | 'log' | 'transcript'>): ChunkRow[] {
  const title = `Session ${s.id} · ${s.instruction.replace(/\s+/g, ' ').slice(0, 80)}`;
  const turns = [s.instruction, ...(s.transcript ?? []).filter(e => e.kind === 'assistant' && e.text).map(e => e.text!), ...(s.result ? [s.result] : [])];
  return turns.map(t => t.trim()).filter(Boolean).map((t, i) => row('session', `${s.id}#${i}`, title, t.slice(0, TURN_MAX), mentionedIds(t)));
}
```

- [ ] **Step 4: Run — expect PASS.** If the doc `title` test fails because `docTitle` falls back, check the frontmatter regex against `DOC`.

Run: `cd packages/web && npx vitest run src/lib/ask/chunk.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/ask/chunk.ts packages/web/src/lib/ask/chunk.test.ts
git commit -m "ask: chunkers for nodes, document prose, code and sessions"
```

---

### Task 3: The SQLite store

**Files:**
- Create: `packages/web/src/lib/ask/store.ts`
- Test: `packages/web/src/lib/ask/store.test.ts`

**Interfaces:**
- Consumes: `ChunkRow`, `Source` (Task 1); `toBlob`, `fromBlob` (Task 1); `keywords` from `../semantic`.
- Produces:
  - `openStore(file: string): Store` — `file` may be `':memory:'`
  - `type Store = { db: DatabaseSync; vecs: Map<string, Float32Array> }`
  - `scopeMtime(s: Store, scope: string): number | null`
  - `syncScope(s: Store, scope: string, source: Source, mtime: number, rows: ChunkRow[]): number` — returns rows changed
  - `dropScopes(s: Store, source: Source, keep: Set<string>): number`
  - `unembedded(s: Store, model: string, limit: number): { id: string; text: string }[]`
  - `putVectors(s: Store, model: string, v: { id: string; vec: number[] }[]): void`
  - `loadVectors(s: Store, model: string): void` — fills `s.vecs`
  - `getChunks(s: Store, ids: string[]): ChunkRow[]`
  - `chunksMentioning(s: Store, nodeId: string, limit: number): ChunkRow[]`
  - `ftsQuery(q: string): string | null`
  - `bm25(s: Store, q: string, limit: number, sources?: Source[]): string[]` — chunk ids, best first

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/src/lib/ask/store.test.ts
import { describe, it, expect } from 'vitest';
import { openStore, syncScope, dropScopes, scopeMtime, unembedded, putVectors, loadVectors, getChunks, bm25, ftsQuery, chunksMentioning } from './store';
import type { ChunkRow } from './types';

const r = (source: ChunkRow['source'], ref: string, text: string, nodes: string[] = []): ChunkRow => ({ id: `${source}:${ref}`, source, ref, title: ref, text, nodes });

describe('store', () => {
  it('syncs a scope by hash: inserts, updates only what changed, deletes what vanished', () => {
    const s = openStore(':memory:');
    expect(syncScope(s, 'f1', 'doc', 1, [r('doc', 'a', 'invite email flow'), r('doc', 'b', 'billing')])).toBe(2);
    expect(scopeMtime(s, 'f1')).toBe(1);
    expect(syncScope(s, 'f1', 'doc', 2, [r('doc', 'a', 'invite email flow'), r('doc', 'c', 'new')])).toBe(1);
    expect(getChunks(s, ['doc:a', 'doc:b', 'doc:c']).map(c => c.id)).toEqual(['doc:a', 'doc:c']);
    expect(bm25(s, 'billing', 5)).toEqual([]);
  });
  it('drops scopes of a source that are no longer present', () => {
    const s = openStore(':memory:');
    syncScope(s, 'f1', 'doc', 1, [r('doc', 'a', 'x')]); syncScope(s, 'f2', 'doc', 1, [r('doc', 'b', 'y')]); syncScope(s, 'c1', 'code', 1, [r('code', 'z', 'w')]);
    expect(dropScopes(s, 'doc', new Set(['f2']))).toBe(1);
    expect(getChunks(s, ['doc:a', 'doc:b', 'code:z']).map(c => c.id)).toEqual(['doc:b', 'code:z']);
  });
  it('ranks by BM25 and filters by source', () => {
    const s = openStore(':memory:');
    syncScope(s, 'g', 'node', 1, [r('node', 'req:a', 'the invite email is sent on signup'), r('node', 'req:b', 'billing')]);
    syncScope(s, 'c', 'code', 1, [r('code', 'lib/invite.ts:1-9', 'function sendInviteEmail() { email invite }')]);
    expect(bm25(s, 'invite email', 5)[0]).toBeDefined();
    expect(bm25(s, 'invite email', 5, ['node'])).toEqual(['node:req:a']);
  });
  it('treats FTS syntax in user text as words', () => {
    const s = openStore(':memory:'); syncScope(s, 'g', 'node', 1, [r('node', 'req:x.y', 'req:x.y NEAR "quoted" thing')]);
    for (const q of ['"quoted', 'req:x.y', 'NEAR AND OR', 'a-b*', '(thing)']) expect(() => bm25(s, q, 5)).not.toThrow();
    expect(bm25(s, 'req:x.y', 5)).toEqual(['node:req:x.y']);
  });
  it('returns null for a query with no searchable word', () => {
    expect(ftsQuery('')).toBeNull(); expect(ftsQuery('a ?')).toBeNull(); expect(ftsQuery('the of and')).toBeNull();
  });
  it('stores vectors per model and reports what is unembedded', () => {
    const s = openStore(':memory:'); syncScope(s, 'g', 'node', 1, [r('node', 'a', 'x'), r('node', 'b', 'y')]);
    expect(unembedded(s, 'm1', 10).map(x => x.id)).toEqual(['node:a', 'node:b']);
    putVectors(s, 'm1', [{ id: 'node:a', vec: [1, 0] }]);
    expect(unembedded(s, 'm1', 10).map(x => x.id)).toEqual(['node:b']);
    expect(unembedded(s, 'm2', 10).length).toBe(2);
    loadVectors(s, 'm1'); expect(Array.from(s.vecs.get('node:a')!)).toEqual([1, 0]);
    syncScope(s, 'g', 'node', 2, [r('node', 'a', 'changed'), r('node', 'b', 'y')]);
    expect(unembedded(s, 'm1', 10).map(x => x.id).sort()).toEqual(['node:a', 'node:b']);   // a changed: its vector is gone
  });
  it('finds chunks that mention a node', () => {
    const s = openStore(':memory:'); syncScope(s, 'f', 'doc', 1, [r('doc', 'p#1', 'about req:a', ['req:a']), r('doc', 'p#2', 'other', ['req:b'])]);
    expect(chunksMentioning(s, 'req:a', 5).map(c => c.id)).toEqual(['doc:p#1']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/web && npx vitest run src/lib/ask/store.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/ask/store.ts
// The Ask index on disk (decision:wf2.ask-sources): one SQLite file per product, <product>/_build/search.db — passages,
// an FTS5 table for BM25 and MiniLM vectors. A scope is what one source file produced (a document, a code file, a
// session, the graph); it is replaced whole when the file's mtime moves, and only passages whose text changed are
// rewritten (their vectors with them).
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import type { ChunkRow, Source } from './types';
import { toBlob, fromBlob } from './embed';
import { keywords } from '../semantic';

export type Store = { db: DatabaseSync; vecs: Map<string, Float32Array> };
const hashOf = (c: ChunkRow) => createHash('sha1').update(c.title + '\n' + c.text).digest('hex').slice(0, 16);

export function openStore(file: string): Store {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY, source TEXT, scope TEXT, ref TEXT, title TEXT, text TEXT, nodes TEXT, hash TEXT);
    CREATE INDEX IF NOT EXISTS chunks_scope ON chunks(scope);
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, source UNINDEXED, title, text);
    CREATE TABLE IF NOT EXISTS vectors(id TEXT PRIMARY KEY, model TEXT, vec BLOB);
    CREATE TABLE IF NOT EXISTS scopes(scope TEXT PRIMARY KEY, source TEXT, mtime REAL);
    CREATE TABLE IF NOT EXISTS mentions(node TEXT, id TEXT);
    CREATE INDEX IF NOT EXISTS mentions_node ON mentions(node);`);
  return { db, vecs: new Map() };
}

export function scopeMtime(s: Store, scope: string): number | null {
  const r = s.db.prepare('SELECT mtime FROM scopes WHERE scope = ?').get(scope) as { mtime: number } | undefined;
  return r ? r.mtime : null;
}

function remove(s: Store, ids: string[]) {
  const d1 = s.db.prepare('DELETE FROM chunks WHERE id = ?'), d2 = s.db.prepare('DELETE FROM chunks_fts WHERE id = ?'), d3 = s.db.prepare('DELETE FROM vectors WHERE id = ?'), d4 = s.db.prepare('DELETE FROM mentions WHERE id = ?');
  for (const id of ids) { d1.run(id); d2.run(id); d3.run(id); d4.run(id); s.vecs.delete(id); }
}

export function syncScope(s: Store, scope: string, source: Source, mtime: number, rows: ChunkRow[]): number {
  const old = new Map((s.db.prepare('SELECT id, hash FROM chunks WHERE scope = ?').all(scope) as { id: string; hash: string }[]).map(r => [r.id, r.hash]));
  const seen = new Set<string>(); let changed = 0;
  s.db.exec('BEGIN');
  try {
    const ins = s.db.prepare('INSERT INTO chunks(id, source, scope, ref, title, text, nodes, hash) VALUES (?,?,?,?,?,?,?,?)');
    const fts = s.db.prepare('INSERT INTO chunks_fts(id, source, title, text) VALUES (?,?,?,?)');
    const men = s.db.prepare('INSERT INTO mentions(node, id) VALUES (?,?)');
    for (const c of rows) {
      if (seen.has(c.id)) continue; seen.add(c.id);
      const h = hashOf(c); if (old.get(c.id) === h) continue;
      if (old.has(c.id)) remove(s, [c.id]);
      ins.run(c.id, source, scope, c.ref, c.title, c.text, JSON.stringify(c.nodes), h); fts.run(c.id, source, c.title, c.text);
      for (const n of c.nodes) men.run(n, c.id);
      changed++;
    }
    remove(s, [...old.keys()].filter(id => !seen.has(id)));
    s.db.prepare('INSERT INTO scopes(scope, source, mtime) VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET mtime = excluded.mtime').run(scope, source, mtime);
    s.db.exec('COMMIT');
  } catch (e) { s.db.exec('ROLLBACK'); throw e; }
  return changed;
}

export function dropScopes(s: Store, source: Source, keep: Set<string>): number {
  const gone = (s.db.prepare('SELECT scope FROM scopes WHERE source = ?').all(source) as { scope: string }[]).map(r => r.scope).filter(sc => !keep.has(sc));
  for (const sc of gone) { remove(s, (s.db.prepare('SELECT id FROM chunks WHERE scope = ?').all(sc) as { id: string }[]).map(r => r.id)); s.db.prepare('DELETE FROM scopes WHERE scope = ?').run(sc); }
  return gone.length;
}

export function unembedded(s: Store, model: string, limit: number): { id: string; text: string }[] {
  return s.db.prepare('SELECT c.id, c.title, c.text FROM chunks c LEFT JOIN vectors v ON v.id = c.id AND v.model = ? WHERE v.id IS NULL ORDER BY c.rowid LIMIT ?').all(model, limit)
    .map(r => { const x = r as { id: string; title: string; text: string }; return { id: x.id, text: `${x.title}. ${x.text}`.slice(0, 1500) }; });
}
export function putVectors(s: Store, model: string, v: { id: string; vec: number[] }[]) {
  const st = s.db.prepare('INSERT INTO vectors(id, model, vec) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET model = excluded.model, vec = excluded.vec');
  s.db.exec('BEGIN'); for (const x of v) { st.run(x.id, model, toBlob(x.vec)); s.vecs.set(x.id, new Float32Array(x.vec)); } s.db.exec('COMMIT');
}
export function loadVectors(s: Store, model: string) {
  s.vecs.clear();
  for (const r of s.db.prepare('SELECT id, vec FROM vectors WHERE model = ?').all(model) as { id: string; vec: Uint8Array }[]) s.vecs.set(r.id, fromBlob(r.vec));
}

const toRow = (r: Record<string, unknown>): ChunkRow => ({ id: String(r.id), source: r.source as Source, ref: String(r.ref), title: String(r.title), text: String(r.text), nodes: JSON.parse(String(r.nodes || '[]')) });
export function getChunks(s: Store, ids: string[]): ChunkRow[] {
  const st = s.db.prepare('SELECT id, source, ref, title, text, nodes FROM chunks WHERE id = ?');
  return ids.map(id => st.get(id) as Record<string, unknown> | undefined).filter((r): r is Record<string, unknown> => !!r).map(toRow);
}
export function chunksMentioning(s: Store, nodeId: string, limit: number): ChunkRow[] {
  const ids = (s.db.prepare('SELECT id FROM mentions WHERE node = ? LIMIT ?').all(nodeId, limit) as { id: string }[]).map(r => r.id);
  return getChunks(s, ids);
}

// user text → an FTS5 query of quoted terms joined by OR: every operator, quote and colon is literal
export function ftsQuery(q: string): string | null {
  const words = keywords(q); if (!words.length) return null;
  return words.map(w => `"${w.replace(/"/g, '""')}"`).join(' OR ');
}
export function bm25(s: Store, q: string, limit: number, sources?: Source[]): string[] {
  const m = ftsQuery(q); if (!m) return [];
  const src = sources?.length ? ` AND source IN (${sources.map(() => '?').join(',')})` : '';
  return (s.db.prepare(`SELECT id FROM chunks_fts WHERE chunks_fts MATCH ?${src} ORDER BY bm25(chunks_fts, 0, 0, 3.0, 1.0) LIMIT ?`).all(m, ...(sources ?? []), limit) as { id: string }[]).map(r => r.id);
}
```

- [ ] **Step 4: Run — expect PASS.** The default `unicode61` tokenizer splits `req:x.y` into `req`, `x`, `y`; `ftsQuery` quotes `req:x.y` as one phrase, so it still matches exactly that sequence. Do not add `tokenchars` for `.` — sentence-final periods would glue onto words.

Run: `cd packages/web && npx vitest run src/lib/ask/store.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/ask/store.ts packages/web/src/lib/ask/store.test.ts
git commit -m "ask: the per-product SQLite store — passages, FTS5, vectors, scopes"
```

---

### Task 4: Refresh — walk the four sources

**Files:**
- Create: `packages/web/src/lib/ask/refresh.ts`
- Test: `packages/web/src/lib/ask/refresh.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `Product` and `REPO_ROOT` from `../products`; `listSessions` from `../sessions`; `GraphData`.
- Produces:
  - `codeRoot(p: Product): string`
  - `getStore(p: Product): Store` — cached per product dir, file `_build/search.db`
  - `refresh(p: Product, graph: GraphData, opts?: { embed?: Embed | null; listCode?: (root: string) => Promise<string[]> }): Promise<RefreshStats>`
  - `type RefreshStats = { changed: Record<Source, number>; embedded: number; degraded?: 'no-vectors' }`
  - `ensureFresh(p, graph): Promise<RefreshStats>` — the lock + 5 s throttle around `refresh`

- [ ] **Step 1: Write the failing test** (a scratch product in a temp dir; fake embedder; `listCode` injected so no git is needed)

```ts
// packages/web/src/lib/ask/refresh.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { refresh, getStore } from './refresh';
import { bm25 } from './store';
import type { Product } from '../products';
import type { GraphData } from '../graph';

const fakeEmbed = async (t: string[]) => t.map(x => [x.length % 7 / 7, 1, 0]);
let dir: string; let repo: string; let p: Product; let g: GraphData;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ask-')); repo = path.join(dir, 'repo');
  await mkdir(path.join(dir, 'projects/v2/docs'), { recursive: true }); await mkdir(path.join(dir, '_sessions')); await mkdir(path.join(repo, 'lib'), { recursive: true });
  await writeFile(path.join(dir, 'projects/v2/docs/m.md'), '# Invites\n\nThe invite email was dropped in favour of links.\n');
  await writeFile(path.join(repo, 'lib/invite.ts'), 'export function sendInvite() {\n  return 1;\n}\n');
  await writeFile(path.join(repo, 'lib/big.bin'), Buffer.from([0, 1, 2]));
  await writeFile(path.join(dir, '_sessions/abc123.json'), JSON.stringify({ id: 'abc123', instruction: 'remove the invite email', log: [], result: 'removed', createdAt: '2026-10-01', status: 'done' }));
  p = { slug: 't', dir, graphPath: '', meta: { title: 'T', icon: '', description: '', kind: '', status: '', repo, settings: {} } } as Product;
  g = { generatedAt: '', modules: [], fieldIndex: {}, edges: [], files: [path.join(dir, 'projects/v2/docs/m.md')],
    nodes: [{ id: 'decision:no-invite-email', kind: 'decision', title: 'No invite email', status: 'approved', section: '', subsection: '', body: 'title: No invite email', defined: true, file: '', line: 1 }] } as unknown as GraphData;
});
const listCode = async () => ['lib/invite.ts', 'lib/big.bin', 'lib/missing.ts'];

describe('refresh', () => {
  it('indexes all four sources and embeds them', async () => {
    const st = await refresh(p, g, { embed: fakeEmbed, listCode });
    expect(st.changed).toMatchObject({ node: 1, doc: 1, code: 1, session: 2 });
    expect(st.embedded).toBe(5);
    const s = getStore(p);
    expect(bm25(s, 'invite', 10).map(id => id.split(':')[0]).sort()).toEqual(['code', 'doc', 'node', 'session', 'session']);
  });
  it('is incremental: an untouched tree changes nothing; a touched doc re-reads only itself', async () => {
    await refresh(p, g, { embed: fakeEmbed, listCode });
    expect((await refresh(p, g, { embed: fakeEmbed, listCode })).changed).toEqual({ node: 0, doc: 0, code: 0, session: 0 });
    const f = path.join(dir, 'projects/v2/docs/m.md'); await writeFile(f, '# Invites\n\nLinks only now.\n'); await utimes(f, new Date(), new Date(Date.now() + 5000));
    expect((await refresh(p, g, { embed: fakeEmbed, listCode })).changed).toMatchObject({ doc: 1, code: 0 });
  });
  it('skips code when the product has no repo folder', async () => {
    p.meta.repo = path.join(dir, 'nope');
    expect((await refresh(p, g, { embed: fakeEmbed, listCode })).changed.code).toBe(0);
  });
  it('degrades to BM25 when there is no embedder', async () => {
    expect((await refresh(p, g, { embed: null, listCode })).degraded).toBe('no-vectors');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/web && npx vitest run src/lib/ask/refresh.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/ask/refresh.ts
// Keeps a product's Ask index current (decision:wf2.ask-sources): before a query, each source file whose mtime moved
// is re-chunked (store.syncScope), files that vanished are dropped, and passages without a vector are embedded. The
// product's code is its `repo:` (else this repo), the files git tracks, ≤200 KB, text only.
import { readFile, stat, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Product } from '../products';
import { REPO_ROOT } from '../products';
import type { GraphData } from '../graph';
import type { Source } from './types';
import { openStore, syncScope, dropScopes, scopeMtime, unembedded, putVectors, loadVectors, type Store } from './store';
import { nodeChunks, docChunks, codeChunks, sessionChunks } from './chunk';
import { getEmbedder, EMBED_MODEL, type Embed } from './embed';

export type RefreshStats = { changed: Record<Source, number>; embedded: number; degraded?: 'no-vectors' };
const MAX_CODE = 200 * 1024;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|sh|sql|css|scss|html|md|yml|yaml|toml|c|h|cpp|hpp|cs|graphql)$/i;

export const codeRoot = (p: Product) => p.meta.repo ? path.resolve(p.meta.repo) : REPO_ROOT;
const stores = ((globalThis as { __askStores?: Map<string, Store> }).__askStores ??= new Map());
export function getStore(p: Product): Store {
  let s = stores.get(p.dir);
  if (!s) { mkdirSync(path.join(p.dir, '_build'), { recursive: true }); s = openStore(path.join(p.dir, '_build/search.db')); loadVectors(s, EMBED_MODEL); stores.set(p.dir, s); }
  return s;
}
const gitFiles = async (root: string) => (await promisify(execFile)('git', ['ls-files'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })).stdout.split('\n').filter(Boolean);
const mtimeOf = async (f: string) => { try { return (await stat(f)).mtimeMs; } catch { return null; } };
const abs = (f: string) => path.isAbsolute(f) ? f : path.resolve(REPO_ROOT, f);

export async function refresh(p: Product, graph: GraphData, opts: { embed?: Embed | null; listCode?: (root: string) => Promise<string[]> } = {}): Promise<RefreshStats> {
  const s = getStore(p); const changed: Record<Source, number> = { node: 0, doc: 0, code: 0, session: 0 };
  // nodes: one scope, the graph
  const gm = (await mtimeOf(path.join(p.dir, '_build/graph.json'))) ?? graph.nodes.length;
  if (scopeMtime(s, 'graph') !== gm) changed.node += syncScope(s, 'graph', 'node', gm, nodeChunks(graph));
  // documents: the files the graph was built from
  const docs = new Set<string>();
  for (const f of graph.files) {
    const a = abs(f); const m = await mtimeOf(a); if (m === null) continue; docs.add(a);
    if (scopeMtime(s, a) !== m) changed.doc += syncScope(s, a, 'doc', m, docChunks(path.relative(REPO_ROOT, a), await readFile(a, 'utf8')));
  }
  dropScopes(s, 'doc', docs);
  // code
  const root = codeRoot(p); const code = new Set<string>();
  if (existsSync(root)) {
    let files: string[] = []; try { files = await (opts.listCode ?? gitFiles)(root); } catch { /* not a git folder */ }
    for (const rel of files.filter(f => CODE_EXT.test(f))) {
      const a = path.join(root, rel); let st; try { st = await stat(a); } catch { continue; }
      if (!st.isFile() || st.size > MAX_CODE) continue; code.add(a);
      if (scopeMtime(s, a) === st.mtimeMs) continue;
      const text = await readFile(a, 'utf8'); if (text.includes('\0')) continue;
      changed.code += syncScope(s, a, 'code', st.mtimeMs, codeChunks(rel, text));
    }
  }
  dropScopes(s, 'code', code);
  // sessions
  const sdir = path.join(p.dir, '_sessions'); const sess = new Set<string>();
  let names: string[] = []; try { names = (await readdir(sdir)).filter(n => n.endsWith('.json') && !n.startsWith('_')); } catch { /* none */ }
  for (const n of names) {
    const a = path.join(sdir, n); const m = await mtimeOf(a); if (m === null) continue; sess.add(a);
    if (scopeMtime(s, a) === m) continue;
    try { changed.session += syncScope(s, a, 'session', m, sessionChunks(JSON.parse(await readFile(a, 'utf8')))); } catch { /* a broken record */ }
  }
  dropScopes(s, 'session', sess);
  // vectors for whatever has none
  let embed: Embed | null = opts.embed === undefined ? null : opts.embed;
  if (opts.embed === undefined) { try { embed = await getEmbedder(); } catch { embed = null; } }
  if (!embed) return { changed, embedded: 0, degraded: 'no-vectors' };
  let embedded = 0;
  for (;;) {
    const batch = unembedded(s, EMBED_MODEL, 64); if (!batch.length) break;
    const vecs = await embed(batch.map(b => b.text));
    putVectors(s, EMBED_MODEL, batch.map((b, i) => ({ id: b.id, vec: vecs[i] }))); embedded += batch.length;
  }
  return { changed, embedded };
}

// one refresh per product at a time, at most every 5 s
const running = new Map<string, { at: number; p: Promise<RefreshStats> }>();
export function ensureFresh(p: Product, graph: GraphData): Promise<RefreshStats> {
  const cur = running.get(p.dir);
  if (cur && Date.now() - cur.at < 5000) return cur.p;
  const job = { at: Date.now(), p: (cur?.p ?? Promise.resolve(null)).catch(() => null).then(() => refresh(p, graph)) };
  running.set(p.dir, job); return job.p;
}
```

Note: the test's `fakeEmbed` is passed explicitly; `refresh` with `opts.embed === null` must not load the real model — the code above keeps `null` as "no embedder".

- [ ] **Step 4: Run — expect PASS.** The session count is 2 because the fixture has an instruction and a result.

Run: `cd packages/web && npx vitest run src/lib/ask/refresh.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/ask/refresh.ts packages/web/src/lib/ask/refresh.test.ts
git commit -m "ask: incremental refresh of the index from graph, documents, code and sessions"
```

---

### Task 5: The retriever

**Files:**
- Create: `packages/web/src/lib/ask/retrieve.ts`
- Test: `packages/web/src/lib/ask/retrieve.test.ts`

**Interfaces:**
- Consumes: `Store`, `bm25`, `getChunks`, `chunksMentioning` (Task 3); `dot` (Task 1); `GraphIndex`, `isCurrent`, `docRoute` from `../graph` / `../doc`.
- Produces:
  - `rrf(lists: string[][], k?: number): Map<string, number>`
  - `hrefFor(product: string, c: ChunkRow, idx: GraphIndex): string | null`
  - `retrieve(ctx: RetrieveCtx, q: string, opts?: RetrieveOpts): Promise<Hit[]>`
  - `type RetrieveCtx = { product: string; store: Store; idx: GraphIndex; embed: Embed | null }`
  - `type RetrieveOpts = { limit?: number; sources?: Source[]; expand?: boolean; all?: boolean; asOf?: string | null; budgetChars?: number }`
  - `EXPAND_VERBS: Set<string>`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/src/lib/ask/retrieve.test.ts
import { describe, it, expect } from 'vitest';
import { rrf, retrieve, hrefFor } from './retrieve';
import { openStore, syncScope, putVectors } from './store';
import { indexGraph, type GraphData } from '../graph';
import type { ChunkRow } from './types';

const n = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: id.split(':')[0], title: id, status: 'approved', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 1, ...extra });
const g = { generatedAt: '', modules: [], files: [], fieldIndex: {}, nodes: [n('decision:no-email'), n('req:invite'), n('component:invite-form'), n('decision:old', { status: 'superseded' })],
  edges: [{ from: 'decision:no-email', to: 'req:invite', verb: 'affects' }, { from: 'req:invite', to: 'component:invite-form', verb: 'satisfied-by' }] } as unknown as GraphData;
const idx = indexGraph(g);
const c = (source: ChunkRow['source'], ref: string, text: string, nodes: string[] = []): ChunkRow => ({ id: `${source}:${ref}`, source, ref, title: ref, text, nodes });

function setup() {
  const s = openStore(':memory:');
  syncScope(s, 'graph', 'node', 1, [c('node', 'decision:no-email', 'we stopped sending the invite email', ['decision:no-email']), c('node', 'req:invite', 'a person can invite a teammate', ['req:invite']),
    c('node', 'component:invite-form', 'the form a person fills in', ['component:invite-form']), c('node', 'decision:old', 'send an invite email on signup', ['decision:old'])]);
  syncScope(s, 'code', 'code', 1, [c('code', 'lib/invite.ts:1-9', 'function sendInvite() {}')]);
  putVectors(s, 'm', [{ id: 'node:decision:no-email', vec: [1, 0] }, { id: 'node:req:invite', vec: [0.6, 0.8] }, { id: 'code:lib/invite.ts:1-9', vec: [0, 1] }]);
  return s;
}

describe('rrf', () => {
  it('rewards ids that rank well in several lists', () => {
    const f = rrf([['a', 'b', 'c'], ['b', 'a']]);
    expect([...f.entries()].sort((x, y) => y[1] - x[1]).map(e => e[0])).toEqual(['a', 'b', 'c'].sort((x, y) => f.get(y)! - f.get(x)!));
    expect(f.get('a')).toBeCloseTo(1 / 61 + 1 / 62);
  });
});

describe('retrieve', () => {
  it('fuses keyword and vector hits, hides ended nodes, expands one hop along structural edges', async () => {
    const hits = await retrieve({ product: 'p', store: setup(), idx, embed: async () => [[1, 0]] }, 'invite email', { expand: true });
    const ids = hits.map(h => h.id);
    expect(ids[0]).toBe('node:decision:no-email');
    expect(ids).not.toContain('node:decision:old');
    const form = hits.find(h => h.id === 'node:component:invite-form');
    expect(form?.via).toBe('req:invite satisfied-by');
  });
  it('can show ended nodes with all', async () => {
    const hits = await retrieve({ product: 'p', store: setup(), idx, embed: null }, 'invite email signup', { all: true });
    expect(hits.map(h => h.id)).toContain('node:decision:old');
  });
  it('filters by source and works without vectors', async () => {
    const hits = await retrieve({ product: 'p', store: setup(), idx, embed: null }, 'sendInvite', { sources: ['code'] });
    expect(hits.map(h => h.id)).toEqual(['code:lib/invite.ts:1-9']);
  });
  it('returns nothing for a query with no words', async () => {
    expect(await retrieve({ product: 'p', store: setup(), idx, embed: null }, ' ? ')).toEqual([]);
  });
  it('trims to the character budget', async () => {
    const hits = await retrieve({ product: 'p', store: setup(), idx, embed: null }, 'invite', { budgetChars: 40 });
    expect(hits.reduce((a, h) => a + h.text.length, 0)).toBeLessThanOrEqual(40 + hits[0].text.length);
  });
});

describe('hrefFor', () => {
  it('links nodes, doc blocks, sessions; code has no page', () => {
    expect(hrefFor('p', c('node', 'req:invite', ''), idx)).toBe('/p/v2/d/m#n-req%3Ainvite');
    expect(hrefFor('p', c('doc', 'v2/m#b-abc', ''), idx)).toBe('/p/v2/d/m#b-abc');
    expect(hrefFor('p', c('session', 'abc123#2', ''), idx)).toBe('/p/sessions/abc123');
    expect(hrefFor('p', c('code', 'lib/a.ts:1-9', ''), idx)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/web && npx vitest run src/lib/ask/retrieve.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/ask/retrieve.ts
// Ask's retriever (decision:wf2.ask-two-lanes): BM25 and vector rankings fused by reciprocal rank, ended nodes left
// out (req:memory.current-by-construction), then one hop along the graph's structural edges — a decision brings what
// it affects, a requirement what satisfies it — at half the parent's score, and trimmed to a budget.
import type { ChunkRow, Hit, Source } from './types';
import type { GraphIndex } from '../graph';
import { isCurrent } from '../graph';
import { docRoute } from '../doc';
import { bm25, getChunks, chunksMentioning, ftsQuery, type Store } from './store';
import { dot, type Embed } from './embed';

export type RetrieveCtx = { product: string; store: Store; idx: GraphIndex; embed: Embed | null };
export type RetrieveOpts = { limit?: number; sources?: Source[]; expand?: boolean; all?: boolean; asOf?: string | null; budgetChars?: number };
export const EXPAND_VERBS = new Set(['affects', 'governs', 'governed-by', 'satisfied-by', 'implements', 'part-of', 'supersedes', 'refines', 'depends-on', 'verified-by', 'resolves']);

export function rrf(lists: string[][], k = 60): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lists) l.forEach((id, i) => m.set(id, (m.get(id) ?? 0) + 1 / (k + i + 1)));
  return m;
}

export function hrefFor(product: string, c: ChunkRow, idx: GraphIndex): string | null {
  if (c.source === 'node') { const n = idx.byId.get(c.ref); const r = n?.file ? docRoute(n.file.startsWith('/') ? n.file : '/' + n.file) : null; return r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(c.ref)}` : null; }
  if (c.source === 'doc') { const [doc, frag] = c.ref.split('#'); const [project, slug] = doc.split('/'); return `/${product}/${project}/d/${slug}#${frag}`; }
  if (c.source === 'session') return `/${product}/sessions/${c.ref.split('#')[0]}`;
  return null;
}

export async function retrieve(ctx: RetrieveCtx, q: string, opts: RetrieveOpts = {}): Promise<Hit[]> {
  if (!ftsQuery(q) && q.trim().length < 3) return [];
  const limit = opts.limit ?? 25; const { store, idx } = ctx;
  const live = (c: ChunkRow) => c.source !== 'node' || opts.all || (() => { const n = idx.byId.get(c.ref); return !n || (isCurrent(n, opts.asOf) && !n.archived); })();
  const kw = bm25(store, q, 50, opts.sources);
  let vec: string[] = [];
  if (ctx.embed && store.vecs.size) {
    const [qv] = await ctx.embed([q.slice(0, 1500)]);
    const allow = opts.sources ? new Set(opts.sources) : null;
    vec = [...store.vecs].filter(([id]) => !allow || allow.has(id.split(':')[0] as Source)).map(([id, v]) => [id, dot(qv, v)] as const)
      .sort((a, b) => b[1] - a[1]).slice(0, 50).map(([id]) => id);
  }
  const fused = rrf([kw, vec]);
  const ranked = [...fused].sort((a, b) => b[1] - a[1]);
  const byId = new Map(getChunks(store, ranked.map(r => r[0])).map(c => [c.id, c]));
  const hits = new Map<string, Hit>();
  for (const [id, score] of ranked) { const c = byId.get(id); if (c && live(c)) hits.set(id, { ...c, score, href: hrefFor(ctx.product, c, idx) }); if (hits.size >= limit) break; }
  if (opts.expand) {
    for (const h of [...hits.values()].slice(0, 10)) for (const nid of h.nodes) {
      for (const e of [...(idx.out.get(nid) ?? []), ...(idx.inc.get(nid) ?? [])]) {
        if (!EXPAND_VERBS.has(e.verb)) continue;
        const other = e.from === nid ? e.to : e.from; const cid = `node:${other}`;
        if (hits.has(cid)) continue;
        const [c] = getChunks(store, [cid]); if (!c || !live(c)) continue;
        hits.set(cid, { ...c, score: h.score * 0.5, via: `${nid} ${e.verb}`, href: hrefFor(ctx.product, c, idx) });
      }
      if (h.source === 'node') for (const c of chunksMentioning(store, nid, 3)) if (!hits.has(c.id) && c.source !== 'node') hits.set(c.id, { ...c, score: h.score * 0.4, via: `mentions ${nid}`, href: hrefFor(ctx.product, c, idx) });
    }
  }
  const out = [...hits.values()].sort((a, b) => b.score - a.score);
  if (!opts.budgetChars) return out.slice(0, limit);
  const kept: Hit[] = []; let used = 0;
  for (const h of out) { if (kept.length && used + h.text.length > opts.budgetChars) break; kept.push(h); used += h.text.length; if (kept.length >= limit) break; }
  return kept;
}
```

- [ ] **Step 4: Run — expect PASS.** If the expansion test fails because `affects` is not an edge verb in this graph, check `idx.out` in the fixture — the edge is declared there, so `EXPAND_VERBS` must contain `affects`.

Run: `cd packages/web && npx vitest run src/lib/ask/retrieve.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/ask/retrieve.ts packages/web/src/lib/ask/retrieve.test.ts
git commit -m "ask: retriever — RRF over BM25 and vectors, current-only, one graph hop, budget"
```

---

### Task 6: `/search` and `wye ask-search`

**Files:**
- Create: `packages/web/src/app/api/[product]/search/route.ts`
- Modify: `bin/wye.js` — help comment block near `wye context` (line ~24) and the `commands` object (beside `context()`, ~line 236)
- Create: `packages/web/src/lib/ask/env.ts` (builds a `RetrieveCtx` for a product — reused by Task 8/9)

**Interfaces:**
- Consumes: `loadScope` (`../scope`), `ensureFresh`, `getStore` (Task 4), `retrieve` (Task 5), `getEmbedder` (Task 1).
- Produces:
  - `askEnv(product: string): Promise<{ scope: Scope; ctx: RetrieveCtx; degraded?: string } | null>`
  - `GET /api/<p>/search?q=&source=node,code&limit=20&expand=1&all=1` → `{ hits: Hit[], degraded? }`
  - `wye ask-search "<q>" [--source code|doc|node|session] [--limit n] [--expand] [--json]`

- [ ] **Step 1: Write `env.ts`**

```ts
// packages/web/src/lib/ask/env.ts
// What a query needs for one product: the scope (graph, index), the store brought up to date, and the embedder when
// the model loads — without it search is BM25 only and says so.
import { loadScope, type Scope } from '../scope';
import { ensureFresh, getStore } from './refresh';
import { getEmbedder } from './embed';
import type { RetrieveCtx } from './retrieve';

export async function askEnv(product: string): Promise<{ scope: Scope; ctx: RetrieveCtx; degraded?: string } | null> {
  const scope = await loadScope(product); if (!scope) return null;
  const st = await ensureFresh(scope.product, scope.graph);
  let embed = null; try { embed = await getEmbedder(); } catch { /* BM25 only */ }
  return { scope, ctx: { product, store: getStore(scope.product), idx: scope.idx, embed }, degraded: st.degraded ?? (embed ? undefined : 'no-vectors') };
}
```

- [ ] **Step 2: Write the route**

```ts
// packages/web/src/app/api/[product]/search/route.ts
import { NextResponse } from 'next/server';
import { askEnv } from '@/lib/ask/env';
import { retrieve } from '@/lib/ask/retrieve';
import { SOURCES, type Source } from '@/lib/ask/types';

export const dynamic = 'force-dynamic';
// GET ?q=&source=a,b&limit=&expand=1&all=1&asOf= → { hits, degraded? } (decision:wf2.ask-in-search-panel): the typing-time
// search over nodes, document passages, code and sessions — no model call.
export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params; const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim(); if (q.length < 2) return NextResponse.json({ hits: [] });
  const env = await askEnv(product); if (!env) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const sources = (sp.get('source') ?? '').split(',').filter((s): s is Source => (SOURCES as string[]).includes(s));
  try {
    const hits = await retrieve(env.ctx, q, { limit: Math.min(60, Number(sp.get('limit')) || 30), sources: sources.length ? sources : undefined, expand: sp.get('expand') === '1', all: sp.get('all') === '1', asOf: sp.get('asOf') });
    return NextResponse.json({ hits, ...(env.degraded ? { degraded: env.degraded } : {}) });
  } catch (err) { return NextResponse.json({ error: 'search_failed', message: err instanceof Error ? err.message : String(err) }, { status: 500 }); }
}
```

- [ ] **Step 3: Add the CLI command.** In `bin/wye.js` add to the help comment, right after the `wye context` line:

```js
//   wye ask-search "<q>" [--source node|doc|code|session] [--limit n] [--expand] [--json]   the Ask index: passages from
//        nodes, documents, code and sessions, ranked (BM25 + vectors), --expand adds one hop along the graph
//   wye ask "<question>" [--fast | --deep] [--json]   a cited answer: the fast lane, the sources the deep agent finds, its answer
```

and in `commands`, after `context()`:

```js
  async 'ask-search'() {
    const q = pos.slice(1).join(' ') || (await readStdin()); if (!q.trim()) die('wye ask-search "<q>" [--source s] [--limit n] [--expand]');
    const sp = new URLSearchParams({ q, limit: String(flags.limit || 12) }); if (flags.source) sp.set('source', list(flags.source).join(',')); if (flags.expand) sp.set('expand', '1');
    const j = await api('GET', `/api/${product()}/search?${sp}`);
    if (flags.json) return out(j);
    for (const h of j.hits) console.log(`${h.id}${h.via ? `  (via ${h.via})` : ''}\n    ${h.title} — ${h.text.replace(/\s+/g, ' ').slice(0, 160)}`);
    if (j.degraded) console.log(`(${j.degraded}: keyword search only)`);
  },
```

- [ ] **Step 4: Verify against the dev server** (start it if it is not running: `cd packages/web && npm run dev -- -p 3456` in the background)

Run: `curl -s 'http://localhost:3456/api/wye/search?q=search+panel&limit=5' | node -e "const j=JSON.parse(require('fs').readFileSync(0));console.log(j.hits.map(h=>h.id))"`
Expected: an array that includes `node:req:wf2.ui.search` and at least one `code:packages/web/src/components/SearchPanel.tsx:…` entry. First call may take a while (initial index build).

Run: `WYE_PRODUCT=wye wye ask-search "who approves a prompt request" --limit 5`
Expected: five lines, each `<source>:<ref>` plus title and text.

Run: `curl -s 'http://localhost:3456/api/wye/search?q=%22NEAR%20*' ; echo`
Expected: `{"hits":[...]}` — no 500.

- [ ] **Step 5: Typecheck and commit**

```bash
cd packages/web && npx tsc --noEmit && cd ../..
git add packages/web/src/lib/ask/env.ts "packages/web/src/app/api/[product]/search/route.ts" bin/wye.js
git commit -m "ask: /api/<p>/search and wye ask-search"
```

---

### Task 7: Fast lane — claude stream, citations, prompt

**Files:**
- Create: `packages/web/src/lib/ask/claude.ts`, `packages/web/src/lib/ask/citations.ts`, `packages/web/src/lib/ask/fast.ts`, `prompts/ask-fast.md`
- Create: `packages/web/src/lib/ask/fixtures/claude-stub.mjs`, `packages/web/src/lib/ask/fixtures/fast.jsonl`
- Test: `packages/web/src/lib/ask/citations.test.ts`, `packages/web/src/lib/ask/fast.test.ts`

**Interfaces:**
- Consumes: `Hit`, `Citation` (Task 1); `REPO_ROOT`.
- Produces:
  - `spawnClaude(args: string[], stdin: string, opts: { signal: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number }): AsyncGenerator<Record<string, unknown>>` — JSON lines; throws `Error('claude exited N: …')` on non-zero exit; kills the child on abort or timeout and ends quietly on abort.
  - `class Citations { add(c: Omit<Citation, 'n'>): Citation; get(n: number): Citation | undefined; byRef(ref: string): Citation | undefined; all(): Citation[] }`
  - `citationOf(h: Hit): Omit<Citation, 'n'>`
  - `citedNumbers(text: string): number[]`
  - `fastPrompt(q: string, hits: Hit[], history?: { q: string; a: string }[]): string`
  - `runFast(prompt: string, opts: { signal: AbortSignal }): AsyncGenerator<string>` — text deltas
  - `ASK_MODEL`

- [ ] **Step 1: Write the stub and fixture**

```js
// packages/web/src/lib/ask/fixtures/claude-stub.mjs
// A stand-in for `claude -p … --output-format stream-json`: prints the lines of a fixture (one JSON object per line)
// with $STUB_DELAY ms between them. The deep lane (its args carry --allowedTools) reads $STUB_DEEP and exits
// $STUB_EXIT_DEEP; anything else reads $STUB_JSONL and exits $STUB_EXIT (default 0). Reads and ignores stdin.
import { readFileSync } from 'node:fs';
process.stdin.resume(); process.stdin.on('data', () => {});
const deep = process.argv.includes('--allowedTools');
const lines = readFileSync(deep && process.env.STUB_DEEP ? process.env.STUB_DEEP : process.env.STUB_JSONL, 'utf8').split('\n').filter(Boolean);
const exitCode = Number((deep ? process.env.STUB_EXIT_DEEP : undefined) ?? process.env.STUB_EXIT ?? 0);
const delay = Number(process.env.STUB_DELAY || 0);
let i = 0;
const next = () => { if (i < lines.length) { process.stdout.write(lines[i++] + '\n'); setTimeout(next, delay); } else process.exit(exitCode); };
next();
```

```jsonl
{"type":"system","subtype":"init"}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"The invite email was dropped "}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"in favour of links [1][3]."}}}
{"type":"result","subtype":"success","result":"The invite email was dropped in favour of links [1][3]."}
```

(save the four lines above as `packages/web/src/lib/ask/fixtures/fast.jsonl`)

- [ ] **Step 2: Write the failing tests**

```ts
// packages/web/src/lib/ask/citations.test.ts
import { describe, it, expect } from 'vitest';
import { Citations, citedNumbers } from './citations';

describe('Citations', () => {
  it('numbers in order and dedupes by ref', () => {
    const c = new Citations();
    expect(c.add({ ref: 'req:a', source: 'node', title: 'A', href: null, snippet: '' }).n).toBe(1);
    expect(c.add({ ref: 'x.ts:1-2', source: 'code', title: 'x', href: null, snippet: '' }).n).toBe(2);
    expect(c.add({ ref: 'req:a', source: 'node', title: 'A again', href: null, snippet: '' }).n).toBe(1);
    expect(c.all().length).toBe(2); expect(c.byRef('x.ts:1-2')?.n).toBe(2); expect(c.get(1)?.ref).toBe('req:a');
  });
});
describe('citedNumbers', () => {
  it('finds [n] and [n, m] markers, unique, in order', () => { expect(citedNumbers('a [2] b [1, 3] c [2] [x]')).toEqual([2, 1, 3]); });
});
```

```ts
// packages/web/src/lib/ask/fast.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fastPrompt, runFast } from './fast';
import { spawnClaude } from './claude';
import type { Hit } from './types';

const FX = path.join(__dirname, 'fixtures');
beforeAll(() => { process.env.WYE_CLAUDE_BIN = `node ${path.join(FX, 'claude-stub.mjs')}`; });
const hit = (id: string, text: string): Hit => ({ id, source: 'node', ref: id.slice(5), title: id, text, nodes: [], score: 1, href: null });

describe('fastPrompt', () => {
  it('numbers the sources from 1 and carries the question and history', () => {
    const p = fastPrompt('why no invite email?', [hit('node:decision:a', 'we stopped'), hit('node:req:b', 'invite')], [{ q: 'earlier?', a: 'yes' }]);
    expect(p).toContain('[1] node decision:a'); expect(p).toContain('[2] node req:b');
    expect(p).toContain('why no invite email?'); expect(p).toContain('earlier?');
  });
});
describe('runFast', () => {
  it('yields the text deltas', async () => {
    process.env.STUB_JSONL = path.join(FX, 'fast.jsonl');
    const out: string[] = []; for await (const t of runFast('p', { signal: new AbortController().signal })) out.push(t);
    expect(out.join('')).toBe('The invite email was dropped in favour of links [1][3].');
  });
  it('throws when the binary fails', async () => {
    process.env.STUB_JSONL = path.join(FX, 'fast.jsonl'); process.env.STUB_EXIT = '3';
    await expect((async () => { for await (const _ of runFast('p', { signal: new AbortController().signal })) void _; })()).rejects.toThrow(/exited 3/);
    delete process.env.STUB_EXIT;
  });
  it('ends quietly and kills the child on abort', async () => {
    process.env.STUB_JSONL = path.join(FX, 'fast.jsonl'); process.env.STUB_DELAY = '200';
    const ac = new AbortController(); const got: unknown[] = [];
    const run = (async () => { for await (const l of spawnClaude([], '', { signal: ac.signal })) { got.push(l); ac.abort(); } })();
    await expect(run).resolves.toBeUndefined(); expect(got.length).toBe(1);
    delete process.env.STUB_DELAY;
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd packages/web && npx vitest run src/lib/ask/citations.test.ts src/lib/ask/fast.test.ts`

- [ ] **Step 4: Implement**

```ts
// packages/web/src/lib/ask/claude.ts
// One `claude -p` run as a stream of its JSON lines (decision:memory.model-calls-via-cli). WYE_CLAUDE_BIN replaces the
// binary (a shell command line — the tests point it at a stub). Abort kills the child and ends the stream quietly.
import { spawn } from 'node:child_process';

export async function* spawnClaude(args: string[], stdin: string, opts: { signal: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number }): AsyncGenerator<Record<string, unknown>> {
  const bin = process.env.WYE_CLAUDE_BIN || 'claude';
  const quote = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`;
  const child = spawn(`${bin} ${args.map(quote).join(' ')}`, { shell: true, cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const kill = () => { try { child.kill('SIGTERM'); } catch { /* gone */ } };
  opts.signal.addEventListener('abort', kill, { once: true });
  const timer = opts.timeoutMs ? setTimeout(kill, opts.timeoutMs) : null;
  let err = ''; child.stderr.on('data', d => { err += d; });
  const exit = new Promise<number | null>(res => child.on('close', c => res(c)));
  child.stdin.on('error', () => {}); child.stdin.end(stdin);
  let buf = '';
  try {
    for await (const d of child.stdout) {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { yield JSON.parse(line); } catch { /* not json */ } if (opts.signal.aborted) return; }
    }
    const code = await exit;
    if (opts.signal.aborted) return;
    if (code !== 0) throw new Error(`claude exited ${code}: ${err.trim().slice(0, 300)}`);
  } finally { if (timer) clearTimeout(timer); opts.signal.removeEventListener('abort', kill); if (child.exitCode === null) kill(); }
}
```

```ts
// packages/web/src/lib/ask/citations.ts
// One numbering for both answers (decision:wf2.ask-two-lanes): [3] is the same source in the fast and the deep answer.
import type { Citation, Hit } from './types';

export class Citations {
  private list: Citation[] = []; private refs = new Map<string, Citation>();
  add(c: Omit<Citation, 'n'>): Citation { const have = this.refs.get(c.ref); if (have) return have; const x = { ...c, n: this.list.length + 1 }; this.list.push(x); this.refs.set(c.ref, x); return x; }
  get(n: number) { return this.list[n - 1]; }
  byRef(ref: string) { return this.refs.get(ref); }
  all() { return [...this.list]; }
}
export const citationOf = (h: Hit): Omit<Citation, 'n'> => ({ ref: h.ref, source: h.source, title: h.title, href: h.href, snippet: h.text.replace(/\s+/g, ' ').slice(0, 200) });
export function citedNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) for (const n of m[1].split(',').map(x => Number(x.trim()))) if (!out.includes(n)) out.push(n);
  return out;
}
```

```ts
// packages/web/src/lib/ask/fast.ts
// The fast lane (decision:wf2.ask-two-lanes): the retrieved passages, numbered, and the question go to one tool-less
// model call; its answer streams back token by token with [n] citations into that numbering.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../products';
import type { Hit } from './types';
import { spawnClaude } from './claude';

export const ASK_MODEL = process.env.WYE_ASK_MODEL || 'claude-sonnet-5-5';
const brief = () => readFileSync(path.join(REPO_ROOT, 'prompts/ask-fast.md'), 'utf8');

export function fastPrompt(q: string, hits: Hit[], history: { q: string; a: string }[] = []): string {
  const src = hits.map((h, i) => `[${i + 1}] ${h.source} ${h.ref}${h.via ? ` (via ${h.via})` : ''} — ${h.title}\n${h.text}`).join('\n\n');
  const hist = history.length ? `\n## Earlier in this conversation\n${history.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n')}\n` : '';
  return `${brief()}\n${hist}\n## Sources\n${src || '(none found)'}\n\n## Question\n${q}\n`;
}

export async function* runFast(prompt: string, opts: { signal: AbortSignal }): AsyncGenerator<string> {
  let streamed = false;
  for await (const l of spawnClaude(['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', ASK_MODEL, '--tools', ''], prompt, { signal: opts.signal, timeoutMs: 90000 })) {
    const ev = l.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (l.type === 'stream_event' && ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) { streamed = true; yield ev.delta.text; }
    else if (l.type === 'result' && !streamed && typeof l.result === 'string') yield l.result;
  }
}
```

```markdown
<!-- prompts/ask-fast.md -->
You are Wye, answering a person's question about their product from the sources below — the product's knowledge
(requirements, decisions, rules, constraints, questions, tasks as typed blocks with ids like req:x.y), its documents,
its code and its past agent sessions.

- Answer from these sources only. If they do not answer the question, say so in one sentence and say what is missing.
- Cite every claim with the source's number in square brackets, e.g. [2] or [1][4]. Never cite a number that is not listed.
- Lead with the answer in one or two sentences, then the detail. Plain language, at most 250 words, markdown.
- Write node ids as plain text (req:x.y), never in code spans.
- If the sources disagree, or one is superseded by another, say which holds now.
- If, and only if, the sources are too thin to answer, end with the line: `THIN`
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd packages/web && npx vitest run src/lib/ask/citations.test.ts src/lib/ask/fast.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib/ask/{claude,citations,fast}.ts packages/web/src/lib/ask/{citations,fast}.test.ts packages/web/src/lib/ask/fixtures prompts/ask-fast.md
git commit -m "ask: the fast lane — one tool-less claude call over numbered passages, shared citations"
```

---

### Task 8: Deep lane and the orchestrator

**Files:**
- Create: `packages/web/src/lib/ask/refs.ts`, `packages/web/src/lib/ask/deep.ts`, `packages/web/src/lib/ask/ask.ts`, `prompts/ask-deep.md`, `packages/web/src/lib/ask/fixtures/deep.jsonl`
- Test: `packages/web/src/lib/ask/refs.test.ts`, `packages/web/src/lib/ask/ask.test.ts`

**Interfaces:**
- Consumes: Tasks 1–7; `REPO_ROOT`.
- Produces:
  - `stepText(name: string, input: Record<string, unknown>, roots?: { code: string; product: string }): string`
  - `refsFromToolUse(name: string, input: Record<string, unknown>, roots: { code: string; product: string }): string[]` — refs (`path:a-b` or chunk ids)
  - `refsFromToolResult(text: string, known: (id: string) => boolean): string[]`
  - `deepArgs(o: { product: string; productDir: string; codeRoot: string; wfUrl: string }): string[]`
  - `runDeep(q: string, history: { q: string; a: string }[], o: DeepOpts): AsyncGenerator<DeepEvent>`
  - `type DeepEvent = { type: 'step'; text: string } | { type: 'refs'; refs: string[] } | { type: 'delta'; text: string } | { type: 'done'; cut: boolean }`
  - `type DeepOpts = { signal: AbortSignal; product: string; productDir: string; codeRoot: string; wfUrl: string; maxTools?: number; timeoutMs?: number }`
  - `ask(env: AskEnvLike, req: AskRequest, o: { signal: AbortSignal; wfUrl: string }): AsyncGenerator<AskEvent>`
  - `type AskEnvLike = { ctx: RetrieveCtx; productDir: string; codeRoot: string; degraded?: string }`
  - `resolveRef(raw: string, env: AskEnvLike): Omit<Citation, 'n'> | null`
  - `DEEP_MAX_PER_PRODUCT = 2`

- [ ] **Step 1: Write the deep fixture** (`fixtures/deep.jsonl`)

```jsonl
{"type":"system","subtype":"init"}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"wye ask-search \"invite email\" --json"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"{\"hits\":[{\"id\":\"node:decision:no-email\"},{\"id\":\"code:lib/invite.ts:1-9\"}]}"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Read","input":{"file_path":"/REPO/lib/invite.ts","offset":10,"limit":20}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":"10  export function sendInvite() {"}]}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"It was dropped by [[decision:no-email]]; "}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"the sender is in [[lib/invite.ts:10-29]]."}}}
{"type":"result","subtype":"success","result":"It was dropped by [[decision:no-email]]; the sender is in [[lib/invite.ts:10-29]]."}
```

- [ ] **Step 2: Write the failing tests**

```ts
// packages/web/src/lib/ask/refs.test.ts
import { describe, it, expect } from 'vitest';
import { stepText, refsFromToolUse, refsFromToolResult } from './refs';

const roots = { code: '/REPO', product: '/REPO/data/products/p' };
describe('deep-lane refs', () => {
  it('describes what a tool call does', () => {
    expect(stepText('Bash', { command: 'wye ask-search "invite email" --source code' })).toBe('Searching “invite email” in code');
    expect(stepText('Bash', { command: 'wye node req:a' })).toBe('Reading req:a');
    expect(stepText('Bash', { command: 'wye neighbors req:a' })).toBe('Following the links of req:a');
    expect(stepText('Read', { file_path: '/REPO/lib/x.ts' }, roots)).toBe('Reading lib/x.ts');
    expect(stepText('Grep', { pattern: 'sendInvite' })).toBe('Searching the code for “sendInvite”');
  });
  it('turns a Read into a code ref with lines, and a document read into a doc-file ref', () => {
    expect(refsFromToolUse('Read', { file_path: '/REPO/lib/x.ts', offset: 10, limit: 20 }, roots)).toEqual(['lib/x.ts:10-29']);
    expect(refsFromToolUse('Read', { file_path: '/REPO/lib/x.ts' }, roots)).toEqual(['lib/x.ts:1-60']);
    expect(refsFromToolUse('Read', { file_path: '/REPO/data/products/p/projects/v2/docs/m.md' }, roots)).toEqual(['doc-file:v2/m']);
    expect(refsFromToolUse('Read', { file_path: '/elsewhere/x.ts' }, roots)).toEqual([]);
    expect(refsFromToolUse('Bash', { command: 'wye node req:a' }, roots)).toEqual(['req:a']);
  });
  it('finds chunk ids in ask-search JSON and known node ids in text', () => {
    const known = (id: string) => id === 'req:a' || id === 'decision:b';
    expect(refsFromToolResult('{"hits":[{"id":"node:req:a"},{"id":"code:lib/x.ts:1-9"}]}', known)).toEqual(['node:req:a', 'code:lib/x.ts:1-9']);
    expect(refsFromToolResult('## req:a [shipped]\n  decision:b — x\n  req:zzz', known)).toEqual(['req:a', 'decision:b']);
  });
});
```

```ts
// packages/web/src/lib/ask/ask.test.ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import path from 'node:path';
import { ask, resolveRef, type AskEnvLike } from './ask';
import { openStore, syncScope } from './store';
import { indexGraph, type GraphData } from '../graph';
import type { AskEvent } from './types';

const FX = path.join(__dirname, 'fixtures');
const g = { generatedAt: '', modules: [], files: [], fieldIndex: {}, edges: [], nodes: [{ id: 'decision:no-email', kind: 'decision', title: 'No invite email', status: 'approved', section: '', subsection: '', body: '', defined: true, file: 'data/products/p/projects/v2/docs/m.md', line: 1 }] } as unknown as GraphData;
function env(): AskEnvLike {
  const store = openStore(':memory:');
  syncScope(store, 'graph', 'node', 1, [{ id: 'node:decision:no-email', source: 'node', ref: 'decision:no-email', title: 'No invite email', text: 'we stopped sending the invite email', nodes: ['decision:no-email'] }]);
  syncScope(store, 'c', 'code', 1, [{ id: 'code:lib/invite.ts:1-9', source: 'code', ref: 'lib/invite.ts:1-9', title: 'lib/invite.ts', text: 'function sendInvite', nodes: [] }]);
  return { ctx: { product: 'p', store, idx: indexGraph(g), embed: null }, productDir: '/REPO/data/products/p', codeRoot: '/REPO' };
}
// the stub picks the deep fixture itself when its args carry --allowedTools
beforeAll(() => { process.env.WYE_CLAUDE_BIN = `node ${path.join(FX, 'claude-stub.mjs')}`; process.env.STUB_JSONL = path.join(FX, 'fast.jsonl'); process.env.STUB_DEEP = path.join(FX, 'deep.jsonl'); });
afterEach(() => { delete process.env.STUB_EXIT_DEEP; delete process.env.STUB_DELAY; });
const collect = async (it: AsyncGenerator<AskEvent>) => { const out: AskEvent[] = []; for await (const e of it) out.push(e); return out; };

describe('ask', () => {
  it('streams results, both answers, live found sources, one numbering, then done', async () => {
    const ev = await collect(ask(env(), { q: 'why no invite email?' }, { signal: new AbortController().signal, wfUrl: 'http://x' }));
    const types = ev.map(e => e.type);
    expect(types[0]).toBe('results'); expect(types.at(-1)).toBe('done');
    expect(types).toContain('fast.done'); expect(types).toContain('deep.done'); expect(types).toContain('step');
    const found = ev.filter(e => e.type === 'found').map(e => (e as Extract<AskEvent, { type: 'found' }>).citation.ref);
    expect(found).toEqual(expect.arrayContaining(['lib/invite.ts:10-29']));
    const deep = ev.find(e => e.type === 'deep.done') as Extract<AskEvent, { type: 'deep.done' }>;
    const deepText = ev.filter(e => e.type === 'deep.delta').map(e => (e as { text: string }).text).join('');
    const n = deep.citations.find(c => c.ref === 'decision:no-email')!.n;
    const hits = (ev[0] as Extract<AskEvent, { type: 'results' }>).hits;
    expect(n).toBe(hits.findIndex(h => h.ref === 'decision:no-email') + 1);   // the number the fast lane's prompt gave it
    expect(deepText).toContain(`[${n}]`); expect(deepText).not.toContain('[[');
  });
  it('a failing lane reports an error and the other still answers', async () => {
    process.env.STUB_EXIT_DEEP = '2';
    const ev = await collect(ask(env(), { q: 'why no invite email?' }, { signal: new AbortController().signal, wfUrl: 'http://x' }));
    expect(ev.some(e => e.type === 'error' && e.lane === 'deep')).toBe(true);
    expect(ev.some(e => e.type === 'fast.done')).toBe(true); expect(ev.at(-1)!.type).toBe('done');
  });
  it('abort ends the stream without more events', async () => {
    const ac = new AbortController(); const ev: AskEvent[] = [];
    for await (const e of ask(env(), { q: 'why no invite email?' }, { signal: ac.signal, wfUrl: 'http://x' })) { ev.push(e); if (e.type === 'results') ac.abort(); }
    expect(ev.map(e => e.type)).toEqual(['results']);
  });
  it('runs only the lanes asked for', async () => {
    const ev = await collect(ask(env(), { q: 'why no invite email?', lanes: ['fast'] }, { signal: new AbortController().signal, wfUrl: 'http://x' }));
    expect(ev.some(e => e.type.startsWith('deep') || e.type === 'step')).toBe(false);
  });
});
describe('resolveRef', () => {
  it('resolves node ids, chunk ids and code paths', () => {
    const e = env();
    expect(resolveRef('decision:no-email', e)?.source).toBe('node');
    expect(resolveRef('code:lib/invite.ts:1-9', e)?.ref).toBe('lib/invite.ts:1-9');
    expect(resolveRef('lib/other.ts:5-9', e)).toMatchObject({ source: 'code', ref: 'lib/other.ts:5-9' });
    expect(resolveRef('nonsense', e)).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `cd packages/web && npx vitest run src/lib/ask/refs.test.ts src/lib/ask/ask.test.ts`

- [ ] **Step 4: Implement `refs.ts`**

```ts
// packages/web/src/lib/ask/refs.ts
// What the deep lane is doing and what it has looked at, read off its tool calls (decision:wf2.ask-two-lanes): every
// file, node or passage it opens becomes a source the panel shows while it is still working. Pure.
import path from 'node:path';

const arg = (cmd: string, re: RegExp) => cmd.match(re)?.[1];
export function stepText(name: string, input: Record<string, unknown>, roots?: { code: string; product: string }): string {
  const shortPath = (p: string) => roots && p.startsWith(roots.code + '/') ? p.slice(roots.code.length + 1) : path.basename(p);
  if (name === 'Bash') {
    const c = String(input.command ?? '');
    const q = arg(c, /ask-search\s+"([^"]+)"/) ?? arg(c, /ask-search\s+'([^']+)'/); const src = arg(c, /--source\s+(\w+)/);
    if (q) return `Searching “${q}”${src ? ` in ${src}` : ''}`;
    const nb = arg(c, /wye\s+(?:graph\s+)?neighbors\s+(\S+)/); if (nb) return `Following the links of ${nb}`;
    const id = arg(c, /wye\s+(?:node|get|resolve|explain)\s+(\S+)/); if (id) return `Reading ${id}`;
    const d = arg(c, /wye\s+doc\s+(\S+)/); if (d) return `Reading ${d}`;
    const s = arg(c, /wye\s+session\s+show\s+(\S+)/); if (s) return `Reading session ${s}`;
    return `Running ${c.slice(0, 60)}`;
  }
  if (name === 'Read') return `Reading ${shortPath(String(input.file_path ?? ''))}`;
  if (name === 'Grep') return `Searching the code for “${String(input.pattern ?? '')}”`;
  if (name === 'Glob') return `Listing ${String(input.pattern ?? '')}`;
  return name;
}
export function refsFromToolUse(name: string, input: Record<string, unknown>, roots: { code: string; product: string }): string[] {
  if (name === 'Read') {
    const f = String(input.file_path ?? '');
    const doc = f.match(/\/projects\/([^/]+)\/(docs|\.wye)\/([^/]+)\.md$/);
    if (f.startsWith(roots.product + '/') && doc) return [`doc-file:${doc[1]}/${doc[2] === '.wye' ? '~' : ''}${doc[3]}`];
    if (!f.startsWith(roots.code + '/')) return [];
    const a = Number(input.offset ?? 1) || 1; const n = Number(input.limit ?? 60) || 60;
    return [`${f.slice(roots.code.length + 1)}:${a}-${a + n - 1}`];
  }
  if (name === 'Bash') { const id = arg(String(input.command ?? ''), /wye\s+(?:node|get|neighbors|graph\s+neighbors)\s+([a-z][a-z-]*:[\w.-]+)/); return id ? [id] : []; }
  return [];
}

export function refsFromToolResult(text: string, known: (id: string) => boolean): string[] {
  const out: string[] = [];
  try { const j = JSON.parse(text) as { hits?: { id?: string }[] }; for (const h of j.hits ?? []) if (h.id && !out.includes(h.id)) out.push(h.id); if (out.length) return out; } catch { /* not ask-search JSON */ }
  for (const m of text.matchAll(/(?<![\w/:.])([a-z][a-z-]*:[\w][\w.-]*[\w])/g)) if (known(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out.slice(0, 20);
}
```

- [ ] **Step 5: Implement `deep.ts` and `prompts/ask-deep.md`**

```ts
// packages/web/src/lib/ask/deep.ts
// The deep lane (decision:wf2.ask-two-lanes): a read-only agent — wye search, graph and document reads, Read / Grep /
// Glob in the product's code — that investigates until it can answer. It never writes or proposes
// (constraint:wf2.pr-is-the-persons). Capped at 20 tool calls or 120 s; then it is stopped and its partial answer stands.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../products';
import { spawnClaude } from './claude';
import { ASK_MODEL } from './fast';
import { stepText, refsFromToolUse, refsFromToolResult } from './refs';

export type DeepEvent = { type: 'step'; text: string } | { type: 'refs'; refs: string[] } | { type: 'delta'; text: string } | { type: 'done'; cut: boolean };
export type DeepOpts = { signal: AbortSignal; product: string; productDir: string; codeRoot: string; wfUrl: string; known: (id: string) => boolean; maxTools?: number; timeoutMs?: number };

export function deepArgs(o: { product: string; productDir: string; codeRoot: string; wfUrl: string }): string[] {
  const brief = readFileSync(path.join(REPO_ROOT, 'prompts/ask-deep.md'), 'utf8').replaceAll('{{product}}', o.product).replaceAll('{{code}}', o.codeRoot).replaceAll('{{docs}}', o.productDir);
  return ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', ASK_MODEL, '--append-system-prompt', brief,
    '--add-dir', o.codeRoot, '--add-dir', o.productDir,
    '--allowedTools', 'Bash(wye:*)', 'Read', 'Grep', 'Glob',
    '--disallowedTools', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash(git:*)', 'Bash(rm:*)', 'Bash(npm:*)', 'Bash(node:*)', 'Agent', 'Task', 'WebFetch', 'WebSearch'];
}

export async function* runDeep(q: string, history: { q: string; a: string }[], o: DeepOpts): AsyncGenerator<DeepEvent> {
  const max = o.maxTools ?? 20; let tools = 0; let cut = false; let streamed = false;
  const inner = new AbortController(); const stop = () => inner.abort(); o.signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => { cut = true; inner.abort(); }, o.timeoutMs ?? 120000);
  const roots = { code: o.codeRoot, product: o.productDir };
  const prompt = `${history.length ? `Earlier in this conversation:\n${history.map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n')}\n\n` : ''}Question: ${q}`;
  try {
    for await (const l of spawnClaude(deepArgs(o), prompt, { signal: inner.signal, cwd: o.codeRoot, env: { WYE_URL: o.wfUrl, WYE_PRODUCT: o.product } })) {
      const content = ((l.message as { content?: unknown[] } | undefined)?.content ?? []) as Record<string, unknown>[];
      if (l.type === 'assistant') for (const c of content) if (c.type === 'tool_use') {
        const input = (c.input ?? {}) as Record<string, unknown>;
        yield { type: 'step', text: stepText(String(c.name), input, roots) };
        const refs = refsFromToolUse(String(c.name), input, roots); if (refs.length) yield { type: 'refs', refs };
        if (++tools >= max) { cut = true; inner.abort(); }
      }
      if (l.type === 'user') for (const c of content) if (c.type === 'tool_result') {
        const t = typeof c.content === 'string' ? c.content : Array.isArray(c.content) ? (c.content as { text?: string }[]).map(x => x.text ?? '').join('\n') : '';
        const refs = refsFromToolResult(t, o.known); if (refs.length) yield { type: 'refs', refs };
      }
      const ev = l.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
      if (l.type === 'stream_event' && ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) { streamed = true; yield { type: 'delta', text: ev.delta.text }; }
      else if (l.type === 'result' && !streamed && typeof l.result === 'string') yield { type: 'delta', text: l.result };
    }
  } finally { clearTimeout(timer); o.signal.removeEventListener('abort', stop); }
  if (!o.signal.aborted) yield { type: 'done', cut };
}
```

```markdown
<!-- prompts/ask-deep.md -->
You are Wye's researcher for the product `{{product}}`. A person asked the question below. Investigate until you can
answer it well, then answer. You only read — never edit files, never propose blocks, never run anything but the tools
listed here.

How to look (cheapest first):
- `wye ask-search "<words>" --json [--source node|doc|code|session] [--expand]` — the product's index: knowledge
  nodes, document passages, code and past sessions. Start here; try two or three phrasings.
- `wye node <id>` — one node in full; `wye graph neighbors <id> --root {{docs}}` — what it links to (decisions,
  requirements, components, tests); `wye doc <product/project/doc>` — a whole document.
- `Read`, `Grep`, `Glob` in the code at {{code}} and the documents at {{docs}} — read the lines that matter.

Answer:
- Lead with the answer in one or two sentences, then the evidence. Markdown, at most 350 words.
- Cite every claim with the source in double brackets, exactly as you found it: a node id `[[req:x.y]]`, a passage id
  from ask-search `[[doc:v2/m#b-1a2b3c4d]]`, or code with lines `[[packages/web/src/lib/x.ts:40-88]]`.
- Say what holds now when sources disagree or one is superseded. Say plainly what you could not find.
```

- [ ] **Step 6: Implement `ask.ts`**

```ts
// packages/web/src/lib/ask/ask.ts
// Ask (decision:wf2.ask-two-lanes): retrieve once, then the fast and the deep lane run at the same time; their output
// is merged into one stream of events with one citation numbering. The fast lane's sources are numbered first, in the
// order its prompt lists them, so its [n] are already right; the deep lane's [[ref]] are renumbered as they stream.
import type { AskEvent, AskRequest, Citation, Hit, Source } from './types';
import { retrieve, hrefFor, type RetrieveCtx } from './retrieve';
import { getChunks } from './store';
import { Citations, citationOf, citedNumbers } from './citations';
import { fastPrompt, runFast } from './fast';
import { runDeep } from './deep';

export type AskEnvLike = { ctx: RetrieveCtx; productDir: string; codeRoot: string; degraded?: string };
export const DEEP_MAX_PER_PRODUCT = 2;
const deepRunning = new Map<string, number>();

export function resolveRef(raw: string, env: AskEnvLike): Omit<Citation, 'n'> | null {
  const { store, idx, product } = env.ctx;
  const chunkId = /^(node|doc|code|session):/.test(raw) ? raw : idx.byId.has(raw) ? `node:${raw}` : null;
  if (chunkId) { const [c] = getChunks(store, [chunkId]); if (c) return citationOf({ ...c, score: 0, href: hrefFor(product, c, idx) } as Hit); }
  if (idx.byId.has(raw)) { const n = idx.byId.get(raw)!; return { ref: raw, source: 'node', title: n.title || raw, href: hrefFor(product, { id: `node:${raw}`, source: 'node', ref: raw, title: '', text: '', nodes: [] }, idx), snippet: '' }; }
  const doc = raw.match(/^doc-file:([^/]+)\/(.+)$/);
  if (doc) return { ref: raw, source: 'doc' as Source, title: `${doc[1]} / ${doc[2]}`, href: `/${product}/${doc[1]}/d/${doc[2]}`, snippet: '' };
  if (/^[\w./-]+\.\w+(:\d+(-\d+)?)?$/.test(raw)) return { ref: raw, source: 'code', title: raw.replace(/:.*/, ''), href: null, snippet: '' };
  return null;
}

// a tiny channel: two producers, one consumer
function channel<T>() {
  const q: T[] = []; let wake: (() => void) | null = null; let open = 0; let closed = false;
  return {
    push(x: T) { q.push(x); wake?.(); },
    producer() { open++; return () => { if (--open === 0) { closed = true; wake?.(); } }; },
    async *drain(signal: AbortSignal) {
      for (;;) {
        if (signal.aborted) return;
        if (q.length) { yield q.shift()!; continue; }
        if (closed) return;
        await new Promise<void>(r => { wake = () => { wake = null; r(); }; signal.addEventListener('abort', () => r(), { once: true }); });
      }
    },
  };
}

export async function* ask(env: AskEnvLike, req: AskRequest, o: { signal: AbortSignal; wfUrl: string }): AsyncGenerator<AskEvent> {
  const lanes = req.lanes?.length ? req.lanes : ['fast', 'deep'];
  const history = (req.history ?? []).slice(-3).map(h => ({ q: h.q.slice(0, 500), a: h.a.slice(0, 1500) }));
  let hits: Hit[] = [];
  try { hits = await retrieve(env.ctx, req.q, { expand: true, limit: 25, budgetChars: 48000 }); }
  catch (e) { yield { type: 'error', lane: 'retrieve', message: String(e instanceof Error ? e.message : e) }; }
  if (o.signal.aborted) return;
  yield { type: 'results', hits, ...(env.degraded ? { degraded: env.degraded } : {}) };
  if (o.signal.aborted) return;
  const cites = new Citations(); for (const h of hits) cites.add(citationOf(h));
  const ch = channel<AskEvent>();
  const product = env.ctx.product;

  if (lanes.includes('fast')) {
    const end = ch.producer();
    (async () => {
      let text = '';
      try { for await (const t of runFast(fastPrompt(req.q, hits, history), { signal: o.signal })) { text += t; ch.push({ type: 'fast.delta', text: t }); }
        if (!o.signal.aborted) ch.push({ type: 'fast.done', citations: citedNumbers(text).map(n => cites.get(n)).filter((c): c is Citation => !!c) }); }
      catch (e) { if (!o.signal.aborted) ch.push({ type: 'error', lane: 'fast', message: String(e instanceof Error ? e.message : e) }); }
      finally { end(); }
    })();
  }
  if (lanes.includes('deep')) {
    const end = ch.producer();
    (async () => {
      while ((deepRunning.get(product) ?? 0) >= DEEP_MAX_PER_PRODUCT) { ch.push({ type: 'step', text: 'Waiting for another deep search to finish' }); await new Promise(r => setTimeout(r, 1000)); if (o.signal.aborted) { end(); return; } }
      deepRunning.set(product, (deepRunning.get(product) ?? 0) + 1);
      const used: Citation[] = []; let pending = '';
      const flush = (final: boolean) => {      // [[ref]] → [n]; hold back a trailing partial "[[…"
        let cutAt = pending.length;
        if (!final) { const open = pending.lastIndexOf('[['); if (open >= 0 && pending.indexOf(']]', open) < 0) cutAt = open; }
        const head = pending.slice(0, cutAt); pending = pending.slice(cutAt);
        const out = head.replace(/\[\[([^\]]+)\]\]/g, (m, raw: string) => { const c = resolveRef(raw.trim(), env); if (!c) return raw; const x = cites.add(c); if (!used.includes(x)) used.push(x); return `[${x.n}]`; });
        if (out) ch.push({ type: 'deep.delta', text: out });
      };
      try {
        for await (const e of runDeep(req.q, history, { signal: o.signal, product, productDir: env.productDir, codeRoot: env.codeRoot, wfUrl: o.wfUrl, known: id => env.ctx.idx.byId.has(id) })) {
          if (e.type === 'step') ch.push({ type: 'step', text: e.text });
          else if (e.type === 'refs') for (const r of e.refs) { const c = resolveRef(r, env); if (!c) continue; const x = cites.add(c); if (!used.includes(x)) { used.push(x); ch.push({ type: 'found', citation: x }); } }
          else if (e.type === 'delta') { pending += e.text; flush(false); }
          else if (e.type === 'done') { flush(true); ch.push({ type: 'deep.done', citations: used, ...(e.cut ? { cut: true } : {}) }); }
        }
      } catch (e) { if (!o.signal.aborted) ch.push({ type: 'error', lane: 'deep', message: String(e instanceof Error ? e.message : e) }); }
      finally { deepRunning.set(product, (deepRunning.get(product) ?? 1) - 1); end(); }
    })();
  }
  if (!lanes.length) return;
  for await (const e of ch.drain(o.signal)) yield e;
  if (!o.signal.aborted) yield { type: 'done' };
}
```

Note on the `found` test: the fixture's deep lane reads `/REPO/lib/invite.ts` with offset 10, limit 20 → ref `lib/invite.ts:10-29`, which `resolveRef` turns into a code citation. `decision:no-email` already had its number from the fast lane's hits (its position in `results`), so the deep answer's `[[decision:no-email]]` becomes `[1]`.

- [ ] **Step 7: Run — expect PASS.** If the abort test sees a `step` before abort lands, check that `drain` returns on `signal.aborted` before yielding queued items (the first line of the loop).

Run: `cd packages/web && npx vitest run src/lib/ask`

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/lib/ask/{refs,deep,ask}.ts packages/web/src/lib/ask/{refs,ask}.test.ts packages/web/src/lib/ask/fixtures/deep.jsonl prompts/ask-deep.md
git commit -m "ask: the deep lane and the orchestrator — both lanes at once, found sources live, one numbering"
```

---

### Task 9: `/ask` SSE route, `wye ask`, skills

**Files:**
- Create: `packages/web/src/app/api/[product]/ask/route.ts`
- Modify: `bin/wye.js` (commands object, next to `'ask-search'`)
- Modify: `skills/wye-agent/SKILL.md`, `skills/wye-context/SKILL.md` (one bullet each)

**Interfaces:**
- Consumes: `askEnv` (Task 6), `ask` (Task 8), `codeRoot` (Task 4).
- Produces: `POST /api/<p>/ask` body `AskRequest` → `text/event-stream` of `event: <AskEvent.type>\ndata: <json>`; `wye ask`.

- [ ] **Step 1: Write the route**

```ts
// packages/web/src/app/api/[product]/ask/route.ts
import { askEnv } from '@/lib/ask/env';
import { ask } from '@/lib/ask/ask';
import { codeRoot } from '@/lib/ask/refresh';
import type { AskRequest } from '@/lib/ask/types';

export const dynamic = 'force-dynamic';
// POST { q, history?, lanes? } → server-sent events (decision:wf2.ask-two-lanes): results, fast.delta…, fast.done,
// step / found while the deep lane works, deep.delta…, deep.done, error per lane, done. Closing the request stops both.
export async function POST(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const body = (await req.json().catch(() => ({}))) as AskRequest;
  const q = String(body.q ?? '').trim();
  if (q.length < 3) return Response.json({ error: 'invalid', message: 'a question of at least 3 characters' }, { status: 422 });
  const env = await askEnv(product); if (!env) return Response.json({ error: 'not_found' }, { status: 404 });
  const wfUrl = new URL(req.url).origin;
  const enc = new TextEncoder(); const ac = new AbortController();
  req.signal.addEventListener('abort', () => ac.abort(), { once: true });
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (name: string, data: unknown) => { try { ctrl.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { ac.abort(); } };
      try { for await (const e of ask({ ctx: env.ctx, productDir: env.scope.product.dir, codeRoot: codeRoot(env.scope.product), degraded: env.degraded }, { q, history: body.history, lanes: body.lanes }, { signal: ac.signal, wfUrl })) send(e.type, e); }
      catch (e) { send('error', { type: 'error', lane: 'retrieve', message: String(e) }); }
      try { ctrl.close(); } catch { /* closed */ }
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
}
```

- [ ] **Step 2: Add `wye ask`** in `bin/wye.js` after `'ask-search'`:

```js
  async ask() {
    const q = pos.slice(1).join(' ') || (await readStdin()); if (!q.trim()) die('wye ask "<question>" [--fast | --deep] [--json]');
    const lanes = flags.fast ? ['fast'] : flags.deep ? ['deep'] : ['fast', 'deep'];
    const r = await fetch(`${WF_URL}/api/${product()}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, lanes }) });
    if (!r.ok) die(`ask → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const res = { fast: '', deep: '', citations: new Map(), cut: false, errors: [] };
    const show = !flags.json; let section = '';
    const head = s => { if (show && section !== s) { section = s; process.stdout.write(`\n\n## ${s}\n`); } };
    let buf = '';
    for await (const d of r.body) {
      buf += Buffer.from(d).toString('utf8'); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = block.split('\n').find(l => l.startsWith('data: ')); if (!data) continue;
        const e = JSON.parse(data.slice(6));
        if (e.type === 'fast.delta') { head('Answer'); res.fast += e.text; if (show) process.stdout.write(e.text); }
        else if (e.type === 'found') { res.citations.set(e.citation.n, e.citation); if (show) process.stderr.write(`  · found [${e.citation.n}] ${e.citation.ref}\n`); }
        else if (e.type === 'step') { if (show) process.stderr.write(`  … ${e.text}\n`); }
        else if (e.type === 'deep.delta') { head('Deeper answer'); res.deep += e.text; if (show) process.stdout.write(e.text); }
        else if (e.type === 'fast.done' || e.type === 'deep.done') { for (const c of e.citations) res.citations.set(c.n, c); if (e.cut) res.cut = true; }
        else if (e.type === 'error') { res.errors.push(e); if (show) process.stderr.write(`  ! ${e.lane}: ${e.message}\n`); }
      }
    }
    const cites = [...res.citations.values()].sort((a, b) => a.n - b.n);
    if (flags.json) return out({ fast: res.fast, deep: res.deep, citations: cites, cut: res.cut, errors: res.errors });
    if (res.cut) console.log('\n\n(the deep search was cut short at its limit)');
    console.log(`\n\n## Sources\n${cites.map(c => `[${c.n}] ${c.ref}${c.href ? `  ${WF_URL}${c.href}` : ''}`).join('\n')}`);
  },
```

- [ ] **Step 3: Add the skill hints.** In `skills/wye-agent/SKILL.md` and `skills/wye-context/SKILL.md`, in the list of read commands, add:

```markdown
- `wye ask "<question>"` — a cited answer from the product's knowledge, documents, code and sessions (fast answer, then a deeper one); `wye ask-search "<words>" --json` for the ranked passages alone. Use it first for "what do we know about X" / "why is Y like this".
```

- [ ] **Step 4: Verify against the dev server**

Run: `curl -sN -X POST localhost:3456/api/wye/ask -H 'content-type: application/json' -d '{"q":"a"}' -w '%{http_code}\n'`
Expected: `422`.

Run: `WYE_PRODUCT=wye wye ask "why is search a panel and not a rail entry?"`
Expected: `## Answer` streams within ~10 s citing `[n]`; `… Searching …` and `· found [n] …` lines appear on stderr while the deep lane runs; `## Deeper answer` follows; `## Sources` lists `decision:wf2.rail-fewer-entries` among them.

Run: `WYE_PRODUCT=wye timeout 3 wye ask "how does the parse cache work?" ; sleep 2; pgrep -fl "claude -p.*include-partial" || echo "no stray claude"`
Expected: `no stray claude` (the abort killed both children).

- [ ] **Step 5: Typecheck and commit**

```bash
cd packages/web && npx tsc --noEmit && cd ../..
git add "packages/web/src/app/api/[product]/ask/route.ts" bin/wye.js skills/wye-agent/SKILL.md skills/wye-context/SKILL.md
git commit -m "ask: /api/<p>/ask streams both lanes; wye ask; agents told to ask first"
```

---

### Task 10: Client-side question detection and the event reducer

**Files:**
- Create: `packages/web/src/lib/ask/question.ts`, `packages/web/src/lib/ask/reducer.ts`
- Test: `packages/web/src/lib/ask/question.test.ts`, `packages/web/src/lib/ask/reducer.test.ts`

**Interfaces:**
- Consumes: `AskEvent`, `Citation` (Task 1).
- Produces:
  - `isQuestion(q: string): boolean`
  - `type AskState = { q: string; fast: string; deep: string; fastDone: boolean; deepDone: boolean; cut: boolean; thin: boolean; step: string; found: Citation[]; cites: Record<number, Citation>; errors: { lane: string; message: string }[]; done: boolean }`
  - `initialAsk(q: string): AskState`
  - `askReducer(s: AskState, e: AskEvent): AskState`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/web/src/lib/ask/question.test.ts
import { describe, it, expect } from 'vitest';
import { isQuestion } from './question';
describe('isQuestion', () => {
  it.each(['why did we drop invites', 'How does search work', 'is login done?', 'what owns req:a', 'invites?', 'can agents propose'])('yes: %s', q => expect(isQuestion(q)).toBe(true));
  it.each(['invite email', 'req:wf2.ui.search', 'page: login', 'why', ''])('no: %s', q => expect(isQuestion(q)).toBe(false));
});
```

```ts
// packages/web/src/lib/ask/reducer.test.ts
import { describe, it, expect } from 'vitest';
import { askReducer, initialAsk } from './reducer';
import type { AskEvent, Citation } from './types';

const c = (n: number, ref: string): Citation => ({ n, ref, source: 'node', title: ref, href: null, snippet: '' });
describe('askReducer', () => {
  it('accumulates both answers, found sources and citations', () => {
    const evs: AskEvent[] = [
      { type: 'results', hits: [] }, { type: 'fast.delta', text: 'A [1]' }, { type: 'step', text: 'Searching' },
      { type: 'found', citation: c(2, 'lib/x.ts:1-9') }, { type: 'found', citation: c(2, 'lib/x.ts:1-9') },
      { type: 'fast.done', citations: [c(1, 'req:a')] }, { type: 'deep.delta', text: 'B [2]' }, { type: 'deep.done', citations: [c(2, 'lib/x.ts:1-9')], cut: true }, { type: 'done' },
    ];
    const s = evs.reduce(askReducer, initialAsk('q?'));
    expect(s).toMatchObject({ fast: 'A [1]', deep: 'B [2]', fastDone: true, deepDone: true, cut: true, done: true, step: '' });
    expect(s.found.map(f => f.n)).toEqual([2]);
    expect(Object.keys(s.cites)).toEqual(['1', '2']);
  });
  it('marks a thin fast answer and strips the marker', () => {
    const s = [{ type: 'fast.delta', text: 'Not in the sources.\nTHIN' }, { type: 'fast.done', citations: [] }].reduce((a, e) => askReducer(a, e as AskEvent), initialAsk('q'));
    expect(s.thin).toBe(true); expect(s.fast).toBe('Not in the sources.');
  });
  it('records lane errors', () => {
    const s = askReducer(initialAsk('q'), { type: 'error', lane: 'deep', message: 'boom' });
    expect(s.errors).toEqual([{ lane: 'deep', message: 'boom' }]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd packages/web && npx vitest run src/lib/ask/question.test.ts src/lib/ask/reducer.test.ts`

- [ ] **Step 3: Implement**

```ts
// packages/web/src/lib/ask/question.ts
// Typing a question in ⌘F asks it (decision:wf2.ask-in-search-panel): it ends with "?", or it starts with a question
// word and has at least one more word. Client-safe.
const QW = /^(why|how|what|who|whom|whose|when|where|which|does|do|did|is|are|was|were|can|could|should|would|will|has|have)\b/i;
export function isQuestion(q: string): boolean {
  const t = q.trim(); if (t.length < 3) return false;
  if (t.endsWith('?')) return true;
  return QW.test(t) && t.split(/\s+/).length >= 2;
}
```

```ts
// packages/web/src/lib/ask/reducer.ts
// The panel's view of one question: the stream of AskEvents folded into what it shows. Client-safe.
import type { AskEvent, Citation } from './types';

export type AskState = { q: string; fast: string; deep: string; fastDone: boolean; deepDone: boolean; cut: boolean; thin: boolean; step: string; found: Citation[]; cites: Record<number, Citation>; errors: { lane: string; message: string }[]; done: boolean };
export const initialAsk = (q: string): AskState => ({ q, fast: '', deep: '', fastDone: false, deepDone: false, cut: false, thin: false, step: '', found: [], cites: {}, errors: [], done: false });
const withCites = (s: AskState, cs: Citation[]) => { const cites = { ...s.cites }; for (const c of cs) cites[c.n] = c; return cites; };

export function askReducer(s: AskState, e: AskEvent): AskState {
  switch (e.type) {
    case 'fast.delta': return { ...s, fast: s.fast + e.text };
    case 'fast.done': { const thin = /\n?\s*THIN\s*$/.test(s.fast); return { ...s, fastDone: true, thin, fast: s.fast.replace(/\n?\s*THIN\s*$/, '').trim(), cites: withCites(s, e.citations) }; }
    case 'step': return { ...s, step: e.text };
    case 'found': return s.found.some(f => f.n === e.citation.n) ? s : { ...s, found: [...s.found, e.citation], cites: withCites(s, [e.citation]) };
    case 'deep.delta': return { ...s, deep: s.deep + e.text };
    case 'deep.done': return { ...s, deepDone: true, step: '', cut: !!e.cut, cites: withCites(s, e.citations) };
    case 'error': return { ...s, errors: [...s.errors, { lane: e.lane, message: e.message }], ...(e.lane === 'deep' ? { deepDone: true, step: '' } : e.lane === 'fast' ? { fastDone: true } : {}) };
    case 'done': return { ...s, done: true, step: '' };
    default: return s;
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd packages/web && npx vitest run src/lib/ask/question.test.ts src/lib/ask/reducer.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/ask/{question,reducer}.ts packages/web/src/lib/ask/{question,reducer}.test.ts
git commit -m "ask: question detection and the panel's event reducer"
```

---

### Task 11: The ⌘F panel

**Files:**
- Create: `packages/web/src/components/search/useAsk.ts`, `packages/web/src/components/search/AnswerView.tsx`, `packages/web/src/components/search/SourceChips.tsx`
- Modify (rewrite): `packages/web/src/components/SearchPanel.tsx`
- Modify: `packages/web/src/app/globals.css` (append after the existing `.search-*` rules)
- Modify: `data/products/wye/projects/v2/docs/requirements-shell.md` — `then:wf2.ui.search` text gains the answer (via `wye doc write`, see memory "decisions-go-into-wye")

**Interfaces:**
- Consumes: `/api/<p>/search` (Task 6), `/api/<p>/ask` (Task 9), `isQuestion`, `askReducer`, `initialAsk` (Task 10), `Hit`, `Citation`, `Source` (Task 1); existing `usePeek`, `KindPill`, `EmbeddedCard`, `CodeView`, `docRoute`.
- Produces: `useAsk(product): { state: AskState | null; history: {q,a}[]; ask(q: string): void; reset(): void }`; `<AnswerView text cites onCite />`; `<SourceChips items onPick />`.

- [ ] **Step 1: `useAsk`** — POST + a stream reader (EventSource cannot POST)

```ts
// packages/web/src/components/search/useAsk.ts
'use client';
import { useCallback, useRef, useState } from 'react';
import { askReducer, initialAsk, type AskState } from '@/lib/ask/reducer';
import type { AskEvent } from '@/lib/ask/types';

// One question at a time per panel: asking again, or reset, aborts the one in flight (the server kills both lanes).
export function useAsk(product: string) {
  const [state, setState] = useState<AskState | null>(null);
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
  const ac = useRef<AbortController | null>(null);
  const last = useRef<AskState | null>(null); last.current = state;
  const ask = useCallback((q: string) => {
    ac.current?.abort(); const c = new AbortController(); ac.current = c;
    const prev = last.current;   // the answered question becomes context for the follow-up
    const h = prev?.fastDone && prev.fast ? [...history, { q: prev.q, a: prev.fast }].slice(-3) : history;
    setHistory(h); setState(initialAsk(q));
    (async () => {
      try {
        const r = await fetch(`/api/${product}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, history: h }), signal: c.signal });
        if (!r.ok || !r.body) { setState(s => s && askReducer(s, { type: 'error', lane: 'retrieve', message: `ask failed (${r.status})` })); return; }
        const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); const d = block.split('\n').find(l => l.startsWith('data: ')); if (d) { const e = JSON.parse(d.slice(6)) as AskEvent; setState(s => s && askReducer(s, e)); } }
        }
      } catch (e) { if (!c.signal.aborted) setState(s => s && askReducer(s, { type: 'error', lane: 'retrieve', message: String(e) })); }
    })();
  }, [product, history]);
  const reset = useCallback(() => { ac.current?.abort(); setState(null); setHistory([]); }, []);
  return { state, history, ask, reset };
}
```

- [ ] **Step 2: `AnswerView` and `SourceChips`**

```tsx
// packages/web/src/components/search/AnswerView.tsx
'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '@/lib/ask/types';

// An answer with its [n] citations as buttons: hover previews the source, click opens it.
export function AnswerView({ text, cites, onCite, onHover }: { text: string; cites: Record<number, Citation>; onCite: (c: Citation) => void; onHover: (c: Citation) => void }) {
  const md = text.replace(/\[(\d+)\]/g, (m, n) => cites[Number(n)] ? `[${n}](#cite-${n})` : m);
  return (
    <div className="ask-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => {
        const n = href?.startsWith('#cite-') ? Number(href.slice(6)) : 0; const c = n ? cites[n] : undefined;
        return c ? <button type="button" className="ask-cite" title={c.title} onMouseEnter={() => onHover(c)} onClick={() => onCite(c)}>{n}</button> : <a href={href}>{children}</a>;
      } }}>{md}</ReactMarkdown>
    </div>
  );
}
```

```tsx
// packages/web/src/components/search/SourceChips.tsx
'use client';
import type { Citation } from '@/lib/ask/types';

const LABEL: Record<Citation['source'], string> = { node: 'block', doc: 'doc', code: 'code', session: 'session' };
// The sources the deep lane has opened so far, in the order it found them.
export function SourceChips({ items, onPick, onHover }: { items: Citation[]; onPick: (c: Citation) => void; onHover: (c: Citation) => void }) {
  if (!items.length) return null;
  return (
    <div className="ask-found">
      <span className="muted">Sources found</span>
      {items.map(c => (
        <button key={c.n} type="button" className={`ask-chip ask-chip-${c.source}`} title={c.snippet || c.ref} onMouseEnter={() => onHover(c)} onClick={() => onPick(c)}>
          <b>{c.n}</b> <span className="muted">{LABEL[c.source]}</span> {c.title.length > 40 ? c.title.slice(0, 40) + '…' : c.title}
        </button>))}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `SearchPanel.tsx`.** Keep the `kind:` prefix behaviour by passing node-only search with a kind filter client-side; keep ⌘Enter; Enter or a question asks.

```tsx
// packages/web/src/components/SearchPanel.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { KindPill } from './Pills';
import { EmbeddedCard } from './EmbeddedCard';
import { CodeView } from './CodeView';
import { AnswerView } from './search/AnswerView';
import { SourceChips } from './search/SourceChips';
import { useAsk } from './search/useAsk';
import { isQuestion } from '@/lib/ask/question';
import type { Citation, Hit, Source } from '@/lib/ask/types';

// The search panel (req:wf2.ui.search, decision:wf2.ask-in-search-panel): ⌘F from anywhere. Typing ranks passages from
// the product's blocks, documents, code and sessions — no model. Enter, or a question, asks: the fast answer streams
// with [n] citations, the sources the deep search opens appear as it works, and its deeper answer follows (open by
// itself when the fast one says the sources were thin). ⌘Enter opens the highlighted hit; follow-ups keep the thread.
const TABS: { key: Source | 'all'; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'node', label: 'Blocks' }, { key: 'doc', label: 'Docs' }, { key: 'code', label: 'Code' }, { key: 'session', label: 'Sessions' }];
type Pick = { source: Source; ref: string };

export function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { product } = usePeek(); const router = useRouter();
  const [q, setQ] = useState(''); const [tab, setTab] = useState<Source | 'all'>('all');
  const [hits, setHits] = useState<Hit[]>([]); const [degraded, setDegraded] = useState(''); const [sel, setSel] = useState(0);
  const [preview, setPreview] = useState<Pick | null>(null); const [showDeep, setShowDeep] = useState(false);
  const { state, ask, reset } = useAsk(product);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => input.current?.select(), 0); else { reset(); setQ(''); setHits([]); } }, [open, reset]);
  // typing → /search, debounced; a `kind:` prefix searches blocks of that kind
  const kind = useMemo(() => q.match(/^([a-z][a-z-]*):\s+(.*)$/)?.[1] ?? '', [q]);   // `req: stop`, `page: login` — the space keeps `req:x.y` a plain search
  useEffect(() => {
    const text = kind ? q.slice(kind.length + 1).trim() : q.trim(); if (text.length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ q: text, limit: '40' }); const src = kind === 'page' ? 'doc' : kind ? 'node' : tab === 'all' ? '' : tab; if (src) sp.set('source', src);
      fetch(`/api/${product}/search?${sp}`).then(r => r.json()).then((j: { hits?: Hit[]; degraded?: string }) => {
        const hs = (j.hits ?? []).filter(h => !kind || kind === 'page' || h.ref.startsWith(kind + ':'));
        setHits(hs); setDegraded(j.degraded ?? ''); setSel(0);
      }).catch(() => setHits([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q, tab, kind, product]);
  useEffect(() => { if (state?.fastDone && state.thin) setShowDeep(true); }, [state?.fastDone, state?.thin]);
  const go = (href: string | null, p?: Pick) => { if (href) { router.push(href); onClose(); } else if (p) setPreview(p); };
  const openCite = (c: Citation) => go(c.href, { source: c.source, ref: c.ref });
  const submit = () => { if (q.trim().length >= 3) { setShowDeep(false); ask(q.trim()); setQ(''); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(hits.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if ((e.metaKey || e.ctrlKey) && hits[sel]) go(hits[sel].href, hits[sel]); else submit(); }
  };
  if (!open) return null;
  const cur: Pick | null = preview ?? (hits[sel] ? { source: hits[sel].source, ref: hits[sel].ref } : null);
  const openAll = () => { const sp = new URLSearchParams(); if (q.trim()) sp.set('q', q.trim()); router.push(`/${product}/search?${sp}`); onClose(); };
  return (
    <div className="search-veil" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="search-panel" role="dialog" aria-label="Search">
        <input ref={input} className="search-in" value={q} onChange={e => { setQ(e.target.value); setPreview(null); }} onKeyDown={onKey}
          placeholder={state ? 'Ask a follow-up…' : 'Search or ask — blocks, docs, code, sessions'} autoFocus />
        {q && isQuestion(q) && !state && <div className="ask-hint muted">Enter to ask</div>}
        {state && (
          <section className="ask-box" aria-live="polite">
            <div className="ask-head"><b>{state.q}</b>
              <span className="muted"> · fast {state.fastDone ? '✓' : '…'} · deep {state.deepDone ? (state.cut ? 'stopped at its limit' : '✓') : state.step || 'working…'}</span></div>
            {state.fast ? <AnswerView text={state.fast} cites={state.cites} onCite={openCite} onHover={c => setPreview({ source: c.source, ref: c.ref })} /> : !state.fastDone && <p className="muted">Writing an answer…</p>}
            <SourceChips items={state.found} onPick={openCite} onHover={c => setPreview({ source: c.source, ref: c.ref })} />
            {state.deep && (showDeep
              ? <div className="ask-deep"><div className="muted">Deeper answer</div><AnswerView text={state.deep} cites={state.cites} onCite={openCite} onHover={c => setPreview({ source: c.source, ref: c.ref })} /></div>
              : <button type="button" className="ask-more" onClick={() => setShowDeep(true)}>▸ Deeper answer {state.deepDone ? '(ready)' : '(writing…)'}</button>)}
            {state.errors.length > 0 && !state.fast && !state.deep && state.done && <p className="muted">Couldn’t write an answer — the sources are below.</p>}
          </section>)}
        <div className="search-tabs">{TABS.map(t => <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}{degraded && <span className="muted"> · keyword search only</span>}</div>
        <div className="search-body">
          <ul className="search-hits">
            {hits.map((h, i) => (
              <li key={h.id} className={i === sel ? 'on' : ''} onMouseEnter={() => { setSel(i); setPreview(null); }} onClick={() => go(h.href, h)}>
                <div className="search-hit-head">{h.source === 'node' ? <KindPill kind={h.ref.split(':')[0]} /> : <span className={`ask-src ask-src-${h.source}`}>{h.source}</span>}<span className="search-hit-title">{h.title}</span></div>
                <div className="search-hit-snip muted">{h.via ? `via ${h.via} · ` : ''}{h.text.replace(/\s+/g, ' ').slice(0, 140)}</div>
              </li>))}
            {q.trim().length >= 2 && !hits.length && <li className="muted search-none">Nothing matches — Enter asks anyway.</li>}
          </ul>
          <div className="search-preview">{cur ? (cur.source === 'node' ? <EmbeddedCard id={cur.ref} /> : cur.source === 'code' ? <CodeView file={cur.ref.replace(/-\d+$/, '')} /> : <PassagePreview hit={hits.find(h => h.ref === cur.ref)} cite={state?.found.find(f => f.ref === cur.ref)} />) : <p className="muted">Type to search; <b>Enter</b> asks. <b>⌘Enter</b> opens the highlighted hit.</p>}</div>
        </div>
        <div className="search-foot muted">↑↓ move · Enter ask · ⌘Enter open · <button type="button" className="link" onClick={openAll}>Open as blocks</button> · Esc close</div>
      </div>
    </div>
  );
}
function PassagePreview({ hit, cite }: { hit?: Hit; cite?: Citation }) {
  const title = hit?.title ?? cite?.title ?? ''; const text = hit?.text ?? cite?.snippet ?? '';
  return <div className="ask-passage"><b>{title}</b><p>{text}</p>{(hit?.href ?? cite?.href) && <a href={(hit?.href ?? cite?.href)!}>Open</a>}</div>;
}
```

- [ ] **Step 4: Styles** — append to `globals.css` after the last `.search-` rule (use the existing colour tokens in that file; check them with `grep -n -- '--' packages/web/src/app/globals.css | head -30` and substitute the matching names for `--muted`, `--line`, `--accent`, `--bg-soft`):

```css
.ask-hint { padding: 2px 14px; font-size: 12px; }
.ask-box { padding: 10px 14px; border-bottom: 1px solid var(--line); max-height: 45vh; overflow: auto; }
.ask-head { font-size: 13px; margin-bottom: 6px; }
.ask-answer { font-size: 14px; line-height: 1.55; }
.ask-answer p { margin: 0 0 8px; }
.ask-cite { font-size: 11px; padding: 0 5px; margin: 0 1px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg-soft); cursor: pointer; vertical-align: super; line-height: 1.4; }
.ask-cite:hover { border-color: var(--accent); }
.ask-found { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; font-size: 12px; }
.ask-chip { border: 1px solid var(--line); border-radius: 12px; padding: 2px 8px; background: none; cursor: pointer; font-size: 12px; animation: ask-in .2s ease-out; }
.ask-chip:hover { border-color: var(--accent); }
@keyframes ask-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
.ask-more { background: none; border: none; padding: 4px 0; cursor: pointer; color: var(--accent); }
.ask-deep { border-top: 1px dashed var(--line); margin-top: 8px; padding-top: 8px; }
.search-tabs { display: flex; gap: 4px; padding: 6px 14px; font-size: 12px; }
.search-tabs button { background: none; border: 1px solid transparent; border-radius: 10px; padding: 1px 8px; cursor: pointer; }
.search-tabs button.on { border-color: var(--line); background: var(--bg-soft); }
.ask-src { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); margin-right: 6px; }
.ask-passage p { white-space: pre-wrap; font-size: 13px; }
```

- [ ] **Step 5: Typecheck, then drive it in a browser** (playwright-core, per the UI-test notes: set `localStorage wf-rail=1` before `goto`). Script at `/private/tmp/claude-501/.../scratchpad/ask-ui.mjs`, run from `packages/web`:

```js
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage();
await p.addInitScript(() => localStorage.setItem('wf-rail', '1'));
await p.goto('http://localhost:3456/wye'); await p.keyboard.press('Meta+f');
await p.fill('.search-in', 'search panel'); await p.waitForSelector('.search-hits li >> nth=0');
console.log('results:', await p.locator('.search-hits li').count(), 'tabs:', await p.locator('.search-tabs button').count());
await p.fill('.search-in', 'why is search a panel and not a rail entry?'); await p.keyboard.press('Enter');
await p.waitForSelector('.ask-answer', { timeout: 30000 }); console.log('fast answer shown');
await p.waitForSelector('.ask-chip', { timeout: 90000 }); console.log('found chips:', await p.locator('.ask-chip').count());
await p.waitForSelector('text=Deeper answer', { timeout: 150000 }); console.log('deep ready');
await p.locator('.ask-cite').first().click(); await p.waitForTimeout(800); console.log('after cite:', p.url());
await p.screenshot({ path: '/private/tmp/claude-501/-Users-alex-Projects-waterfall/668a92f5-1ade-4ae4-8233-c55f59bd6c29/scratchpad/ask.png' }); await b.close();
```

Expected: results > 0, tabs = 5, fast answer shown, ≥1 found chip while `.ask-head` still says `deep …`, deep ready, the cite navigates to a `/wye/…/d/…#…` URL (or shows a code preview for a code cite).

Run: `cd packages/web && npx tsc --noEmit && node /private/tmp/claude-501/-Users-alex-Projects-waterfall/668a92f5-1ade-4ae4-8233-c55f59bd6c29/scratchpad/ask-ui.mjs`

- [ ] **Step 6: Update the requirement text in wye.** `wye doc wye/v2/requirements-shell > $SCRATCH/shell.md`, replace the `then:wf2.ui.search` line with:

```markdown
  - then:wf2.ui.search a search panel opens over the page; what they type ranks passages from the product's blocks, documents, code and sessions, grouped by tabs (All, Blocks, Docs, Code, Sessions), and a kind first (`page: login`, `req:`) narrows to blocks of that kind; the highlighted hit is previewed beside the list, ↑↓ move, ⌘Enter or a click opens it; Enter — or typing a question — asks: an answer streams above the results with numbered citations that open the exact block, passage, code lines or session, the sources a deeper search opens appear while it works, and its deeper answer follows; a follow-up keeps the thread; "Open as blocks" opens the Search page with every hit as blocks
```

then `wye doc write wye/v2/requirements-shell --file $SCRATCH/shell.md && wye build --root data/products/wye && wye get req:wf2.ui.search`.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/search packages/web/src/components/SearchPanel.tsx packages/web/src/app/globals.css data/products/wye/projects/v2/docs/requirements-shell.md
git commit -m "ask: the ⌘F panel answers — results by source, streaming cited answer, live found sources, deeper answer, follow-ups"
```

---

### Task 12: Retrieval eval

**Files:**
- Create: `eval/ask/questions.json`, `eval/ask/recall.js`
- Modify: `eval/cli.js` (one `if (sub === 'ask')` branch beside `judge`) and its help comment

**Interfaces:**
- Consumes: `GET /api/<p>/search` (Task 6).
- Produces: `wye eval ask [--product wye] [--k 10] [--json]` → recall@k per question and overall; exit 2 if overall < 0.6.

- [ ] **Step 1: Write the questions.** 15 entries; each `expect` lists refs that a correct answer must draw on (any one counts as a hit). Confirm every ref exists with `wye get <id>` (nodes) or `ls` (code) before saving. Start from these five and add ten more of the same shape, drawn from `wye search` over decisions in the `wye` product (`wye search decision: --root data/products/wye | head -40`):

```json
[
  { "q": "why is search a panel and not an entry in the rail?", "expect": ["decision:wf2.rail-fewer-entries"] },
  { "q": "what does ⌘F do?", "expect": ["req:wf2.ui.search", "packages/web/src/components/SearchPanel.tsx"] },
  { "q": "can an agent open a prompt request?", "expect": ["constraint:wf2.pr-is-the-persons"] },
  { "q": "where do Goals and Work pages come from?", "expect": ["decision:wf2.views-are-pages"] },
  { "q": "how does ask run the fast and the deep answer?", "expect": ["decision:wf2.ask-two-lanes", "packages/web/src/lib/ask/ask.ts"] }
]
```

- [ ] **Step 2: Write the runner**

```js
// eval/ask/recall.js
'use strict';
// `wye eval ask` (decision:wf2.ask-two-lanes): the retriever's recall@k over eval/ask/questions.json — a question
// scores 1 when any expected ref (a node id, or a code path prefix) is among the top k passages, with graph expansion
// on as the fast lane uses it. Exit 2 when overall recall < 0.6.
const fs = require('fs'); const path = require('path');
const WF_URL = process.env.WYE_URL || process.env.WF_URL || 'http://localhost:3456';
async function run({ product, k = 10 }) {
  const qs = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8')); const rows = [];
  for (const { q, expect } of qs) {
    const r = await fetch(`${WF_URL}/api/${product}/search?${new URLSearchParams({ q, limit: String(k), expand: '1' })}`); const j = await r.json();
    const refs = (j.hits || []).slice(0, k).map(h => h.ref);
    const hit = expect.some(e => refs.some(ref => ref === e || ref.startsWith(e + ':')));
    rows.push({ q, hit, top: refs.slice(0, 3) });
  }
  return { k, recall: rows.filter(r => r.hit).length / rows.length, rows };
}
function print(r, { json } = {}) {
  if (json) return console.log(JSON.stringify(r, null, 2));
  for (const x of r.rows) console.log(`${x.hit ? '✓' : '✗'} ${x.q}${x.hit ? '' : `\n    top: ${x.top.join(', ')}`}`);
  console.log(`\nrecall@${r.k}: ${(r.recall * 100).toFixed(0)}% (${r.rows.filter(x => x.hit).length}/${r.rows.length})`);
}
module.exports = { run, print };
```

In `eval/cli.js`, add to the help comment `//   wye eval ask [--k 10] [--json]   the Ask retriever's recall@k over eval/ask/questions.json` and the branch:

```js
    if (sub === 'ask') { const a = require('./ask/recall'); const r = await a.run({ product, k: Number(flags.k || 10) }); a.print(r, { json: !!flags.json }); return r.recall < 0.6 ? 2 : 0; }
```

- [ ] **Step 3: Run it**

Run: `WYE_PRODUCT=wye wye eval ask`
Expected: a ✓/✗ line per question and `recall@10: NN%`. If below 60 %, look at the `top:` of the misses before tuning anything (the BM25 column weights in `store.bm25`, the RRF `k`, the expansion verbs) — report the number either way.

- [ ] **Step 4: Commit**

```bash
git add eval/ask eval/cli.js
git commit -m "ask: wye eval ask — retriever recall@k over a question set"
```

---

## Self-review notes

- Spec §1 index → Tasks 2–4; §2 retriever → Task 5; §3 engine → Tasks 7–9; §4 panel → Tasks 10–11; §5 CLI/agents → Tasks 6, 9; §6 errors → Review Focus + Tasks 4, 8, 9, 11; §7 testing → unit tests per task, stubbed `claude` (Tasks 7–8), UI script (Task 11), eval (Task 12); §8 delivery → A1 = Tasks 1–6, A2 = 7–9, A3 = 10–12.
- Names used across tasks: `Store`, `syncScope`, `getStore`, `ensureFresh`, `codeRoot`, `retrieve`, `RetrieveCtx`, `hrefFor`, `Citations`, `citationOf`, `citedNumbers`, `runFast`, `runDeep`, `resolveRef`, `askEnv`, `askReducer`, `initialAsk`, `isQuestion` — each defined once, signatures as in its task's Interfaces block.
- `env.ts`'s `askEnv` returns `{ scope, ctx, degraded }`; the `/ask` route builds `AskEnvLike` from it (`productDir: scope.product.dir`, `codeRoot(scope.product)`).
