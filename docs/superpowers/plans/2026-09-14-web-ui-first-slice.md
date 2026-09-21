# Web UI first slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js app (`packages/web`) that renders a registered project's context graph as a sidebar tree, a node page with properties and relations, and a React Flow mind map, read-only, from the `graph.json` that `ctx build` produces.

**Architecture:** Server components read `graph.json` from disk through one loader (`src/lib/graph.ts`) and pass plain data to client components. The graph view is a client component using React Flow with a dagre tree layout computed in a pure module (`src/lib/layout.ts`). No database, no writes, no SSE in this slice; routes already follow the spec (`/p/<project>/n/<id>`, `/p/<project>/graph?focus=<id>&preset=<name>`) so the server-backed phase can slot in without moving pages.

**Tech Stack:** Node 26, npm workspaces (pnpm is not installed), Next.js 16.3 (app router, TypeScript), React 19, @xyflow/react 12.11, @dagrejs/dagre 3.1, vitest 5 for pure modules.

**Spec:** `docs/superpowers/specs/2026-09-14-wye-v2-design.md` §7 (Web UI) and the graph nodes `req:wf2.ui`, `req:wf2.ui.sidebar`, `req:wf2.ui.node-page`, `req:wf2.ui.graph`, `rule:deep-links`, `rule:mindmap-layout`, `rule:prose-keys`, `rule:graph-presets` in `docs/context-graph/prd.md` and `dev-design.md`.

## Global Constraints

- Routes: `/p/<project>/n/<id>` for a node, `/p/<project>/graph?focus=<id>&preset=<name>` for the graph (rule:deep-links).
- Presets and their visible kinds/verbs are exactly those of rule:graph-presets: Requirements (req; refines), Mechanics (req, rule, entity, op, page, action, state, flag, gate, decision; structural verbs), Data (entity, field, value, flag, state; has, typed-as, refs, owns, embedded-in), Drift (nodes touching a drift node; contradicts), Everything.
- Mind map: focus node in the centre-left, `refines` and `has` edges laid out as a tree by dagre left-to-right, other structural verbs drawn as cross-links, `mentions` hidden unless preset is Everything (rule:mindmap-layout).
- Prose keys (rendered as paragraphs, not inline fields): purpose, note, notes, statement, description, context, consequences, intent, q, and any block scalar (`>` or `|`) (rule:prose-keys, value:prose-key).
- Works at 400px width; light and dark via `prefers-color-scheme`.
- Node ids are `kind:slug`; the id regex is the one in `lib/parse.js` plus `product`, `question`, `decision`.
- Pure modules (`src/lib/*.ts`) are unit-tested with vitest; components are verified in the browser for this slice.
- Commit after every task with the attribution lines from the session.

## File structure

```
package.json                       root: npm workspaces ["packages/*"], scripts test/dev
packages/web/package.json          next, react, @xyflow/react, @dagrejs/dagre, vitest, typescript
packages/web/next.config.ts
packages/web/tsconfig.json
packages/web/vitest.config.ts
packages/web/src/lib/ids.ts        ID_RE, kindOf(id), cleanId — one place for id syntax
packages/web/src/lib/projects.ts   registry: project name → graph.json path (env override)
packages/web/src/lib/graph.ts      loadGraph, indexGraph (byId/out/inc), sidebarTree, neighborhood, parseBody, relations
packages/web/src/lib/presets.ts    PRESETS, visibleSubgraph(graph, preset, focus)
packages/web/src/lib/layout.ts     layoutMindMap(nodes, edges, focus) → positioned nodes + typed edges
packages/web/src/lib/*.test.ts     vitest for each lib module, against a small inline fixture graph
packages/web/src/app/globals.css   tokens, light/dark, layout primitives
packages/web/src/app/layout.tsx    html shell
packages/web/src/app/page.tsx      redirects to the first project
packages/web/src/app/p/[project]/layout.tsx   sidebar + content grid; sidebar server-rendered
packages/web/src/app/p/[project]/page.tsx     project home: stats + requirement tree
packages/web/src/app/p/[project]/n/[id]/page.tsx  node page
packages/web/src/app/p/[project]/graph/page.tsx   graph page (server wrapper) → GraphView client
packages/web/src/components/Sidebar.tsx   tree + search (client, filters locally)
packages/web/src/components/Pills.tsx     kind/status pills
packages/web/src/components/IdLink.tsx    linkifies ids in text
packages/web/src/components/NodeBody.tsx  properties panel from parseBody
packages/web/src/components/Relations.tsx grouped by verb, both ways
packages/web/src/components/GraphView.tsx React Flow canvas, presets bar, side panel
```

---

### Task 1: Workspace and Next.js scaffold

**Files:**
- Modify: `package.json` (root)
- Create: `packages/web/package.json`, `packages/web/next.config.ts`, `packages/web/tsconfig.json`, `packages/web/vitest.config.ts`, `packages/web/src/app/layout.tsx`, `packages/web/src/app/page.tsx`, `packages/web/src/app/globals.css`, `packages/web/.gitignore`
- Modify: `.gitignore` (root, create if missing)

**Interfaces:**
- Produces: a runnable Next app on http://localhost:3000 and a `vitest` runner in `packages/web`.

- [ ] **Step 1: Root workspace**

Replace root `package.json` with:

```json
{
    "name": "wye",
    "version": "0.2.0",
    "description": "Product context graph: describe a system as requirements, entities, rules, ops and pages in markdown; query it as a graph; browse and edit it in a web app.",
    "private": true,
    "bin": { "ctx": "bin/ctx.js" },
    "workspaces": ["packages/*"],
    "scripts": {
        "test": "node test/smoke.js && npm run test --workspace=packages/web",
        "dev": "npm run dev --workspace=packages/web"
    },
    "engines": { "node": ">=18" },
    "license": "UNLICENSED"
}
```

- [ ] **Step 2: Web package**

`packages/web/package.json`:

```json
{
    "name": "@wye/web",
    "version": "0.2.0",
    "private": true,
    "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start",
        "test": "vitest run",
        "typecheck": "tsc --noEmit"
    },
    "dependencies": {
        "@dagrejs/dagre": "^3.1.1",
        "@xyflow/react": "^12.11.6",
        "next": "^16.3.5",
        "react": "^19.3.0",
        "react-dom": "^19.3.0"
    },
    "devDependencies": {
        "@types/node": "^24.0.0",
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        "typescript": "^5.9.0",
        "vitest": "^5.0.0"
    }
}
```

`packages/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';
const config: NextConfig = { reactStrictMode: true };
export default config;
```

`packages/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`packages/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

`packages/web/.gitignore`:

```
.next/
next-env.d.ts
```

Root `.gitignore` (create):

```
node_modules/
```

- [ ] **Step 3: Shell pages**

`packages/web/src/app/globals.css`:

```css
:root {
  --ground:#F5F7F4; --surface:#FFFFFF; --sunk:#ECEFEB; --ink:#1B1F1D; --ink-2:#4E5754; --muted:#7B847F; --line:#D8DED9; --line-2:#C4CBC5;
  --accent:#1F6F6B; --accent-ink:#FFFFFF; --accent-soft:#DDEEEC;
  --k-req:#C8612A; --k-rule:#2E6E9E; --k-entity:#3E8A57; --k-op:#7452B3; --k-page:#B5405F; --k-action:#D08A2E; --k-gate:#8C8A2A; --k-flag:#8C8A2A; --k-state:#1F8F8A; --k-value:#6C7A82; --k-test:#7A8C96; --k-ui-test:#7A8C96; --k-drift:#C93B3B; --k-module:#333A37; --k-product:#333A37; --k-field:#4E7F8C; --k-decision:#5B6FB5; --k-question:#B5405F; --k-other:#8A8F8C;
  --ok:#2F8F4E; --warn:#C48A12; --bad:#C93B3B;
  --font-b:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  --font-m:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground:#111413; --surface:#181C1A; --sunk:#1F2422; --ink:#ECEFEC; --ink-2:#BFC7C2; --muted:#8B948F; --line:#2A302D; --line-2:#3A423E;
    --accent:#5FBFB8; --accent-ink:#0F1A19; --accent-soft:#1B302E;
    --k-req:#E8834C; --k-rule:#5B9BD0; --k-entity:#63B47B; --k-op:#A182E0; --k-page:#E0688A; --k-action:#E5A64E; --k-gate:#BEBB55; --k-flag:#BEBB55; --k-state:#4FC1BB; --k-value:#98A7AF; --k-test:#9FB0BA; --k-ui-test:#9FB0BA; --k-drift:#EB6B6B; --k-module:#D3D8D5; --k-product:#D3D8D5; --k-field:#7FB3C2; --k-decision:#8FA1E6; --k-question:#E0688A; --k-other:#A0A5A2;
    --ok:#56B975; --warn:#E0AE3D; --bad:#EB6B6B;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--ground); color: var(--ink); font: 15px/1.5 var(--font-b); }
a { color: var(--accent); }
code, pre { font-family: var(--font-m); }
```

