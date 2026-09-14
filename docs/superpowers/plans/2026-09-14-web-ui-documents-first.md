# Web UI documents-first rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `packages/web` so a project opens on its documents, documents read as text with node cards and smart tags, a peek panel shows any tagged node without leaving the page, and the graph is a secondary view.

**Architecture:** Server components read the markdown files and `graph.json`; a pure `lib/doc.ts` splits a document into prose and yaml chunks and computes tree, outline and links; `react-markdown` renders prose with a remark plugin that turns ids into `SmartTag` components; a client `PeekProvider` holds the compact node index and the open panel, fetching details from one API route.

**Tech Stack:** Next.js 16.3 (existing), react-markdown 10.1, remark-gfm 4.0, unist-util-visit 5.1, vitest 5.

**Spec:** `docs/superpowers/specs/2026-09-14-web-ui-documents-first-design.md`

## Global Constraints

- Routes: `/p/<project>` → redirect to main root document; `/p/<project>/d/<doc>`; `/p/<project>/n/<id>` → redirect to `/p/<project>/d/<doc>#n-<id>`; `/p/<project>/graph` unchanged.
- Card prose keys: when, then, unless, statement, description, purpose, context, choice, consequences, intent, q, note.
- Tag: kind dot + slug (req drops `req:`), dashed when undefined; hover title/status; click opens peek panel.
- Document tree from `has` edges between module nodes; main root = most sub-documents, tie → title.
- Keep `lib/graph.ts` free of node: imports; file reads only in `lib/load.ts`.
- Commit after every task with the session attribution lines.

## File structure

```
packages/web/src/lib/doc.ts               splitDocument, outline, documentTree, linkedDocuments, nodeIndex, docSlug
packages/web/src/lib/doc.test.ts
packages/web/src/lib/remark-tags.ts       remark plugin: id tokens → link nodes href "#tag:<id>"
packages/web/src/lib/remark-tags.test.ts
packages/web/src/lib/load.ts              + loadMarkdown(project, file)
packages/web/src/lib/projects.ts          + rootPath on Project (repo root) so files resolve
packages/web/src/components/PeekProvider.tsx   context: index, open(id), close(); renders PeekPanel
packages/web/src/components/PeekPanel.tsx      fetches /api node details, shows card + relations + actions
packages/web/src/components/SmartTag.tsx       inline tag (client), uses PeekProvider
packages/web/src/components/NodeCard.tsx       card from a yaml chunk + node
packages/web/src/components/Document.tsx       renders segments: markdown (react-markdown) + cards
packages/web/src/components/DocTree.tsx        rail: tree + outline of the open doc
packages/web/src/components/Search.tsx         client search over index + docs + headings
packages/web/src/app/api/p/[project]/node/[id]/route.ts
packages/web/src/app/p/[project]/layout.tsx    rail = DocTree + Search + Graph link; PeekProvider wraps content
packages/web/src/app/p/[project]/page.tsx      redirect to main root doc
packages/web/src/app/p/[project]/d/[doc]/page.tsx
packages/web/src/app/p/[project]/n/[id]/page.tsx   redirect
removed: components/Sidebar.tsx, components/NodeBody.tsx, components/Relations.tsx (folded into PeekPanel/NodeCard)
```

---

### Task 1: `lib/doc.ts` — split, outline, tree, links, index

**Files:**
- Create: `packages/web/src/lib/doc.ts`, `packages/web/src/lib/doc.test.ts`
- Modify: `packages/web/src/lib/projects.ts` (add `rootPath`), `packages/web/src/lib/load.ts` (add `loadMarkdown`)

**Interfaces (produces):**
```ts
export type Segment = { type: 'markdown'; text: string } | { type: 'yaml'; raw: string; chunks: { id: string | null; body: string }[] };
export interface SplitDoc { frontmatter: Record<string, string>; segments: Segment[] }
export function docSlug(file: string): string                      // 'docs/context-graph/prd.md' → 'prd'
export function splitDocument(md: string): SplitDoc
export function outline(md: string): { level: 2 | 3; text: string; slug: string }[]
export function headingSlug(text: string): string                  // lowercase, non-alnum → '-', trimmed
export interface DocNode { module: GraphNode; file: string; slug: string; title: string; children: DocNode[] }
export function documentTree(g: GraphData): { roots: DocNode[]; main: DocNode | null; byFile: Map<string, DocNode> }
export function linkedDocuments(g: GraphData, idx: GraphIndex, file: string): { file: string; slug: string; title: string; count: number }[]
export type IndexEntry = { id: string; kind: string; title: string; status: string; defined: boolean; file: string };
export function nodeIndex(g: GraphData): Record<string, IndexEntry>  // excludes field nodes
```

- [ ] **Step 1: Tests**

`packages/web/src/lib/doc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { docSlug, splitDocument, outline, headingSlug, documentTree, linkedDocuments, nodeIndex } from './doc';
import { indexGraph, type GraphData } from './graph';

const md = `---
node: module:m
title: Module M
status: proposed
---

# Module M

Intro text mentions rule:r1.

## 1. Section

\`\`\`yaml
- id: req:m.a
  title: A
  when: x
  then: y
- id: req:m.b
  title: B
\`\`\`

### 1.1 Sub

| op | args | does |
|---|---|---|
| op:o | a | does it |

\`\`\`yaml
just: config
\`\`\`
`;

