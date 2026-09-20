# Prompt Requests D1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The plan document becomes the Prompt Request (`type:pr`, `pr:<slug>`, under the project's Requests page) with the lifecycle `draft → refining → approved → building → done | failed | cancelled`, a computed readiness list, an Approve / Cancel gate the person owns, and a ⌘P with two modes: ad-hoc (a conversation, no document) and PR (a draft + a refining session).

**Architecture:** A mechanical rename of everything named plan (libs, routes, components, CLI, prompts, template, base ontology, parser special cases) followed by a one-off migration of the existing documents and sessions; then the new pieces — `readiness()` in the pure lib, a `PrHead` component on `type:pr` pages, `PATCH /api/<p>/pr { action }`, the refining brief, and the command box's mode row. Build by hand (Assign with `build`) keeps working until D2's dispatcher.

**Tech Stack:** Next.js App Router, vitest, node scripts, BlockNote (unchanged), the `wye` CLI (`bin/wf.js`).

**Spec:** `docs/superpowers/specs/2026-09-20-prompt-requests-design.md` (sections 1–4, 7)

## Global Constraints

- Statuses `PR_STATUSES = ['draft', 'refining', 'approved', 'building', 'done', 'failed', 'cancelled']`; readiness is computed, never a status.
- Session records keep working: `Session.prDoc` is the field; a stored `planDoc` is read as `prDoc` when `prDoc` is absent (`sessions.ts` `getSession` / `listSessions` normalise on read).
- Ids: `pr:<slug>`, files `pr-<slug>.md`, the Requests page `requests.md` = `module:<project>-requests`.
- `wye plan …` keeps working as an alias of `wye pr …` printing `plan is now pr` once to stderr.
- Every step green: `cd packages/web && npx tsc --noEmit -p . && npx vitest run`, and `npm test` at the end of each task; `node bin/ctx.js check --root data/products/waterfall` 0 errors after the migration.
- Commit to `main` per task, message in the repo's style.

---

### Task 1: The pure lib — `pr-doc.ts` with readiness

**Files:**
- Rename (git mv): `packages/web/src/lib/plan-doc.ts` → `pr-doc.ts`, `plan-doc.test.ts` → `pr-doc.test.ts`
- Modify: `packages/web/src/lib/props.ts:23` (`PLAN_STATUSES` → `PR_STATUSES`)
- Modify: `packages/web/src/lib/session-types.ts` (`SessionPlan` → `SessionPr`, `planDoc` → `prDoc`, `plans` → `prs`)

**Interfaces (Produces):**
- `requestsPageId(projectSlug) → 'module:<p>-requests'`
- `prSlug(request, taken) → 'pr-…'`, `prTitle`, `PrDocVars`, `prDocBody(template, vars)`, `requestTaskId`, `fromLine`, `prDocPath`, `PrWindow`, `resultSection`, `withResult`, `requestTaskStatusOnEnd(taskStatus, prStatus)`, `PrEndStatus`, `prStatusOnEnd`, `getFrontmatter`, `setFrontmatter`, `prsOf(product, graph, sessionId) → SessionPr[]`, `definitionIds`, `sectionBody`, `withDefinition` (inserts before `## Impact`, then `## Tasks`, else appends), `AGREED`, `DefinitionState`, `definitionState`
- New: `Readiness = { definition: boolean; agreed: boolean; impact: boolean; contradictions: boolean; tasks: boolean; ok: boolean; unagreed: string[]; contradicted: string[] }`; `readiness(d: DefinitionState, taskCount: number, impactFresh = true) → Readiness`; `taskLines(md) → string[]` (ids of `- [ ] task:` / `- [x] task:` lines under Tasks); `PR_STATUSES`.
- Removed: `planStatusFromDefinition` (defining ↔ defined no longer exist; `refining` is set by the session, not the Definition).

- [ ] **Step 1: Rename the files and update the test to the new names**

`git mv` both files. In `pr-doc.test.ts` replace every `plan` identifier per the table (`planSlug`→`prSlug`, `planTitle`→`prTitle`, `planDocBody`→`prDocBody`, `planDocPath`→`prDocPath`, `planStatusOnEnd`→`prStatusOnEnd`, `plansOf`→`prsOf`, `plansPageId`→`requestsPageId`, `plan:`→`pr:`, `plan-`→`pr-`, `module:v2-plans`→`module:v2-requests`, `status: proposed`→`status: draft`, `status: defining`→`status: refining`); drop the `planStatusFromDefinition` test. Add:

```ts
describe('readiness', () => {
  const d = (items: { id: string; status: string; agreed: boolean }[], contradicted: string[] = []) => definitionState(items.map(i => i.id), id => { const it = items.find(i => i.id === id)!; return { status: it.status, openContradictions: contradicted.includes(id) ? ['contradiction:x'] : [] }; });
  it('is green only when everything holds', () => {
    const r = readiness(d([{ id: 'req:a', status: 'approved', agreed: true }]), 1);
    expect(r).toEqual({ definition: true, agreed: true, impact: true, contradictions: true, tasks: true, ok: true, unagreed: [], contradicted: [] });
  });
  it('names what is unagreed and contradicted, and misses tasks', () => {
    const r = readiness(d([{ id: 'req:a', status: 'proposed', agreed: false }, { id: 'rule:b', status: 'approved', agreed: true }], ['rule:b']), 0);
    expect(r.ok).toBe(false); expect(r.agreed).toBe(false); expect(r.unagreed).toEqual(['req:a']); expect(r.contradictions).toBe(false); expect(r.contradicted).toEqual(['rule:b']); expect(r.tasks).toBe(false);
  });
  it('an empty Definition is not ready', () => { expect(readiness(d([]), 2).definition).toBe(false); });
  it('taskLines reads the Tasks section', () => {
    expect(taskLines('# X\n\n## Tasks\n\n- [ ] task:a.one Do one #open\n- [x] task:a.two Done\n\n## Result\n')).toEqual(['task:a.one', 'task:a.two']);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `cd packages/web && npx vitest run src/lib/pr-doc.test.ts` — FAIL (imports missing).

- [ ] **Step 3: Rewrite `pr-doc.ts`**

Apply the identifier table to the file body and header comment (the header says: "The Prompt Request document (req:wf2.pr, rule:pr-doc): one per request — created by the app from templates/docs/pr.md under the project's Requests page, refined until approved, built by a worker, finished by the app with the result. Pure…"). `prSlug` prefixes `pr-`. `withDefinition` when the section is missing inserts before `## Impact`, else before `## Tasks`, else appends. Remove `planStatusFromDefinition`. Add:

