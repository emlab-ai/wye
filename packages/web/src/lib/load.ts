import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GraphData } from './graph';

// Server-only: the one place the web app touches the filesystem. Keep graph.ts free of node: imports so client components can use it.
export async function loadGraph(graphPath: string): Promise<GraphData> {
  return JSON.parse(await readFile(graphPath, 'utf8')) as GraphData;
}

export async function loadMarkdown(rootPath: string, file: string): Promise<string> {
  return readFile(path.join(rootPath, file), 'utf8');
}