describe('splitDocument', () => {
  it('parses frontmatter and alternates markdown and yaml segments', () => {
    const d = splitDocument(md);
    expect(d.frontmatter.title).toBe('Module M');
    expect(d.frontmatter.node).toBe('module:m');
    expect(d.segments.map(s => s.type)).toEqual(['markdown', 'yaml', 'markdown', 'yaml']);
    const y = d.segments[1]; if (y.type !== 'yaml') throw new Error();
    expect(y.chunks.map(c => c.id)).toEqual(['req:m.a', 'req:m.b']);
    expect(y.chunks[0].body).toBe('id: req:m.a\ntitle: A\nwhen: x\nthen: y');
    const cfg = d.segments[3]; if (cfg.type !== 'yaml') throw new Error();
    expect(cfg.chunks).toEqual([{ id: null, body: 'just: config' }]);
  });
  it('drops the frontmatter from the first markdown segment', () => {
    const d = splitDocument(md);
    const first = d.segments[0]; if (first.type !== 'markdown') throw new Error();
    expect(first.text.startsWith('# Module M')).toBe(true);
  });
});

describe('outline', () => {
  it('lists ## and ### headings with slugs', () => {
    expect(outline(md)).toEqual([{ level: 2, text: '1. Section', slug: '1-section' }, { level: 3, text: '1.1 Sub', slug: '1-1-sub' }]);
    expect(headingSlug('R. Requirements (behaviour)')).toBe('r-requirements-behaviour');
  });
});

const n = (id: string, file: string, title = id, extra: Partial<{ defined: boolean; status: string }> = {}) => ({ id, kind: id.split(':')[0], title, status: extra.status ?? '', section: '', subsection: '', body: '', defined: extra.defined ?? true, file, line: 1 });
const g: GraphData = {
  generatedAt: '', fieldIndex: {},
  files: ['docs/context-graph/project.md', 'docs/context-graph/prd.md', 'docs/context-graph/old.md'],
  modules: [
    { id: 'module:wf2', title: 'Project', file: 'docs/context-graph/project.md', verified: '', sourceRoots: [] },
    { id: 'module:wf2-prd', title: 'PRD', file: 'docs/context-graph/prd.md', verified: '', sourceRoots: [] },
    { id: 'module:old', title: 'Old', file: 'docs/context-graph/old.md', verified: '', sourceRoots: [] },
  ],
  nodes: [
    n('module:wf2', 'docs/context-graph/project.md', 'Project'), n('module:wf2-prd', 'docs/context-graph/prd.md', 'PRD'), n('module:old', 'docs/context-graph/old.md', 'Old'),
    n('req:wf2.a', 'docs/context-graph/prd.md', 'A', { status: 'proposed' }), n('rule:r', 'docs/context-graph/old.md', 'R'),
    n('field:e.x', 'docs/context-graph/old.md'), n('test:t', '', 't', { defined: false }),
  ],
  edges: [
    { from: 'module:wf2', to: 'module:wf2-prd', verb: 'has' },
    { from: 'req:wf2.a', to: 'rule:r', verb: 'satisfied-by' },
    { from: 'req:wf2.a', to: 'test:t', verb: 'verified-by' },
  ],
};

describe('documentTree', () => {
  it('builds roots from module has-edges and picks the main root', () => {
    const t = documentTree(g);
    expect(t.roots.map(r => r.slug)).toEqual(['project', 'old']);
    expect(t.roots[0].children.map(c => c.slug)).toEqual(['prd']);
    expect(t.main?.slug).toBe('project');
    expect(t.byFile.get('docs/context-graph/prd.md')?.title).toBe('PRD');
  });
});

describe('linkedDocuments', () => {
  it('lists other files reached by edges in either direction with counts', () => {
    const idx = indexGraph(g);
    expect(linkedDocuments(g, idx, 'docs/context-graph/prd.md')).toEqual([{ file: 'docs/context-graph/old.md', slug: 'old', title: 'Old', count: 1 }]);
    expect(linkedDocuments(g, idx, 'docs/context-graph/old.md')).toEqual([{ file: 'docs/context-graph/prd.md', slug: 'prd', title: 'PRD', count: 1 }]);
  });
});

describe('nodeIndex', () => {
  it('indexes every non-field node compactly', () => {
    const ix = nodeIndex(g);
    expect(ix['req:wf2.a']).toEqual({ id: 'req:wf2.a', kind: 'req', title: 'A', status: 'proposed', defined: true, file: 'docs/context-graph/prd.md' });
    expect(ix['field:e.x']).toBeUndefined();
    expect(ix['test:t'].defined).toBe(false);
  });
  it('docSlug strips directory and extension', () => { expect(docSlug('docs/context-graph/dev-design.md')).toBe('dev-design'); });
});
```

- [ ] **Step 2: Run, expect failure** — `npm run test --workspace=packages/web` → "Cannot find module './doc'".

- [ ] **Step 3: Implement `doc.ts`**

```ts
import type { GraphData, GraphIndex, GraphNode } from './graph';

export type Segment = { type: 'markdown'; text: string } | { type: 'yaml'; raw: string; chunks: { id: string | null; body: string }[] };
export interface SplitDoc { frontmatter: Record<string, string>; segments: Segment[] }
export interface DocNode { module: GraphNode; file: string; slug: string; title: string; children: DocNode[] }
export type IndexEntry = { id: string; kind: string; title: string; status: string; defined: boolean; file: string };

export function docSlug(file: string): string { return file.split('/').pop()!.replace(/\.md$/, ''); }

