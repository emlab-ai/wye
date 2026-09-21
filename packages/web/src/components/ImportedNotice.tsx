'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// The bar an imported document shows while no agent has read it (req:wf2.import.analyse): `imported` waits for the
// hook, `raw` declined it; Analyse runs hook:import-analyse on the page's node now — one session with the Import
// skill, its blocks proposed.
export function ImportedNotice({ product, project, slug, node, status, source }: { product: string; project: string; slug: string; node: string; status: string; source?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function analyse() {
    setBusy(true); setMsg(null);
    // a page imported "as is" is raw: it becomes imported first, so the hook's `where: status=imported` holds
    if (status === 'raw') { const s = await fetch(`/api/${product}/${project}/doc/${slug}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'frontmatter', patch: { status: 'imported' } }) }); if (!s.ok) { setBusy(false); setMsg('could not mark the page imported'); return; } }
    const r = await fetch(`/api/${product}/hooks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hook: 'hook:import-analyse', node }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.message ?? j.error); return; }
    const session = j.firings?.flatMap((f: { actions?: { session?: string }[] }) => f.actions ?? []).find((a: { session?: string }) => a.session)?.session;
    setMsg(session ? `an agent is on it — session ${String(session).slice(0, 6)}` : 'the hook ran; see the Hooks page');
    router.refresh();
  }
  return (
    <div className="imported-notice">
      <span>{status === 'raw' ? 'Imported as is' : 'Imported'}{source ? ` from ${source.replace(/^import\//, '')}` : ''} — no agent has read it yet.</span>
      <button className="pri" disabled={busy} onClick={analyse}>{busy ? 'Starting…' : 'Analyse with agent'}</button>
      {msg && <span className="muted">{msg}</span>}
    </div>
  );
}