`packages/web/src/app/layout.tsx`:

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Waterfall' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`packages/web/src/app/page.tsx` (temporary; Task 4 replaces it with a redirect):

```tsx
export default function Home() {
  return <main style={{ padding: 24 }}>Waterfall web — scaffold ok</main>;
}
```

- [ ] **Step 4: Install and run**

Run: `npm install` (from repo root), then `npm run dev` in the background and `curl -s http://localhost:3000 | grep -o "scaffold ok"`.
Expected: `scaffold ok`. Stop the dev server.

Run: `npm run test --workspace=packages/web`
Expected: vitest reports "No test files found" and exits 0 (add `passWithNoTests: true` to the vitest config if it exits 1).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore packages/web
git commit -m "web: scaffold Next.js app in npm workspace"
```

---

### Task 2: Graph loader and indexes (`lib/ids.ts`, `lib/projects.ts`, `lib/graph.ts`)

**Files:**
- Create: `packages/web/src/lib/ids.ts`, `packages/web/src/lib/projects.ts`, `packages/web/src/lib/graph.ts`
- Test: `packages/web/src/lib/graph.test.ts`

**Interfaces:**
- Produces:
  - `KINDS: string[]`, `ID_RE: RegExp` (global), `kindOf(id: string): string`, `cleanId(tok: string): string` in `ids.ts`
  - `getProject(name: string): { name: string; title: string; graphPath: string } | undefined`, `listProjects()` in `projects.ts`
  - types `GraphNode { id, kind, title, status, section, subsection, body, defined, file, line, owner? }`, `GraphEdge { from, to, verb }`, `GraphData { generatedAt, modules, files, nodes, edges, fieldIndex }`
  - `loadGraph(graphPath: string): Promise<GraphData>` (reads the file each call; Next caches per request)
  - `indexGraph(g: GraphData): GraphIndex` where `GraphIndex { byId: Map<string, GraphNode>; out: Map<string, GraphEdge[]>; inc: Map<string, GraphEdge[]> }`
  - `sidebarTree(g: GraphData): ModuleGroup[]` where `ModuleGroup { module: GraphNode; file: string; sections: { title: string; nodes: GraphNode[] }[] }`
  - `neighborhood(idx: GraphIndex, id: string, depth: number, structuralOnly: boolean): Set<string>`
  - `parseBody(body: string): BodyRow[]` where `BodyRow { key: string; value: string; prose: boolean }`
  - `relations(idx: GraphIndex, id: string): { out: [verb, string[]][]; inc: [verb, string[]][] }`
  - `STRUCTURAL: Set<string>` (same list as `lib/parse.js`)
  - `PROSE_KEYS: Set<string>`

- [ ] **Step 1: ids.ts**

```ts
export const KINDS = ['req', 'rule', 'entity', 'value', 'state', 'op', 'page', 'action', 'gate', 'flag', 'test', 'ui-test', 'module', 'product', 'tool', 'setting', 'field', 'drift', 'question', 'decision'] as const;
export const ID_RE = new RegExp('\\b(' + KINDS.join('|') + '):([A-Za-z0-9_][A-Za-z0-9_./#\\-]*)', 'g');

export function cleanId(tok: string): string {
  let t = tok.replace(/[.,;:)\]]+$/, '');
  if (t.includes('|')) t = t.split('|')[0];
  if (/^(test|ui-test):/.test(t)) t = t.replace(/#.*$/, '');
  if (t.startsWith('setting:')) t = 'flag:' + t.slice(8);
  return t;
}
export function kindOf(id: string): string { return id.split(':')[0]; }
export function idsIn(text: string): string[] {
  const out: string[] = []; let m: RegExpExecArray | null; ID_RE.lastIndex = 0;
  while ((m = ID_RE.exec(text))) out.push(cleanId(m[0]));
  return out;
}
```

- [ ] **Step 2: projects.ts**

```ts
import path from 'node:path';

export interface Project { name: string; title: string; graphPath: string }

// Registry for this slice: one project per entry; WATERFALL_PROJECTS="name=title=/abs/path/graph.json;..." overrides.
const REPO_ROOT = path.resolve(process.cwd(), process.env.WATERFALL_REPO_ROOT ?? '../..');
const DEFAULT: Project[] = [
  { name: 'wye', title: 'Waterfall', graphPath: path.join(REPO_ROOT, 'docs/context-graph/_build/graph.json') },
];

export function listProjects(): Project[] {
  const env = process.env.WATERFALL_PROJECTS;
  if (!env) return DEFAULT;
  return env.split(';').filter(Boolean).map(entry => {
    const [name, title, graphPath] = entry.split('=');
    return { name, title: title || name, graphPath };
  });
}
export function getProject(name: string): Project | undefined {
  return listProjects().find(p => p.name === name);
}
```

- [ ] **Step 3: Failing tests for graph.ts**

`packages/web/src/lib/graph.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { indexGraph, sidebarTree, neighborhood, parseBody, relations, type GraphData } from './graph';

const fixture: GraphData = {
  generatedAt: '2026-09-14T00:00:00Z',
  modules: [{ id: 'module:m', title: 'M', file: 'docs/context-graph/m.md', verified: '', sourceRoots: ['.'] }],
  files: ['docs/context-graph/m.md'],
  fieldIndex: {},
  nodes: [
    { id: 'module:m', kind: 'module', title: 'M', status: '', section: '', subsection: '', body: 'id: module:m', defined: true, file: 'docs/context-graph/m.md', line: 1 },
    { id: 'req:m.a', kind: 'req', title: 'A', status: 'shipped', section: 'R. Requirements', subsection: 'R.1 Cap', body: 'id: req:m.a\ntitle: A\nwhen: x\nthen: y\nsatisfied-by: [rule:r1]', defined: true, file: 'docs/context-graph/m.md', line: 10 },
    { id: 'req:m.a.b', kind: 'req', title: 'B', status: 'proposed', section: 'R. Requirements', subsection: 'R.1 Cap', body: 'id: req:m.a.b\nrefines: req:m.a', defined: true, file: 'docs/context-graph/m.md', line: 20 },
    { id: 'rule:r1', kind: 'rule', title: 'R1', status: '', section: '6. Rules', subsection: '', body: 'id: rule:r1\nstatement: >\n  two lines\n  of prose\nsource: a.js:1', defined: true, file: 'docs/context-graph/m.md', line: 30 },
    { id: 'entity:e', kind: 'entity', title: 'E', status: '', section: '1. Entities', subsection: '', body: 'id: entity:e\nfields:\n  alpha: string', defined: true, file: 'docs/context-graph/m.md', line: 40 },
    { id: 'field:e.alpha', kind: 'field', title: 'alpha', status: '', section: '1. Entities', subsection: 'entity:e', body: 'on: entity:e', defined: true, file: 'docs/context-graph/m.md', line: 40, owner: 'entity:e' },
    { id: 'test:t', kind: 'test', title: 't', status: '', section: '', subsection: '', body: '', defined: false, file: '', line: 0 },
  ],
  edges: [
    { from: 'req:m.a', to: 'rule:r1', verb: 'satisfied-by' },
    { from: 'req:m.a.b', to: 'req:m.a', verb: 'refines' },
    { from: 'entity:e', to: 'field:e.alpha', verb: 'has' },
    { from: 'rule:r1', to: 'field:e.alpha', verb: 'mentions' },
    { from: 'req:m.a', to: 'test:t', verb: 'verified-by' },
  ],
};

