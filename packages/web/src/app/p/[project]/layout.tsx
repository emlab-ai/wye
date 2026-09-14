import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { getProject } from '@/lib/projects';
import { loadGraph, sidebarTree } from '@/lib/graph';

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project);
  if (!p) notFound();
  const g = await loadGraph(p.graphPath);
  const tree = sidebarTree(g);
  const counts = {
    nodes: g.nodes.length,
    reqs: g.nodes.filter(n => n.kind === 'req').length,
    drift: g.nodes.filter(n => n.kind === 'drift').length,
    questions: g.nodes.filter(n => n.kind === 'question').length,
  };
  return (
    <div className="shell">
      <Sidebar project={p.name} projectTitle={p.title} tree={tree} counts={counts} />
      <main className="content">{children}</main>
    </div>
  );
}
