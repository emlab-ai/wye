# Web UI rewrite — documents first

Date: 2026-09-14. Status: approved in discussion. Supersedes §7 (Web UI) of `2026-09-14-waterfall-v2-design.md` for the reading experience; the graph page and the editing plans there stand.

## 1. Goal

The web app is a reader for the project's documents. Open a project, see its documents, read them as text. The
graph and entity data (nodes, edges) are used for navigation and search, not as the primary view. Ids inside the
text (`page:HomePage`, `rule:fifo-oldest-first`) render as smart tags.

## 2. Information architecture

- **Project** → **documents**. A document is one markdown file under the project's graph folder. The document tree
  comes from `has` edges between module nodes (`module:wf2 -(has)-> module:wf2-prd`): a module with no incoming
  `has` from another module is a root document; its `has` targets are sub-documents. A project opens on its main
  root: the root with the most sub-documents, ties broken by title.
- Each document has an **outline** from its `##` headings.
- A document ends with **Linked documents**: every other file that defines a node this document's nodes reference
  (either direction), with the count of links.

## 3. Reading a document

- Frontmatter renders as a header: title, status, last-verified, sources. Prose renders as prose, tables as
  tables (ids in cells become tags), headings as headings with anchors.
- A yaml block renders as one **card per node** in it (split on `- id:` / `id:` lines, as the parser does):
  - heading: the node's title (or id), kind pill, status pill, the id in small type;
  - prose keys as sentences: `when` → "When …", `then` → "then …", `unless` → "unless …"; `statement`,
    `description`, `purpose`, `context`, `choice`, `consequences`, `intent`, `q`, `note` as paragraphs;
  - a property strip for the remaining keys (satisfied-by, verified-by, requires-tests, refines, source, …) with ids
    as tags;
  - a "yaml" toggle that shows the raw block;
  - an anchor `n-<id>` so `/p/<project>/d/<doc>#n-<id>` opens the document at the card.
- A yaml block that contains no ids (or whose ids the parser did not define) renders as a code block.

## 4. Smart tags

- Every `kind:slug` token in prose, table cells and card properties is a tag: kind-coloured dot, the slug (`req:`
  tags drop the prefix), dashed border when the node is referenced but never defined.
- Hover: title and status (from a compact client index of all nodes: id, kind, title, status, defined, file).
- Click: a **peek panel** slides in on the right without leaving the document. It shows the node's card, its
  relations grouped by verb both ways (as tags), "Go to definition" (navigates to the defining document at the
  card anchor) and "Show in graph". Escape or Close dismisses it. The panel fetches node details from
  `GET /api/p/<project>/node/<id>`.

## 5. Navigation and search

- Left rail: project title, search box, the document tree (root → sub-documents), and under the open document its
  outline. Below the tree: Graph (link to the existing graph page).
- Search (client-side, over the compact index plus document titles and headings) lists documents, headings and
  nodes; choosing a node goes to its definition; choosing a heading scrolls to it.
- Routes: `/p/<project>` redirects to the main root document; `/p/<project>/d/<doc>` renders a document (`doc`
  is the file basename without `.md`); `/p/<project>/n/<id>` redirects to the defining document at the card;
  `/p/<project>/graph` is unchanged.

## 6. Code

- `packages/web/src/lib/doc.ts` (pure, tested): `docSlug(file)`, `splitDocument(md)` → frontmatter + segments
  (`markdown` text or `yaml` chunks `[{id, body}]`), `outline(md)`, `documentTree(g)`, `linkedDocuments(g, idx,
  file)`, `nodeIndex(g)` (compact index).
- `packages/web/src/lib/remark-tags.ts`: a remark plugin that turns id tokens in text nodes into links with
  `href="#tag:<id>"`; `Document.tsx` renders markdown with react-markdown + remark-gfm and maps those links to
  `SmartTag`.
- Components: `DocTree`, `Document`, `NodeCard`, `SmartTag`, `PeekPanel`, `PeekProvider` (context: index,
  open, close), `Search`.
- API: `app/api/p/[project]/node/[id]/route.ts` returns `{node, rows, relations}`.
- Removed: the node-list sidebar and the node page (now a redirect). Kept: graph page and first-slice libs.

## 7. Testing

vitest on `doc.ts` (split, outline, tree, linked documents, index) and on the remark plugin (ids become links,
backticked ids too, no double-linking inside existing links). Pages verified in the browser: root document,
cards, tag hover and click, go to definition, search, linked documents, graph link.