describe('indexGraph', () => {
  it('builds byId, out and inc', () => {
    const idx = indexGraph(fixture);
    expect(idx.byId.get('req:m.a')?.title).toBe('A');
    expect(idx.out.get('req:m.a')?.map(e => e.verb)).toEqual(['satisfied-by', 'verified-by']);
    expect(idx.inc.get('req:m.a')?.[0].from).toBe('req:m.a.b');
  });
});

describe('sidebarTree', () => {
  it('groups defined nodes by module file and section, skipping fields and stubs', () => {
    const tree = sidebarTree(fixture);
    expect(tree).toHaveLength(1);
    expect(tree[0].module.id).toBe('module:m');
    expect(tree[0].sections.map(s => s.title)).toEqual(['R. Requirements', '1. Entities', '6. Rules']);
    expect(tree[0].sections[0].nodes.map(n => n.id)).toEqual(['req:m.a', 'req:m.a.b']);
    const all = tree[0].sections.flatMap(s => s.nodes.map(n => n.id));
    expect(all).not.toContain('field:e.alpha');
    expect(all).not.toContain('test:t');
  });
});

describe('neighborhood', () => {
  it('follows edges both ways to the given depth', () => {
    const idx = indexGraph(fixture);
    expect([...neighborhood(idx, 'rule:r1', 1, false)].sort()).toEqual(['field:e.alpha', 'req:m.a', 'rule:r1']);
    expect([...neighborhood(idx, 'rule:r1', 2, false)].sort()).toEqual(['entity:e', 'field:e.alpha', 'req:m.a', 'req:m.a.b', 'rule:r1', 'test:t']);
  });
  it('ignores mentions when structuralOnly', () => {
    const idx = indexGraph(fixture);
    expect([...neighborhood(idx, 'rule:r1', 1, true)].sort()).toEqual(['req:m.a', 'rule:r1']);
  });
});

describe('parseBody', () => {
  it('splits top-level keys, marks prose keys and block scalars, keeps nested text', () => {
    const rows = parseBody('id: req:m.a\ntitle: A\nwhen: x\nsatisfied-by: [rule:r1]\nnote: hazard\nstatement: >\n  two lines\n  of prose\nfields:\n  alpha: string   # note');
    expect(rows.map(r => r.key)).toEqual(['title', 'when', 'satisfied-by', 'note', 'statement', 'fields']);
    expect(rows.find(r => r.key === 'note')?.prose).toBe(true);
    expect(rows.find(r => r.key === 'when')?.prose).toBe(false);
    expect(rows.find(r => r.key === 'statement')).toEqual({ key: 'statement', value: 'two lines of prose', prose: true });
    expect(rows.find(r => r.key === 'fields')?.value).toBe('alpha: string   # note');
  });
});

describe('relations', () => {
  it('groups outgoing and incoming edges by verb', () => {
    const idx = indexGraph(fixture);
    const r = relations(idx, 'req:m.a');
    expect(r.out).toEqual([['satisfied-by', ['rule:r1']], ['verified-by', ['test:t']]]);
    expect(r.inc).toEqual([['refines', ['req:m.a.b']]]);
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npm run test --workspace=packages/web`
Expected: FAIL, "Cannot find module './graph'".

- [ ] **Step 5: graph.ts**

```ts
import { readFile } from 'node:fs/promises';

export interface GraphNode { id: string; kind: string; title: string; status: string; section: string; subsection: string; body: string; defined: boolean; file: string; line: number; owner?: string }
export interface GraphEdge { from: string; to: string; verb: string }
export interface GraphModule { id: string; title: string; file: string; verified: string; sourceRoots: string[] }
export interface GraphData { generatedAt: string; modules: GraphModule[]; files: string[]; nodes: GraphNode[]; edges: GraphEdge[]; fieldIndex: Record<string, string> }
export interface GraphIndex { byId: Map<string, GraphNode>; out: Map<string, GraphEdge[]>; inc: Map<string, GraphEdge[]> }
export interface BodyRow { key: string; value: string; prose: boolean }
export interface ModuleGroup { module: GraphNode; file: string; sections: { title: string; nodes: GraphNode[] }[] }

export const STRUCTURAL = new Set(['refines', 'satisfied-by', 'verified-by', 'governed-by', 'gated-by', 'has', 'refs', 'owns', 'calls', 'has-action', 'reads', 'writes', 'navigates', 'triggers', 'set-by', 'embedded-in', 'typed-as', 'contradicts', 'owned-by', 'applies-to', 'governs', 'edge-to', 'resolves', 'depends-on', 'adds', 'changes']);
export const PROSE_KEYS = new Set(['purpose', 'note', 'notes', 'statement', 'description', 'context', 'consequences', 'intent', 'q']);

export async function loadGraph(graphPath: string): Promise<GraphData> {
  return JSON.parse(await readFile(graphPath, 'utf8')) as GraphData;
}

export function indexGraph(g: GraphData): GraphIndex {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  const out = new Map<string, GraphEdge[]>(), inc = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    if (!out.has(e.from)) out.set(e.from, []); out.get(e.from)!.push(e);
    if (!inc.has(e.to)) inc.set(e.to, []); inc.get(e.to)!.push(e);
  }
  return { byId, out, inc };
}

export function sidebarTree(g: GraphData): ModuleGroup[] {
  const byId = new Map(g.nodes.map(n => [n.id, n]));
  return g.modules.map(m => {
    const module = byId.get(m.id)!;
    const sections = new Map<string, GraphNode[]>();
    for (const n of g.nodes) {
      if (n.file !== m.file || !n.defined || n.kind === 'field' || n.id === m.id) continue;
      const title = n.section || 'Other';
      if (!sections.has(title)) sections.set(title, []);
      sections.get(title)!.push(n);
    }
    return { module, file: m.file, sections: [...sections].map(([title, nodes]) => ({ title, nodes })) };
  });
}

export function neighborhood(idx: GraphIndex, id: string, depth: number, structuralOnly: boolean): Set<string> {
  const seen = new Set([id]); let frontier = [id];
  const ok = (e: GraphEdge) => !structuralOnly || STRUCTURAL.has(e.verb);
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const e of idx.out.get(f) ?? []) if (ok(e) && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
      for (const e of idx.inc.get(f) ?? []) if (ok(e) && !seen.has(e.from)) { seen.add(e.from); next.push(e.from); }
    }
    frontier = next;
  }
  return seen;
}

export function parseBody(body: string): BodyRow[] {
  const rows: BodyRow[] = [];
  let cur: BodyRow | null = null; let block = false;
  for (const line of body.split('\n')) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 ()|_-]*?):(?:\s+(.*))?$/);
    if (m && !/^\s/.test(line)) {
      if (cur) rows.push(cur);
      const key = m[1].trim(); const raw = (m[2] ?? '').trim();
      block = raw === '>' || raw === '|';
      cur = { key, value: block ? '' : raw, prose: block || PROSE_KEYS.has(key.toLowerCase()) };
      continue;
    }
    if (!cur) continue;
    const text = block ? line.trim() : line.replace(/^ {2}/, '');
    cur.value = cur.value ? cur.value + (block ? ' ' : '\n') + text : text;
  }
  if (cur) rows.push(cur);
  return rows.filter(r => r.key !== 'id');
}

export function relations(idx: GraphIndex, id: string): { out: [string, string[]][]; inc: [string, string[]][] } {
  const group = (edges: GraphEdge[], pick: (e: GraphEdge) => string): [string, string[]][] => {
    const g = new Map<string, string[]>();
    for (const e of edges) { if (!g.has(e.verb)) g.set(e.verb, []); g.get(e.verb)!.push(pick(e)); }
    return [...g];
  };
  return { out: group(idx.out.get(id) ?? [], e => e.to), inc: group(idx.inc.get(id) ?? [], e => e.from) };
}
```

- [ ] **Step 6: Run the tests**

Run: `npm run test --workspace=packages/web`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/lib
git commit -m "web: graph loader, indexes, sidebar tree, body parser"
```

---

### Task 3: Presets and mind-map layout (`lib/presets.ts`, `lib/layout.ts`)

**Files:**
- Create: `packages/web/src/lib/presets.ts`, `packages/web/src/lib/layout.ts`
- Test: `packages/web/src/lib/presets.test.ts`, `packages/web/src/lib/layout.test.ts`