export function headingSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function splitDocument(md: string): SplitDoc {
  const frontmatter: Record<string, string> = {};
  let body = md;
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    body = md.slice(fm[0].length);
    for (const line of fm[1].split('\n')) { const m = line.match(/^([\w-]+):\s*(.*)$/); if (m) frontmatter[m[1]] = m[2].trim(); }
  }
  const segments: Segment[] = [];
  const lines = body.split('\n');
  let buf: string[] = []; let inYaml = false; let inOther = false; let yamlBuf: string[] = [];
  const flushMd = () => { const text = buf.join('\n').trim(); if (text) segments.push({ type: 'markdown', text }); buf = []; };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inYaml) { inYaml = false; segments.push({ type: 'yaml', raw: yamlBuf.join('\n'), chunks: chunkYaml(yamlBuf) }); yamlBuf = []; continue; }
      if (inOther) { inOther = false; buf.push(line); continue; }
      if (/^```ya?ml/.test(line)) { flushMd(); inYaml = true; continue; }
      inOther = true; buf.push(line); continue;
    }
    if (inYaml) yamlBuf.push(line); else buf.push(line);
  }
  if (inYaml) segments.push({ type: 'yaml', raw: yamlBuf.join('\n'), chunks: chunkYaml(yamlBuf) });
  flushMd();
  return { frontmatter, segments };
}

function chunkYaml(lines: string[]): { id: string | null; body: string }[] {
  const chunks: { id: string | null; lines: string[] }[] = [];
  let cur: { id: string | null; lines: string[] } | null = null;
  for (const raw of lines) {
    const idm = raw.match(/^\s*-?\s*id:\s*([a-z-]+:[A-Za-z0-9_./#\-]+)/);
    if (idm) { if (cur) chunks.push(cur); cur = { id: idm[1], lines: [raw] }; continue; }
    if (/^---\s*$/.test(raw)) { if (cur) chunks.push(cur); cur = null; continue; }
    if (!cur) cur = { id: null, lines: [] };
    cur.lines.push(raw);
  }
  if (cur) chunks.push(cur);
  return chunks.map(c => {
    const first = c.lines[0]?.replace(/^\s*-\s*id:/, 'id:').trim() ?? '';
    const rest = c.lines.slice(1); const nonEmpty = rest.filter(l => l.trim());
    const indent = nonEmpty.length ? Math.min(...nonEmpty.map(l => l.match(/^\s*/)![0].length)) : 0;
    const body = (c.id ? [first, ...rest.map(l => l.slice(indent))] : c.lines).join('\n').trim();
    return { id: c.id, body };
  }).filter(c => c.body);
}

export function outline(md: string): { level: 2 | 3; text: string; slug: string }[] {
  const out: { level: 2 | 3; text: string; slug: string }[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(##|###) (.+)$/);
    if (m) out.push({ level: m[1].length as 2 | 3, text: m[2].trim(), slug: headingSlug(m[2]) });
  }
  return out;
}

export function documentTree(g: GraphData): { roots: DocNode[]; main: DocNode | null; byFile: Map<string, DocNode> } {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const nodes = new Map<string, DocNode>();
  for (const m of g.modules) {
    const module = byId.get(m.id)!;
    nodes.set(m.id, { module, file: m.file, slug: docSlug(m.file), title: m.title || module.title, children: [] });
  }
  const hasParent = new Set<string>();
  for (const e of g.edges) {
    if (e.verb !== 'has' || !nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to) continue;
    nodes.get(e.from)!.children.push(nodes.get(e.to)!); hasParent.add(e.to);
  }
  const roots = [...nodes.values()].filter(d => !hasParent.has(d.module.id));
  const main = [...roots].sort((a, b) => b.children.length - a.children.length || a.title.localeCompare(b.title))[0] ?? null;
  const byFile = new Map([...nodes.values()].map(d => [d.file, d]));
  return { roots, main, byFile };
}

export function linkedDocuments(g: GraphData, idx: GraphIndex, file: string) {
  const { byFile } = documentTree(g);
  const counts = new Map<string, number>();
  for (const e of g.edges) {
    const a = idx.byId.get(e.from), b = idx.byId.get(e.to);
    if (!a || !b || !a.defined || !b.defined) continue;
    const other = a.file === file && b.file !== file ? b.file : b.file === file && a.file !== file ? a.file : null;
    if (!other || !byFile.has(other)) continue;
    counts.set(other, (counts.get(other) ?? 0) + 1);
  }
  return [...counts].map(([f, count]) => ({ file: f, slug: byFile.get(f)!.slug, title: byFile.get(f)!.title, count })).sort((x, y) => y.count - x.count);
}

export function nodeIndex(g: GraphData): Record<string, IndexEntry> {
  const out: Record<string, IndexEntry> = {};
  for (const n of g.nodes) { if (n.kind === 'field') continue; out[n.id] = { id: n.id, kind: n.kind, title: n.title, status: n.status, defined: n.defined, file: n.file }; }
  return out;
}
```

Add to `projects.ts`: `rootPath: REPO_ROOT` on each default project and a third `=`-separated field for env entries (`name=title=graphPath=rootPath`). Add to `load.ts`:

```ts
export async function loadMarkdown(rootPath: string, file: string): Promise<string> {
  return readFile(path.join(rootPath, file), 'utf8');
}
```
(with `import path from 'node:path'`).

- [ ] **Step 4: Run tests** → all pass (14 + 8).
- [ ] **Step 5: Commit** — `git commit -m "web: document splitter, outline, document tree, linked documents, node index"`.

---

### Task 2: remark plugin for smart tags

**Files:** `packages/web/src/lib/remark-tags.ts`, `packages/web/src/lib/remark-tags.test.ts`; install `react-markdown@^10.1.0 remark-gfm@^4.0.1 unist-util-visit@^5.1.0 mdast-util-to-string@^4.0.0`.

**Interfaces:** `export default function remarkTags(): (tree: Root) => void` — replaces every id token (per `ID_RE`, cleaned with `cleanId`) in `text` and `inlineCode` nodes with a `link` node `{ url: '#tag:<id>', children: [{type:'text', value: <original token>}] }`, skipping text already inside a `link`.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkTags from './remark-tags';

const links = (md: string) => {
  const tree = unified().use(remarkParse).use(remarkTags).parse(md);
  unified().use(remarkTags).runSync(tree);
  const out: { url: string; text: string }[] = [];
  const walk = (n: any) => { if (n.type === 'link') out.push({ url: n.url, text: n.children.map((c: any) => c.value).join('') }); (n.children ?? []).forEach(walk); };
  walk(tree); return out;
};

describe('remarkTags', () => {
  it('turns ids in text into tag links', () => {
    expect(links('See rule:r1 and req:m.a.b, then page:web/node.')).toEqual([
      { url: '#tag:rule:r1', text: 'rule:r1' }, { url: '#tag:req:m.a.b', text: 'req:m.a.b' }, { url: '#tag:page:web/node', text: 'page:web/node' }]);
  });
  it('turns backticked ids into tag links and strips test methods', () => {
    expect(links('run `test:core-writer#patch-body`')).toEqual([{ url: '#tag:test:core-writer', text: 'test:core-writer#patch-body' }]);
  });
  it('leaves existing links alone and ignores words that are not ids', () => {
    expect(links('[rule:r1](http://x) and status: proposed')).toEqual([{ url: 'http://x', text: 'rule:r1' }]);
  });
});
```

`unified` and `remark-parse` come with react-markdown; add them as devDependencies explicitly (`unified@^11`, `remark-parse@^11`) so the test imports resolve.

- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement**

```ts
import { visit } from 'unist-util-visit';
import type { Root, Text, InlineCode, Link, PhrasingContent } from 'mdast';
import { ID_RE, cleanId } from './ids';

export default function remarkTags() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (parent.type === 'link') return;
      if (node.type !== 'text' && node.type !== 'inlineCode') return;
      const value = (node as Text | InlineCode).value;
      const re = new RegExp(ID_RE.source, 'g');
      const parts: PhrasingContent[] = []; let last = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(value))) {
        if (m.index > last) parts.push({ type: 'text', value: value.slice(last, m.index) });
        const link: Link = { type: 'link', url: '#tag:' + cleanId(m[0]), children: [{ type: 'text', value: m[0] }] };
        parts.push(link); last = m.index + m[0].length;
      }
      if (!parts.length) return;
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
      (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
```

- [ ] **Step 4: Run tests** → pass. Add `@types/mdast@^4` as devDependency if types are missing.
- [ ] **Step 5: Commit** — `"web: remark plugin turning ids into smart-tag links"`.

---

### Task 3: PeekProvider, SmartTag, PeekPanel, node API route

**Files:** `components/PeekProvider.tsx`, `components/SmartTag.tsx`, `components/PeekPanel.tsx`, `components/NodeCard.tsx`, `app/api/p/[project]/node/[id]/route.ts`; styles appended to `globals.css`.

**Interfaces:**
- `PeekProvider({ project, index, children })` — context `{ project, index: Record<string, IndexEntry>, open(id), close(), openId }`; renders children then `<PeekPanel />`.
- `useIndexEntry(id)`, `usePeek()` hooks.
- `SmartTag({ id, label? })` — client; renders `<a href="#tag:id">` with dot, label, title tooltip; onClick → `open(id)`.
- `NodeCard({ id, body, project, entry, defaultOpenYaml?: false })` — server-safe (no hooks); uses `parseBody`; renders heading/pills/prose/properties; property values through `<Linkified>` which now renders `SmartTag` for ids.
- Route: `GET /api/p/:project/node/:id` → `{ node: GraphNode, relations: { out: [verb, id[]][], inc: [verb, id[]][] }, doc: { slug, title } | null }`.

- [ ] **Step 1: Route**

```ts
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/projects';
import { indexGraph, relations } from '@/lib/graph';
import { loadGraph } from '@/lib/load';
import { documentTree } from '@/lib/doc';

export async function GET(_req: Request, { params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id: raw } = await params; const id = decodeURIComponent(raw);
  const p = getProject(project); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const node = idx.byId.get(id); if (!node) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { byFile } = documentTree(g); const d = node.file ? byFile.get(node.file) : undefined;
  return NextResponse.json({ node, relations: relations(idx, id), doc: d ? { slug: d.slug, title: d.title } : null });
}
```

- [ ] **Step 2: PeekProvider + SmartTag**

```tsx
'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { IndexEntry } from '@/lib/doc';
import { PeekPanel } from './PeekPanel';

interface Ctx { project: string; index: Record<string, IndexEntry>; openId: string | null; open: (id: string) => void; close: () => void }
const PeekCtx = createContext<Ctx | null>(null);

export function PeekProvider({ project, index, children }: { project: string; index: Record<string, IndexEntry>; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useCallback((id: string) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [close]);
  return <PeekCtx.Provider value={{ project, index, openId, open, close }}>{children}<PeekPanel /></PeekCtx.Provider>;
}
export function usePeek(): Ctx { const c = useContext(PeekCtx); if (!c) throw new Error('PeekProvider missing'); return c; }
```

`SmartTag.tsx`:

```tsx
'use client';
import { usePeek } from './PeekProvider';
import { kindOf } from '@/lib/ids';

export function SmartTag({ id, label }: { id: string; label?: string }) {
  const { index, open } = usePeek();
  const e = index[id]; const kind = kindOf(id);
  const text = label ?? (kind === 'req' ? id.slice(4) : id);
  const tip = e ? `${e.title}${e.status ? ' · ' + e.status : ''}${e.defined ? '' : ' · referenced only'}` : id;
  return (
    <a href={`#tag:${id}`} className={`tag k-${kind} ${e && !e.defined ? 'stub' : ''} ${e?.status ? 's-' + e.status : ''}`} title={tip}
       onClick={ev => { ev.preventDefault(); open(id); }}>
      <i />{text}
    </a>
  );
}
```

Update `IdLink.tsx`: `Linkified` renders `<SmartTag id label>` instead of `IdLink`; keep `IdLink` for plain links (used by DocTree). `Linkified` stays a server-safe component (it only renders the client `SmartTag`).

- [ ] **Step 3: NodeCard**

```tsx
import { parseBody, type BodyRow } from '@/lib/graph';
import type { IndexEntry } from '@/lib/doc';
import { Linkified } from './IdLink';
import { KindPill, StatusPill, StubPill } from './Pills';

const SENTENCE: Record<string, string> = { when: 'When', then: 'then', unless: 'unless' };
const PARAGRAPH = new Set(['statement', 'description', 'purpose', 'context', 'choice', 'consequences', 'intent', 'q', 'note', 'options']);
const HIDE = new Set(['title', 'status']);

export function NodeCard({ id, body, entry, showYaml = false }: { id: string; body: string; entry?: IndexEntry; showYaml?: boolean }) {
  const rows = parseBody(body);
  const get = (k: string) => rows.find(r => r.key === k)?.value;
  const kind = id.split(':')[0];
  const title = get('title') || entry?.title || id;
  const status = get('status')?.split(/\s+#/)[0].trim() || entry?.status || '';
  const sentence = ['when', 'then', 'unless'].filter(k => get(k)).map(k => `${SENTENCE[k]} ${get(k)}`).join(', ');
  const paras = rows.filter(r => PARAGRAPH.has(r.key));
  const props = rows.filter(r => !PARAGRAPH.has(r.key) && !HIDE.has(r.key) && !(r.key in SENTENCE));
  return (
    <article className="card" id={`n-${id}`}>
      <header><KindPill kind={kind} /><StatusPill status={status} />{entry && <StubPill defined={entry.defined} />}<code className="cid">{id}</code></header>
      <h4>{title !== id ? title : id}</h4>
      {sentence && <p className="sentence"><Linkified text={sentence + (sentence.endsWith('.') ? '' : '.')} project="" /></p>}
      {paras.map(r => <p key={r.key} className="para"><span className="pk">{r.key}</span> <Linkified text={r.value} project="" /></p>)}
      {props.length > 0 && <dl className="strip">{props.map(r => <div key={r.key}><dt>{r.key}</dt><dd><Linkified text={r.value} project="" /></dd></div>)}</dl>}
      {showYaml ? <pre className="yaml">{body}</pre> : <details className="yaml"><summary>yaml</summary><pre>{body}</pre></details>}
    </article>
  );
}
```

(`Linkified`'s `project` prop is no longer needed once it renders `SmartTag`; remove it from its signature and call sites.)

- [ ] **Step 4: PeekPanel**

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePeek } from './PeekProvider';
import { NodeCard } from './NodeCard';
import { SmartTag } from './SmartTag';
import type { GraphNode } from '@/lib/graph';

type Details = { node: GraphNode; relations: { out: [string, string[]][]; inc: [string, string[]][] }; doc: { slug: string; title: string } | null };

export function PeekPanel() {
  const { project, index, openId, close } = usePeek();
  const [d, setD] = useState<Details | null>(null);
  useEffect(() => {
    if (!openId) { setD(null); return; }
    let live = true;
    fetch(`/api/p/${project}/node/${encodeURIComponent(openId)}`).then(r => r.ok ? r.json() : null).then(j => { if (live) setD(j); });
    return () => { live = false; };
  }, [openId, project]);
  if (!openId) return null;
  const entry = index[openId];
  return (
    <aside className="peek" role="dialog" aria-label={openId}>
      <div className="peek-bar">
        {d?.doc ? <Link href={`/p/${project}/d/${d.doc.slug}#n-${encodeURIComponent(openId)}`} onClick={close}>Go to definition · {d.doc.title}</Link> : <span className="muted">{entry?.defined ? '…' : 'referenced only, no definition'}</span>}
        <Link href={`/p/${project}/graph?focus=${encodeURIComponent(openId)}&preset=Mechanics`}>Show in graph</Link>
        <button onClick={close}>Close</button>
      </div>
      {d ? <NodeCard id={openId} body={d.node.body} entry={entry} /> : <p className="muted">Loading {openId}…</p>}
      {d && (
        <div className="rels">
          {d.relations.out.map(([verb, ids]) => <div key={'o' + verb}><h5>{verb} →</h5><div className="tags">{ids.map(i => <SmartTag key={i} id={i} />)}</div></div>)}
          {d.relations.inc.map(([verb, ids]) => <div key={'i' + verb}><h5>← {verb} by</h5><div className="tags">{ids.map(i => <SmartTag key={i} id={i} />)}</div></div>)}
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Styles** (append):

```css
.tag { display: inline-flex; align-items: center; gap: 5px; padding: 0 7px 0 5px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--surface); font: 500 12px/1.7 var(--font-m); color: var(--ink); text-decoration: none; vertical-align: baseline; white-space: nowrap; max-width: 100%; }
.tag i { width: 7px; height: 7px; border-radius: 50%; background: var(--k-other); flex: none; }
.tag.k-req i { background: var(--k-req); } .tag.k-rule i { background: var(--k-rule); } .tag.k-entity i { background: var(--k-entity); } .tag.k-op i { background: var(--k-op); } .tag.k-page i { background: var(--k-page); } .tag.k-action i { background: var(--k-action); } .tag.k-gate i, .tag.k-flag i { background: var(--k-gate); } .tag.k-state i { background: var(--k-state); } .tag.k-value i { background: var(--k-value); } .tag.k-test i, .tag.k-ui-test i { background: var(--k-test); } .tag.k-drift i { background: var(--k-drift); } .tag.k-field i { background: var(--k-field); } .tag.k-decision i { background: var(--k-decision); } .tag.k-question i { background: var(--k-question); } .tag.k-module i, .tag.k-product i { background: var(--k-module); }
.tag.stub { border-style: dashed; color: var(--muted); }
.tag:hover { border-color: var(--accent); background: var(--accent-soft); }
.card { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); padding: 12px 16px; margin: 12px 0; scroll-margin-top: 16px; }
.card:target { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.card header { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .card header .cid { margin-left: auto; font-size: 11px; color: var(--muted); }
.card h4 { margin: 6px 0 4px; font-size: 16px; }
.card .sentence { margin: 4px 0 6px; max-width: 75ch; } .card .para { margin: 4px 0; max-width: 75ch; color: var(--ink-2); } .card .pk { font: 500 11px var(--font-m); color: var(--muted); text-transform: uppercase; margin-right: 6px; }
.card .strip { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 8px 0 0; font-size: 13px; } .card .strip dt { font: 500 11px/1.9 var(--font-m); color: var(--muted); } .card .strip dd { margin: 0; min-width: 0; word-break: break-word; }
.card details.yaml { margin-top: 8px; } .card details.yaml summary { font: 11px var(--font-m); color: var(--muted); cursor: pointer; } .card pre { background: var(--sunk); border-radius: 8px; padding: 10px; font-size: 12px; white-space: pre-wrap; word-break: break-word; margin: 6px 0 0; }
.peek { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100%); background: var(--ground); border-left: 1px solid var(--line); box-shadow: -8px 0 30px rgba(0,0,0,.15); overflow-y: auto; padding: 12px 16px 40px; z-index: 30; }
.peek-bar { display: flex; gap: 12px; align-items: center; font-size: 13px; margin-bottom: 8px; } .peek-bar button { margin-left: auto; background: none; border: 1px solid var(--line-2); border-radius: 6px; padding: 4px 10px; color: var(--ink); cursor: pointer; font: inherit; }
.rels h5 { margin: 12px 0 4px; font: 600 11px var(--font-m); text-transform: uppercase; letter-spacing: .05em; color: var(--muted); } .tags { display: flex; flex-wrap: wrap; gap: 5px; }
```

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` clean. Commit `"web: peek panel, smart tags, node card, node API route"`.

---

### Task 4: Document page and renderer

**Files:** `components/Document.tsx`, `app/p/[project]/d/[doc]/page.tsx`; styles.

- [ ] **Step 1: Document.tsx** (server component)

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkTags from '@/lib/remark-tags';
import { headingSlug, type SplitDoc, type IndexEntry } from '@/lib/doc';
import { NodeCard } from './NodeCard';
import { SmartTag } from './SmartTag';
import type { ReactNode } from 'react';

const text = (c: ReactNode): string => Array.isArray(c) ? c.map(text).join('') : typeof c === 'string' ? c : (c && typeof c === 'object' && 'props' in c ? text((c as { props: { children?: ReactNode } }).props.children) : '');

export function Document({ doc, index }: { doc: SplitDoc; index: Record<string, IndexEntry> }) {
  const components = {
    a: ({ href, children }: { href?: string; children?: ReactNode }) => href?.startsWith('#tag:') ? <SmartTag id={href.slice(5)} label={text(children)} /> : <a href={href}>{children}</a>,
    h2: ({ children }: { children?: ReactNode }) => <h2 id={headingSlug(text(children))}>{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 id={headingSlug(text(children))}>{children}</h3>,
    table: ({ children }: { children?: ReactNode }) => <div className="tbl"><table>{children}</table></div>,
  };
  return (
    <div className="doc">
      {doc.segments.map((s, i) => s.type === 'markdown'
        ? <ReactMarkdown key={i} remarkPlugins={[remarkGfm, remarkTags]} components={components}>{s.text}</ReactMarkdown>
        : s.chunks.some(c => c.id && index[c.id]?.defined)
          ? <div key={i} className="cards">{s.chunks.map((c, j) => c.id && index[c.id] ? <NodeCard key={c.id + j} id={c.id} body={c.body} entry={index[c.id]} /> : <pre key={j} className="yaml">{c.body}</pre>)}</div>
          : <pre key={i} className="yaml">{s.raw}</pre>)}
    </div>
  );
}
```

- [ ] **Step 2: page.tsx**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { loadGraph, loadMarkdown } from '@/lib/load';
import { indexGraph } from '@/lib/graph';
import { documentTree, linkedDocuments, nodeIndex, splitDocument } from '@/lib/doc';
import { Document } from '@/components/Document';
import { StatusPill } from '@/components/Pills';

export default async function DocPage({ params }: { params: Promise<{ project: string; doc: string }> }) {
  const { project, doc } = await params;
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const tree = documentTree(g);
  const d = [...tree.byFile.values()].find(x => x.slug === doc); if (!d) notFound();
  const md = await loadMarkdown(p.rootPath, d.file);
  const split = splitDocument(md);
  const index = nodeIndex(g);
  const linked = linkedDocuments(g, idx, d.file);
  const fm = split.frontmatter;
  return (
    <div className="page">
      <header className="doc-head">
        <div className="pills"><span className="pill k" style={{ background: 'var(--k-module)' }}>document</span><StatusPill status={fm.status ?? ''} /></div>
        <h1>{fm.title ?? d.title}</h1>
        <p className="sub">{d.file}{fm['last-verified'] && <> · verified {fm['last-verified']}</>}{fm.owner && <> · {fm.owner}</>}</p>
      </header>
      <Document doc={split} index={index} />
      {linked.length > 0 && (
        <section className="linked"><h2>Linked documents</h2>
          <ul>{linked.map(l => <li key={l.file}><Link href={`/p/${p.name}/d/${l.slug}`}>{l.title}</Link> <span className="muted">{l.count} links</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Styles** (append): `.doc` typography (`max-width: 80ch`, h2 with top border, `.tbl` overflow-x, `pre.yaml`), `.doc-head`, `.linked`.

```css
.doc { max-width: 84ch; } .doc h2 { font-size: 20px; margin: 36px 0 10px; padding-top: 14px; border-top: 1px solid var(--line); } .doc h3 { font-size: 15px; margin: 24px 0 8px; font-family: var(--font-m); }
.doc p, .doc li { max-width: 75ch; } .doc .tbl { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); margin: 10px 0; } .doc table { border-collapse: collapse; font-size: 13px; min-width: 100%; } .doc th, .doc td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid var(--line); } .doc th { font: 600 11px var(--font-m); text-transform: uppercase; color: var(--muted); background: var(--sunk); }
.doc pre.yaml { background: var(--sunk); border-radius: 8px; padding: 10px; font-size: 12px; white-space: pre-wrap; } .doc :not(pre) > code { background: var(--sunk); padding: 1px 5px; border-radius: 4px; font-size: .92em; }
.doc-head .pills { display: flex; gap: 6px; margin-bottom: 6px; }
.linked { margin-top: 36px; padding-top: 14px; border-top: 1px solid var(--line); } .linked ul { padding-left: 18px; }
```

- [ ] **Step 4: Verify** `curl -s localhost:3456/p/waterfall/d/prd | grep -c 'class="card"'` ≥ 50. Commit `"web: document page rendering prose, cards and smart tags"`.

---

### Task 5: Rail (DocTree + Search), redirects, remove old pages

**Files:** `components/DocTree.tsx`, `components/Search.tsx`; rewrite `app/p/[project]/layout.tsx`, `app/p/[project]/page.tsx`, `app/p/[project]/n/[id]/page.tsx`; delete `components/Sidebar.tsx`, `components/NodeBody.tsx`, `components/Relations.tsx`; styles.

- [ ] **Step 1: DocTree (client, reads pathname to mark the open doc and show its outline)**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type TreeItem = { slug: string; title: string; children: TreeItem[]; outline: { level: 2 | 3; text: string; slug: string }[] };

export function DocTree({ project, roots }: { project: string; roots: TreeItem[] }) {
  const path = usePathname();
  const Item = ({ d, depth }: { d: TreeItem; depth: number }) => {
    const href = `/p/${project}/d/${d.slug}`; const on = path === href;
    return (
      <li>
        <Link href={href} className={`dt-row ${on ? 'on' : ''}`} style={{ paddingLeft: 10 + depth * 12 }}>{d.title}</Link>
        {on && d.outline.length > 0 && <ul className="dt-outline">{d.outline.filter(h => h.level === 2).map(h => <li key={h.slug}><a href={`#${h.slug}`} style={{ paddingLeft: 22 + depth * 12 }}>{h.text}</a></li>)}</ul>}
        {d.children.length > 0 && <ul>{d.children.map(c => <Item key={c.slug} d={c} depth={depth + 1} />)}</ul>}
      </li>
    );
  };
  return <ul className="dt">{roots.map(r => <Item key={r.slug} d={r} depth={0} />)}</ul>;
}
```

- [ ] **Step 2: Search (client)** — props `{ project, docs: {slug,title}[], headings: {doc,slug,text}[] }`, uses `usePeek().index` for nodes; input + results list (max 20): documents, headings, nodes (id or title contains query, defined first); node result → `router.push('/p/<project>/d/<docSlug(file)>#n-<id>')`; heading → `/d/<doc>#<slug>`.

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePeek } from './PeekProvider';
import { docSlug } from '@/lib/doc';

export function Search({ project, docs, headings }: { project: string; docs: { slug: string; title: string }[]; headings: { doc: string; slug: string; text: string }[] }) {
  const { index } = usePeek(); const router = useRouter();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return [];
    const out: { label: string; sub: string; href: string }[] = [];
    for (const d of docs) if (d.title.toLowerCase().includes(needle)) out.push({ label: d.title, sub: 'document', href: `/p/${project}/d/${d.slug}` });
    for (const h of headings) if (h.text.toLowerCase().includes(needle)) out.push({ label: h.text, sub: `heading · ${h.doc}`, href: `/p/${project}/d/${h.doc}#${h.slug}` });
    const nodes = Object.values(index).filter(e => e.id.toLowerCase().includes(needle) || e.title.toLowerCase().includes(needle)).sort((a, b) => Number(b.defined) - Number(a.defined) || a.id.localeCompare(b.id));
    for (const e of nodes.slice(0, 15)) out.push({ label: e.title || e.id, sub: e.id + (e.status ? ' · ' + e.status : ''), href: e.file ? `/p/${project}/d/${docSlug(e.file)}#n-${encodeURIComponent(e.id)}` : `/p/${project}/graph?focus=${encodeURIComponent(e.id)}` });
    return out.slice(0, 20);
  }, [needle, docs, headings, index, project]);
  return (
    <div className="search">
      <input type="search" placeholder="Search documents, headings, ids…" value={q} onChange={e => setQ(e.target.value)} />
      {hits.length > 0 && <ul className="hits">{hits.map((h, i) => <li key={i}><button onClick={() => { setQ(''); router.push(h.href); }}><span>{h.label}</span><small>{h.sub}</small></button></li>)}</ul>}
    </div>
  );
}
```

- [ ] **Step 3: Layout** — loads graph + every document's markdown (for outlines), builds `TreeItem[]` from `documentTree`, wraps content in `PeekProvider` with `nodeIndex(g)`, renders rail: title, `<Search>`, `<DocTree>`, a `Graph` link, node/req counts. `page.tsx` → `redirect('/p/<project>/d/<main.slug>')`. `n/[id]/page.tsx` → find node; if it has a file, `redirect('/p/<project>/d/<docSlug(file)>#n-<id>')`, else redirect to the graph focused on it.

- [ ] **Step 4: Delete** `Sidebar.tsx`, `NodeBody.tsx`, `Relations.tsx`; remove their CSS blocks (`.sb-*`, `.props`, `.rels h4`, `.chip` are replaced by `.dt-*`, `.card`, `.tags`). Keep `.shell`, `.content`, `.page`, pills, graph styles.

- [ ] **Step 5: Styles** (append):

```css
.rail { border-right: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; min-height: 0; }
.rail-head { padding: 14px 14px 10px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.rail-title { font-weight: 700; font-size: 17px; color: var(--ink); text-decoration: none; } .rail-sub { font: 11px var(--font-m); color: var(--muted); }
.search { position: relative; } .search input { width: 100%; padding: 7px 10px; border: 1px solid var(--line-2); border-radius: 8px; background: var(--ground); color: var(--ink); font: 13px var(--font-b); }
.hits { position: absolute; left: 0; right: 0; top: 100%; z-index: 20; margin: 4px 0 0; padding: 4px; list-style: none; background: var(--surface); border: 1px solid var(--line-2); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.15); max-height: 60dvh; overflow-y: auto; }
.hits button { width: 100%; text-align: left; background: none; border: 0; padding: 6px 8px; border-radius: 6px; color: var(--ink); font: 13px var(--font-b); display: flex; flex-direction: column; cursor: pointer; } .hits button:hover { background: var(--sunk); } .hits small { font: 11px var(--font-m); color: var(--muted); }
.rail-body { overflow-y: auto; padding: 8px 6px 40px; }
.dt, .dt ul { list-style: none; margin: 0; padding: 0; }
.dt-row { display: block; padding: 6px 10px; border-radius: 6px; color: var(--ink); text-decoration: none; font-size: 13px; } .dt-row:hover { background: var(--sunk); } .dt-row.on { background: var(--accent-soft); font-weight: 600; }
.dt-outline a { display: block; padding: 3px 10px; font-size: 12px; color: var(--ink-2); text-decoration: none; } .dt-outline a:hover { color: var(--ink); }
.rail-foot { padding: 8px 14px; border-top: 1px solid var(--line); font-size: 12px; display: flex; gap: 10px; }
```

- [ ] **Step 6: Typecheck, tests, browser** — root redirect lands on the project document; cards show; hover a tag shows title; click opens the peek panel; "Go to definition" from a `rule:` tag opens dev-design at the card (highlighted via `:target`); search "clerk" lists nodes and jumps; Linked documents listed; Graph link works. Commit `"web: documents-first rail, search, redirects; remove node page"`.

---

### Task 6: Record in the graph

- Update `page:web/sidebar` → describe the rail (documents tree + search), `page:web/node` → "document page" with cards, tags, peek panel (route `/p/<project>/d/<doc>`), component paths; add `rule:smart-tags` (source `packages/web/src/lib/remark-tags.ts`, verified-by `test:web-lib#remark-tags`) and `rule:document-tree` (source `packages/web/src/lib/doc.ts#documentTree`, verified-by `test:web-lib#doc`); update `req:wf2.ui` title/then to "documents first"; note in `req:wf2.ui.node-page` that the page is now the defining document with a peek panel; add cases to `test:web-lib`. Add the spec path to `project.md` frontmatter sources. Run `ctx build && ctx check` (0 errors), `npm test`, commit `"graph: record the documents-first UI"`.

## Self-review

- Spec coverage: IA (Task 1 tree + Task 5 rail/redirects), cards (Task 3 NodeCard + Task 4 Document), tags/hover/peek/go-to-definition/show-in-graph (Tasks 2–3), search (Task 5), linked documents (Tasks 1, 4), routes (Task 5), graph unchanged. Gap: none.
- Placeholders: Task 3 Step 5 and Task 4 Step 3 give full CSS; Task 5 Step 3 describes the layout without full code — acceptable because it composes components defined above with the same pattern as the existing layout; the executor writes it from the described props.
- Types: `IndexEntry`, `SplitDoc`, `TreeItem`, `Details` consistent across tasks; `Linkified` loses the `project` prop in Task 3 and all call sites (NodeCard) follow.
