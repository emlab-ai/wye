# Hooks and skills H1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skills as documents under a Skills folder (the shipped prompts among them, attachable to PRs, types and hooks), hooks as cards in a Hooks document, and an engine that fires them on graph events with two actions — run a skill in a session on the node, add blocks from a template — every result through review. The example harness `hook:req-approved-tests` → `skill:define-tests` ships.

**Architecture:** `lib/hooks.ts` (pure: parse a hook card, events from a graph diff, match, fill a template) + `lib/hooks-run.ts` (the store `_hooks/`, `fire`, the actions, registrations); `lib/skills.ts` (Skills page, base skills from `prompts/`, a skill's body, attachments into a session's first message); the watcher, `approvePr` and `onSessionEnd` emit events. Rail: Skills and Hooks system folders like PRs.

**Spec:** `docs/superpowers/specs/2026-09-21-hooks-and-skills-design.md` §1–4 (H1 parts), §5 rail.

## Global Constraints
- Events: `created`, `status:<x>`, `linked:<verb>`, `pr.approved`, `pr.built`, `session.done`; `kind` may be `*`.
- `once: true` default; depth cap 3; never the same hook twice on one node; `WF_HOOKS=0` disables.
- Everything a hook writes is `status: proposed` with `by: hook:<slug>`; a run session is an ordinary session (`hook` field on it).
- tsc + vitest green per task; commit to main.

---

### Task 1: ontology, kinds, templates, pages
- `schema/base-ontology.md`: `type:skill` (extends type:module; props role enum [librarian, worker]?, takes string?, writes list of string?, skills list of skill?), `type:hook` (extends type:node; props on string, where string?, do text, once bool?, status), `type:template` (extends type:node; body text) for `add`. `schema/kinds.yaml`: skill, hook, template.
- `templates/docs/skill.md` (frontmatter node/type/title/role/takes/writes, body "## Instructions"), `templates/docs/skills.md`, `templates/docs/hooks.md` (with the example hook card and the `template:test-card` card), `templates/hooks/test-card.md`.
- `lib/pr-doc.ts`-style ids: `skillsPageId(project)`, `hooksPageId(project)`; `lib/skills.ts`: `ensureSkillsPage`, `ensureHooksPage`, `ensureBaseSkills(product)` writing `skill-refine.md`, `skill-build.md`, `skill-describe-module.md`, `skill-define-tests.md` from `prompts/*.md` + a new `prompts/define-tests.md` when missing.
- Rail: `SkillFolder`/`HookFolder` = one generic `SystemFolder` component (label, icon, items) reused by PRs? Keep PrFolder; add a small `PagesFolder` for Skills and Hooks (flat list, "+ skill"); `layout.tsx` takes both pages and their sub-documents out of the tree like PRs.
- Commit.

### Task 2: `lib/hooks.ts` (pure) + tests
- `HookDef = { id, on: { kind, event }, where: Record<string,string>, actions: Action[], once, status }`, `parseHook(node)`, `Action = { kind: 'run'; skill } | { kind: 'add'; template; to? } | { kind: 'assign'; task; worker } | { kind: 'notify'; text }`.
- `HookEvent = { kind, id, event, node?, verb?, session? }`; `eventsFromDiff(before, after, changes) → HookEvent[]` (created for added defined typed nodes; `status:<x>` for changed nodes whose status moved; `linked:<verb>` for new edges into a node — from the edge diff); `matchHooks(hooks, ev, node, fired: Set<string>) → HookDef[]` (kind or `*`, event, where: `document=<glob>`, `type=<slug>`, `status=<x>`, `prop=<k>:<v>`; paused skipped; once + fired skipped); `fillTemplate(md, vars)`.
- Test each; commit.

### Task 3: `lib/hooks-run.ts` (IO) + wiring
- Store: `<product>/_hooks/<id>.json` `Firing = { id, hook, node, event, at, depth, actions: [{ kind, session?, added?: string[], error? }] }`; `firedSet(productDir) → Set<'hook|node'>`.
- `fire(product, events, depth = 0)`: loads scope, hooks (kind hook nodes), refuses depth > 3; for each event × matched hook → record the firing, run actions: `run` → `startSkillSession(scope, skill, node, firing)` (createSession role from the skill, refs, source, `hook`; first message: instruction "Run skill:<id> on <node>: <title>" + resolved refs + packet + `## Skill` body + attached skills; startChat with firstMessage; librarian cwd REPO_ROOT, worker cwd product repo); `add` → template (a `template:` node's body or `templates/hooks/<name>.md`) filled, appended as the node's content via `writeContent` (or a document's end with `to:`), rebuild.
- Wiring: watch.ts after `recordChanges` → `fire(product, eventsFromDiff(before, after, changes), depthOf(attribution sessions))` where depth = 1 + the depth of the firing whose session wrote the change (session.hook.firing → its depth); `approvePr` → `fire(pr.approved)`; `onSessionEnd` → `session.done` (+ `pr.built` when the session built a PR and ended done). `WF_HOOKS=0` → no-op.
- `Session.hook?: { id: string; firing: string; skill?: string }` in session-types; the Agents rows show "hook: <id>".
- Commit.

### Task 4: skills in sessions, CLI
- `skillBody(scope, id)`: the skill document's body (after frontmatter) else `prompts/<name>.md`; `skillsFor(scope, s)`: from the PR's `skills:`, the node's type card `skills:`, the session's hook skill; `buildPrompt` appends `## Skills` (each skill's body under its title) — the librarian/worker briefs stay.
- `wye skills` / `wye skill <id>` (GET `/api/<p>/skills`, `/api/<p>/skills/<slug>`); `wye hooks` (the hooks with their last firings) via `/api/<p>/hooks`.
- Commit.

### Task 5: knowledge + live check
- Cards via `npm run cards`; `req:wf2.hooks`, `decision:wf2.hooks-and-skills`; the example harness in the waterfall product (`hooks.md` in v2 with `hook:req-approved-tests` paused? — active, `once`), `ctx check` 0 errors (besides pr-28's).
- Live: scratch product, approve a requirement → a session starts with `skill:define-tests`; `add test-card` on a template appends a proposed card. Commit.