**Interfaces:**
- Produces:
  - `PRESETS: Record<PresetName, { kinds: string[]; verbs: string[] | null; onlyTouching?: string }>` with `PresetName = 'Requirements' | 'Mechanics' | 'Data' | 'Drift' | 'Everything'`
  - `visibleSubgraph(g: GraphData, idx: GraphIndex, preset: PresetName, focus: string | null, depth = 2): { nodes: GraphNode[]; edges: GraphEdge[] }`
  - `layoutMindMap(nodes: GraphNode[], edges: GraphEdge[], focus: string | null): { positions: Map<string, { x: number; y: number }>; treeEdges: Set<string> }` where a tree edge key is `${from}|${verb}|${to}`
  - `TREE_VERBS = ['refines', 'has']`

- [ ] **Step 1: Failing tests**

`packages/web/src/lib/presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PRESETS, visibleSubgraph } from './presets';
import { indexGraph, type GraphData } from './graph';

const n = (id: string, status = '', defined = true) => ({ id, kind: id.split(':')[0], title: id, status, section: '', subsection: '', body: '', defined, file: 'f', line: 1 });
const g: GraphData = {
  generatedAt: '', modules: [], files: [], fieldIndex: {},
  nodes: [n('req:a'), n('req:a.b'), n('rule:r'), n('entity:e'), n('field:e.x'), n('drift:m.1', 'drift')],
  edges: [
    { from: 'req:a.b', to: 'req:a', verb: 'refines' },
    { from: 'req:a', to: 'rule:r', verb: 'satisfied-by' },
    { from: 'entity:e', to: 'field:e.x', verb: 'has' },
    { from: 'rule:r', to: 'field:e.x', verb: 'mentions' },
    { from: 'drift:m.1', to: 'rule:r', verb: 'contradicts' },
  ],
};
const idx = indexGraph(g);

describe('visibleSubgraph', () => {
  it('Requirements shows reqs and refines only', () => {
    const v = visibleSubgraph(g, idx, 'Requirements', null);
    expect(v.nodes.map(x => x.id).sort()).toEqual(['req:a', 'req:a.b']);
    expect(v.edges.map(e => e.verb)).toEqual(['refines']);
  });
  it('Mechanics hides fields and mentions', () => {
    const v = visibleSubgraph(g, idx, 'Mechanics', null);
    expect(v.nodes.map(x => x.id)).not.toContain('field:e.x');
    expect(v.edges.map(e => e.verb)).not.toContain('mentions');
  });
  it('Drift keeps only nodes touching a drift node', () => {
    const v = visibleSubgraph(g, idx, 'Drift', null);
    expect(v.nodes.map(x => x.id).sort()).toEqual(['drift:m.1', 'rule:r']);
  });
  it('focus overrides the preset with a 2-hop structural neighbourhood', () => {
    const v = visibleSubgraph(g, idx, 'Requirements', 'rule:r');
    expect(v.nodes.map(x => x.id).sort()).toEqual(['drift:m.1', 'req:a', 'req:a.b', 'rule:r']);
  });
  it('Everything includes mentions', () => {
    const v = visibleSubgraph(g, idx, 'Everything', null);
    expect(v.edges.map(e => e.verb)).toContain('mentions');
    expect(PRESETS.Everything.verbs).toBeNull();
  });
});
```

`packages/web/src/lib/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { layoutMindMap } from './layout';

const n = (id: string) => ({ id, kind: id.split(':')[0], title: id, status: '', section: '', subsection: '', body: '', defined: true, file: 'f', line: 1 });

describe('layoutMindMap', () => {
  const nodes = [n('req:a'), n('req:a.b'), n('req:a.c'), n('rule:r')];
  const edges = [
    { from: 'req:a.b', to: 'req:a', verb: 'refines' },
    { from: 'req:a.c', to: 'req:a', verb: 'refines' },
    { from: 'req:a', to: 'rule:r', verb: 'satisfied-by' },
  ];
  it('positions every node and puts children to the right of the focus', () => {
    const { positions } = layoutMindMap(nodes, edges, 'req:a');
    expect(positions.size).toBe(4);
    expect(positions.get('req:a.b')!.x).toBeGreaterThan(positions.get('req:a')!.x);
    expect(positions.get('req:a.c')!.x).toBeGreaterThan(positions.get('req:a')!.x);
  });
  it('marks refines edges as tree edges and others as cross-links', () => {
    const { treeEdges } = layoutMindMap(nodes, edges, 'req:a');
    expect(treeEdges.has('req:a.b|refines|req:a')).toBe(true);
    expect(treeEdges.has('req:a|satisfied-by|rule:r')).toBe(false);
  });
  it('works with no focus (forest)', () => {
    const { positions } = layoutMindMap(nodes, edges, null);
    expect(positions.size).toBe(4);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run test --workspace=packages/web`
Expected: FAIL, modules not found.

- [ ] **Step 3: presets.ts**

```ts
import { STRUCTURAL, neighborhood, type GraphData, type GraphEdge, type GraphIndex, type GraphNode } from './graph';

export type PresetName = 'Requirements' | 'Mechanics' | 'Data' | 'Drift' | 'Everything';
export const ALL_KINDS = ['req', 'rule', 'entity', 'field', 'op', 'page', 'action', 'state', 'flag', 'gate', 'value', 'test', 'ui-test', 'drift', 'decision', 'question', 'module', 'product'];

export const PRESETS: Record<PresetName, { kinds: string[]; verbs: string[] | null; onlyTouching?: string }> = {
  Requirements: { kinds: ['req'], verbs: ['refines'] },
  Mechanics: { kinds: ['req', 'rule', 'entity', 'op', 'page', 'action', 'state', 'flag', 'gate', 'decision'], verbs: ['refines', 'satisfied-by', 'governed-by', 'gated-by', 'has', 'refs', 'owns', 'calls', 'has-action', 'reads', 'writes', 'navigates', 'triggers', 'set-by', 'embedded-in', 'governs', 'resolves'] },
  Data: { kinds: ['entity', 'field', 'value', 'flag', 'state'], verbs: ['has', 'typed-as', 'refs', 'owns', 'embedded-in'] },
  Drift: { kinds: ['drift', 'rule', 'op', 'entity', 'page', 'gate', 'req', 'flag', 'decision'], verbs: ['contradicts'], onlyTouching: 'drift' },
  Everything: { kinds: ALL_KINDS, verbs: null },
};

export function visibleSubgraph(g: GraphData, idx: GraphIndex, preset: PresetName, focus: string | null, depth = 2): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const P = PRESETS[preset];
  let ids: Set<string>;
  if (focus && idx.byId.has(focus)) {
    ids = neighborhood(idx, focus, depth, true);
  } else {
    ids = new Set(g.nodes.filter(n => P.kinds.includes(n.kind)).map(n => n.id));
    if (P.onlyTouching) {
      const keep = new Set<string>();
      for (const e of g.edges) {
        const a = idx.byId.get(e.from), b = idx.byId.get(e.to);
        if (a?.kind === P.onlyTouching || b?.kind === P.onlyTouching) { keep.add(e.from); keep.add(e.to); }
      }
      ids = new Set([...ids].filter(i => keep.has(i)));
    }
  }
  const verbs = focus ? null : P.verbs;
  const edges = g.edges.filter(e => ids.has(e.from) && ids.has(e.to)
    && (verbs ? verbs.includes(e.verb) : (preset === 'Everything' || STRUCTURAL.has(e.verb))));
  const connected = new Set<string>(); for (const e of edges) { connected.add(e.from); connected.add(e.to); }
  const keepIsolated = preset === 'Everything' || !!focus;
  const nodes = [...ids].filter(i => connected.has(i) || keepIsolated || idx.byId.get(i)?.kind === 'req').map(i => idx.byId.get(i)!).filter(Boolean);
  return { nodes, edges };
}
```

- [ ] **Step 4: layout.ts**

