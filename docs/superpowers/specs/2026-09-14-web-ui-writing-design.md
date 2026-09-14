# Web UI — writing documents in place

Date: 2026-09-14. Status: approved in discussion ("Notion-style in place"). Builds on
`2026-09-14-web-ui-documents-first-design.md`.

## 1. Goal

Write and edit a project's documents (PRD, dev design, test design, later a plan) inside the app, Notion-style:
click a section to edit it, click a card to edit its fields, add cards and documents from templates. Markdown
files stay the source of truth; every save writes the file and rebuilds the graph so tags, tree and search stay
current.

## 2. Editing model

- A document page is the reader plus edit affordances. Nothing changes until you click.
- **Prose section**: the text between two structural boundaries (a yaml block or a `---` rule). Clicking Edit on a
  section opens it in a BlockNote editor initialised from that section's markdown; Save exports the blocks back to
  markdown and replaces exactly that section in the file. Horizontal rules and yaml blocks are never inside the
  editor, so they survive untouched.
- **Card**: Edit turns the card into a form: title, status (select), the sentence keys (when, then, unless), the
  prose keys (multi-line), and every other key as a text field; list values (satisfied-by, refines, …) are tag
  inputs with id autocomplete from the node index. Save serialises the form back into the chunk's yaml (known keys
  in the order they appeared, unknown lines preserved verbatim) and replaces that chunk.
- **Add card**: a "+ card" control after each yaml block and each section opens a kind picker (req, rule, entity,
  op, page, decision, question, …) with a per-kind skeleton from `schema/kinds.yaml` (required keys); the new
  chunk is appended to the chosen block, or a new yaml block is inserted after the section.
- **Document properties**: the header's title, status, owner and last-verified are editable in place
  (frontmatter keys).
- **New document**: "New" in the rail asks for a title, a template (prd, dev-design, test-design, plan, blank)
  and a parent document; it creates `docs/context-graph/<slug>.md` from `templates/docs/<template>.md` with
  frontmatter `node: module:<slug>`, `title`, `status: proposed`, `part-of: module:<parent>`, then opens it.
  Templates ship in this repo under `templates/docs/`.
- **Parent link**: the parser gains a `part-of` edge key (child → parent, verb `part-of`); the document tree
  treats `part-of` as the inverse of `has`. A new document declares its parent itself, so the parent file is not
  edited.

## 3. Write path

- `PUT /api/p/<project>/doc/<slug>` with `{ op: 'replace-segment', index, ifMatch, text }`,
  `{ op: 'replace-chunk', segment, chunk, ifMatch, body }`, `{ op: 'append-chunk', segment, body }`,
  `{ op: 'insert-yaml-after-segment', segment, body }`, `{ op: 'frontmatter', patch }`. The server re-reads the
  file, re-splits it with `splitDocument`, checks `ifMatch` (sha256 of the current segment or chunk text),
  applies the change to the raw text, writes atomically (temp file + rename), then rebuilds the graph by running
  `node <repo>/bin/ctx.js build` in the project root, and returns the new hashes and the lint summary.
- `POST /api/p/<project>/doc` with `{ title, template, parent }` creates the file and rebuilds.
- Conflicts return 409 with the current text; the UI offers reload. Lint errors after a rebuild are shown as a
  banner on the document (the write is kept; the graph is the honest reflection of the file).
- After any save the page calls `router.refresh()` so cards, tags, the outline and search reflect the new graph.

## 4. Round-trip rules (rule:prose-round-trip)

- The editor sees only prose: paragraphs, headings, lists, tables, code, links, emphasis. `---` rules and yaml
  blocks are boundaries, not content.
- Ids inside prose are plain text to the editor (no tag components inside BlockNote); the reader renders them as
  tags again after save. Export must keep `kind:slug` tokens byte-identical.
- If a section's exported markdown differs from its source only by whitespace or list markers, the save still
  happens; the reader is the judge of fidelity, and a section that BlockNote cannot represent (e.g. HTML) is
  edited as raw markdown in a textarea instead (a "raw" toggle exists on every section).

## 5. Out of scope now

Task nodes and progress (the plan document), agent write access, SSE, comments. The plan document is the next
slice: `task:` becomes a node kind, a plan is a document whose cards are tasks with status, and progress is
derived per document.

## 6. Testing

vitest on the pure parts: segment/chunk replacement in raw text (`lib/write.ts`: applyReplaceSegment,
applyReplaceChunk, appendChunk, insertYamlAfterSegment, patchFrontmatter, hashes), form→yaml serialisation
(`lib/yaml-form.ts`), template instantiation (`lib/templates.ts`), and the `part-of` parser change (root
smoke via a fixture). Pages verified in the browser: edit a prose section, edit a card, add a card, new document
from template, conflict handling.
