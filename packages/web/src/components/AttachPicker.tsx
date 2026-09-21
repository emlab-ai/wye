'use client';
import { useEffect, useState } from 'react';

// Skills and hooks to attach to a request (decision:wf2.hooks-and-skills): the product's skills (their bodies ride in
// the librarian's and the builder's first message) and its hooks (they fire on the request's events, paused or not),
// as chips to toggle. Used by ⌘P in PR mode and by the PR's head.
export type Attach = { skills: string[]; hooks: string[] };
export function AttachPicker({ product, value, onChange, compact }: { product: string; value: Attach; onChange: (v: Attach) => void; compact?: boolean }) {
  const [skills, setSkills] = useState<{ id: string; title: string; role: string }[]>([]);
  const [hooks, setHooks] = useState<{ id: string; title: string; on: string; status: string }[]>([]);
  const [open, setOpen] = useState(!compact);
  useEffect(() => {
    let live = true;
    fetch(`/api/${product}/skills`).then(r => r.ok ? r.json() : { skills: [] }).then(j => { if (live) setSkills(j.skills ?? []); }).catch(() => {});
    fetch(`/api/${product}/hooks`).then(r => r.ok ? r.json() : { hooks: [] }).then(j => { if (live) setHooks((j.hooks ?? []).filter((h: { on: string }) => /^(pr|\*)\./.test(h.on))); }).catch(() => {});
    return () => { live = false; };
  }, [product]);
  const toggle = (k: keyof Attach, id: string) => onChange({ ...value, [k]: value[k].includes(id) ? value[k].filter(x => x !== id) : [...value[k], id] });
  if (!skills.length && !hooks.length) return null;
  const n = value.skills.length + value.hooks.length;
  return (
    <div className="attach">
      {compact && <button className="linkish small" onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'} attached <span className="muted">{n ? `${value.skills.length} skill${value.skills.length === 1 ? '' : 's'}${value.hooks.length ? `, ${value.hooks.length} hook${value.hooks.length === 1 ? '' : 's'}` : ''}` : 'none'}</span></button>}
      {open && <div className="attach-rows">
        {skills.length > 0 && <div className="attach-row"><span className="muted">skills</span>{skills.map(s => <button key={s.id} type="button" className={`chip ${value.skills.includes(s.id) ? 'on' : ''}`} title={`${s.id} · ${s.role}`} onClick={() => toggle('skills', s.id)}>✦ {s.title}</button>)}</div>}
        {hooks.length > 0 && <div className="attach-row"><span className="muted">hooks</span>{hooks.map(h => <button key={h.id} type="button" className={`chip ${value.hooks.includes(h.id) ? 'on' : ''}`} title={`${h.id} · on ${h.on}${h.status === 'paused' ? ' · paused — fires on this request anyway' : ''}`} onClick={() => toggle('hooks', h.id)}>⚓ {h.title}</button>)}</div>}
      </div>}
    </div>
  );
}