```ts
import dagre from '@dagrejs/dagre';
import type { GraphEdge, GraphNode } from './graph';

export const TREE_VERBS = ['refines', 'has'];
export const NODE_W = 180, NODE_H = 36;

export function layoutMindMap(nodes: GraphNode[], edges: GraphEdge[], focus: string | null) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  const treeEdges = new Set<string>();
  for (const e of edges) {
    if (!TREE_VERBS.includes(e.verb)) continue;
    // refines points child → parent; has points parent → child. Draw the tree parent → child.
    const parent = e.verb === 'refines' ? e.to : e.from, child = e.verb === 'refines' ? e.from : e.to;
    if (parent === child) continue;
    g.setEdge(parent, child);
    treeEdges.add(`${e.from}|${e.verb}|${e.to}`);
  }
  if (focus && g.hasNode(focus)) g.setNode(focus, { width: NODE_W, height: NODE_H, rank: 0 });
  dagre.layout(g);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) { const p = g.node(n.id); positions.set(n.id, { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 }); }
  return { positions, treeEdges };
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test --workspace=packages/web`
Expected: PASS (15 tests). If the "children to the right" assertion fails because dagre ranked the parent after the child, check the parent/child orientation in the `refines` branch (parent is `e.to`).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/lib
git commit -m "web: graph presets and dagre mind-map layout"
```

---

### Task 4: Project layout, sidebar and home page

**Files:**
- Create: `packages/web/src/app/p/[project]/layout.tsx`, `packages/web/src/app/p/[project]/page.tsx`, `packages/web/src/components/Sidebar.tsx`, `packages/web/src/components/Pills.tsx`
- Modify: `packages/web/src/app/page.tsx` (redirect), `packages/web/src/app/globals.css` (append layout styles)

**Interfaces:**
- Consumes: `getProject`, `loadGraph`, `sidebarTree`, `indexGraph`.
- Produces: `<Sidebar project tree counts />` client component; `Pills({ kind, status, stub })`.

- [ ] **Step 1: Redirect home**

`packages/web/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { listProjects } from '@/lib/projects';
export default function Home() { redirect(`/p/${listProjects()[0].name}`); }
```

- [ ] **Step 2: Pills**

`packages/web/src/components/Pills.tsx`:

```tsx
export function KindPill({ kind }: { kind: string }) {
  return <span className="pill k" style={{ background: `var(--k-${kind}, var(--k-other))` }}>{kind}</span>;
}
export function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  return <span className={`pill s ${status}`}>{status}</span>;
}
export function StubPill({ defined }: { defined: boolean }) {
  return defined ? null : <span className="pill stub">referenced only</span>;
}
export function statusMark(kind: string, status: string, tested: boolean): string {
  if (kind !== 'req') return status || 'none';
  const s = status || 'shipped';
  return s === 'shipped' && !tested ? 'unverified' : s;
}
```

- [ ] **Step 3: Sidebar (client, local filter)**

`packages/web/src/components/Sidebar.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ModuleGroup } from '@/lib/graph';

export interface SidebarProps { project: string; projectTitle: string; tree: ModuleGroup[]; counts: { nodes: number; reqs: number; drift: number; questions: number } }

