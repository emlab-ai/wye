import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects';
import { indexGraph, loadGraph, type GraphNode } from '@/lib/graph';
import { statusMark } from '@/components/Pills';

export default async function ProjectHome({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const p = getProject(project); if (!p) notFound();
  const g = await loadGraph(p.graphPath); const idx = indexGraph(g);
  const reqs = g.nodes.filter(n => n.kind === 'req' && n.defined);
  const st: Record<string, number> = {};
  for (const r of reqs) st[r.status || 'shipped'] = (st[r.status || 'shipped'] || 0) + 1;
  const tested = (r: GraphNode) => (idx.out.get(r.id) ?? []).some(e => e.verb === 'verified-by');
  const childrenOf = (id: string) => reqs.filter(r => (idx.out.get(r.id) ?? []).some(e => e.verb === 'refines' && e.to === id));
  const isRoot = (r: GraphNode) => !(idx.out.get(r.id) ?? []).some(e => e.verb === 'refines' && idx.byId.get(e.to)?.kind === 'req');
  const groups = new Map<string, GraphNode[]>();
  for (const r of reqs) { const k = r.subsection || 'Requirements'; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  const Item = ({ r }: { r: GraphNode }) => (
    <li>
      <Link href={`/p/${p.name}/n/${encodeURIComponent(r.id)}`} className="rq">
        <span className="t">{r.title}</span><span className={`mark ${statusMark(r.kind, r.status, tested(r))}`} />
        <span className="i">{r.id.slice(4)}{r.status && r.status !== 'shipped' ? ' · ' + r.status : ''}</span>
      </Link>
      {childrenOf(r.id).length > 0 && <ul>{childrenOf(r.id).map(c => <Item key={c.id} r={c} />)}</ul>}
    </li>
  );
  return (
    <div className="page">
      <h1>{p.title}</h1>
      <p className="sub">{g.files.join(', ')} · built {g.generatedAt.slice(0, 10)}</p>
      <div className="stats">
        <div className="stat"><b>{reqs.length}</b><span>requirements</span></div>
        <div className="stat ok"><b>{st.shipped || 0}</b><span>shipped</span></div>
        <div className="stat warn"><b>{(st.unverified || 0) + (st['api-only'] || 0)}</b><span>unverified</span></div>
        <div className="stat"><b>{st.proposed || 0}</b><span>proposed</span></div>
        <div className="stat bad"><b>{g.nodes.filter(n => n.kind === 'drift').length}</b><span>drift rows</span></div>
      </div>
      {[...groups].map(([title, rs]) => (
        <section key={title}>
          <h2>{title.replace(/^R\.\d+\s*/, '')}</h2>
          <ul className="tree">{rs.filter(isRoot).map(r => <Item key={r.id} r={r} />)}</ul>
        </section>
      ))}
    </div>
  );
}
