// What the deep lane is doing and what it has looked at, read off its tool calls (decision:wf2.ask-two-lanes): every
// file, node or passage it opens becomes a source the panel shows while it is still working. Pure.
import path from 'node:path';

const arg = (cmd: string, re: RegExp) => cmd.match(re)?.[1];
export function stepText(name: string, input: Record<string, unknown>, roots?: { code: string; product: string }): string {
  const shortPath = (p: string) => roots && p.startsWith(roots.code + '/') ? p.slice(roots.code.length + 1) : path.basename(p);
  if (name === 'Bash') {
    const c = String(input.command ?? '');
    const q = arg(c, /ask-search\s+"([^"]+)"/) ?? arg(c, /ask-search\s+'([^']+)'/); const src = arg(c, /--source\s+(\w+)/);
    if (q) return `Searching “${q}”${src ? ` in ${src}` : ''}`;
    const nb = arg(c, /wye\s+(?:graph\s+)?neighbors\s+(\S+)/); if (nb) return `Following the links of ${nb}`;
    const id = arg(c, /wye\s+(?:node|get|resolve|explain)\s+(\S+)/); if (id) return `Reading ${id}`;
    const d = arg(c, /wye\s+doc\s+(\S+)/); if (d) return `Reading ${d}`;
    const s = arg(c, /wye\s+session\s+show\s+(\S+)/); if (s) return `Reading session ${s}`;
    return `Running ${c.slice(0, 60)}`;
  }
  if (name === 'Read') return `Reading ${shortPath(String(input.file_path ?? ''))}`;
  if (name === 'Grep') return `Searching the code for “${String(input.pattern ?? '')}”`;
  if (name === 'Glob') return `Listing ${String(input.pattern ?? '')}`;
  return name;
}
export function refsFromToolUse(name: string, input: Record<string, unknown>, roots: { code: string; product: string }): string[] {
  if (name === 'Read') {
    const f = String(input.file_path ?? '');
    const doc = f.match(/\/projects\/([^/]+)\/(docs|\.wye)\/([^/]+)\.md$/);
    if (f.startsWith(roots.product + '/') && doc) return [`doc-file:${doc[1]}/${doc[2] === '.wye' ? '~' : ''}${doc[3]}`];
    if (!roots.code || !f.startsWith(roots.code + '/')) return [];
    const a = Number(input.offset ?? 1) || 1; const n = Number(input.limit ?? 60) || 60;
    return [`${f.slice(roots.code.length + 1)}:${a}-${a + n - 1}`];
  }
  if (name === 'Bash') { const id = arg(String(input.command ?? ''), /wye\s+(?:node|get|neighbors|graph\s+neighbors)\s+([a-z][a-z-]*:[\w.-]+)/); return id ? [id] : []; }
  return [];
}

export function refsFromToolResult(text: string, known: (id: string) => boolean): string[] {
  const out: string[] = [];
  try { const j = JSON.parse(text) as { hits?: { id?: string }[] }; for (const h of j.hits ?? []) if (h.id && !out.includes(h.id)) out.push(h.id); if (out.length) return out; } catch { /* not ask-search JSON */ }
  for (const m of text.matchAll(/(?<![\w/:.])([a-z][a-z-]*:\w(?:[\w.-]*\w)?)/g)) if (known(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out.slice(0, 20);
}
