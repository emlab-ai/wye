import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { indexGraph, loadGraph, parseBody, relations } from '@/lib/graph';
import { KindPill, StatusPill, StubPill } from '@/components/Pills';
import { NodeBody } from '@/components/NodeBody';
import { Relations } from '@/components/Relations';
import { IdLink } from '@/components/IdLink';

export default async function NodePage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id: raw } = await params;
  const id = decodeURIComponent(raw);
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const n = idx.byId.get(id); if (!n) notFound();
  const rows = parseBody(n.body);
  const rel = relations(idx, id);
  const links = (idx.out.get(id)?.length ?? 0) + (idx.inc.get(id)?.length ?? 0);
  return (
    <article className="page node">
      <div className="pills"><KindPill kind={n.kind} /><StatusPill status={n.status || (n.kind === 'req' ? 'shipped' : '')} /><StubPill defined={n.defined} /></div>
      <h1>{n.title || n.id}</h1>
      <p className="sub">
        <code>{n.id}</code>{n.owner && <> · field of <IdLink id={n.owner} project={p.name} /></>}{n.section && <> · §{n.section}</>} · {links} links{n.file && <> · {n.file}:{n.line}</>}
        {' · '}<Link href={`/p/${p.name}/graph?focus=${encodeURIComponent(id)}`}>show in graph</Link>
      </p>
      {n.defined ? <NodeBody rows={rows} project={p.name} /> : <p className="muted">Referenced by other nodes but not described yet.</p>}
      <Relations project={p.name} rel={rel} byId={idx.byId} />
    </article>
  );
}
