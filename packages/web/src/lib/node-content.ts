// A node's content in its document (req:ontology.content): the lines indented under its defining line — after a
// prose line's continuation text, after a yaml card's closing fence — read de-indented and written back indented,
// the same form lib/parse.js reads and serialize.ts#contentLines writes. Pure; the route does the file.
import { continuationEnd } from './node-edit';

const indentOf = (l: string) => l.match(/^\s*/)![0].length;
const isItem = (l: string) => /^\s*([-*+]|\d+[.)])\s/.test(l);
const FENCE = /^\s*(```|~~~)/;

// Where a node's content sits: [start, end) line indexes (start may point at the blank line that opens it), the
// indent of the defining line, and for a card that is not last in its fence, where the fence would be split.
export type Extent = { start: number; end: number; indent: number; split?: { at: number; pad: string } };

export function contentExtent(lines: string[], id: string, line: number, form: string): Extent | null {
  if (form === 'prose') {
    const defines = (l: string) => new RegExp('^(\\s*(?:[-*+]|\\d+[.)])\\s+(?:\\[[ xX]\\]\\s+)?|\\s*)' + esc(id) + '(?=\\s)').test(l);
    let i = line - 1;
    if (!lines[i] || !defines(lines[i])) i = lines.findIndex(defines);
    if (i < 0) return null;
    const j = continuationEnd(lines, i);
    return { start: j, end: runEnd(lines, j, indentOf(lines[i])), indent: indentOf(lines[i]) };
  }
  if (form === 'block') return null;
  // a yaml card: its chunk inside the fence; content follows the closing fence when the chunk is the last one
  const idLine = (l: string) => new RegExp('^\\s*-\\s*id:\\s*' + esc(id) + '\\s*$').test(l);
  let c = lines.findIndex(idLine); if (c < 0) return null;
  let f = c; while (f >= 0 && !/^\s*```ya?ml/.test(lines[f])) f--; if (f < 0) return null;
  const pad = ' '.repeat(indentOf(lines[f]));
  let close = f + 1; while (close < lines.length && !/^\s*```\s*$/.test(lines[close])) close++;
  let next = c + 1; while (next < close && !/^\s*-\s*id:/.test(lines[next])) next++;
  if (next < close) return { start: next, end: next, indent: indentOf(lines[f]), split: { at: next, pad } };
  return { start: close + 1, end: runEnd(lines, close + 1, indentOf(lines[f])), indent: indentOf(lines[f]) };
}

// The end of the content run that starts at j: blank lines and lines indented deeper than `indent` (a fence's body
// whole), trailing blank lines left out.
function runEnd(lines: string[], j: number, indent: number): number {
  let k = j;
  while (k < lines.length) {
    const l = lines[k];
    if (!l.trim()) { k++; continue; }
    if (indentOf(l) <= indent) break;
    if (FENCE.test(l)) { const m = l.match(FENCE)![1]; k++; while (k < lines.length && !lines[k].trimStart().startsWith(m)) k++; if (k < lines.length) k++; continue; }
    k++;
  }
  while (k > j && !lines[k - 1].trim()) k--;
  return k;
}

// The node's content as markdown of its own (de-indented), '' when it has none.
export function readContent(md: string, id: string, line: number, form: string): string | null {
  const lines = md.split('\n');
  const ex = contentExtent(lines, id, line, form); if (!ex) return null;
  const run = lines.slice(ex.start, ex.end); while (run.length && !run[0].trim()) run.shift();
  if (!run.length) return '';
  const base = Math.min(...run.filter(l => l.trim()).map(indentOf));
  return run.map(l => l.trim() ? l.slice(base) : '').join('\n');
}

// Replace the node's content with `content` (markdown of its own; '' removes it): indented two spaces deeper than
// the defining line, a blank line before it unless it starts with a list item (the parser's rule for content vs
// continuation text), a blank line after it when a block follows on the next line. A card that is not last in its
// fence gets the fence split so its content can follow the card.
export function writeContent(md: string, id: string, line: number, form: string, content: string): string | null {
  const lines = md.split('\n');
  const ex = contentExtent(lines, id, line, form); if (!ex) return null;
  const pad = ' '.repeat(ex.indent + 2);
  const body = content.replace(/\s+$/, '').split('\n').map(l => l.trim() ? pad + l : '');
  const has = body.some(l => l.trim());
  if (ex.split) {
    if (!has) return md;
    const fp = ex.split.pad;
    lines.splice(ex.split.at, 0, fp + '```', '', ...body, '', fp + '```yaml');
    return lines.join('\n');
  }
  const out: string[] = [];
  if (has) {
    if (!isItem(body[0]) || form !== 'prose') out.push(''); // a card's content always starts after a blank line (serialize.ts writes it so)
    out.push(...body);
    const after = lines[ex.end];
    if (after !== undefined && after.trim() && !isItem(body[body.length - 1])) out.push('');
  } else if (ex.start < ex.end && lines[ex.end] !== undefined && lines[ex.end].trim() && lines[ex.start - 1]?.trim()) out.push(''); // keep the blocks apart
  lines.splice(ex.start, ex.end - ex.start, ...out);
  return lines.join('\n');
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
