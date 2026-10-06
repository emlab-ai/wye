// Ask (decision:wf2.ask-sources, decision:wf2.ask-two-lanes): the shapes shared by the index, the retriever, the two
// answer lanes, the API and the panel. Client-safe: no node imports.
export type Source = 'node' | 'doc' | 'code' | 'session';
export const SOURCES: Source[] = ['node', 'doc', 'code', 'session'];
// one indexed passage. id = `<source>:<ref>`; ref is what a citation opens; nodes = node ids the passage is about
export interface ChunkRow { id: string; source: Source; ref: string; title: string; text: string; nodes: string[] }
// vault / vaultTitle: set on a hit from another vault of the workspace (a search over the whole workspace)
export interface Hit extends ChunkRow { score: number; via?: string; href: string | null; vault?: string; vaultTitle?: string }
export interface Citation { n: number; ref: string; source: Source; title: string; href: string | null; snippet: string }
export type AskEvent =
  | { type: 'results'; hits: Hit[]; degraded?: string; indexing?: boolean }
  | { type: 'fast.delta'; text: string }
  | { type: 'fast.done'; citations: Citation[] }
  | { type: 'step'; text: string }
  | { type: 'found'; citation: Citation }
  | { type: 'deep.delta'; text: string }
  | { type: 'deep.done'; citations: Citation[]; cut?: boolean }
  | { type: 'error'; lane: 'fast' | 'deep' | 'retrieve'; message: string }
  | { type: 'done' };
export type Lane = 'fast' | 'deep';
export interface AskRequest { q: string; history?: { q: string; a: string }[]; lanes?: Lane[] }
