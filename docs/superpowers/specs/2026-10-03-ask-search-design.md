# Ask — search that answers (design)

2026-10-03. Search becomes Glean-like: a person types into ⌘F and gets ranked results while typing; a question (or
Enter) also gets a written answer with numbered citations. Two answerers run **in parallel** on every question: a
**fast lane** (fixed retrieval → one model call, a few seconds) and a **deep lane** (a read-only agent with search,
graph and code tools). While the deep lane works, every source it opens appears live under the answer. Agents and the
CLI get the same engine through `wye ask` and the API.

Decisions with alex (session of 2026-10-03):
- **Sources** — the knowledge graph, the full prose of documents, the product's code repo, and agent sessions.
  External connectors (Slack, Drive, Gmail) are out of scope.
- **Surface** — the ⌘F panel *is* the place: one box, live results, the answer above them, follow-ups in place.
- **Engine** — fast and deep lanes run together on every question; the deep lane's findings stream as it works.

## 1. Index — `packages/web/src/lib/ask/index.ts`

A single SQLite file per product at `<product>/_build/search.db`, opened with Node's built-in `node:sqlite`
(Node 26; FTS5 is compiled in — checked). No new dependency, no vector DB.

```sql
chunks(id TEXT PRIMARY KEY, source TEXT, ref TEXT, title TEXT, text TEXT, hash TEXT, mtime REAL)
chunks_fts USING fts5(title, text, content='chunks')      -- BM25
vectors(id TEXT PRIMARY KEY, model TEXT, vec BLOB)          -- MiniLM, 384 × float32, normalised
```

A chunk's `id` is `<source>:<ref>`; `ref` is what a citation links to.

| source | one chunk is | ref | link |
|---|---|---|---|
| `node` | a defined node: `nodeText(n)` (as `semantic.ts` today) | node id | `/d/<doc>#n-<id>` |
| `doc` | a heading section of a document's prose (cards excluded — they are nodes), split at ~1 200 chars on block boundaries | `<project>/<doc>#<block-id or heading slug>` | the doc at that block |
| `code` | a file of the product's `repo` (from `_product.md`), split at top-level symbols where a cheap regex finds them (`function`, `class`, `export const`, `def`, `func`), else 60-line windows; `.gitignore`d, binary and >200 KB files skipped | `<path>:<startLine>-<endLine>` | the code preview (`req:wf2.code-preview`) |
| `session` | one turn of an `_sessions/*.json` session (instruction, a result, a log line run), ≤1 500 chars | `<session-id>#<turn>` | the session page |

**Freshness.** `refresh(product)` walks the four sources, hashes each chunk's text, and rewrites only chunks whose
hash changed (deletes vanished ones). It runs lazily before a query when the graph mtime, a doc mtime, the repo's
`git ls-files` mtime set or the sessions dir mtime moved since the last refresh, and in the background after
`wye build`. Embedding reuses `semantic.ts`'s embedder (moved to `lib/ask/embed.ts`, shared); the existing
`embeddings.json` is migrated once into `vectors` and `semantic.ts`'s `search` is re-pointed at the new index, so
`/context`, `explain` and `packet --for` all gain doc/code/session recall for free (they keep a `sources` filter,
default `node`, so their behaviour is unchanged until we choose otherwise).

Vector search is a brute-force dot product over the blobs held in memory per product (a few tens of thousands of
384-dim vectors is a few ms). When a product outgrows that, `sqlite-vec` is the swap — not now.

## 2. Retriever — `lib/ask/retrieve.ts`

`retrieve(product, q, { limit, sources, asOf, all })`:
1. **BM25** over `chunks_fts` (top 50) and **vector** cosine (top 50).
2. **Fuse** with reciprocal rank fusion (k = 60). Ended / archived nodes are dropped as today (`isCurrent`) unless
   `all` / `asOf` — the rule `req:memory.current-by-construction` holds for answers too.
