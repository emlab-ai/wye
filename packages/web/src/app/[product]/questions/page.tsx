import { notFound } from 'next/navigation';
import { loadScope } from '@/lib/scope';
import { reviewQueue } from '@/lib/review';
import { docRoute } from '@/lib/doc';
import { parseBody } from '@/lib/graph';
import { QuestionList, type QuestionRow } from '@/components/QuestionList';

// Every question in the product's documents: open ones first. A question is a `question:` block where it arose.
export default async function QuestionsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const scope = await loadScope(product); if (!scope) notFound();
  const openIds = new Set(reviewQueue(product, scope.graph, scope.idx).filter(i => i.kind === 'question').map(i => i.id));
  const rows: QuestionRow[] = scope.graph.nodes.filter(n => n.defined && (n.kind === 'question' || n.status === 'question')).map(n => {
    const r = docRoute(n.file); const b = parseBody(n.body); const q = b.find(x => x.key === 'q')?.value ?? b.find(x => x.key === 'text')?.value ?? b.find(x => x.key === 'title')?.value ?? n.title;
    return { key: n.id, source: 'doc' as const, id: n.id, title: q, status: openIds.has(n.id) ? (n.status || 'open') : (n.status || 'resolved'), where: r ? `${r.project} / ${r.doc}` : n.file, href: r ? `/${product}/${r.project}/d/${r.doc}#n-${encodeURIComponent(n.id)}` : undefined, when: '', refs: (scope.idx.out.get(n.id) ?? []).filter(e => e.verb !== 'mentions').map(e => e.to).slice(0, 6), open: openIds.has(n.id) };
  }).sort((a, b) => Number(b.open) - Number(a.open) || a.where.localeCompare(b.where));
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Questions</h1><p className="sub">what the documents leave undecided. A question is a question block where it arose; the answer is a decision block, and the question is resolved in the inbox.</p></header>
      <QuestionList product={product} rows={rows} />
    </div>
  );
}
