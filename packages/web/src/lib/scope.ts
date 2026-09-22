// Server-only: everything a page needs for one product (and optionally one project), loaded once per request.
import { getProduct, getProject, listProjects, type Product, type Project } from './products';
import { graphFor } from './build';
import { indexGraph, type GraphData, type GraphIndex } from './graph';
import { nodeIndex, projectTree, type IndexEntry } from './doc';
import { prsPageId } from './pr-doc';
import { setKinds } from './ids';
import { rebuild } from './write';
import { stat } from 'node:fs/promises';

export interface Scope { product: Product; projects: Project[]; project?: Project; graph: GraphData; idx: GraphIndex; index: Record<string, IndexEntry> }

const EMPTY: GraphData = { generatedAt: '', modules: [], files: [], nodes: [], edges: [], fieldIndex: {} };
const building = new Map<string, Promise<{ code: number; output: string }>>();
const hasDocs = async (dir: string) => { try { return (await stat(`${dir}/projects`)).isDirectory(); } catch { return false; } };

export async function loadScope(productSlug: string, projectSlug?: string): Promise<Scope | null> {
  const product = await getProduct(productSlug); if (!product) return null;
  const projects = await listProjects(product);
  const project = projectSlug ? await getProject(product, projectSlug) : undefined;
  if (projectSlug && !project) return null;
  // the graph is derived and not in git (rule:build-is-derived): a fresh clone, or a product whose _build was removed,
  // gets it built on first load — once per product at a time; only a build that also fails leaves the graph empty
  // the graph and its indexes come from the build coordinator's memory (lib/build): one parse per change, not per request
  let cached = await graphFor(product.dir);
  if (!cached && await hasDocs(product.dir)) {
    building.set(product.slug, building.get(product.slug) ?? rebuild(product.dir).finally(() => building.delete(product.slug)));
    const r = await building.get(product.slug)!;
    if (r.code === 0) cached = await graphFor(product.dir);
    else console.warn(`[wf] ${product.slug}: the graph could not be built — ${r.output.split('\n').filter(Boolean).slice(-2).join(' ')}`);
  }
  const graph = cached?.graph ?? EMPTY;
  setKinds(graph.kinds);
  return { product, projects, project, graph, idx: cached?.idx ?? indexGraph(graph), index: cached?.index ?? nodeIndex(graph) };
}

// The product's main project — the one the rail opens: the project whose PRs page exists, else the first on disk.
// Every path that takes an optional project (the imports, `wye import`, `wye deepen`) defaults to it, so nothing has
// to hardcode a slug (req:wf2.import.markdown, req:wf2.import.code).
export function mainProject(scope: Scope): Project | undefined {
  return scope.projects.find(p => scope.graph.modules.some(m => m.id === prsPageId(p.slug))) ?? scope.projects[0];
}
export function treeFor(scope: Scope, projectSlug: string) { return projectTree(scope.graph, projectSlug); }
