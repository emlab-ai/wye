import { agentsAvailable, type Agents } from '@/lib/agents-available';
import { AddProduct } from './AddProduct';

// The first screen (/ with no products): what Wye is, in the loop it runs, whether a coding agent is on this machine,
// and the ways to add a first product — from the code first. No rail: there is no product to show one for.
const LOOP = [
  { name: 'Define', text: <>What the product must do, in Markdown. A line that starts with an id, like <code>req:search.fast</code>, becomes a block in the graph.</> },
  { name: 'Request', text: 'A Prompt Request asks for a change. An agent builds it with the definition as context.' },
  { name: 'Remember', text: 'What agents learn comes back as proposals. A person approves them in the Inbox.' },
];

export async function Welcome(p: { agents?: Agents }) {
  const agents = p.agents ?? await agentsAvailable();
  const found = [agents.claude && 'Claude Code', agents.codex && 'Codex'].filter(Boolean).join(' and ');
  return (
    <main className="welcome">
      <header className="welcome-head">
        <span className="welcome-mark" aria-hidden>Y</span>
        <h1>Wye</h1>
        <p className="welcome-tag">Product definition and long-term memory for coding agents.</p>
      </header>
      <ol className="welcome-loop">
        {LOOP.map((s, i) => <li key={s.name}><span className="welcome-step">{i + 1}</span><b>{s.name}</b><p>{s.text}</p></li>)}
      </ol>
      {found
        ? <p className="welcome-agent"><i className="ok" aria-hidden />{found} found</p>
        : <div className="welcome-agent off">
            <p><i aria-hidden /><b>No coding agent found.</b> Wye runs its agents through <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Claude Code</a> or <a href="https://github.com/openai/codex" target="_blank" rel="noreferrer">Codex</a>.</p>
            <p>Without one, documents, the graph and <code>wye check</code> work. The librarian, builds, Ask&apos;s answers, Remember and contradiction checks wait until one is installed.</p>
          </div>}
      <section className="welcome-add">
        <h2>Add your first product</h2>
        <AddProduct start="code" cancel={false} />
      </section>
    </main>
  );
}
