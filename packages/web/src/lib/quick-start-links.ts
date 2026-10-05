// Where the Quick start's buttons and the Help sheet's lines go (docs/superpowers/specs/2026-10-05-onboarding-design.md):
// the pages that live at a project-dependent address — the first document, the newest Prompt Request, the Hooks and
// Skills pages — resolved from the graph once, on the server, and handed to the client components as plain hrefs.
import { docRoute, isSystemFile } from './doc';
import { treeFor, type Scope } from './scope';
import { hooksPageId, skillsPageId } from './skills';
import { prPagesOf } from './onboarding-io';

export interface QuickStartLinks { doc?: string; pr?: string; hooks?: string; skills?: string }

export function quickStartLinks(scope: Scope): QuickStartLinks {
  const base = `/${scope.product.slug}`;
  const href = (file: string | undefined) => { const r = file ? docRoute(file) : null; return r ? `${base}/${r.project}/d/${r.doc}` : undefined; };
  const page = (id: string) => scope.graph.modules.find(m => m.id === id)?.file;
  // the first of the person's documents in tree order: where the `block` step sends them to type an id
  const doc = scope.projects.flatMap(p => treeFor(scope, p.slug).roots).find(d => d.file.includes('/docs/') && !isSystemFile(d.file));
  const pr = prPagesOf(scope.graph, scope.projects.map(p => p.slug))[0];
  const first = (ids: string[]) => ids.map(page).find(Boolean);
  return {
    doc: href(doc?.file), pr: href(pr?.file),
    hooks: href(first(scope.projects.map(p => hooksPageId(p.slug)))),
    skills: href(first(scope.projects.map(p => skillsPageId(p.slug)))),
  };
}
