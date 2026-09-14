export const TEMPLATES = ['blank', 'prd', 'dev-design', 'test-design', 'plan'] as const;
export type TemplateName = typeof TEMPLATES[number];

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'doc';
}

export function instantiate(template: string, vars: { title: string; slug: string; parent: string; date: string }): string {
  return template.replace(/\{\{(title|slug|parent|date)\}\}/g, (_, k: keyof typeof vars) => vars[k]);
}