```ts
// The Tasks section's task ids: `- [ ] task:x …` / `- [x] task:x …` lines, top level only.
export function taskLines(md: string): string[] {
  const sec = sectionBody(md, 'Tasks'); if (sec === null) return [];
  return sec.split('\n').map(l => l.match(/^-\s+\[[ xX]\]\s+(task:[A-Za-z0-9_.\-]+)\s/)?.[1]).filter((x): x is string => !!x);
}

// Readiness (spec §1): computed, never a status — what must hold before the person approves. `impactFresh` is D2's
// "the scope was computed after the last Definition change"; until then it is always true.
export type Readiness = { definition: boolean; agreed: boolean; impact: boolean; contradictions: boolean; tasks: boolean; ok: boolean; unagreed: string[]; contradicted: string[] };
export function readiness(d: DefinitionState, taskCount: number, impactFresh = true): Readiness {
  const unagreed = d.items.filter(i => !i.agreed).map(i => i.id);
  const r = { definition: d.total > 0, agreed: d.total > 0 && unagreed.length === 0, impact: impactFresh, contradictions: d.contradicted.length === 0, tasks: taskCount > 0, unagreed, contradicted: d.contradicted };
  return { ...r, ok: r.definition && r.agreed && r.impact && r.contradictions && r.tasks };
}
```

`props.ts`: `export const PR_STATUSES = ['draft', 'refining', 'approved', 'building', 'done', 'failed', 'cancelled'];` (remove `PLAN_STATUSES`; grep its uses — `DocProps`/status pills read it by type: update the lookup key from `plan` to `pr`).

`session-types.ts`: `SessionPlan` → `SessionPr`; `Session.planDoc?` → `prDoc?` plus `/** stored by older sessions; read as prDoc */ planDoc?: string`; `plans?` → `prs?`.

- [ ] **Step 4: Run the test, then tsc (expect the rest of the app to fail on imports — that is Task 2)**

Run: `npx vitest run src/lib/pr-doc.test.ts` — PASS. Commit only after Task 2 (the app does not compile in between); keep going.

---

### Task 2: The rename through the app, the CLI, the prompts, the template and the ontology

**Files (rename with git mv):**
- `packages/web/src/lib/plan-docs.ts` → `pr-docs.ts`
- `packages/web/src/components/PlanFolder.tsx` → `RequestFolder.tsx`, `PlanList.tsx` → `PrList.tsx`
- `packages/web/src/app/api/[product]/plan/route.ts` → `api/[product]/pr/route.ts`
- `packages/web/src/app/[product]/plans/page.tsx` → `[product]/requests/page.tsx`
- `templates/docs/plan-request.md` → `templates/docs/pr.md`

**Files (modify):** `pr-docs.ts`, `sessions.ts`, `agent-host.ts`, `agent-prompt.ts`, `work.ts`, `work.test.ts`, `work-io.ts`, `consolidate.ts`, `consolidate.test.ts`, `graph-diff.test.ts`, `explain.ts`, `constitution.ts`, `watch.ts`, `changes.ts`; routes `propose`, `sessions` (+ `[id]`, `[id]/message`), `work/assign`; components `RequestFolder`, `PrList`, `TaskWork`, `Assign`, `WorkList`, `SessionView`, `SessionList`, `Console`, `Rail`, `TopBar`, `DocProps`, `ContextCard`, `CommandBox` (names only — the mode row is Task 5); `app/[product]/layout.tsx`, `work/page.tsx`, `sessions/page.tsx`, `sessions/[id]/page.tsx`; `globals.css` (class names `.plan-*` → `.pr-*`); `bin/wf.js`; `prompts/agent-system.md`, `prompts/librarian-system.md`; `schema/base-ontology.md`; `lib/graph.js`, `lib/impact.js`, `lib/parse.js`; `lib/consolidate.js` (prompt text mentions "plan document" → "PR document").

**Interfaces (Produces):**
- `pr-docs.ts`: `ensureRequestsPage(project, root)`, `createPrDoc(productDir, product, s)` (file `pr-<slug>.md`, `status: draft`, `refining` when `s.role === 'librarian'`), `withRequestTaskStatus`, `requestTaskStatus`, `finishPrDoc`, `adoptPrDoc`, `closePrDoc`, `readPrDoc`, `embedInDefinition`, `prDefinition(scope, md) → DefinitionState`, `prReadiness(scope, md) → Readiness` (= `readiness(prDefinition(scope, md), taskLines(md).length)`), `trackDefinitions`, `definitionContext`, `SYSTEM_VIEWS`, `ensureViewPages`, `viewPageId`. `refreshPlanStatuses` is removed (and its `POST { action: 'refresh' }` route).
- `sessions.ts`: `setPrDoc(productDir, id, ref, line?)`; `getSession`/`listSessions` normalise `planDoc` → `prDoc`.
- `op:api.pr`: `GET ?ref=` → `{ ref, node: 'pr:<slug>', status, role, task, session, definition, readiness }`; `PATCH { ref, status }` (Task 4 adds `action`).
- Route `/[product]/requests` (page "Requests"; `/plans` redirects to it).
- Template `templates/docs/pr.md`:

```markdown
---
node: pr:{{slug}}
type: pr
title: {{title}}
status: draft
owner: unassigned
last-verified: {{date}}
session: {{session}}
agent: {{agent}}
started: {{started}}
task: {{task}}
role: {{role}}
part-of: {{parent}}
---

# {{title}}

## Request

{{request}}

{{from}}

## Context

_What the request touches — modules, documents, nodes and code — as tags and embeds; what was understood, in prose._

## Definition

_The blocks this request proposes — requirements, decisions, constraints, questions, tasks, edits of existing nodes — defined in their home documents and embedded here. The request is ready when every one is agreed._

## Impact

_What the change reaches — computed from the Definition — and the other requests it overlaps._

## Tasks

_`- [ ] task:` lines, `part of pr:{{slug}}`; their check state is what is in progress._

{{requesttask}}

## Result

_Written by the app when the build ends: the summary and the blocks this request produced._
```

