# Jev auto-linking — design

2026-09-20. Optional: everything here is active only when a Jev API key is stored in the app's settings; without it every path behaves exactly as before.

## What Jev is, and what it is for here

Jev (TypeSafe AI, `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) is a decision model: it takes a `state` (text, ≤32k tokens) and a map of typed questions — `noul` (yes/no → probability 0–1), `choice` (one of given options → distribution + confidence), `score` (rubric level) — and returns calibrated answers in one pass, 70–500 ms, $0.042 per million input tokens, output free. Questions in one call are evaluated in parallel and in isolation; adding questions barely changes latency. It cannot extract spans or classify individual words.

So in Wye it **judges candidate links, never finds them**: candidates always come from the existing local semantic search (`packages/web/src/lib/semantic.ts`, MiniLM + keywords); Jev answers, per candidate, "is this text about it?" with a probability the product can threshold. Three flows get automatic links from that judgement: inbox items on arrival, document blocks on leaving the editor, consolidation cards before they are written.

## 0. Settings page — where the key lives

There is no settings page in the app today; product switches (`impact: manual`, `consolidate: on`) are `_product.md` frontmatter, which is committed — and the repo is public — so a key cannot live there.

- Page `/<product>/settings`, reached from a "Settings ⚙" item at the bottom of the rail menu (inside the product shell like every other page; the page says the settings apply to the whole app on this machine, not to one product).
- Section "Jev (TypeSafe AI)": one API key field — masked, showing `••••` + the last 4 characters when a key is stored — with Save, Remove and a **Test** button that makes one tiny `ask` call and shows "OK · 120 ms" or the error text. A stored key means Jev is on; there is no separate toggle.
- Storage `data/_settings.json` (mode 0600, listed in `.gitignore`) through `packages/web/src/lib/settings.ts`: `readSettings()`, `writeSettings(patch)`, `jevKey()`. Routes: `GET /api/settings` → `{ jev: { set, last4 } }` (never the key), `PUT /api/settings { jev: { key } }` (empty string removes), `POST /api/settings/jev/test` → `{ ok, ms } | { error }`.
- Every judging path runs in the app (the inbox add API, the editor's links route, consolidation), so the CLI never needs the key. `TYPESAFE_API_KEY` in the environment is only the fallback for tests and evals outside the app.

Tests: `settings.test.ts` — round trip, mode, `last4` without the key, removal.

## 1. `lib/jev.js` — the module

CommonJS at the repo root next to `judge.js` and `consolidate.js`, shared by the app (via `createRequire`, as `explain.ts` and `consolidate.ts` do), the CLI and the eval suite.

- `jev({ key, model })` — a client bound to a key; `key` comes from `jevKey()` in the app, from `TYPESAFE_API_KEY` elsewhere. No key → `enabled` is false and every method returns the empty result without a call.
- `ask(state, questions, { timeoutMs })` — one request `{ model, state, questions }`, `Authorization: Bearer <key>`, 10 s timeout, exponential backoff (3 tries) on 429 and 529, any other failure thrown. Callers catch and fall back to the un-judged result; a failure is logged once, never shown as an error to the person.
- `judgeLinks(text, candidates: { id, text }[])` → `[{ id, p }]` in the candidates' order. One call, one `noul` question per candidate keyed by index, wording: *"Is the text specifically about, or does it directly depend on, this piece of knowledge: «<id>: <candidate text, ≤400 chars>»? Yes only if a reader of the text would want it linked."* Empty candidates → `[]` without a call.
- `judgeKind(text)` → `{ kind, p }` — one `choice` over `decision | requirement | rule | question | note` with a one-line description of each as the option text.
- `LINK_MIN = 0.85` — the single threshold above which a link is written automatically; below it a candidate is only a suggestion. The model is `jev-latest` (`WF_JEV_MODEL` overrides).
- `promptVersion` — a hash of the question wordings, recorded in the document cache (section 3) so a wording change invalidates it.

The exact request/response JSON of the API is pinned first by a throwaway probe with the real key (scratchpad, not kept); the module and its tests follow what the probe shows.

Tests `test/jev.js` (node test runner like the other root tests), `fetch` stubbed: request shape and auth header; parsing of noul and choice answers; retry on 429 then success; no key → no call, `judgeLinks` returns `[]`.

## 2. Inbox — linked on arrival

`addInboxItem` (`packages/web/src/lib/inbox.ts`): after the file is written, when enabled, judge the item's text (title + body + fields) against the top 15 search hits (the graph is loaded from `_build/graph.json`, same as `suggestFiling`'s callers do) and patch the head:

- `refs:` — the existing refs merged with every id at `p ≥ LINK_MIN`, deduplicated, order kept (explicit first).
- `linked-by: jev` when at least one ref was added.
- `type:` — when the item came without a type (the default `note`) and `judgeKind` gives `p ≥ LINK_MIN`, the head gets that type so it files as a card of that kind (`fileItem` already switches on the kind).

The judging runs after the add returns (`void judge().catch(...)`), so `wye inbox add` and the UI are not slowed by the call; the item's refs appear on the next list. `fileItem` is unchanged: refs become `related-to` as today.

`suggestFiling` returns `similar` as `{ id, score, p? }` — `p` filled by one more `judgeLinks` over the top 8 when enabled (cached per item name + text hash in `_build/jev.json`); `InboxNote` shows `p` as a percentage beside the pill (raw score when there is no `p`). The document choice stays the vote heuristic.

Tests extend `inbox.test.ts` with the module stubbed: refs merged, `linked-by` written, type set only for untyped items, nothing changes when disabled.

## 3. Documents — on leaving the editor

The server never writes into an open document: the editor autosaves the whole body with an `ifMatch` hash (`replace-body`), so a server-side edit would make the next save conflict. Links are therefore applied client-side, in the hook that already converts typed ids into tags on blur (`retag` in `DocEditor.tsx`), and saved by the normal path.

- Route `POST /api/<product>/links` `{ blocks: [{ key, text, linked: string[] }] }` → `{ links: { [key]: string[] } }` — ids at `p ≥ LINK_MIN` per block, excluding what the block already links and the block's own node id. Server: `search` (top 12, current nodes only) then `judgeLinks`; lib function `linksFor(scope, blocks)` in `packages/web/src/lib/links.ts`, pure apart from the two calls, tested with both stubbed. Cache `<product>/_build/jev.json`: `{ version: promptVersion, entries: { [sha1(text)]: { ids: string[], at } } }` — an unchanged block is never judged twice. Disabled → `{ links: {} }` at once.
- Editor: on load, remember each block's text hash; on blur, send the blocks whose text changed and are ≥ 12 characters (the ContextPanel's own minimum). Apply: a **card** (yaml node block) gets the ids merged into `related-to` (`nodePropsFromChunk`/props helpers); a **paragraph** gets the ids appended as smart tags at its end, separated by a space — the product's prose convention (a bare id in prose is a tag; `[text](id)` and tags make related-to edges). Then `changed()` runs and the save goes through as any edit. Pure transform `applyLinks(blocks, links)` in `packages/web/src/lib/links.ts`, tested: card merge without duplicates, paragraph append, untouched blocks unchanged, nothing inside code/frontmatter/embed blocks.
- ContextPanel: the `/context` route takes `judge: true` and, when enabled, returns `p` on each hit (same `linksFor` cache); the panel shows `p` as the percentage and marks hits at `≥ LINK_MIN` "will link", so the person sees what happens before leaving the editor.

Guard: 0.85 and the strict wording are the only guard against tagging a paragraph the person did not mean to link; the tags are visible and undoable like any edit. If that proves too eager, paragraphs drop to suggestion-only and cards stay automatic — a one-line change in `applyLinks`.

## 4. Consolidation — cards linked before they are written

`consolidateSession` (`packages/web/src/lib/consolidate.ts`): for each candidate, when enabled, `search` (top 12) + `judgeLinks` over `title + text`; ids at `p ≥ LINK_MIN` go on the card as `related-to: [..]` (new optional argument of `candidateCard`). Failure → card without links, the session line unchanged. Test in `consolidate.test.ts` with the judge stubbed.

## Out of scope, noted

- `lib/judge.js` pair verdicts (duplicate / refines / consistent / contradicts) as a Jev `choice` instead of Haiku via the CLI — the most natural Jev job, a separate change.
- Document choice in `suggestFiling` as a `choice` question.
- Any UI to accept/reject a suggested link below the threshold beyond what the ContextPanel and InboxNote already offer.
