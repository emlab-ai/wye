export const TEMPLATES = ['blank', 'prd', 'dev-design', 'test-design', 'plan', 'research'] as const;
export type TemplateName = typeof TEMPLATES[number];

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'doc';
}

// `kind` is the page's type (module by default, rule:page-node-line); `parent` the parent document's node id;
// `props` the type's required properties, written as empty keys at the end of the frontmatter.
export function instantiate(template: string, vars: { title: string; slug: string; parent: string; date: string; kind?: string; props?: string[] }): string {
  const v = { ...vars, kind: vars.kind || 'module' };
  let out = template.replace(/\{\{(title|slug|parent|date|kind)\}\}/g, (_, k: 'title' | 'slug' | 'parent' | 'date' | 'kind') => v[k]);
  if (vars.props?.length) out = out.replace(/^---\n([\s\S]*?)\n---/, (_, fm: string) => `---\n${fm}\n${vars.props!.map(p => `${p}:`).join('\n')}\n---`);
  return out;
}