export function Sidebar({ project, projectTitle, tree, counts }: SidebarProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const path = usePathname();
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => !needle ? tree : tree.map(m => ({
    ...m, sections: m.sections.map(s => ({ ...s, nodes: s.nodes.filter(n => n.id.toLowerCase().includes(needle) || n.title.toLowerCase().includes(needle)) })).filter(s => s.nodes.length),
  })).filter(m => m.sections.length), [tree, needle]);
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !(o[k] ?? false) }));
  const isOpen = (k: string, dflt: boolean) => needle ? true : (open[k] ?? dflt);
  return (
    <nav className="sidebar">
      <div className="sb-head">
        <Link href={`/p/${project}`} className="sb-title">{projectTitle}</Link>
        <div className="sb-sub">{counts.nodes} nodes · {counts.reqs} reqs</div>
        <input className="sb-search" type="search" placeholder="Search ids and titles…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="sb-fixed">
          <Link href={`/p/${project}/graph`} className={path.endsWith('/graph') ? 'on' : ''}>Graph</Link>
          <Link href={`/p/${project}/graph?preset=Drift`}>Drift <b>{counts.drift}</b></Link>
          <span title="questions">Questions <b>{counts.questions}</b></span>
        </div>
      </div>
      <div className="sb-tree">
        {filtered.map(m => (
          <div key={m.module.id} className="sb-mod">
            <button className="sb-row lvl0" onClick={() => toggle(m.module.id)} aria-expanded={isOpen(m.module.id, true)}>
              <i className="dot" style={{ background: 'var(--k-module)' }} /> {m.module.title}
            </button>
            {isOpen(m.module.id, true) && m.sections.map(s => {
              const key = m.module.id + '|' + s.title;
              return (
                <div key={key}>
                  <button className="sb-row lvl1" onClick={() => toggle(key)} aria-expanded={isOpen(key, s.title.startsWith('R'))}>
                    <span className="caret">{isOpen(key, s.title.startsWith('R')) ? '▾' : '▸'}</span> {s.title} <span className="cnt">{s.nodes.length}</span>
                  </button>
                  {isOpen(key, s.title.startsWith('R')) && s.nodes.map(n => {
                    const href = `/p/${project}/n/${encodeURIComponent(n.id)}`;
                    return (
                      <Link key={n.id} href={href} className={`sb-row lvl2 ${path === href ? 'on' : ''}`} title={n.id}>
                        <i className="dot" style={{ background: `var(--k-${n.kind}, var(--k-other))` }} />
                        <span className="t">{n.title || n.id}</span>
                        {n.status && n.status !== 'shipped' && <span className={`st ${n.status}`}>{n.status}</span>}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Project layout (server)**

`packages/web/src/app/p/[project]/layout.tsx`:

```tsx
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { getProject } from '@/lib/projects';
import { loadGraph, sidebarTree } from '@/lib/graph';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project);
  if (!p) notFound();
  const g = await loadGraph(p.graphPath);
  const tree = sidebarTree(g);
  const counts = {
    nodes: g.nodes.length,
    reqs: g.nodes.filter(n => n.kind === 'req').length,
    drift: g.nodes.filter(n => n.kind === 'drift').length,
    questions: g.nodes.filter(n => n.kind === 'question').length,
  };
  return (
    <div className="shell">
      <Sidebar project={p.name} projectTitle={p.title} tree={tree} counts={counts} />
      <main className="content">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Project home page (stats + requirement tree)**

`packages/web/src/app/p/[project]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { indexGraph, loadGraph, type GraphNode } from '@/lib/graph';
import { statusMark } from '@/components/Pills';

export default async function ProjectHome({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const reqs = g.nodes.filter(n => n.kind === 'req' && n.defined);
  const st: Record<string, number> = {};
  for (const r of reqs) st[r.status || 'shipped'] = (st[r.status || 'shipped'] || 0) + 1;
  const tested = (r: GraphNode) => (idx.out.get(r.id) ?? []).some(e => e.verb === 'verified-by');
  const childrenOf = (id: string) => reqs.filter(r => (idx.out.get(r.id) ?? []).some(e => e.verb === 'refines' && e.to === id));
  const isRoot = (r: GraphNode) => !(idx.out.get(r.id) ?? []).some(e => e.verb === 'refines' && idx.byId.get(e.to)?.kind === 'req');
  const groups = new Map<string, GraphNode[]>();
  for (const r of reqs) { const k = r.subsection || 'Requirements'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  const Item = ({ r }: { r: GraphNode }) => (
    <li>
      <Link href={`/p/${p.name}/n/${encodeURIComponent(r.id)}`} className="rq">
        <span className="t">{r.title}</span><span className={`mark ${statusMark(r.kind, r.status, tested(r))}`} />
        <span className="i">{r.id.slice(4)}{r.status && r.status !== 'shipped' ? ' · ' + r.status : ''}</span>
      </Link>
      {childrenOf(r.id).length > 0 && <ul>{childrenOf(r.id).map(c => <Item key={c.id} r={c} />)}</ul>}
    </li>
  );
  return (
    <div className="page">
      <h1>{p.title}</h1>
      <p className="sub">{g.files.join(', ')} · built {g.generatedAt.slice(0, 10)}</p>
      <div className="stats">
        <div className="stat"><b>{reqs.length}</b><span>requirements</span></div>
        <div className="stat ok"><b>{st.shipped || 0}</b><span>shipped</span></div>
        <div className="stat warn"><b>{(st.unverified || 0) + (st['api-only'] || 0)}</b><span>unverified</span></div>
        <div className="stat"><b>{st.proposed || 0}</b><span>proposed</span></div>
        <div className="stat bad"><b>{g.nodes.filter(n => n.kind === 'drift').length}</b><span>drift rows</span></div>
      </div>
      {[...groups].map(([title, rs]) => (
        <section key={title}>
          <h2>{title.replace(/^R\.\d+\s*/, '')}</h2>
          <ul className="tree">{rs.filter(isRoot).map(r => <Item key={r.id} r={r} />)}</ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Styles** — append to `globals.css`:

```css
.shell { display: grid; grid-template-columns: 300px 1fr; height: 100dvh; }
.sidebar { border-right: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; min-height: 0; }
.sb-head { padding: 14px 14px 10px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.sb-title { font-weight: 700; font-size: 17px; color: var(--ink); text-decoration: none; }
.sb-sub { font: 11px var(--font-m); color: var(--muted); }
.sb-search { padding: 7px 10px; border: 1px solid var(--line-2); border-radius: 8px; background: var(--ground); color: var(--ink); font: 13px var(--font-b); }
.sb-fixed { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; }
.sb-fixed a, .sb-fixed span { padding: 4px 8px; border-radius: 999px; border: 1px solid var(--line-2); color: var(--ink-2); text-decoration: none; }
.sb-fixed a.on { background: var(--ink); color: var(--ground); border-color: var(--ink); }
.sb-fixed b { font-weight: 600; margin-left: 4px; }
.sb-tree { overflow-y: auto; padding: 8px 6px 40px; }
.sb-row { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; padding: 5px 8px; border-radius: 6px; border: 0; background: none; color: var(--ink); font: 13px var(--font-b); text-decoration: none; cursor: pointer; }
.sb-row:hover { background: var(--sunk); }
.sb-row.on { background: var(--accent-soft); }
.sb-row.lvl0 { font-weight: 600; margin-top: 6px; }
.sb-row.lvl1 { color: var(--ink-2); font-size: 12px; padding-left: 14px; }
.sb-row.lvl2 { padding-left: 28px; }
.sb-row .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.sb-row .cnt, .sb-row .st { font: 10px var(--font-m); color: var(--muted); }
.sb-row .st.proposed { color: var(--muted); } .sb-row .st.question, .sb-row .st.drift { color: var(--bad); } .sb-row .st.unverified { color: var(--warn); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }
.caret { width: 10px; color: var(--muted); }
.content { min-width: 0; overflow-y: auto; }
.page { padding: 20px 24px 80px; max-width: 900px; }
.page h1 { font-size: 24px; margin: 0 0 4px; } .page .sub { font: 12px var(--font-m); color: var(--muted); margin: 0 0 16px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 0 0 18px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.stat b { display: block; font-size: 22px; } .stat span { font: 11px var(--font-m); color: var(--muted); text-transform: uppercase; }
.stat.ok b { color: var(--ok); } .stat.warn b { color: var(--warn); } .stat.bad b { color: var(--bad); }
.tree, .tree ul { list-style: none; margin: 0; padding: 0; } .tree ul { padding-left: 16px; border-left: 1px solid var(--line); }
.rq { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 7px 10px; border-radius: 8px; color: var(--ink); text-decoration: none; }
.rq:hover { background: var(--sunk); } .rq .i { grid-column: 1 / -1; font: 11px var(--font-m); color: var(--muted); }
.mark { width: 9px; height: 9px; border-radius: 50%; margin-top: 7px; background: var(--ok); }
.mark.unverified, .mark.api-only { background: var(--warn); } .mark.proposed { background: transparent; border: 1.5px dashed var(--muted); } .mark.question { background: var(--bad); }
.pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; font: 500 11px var(--font-m); text-transform: uppercase; border: 1px solid var(--line-2); color: var(--ink-2); }
.pill.k { border-color: transparent; color: #fff; }
.pill.s.shipped { color: var(--ok); border-color: var(--ok); } .pill.s.proposed { color: var(--muted); border-style: dashed; } .pill.s.unverified, .pill.s.api-only { color: var(--warn); border-color: var(--warn); } .pill.s.question, .pill.s.drift { color: var(--bad); border-color: var(--bad); }
.pill.stub { border-style: dashed; color: var(--muted); }
@media (max-width: 720px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { height: auto; max-height: 45dvh; }
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev` (background). Open http://localhost:3000 → redirects to `/p/wye`; sidebar shows five modules (Waterfall, and the four v2 documents), stats show 95 requirements; typing `clerk` in the search narrows the tree. Fix anything broken, then stop the server.

- [ ] **Step 8: Commit**

```bash
git add packages/web
git commit -m "web: project layout, sidebar tree with search, home page with requirement tree"
```

---

### Task 5: Node page (properties, prose, relations, id links)

**Files:**
- Create: `packages/web/src/app/p/[project]/n/[id]/page.tsx`, `packages/web/src/components/IdLink.tsx`, `packages/web/src/components/NodeBody.tsx`, `packages/web/src/components/Relations.tsx`
- Modify: `packages/web/src/app/globals.css` (append)

**Interfaces:**
- Consumes: `parseBody`, `relations`, `ID_RE`, `cleanId`, `Pills`.
- Produces: `<Linkified text project />` renders text with ids as links; `<NodeBody rows project />`; `<Relations project rel byId />`.

- [ ] **Step 1: IdLink**

`packages/web/src/components/IdLink.tsx`:

```tsx
import Link from 'next/link';
import { ID_RE, cleanId, kindOf } from '@/lib/ids';
import type { ReactNode } from 'react';

export function IdLink({ id, project, label }: { id: string; project: string; label?: string }) {
  return <Link href={`/p/${project}/n/${encodeURIComponent(id)}`} className={`nid k-${kindOf(id)}`}>{label ?? id}</Link>;
}

export function Linkified({ text, project }: { text: string; project: string }) {
  const parts: ReactNode[] = []; let last = 0; let m: RegExpExecArray | null;
  const re = new RegExp(ID_RE.source, 'g');
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    parts.push(<IdLink key={m.index} id={cleanId(m[0])} project={project} label={m[0]} />);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
```

- [ ] **Step 2: NodeBody**

`packages/web/src/components/NodeBody.tsx`:

```tsx
import type { BodyRow } from '@/lib/graph';
import { Linkified } from './IdLink';

export function NodeBody({ rows, project }: { rows: BodyRow[]; project: string }) {
  return (
    <dl className="props">
      {rows.map(r => (
        <div key={r.key} className={`prop ${r.prose ? 'prose' : ''}`}>
          <dt>{r.key}</dt>
          <dd>{r.prose ? <p><Linkified text={r.value} project={project} /></p> : <pre><Linkified text={r.value} project={project} /></pre>}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 3: Relations**

`packages/web/src/components/Relations.tsx`:

```tsx
import type { GraphNode } from '@/lib/graph';
import { IdLink } from './IdLink';

const ORDER = ['req', 'rule', 'op', 'page', 'action', 'entity', 'field', 'value', 'state', 'flag', 'gate', 'decision', 'question', 'drift', 'test', 'ui-test', 'module', 'product'];
const sortIds = (ids: string[]) => [...ids].sort((a, b) => ORDER.indexOf(a.split(':')[0]) - ORDER.indexOf(b.split(':')[0]) || a.localeCompare(b));

export function Relations({ project, rel, byId }: { project: string; rel: { out: [string, string[]][]; inc: [string, string[]][] }; byId: Map<string, GraphNode> }) {
  const chip = (id: string) => {
    const n = byId.get(id);
    return <span key={id} className={`chip ${n?.defined ? '' : 'stub'}`} style={{ '--kc': `var(--k-${id.split(':')[0]}, var(--k-other))` } as React.CSSProperties}><i /><IdLink id={id} project={project} label={n?.kind === 'req' ? id.slice(4) : id} /></span>;
  };
  return (
    <div className="rels">
      {rel.out.map(([verb, ids]) => <div key={'o' + verb}><h4>{verb} →</h4><div className="chips">{sortIds(ids).map(chip)}</div></div>)}
      {rel.inc.map(([verb, ids]) => <div key={'i' + verb}><h4>← {verb} by</h4><div className="chips">{sortIds(ids).map(chip)}</div></div>)}
    </div>
  );
}
```

- [ ] **Step 4: Node page**

`packages/web/src/app/p/[project]/n/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { indexGraph, loadGraph, parseBody, relations } from '@/lib/graph';
import { KindPill, StatusPill, StubPill } from '@/components/Pills';
import { NodeBody } from '@/components/NodeBody';
import { Relations } from '@/components/Relations';
import { IdLink } from '@/components/IdLink';

export default async function NodePage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id: raw } = await params;
  const id = decodeURIComponent(raw);
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const n = idx.byId.get(id); if (!n) notFound();
  const rows = parseBody(n.body);
  const rel = relations(idx, id);
  const links = (idx.out.get(id)?.length ?? 0) + (idx.inc.get(id)?.length ?? 0);
  return (
    <article className="page node">
      <div className="pills"><KindPill kind={n.kind} /><StatusPill status={n.status || (n.kind === 'req' ? 'shipped' : '')} /><StubPill defined={n.defined} /></div>
      <h1>{n.title || n.id}</h1>
      <p className="sub">
        <code>{n.id}</code>{n.owner && <> · field of <IdLink id={n.owner} project={p.name} /></>}{n.section && <> · §{n.section}</>} · {links} links{n.file && <> · {n.file}:{n.line}</>}
        {' · '}<Link href={`/p/${p.name}/graph?focus=${encodeURIComponent(id)}`}>show in graph</Link>
      </p>
      {n.defined ? <NodeBody rows={rows} project={p.name} /> : <p className="muted">Referenced by other nodes but not described yet.</p>}
      <Relations project={p.name} rel={rel} byId={idx.byId} />
    </article>
  );
}
```

- [ ] **Step 5: Styles** — append to `globals.css`:

```css
.node .pills { display: flex; gap: 6px; margin-bottom: 8px; }
.props { display: grid; grid-template-columns: minmax(120px, 160px) 1fr; gap: 6px 14px; margin: 16px 0; border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; background: var(--surface); }
.prop { display: contents; }
.prop dt { font: 500 12px var(--font-m); color: var(--muted); padding-top: 4px; }
.prop dd { margin: 0; min-width: 0; }
.prop dd pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.5; }
.prop dd p { margin: 2px 0; max-width: 70ch; }
.nid { text-decoration: none; border-bottom: 1px dotted currentColor; color: var(--accent); }
.nid.k-req { color: var(--k-req); } .nid.k-rule { color: var(--k-rule); } .nid.k-entity { color: var(--k-entity); } .nid.k-op { color: var(--k-op); } .nid.k-page { color: var(--k-page); } .nid.k-action { color: var(--k-action); } .nid.k-gate, .nid.k-flag { color: var(--k-gate); } .nid.k-state { color: var(--k-state); } .nid.k-test, .nid.k-ui-test { color: var(--k-test); } .nid.k-drift { color: var(--k-drift); } .nid.k-field { color: var(--k-field); } .nid.k-decision { color: var(--k-decision); } .nid.k-question { color: var(--k-question); }
.rels h4 { margin: 14px 0 6px; font: 600 11px var(--font-m); text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface); font: 12px var(--font-m); }
.chip i { width: 8px; height: 8px; border-radius: 50%; background: var(--kc); }
.chip.stub { border-style: dashed; }
.chip .nid { border: 0; color: var(--ink); }
.muted { color: var(--muted); }
```

- [ ] **Step 6: Verify in the browser**

Open http://localhost:3000/p/wye/n/req%3Awf2.clerk → pills show `req` and `proposed`; properties show `title`, `when`, `then`, `satisfied-by` as a linkified list, `note` as prose; relations show `satisfied-by →`, `verified-by →`, `refines →` and `← refines by`, `← governs by`; clicking a chip navigates. Open `n/rule%3Aclerk-budget` → `statement` renders as a paragraph.

- [ ] **Step 7: Commit**

```bash
git add packages/web
git commit -m "web: node page with properties, prose keys, relations and id links"
```

---

### Task 6: Graph page with React Flow mind map

**Files:**
- Create: `packages/web/src/app/p/[project]/graph/page.tsx`, `packages/web/src/components/GraphView.tsx`
- Modify: `packages/web/src/app/globals.css` (append)

**Interfaces:**
- Consumes: `visibleSubgraph`, `layoutMindMap`, `PRESETS`, `NODE_W/NODE_H`, `parseBody`, `relations`.
- Produces: `<GraphView project preset focus nodes edges byIdSummary />` client component; URL is the state (`?focus=&preset=`).

- [ ] **Step 1: Graph page (server wrapper)**

`packages/web/src/app/p/[project]/graph/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { indexGraph, loadGraph } from '@/lib/graph';
import { PRESETS, visibleSubgraph, type PresetName } from '@/lib/presets';
import { GraphView } from '@/components/GraphView';

export default async function GraphPage({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ focus?: string; preset?: string }> }) {
  const { project } = await params; const sp = await searchParams;
  const p = getProject(project); if (!p) notFound();
  const preset = (sp.preset && sp.preset in PRESETS ? sp.preset : 'Requirements') as PresetName;
  const focus = sp.focus ? decodeURIComponent(sp.focus) : null;
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const { nodes, edges } = visibleSubgraph(g, idx, preset, focus);
  const summaries = Object.fromEntries(nodes.map(n => [n.id, { title: n.title, kind: n.kind, status: n.status, defined: n.defined, body: n.body.slice(0, 1200) }]));
  return <GraphView project={p.name} preset={preset} focus={focus} nodes={nodes.map(n => ({ id: n.id, kind: n.kind, title: n.title, status: n.status, defined: n.defined }))} edges={edges} summaries={summaries} />;
}
```

- [ ] **Step 2: GraphView (client)**

`packages/web/src/components/GraphView.tsx`:

```tsx
'use client';
import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutMindMap, NODE_H, NODE_W } from '@/lib/layout';
import { PRESETS, type PresetName } from '@/lib/presets';
import type { GraphEdge } from '@/lib/graph';
import { parseBody } from '@/lib/graph';

type LiteNode = { id: string; kind: string; title: string; status: string; defined: boolean };
type Summary = { title: string; kind: string; status: string; defined: boolean; body: string };
interface Props { project: string; preset: PresetName; focus: string | null; nodes: LiteNode[]; edges: GraphEdge[]; summaries: Record<string, Summary> }

export function GraphView({ project, preset, focus, nodes, edges, summaries }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(focus);
  const { rfNodes, rfEdges } = useMemo(() => {
    const full = nodes.map(n => ({ ...n, section: '', subsection: '', body: '', file: '', line: 0 }));
    const { positions, treeEdges } = layoutMindMap(full, edges, focus);
    const rfNodes: Node[] = nodes.map(n => ({
      id: n.id, position: positions.get(n.id)!, data: { label: n.kind === 'req' ? n.id.slice(4) : n.id },
      style: { width: NODE_W, height: NODE_H, fontSize: 11, fontFamily: 'var(--font-m)', borderRadius: 8, padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        background: n.defined ? `var(--k-${n.kind}, var(--k-other))` : 'var(--surface)', color: n.defined ? '#fff' : 'var(--ink)',
        border: `${n.id === selected ? 3 : 1.5}px ${n.defined ? 'solid' : 'dashed'} ${n.id === selected ? 'var(--accent)' : n.status === 'proposed' ? 'var(--muted)' : n.status === 'question' || n.status === 'drift' ? 'var(--bad)' : `var(--k-${n.kind}, var(--k-other))`}` },
      sourcePosition: 'right' as const, targetPosition: 'left' as const,
    }));
    const rfEdges: Edge[] = edges.map(e => {
      const tree = treeEdges.has(`${e.from}|${e.verb}|${e.to}`);
      const parent = e.verb === 'refines' ? e.to : e.from, child = e.verb === 'refines' ? e.from : e.to;
      return { id: `${e.from}|${e.verb}|${e.to}`, source: tree ? parent : e.from, target: tree ? child : e.to, label: tree ? undefined : e.verb, type: tree ? 'smoothstep' : 'default',
        style: { stroke: e.verb === 'contradicts' ? 'var(--bad)' : tree ? 'var(--line-2)' : 'var(--accent)', strokeDasharray: e.verb === 'contradicts' ? '4 3' : e.verb === 'mentions' ? '2 3' : undefined, opacity: tree ? 1 : 0.7 },
        labelStyle: { fontSize: 9, fill: 'var(--muted)' }, labelBgStyle: { fill: 'var(--ground)' } };
    });
    return { rfNodes, rfEdges };
  }, [nodes, edges, focus, selected]);

  const onNodeClick: NodeMouseHandler = useCallback((_, n) => setSelected(n.id), []);
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, n) => router.push(`/p/${project}/graph?focus=${encodeURIComponent(n.id)}&preset=${preset}`), [router, project, preset]);
  const sel = selected ? summaries[selected] : null;

  return (
    <div className="gwrap">
      <div className="gbar">
        {(Object.keys(PRESETS) as PresetName[]).map(p => (
          <Link key={p} href={`/p/${project}/graph?preset=${p}`} className={`chip ${p === preset && !focus ? 'on' : ''}`}>{p}</Link>
        ))}
        {focus && <span className="chip on">focus: {focus} <Link href={`/p/${project}/graph?preset=${preset}`}>×</Link></span>}
        <span className="cnt">{nodes.length} nodes · {edges.length} edges</span>
      </div>
      <div className="gcanvas">
        <ReactFlow nodes={rfNodes} edges={rfEdges} onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} fitView minZoom={0.1} nodesDraggable nodesConnectable={false} proOptions={{ hideAttribution: true }}>
          <Background gap={24} />
          <Controls />
          {nodes.length > 40 && <MiniMap pannable zoomable />}
        </ReactFlow>
        {sel && selected && (
          <aside className="gpanel">
            <div className="pills"><span className="pill k" style={{ background: `var(--k-${sel.kind}, var(--k-other))` }}>{sel.kind}</span>{sel.status && <span className={`pill s ${sel.status}`}>{sel.status}</span>}</div>
            <h3>{sel.title || selected}</h3>
            <code>{selected}</code>
            <div className="gp-acts">
              <Link href={`/p/${project}/n/${encodeURIComponent(selected)}`}>Open page</Link>
              <Link href={`/p/${project}/graph?focus=${encodeURIComponent(selected)}&preset=${preset}`}>Focus here</Link>
              <button onClick={() => setSelected(null)}>Close</button>
            </div>
            <dl className="props small">{parseBody(sel.body).slice(0, 8).map(r => <div key={r.key} className="prop"><dt>{r.key}</dt><dd><pre>{r.value}</pre></dd></div>)}</dl>
          </aside>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Styles** — append to `globals.css`:

```css
.gwrap { display: flex; flex-direction: column; height: 100dvh; }
.gbar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--surface); }
.gbar .chip { text-decoration: none; color: var(--ink-2); cursor: pointer; }
.gbar .chip.on { background: var(--ink); color: var(--ground); border-color: var(--ink); }
.gbar .chip.on a { color: var(--ground); margin-left: 6px; text-decoration: none; }
.gbar .cnt { margin-left: auto; font: 11px var(--font-m); color: var(--muted); }
.gcanvas { flex: 1; min-height: 0; position: relative; background: var(--ground); }
.gpanel { position: absolute; right: 12px; top: 12px; width: min(380px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; box-shadow: 0 8px 30px rgba(0,0,0,.15); }
.gpanel h3 { margin: 6px 0 2px; font-size: 15px; } .gpanel code { font-size: 11px; color: var(--muted); word-break: break-all; }
.gp-acts { display: flex; gap: 10px; margin: 8px 0; font-size: 13px; } .gp-acts button { background: none; border: 0; color: var(--accent); cursor: pointer; font: inherit; padding: 0; }
.props.small { margin: 6px 0 0; padding: 8px 10px; grid-template-columns: 90px 1fr; font-size: 12px; }
.react-flow__node { cursor: pointer; }
```

- [ ] **Step 4: Verify in the browser**

Open http://localhost:3000/p/wye/graph → Requirements preset renders the requirement forest as trees left-to-right; click a node → side panel with pills and first properties; double-click → URL becomes `?focus=<id>&preset=Requirements` and the 2-hop neighbourhood is shown with cross-links labelled by verb; Drift preset shows only nodes touching drift rows with dashed red edges; `?focus=req%3Awf2.clerk` opened from a node page's "show in graph" works. Check at 400px width (DevTools) that the sidebar collapses above the content and the canvas still pans.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "web: graph page with React Flow mind map, presets, focus and side panel"
```

---

### Task 7: Record the slice in the graph and README

**Files:**
- Modify: `docs/context-graph/dev-design.md` (page components now real paths), `docs/context-graph/prd.md` (status of `req:wf2.ui`, `req:wf2.ui.sidebar`, `req:wf2.ui.node-page`, `req:wf2.ui.graph`), `docs/context-graph/project.md` (drift row for npm workspaces vs pnpm), `README.md` (how to run the web app)

- [ ] **Step 1: Flip what shipped, honestly**

In `prd.md`, for `req:wf2.ui`, `req:wf2.ui.sidebar`, `req:wf2.ui.node-page`, `req:wf2.ui.graph`: set `status: unverified` (shipped behaviour, no automated test yet — the pure-module tests do not exercise the pages) and add `note: read-only first slice, 2026-09-14; server-backed data and editing pending`. Leave `req:wf2.ui.graph-edit`, `req:wf2.ui.node-page.save`, `req:wf2.ui.live`, `req:wf2.ui.tasks`, `req:wf2.ui.decisions`, `req:wf2.ui.contradictions`, `req:wf2.ui.phone` as proposed.

In `dev-design.md`, update `component:` paths of `page:web/sidebar`, `page:web/node`, `page:web/graph` to the files created here, and the `source:` of `rule:mindmap-layout` to `packages/web/src/lib/layout.ts#layoutMindMap`, `rule:deep-links` to `packages/web/src/app/p/[project]/layout.tsx`, `rule:prose-keys` to `packages/web/src/lib/graph.ts#parseBody`; add `verified-by: [test:web-lib#layout, test:web-lib#presets]` on those two rules and add a `test:web-lib` node in `test-design.md`:

```yaml
- id: test:web-lib
  file: packages/web/src/lib/graph.test.ts
  description: vitest over the pure modules of the web app: graph indexes, sidebar tree, body parser, presets, mind-map layout.
  cases:
    - graph: indexGraph, sidebarTree, neighborhood, parseBody, relations
    - presets: Requirements, Mechanics, Drift, focus, Everything
    - layout: positions, tree edges, forest
  count: 15
```

In `project.md` drift table add row 8: `| 8 | decision:wf2.stack (pnpm monorepo) | package.json workspaces | pnpm is not installed on the dev machine; the workspace uses npm workspaces. Same layout, different tool; switch when pnpm is adopted | package.json vs spec §2 |`.

- [ ] **Step 2: README**

Add under Commands:

```
| `npm run dev` | web app at http://localhost:3000 — sidebar, node pages, mind map over `_build/graph.json` (run `ctx build` first) |
```

- [ ] **Step 3: Build, check, test, commit**

Run: `node bin/ctx.js build && node bin/ctx.js check && npm test`
Expected: 0 errors; vitest passes; smoke passes.

```bash
git add docs/context-graph README.md
git commit -m "graph: record the web UI first slice; README run instructions"
```

---

## Self-review

- **Spec coverage:** §7 sidebar (Task 4), node page read side (Task 5), graph view with presets, focus, click/double-click (Task 6), deep links (routes in Tasks 4–6), phone width (CSS in Task 4 and verification in Task 6). Not in this slice by design: node editing and save (`req:wf2.ui.node-page.save`), graph editing, tasks/decisions/contradictions views, SSE — they need the server and DB from phase 1 and stay proposed (Task 7 records this).
- **Placeholders:** none; every step has its code.
- **Type consistency:** `GraphData/GraphNode/GraphEdge/GraphIndex` defined in Task 2 and used unchanged in Tasks 3–6; `visibleSubgraph(g, idx, preset, focus)` signature is the same in Task 3 tests and Task 6; `layoutMindMap(nodes, edges, focus)` returns `{ positions, treeEdges }` in both; `PresetName` exported from presets.ts and imported in Task 6; `parseBody` returns `BodyRow[]` with `prose` used by NodeBody and GraphView.
