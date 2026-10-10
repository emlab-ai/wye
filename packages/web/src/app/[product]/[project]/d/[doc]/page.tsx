import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isRscRequest } from '@/lib/request';
import { loadScope, treeFor } from '@/lib/scope';
import { loadMarkdown } from '@/lib/load';
import { REPO_ROOT } from '@/lib/products';
import { docRoute, firstScreenCut, isSystemSlug, linkedDocuments, pageBySlug, splitDocument } from '@/lib/doc';
import { ensureSystemPages } from '@/lib/system-pages';
import { bodyOf, hashOf } from '@/lib/write';
import { DocumentReader } from '@/components/DocumentReader';
import { DocProps } from '@/components/DocProps';
import { ImportedNotice } from '@/components/ImportedNotice';
import { ImportProgress } from '@/components/ImportProgress';
import { PrHead } from '@/components/PrHead';
import { RunStrip } from '@/components/RunStrip';
import { LiveDocument } from '@/components/LiveDocument';
import { DocNotFound } from '@/components/DocNotFound';
import { MapCanvas } from '@/components/MapCanvas';
import { mapGraph, parseLayout } from '@/lib/map';
import { runSpots } from '@/lib/runs';
import { analyticsSql, buildAnalytics, facetsOf, parseAnalyticsQuery } from '@/lib/analytics';
import { runQuery } from '@/lib/query';
import { AnalyticsView } from '@/components/AnalyticsView';
import { GoneNotice } from '@/components/GoneNotice';

