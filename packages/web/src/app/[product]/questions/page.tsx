import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { listInboxItems } from '@/lib/inbox';
import { docRoute } from '@/lib/doc';
import { parseBody } from '@/lib/graph';
import { QuestionList, type QuestionRow } from '@/components/QuestionList';

// Every open question about the product: question nodes in the documents and question items waiting in the inbox.
export default async function QuestionsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const fromDocs: QuestionRow[] = scope.graph.nodes.filter(n => n.defined && (n.kind === 'question' || n.status === 'question')).map(n => {
    const r = docRoute(n.file); const rows = parseBody(n.body); const q = rows.find(x => x.key === 'q')?.value ?? rows.find(x => x.key === 'text')?.value ?? rows.find(x => x.key === 'title')?.value ?? n.title;
    return { key: n.id, source: 'doc', id: n.id, title: q, status: n.status || 'open', where: r ? `${r.project} / ${r.doc}` : n.file, href: r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(n.id)}` : undefined, when: '', refs: (scope.idx.out.get(n.id) ?? []).filter(e => e.verb !== 'mentions').map(e => e.to).slice(0, 6) };
  });
  const fromInbox: QuestionRow[] = (await listInboxItems(scope.product.dir)).filter(i => i.type === 'question').map(i => ({ key: i.name, source: 'inbox', title: i.title, text: i.fields.q || i.body, status: i.status, where: `inbox · ${i.from}`, href: `/${product}/inbox`, when: i.added, refs: i.refs, node: i.node }));
  const rows = [...fromInbox, ...fromDocs].sort((a, b) => (b.when || '').localeCompare(a.when || ''));
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Questions</h1><p className="sub">what is still undecided: question nodes in the documents and questions agents raised in the inbox. Answering one is a decision — record it in the inbox, then resolve the question.</p></header>
      <QuestionList product={product} rows={rows} />
    </div>
  );
}