- [ ] **Step 1: Apply the table everywhere**

Identifier table (whole-word, case-sensitive, in every file listed): `plan-doc`→`pr-doc`, `plan-docs`→`pr-docs`, `planDoc`→`prDoc` (keep the fallback read in `sessions.ts`), `PlanDoc`→`PrDoc`, `plansPageId`→`requestsPageId`, `ensurePlansPage`→`ensureRequestsPage`, `createPlanDoc`→`createPrDoc`, `finishPlanDoc`→`finishPrDoc`, `adoptPlanDoc`→`adoptPrDoc`, `closePlanDoc`→`closePrDoc`, `readPlanDoc`→`readPrDoc`, `planDefinition`→`prDefinition`, `planSlug`→`prSlug`, `planTitle`→`prTitle`, `planDocBody`→`prDocBody`, `planDocPath`→`prDocPath`, `planStatusOnEnd`→`prStatusOnEnd`, `PlanEndStatus`→`PrEndStatus`, `PlanWindow`→`PrWindow`, `plansOf`→`prsOf`, `SessionPlan`→`SessionPr`, `PlanItem`→`PrItem`, `PlanFolder`→`RequestFolder`, `PlanList`→`PrList`, `PLAN_STATUSES`→`PR_STATUSES`, `planDocNote`→`prDocNote`, `librarianPlanNote`→`refiningNote` (text rewritten in Task 5; for now only the name and `plan:`→`pr:`), `planFirst` — delete the function and its call sites (the "plan first" protocol goes; `Session.plan`, the `plan:` body flags of the sessions and message routes, the `plan` checkbox in `Assign` and `CommandBox` are removed), `'plan'` kind literals → `'pr'` (`work.ts` plansByFile, `WorkGroupBy`, `work-io.ts`, `pr-doc.ts` prsOf, `pr-docs.ts`, `ContextCard` kinds, `lib/graph.js` and `lib/impact.js` `NOT_THROUGH`, `lib/parse.js:513` forgetting rule), `plan:`→`pr:` in every string, `plan-`→`pr-` in slugs and CSS class names, `module:${p}-plans`→`module:${p}-requests`, `/plans`→`/requests` in links (`Rail`, `TopBar` `PAGE_ICONS` key `requests: '🗺️'`), statuses `proposed`→`draft`, `defining`→`refining`, `defined`→`approved` where a status string is compared (`work-io.ts:29` list becomes `['draft', 'refining', 'approved', 'building']`; the "defined" check on Build in `TaskWork` becomes `readiness.ok`).

Wording in prose/comments/UI: "plan document" → "PR document" / "the request", "Plans" → "Requests", "plan" (the object) → "PR"; keep "plan" only where it means planning as a verb.

`bin/wf.js`: `async pr()` with the body of `plan()` (`wye pr <ref> [--status]`, `wye pr build <ref> …` — Build stays; the librarian no longer runs it, so drop that comment), plus `async plan() { console.error('plan is now pr'); return this.pr(); }`; the usage block: `wye pr`, `wye propose … --pr <ref>` (`--plan` still accepted).

`schema/base-ontology.md`: `type:plan` → `type:pr`, purpose "A Prompt Request — one per request: `pr-<slug>` under the project's Requests page, holding the request, its context, the definition (the blocks it proposes), its impact, the tasks and — once built — the result. Statuses draft | refining | approved | building | done | failed | cancelled. Written by the app at start, approval and end, by the agent and the person while they refine (rule:pr-type-base)."

`ensureRequestsPage` body: title "Requests", intro "Every request to the product is a Prompt Request under this page (type:pr): what was asked, what it touches, the blocks it proposes, its impact, the tasks and — when built — the result. ⌘P creates one; it is refined until clear, approved here, then built by an agent.", `<!-- view:pr -->`.

- [ ] **Step 2: Compile and test**

Run: `cd packages/web && npx tsc --noEmit -p . && npx vitest run` — fix until green (the renamed tests: `consolidate.test.ts` plan fixture → `pr-plan-gross`? no: the fixture document becomes `pr-gross.md` with `node: pr:pr-gross`, `type: pr`; `work.test.ts` nodes `plan:plan-a` → `pr:pr-a`; `graph-diff.test.ts` likewise). Run `npm test` (root scripts unaffected except `lib/graph.js`/`lib/parse.js` — `test/memory.js` covers forgetting: its fixture `type: plan` → `type: pr`).

- [ ] **Step 3: Run the app once**

`npm run dev`; open `/waterfall/requests` (page renders, empty until Task 3 migrates); the rail shows "Requests"; ⌘P still sends (names only changed).

- [ ] **Step 4: Commit Tasks 1+2**

```bash
git add -A packages/web/src lib bin prompts templates schema
git commit -m "pr: the plan document is the Prompt Request — pr:<slug> / pr-<slug>.md under Requests, type:pr, PR_STATUSES draft → refining → approved → building → done | failed | cancelled, readiness computed (lib/pr-doc, lib/pr-docs, op:api.pr, RequestFolder, PrList, wye pr; plan first and the defining/defined statuses retired)"
```

---

### Task 3: Migration — `scripts/plans-to-prs.js`

**Files:**
- Create: `scripts/plans-to-prs.js`, `test/plans-to-prs.js` (add to the root "test" script)
- Run on: `data/products/waterfall` (and any other product under `data/products` with `type: plan` documents — `test`, the eval products are scratch and gitignored: skip them unless they have plan docs; the script takes `--product` or `--all`)

**Interfaces:** `migrate(productDir, { dry }) → { docs: string[]; refs: number; sessions: number; pages: string[] }` (exported for the test).

