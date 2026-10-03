// The passages Ask indexes (decision:wf2.ask-sources): a node is one passage; a document's prose is cut by heading
// and at ~1 200 chars on paragraph boundaries (its yaml cards are nodes already); code is cut at top-level symbols,
// else 60-line windows; a session is one passage per turn. Pure: the walker (refresh.ts) reads the files.
import type { ChunkRow } from './types';
import type { GraphData } from '../graph';
import type { Session } from '../session-types';
import { HIDDEN_KINDS } from '../graph';
import { nodeText } from '../semantic';
import { blockHash } from '../anchors';

const DOC_MAX = 1200; const WIN = 60; const TURN_MAX = 1500;
const row = (source: ChunkRow['source'], ref: string, title: string, text: string, nodes: string[]): ChunkRow => ({ id: `${source}:${ref}`, source, ref, title, text, nodes });

const ID_RE = /(?<![\w/:.])([a-z][a-z-]*:[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)/g;
export function mentionedIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ID_RE)) { const id = m[1]; if (/^(https?|mailto|data):/.test(id) || /^\d/.test(id.split(':')[1])) continue; if (!out.includes(id)) out.push(id); }
  return out;
}

export function nodeChunks(graph: GraphData): ChunkRow[] {
  return graph.nodes.filter(n => n.defined && !HIDDEN_KINDS.has(n.kind) && n.kind !== 'module')
    .map(n => row('node', n.id, n.title || n.id, nodeText(n), [n.id]));
}

// repo-relative file → `<project>/<doc>` with `~` for .wye system pages (doc.ts#docRoute)
function docKey(file: string): string | null {
  const m = file.match(/(?:^|\/)projects\/([^/]+)\/(docs|\.wye)\/([^/]+)\.md$/);
  return m ? `${m[1]}/${m[2] === '.wye' ? '~' : ''}${m[3]}` : null;
}
export function docChunks(file: string, md: string): ChunkRow[] {
  const key = docKey(file); if (!key) return [];
  const fm = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const docTitle = fm?.[1].match(/^title:\s*(.*)$/m)?.[1].trim() || key.split('/')[1];
  const body = (fm ? md.slice(fm[0].length) : md)
    .replace(/^```ya?ml[\s\S]*?^```\s*$/gm, '')          // cards are nodes
    .replace(/<!--[\s\S]*?-->/g, '');
  const out: ChunkRow[] = [];
  let heading = ''; let paras: string[] = []; let cur: string[] = [];
  const flushPiece = () => {
    const paragraphs = cur.filter(p => p.trim()); cur = [];
    if (!paragraphs.length) return;
    const text = paragraphs.join('\n\n');
    out.push(row('doc', `${key}#b-${blockHash(paragraphs[0])}`, heading ? `${docTitle} › ${heading}` : docTitle, text, mentionedIds(text)));
  };
  const flushSection = () => { for (const p of paras) { if (cur.length && cur.join('\n\n').length + p.length > DOC_MAX) flushPiece(); cur.push(p); } flushPiece(); paras = []; };
  let para: string[] = [];
  const endPara = () => { if (para.length) paras.push(para.join('\n').trim()); para = []; };
  for (const line of body.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { endPara(); flushSection(); heading = h[1].trim(); continue; }
    if (!line.trim()) { endPara(); continue; }
    para.push(line);
  }
  endPara(); flushSection();
  return out;
}

const SYMBOL = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|def|func|fn|pub\s+fn|impl|struct)\s+([A-Za-z_$][\w$]*)/;
export function codeChunks(rel: string, text: string): ChunkRow[] {
  const lines = text.split('\n'); if (lines.at(-1) === '') lines.pop();
  const starts: { line: number; name: string }[] = [];
  lines.forEach((l, i) => { const m = l.match(SYMBOL); if (m) starts.push({ line: i, name: m[1] }); });
  const spans: { a: number; b: number; name?: string }[] = [];   // 0-based, inclusive
  if (!starts.length) for (let a = 0; a < lines.length; a += WIN) spans.push({ a, b: Math.min(lines.length, a + WIN) - 1 });
  else {
    if (starts[0].line > 0) spans.push({ a: 0, b: starts[0].line - 1 });
    starts.forEach((s, k) => spans.push({ a: s.line, b: (k + 1 < starts.length ? starts[k + 1].line : lines.length) - 1, name: s.name }));
  }
  const out: ChunkRow[] = [];
  for (const s of spans) for (let a = s.a; a <= s.b; a += WIN) {
    const b = Math.min(s.b, a + WIN - 1); const t = lines.slice(a, b + 1).join('\n');
    if (!t.trim()) continue;
    out.push(row('code', `${rel}:${a + 1}-${b + 1}`, s.name ? `${rel} › ${s.name}` : rel, t, mentionedIds(t)));
  }
  return out;
}

export function sessionChunks(s: Pick<Session, 'id' | 'instruction' | 'result' | 'log' | 'transcript'>): ChunkRow[] {
  const title = `Session ${s.id} · ${s.instruction.replace(/\s+/g, ' ').slice(0, 80)}`;
  const turns = [s.instruction, ...(s.transcript ?? []).filter(e => e.kind === 'assistant' && e.text).map(e => e.text!), ...(s.result ? [s.result] : [])];
  return turns.map(t => t.trim()).filter(Boolean).map((t, i) => row('session', `${s.id}#${i}`, title, t.slice(0, TURN_MAX), mentionedIds(t)));
}
