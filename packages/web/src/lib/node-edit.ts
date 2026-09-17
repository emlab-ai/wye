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
    // a yaml card: status, its text key and any scalar or prose property (patchYamlCard)
    return withFileLock(abs, async () => {
      const out = patchYamlCard(await readFile(abs, 'utf8'), id, patch);
      if (out.error) return { ok: false as const, error: out.error, message: 'yaml card not found' };
      await writeAtomic(abs, out.md); if (opts.rebuild !== false) await rebuild(scope.product.dir);
      return { ok: true as const, line: out.line, file: node.file };
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

// The keys a yaml card's main text lives under, in the order the card is read (PeekPanel#nodeText, lib/parse.js title).
const TEXT_KEYS = ['text', 'statement', 'description', 'purpose', 'q', 'title'];
// Patch a yaml card in a document's text: status, the text key and props (null removes). A value with a newline, a
// colon-space, a leading yaml-special character or more than 100 characters is written as a `key: >` folded block;
// an existing block (folded or literal) is replaced whole.
export function patchYamlCard(md: string, id: string, patch: NodePatch): { md: string; line: string; error?: 'not_found' } {
  const lines = md.split('\n');
  const idRe = new RegExp('^(\\s*-?\\s*)id:\\s*' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
  const start = lines.findIndex(l => idRe.test(l)); if (start < 0) return { md, line: '', error: 'not_found' };
  const indent = lines[start].match(idRe)![1].replace('-', ' ');
  let end = start + 1; while (end < lines.length && lines[end].startsWith(indent) && !/^\s*-\s*id:/.test(lines[end]) && lines[end].trim() && !lines[end].startsWith('```')) end++;
  const keyAt = (key: string) => lines.findIndex((l, k) => k > start && k < end && new RegExp('^' + indent + key + ':').test(l));
  const blockEnd = (i: number) => { let j = i + 1; while (j < end && lines[j].startsWith(indent + ' ')) j++; return j; };
  const render = (key: string, value: string) => /\n|: |^[-'"[{&*!|>%@`#]/.test(value) || value.length > 100
    ? [`${indent}${key}: >`, ...value.split('\n').map(l => l.trim() ? `${indent}  ${l.trim()}` : '')].filter((l, i, a) => l || (i > 0 && i < a.length - 1))
    : [`${indent}${key}: ${value}`];
  const setKey = (key: string, value: string | null) => {
    const i = keyAt(key);
    if (value === null || !value.trim()) { if (i >= 0) { const j = blockEnd(i); lines.splice(i, j - i); end -= j - i; } return; }
    const block = render(key, value.trim());
    if (i >= 0) { const j = blockEnd(i); lines.splice(i, j - i, ...block); end += block.length - (j - i); }
    else { lines.splice(end, 0, ...block); end += block.length; }
  };
  if (patch.text !== undefined) setKey(TEXT_KEYS.find(k => keyAt(k) >= 0) ?? 'text', patch.text);
  if (patch.status !== undefined) setKey('status', patch.status || null);
  for (const [k, v] of Object.entries(patch.props ?? {})) setKey(k, v);
  return { md: lines.join('\n'), line: lines[start] };
}
