// Stable addresses for blocks. A node block is addressed by its id (#n-<id>), a heading by its slug, and any other
// block by a short hash of its text (#b-<hash>): the link survives moves and edits elsewhere in the document and
// falls back to the document when the block's own text changes.
export function normalizeText(t: string): string {
  return t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~#>|\\-]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
// FNV-1a, 32 bit, as 8 hex chars: tiny, synchronous, identical in the browser and in node.
export function blockHash(text: string): string {
  const s = normalizeText(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export type Anchor = { kind: 'node'; id: string } | { kind: 'heading'; slug: string } | { kind: 'block'; hash: string };
export function parseAnchor(fragment: string): Anchor | null {
  const f = fragment.replace(/^#/, '');
  if (!f) return null;
  if (f.startsWith('n-')) return { kind: 'node', id: decodeURIComponent(f.slice(2)) };
  if (f.startsWith('b-')) return { kind: 'block', hash: f.slice(2) };
  return { kind: 'heading', slug: f };
}
export function anchorFor(a: Anchor): string {
  return a.kind === 'node' ? `n-${encodeURIComponent(a.id)}` : a.kind === 'block' ? `b-${a.hash}` : a.slug;
}
// The blocks of a markdown body a link can point at: every non-empty line (list items, table rows) and every
// blank-line-separated paragraph, each with its hash and 1-based start line.
export function hashableBlocks(body: string): { hash: string; line: number; text: string }[] {
  const out: { hash: string; line: number; text: string }[] = [];
  const lines = body.split('\n');
  let para: string[] = []; let start = 0; let fence = false;
  const flush = () => { if (para.length) { const text = para.join('\n'); out.push({ hash: blockHash(text), line: start, text }); } para = []; };
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!l.trim()) { flush(); return; }
    if (!para.length) start = i + 1;
    para.push(l);
    const item = l.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '');
    if (!fence && item !== l) out.push({ hash: blockHash(item), line: i + 1, text: l });
  });
  flush();
  return out;
}
