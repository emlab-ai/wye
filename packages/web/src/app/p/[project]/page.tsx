import { notFound, redirect } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { loadGraph } from '@/lib/load';
import { documentTree } from '@/lib/doc';

export default async function ProjectHome({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project); if (!p) notFound();
  const { main } = documentTree(await loadGraph(p.graphPath));
  if (!main) notFound();
  redirect(`/p/${p.name}/d/${main.slug}`);
}
