import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';
import { listSessions, listRunners } from '@/lib/sessions';
import { liveState } from '@/lib/agent-host';
import { loadScope } from '@/lib/scope';
import { prsOf } from '@/lib/pr-doc';
import { SessionList } from '@/components/SessionList';
import { QueueOverview } from '@/components/QueueOverview';
import { EmptyState } from '@/components/EmptyState';
import { EmptyAction } from '@/components/EmptyActions';
import { agentsAvailable } from '@/lib/agents-available';

// Agent sessions of the product: what has been sent to agents and how it is going.
export default async function SessionsPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) notFound();
  // the process state comes from this server process, so the first paint already shows what is up
  const [scope, list, runners, agents] = await Promise.all([loadScope(product), listSessions(p.dir), listRunners(p.dir), agentsAvailable()]);
  const found = [agents.claude && 'Claude Code', agents.codex && 'Codex'].filter(Boolean).join(' and ');
  // no session ever (not "none active"): what this page shows, and whether this machine can run an agent at all
  const empty = (
    <EmptyState icon="⚡" title="No agents have worked here yet" actions={found ? <EmptyAction act="agent" pri>New conversation</EmptyAction> : undefined} hint={found ? `${found} found on this machine · ⌘P` : undefined}>
      <p>Every agent run shows here — a conversation, a build, a librarian filing what Remember was given — with its log, what it changed and what it asked. A running agent also shows in the rail.</p>
      {!found && <p>Agents run through <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a> or <a href="https://github.com/openai/codex" target="_blank" rel="noreferrer">Codex</a>, and neither is on this machine&apos;s PATH. Documents, the graph and <code>wye check</code> work without them.</p>}
    </EmptyState>
  );
  const sessions = list.map(s => ({ ...s, transcript: undefined, ...(s.mode === 'chat' ? liveState(s.id) : {}), prs: scope ? prsOf(product, scope.graph, s.id) : [] }));
  return (
    <div className="page page-wide">
      <header className="doc-head"><h1 className="prop-in h1" style={{ margin: 0 }}>Agents</h1><p className="sub">every worker — a conversation or a run — with the plans it is on and has done: a claude or codex process that is up is active — working, or live and waiting for your next message; runners pick queued work up and stream here.</p></header>
      {!sessions.length && empty}
      <QueueOverview product={product} />
      <SessionList product={product} initial={sessions} initialRunners={runners} quiet={!sessions.length} />
    </div>
  );
}