- [ ] **Step 1: Write the test** (a scratch copy: a project with `plans.md`, two plan docs — one `defining` with a session json that holds `planDoc` and status `running`, one `done` — and a third document referencing `plan:plan-x` in prose and `part of plan:plan-x` on a task line)

```js
// test/plans-to-prs.js
'use strict';
// scripts/plans-to-prs (Prompt Requests D1): every type:plan document becomes a type:pr one — file, node, type,
// status, part-of, the Plans page, every reference in the product, every session's planDoc.
const fs = require('fs'); const path = require('path'); const os = require('os'); const assert = require('assert');
const { migrate } = require('../scripts/plans-to-prs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wye-mig-'));
const docs = path.join(tmp, 'projects/p/docs'); fs.mkdirSync(docs, { recursive: true }); fs.mkdirSync(path.join(tmp, '_sessions'), { recursive: true });
fs.writeFileSync(path.join(tmp, '_product.md'), '---\ntitle: T\n---\n');
fs.writeFileSync(path.join(docs, 'plans.md'), '---\nnode: module:p-plans\ntype: module\ntitle: Plans\n---\n\n# Plans\n\n<!-- view:plan -->\n');
fs.writeFileSync(path.join(docs, 'plan-x.md'), '---\nnode: plan:plan-x\ntype: plan\ntitle: X\nstatus: defining\nsession: s1\npart-of: module:p-plans\n---\n\n# X\n\n## Tasks\n\n- [ ] task:plan-x X #in-progress (worker: claude-code, session: s1)\n');
fs.writeFileSync(path.join(docs, 'plan-y.md'), '---\nnode: plan:plan-y\ntype: plan\ntitle: Y\nstatus: done\nsession: s2\npart-of: module:p-plans\n---\n\n# Y\n');
fs.writeFileSync(path.join(docs, 'other.md'), '---\nnode: module:other\ntitle: O\n---\n\nSee plan:plan-x and plan:plan-y.\n\n- [ ] task:o.one Do #open (part-of: plan:plan-x)\n');
fs.writeFileSync(path.join(tmp, '_sessions/s1.json'), JSON.stringify({ id: 's1', status: 'running', planDoc: 't/p/plan-x', refs: ['task:plan-x'] }));
fs.writeFileSync(path.join(tmp, '_sessions/s2.json'), JSON.stringify({ id: 's2', status: 'done', planDoc: 't/p/plan-y' }));
const r = migrate(tmp, {});
assert.deepStrictEqual(r.docs.sort(), ['pr-x', 'pr-y']);
assert.ok(!fs.existsSync(path.join(docs, 'plan-x.md')) && fs.existsSync(path.join(docs, 'pr-x.md')));
const x = fs.readFileSync(path.join(docs, 'pr-x.md'), 'utf8');
assert.match(x, /^node: pr:pr-x$/m); assert.match(x, /^type: pr$/m); assert.match(x, /^status: refining$/m); assert.match(x, /^part-of: module:p-requests$/m); assert.match(x, /- \[ \] task:pr-x X/);
assert.match(fs.readFileSync(path.join(docs, 'pr-y.md'), 'utf8'), /^status: done$/m);
const rq = fs.readFileSync(path.join(docs, 'requests.md'), 'utf8');
assert.ok(!fs.existsSync(path.join(docs, 'plans.md'))); assert.match(rq, /^node: module:p-requests$/m); assert.match(rq, /^title: Requests$/m); assert.match(rq, /view:pr/);
const o = fs.readFileSync(path.join(docs, 'other.md'), 'utf8');
assert.match(o, /See pr:pr-x and pr:pr-y\./); assert.match(o, /part-of: pr:pr-x/);
const s1 = JSON.parse(fs.readFileSync(path.join(tmp, '_sessions/s1.json'), 'utf8'));
assert.strictEqual(s1.prDoc, 't/p/pr-x'); assert.strictEqual(s1.planDoc, undefined); assert.deepStrictEqual(s1.refs, ['task:pr-x']);
assert.strictEqual(migrate(tmp, {}).docs.length, 0); // idempotent
console.log('plans-to-prs: ok');
```

- [ ] **Step 2: Write the script**

