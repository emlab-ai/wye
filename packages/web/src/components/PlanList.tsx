'use client';
import Link from 'next/link';
import { planDocPath } from '@/lib/plan-doc';
import type { Session, SessionPlan } from '@/lib/session-types';

const when = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); const m = (Date.now() - d.getTime()) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : d.toLocaleDateString(); };

// A worker's work items (decision:wf2.plan-per-request): the plan documents of a session, oldest first — the status,
// the title as a link to the plan page, tasks done over all, when it started. The plan the session is on now is
// marked while the session is active; a plan still `proposed` on a session that is running shows as running.
// Shown on the Agents rows (component:session-list) and the session head (component:session-view).
export function PlanList({ session: s, plans, compact }: { session: Pick<Session, 'planDoc' | 'status' | 'live' | 'busy'>; plans: SessionPlan[]; compact?: boolean }) {
  if (!plans.length) return null;
  const active = s.status === 'queued' || s.status === 'running' || s.live || s.busy;
  return (
    <ul className={`plan-list ${compact ? 'compact' : ''}`} onClick={e => e.stopPropagation()}>
      {plans.map(p => {
        const current = active && p.ref === s.planDoc;
        const status = current && p.status === 'proposed' ? (s.busy || s.status === 'running' ? 'running' : 'live') : p.status;
        return (
          <li key={p.ref} className={`plan-item ${current ? 'on' : ''}`} title={p.node}>
            <span className={`pill s ${status}`}>{status}</span>
            <Link className="plan-title" href={planDocPath(p.ref)}>{p.title}</Link>
            {p.tasks.total > 0 && <span className={`plan-tasks ${p.tasks.done === p.tasks.total ? 'all' : ''}`} title="tasks done / all">{p.tasks.done}/{p.tasks.total} tasks</span>}
            <span className="muted plan-when">{p.finished && p.status !== 'proposed' ? `finished ${when(p.finished)}` : when(p.started)}</span>
          </li>);
      })}
    </ul>
  );
}
