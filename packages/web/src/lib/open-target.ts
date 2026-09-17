// Where `wf session open <target>` sends the person's browser: a document ref (product/project/doc or project/doc,
// with an optional #node suffix) becomes the document path with the node's anchor; an app URL keeps its path and
// hash; anything else is refused ('').
export function openTarget(product: string, target: string): string {
  const t = target.trim(); if (!t) return '';
  if (/^https?:\/\//.test(t)) { try { const u = new URL(t); return u.pathname + u.hash; } catch { return ''; } }
  if (t.startsWith('/')) return t;
  const [ref, node] = t.split('#');
  const parts = ref.split('/').filter(Boolean);
  const [prod, project, doc] = parts.length === 3 ? parts : parts.length === 2 ? [product, ...parts] : [];
  if (!prod || !project || !doc) return '';
  return `/${prod}/${project}/d/${doc}${node ? `#n-${encodeURIComponent(node)}` : ''}`;
}
