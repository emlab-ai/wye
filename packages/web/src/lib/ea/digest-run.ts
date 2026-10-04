// The Digest's daily summary, the IO part (decision:ea.digest-is-a-page): the context for the agent (the assistant's
// nodes against the snapshot the last summary left in <product>/_ea/digest/<date>.json), and the summary written into
// the Digest page's "Daily summary" section — which leaves today's snapshot, what the next context compares with.
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadScope } from '../scope';
import { REPO_ROOT } from '../products';
import { rebuild, withFileLock, writeAtomic } from '../write';
import { claimWrite } from '../changes';
import { syncPackageTypes } from '../install';
import { today, isDate } from './model';
import { digestSnapshot, digestContext, contextMarkdown, prependSummary, quietProjects, type DigestSnapshot, type DigestNode } from './digest';
import { listChanges } from '../changes';
import { listSuggestions } from './suggest';

const DIGEST = 'module:ea-digest';
const snapDir = (productDir: string) => path.join(productDir, '_ea', 'digest');

async function lastSnapshot(productDir: string, before: string): Promise<DigestSnapshot | null> {
  let names: string[] = []; try { names = (await readdir(snapDir(productDir))).filter(n => /^\d{4}-\d\d-\d\d\.json$/.test(n) && n.slice(0, 10) < before).sort(); } catch { return null; }
  const last = names.pop(); if (!last) return null;
  try { return JSON.parse(await readFile(path.join(snapDir(productDir), last), 'utf8')); } catch { return null; }
}

// the Digest page's file: the seeded page (the package's sync makes it when an install has not yet)
async function digestFile(product: string): Promise<{ file: string; scope: NonNullable<Awaited<ReturnType<typeof loadScope>>> } | null> {
  let scope = await loadScope(product); if (!scope) return null;
  if (!scope.idx.byId.get(DIGEST)?.defined) { await syncPackageTypes(scope.product.dir); scope = await loadScope(product); if (!scope) return null; }
  const n = scope.idx.byId.get(DIGEST); if (!n?.defined || !n.file) return null;
  return { file: path.join(REPO_ROOT, n.file), scope };
}

export async function digestContextRun(product: string, date = today()): Promise<{ ok: true; markdown: string; since: string | null } | { ok: false; status: number; message: string }> {
  if (!isDate(date)) return { ok: false, status: 422, message: `date must be YYYY-MM-DD (got ${date})` };
  const scope = await loadScope(product); if (!scope) return { ok: false, status: 404, message: `no product ${product}` };
  const prev = await lastSnapshot(scope.product.dir, date);
  const c = digestContext(prev, scope.graph.nodes as DigestNode[], date);
  // what the suggestions read too: the projects gone quiet, and what is suggested already (renewed or closed, not repeated)
  const changes = (await listChanges(scope.product.dir).catch(() => [])).map(r => ({ node: r.node, at: r.at }));
  c.quiet = quietProjects(scope.graph.nodes as DigestNode[], changes, date);
  c.suggestions = (await listSuggestions(product)).map(s => ({ id: s.id, title: s.title, about: s.about, suggested: s.suggested }));
  return { ok: true, since: c.since, markdown: contextMarkdown(c, id => scope.idx.byId.get(id)?.title || id, date) };
}

export async function writeSummary(product: string, entry: string, opts: { date?: string; by?: string; session?: string } = {}): Promise<{ ok: true; doc: string } | { ok: false; status: number; message: string }> {
  const date = opts.date ?? today();
  if (!isDate(date)) return { ok: false, status: 422, message: `date must be YYYY-MM-DD (got ${date})` };
  if (!entry.trim()) return { ok: false, status: 422, message: 'the summary is empty' };
  const d = await digestFile(product);
  if (!d) return { ok: false, status: 404, message: `${product} has no Digest page (module:ea-digest) — the executive-assistant package seeds it` };
  claimWrite(path.relative(REPO_ROOT, d.file), { by: opts.by ?? 'agent:ea', session: opts.session });
  await withFileLock(d.file, async () => { await writeAtomic(d.file, prependSummary(await readFile(d.file, 'utf8'), date, entry)); });
  await rebuild(d.scope.product.dir);
  const fresh = await loadScope(product);
  await mkdir(snapDir(d.scope.product.dir), { recursive: true });
  await writeAtomic(path.join(snapDir(d.scope.product.dir), `${date}.json`), JSON.stringify(digestSnapshot((fresh ?? d.scope).graph.nodes as DigestNode[], date)));
  return { ok: true, doc: path.relative(REPO_ROOT, d.file) };
}