export default async function DocPage({ params }: { params: Promise<{ product: string; project: string; doc: string }> }) {
  const { product, project, doc } = await params;
  let scope = await loadScope(product, project);
  // a link or tab written with a project that is not (or no longer) the document's: the one project of the product that
  // does hold a page of that slug takes it, rather than a notice for a page that exists
  const elsewhere = (all: NonNullable<Awaited<ReturnType<typeof loadScope>>> | null) => {
    const hits = (all?.projects ?? []).filter(p => p.slug !== project && pageBySlug(treeFor(all!, p.slug).byFile.values(), p.slug, decodeURIComponent(doc)));
    return hits.length === 1 ? `/${product}/${hits[0].slug}/d/${doc}` : null;
  };
  if (!scope) { const all = await loadScope(product); const to = elsewhere(all); if (to) redirect(to); return <GoneNotice what="project" slug={project} product={product} projects={(all?.projects ?? []).map(p => ({ slug: p.slug, title: p.meta.title, icon: p.meta.icon }))} />; }
  // an app-written page (~goals, ~work…) asked for before the layout's first pass built it (lib/system-pages): written
  // and built here, so a brand-new product's rail links never land on "not found"
  if (isSystemSlug(decodeURIComponent(doc)) && !pageBySlug(treeFor(scope, project).byFile.values(), project, decodeURIComponent(doc))) scope = await ensureSystemPages(scope);
  const tree = treeFor(scope, project);
  // a document that is not there — never was, or was deleted outside the app while open — is a notice in place of the
  // content, not a 404 boundary: the layout (top bar, rail, tabs) stays and the next live refresh brings the document
  // back when its file reappears (decision:wf2.deleted-outside-stays-put)
  const d = pageBySlug(tree.byFile.values(), project, decodeURIComponent(doc));
  if (!d) { const to = elsewhere(scope); if (to) redirect(to); return <DocNotFound slug={doc} project={project} />; }
  const md = await loadMarkdown(REPO_ROOT, d.file).catch(() => null); // gone between the graph and this render
  if (md === null) return <DocNotFound slug={doc} project={project} />;
  const split = splitDocument(md);
  const body = bodyOf(md);
  const linked = linkedDocuments(scope.graph, scope.idx, d.file);
  // the server-rendered reader is the first paint of a full page load; a client navigation or a refresh (an RSC request)
  // lands in the editor already on the page, so the markdown is not rendered again on the server (decision:wf2.parse-cache)
  const rsc = await isRscRequest();
  // and of a long page only the first screen (decision:wf2.first-screen-first): rendering all of an 88 KB page was
  // 0.8 s before the browser got a byte, for markup the editor replaces — the editor brings the rest
  const shown = firstScreenCut(body);
  const first = shown < body.length ? splitDocument(body.slice(0, shown)) : split;
  // a map page is a canvas (decision:map.page-owns-its-nodes): its cards are the nodes, so the canvas takes the place of
  // the reader and the page's own text stays a fold away
  // a map page and a run page are both canvases: a run's stages are its nodes, so its sequence and where it stands are
  // the first thing the page shows (decision:run.the-page-is-its-map)
  const isMap = d.module.kind === 'map' || d.module.kind === 'run';
  let spots = isMap ? parseLayout(md) : [];
  // a run whose page was written before it had a map: its stages are read straight from the page, in order
  if (isMap && !spots.length && d.module.kind === 'run') spots = runSpots(scope.graph, d.file);
  const drawn = isMap ? mapGraph(scope.graph, scope.idx, d.file, d.module.id, spots) : null;
  // an analytics page is its grid (decision:waterfall.analytics-view-replaces-timeline, decision:wf2.timeline-is-a-query):
  // the query in its front matter says what it draws and how it is grouped. A page still typed `timeline` is the same
  // view with the track it always had.
  if (d.module.kind === 'analytics' || d.module.kind === 'timeline') {
    const query = split.frontmatter.query ?? '';
    const legacy = d.module.kind === 'timeline';
    const q = parseAnalyticsQuery(query, { legacyTrack: legacy });
    // the data is a query over the graph, as a table's is (decision:wf2.table-is-sql): the strip's SQL, or the page's own,
    // run here; its `id` column picks the cards. A query that fails draws nothing and says why; the strip's SQL that
    // cannot run (no engine) falls back to the same choosing in memory
    const sql = q.sql || analyticsSql(q);
    const ran = await runQuery(product, sql);
    const ids = ran.ok ? new Set(ran.result.rows.map(r => String(r.id ?? ''))) : q.sql ? new Set<string>() : undefined;
    const analytics = buildAnalytics(scope.graph, scope.idx, q, ids);
    const sqlError = ran.ok ? (ran.result.columns.includes('id') ? '' : 'the query has no id column, so no card is picked') : ran.message;
    const kinds = [...new Set(scope.graph.nodes.filter(n => n.defined && n.kind !== 'type' && n.form !== 'block').map(n => n.kind))].sort();
    // what this page can filter and group by: the properties the nodes it draws actually carry, with their values
    const facets = facetsOf(scope.graph.nodes.filter(n => n.defined && n.form !== 'block' && (!q.kinds.length || q.kinds.includes(n.kind))));
    return (
      <div className="page page-map">
        <AnalyticsView product={product} project={project} slug={d.slug} query={query} legacy={legacy} analytics={analytics} kinds={kinds} facets={facets} sql={sql} sqlError={sqlError} />
      </div>
    );
  }
  // a map page is a canvas and nothing else (decision:map.canvas-is-the-page): no properties, no comments, no linked
  // pages — the canvas fills the frame under the top bar, and the page's own text is one toggle away in its toolbar
  if (drawn) return (
    <div className="page page-map">
      {d.module.kind === 'run' && <RunStrip product={product} node={d.module.id} />}
      <MapCanvas product={product} project={project} slug={d.slug} nodes={drawn.nodes} edges={drawn.edges} off={drawn.off} spots={spots} types={(scope.graph.types ?? []).map(t => ({ slug: t.slug, nestsIn: t.nestsIn, props: t.props.map(pr => ({ name: pr.name, ref: pr.ref })) }))}>
        <LiveDocument product={product} project={project} slug={d.slug} body={body} ifMatch={hashOf(body)}>
          {rsc ? null : <DocumentReader doc={split} index={scope.index} />}
        </LiveDocument>
      </MapCanvas>
    </div>
  );
  return (
    <div className={`page${isSystemSlug(d.slug) && !/^~pr-\d+/.test(d.slug) ? ' page-full' : ''}`}>
      {split.frontmatter.type === 'pr' && <PrHead product={product} prRef={`${product}/${project}/${d.slug}`} />}
      <RunStrip product={product} node={d.module.id} />
      {/* a page the app writes as a view (Goals, Work, Hooks, Skills — a `~` slug) has no header of its own: the view is the page; a request's page keeps it */}
      {(!isSystemSlug(d.slug) || /^~pr-\d+/.test(d.slug)) && <DocProps product={product} project={project} slug={d.slug} file={d.file} fm={split.frontmatter} node={d.module.id} types={scope.graph.types ?? []} titled={/^\s*# \S/.test(body)} />}
      {/^Import: /.test(split.frontmatter.title ?? '') && <ImportProgress product={product} slug={d.slug} />}
      {['imported', 'raw', 'importing'].includes(split.frontmatter.status ?? '') && <ImportedNotice product={product} project={project} slug={d.slug} node={d.module.id} status={split.frontmatter.status} source={split.frontmatter.source} />}
      <LiveDocument product={product} project={project} slug={d.slug} body={body} ifMatch={hashOf(body)} shown={shown}>
        {rsc ? null : <DocumentReader doc={first} index={scope.index} />}
      </LiveDocument>
      {linked.length > 0 && (
        <section className="linked"><h2>Linked pages</h2>
          <ul>{linked.map(l => { const r = docRoute(l.file); return <li key={l.file}><Link href={r ? `/${product}/${r.project}/d/${r.doc}` : '#'}>{l.title}</Link> <span className="muted">{l.count} links{r && r.project !== project ? ` · ${r.project}` : ''}</span></li>; })}</ul>
        </section>
      )}
    </div>
  );
}
