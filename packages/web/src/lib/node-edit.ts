// Edit the line that defines a prose node, in place, under the file lock; then rebuild the graph.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Scope } from './scope';
import { REPO_ROOT } from './products';
import { patchNodeLine } from './node-line';
import { rebuild, writeAtomic, withFileLock } from './write';

export type NodePatch = { status?: string; text?: string; props?: Record<string, string | null> };
export async function editNode(scope: Scope, id: string, patch: NodePatch, opts: { rebuild?: boolean } = {}): Promise<{ ok: true; line: string; file: string } | { ok: false; error: string; message: string }> {
  const node = scope.idx.byId.get(id);
  if (!node || !node.defined) return { ok: false, error: 'not_found', message: `${id} is not defined` };
  if (node.form !== 'prose') return { ok: false, error: 'invalid', message: 'only prose-form nodes can be edited in place' };
  const abs = path.join(REPO_ROOT, node.file);
  return withFileLock(abs, async () => {
    const lines = (await readFile(abs, 'utf8')).split('\n');
    const defines = (l: string) => new RegExp('^(\\s*(?:[-*+]|\\d+[.)])\\s+(?:\\[[ xX]\\]\\s+)?|\\|\\s*)?' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s)').test(l);
    let i = node.line - 1;
    if (!lines[i] || !defines(lines[i])) i = lines.findIndex(defines);
    if (i < 0) return { ok: false as const, error: 'not_found', message: 'defining line not found' };
    const next = patchNodeLine(lines[i], patch);
    if (next === null) return { ok: false as const, error: 'invalid', message: 'the defining line is not a prose node line' };
    if (next !== lines[i]) { lines[i] = next; await writeAtomic(abs, lines.join('\n')); if (opts.rebuild !== false) await rebuild(scope.product.dir); }
    return { ok: true as const, line: next, file: node.file };
  });
}
