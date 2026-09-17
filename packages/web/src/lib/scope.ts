// Server-only: everything a page needs for one product (and optionally one project), loaded once per request.
import { getProduct, getProject, listProjects, type Product, type Project } from './products';
import { loadGraph } from './load';
import { indexGraph, type GraphData, type GraphIndex } from './graph';
import { nodeIndex, projectTree, type IndexEntry } from './doc';
import { setKinds } from './ids';

export interface Scope { product: Product; projects: Project[]; project?: Project; graph: GraphData; idx: GraphIndex; index: Record<string, IndexEntry> }

const EMPTY: GraphData = { generatedAt: '', modules: [], files: [], nodes: [], edges: [], fieldIndex: {} };

export async function loadScope(productSlug: string, projectSlug?: string): Promise<Scope | null> {
  const product = await getProduct(productSlug); if (!product) return null;
  const projects = await listProjects(product);
  const project = projectSlug ? await getProject(product, projectSlug) : undefined;
  if (projectSlug && !project) return null;
  let graph: GraphData; try { graph = await loadGraph(product.graphPath); } catch { graph = EMPTY; }
  setKinds(graph.kinds);
  return { product, projects, project, graph, idx: indexGraph(graph), index: nodeIndex(graph) };
}

export function treeFor(scope: Scope, projectSlug: string) { return projectTree(scope.graph, projectSlug); }
