# Web UI writing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit documents in place (prose sections in BlockNote, cards as forms), add cards, edit document properties, and create new documents from templates; every save writes the markdown file and rebuilds the graph.

**Architecture:** `lib/doc.ts` gains character spans for every segment and chunk; a server-only `lib/write.ts` applies replace/append/insert/frontmatter operations to the raw file text with sha256 `ifMatch` checks and atomic writes; one route handler exposes them; client components (`SectionEditor`, `CardEditor`, `AddCard`, `DocProps`, `NewDoc`) call the route and `router.refresh()`. The parser gains a `part-of` edge so a new document can declare its parent.

**Tech Stack:** existing app + @blocknote/core|react|mantine 0.54 (client-only via `next/dynamic`).

**Spec:** `docs/superpowers/specs/2026-09-14-web-ui-writing-design.md`

## Global Constraints

- Work on main; commit per task with the session attribution lines.
- No `node:` imports outside `lib/load.ts` and `lib/write.ts` (server-only).
- Every write: re-read file → locate span by index → compare sha256 of the current span text with `ifMatch` → apply → write `<file>.tmp-<pid>` → rename → run `node <waterfall>/bin/ctx.js build` in the project root.
- Yaml chunks written back keep list style: if the original chunk started with `- id:`, the new body's first line is prefixed `- ` and the rest `  `.

## Tasks

### Task 1: spans in `doc.ts`, `lib/write.ts` with tests, parser `part-of`, templates
- `splitDocument` returns `start`/`end` char offsets on segments (markdown span excludes leading/trailing blank lines) and on chunks (`raw` = original lines, `start`/`end` offsets).
- `write.ts`: `hashOf(text)`, `replaceSegment(md, index, ifMatch, text)`, `replaceChunk(md, segment, chunk, ifMatch, body)`, `appendChunk(md, segment, body)`, `insertYamlAfterSegment(md, segment, body)`, `patchFrontmatter(md, patch)`, `writeAtomic(path, text)`, `rebuild(rootPath)`. Pure functions return `{ md, error? }`; error `conflict` carries the current text.
- Parser: `'part-of': 'part-of'` in EDGE_KEYS and STRUCTURAL; `documentTree` follows `part-of` child→parent; kinds.yaml documents the verb.
- `templates/docs/{blank,prd,dev-design,test-design,plan}.md` with `{{title}} {{slug}} {{parent}} {{date}}`; `lib/templates.ts#instantiate`.
- Tests: write.test.ts (each op incl. conflict and list-style re-indent), templates.test.ts, doc.test.ts updated for spans.

### Task 2: API routes
- `PUT /api/p/[project]/doc/[slug]` with ops from the spec; `POST /api/p/[project]/doc` creates from a template; both return `{ ok, hashes?, lint: { errors, warnings } }` or `{ error, current? }` (409 conflict, 422 invalid, 404).

### Task 3: client editing
- `SectionEditor` (dynamic, ssr:false): Edit → BlockNote from `tryParseMarkdownToBlocks(text)`; Save → `blocksToMarkdownLossy` → PUT replace-segment; Raw toggle → textarea; Cancel. Shows conflict/lint feedback.
- `CardEditor`: form from `parseBody` rows (+ kind skeleton keys), tag input with autocomplete from the peek index for list keys; Save → `serialiseForm` → PUT replace-chunk. `lib/yaml-form.ts` (pure, tested) serialises rows back to yaml.
- `AddCard`: kind picker → skeleton from `lib/kinds.ts` → PUT append-chunk / insert-yaml-after-segment.
- `DocProps`: inline edit of title/status/owner/last-verified → PUT frontmatter.
- `NewDoc` in the rail: title, template, parent → POST → navigate.
- `Document.tsx` passes spans/hashes to the client editors; the page and rail refresh after saves.

### Task 4: record in the graph, README, memory
- prd/dev-design/test-design updates; `req:wf2.ui.node-page.save` → unverified with note; new `rule:prose-round-trip`, `rule:segment-write`; test node cases; README.
