import { notFound, redirect } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { loadGraph } from '@/lib/load';
import { docSlug } from '@/lib/doc';

// A node's page is its definition inside its document; the route stays for deep links.
export default async function NodePage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id: raw } = await params;
  const id = decodeURIComponent(raw);
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath);
  const n = g.nodes.find(x => x.id === id); if (!n) notFound();
  if (n.file) redirect(`/p/${p.name}/d/${docSlug(n.file)}#n-${encodeURIComponent(id)}`);
  redirect(`/p/${p.name}/graph?focus=${encodeURIComponent(id)}&preset=Mechanics`);
}