```js
// scripts/plans-to-prs.js
'use strict';
// One-off (Prompt Requests D1): plan documents become Prompt Requests. Per product: every `type: plan` document is
// renamed plan-<x>.md → pr-<x>.md with node pr:pr-<x>, type pr, the status mapped (proposed | defining | defined →
// refining when a running session holds it, else draft; the rest unchanged), part-of → the Requests page; the
// Plans page plans.md → requests.md (module:<p>-requests, "Requests", view:pr); every reference plan:<x> anywhere in
// the product's documents → pr:<x>; every session's planDoc → prDoc with the new slug, its refs likewise.
// Usage: node scripts/plans-to-prs.js --product waterfall | --all [--dry]
const fs = require('fs'); const path = require('path');

const walk = (dir) => { let out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!['_build', 'node_modules', '.git'].includes(e.name)) out = out.concat(walk(p)); } else out.push(p); } return out; };
const fm = (md) => md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
const get = (md, k) => fm(md).match(new RegExp(`^${k}:[ \\t]*(.*)$`, 'm'))?.[1].trim();
const set = (md, k, v) => { const f = md.match(/^---\n([\s\S]*?)\n---/); if (!f) return md; const re = new RegExp(`^${k}:.*$`, 'm'); const body = re.test(f[1]) ? f[1].replace(re, `${k}: ${v}`) : `${f[1]}\n${k}: ${v}`; return `---\n${body}\n---${md.slice(f[0].length)}`; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function migrate(productDir, { dry = false } = {}) {
  const files = walk(productDir).filter(f => f.endsWith('.md'));
  const sessionsDir = path.join(productDir, '_sessions');
  const sessions = fs.existsSync(sessionsDir) ? fs.readdirSync(sessionsDir).filter(n => n.endsWith('.json')).map(n => path.join(sessionsDir, n)) : [];
  const running = new Set(sessions.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }).filter(s => s && s.status === 'running').flatMap(s => [s.planDoc, s.prDoc]).filter(Boolean));
  const plans = files.filter(f => /^type:\s*plan\s*$/m.test(fm(fs.readFileSync(f, 'utf8'))));
  const renames = new Map(); // 'plan:plan-x' → 'pr:pr-x', plus the slugs
  const docs = [];
  for (const f of plans) {
    const md = fs.readFileSync(f, 'utf8'); const slug = path.basename(f, '.md'); const next = slug.replace(/^plan-/, 'pr-');
    renames.set(`plan:${slug}`, `pr:${next}`); renames.set(`task:${slug}`, `task:${next}`); docs.push({ f, slug, next, md });
  }
  const pages = [];
  for (const f of files) { const md = fs.readFileSync(f, 'utf8'); const node = get(md, 'node'); if (node && /^module:.+-plans$/.test(node)) { renames.set(node, node.replace(/-plans$/, '-requests')); pages.push(f); } }
  const write = (f, md) => { if (!dry) fs.writeFileSync(f, md); };
  const rewrite = (md) => { let out = md; for (const [from, to] of renames) out = out.replace(new RegExp(`(?<![\\w:/-])${esc(from)}(?![\\w-])`, 'g'), to); return out; };
  let refs = 0;
  for (const d of docs) {
    let md = rewrite(d.md);
    md = set(md, 'type', 'pr');
    const st = get(md, 'status') ?? 'draft';
    const ref = `${path.basename(productDir)}/${path.basename(path.dirname(path.dirname(d.f)))}/${d.slug}`;
    if (['proposed', 'defining', 'defined'].includes(st)) md = set(md, 'status', running.has(ref) ? 'refining' : 'draft');
    write(path.join(path.dirname(d.f), `${d.next}.md`), md); if (!dry) fs.unlinkSync(d.f);
  }
  for (const f of pages) {
    let md = rewrite(fs.readFileSync(f, 'utf8'));
    md = set(md, 'title', 'Requests').replace(/^# Plans$/m, '# Requests').replace(/<!-- view:plan -->/g, '<!-- view:pr -->');
    write(path.join(path.dirname(f), 'requests.md'), md); if (!dry && path.basename(f) === 'plans.md') fs.unlinkSync(f);
  }
  for (const f of files) {
    if (plans.includes(f) || pages.includes(f)) continue;
    const md = fs.readFileSync(f, 'utf8'); const out = rewrite(md);
    if (out !== md) { refs += (md.match(/plan:plan-/g) ?? []).length; write(f, out); }
  }
  let n = 0;
  for (const f of sessions) {
    let s; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    const doc = s.prDoc ?? s.planDoc; if (!doc && !s.refs) continue;
    let changed = false;
    if (doc) { const parts = doc.split('/'); const slug = parts[2] ?? ''; const next = slug.replace(/^plan-/, 'pr-'); if (s.planDoc !== undefined || next !== slug) { s.prDoc = [parts[0], parts[1], next].join('/'); delete s.planDoc; changed = true; } }
    if (Array.isArray(s.refs)) { const r2 = s.refs.map(r => renames.get(r) ?? r); if (r2.some((r, i) => r !== s.refs[i])) { s.refs = r2; changed = true; } }
    if (Array.isArray(s.plans)) { s.prs = s.plans; delete s.plans; changed = true; }
    if (changed) { n++; write(f, JSON.stringify(s)); }
  }
  return { docs: docs.map(d => d.next), refs, sessions: n, pages: pages.map(f => path.dirname(f)) };
}
module.exports = { migrate };

if (require.main === module) {
  const args = process.argv.slice(2); const dry = args.includes('--dry');
  const root = path.join(__dirname, '..', 'data', 'products');
  const products = args.includes('--all') ? fs.readdirSync(root).filter(n => !n.startsWith('.') && fs.existsSync(path.join(root, n, '_product.md'))) : [args[args.indexOf('--product') + 1]].filter(Boolean);
  if (!products.length) { console.error('usage: node scripts/plans-to-prs.js --product <slug> | --all [--dry]'); process.exit(1); }
  for (const p of products) { const r = migrate(path.join(root, p), { dry }); console.log(`${p}: ${r.docs.length} document(s) → pr, ${r.pages.length} Requests page(s), ${r.refs} reference(s), ${r.sessions} session(s)${dry ? ' (dry run)' : ''}`); }
}
```

- [ ] **Step 3: Test, dry-run, run, check**

Run: `node test/plans-to-prs.js` → `plans-to-prs: ok`. Then `node scripts/plans-to-prs.js --all --dry` (read the counts), `node scripts/plans-to-prs.js --all`, `node bin/ctx.js check --root data/products/waterfall` (0 errors; compare warnings with before), `grep -rn "plan:plan-\|type: plan\b" data/products/waterfall` → nothing. Also `data/products/waterfall/projects/v2/docs/prd-execution.md:110` `type:plan` card → `type:pr` with the new statuses in its comment. Also the Requests page for each project: there is `plans.md` in `v2` (and wherever the script found one).

- [ ] **Step 4: Commit**

```bash
git add scripts/plans-to-prs.js test/plans-to-prs.js package.json data/products/waterfall
git commit -m "pr: the 27 plan documents migrated to Prompt Requests (scripts/plans-to-prs — files, nodes, statuses, the Requests page, every reference, the sessions' prDoc), ctx check green"
```

---

### Task 4: Readiness on the page, Approve / Cancel

**Files:**
- Create: `packages/web/src/components/PrHead.tsx`
- Modify: `packages/web/src/app/[product]/[project]/d/[doc]/page.tsx:29` (render `PrHead` above `DocProps` when `split.frontmatter.type === 'pr'`)
- Modify: `packages/web/src/app/api/[product]/pr/route.ts` (`PATCH { ref, action: 'approve' | 'cancel' | 'reopen', by? }`)
- Modify: `packages/web/src/lib/pr-docs.ts` (`approvePr`, `cancelPr`, `reopenPr`)
- Modify: `packages/web/src/components/PrList.tsx` (Approve / Cancel on a row; the readiness dot)
- Modify: `packages/web/src/components/TaskWork.tsx:54` (Build only when `status === 'approved'`; the warning text from `readiness.unagreed`)
- Modify: `bin/wf.js` (`wye pr approve <ref>`, `wye pr cancel <ref>`)
- Test: `packages/web/src/lib/pr-docs.test.ts` (new — approve on a scratch product)

