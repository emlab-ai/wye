import type { BodyRow } from '@/lib/graph';
import { Linkified } from './IdLink';

export function NodeBody({ rows, project }: { rows: BodyRow[]; project: string }) {
  return (
    <dl className="props">
      {rows.map(r => (
        <div key={r.key} className={`prop ${r.prose ? 'prose' : ''}`}>
          <dt>{r.key}</dt>
          <dd>{r.prose ? <p><Linkified text={r.value} project={project} /></p> : <pre><Linkified text={r.value} project={project} /></pre>}</dd>
        </div>
      ))}
    </dl>
  );
}
