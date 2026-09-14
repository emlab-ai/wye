import type { CSSProperties } from 'react';
import type { GraphNode } from '@/lib/graph';
import { IdLink } from './IdLink';

const ORDER = ['req', 'rule', 'op', 'page', 'action', 'entity', 'field', 'value', 'state', 'flag', 'gate', 'decision', 'question', 'drift', 'test', 'ui-test', 'module', 'product'];
const sortIds = (ids: string[]) => [...ids].sort((a, b) => ORDER.indexOf(a.split(':')[0]) - ORDER.indexOf(b.split(':')[0]) || a.localeCompare(b));

export function Relations({ project, rel, byId }: { project: string; rel: { out: [string, string[]][]; inc: [string, string[]][] }; byId: Map<string, GraphNode> }) {
  const chip = (id: string) => {
    const n = byId.get(id);
    return <span key={id} className={`chip ${n?.defined ? '' : 'stub'}`} style={{ '--kc': `var(--k-${id.split(':')[0]}, var(--k-other))` } as CSSProperties}><i /><IdLink id={id} project={project} label={n?.kind === 'req' ? id.slice(4) : id} /></span>;
  };
  return (
    <div className="rels">
      {rel.out.map(([verb, ids]) => <div key={'o' + verb}><h4>{verb} →</h4><div className="chips">{sortIds(ids).map(chip)}</div></div>)}
      {rel.inc.map(([verb, ids]) => <div key={'i' + verb}><h4>← {verb} by</h4><div className="chips">{sortIds(ids).map(chip)}</div></div>)}
    </div>
  );
}