**Interfaces (Produces):**
- `approvePr(productDir, product, ref, by) → { status: 'approved'; stopped?: string }`: sets `status: approved`, `approved-by`, `approved-at`; every running librarian session whose `prDoc` is `ref` gets `sendMessage(... { text: 'The request was approved by <by> — stop here; say in one line what is on the page.' })` then `stopChat(id, 'approved — the build is the dispatcher\'s')`; the request task line stays as it is (Build assigns it).
- `cancelPr(productDir, product, ref, by)` → `status: cancelled`, `finished`, the refining session stopped the same way, the request task `todo` → unchanged (`requestTaskStatusOnEnd(cur, 'cancelled')`).
- `reopenPr` → `approved | cancelled` → `draft` (clears `approved-*`).

- [ ] **Step 1: Test**

```ts
// packages/web/src/lib/pr-docs.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { approvePr, cancelPr, reopenPr, readPrDoc, prReadiness } from './pr-docs';
import { rebuild } from './write'; import { REPO_ROOT } from './products'; import { loadScope } from './scope';

// approval (spec §3): the person's click sets approved with who and when; cancel and reopen move it back
describe('pr approval', () => {
  let dir: string; let product: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(REPO_ROOT, 'data/products/', 'zz-pr-')); product = path.basename(dir);
    await mkdir(path.join(dir, 'projects/p/docs'), { recursive: true });
    await writeFile(path.join(dir, '_product.md'), '---\ntitle: T\n---\n');
    await writeFile(path.join(dir, 'projects/p/docs/requests.md'), '---\nnode: module:p-requests\ntype: module\ntitle: Requests\n---\n\n# Requests\n');
    await writeFile(path.join(dir, 'projects/p/docs/pr-a.md'), '---\nnode: pr:pr-a\ntype: pr\ntitle: A\nstatus: draft\npart-of: module:p-requests\n---\n\n# A\n\n## Definition\n\n```yaml\n- id: req:t.a\n  title: A\n  status: proposed\n```\n\n## Tasks\n\n- [ ] task:pr-a A #todo\n');
    await rebuild(dir);
  });
  it('approves with who and when, even when not ready', async () => {
    const scope = (await loadScope(product))!; const pr = (await readPrDoc(product, `${product}/p/pr-a`))!;
    const r = prReadiness(scope, pr.md); expect(r.ok).toBe(false); expect(r.unagreed).toEqual(['req:t.a']); expect(r.tasks).toBe(true);
    expect((await approvePr(dir, product, `${product}/p/pr-a`, 'alex')).status).toBe('approved');
    const md = await readFile(path.join(dir, 'projects/p/docs/pr-a.md'), 'utf8');
    expect(md).toMatch(/^status: approved$/m); expect(md).toMatch(/^approved-by: alex$/m); expect(md).toMatch(/^approved-at: \d{4}-/m);
    await reopenPr(dir, product, `${product}/p/pr-a`);
    expect(await readFile(path.join(dir, 'projects/p/docs/pr-a.md'), 'utf8')).toMatch(/^status: draft$/m);
    await cancelPr(dir, product, `${product}/p/pr-a`, 'alex');
    expect(await readFile(path.join(dir, 'projects/p/docs/pr-a.md'), 'utf8')).toMatch(/^status: cancelled$/m);
  });
});
```

(The scratch product lives under `data/products/` because `loadScope` reads from `DATA_ROOT`; `zz-*` is added to `data/products/.gitignore`; the test removes it in `afterAll`.)

- [ ] **Step 2: Implement `approvePr` / `cancelPr` / `reopenPr` in `pr-docs.ts`**

```ts
// Approval (spec §3): the person's click. Sets the status and who / when; a live refining session on the request is
// told once and stopped — the build is the dispatcher's (D2) or Build's, never the librarian's.
export async function approvePr(productDir: string, product: string, ref: string, by: string): Promise<{ status: 'approved'; stopped?: string }> {
  const at = await prDocFile(product, ref); if (!at) throw new Error(`${ref}: not found`);
  await withFileLock(at.file, async () => { const md = await readFile(at.file, 'utf8'); await writeAtomic(at.file, setFrontmatter(setFrontmatter(setFrontmatter(md, 'status', 'approved'), 'approved-by', by), 'approved-at', new Date().toISOString())); });
  const stopped = await stopRefining(productDir, ref, `The request was approved by ${by} — stop here; say in one line what is on the page.`);
  await rebuild(productDir);
  return { status: 'approved', ...(stopped ? { stopped } : {}) };
}
export async function cancelPr(productDir: string, product: string, ref: string, by: string): Promise<void> {
  const at = await prDocFile(product, ref); if (!at) throw new Error(`${ref}: not found`);
  await withFileLock(at.file, async () => { let md = await readFile(at.file, 'utf8'); md = setFrontmatter(setFrontmatter(md, 'status', 'cancelled'), 'finished', new Date().toISOString()); const cur = requestTaskStatus(md, at.slug); if (cur !== undefined) md = withRequestTaskStatus(md, at.slug, requestTaskStatusOnEnd(cur, 'cancelled')); await writeAtomic(at.file, md); });
  await stopRefining(productDir, ref, `The request was cancelled by ${by} — stop here.`);
  await rebuild(productDir);
}
export async function reopenPr(productDir: string, product: string, ref: string): Promise<void> {
  const at = await prDocFile(product, ref); if (!at) throw new Error(`${ref}: not found`);
  await withFileLock(at.file, async () => { const md = await readFile(at.file, 'utf8'); await writeAtomic(at.file, setFrontmatter(md, 'status', 'draft').replace(/^approved-(by|at):.*\n/gm, '').replace(/^finished:.*\n/m, '')); });
  await rebuild(productDir);
}
// the refining session(s) on a request: one message, then stopped; returns the first id stopped
async function stopRefining(productDir: string, ref: string, text: string): Promise<string | undefined> {
  let first: string | undefined;
  for (const s of await listSessions(productDir)) {
    if (s.role !== 'librarian' || s.prDoc !== ref || !isLive(s.id)) continue;
    try { await sendMessage(productDir, s.id, { text }); } catch { /* the stop follows anyway */ }
    stopChat(s.id, 'stopped — the request was approved or cancelled'); first ??= s.id;
  }
  return first;
}
```

