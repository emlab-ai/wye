'use client';
import Link from 'next/link';
import { prDocPath } from '@/lib/pr-doc';
import type { Session, SessionPr } from '@/lib/session-types';

const when = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); const m = (Date.now() - d.getTime()) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : d.toLocaleDateString(); };

// A worker's work items (decision:wf2.plan-per-request): the requests of a session, oldest first — the status, the
// title as a link to the request page, tasks done over all, when it started. The request the session is on now is
// marked while the session is active; one still `draft` on a session that is running shows as running.
// Shown on the Agents rows (component:session-list) and the session head (component:session-view).
export function PrList({ session: s, prs, compact }: { session: Pick<Session, 'prDoc' | 'status' | 'live' | 'busy'>; prs: SessionPr[]; compact?: boolean }) {
  if (!prs.length) return null;
  const active = s.status === 'queued' || s.status === 'running' || s.live || s.busy;
  return (
    <ul className={`pr-list ${compact ? 'compact' : ''}`} onClick={e => e.stopPropagation()}>
      {prs.map(p => {
        const current = active && p.ref === s.prDoc;
        const status = current && p.status === 'draft' ? (s.busy || s.status === 'running' ? 'running' : 'live') : p.status;
        return (
          <li key={p.ref} className={`pr-item ${current ? 'on' : ''}`} title={p.node}>
            <span className={`pill s ${status}`}>{status}</span>
            <Link className="pr-title" href={prDocPath(p.ref)}>{p.title}</Link>
            {p.tasks.total > 0 && <span className={`pr-tasks ${p.tasks.done === p.tasks.total ? 'all' : ''}`} title="tasks done / all">{p.tasks.done}/{p.tasks.total} tasks</span>}
            <span className="muted pr-when">{p.finished && p.status !== 'draft' ? `finished ${when(p.finished)}` : when(p.started)}</span>
          </li>);
      })}
    </ul>
  );
}