3. **Expand along the graph**: for each fused node hit and each doc chunk's nodes, one hop over structural edges
   (`governs`, `affects`, `satisfied-by`, `implements`, `part-of`, `supersedes`) — a decision brings in what it
   affects; a req brings in the components that satisfy it and their `source:` code. Expanded chunks get the
   parent's score × 0.5 and a `via` field (`decision:x affects`).
4. **Budget**: dedupe, keep the best per ref, trim to a token budget (fast lane: ~12 000 tokens, ≤25 chunks).

Result: `Chunk[] = { id, source, ref, title, text, score, via?, href }`. Typing-time results use steps 1–2 only.

## 3. Answer engine — `lib/ask/ask.ts`

`ask(product, question, history?)` returns an async iterator of events; both lanes start at once.

**Fast lane.** `retrieve` → a prompt with the numbered chunks (`[1] node req:x — text …`) and the brief: answer from
these sources only, cite every claim as `[n]`, say plainly when the sources don't answer it, ≤250 words, ids as
tags. One `claude -p --output-format stream-json --tools ''` (model `WYE_ASK_MODEL`, default `claude-sonnet-5-5`),
text deltas forwarded. Typical 3–8 s.

**Deep lane.** `claude -p --output-format stream-json --verbose` with the librarian's read-only tool set and an
`--append-system-prompt` brief (`prompts/ask-deep.md`): investigate until you can answer; prefer the Wye tools;
cite as `[[ref]]`. Tools:
- `Bash` restricted to `wye ask-search "<q>" [--source code|doc|node|session]` (the index, as JSON chunks),
  `wye node <id>`, `wye graph neighbors <id>`, `wye doc <p/proj/doc>`, `wye session show <id>`;
- `Read`, `Grep`, `Glob`, scoped to the product's repo and `data/products/<p>` via `--add-dir`;
- no Write / Edit / network. It cannot propose (`constraint:wf2.pr-is-the-persons`).

Its stream is parsed as it arrives: each `tool_use` becomes a `step` event (`Searching "invite flow" in code`), and
each `tool_result` is scanned for refs (chunk ids from `ask-search` JSON, node ids, `Read` file paths with line
ranges, doc paths, session ids) → `found` events, deduped. The final text becomes `answer.deep`, its `[[ref]]`
citations renumbered into the same citation list as the fast lane. Turn cap 20, timeout 120 s; on timeout it is
asked (one more turn) to answer with what it has.

**Events** (one SSE stream, `POST /api/<p>/ask`, body `{ q, history?, lanes? }`):

```
results        Chunk[]                      the retriever's list (also the fast lane's sources)
fast.delta     { text }                     fast answer tokens
fast.done      { citations: Citation[] }
step           { text }                     what the deep lane is doing now
found          Citation                     a source the deep lane just opened
deep.delta     { text }
deep.done      { citations: Citation[] }
error          { lane, message }
done
```

`Citation = { n, ref, source, title, href, snippet }` — one numbering across both lanes, so `[3]` means the same
source in either answer. Cancelling (the person closes the panel or asks again) aborts the request; the server kills
both child processes.

`GET /api/<p>/search?q=` (typing-time): steps 1–2 of the retriever, no model, <150 ms on a warm index.

## 4. The ⌘F panel

The current `SearchPanel` keeps its frame (veil, input, hits list, preview, keyboard) and gains the answer.

```
┌ Search or ask ───────────────────────────────────────────┐
│ why did we drop the invite email?                        │
├──────────────────────────────────────────────────────────┤
│ ANSWER  fast ✓ · deep ⟳ reading lib/invite.ts …          │
│ The invite email was dropped when … [1][3]               │
│                                                          │
│ Sources found  ● decision:… ● invite.ts:40-88 ● session… │  ← grows while deep works
│ ▸ Deeper answer (ready)                                  │
├────────────────────────────┬─────────────────────────────┤
│ RESULTS  all·nodes·docs·   │  preview of the highlighted │
│ code·sessions              │  hit (card / passage / code)│
└────────────────────────────┴─────────────────────────────┘
```