Imports from `./agent-host` (`isLive`, `sendMessage`, `stopChat`) — `pr-docs.ts` is already imported by `agent-host.ts` (for `onSessionEnd`)? Check for a cycle: `agent-host.ts` imports `pr-docs`; adding `pr-docs → agent-host` makes a cycle. Break it: put `stopRefining` in a new `packages/web/src/lib/pr-sessions.ts` that imports both, and have the route call `approvePr` (pure file edit + rebuild) then `stopRefining`. So `approvePr`/`cancelPr` in `pr-docs.ts` do not stop anything; the route composes. The test above then only checks the file (no live session).

- [ ] **Step 3: Route, CLI, page head**

`pr/route.ts` PATCH body `{ ref, status? , action?: 'approve' | 'cancel' | 'reopen', by? }`: `action` wins; `approve` → `approvePr` then `stopRefining(... approved …)`; `cancel` → `cancelPr` then `stopRefining`; `reopen` → `reopenPr`. GET adds `readiness: prReadiness(scope, pr.md)`.

`bin/wf.js` `pr`: `wye pr approve <ref>` / `wye pr cancel <ref>` → PATCH with the action and `by: flags.by || 'cli'`; `wye pr <ref>` prints the readiness lines (`✓ definition · ✓ agreed · ✓ impact · ✗ contradictions (rule:x) · ✓ tasks`).

