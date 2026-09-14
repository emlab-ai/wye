import { createHash } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
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

export function patchFrontmatter(md: string, patch: Record<string, string>): WriteResult {
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return { md, error: 'invalid' };
  const lines = fm[1].split('\n');
  const seen = new Set<string>();
  const out = lines.map(l => { const m = l.match(/^([\w-]+):/); if (m && m[1] in patch) { seen.add(m[1]); return `${m[1]}: ${patch[m[1]]}`; } return l; });
  for (const [k, v] of Object.entries(patch)) if (!seen.has(k)) out.push(`${k}: ${v}`);
  return { md: '---\n' + out.join('\n') + '\n---\n' + md.slice(fm[0].length) };
}

export async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}

// Rebuild the project's graph.json with the ctx CLI that ships in this repo (packages/web → repo root).
export function rebuild(rootPath: string): Promise<{ code: number; output: string }> {
  const ctx = path.resolve(process.cwd(), '../../bin/ctx.js');
  return new Promise(resolve => {
    const child = spawn(process.execPath, [ctx, 'build'], { cwd: rootPath });
    let output = '';
    child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
}

export function lint(rootPath: string): Promise<{ code: number; output: string }> {
  const ctx = path.resolve(process.cwd(), '../../bin/ctx.js');
  return new Promise(resolve => {
    const child = spawn(process.execPath, [ctx, 'check'], { cwd: rootPath });
    let output = '';
    child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
}
