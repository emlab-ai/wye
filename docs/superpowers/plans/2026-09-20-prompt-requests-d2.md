# Prompt Requests D2 Implementation Plan — the scheduler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An approved PR is built by the app itself: a worker session starts on it as soon as a slot is free (N parallel runners from Settings) and its scope does not overlap a PR already building; the PR head and the PRs folder say why one waits.

**Architecture:** `lib/pr-scope.ts` (pure) computes a PR's scope from its Definition, the request's tags and `lib/impact.js` structural candidates, written to the frontmatter (`scope`, `scope-of`) whenever the Definition changes; `lib/dispatch.ts` holds the pure `pickNext` and the host-side `dispatch(product)` that reuses `assignTask(... build)` to start workers — run on approve, on every session end and on a tick. Settings gains an Agents section. External `wye runner` processes are unchanged (they take tasks, not PRs).

**Tech Stack:** as D1. **Spec:** `docs/superpowers/specs/2026-09-20-prompt-requests-design.md` §5–6.

## Global Constraints
- Scope ids exclude `pr: session: block: module:`; overlap = non-empty intersection.
- N default 1, 1–8; default build agent `claude-code`.
- No head-of-line blocking: a waiting PR does not stop the ones behind it.
- A PR is *building* when its status is `building` and a session named on it is live or queued; a `building` PR with no such session is stale → `approved` again (the dispatcher repairs it).
- Every task: tsc + vitest green; commit to main.

---

### Task 1: `pr-scope.ts` — scope, overlap, freshness
**Files:** create `packages/web/src/lib/pr-scope.ts`, `pr-scope.test.ts`; modify `pr-docs.ts` (`refreshScope`, called from `trackDefinitions` and after intake), `pr-doc.ts` (`readiness(..., impactFresh)` fed from `scope-of`), `pr-intake.ts` (calls `refreshScope` at the end), `pr/route.ts` (readiness impact from the frontmatter).
**Interfaces:** `scopeIds(graph, md) → string[]` (Definition ids ∪ ids tagged in the Request section ∪ structural candidates ≥ 0.5 of those, capped 60); `scopeHash(defIds) → 8 hex`; `overlap(a: string[], b: string[]) → string[]`; `conflicts(me: {ref, scope}, others: {ref, scope, num}[]) → { ref, num, shared: string[] }[]`; `parseScope(md) → { scope: string[]; of: string }`; `refreshScope(productDir, product, ref)` writes `scope: [..]` and `scope-of: <hash>`; readiness `impact` = `scope-of === scopeHash(definitionIds(md))`.
- [ ] Test: scopeIds from a small graph (definition + request tag + one structural hop), overlap/conflicts, parseScope round trip through `setFrontmatter`.
- [ ] Implement; wire `refreshScope` into `trackDefinitions` (after `embedInDefinition` added something) and at the end of `runIntake`; readiness reads the frontmatter.
- [ ] Commit.

### Task 2: Settings › Agents
**Files:** `settings.ts` (`agents?: { parallel?: number; agent?: string }`, `agentSettings(root) → { parallel: number; agent: string }`), `settings.test.ts`, `api/settings/route.ts` (PUT accepts `agents`), `SettingsJev.tsx` → new `SettingsAgents.tsx` on the page.
- [ ] Test: defaults (1, claude-code), clamp 1–8, unknown agent → default.
- [ ] Implement + page section ("Agents — parallel runners N; default agent for builds").
- [ ] Commit.

### Task 3: `dispatch.ts`
**Files:** create `packages/web/src/lib/dispatch.ts`, `dispatch.test.ts`; modify `pr/route.ts` (approve → `notifyDispatch`), `sessions.ts` / `pr-docs.ts` (`onSessionEnd` → `notifyDispatch`), `agent-host.ts` (import for the tick registration), `pr/route.ts` GET (`waiting` reason), `PrHead.tsx`, `PrFolder.tsx` (row note), `layout.tsx` (PrItem gets `waiting`).
**Interfaces:** `pickNext(approved: { ref: string; num: number; approvedAt: string; scope: string[] }[], building: { ref: string; scope: string[] }[], slots: number) → { start: string[]; waiting: Record<string, string> }` (waiting reason: `overlaps #12 (3 ids)` or `no free slot`); `dispatch(product, wfUrl?) → Promise<{ started: string[]; waiting: Record<string,string> }>`; `notifyDispatch(product)` (debounced 2 s); a 30 s tick per product registered on globalThis (dev-reload safe, like the impact state).
`dispatch`: load scope; approved = pr nodes with status approved (approvedAt from body); building = status building with a live/queued session (repair stale ones → approved); slots = N − building.length; for each `start`: request task (frontmatter `task:` or `task:<slug>` line) → `assignTask(scope, task, { worker: agent, build: ref, wfUrl, by: 'dispatcher', force: true })`; log line on the session `started by the dispatcher (slot k of N)`; write `waiting` reasons into a module map read by the GET route.
- [ ] Test `pickNext`: order by approvedAt, overlap skip without blocking the next, slots.
- [ ] Implement dispatch + triggers + the head/folder notes (`queued — waiting: overlaps #12`).
- [ ] Try live: approve a PR with N=1 → a build session starts; a second approved overlapping PR waits with the reason; a disjoint one with N=2 starts too.
- [ ] Commit.

### Task 4: knowledge
`decision:wf2.pr-scheduler` (scope = Definition + request tags + impact ≥ 0.5; N from Settings; dispatcher on approve/end/tick; no head-of-line blocking; external runners unchanged), `req:wf2.pr` amended (built by the app on approval), cards via `npm run cards`, `npm test`, `ctx check`. Commit.
