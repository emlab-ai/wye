// Server-only: everything a page needs for one product (and optionally one project), loaded once per request.
import { getProduct, getProject, listProjects, type Product, type Project } from './products';
import { loadGraph } from './load';
import { indexGraph, type GraphData, type GraphIndex } from './graph';
import { nodeIndex, projectTree, type IndexEntry } from './doc';
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
  let graph: GraphData;
  try { graph = await loadGraph(product.graphPath); }
  catch {
    graph = EMPTY;
    if (await hasDocs(product.dir)) {
      building.set(product.slug, building.get(product.slug) ?? rebuild(product.dir).finally(() => building.delete(product.slug)));
      const r = await building.get(product.slug)!;
      if (r.code === 0) { try { graph = await loadGraph(product.graphPath); } catch { graph = EMPTY; } }
      else console.warn(`[wf] ${product.slug}: the graph could not be built — ${r.output.split('\n').filter(Boolean).slice(-2).join(' ')}`);
    }
  }
  setKinds(graph.kinds);
  return { product, projects, project, graph, idx: indexGraph(graph), index: nodeIndex(graph) };
}

export function treeFor(scope: Scope, projectSlug: string) { return projectTree(scope.graph, projectSlug); }
