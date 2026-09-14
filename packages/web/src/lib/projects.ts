import path from 'node:path';

export interface Project { name: string; title: string; graphPath: string }

// Registry for this slice: one project per entry; WATERFALL_PROJECTS="name=title=/abs/path/graph.json;..." overrides.
const REPO_ROOT = path.resolve(process.cwd(), process.env.WATERFALL_REPO_ROOT ?? '../..');
const DEFAULT: Project[] = [
  { name: 'waterfall', title: 'Waterfall', graphPath: path.join(REPO_ROOT, 'docs/context-graph/_build/graph.json') },
];

export function listProjects(): Project[] {
  const env = process.env.WATERFALL_PROJECTS;
  if (!env) return DEFAULT;
  return env.split(';').filter(Boolean).map(entry => {
    const [name, title, graphPath] = entry.split('=');
    return { name, title: title || name, graphPath };
  });
}
export function getProject(name: string): Project | undefined {
  return listProjects().find(p => p.name === name);
}
