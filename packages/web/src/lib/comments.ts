// Comments (decision:ontology.comment-is-a-ref, req:ontology.comment-home): a comment is a `comment:` row in the Comments
// document of the project the commented node belongs to — one per project, created on the project's first comment,
// holding one `<!-- table:comment -->` block — never nested under the node. `on:` names the node; the node lists its
// comments as the inverse edge. The document is the collection document of type:comment (lib/instances).
import path from 'node:path';
import { access, mkdir, readFile } from 'node:fs/promises';
import type { Scope } from './scope';
import type { GraphData } from './graph';
import { REPO_ROOT } from './products';
import { docRoute } from './doc';
import { instantiate } from './templates';
import { collectionDoc, appendRow } from './instances';
import { withFileLock, writeAtomic, rebuild } from './write';
import { claimWrite } from './changes';

export const COMMENTS_SLUG = 'comments';
export type Comment = { id: string; text: string; by: string; date: string; on: string; file: string; line: number };

// A comment's row: the id, the text on one line, then who, when and what it is on in the trailing group (rule:type-tables).
// `#` and parentheses at the end would read as a status tag or a property group, so they are softened.
export function commentRow(id: string, text: string, on: string, by: string, date: string): string {
  const one = text.replace(/\s+/g, ' ').replace(/#(?=\w)/g, '# ').replace(/\s*\(([^()]*)\)\s*$/, ' — $1').trim();
  return `- ${id} ${one} (on: ${on}, by: ${by}, date: ${date})`;
}
// comment:<node slug>-<4 hex> — readable, unique enough per project
export function commentId(on: string, taken: (id: string) => boolean): string {
  const base = on.replace(/^[a-z-]+:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'node';
  for (;;) { const id = `comment:${base}-${Math.random().toString(16).slice(2, 6)}`; if (!taken(id)) return id; }
}
// Every comment on a node, oldest first (the row order of the Comments document).
export function commentsOn(g: GraphData, on: string): Comment[] {
  const ids = new Set(g.edges.filter(e => e.verb === 'on' && e.to === on && e.from.startsWith('comment:')).map(e => e.from));
  return g.nodes.filter(n => ids.has(n.id) && n.defined).map(n => {
    const get = (k: string) => (n.body.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) ?? [])[1]?.trim() ?? '';
    return { id: n.id, text: get('text'), by: get('by'), date: get('date'), on, file: n.file, line: n.line };
  }).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// Write a comment: the Comments document of the node's project (else the project named, else the first), created on
// the first comment; the row goes into its comment table. Returns the comment and the document it went to.
export async function addComment(scope: Scope, input: { on: string; text: string; by?: string; project?: string; session?: string }): Promise<{ ok: true; id: string; file: string; doc: { project: string; doc: string; title: string }; created: boolean } | { ok: false; status: number; message: string }> {
  const text = input.text.trim(); if (!text) return { ok: false, status: 422, message: 'text required' };
  const node = scope.idx.byId.get(input.on);
  if (!node) return { ok: false, status: 404, message: `${input.on} is not in the graph` };
  const project = scope.projects.find(p => p.slug === (node.file && docRoute(node.file)?.project)) ?? scope.projects.find(p => p.slug === input.project) ?? scope.projects[0];
  if (!project) return { ok: false, status: 422, message: 'the product has no project to keep comments in' };
  const file = path.posix.join(project.docsRel, `${COMMENTS_SLUG}.md`);
  const abs = path.join(REPO_ROOT, file);
  let created = false;
  try { await access(abs); } catch {
    const tpl = await readFile(path.join(REPO_ROOT, 'templates/docs/blank.md'), 'utf8');
    const md = instantiate(tpl, { title: 'Comments', slug: COMMENTS_SLUG, parent: '', date: new Date().toISOString().slice(0, 10) }).replace(/^part-of: \n/m, '').replace(/\npart-of: $/m, '');
    await mkdir(project.docsDir, { recursive: true });
    await writeAtomic(abs, collectionDoc(md, 'comment').replace('every comment of the product, one row each — the home of type:comment', `every comment made on a node of the ${project.slug} project, one row each, with the node it is on`));
    created = true;
  }
  const id = commentId(input.on, x => !!scope.idx.byId.get(x)?.defined);
  const by = input.by?.trim() || (input.session ? `agent:${input.session}` : 'person');
  const row = commentRow(id, text, input.on, by, new Date().toISOString().slice(0, 10));
  claimWrite(id, { by, session: input.session });
  await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8');
    await writeAtomic(abs, appendRow(md, 'comment', row));
  });
  await rebuild(scope.product.dir);
  const title = scope.graph.modules.find(m => m.file === file)?.title || 'Comments';
  return { ok: true, id, file, doc: { project: project.slug, doc: COMMENTS_SLUG, title }, created };
}

// Remove a comment: its row leaves the Comments document (the line that defines it; nothing else moves).
export async function removeComment(scope: Scope, id: string): Promise<{ ok: true; file: string } | { ok: false; status: number; message: string }> {
  const n = scope.idx.byId.get(id);
  if (!n?.defined || !n.file || !id.startsWith('comment:')) return { ok: false, status: 404, message: `${id} is not a comment` };
  const abs = path.join(REPO_ROOT, n.file);
  const done = await withFileLock(abs, async () => {
    const md = await readFile(abs, 'utf8'); const lines = md.split('\n');
    const at = lines.findIndex(l => new RegExp('^\\s*-\\s+' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(l));
    if (at < 0) return false;
    lines.splice(at, 1); await writeAtomic(abs, lines.join('\n')); return true;
  });
  if (!done) return { ok: false, status: 404, message: `${id} is not on its line any more` };
  await rebuild(scope.product.dir);
  return { ok: true, file: n.file };
}