`PrHead.tsx` (client): props `{ product, ref, node }`; fetches `GET /api/<p>/pr?ref=`; shows the status pill, the readiness checklist (five items, `✓`/`✗`, the unagreed and contradicted ids as `SmartTag`s), and the buttons: `draft | refining` → **Approve** (+ Cancel); `approved` → **Build** (opens `Assign` with `build: ref`, as `TaskWork` does — import and reuse `Assign` with the request task item from `GET /api/<p>/work/<task>`; simplest: the head links "Build" to the task's panel: `open(task)`) + **Reopen** + Cancel; `building` → "building — session <id>" link; `done | failed | cancelled` → **Reopen**. Approve when `!readiness.ok`: `confirm`-free: a second click state — the button turns into "Approve anyway? n unagreed, k contradictions" and the next click sends. Refreshes on `wf:changed` events (LiveRefresh already re-renders the page; the head refetches on mount and on a `visibilitychange`/interval of 5 s while `refining`).

`d/[doc]/page.tsx`: `{split.frontmatter.type === 'pr' && <PrHead product={product} ref={`${product}/${project}/${d.slug}`} node={d.module.id} />}` before `<DocProps …>`.

`PrList.tsx` rows (the Requests folder list / page): a readiness dot (green when ok) and the Approve / Cancel buttons calling the same PATCH.

- [ ] **Step 4: Test, run, commit**

`npx vitest run src/lib/pr-docs.test.ts src/lib/pr-doc.test.ts`; tsc; in the app open a migrated `draft` PR: the head shows the checklist; Approve → `approved`; Reopen → `draft`.

```bash
git add -A packages/web/src bin/wf.js data/products/.gitignore
git commit -m "pr: readiness on the request's head (definition · agreed · impact · contradictions · tasks) and Approve / Cancel / Reopen — the person's click sets approved with who and when, a live refining session is told and stopped (op:api.pr actions, wye pr approve|cancel, component:pr-head)"
```

---

### Task 5: ⌘P modes and the refining session

**Files:**
- Modify: `packages/web/src/components/CommandBox.tsx` (the intent row → the mode row; `wf-cmd-mode`)
- Modify: `packages/web/src/app/api/[product]/sessions/route.ts` (`pr: boolean`; `role: 'librarian'` implied by `pr: true`)
- Modify: `packages/web/src/lib/agent-host.ts` (`refiningNote` text; `buildPrompt` uses it for a librarian with a `prDoc`; ad-hoc sessions get `prDocNote` only when they have one — they do not)
- Modify: `packages/web/src/lib/pr-docs.ts` (`createPrDoc` sets `refining` for a librarian; `onSessionEnd`: a librarian's PR goes `refining → draft` unless approved/cancelled meanwhile)
- Modify: `prompts/librarian-system.md` (the refining loop; never build, never approve)
- Modify: `packages/web/src/lib/agent-prompt.ts` if it repeats the plan-first text

**Interfaces:** `POST /api/<p>/sessions { instruction, refs, source, images, pr: true }` → librarian on the host, `prDoc` set, PR `refining`, response `{ id, prDoc }`; the box navigates to `prDocPath(prDoc)` and the conversation opens in the column (as Ask Wye does today). `{ …, pr: false, agent, cwd, mode: 'chat' }` → ad-hoc: no document.

- [ ] **Step 1: The box**

Replace the intent radiogroup with:

```tsx
<div className="palette-row palette-intent" role="radiogroup" aria-label="Mode">
  <button type="button" className={`chip ${mode === 'pr' ? 'on' : ''}`} onClick={() => setMode('pr')} title="A request: a page, refined with Wye until it is clear, approved by you, then built">PR</button>
  <button type="button" className={`chip ${mode === 'adhoc' ? 'on' : ''}`} onClick={() => setMode('adhoc')} title="A conversation with an agent on what you are looking at; nothing is written unless you ask">Ad-hoc</button>
  <span className="muted palette-note">{mode === 'pr' ? 'a request: refine → approve → build' : 'a conversation, no request'}</span>
</div>
```

`mode` state initialised from `localStorage['wf-cmd-mode']` (default `'pr'`), written on change (try/catch). The target row stays (new / a conversation / runner) — in PR mode the target row is hidden (a PR always starts a new refining session); in ad-hoc mode it works as today without the plan checkbox. `run()`: PR → `POST /api/<p>/sessions { pr: true, instruction, refs, source, images }` then `router.push(prDocPath(j.prDoc))` and open the session in the column (`open('session:' + j.id)`); ad-hoc → the existing new-session path with `pr: false` (no `plan`). The Go button says `Request ↵` / `Talk ↵` / `Send ↵` / `Queue ↵`.

- [ ] **Step 2: The route and the notes**

`sessions/route.ts` POST: `const pr = body.pr === true; const role = pr || body.role === 'librarian' ? 'librarian' : 'worker';` (Ask Wye buttons keep sending `role: 'librarian'` — they become PRs too); `createPrDoc` only when `pr || role === 'librarian'` (an ad-hoc session never gets a document); response includes `prDoc`.

`agent-host.ts` `refiningNote(prDoc)`:

```ts
// The refining brief (spec §2): the librarian fills the request's page until it is ready; the person approves it there.
export function refiningNote(prDoc?: string): string {
  if (!prDoc) return '\n## The request\nNo request page could be created; propose blocks into the documents where they belong and list them in your reply.';
  const slug = prDoc.split('/')[2];
  return `\n## The request page
This conversation refines the Prompt Request \`${prDoc}\` (node \`pr:${slug}\`, status refining) until it is clear and agreed. The person reads it live. Work on the page, not in chat:
- **Context**: what the request touches — modules, documents, nodes, code paths — as tags (\`kind:slug\`) and embeds (\`![[kind:slug]]\`), and what you understood, in prose (\`wye doc write\`, this section only).
- **Definition**: every block the request needs — requirements (when / then / unless, in the person's words), decisions (a choice with alternatives), constraints, questions for what you cannot decide, tasks — proposed into their home documents with \`wye propose --pr ${prDoc}\` (they embed here by themselves); edits of existing blocks with \`wye node set\` under your session (they are tracked as change records and embedded too).
- Say plainly when the request is already satisfied, partly, or contradicts a constraint or decision in force.
- Ask at most three questions at a time, as question: blocks on the page, only for what the requirement shape leaves open or a constraint makes ambiguous, with the reading you would assume first.
The request is ready when its readiness list is green (\`wye pr ${prDoc}\`): a Definition, every block agreed, no open contradiction, at least one task. When it is, say so in one line and stop. Never edit code. Never approve and never build — approval is the person's click on the page; the build starts from there.`;
}
```

`buildPrompt`: a librarian session with a `prDoc` gets `refiningNote(s.prDoc)` (replacing `librarianPlanNote` + `librarianProtocol`); a worker with a `prDoc` (Build) keeps `prDocNote`; an ad-hoc session gets neither and a one-line "This is an ad-hoc conversation: nothing is written unless the person asks; blocks you do write are tracked as this session's artifacts."

`prompts/librarian-system.md`: the "when the person says build it, run wye plan build" paragraph is replaced by "When the person says build it / go ahead: tell them the request is approved by the Approve button on its page (you cannot approve or build), and say whether the readiness list is green."

`pr-docs.ts` `onSessionEnd` librarian branch: the PR `refining` → `draft` when its status is still `refining` (approved / cancelled stay) — `librarianLeft` does that in addition to the request task `review`.

- [ ] **Step 3: Test and try**

`CommandBox` has no unit test; the sessions route logic is small — a vitest on `createPrDoc` status (`refining` for a librarian, `draft` otherwise) in `pr-docs.test.ts`. In the app: ⌘P, PR mode, type a request → lands on `pr-…` page with the conversation in the column, head says `refining`; Approve → the console shows the message and the session stops; ⌘P ad-hoc → a conversation, no new document under Requests.

- [ ] **Step 4: Commit**

```bash
git add -A packages/web/src prompts
git commit -m "⌘P: two modes — PR (the request page, a refining librarian session until the readiness list is green, approved by the person) and Ad-hoc (a conversation, no document); the refining brief replaces plan-first and the librarian never builds"
```

---

### Task 6: Knowledge, cards, tests, UI check

**Files:**
- Modify: the v2 docs — `req:wf2.pr` (requirements-shell or app-agents, where `req:wf2.sessions.plan-doc` lives: rewrite that req as `req:wf2.pr.document`, keep the id with `superseded-by` if the repo's convention asks; simplest: rewrite in place and rename the id, updating references with a grep), `rule:pr-doc` (was `rule:plan-doc`), `decision:exec.plan-lifecycle` → superseded by `decision:wf2.pr-lifecycle` (draft → refining → approved → building), `decision:wf2.pr-approval-is-the-persons-click`, `decision:wf2.cmd-modes`, `decision:exec.librarian-may-build` → `status: superseded`, `superseded-by: decision:wf2.pr-approval-is-the-persons-click`; `rule:plans-folder` → `rule:requests-folder`; cards via `npm run cards` (`component:pr-head`, `component:request-folder`, `component:pr-list`, `lib:pr-doc`, `lib:pr-docs`, `lib:pr-sessions`, `op:api.pr`, `page:web/requests`, retired plan ones re-pointed by the generator); `test:plans-to-prs` card.
- UI test: `ui-test:pr` — a playwright-core script in the scratchpad against the dev server on a scratch product (`zz-ui-pr`, gitignored): ⌘P PR mode creates `pr-…` and the head shows `refining`; Approve on a draft asks once (unagreed) and sets `approved`; Ad-hoc creates no document. Record the result as `ui-test:pr` in `test-design.md`.

- [ ] **Step 1:** `npm run cards`, write the knowledge cards, `node bin/ctx.js check --root data/products/waterfall` (0 errors), `npm test` green.
- [ ] **Step 2:** Run the UI script; fix what it finds.
- [ ] **Step 3:** Commit.

```bash
git add data/products/waterfall
git commit -m "knowledge: req:wf2.pr, rule:pr-doc, decision:wf2.pr-lifecycle, decision:wf2.pr-approval-is-the-persons-click, decision:wf2.cmd-modes; decision:exec.librarian-may-build superseded; cards for pr-head, request-folder, pr-list, lib pr-doc / pr-docs / pr-sessions, op:api.pr, page:web/requests; ui-test:pr passed"
```
