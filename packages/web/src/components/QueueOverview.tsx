'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { railAgents, type RailAgent, type RailSession } from '@/lib/rail-agents';

type Batch = { requestSlug: string; project: string; title: string; total: number; done: number; current: string | null; stopped: boolean; legacy: boolean; next: string[] };
type Slots = { parallel: number; running: number; waiting: string[] };

// The top of the Agents page: everything queued, in one place — what runs now (and how many agent slots it takes),
// what waits for a slot and in which order, and each background import with the file it is on and the files after it.
export function QueueOverview({ product }: { product: string }) {
  const [agents, setAgents] = useState<RailAgent[]>([]);
  const [slots, setSlots] = useState<Slots | null>(null);
  const [imports, setImports] = useState<Batch[]>([]);
  const load = useCallback(async () => {
    const get = async <T,>(u: string): Promise<T | null> => { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() as T : null; } catch { return null; } };
    const [s, q, i] = await Promise.all([get<{ sessions: RailSession[] }>(`/api/${product}/sessions`), get<Slots>(`/api/${product}/queue`), get<{ batches: Batch[] }>(`/api/${product}/imports`)]);
    if (s) setAgents(railAgents(s.sessions)); if (q) setSlots(q); if (i) setImports(i.batches);
  }, [product]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 4000); const h = () => void load(); window.addEventListener('wf:change', h); return () => { clearInterval(t); window.removeEventListener('wf:change', h); }; }, [load]);
  const cancel = async (id: string) => { await fetch(`/api/${product}/sessions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }).catch(() => undefined); void load(); };
  const importAct = async (slug: string, action: 'stop' | 'resume') => { await fetch(`/api/${product}/imports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, action }) }).catch(() => undefined); void load(); };

  const running = agents.filter(a => a.state !== 'queued');
  const byId = new Map(agents.map(a => [a.id, a]));
  const order = slots?.waiting ?? [];
  const queued = [...order.map(id => byId.get(id)).filter((a): a is RailAgent => !!a), ...agents.filter(a => a.state === 'queued' && !order.includes(a.id))];
  const chat = (id: string) => `/${product}/sessions/${id}/chat`;

  return (
    <section className="queue">
      <div className="q-col">
        <h3>Running <small>{slots ? `${slots.running} of ${slots.parallel} agent slot${slots.parallel === 1 ? '' : 's'}` : ''}</small></h3>
        {running.length ? <ol className="q-list">{running.map(a => (
          <li key={a.id}><Link href={chat(a.id)}><b>{a.title}</b><span className="muted">{a.state === 'asking' ? 'waiting for your answer' : a.state === 'idle' ? 'idle — waiting for a message' : a.doing || 'working'} · {a.since}</span></Link>
            <button onClick={() => void cancel(a.id)} title="End this agent's process">Cancel</button></li>))}</ol>
          : <p className="muted small">no agent is running</p>}
        {slots && <p className="muted small">Agents beyond {slots.parallel} wait below — Settings › Agents sets how many run at once.</p>}
      </div>
      <div className="q-col">
        <h3>Waiting for a slot <small>{queued.length || ''}</small></h3>
        {queued.length ? <ol className="q-list numbered">{queued.map((a, i) => (
          <li key={a.id}><Link href={chat(a.id)}><b>{a.title}</b><span className="muted">{i === 0 ? 'starts next' : `${i + 1}th in line`} · queued {a.since}</span></Link>
            <button onClick={() => void cancel(a.id)} title="Take it out of the queue">Cancel</button></li>))}</ol>
          : <p className="muted small">nothing waits — the next agent starts at once</p>}
      </div>
      <div className="q-col">
        <h3>Imports <small>{imports.length || ''}</small></h3>
        {imports.length ? imports.map(b => (
          <div key={b.requestSlug} className="q-import">
            <div className="q-import-head"><Link href={`/${product}/${b.project}/d/${b.requestSlug}`}><b>{b.title}</b></Link>
              <span className="muted">{b.done} of {b.total} · {b.stopped ? 'paused' : 'importing'}</span>
              {b.stopped ? <button className="pri" onClick={() => void importAct(b.requestSlug, 'resume')}>Resume</button>
                : !b.legacy && <button onClick={() => void importAct(b.requestSlug, 'stop')} title="No further file starts; the one running finishes">Pause</button>}</div>
            <div className="ip-bar"><i style={{ width: `${b.total ? Math.round(b.done / b.total * 100) : 0}%` }} /></div>
            <p className="small">{b.current ? <>now <code>{b.current}</code> · </> : null}{b.next.length ? <>next: {b.next.join(', ')}{b.total - b.done > b.next.length + (b.current ? 1 : 0) ? ` and ${b.total - b.done - b.next.length - (b.current ? 1 : 0)} more` : ''}</> : 'nothing left'}</p>
            <p className="muted small">one file at a time, each through an agent slot{b.stopped ? ' — paused: nothing new starts' : ''}</p>
          </div>)) : <p className="muted small">no import running or paused</p>}
      </div>
    </section>
  );
}
