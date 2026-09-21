import { createHash } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildProduct, checkProduct } from './build';
import { splitDocument } from './doc';

// Server-only: pure text operations on a document plus the atomic write and the graph rebuild.
export type WriteResult = { md: string; error?: 'conflict' | 'not_found' | 'invalid'; current?: string };

export function hashOf(text: string): string { return createHash('sha256').update(text).digest('hex'); }

export function indentChunk(body: string, list: boolean): string {
  if (!list) return body;
  return body.split('\n').map((l, i) => (i === 0 ? '- ' : '  ') + l).join('\n');
}

export function replaceSegment(md: string, index: number, ifMatch: string, text: string): WriteResult {
  const seg = splitDocument(md).segments[index];
  if (!seg || seg.type !== 'markdown') return { md, error: 'not_found' };
  if (hashOf(seg.text) !== ifMatch) return { md, error: 'conflict', current: seg.text };
  return { md: md.slice(0, seg.start) + text.trim() + md.slice(seg.end) };
}

export function replaceChunk(md: string, segment: number, chunk: number, ifMatch: string, body: string): WriteResult {
  const seg = splitDocument(md).segments[segment];
  if (!seg || seg.type !== 'yaml') return { md, error: 'not_found' };
  const c = seg.chunks[chunk]; if (!c) return { md, error: 'not_found' };
  if (hashOf(c.raw) !== ifMatch) return { md, error: 'conflict', current: c.body };
  return { md: md.slice(0, c.start) + indentChunk(body.trim(), c.list) + md.slice(c.end) };
}

export function appendChunk(md: string, segment: number, body: string): WriteResult {
  const seg = splitDocument(md).segments[segment];
  if (!seg || seg.type !== 'yaml') return { md, error: 'not_found' };
  const last = seg.chunks[seg.chunks.length - 1];
  const list = last ? last.list : true;
  const at = last ? last.end : seg.start + md.slice(seg.start).indexOf('\n') + 1;
  return { md: md.slice(0, at) + (last ? '\n' : '') + indentChunk(body.trim(), list) + (last ? '' : '\n') + md.slice(at) };
}

export function insertYamlAfterSegment(md: string, segment: number, body: string): WriteResult {
  const seg = splitDocument(md).segments[segment];
  if (!seg) return { md, error: 'not_found' };
  const block = '\n\n```yaml\n' + body.trim() + '\n```';
  return { md: md.slice(0, seg.end) + block + md.slice(seg.end) };
}

// Replace everything after the frontmatter (the editor owns the whole body).
// A body that arrives with a front matter of its own (an agent that read the whole file and wrote it back whole)
// is not doubled: its keys are merged into the document's front matter — a key it names wins, one it omits stays —
// and the rest is the body.
export function replaceBody(md: string, ifMatch: string, body: string): WriteResult {
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
  let head = fm ? fm[0] : '';
  const current = md.slice(head.length);
  if (hashOf(current) !== ifMatch) return { md, error: 'conflict', current };
  const own = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (own) {
    body = body.slice(own[0].length);
    if (head) {
      const patch: Record<string, string> = {};
      for (const l of own[1].split('\n')) { const m = l.match(/^([\w-]+):\s*(.*)$/); if (m) patch[m[1]] = m[2]; }
      const merged = patchFrontmatter(head, patch); if (!merged.error) head = merged.md;
    } else head = own[0];
  }
  return { md: head + (head && !head.endsWith('\n') ? '\n' : '') + '\n' + body.replace(/^\n+/, '').replace(/\n*$/, '\n') };
}
export function bodyOf(md: string): string { const fm = md.match(/^---\n([\s\S]*?)\n---\n?/); return md.slice(fm ? fm[0].length : 0); }

// A null value removes the key.
export function patchFrontmatter(md: string, patch: Record<string, string | null>): WriteResult {
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return { md, error: 'invalid' };
  const lines = fm[1].split('\n');
  const seen = new Set<string>();
  const out = lines.flatMap(l => { const m = l.match(/^([\w-]+):/); if (m && m[1] in patch) { seen.add(m[1]); return patch[m[1]] === null ? [] : [`${m[1]}: ${patch[m[1]]}`]; } return [l]; });
  for (const [k, v] of Object.entries(patch)) if (!seen.has(k) && v !== null) out.push(`${k}: ${v}`);
  return { md: '---\n' + out.join('\n') + '\n---\n' + md.slice(fm[0].length) };
}

export async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}

// Rebuild a product's graph.json — in this process, with the parse cache (lib/build, decision:wf2.parse-cache); the
// result reads like the CLI's so the routes that show it need not change. `lint` is the check over the built graph.
export async function rebuild(productDir: string): Promise<{ code: number; output: string }> {
  const r = await buildProduct(productDir);
  return { code: r.code, output: r.output };
}
export async function lint(productDir: string): Promise<{ code: number; output: string }> {
  const r = await checkProduct(productDir);
  return { code: r.code, output: r.output };
}

// Serialise read-modify-write cycles on one file so two quick edits (status, then owner) cannot lose each other.
const locks = new Map<string, Promise<unknown>>();
export function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(file, run);
  run.finally(() => { if (locks.get(file) === run) locks.delete(file); });
  return run;
}
