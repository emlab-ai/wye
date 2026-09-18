// Duplicating and deleting documents from the tree (rule:tree-menu). Pure; the routes under api/[product]/docs do the files.
import type { DocNode } from './doc';
import { rewriteId } from './retype';

// The slug of a copy: <slug>-copy, then -copy-2, -copy-3 … while a document with that slug exists in the project.
export function copySlug(slug: string, taken: Set<string>): string {
  let n = 1, s = `${slug}-copy`;
  while (taken.has(s)) { n++; s = `${slug}-copy-${n}`; }
  return s;
}

// The markdown of a copy: the node line and every id the document defines take the copy's suffix (so the copy is
// a valid page with no duplicate ids — references to nodes of other documents stay), the title gets " (copy)".
export function duplicateMarkdown(md: string, o: { ids: string[]; slug: string; newSlug: string }): string {
  const suffix = o.newSlug.startsWith(o.slug) ? o.newSlug.slice(o.slug.length) : `-${o.newSlug}`;
  let out = md;
  for (const id of [...o.ids].sort((a, b) => b.length - a.length)) out = rewriteId(out, id, `${id}${suffix}`).md;
  const fm = out.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const lines = fm[1].split('\n').map(l => {
      const m = l.match(/^title:\s*(.*)$/); if (!m) return l;
      const raw = m[1].trim(); const quoted = /^".*"$/.test(raw); const t = quoted ? raw.slice(1, -1) : raw;
      const nt = t.endsWith('(copy)') ? t : `${t} (copy)`;
      return `title: ${quoted ? `"${nt}"` : nt}`;
    });
    out = '---\n' + lines.join('\n') + '\n---' + out.slice(fm[0].length);
    const title = fm[1].match(/^title:\s*"?(.*?)"?\s*$/m)?.[1];
    if (title && !title.endsWith('(copy)')) out = out.replace(new RegExp(`^# ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \t]*$`, 'm'), `# ${title} (copy)`);
  }
  return out;
}

// A document and every document under it, depth first — what a delete removes (decision:wf2.tree-delete-subtree).
export function subtree(d: DocNode): DocNode[] { return [d, ...d.children.flatMap(subtree)]; }