- **Typing** → `/search` debounced 120 ms; results grouped by source with filter chips; `kind:` prefixes still work
  (node source only). Nothing calls a model while typing.
- **Ask** → Enter, or the input ends with `?`, or starts with a question word (why/how/what/who/when/where/which/
  does/is/can/should). ⌘Enter keeps "open the highlighted hit"; the old "Enter opens all as blocks" moves to a
  footer link "Open as blocks".
- **The answer** shows the fast lane's text first. Beneath it, **Sources found** fills live from `found` events as
  chips (kind pill + title); a click previews it on the right. When the deep answer finishes it appears in a
  "Deeper answer" section that opens by itself if the fast lane said the sources were thin, else stays one click
  away. `[n]` citations are links; hovering one previews the source.
- **Follow-ups**: after an answer, the input clears to "Ask a follow-up"; the previous Q/A pairs (fast answers only,
  trimmed) go as `history`. Esc closes; the thread is kept until the panel is reopened on a new query.
- **Narrow screens** drop the preview, as today.

## 5. CLI and agents

- `wye ask "<question>" [--fast|--deep] [--json]` — reads the SSE stream; prints the fast answer, then "Sources
  found" as they arrive, then the deep answer, with a numbered source list (refs as links). `--json` prints the final
  `{ fast, deep, citations }`. Works for any agent with the `wye` CLI, so coding agents ask the same engine.
- `wye ask-search "<q>" [--source …] [--limit n]` — the retriever as JSON; the deep lane's main tool, and useful to
  any agent directly.
- The `wye-agent` and `wye-context` skills mention `wye ask` as the first move for "what do we know about X".

## 6. Errors and limits

- No model weights / embedder fails → BM25 only, flagged in `results` (`degraded: 'no-vectors'`).
- No `repo` on the product or repo missing → code source skipped silently; the panel's "code" chip is hidden.
- A lane failing emits `error {lane}`; the other lane's answer still stands. Both failing → the results list stays,
  with "Couldn't write an answer — the sources are below."
- One question in flight per panel; a new question cancels the old. The server caps concurrent deep lanes per product
  at 2 (queued beyond that, with a `step` saying so).
- Index refresh runs under a per-product lock; a query during the first build waits for node+doc chunks only and
  reports `indexing: { code, sessions }` progress.

## 7. Testing

- **Unit** (`vitest`, beside the files): chunkers (doc sections keep block ids; code symbol split; session turns),
  RRF fusion, graph expansion picks the right edges, incremental refresh rewrites only changed hashes, ref
  extraction from deep-lane tool results (fixtures of real stream-json lines).
- **API**: `/search` and `/ask` against the `test` product with `lanes: ['fast']` and a stubbed `claude` binary
  (`WYE_CLAUDE_BIN`) that echoes a canned stream — event order and citation numbering.
- **Eval**: a small `wye eval` suite `ask` — 15 questions over the `wye` product with expected refs; scores recall@10
  of the retriever and whether each lane's citations include the expected refs. Run before and after tuning.
- **UI test** (playwright-core, per [[ui-test-gotchas]]): open ⌘F, type, see grouped results; ask, see the fast
  answer, `found` chips appear, the deep answer arrives; a citation opens its source.

## 8. Delivery

1. **A1 — index + retriever**: `lib/ask/{index,embed,chunk,retrieve}.ts`, `/search`, `wye ask-search`,
   `semantic.ts` re-pointed; unit tests + the eval suite's retrieval half.
2. **A2 — answer engine**: `lib/ask/ask.ts`, both lanes, `/ask` SSE, `wye ask`, `prompts/ask-fast.md`,
   `prompts/ask-deep.md`; API tests with the stub.
3. **A3 — the panel**: `SearchPanel` rebuilt around results + answer + sources found + follow-ups; UI test.

Out of scope: external connectors, permissions per source (local-first, one person), answer caching, writing
answers back as knowledge (a person can turn an answer into a PR by hand).
