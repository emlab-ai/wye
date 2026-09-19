import type { IndexEntry } from './doc';
// Is a URL this app's, and what does it point at? Pure (rule:app-link): the origin is the page's
// (window.location.origin at render time); localhost and 127.0.0.1 on the same port count as the app too, since the
// agent's WF_URL is whatever host its request came in on and the desktop always loads localhost. A foreign URL, a
// relative path or a hash link is null. The label (appLinkLabel) comes from the path: a document's title when the
// graph knows it, else its slug; the node id from the `#n-` anchor; `session <id>`; `Wye` for the root.
export type AppLink = { kind: 'root' | 'doc' | 'node' | 'session' | 'page'; path: string; hash: string; product?: string; project?: string; doc?: string; node?: string; session?: string };

const LOCAL = new Set(['localhost', '127.0.0.1']);

export function appLink(href: string, origin: string): AppLink | null {
  if (!/^https?:\/\//i.test(href)) return null;
  let u: URL, o: URL;
  try { u = new URL(href); o = new URL(origin); } catch { return null; }
  const samePort = (u.port || (u.protocol === 'https:' ? '443' : '80')) === (o.port || (o.protocol === 'https:' ? '443' : '80'));
  if (u.origin !== o.origin && !(LOCAL.has(u.hostname) && samePort)) return null;
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const hash = u.hash;
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return { kind: 'root', path: '/', hash };
  const [product, a, b, c] = seg;
  if (a === 'sessions' && b && seg.length === 3) return { kind: 'session', path, hash, product, session: b };
  if (b === 'd' && c && seg.length === 4) {
    const m = hash.match(/^#n-(.+)$/);
    const node = m ? decodeURIComponent(m[1]) : undefined;
    return { kind: node ? 'node' : 'doc', path, hash, product, project: a, doc: c, node };
  }
  return { kind: 'page', path, hash, product };
}

// `titles`: document title by slug (docTitles).
export function appLinkLabel(l: AppLink, titles: Record<string, string>): { text: string; node?: string } {
  switch (l.kind) {
    case 'root': return { text: 'Wye' };
    case 'session': return { text: `session ${l.session}` };
    case 'doc': case 'node': { const text = titles[l.doc!] ?? l.doc!; return l.node ? { text, node: l.node } : { text }; }
    default: return { text: l.path.split('/').filter(Boolean).slice(1).join('/') || l.path };
  }
}

// Document titles by slug from the client's node index — the documents' own nodes, wherever they are defined (a
// document's node may be a card in the app map rather than its own frontmatter).
export function docTitles(index: Record<string, IndexEntry>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of Object.values(index)) { if (e.kind !== 'module' || !e.defined) continue; const slug = e.id.slice(e.id.indexOf(':') + 1); if (e.title) out[slug] = e.title; }
  return out;
}

// The same labels as plain text — for a title or a crumb where a tag cannot be rendered.
export function plainAppLinks(text: string, origin: string, titles: Record<string, string>): string {
  return text.replace(/https?:\/\/[^\s)<>"']+/g, m => { const l = appLink(m, origin); if (!l) return m; const lab = appLinkLabel(l, titles); return lab.node ? `${lab.text} › ${lab.node}` : lab.text; });
}
