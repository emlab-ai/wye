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
  const abs = path.join(REPO_ROOT, node.file);
  if (node.form !== 'prose') {
    // a yaml card: only its status (and simple scalar props) can be changed here
    if (patch.text !== undefined) return { ok: false, error: 'invalid', message: 'edit the text of a yaml card in its document' };
    return withFileLock(abs, async () => {
      const lines = (await readFile(abs, 'utf8')).split('\n');
      const idRe = new RegExp('^(\\s*-?\\s*)id:\\s*' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
      const start = lines.findIndex(l => idRe.test(l)); if (start < 0) return { ok: false as const, error: 'not_found', message: 'yaml card not found' };
      const m = lines[start].match(idRe)!; const indent = m[1].replace('-', ' ');
      let end = start + 1; while (end < lines.length && lines[end].startsWith(indent) && !/^\s*-\s*id:/.test(lines[end]) && lines[end].trim() && !lines[end].startsWith('```')) end++;
      const setKey = (key: string, value: string | null) => {
        const i = lines.findIndex((l, k) => k > start && k < end && new RegExp('^' + indent + key + ':').test(l));
        if (value === null) { if (i >= 0) { lines.splice(i, 1); end--; } return; }
        if (i >= 0) lines[i] = `${indent}${key}: ${value}`; else { lines.splice(end, 0, `${indent}${key}: ${value}`); end++; }
      };
      if (patch.status !== undefined) setKey('status', patch.status || null);
      for (const [k, v] of Object.entries(patch.props ?? {})) setKey(k, v);
      await writeAtomic(abs, lines.join('\n')); if (opts.rebuild !== false) await rebuild(scope.product.dir);
      return { ok: true as const, line: lines[start], file: node.file };
    });
  }
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
