// Raw input in the inbox (decision:waterfall.raw-input-stays-raw, decision:waterfall.raw-request-to-inbox-then-digest):
// the person's words from `wye remember`, their impact on what is known judged on arrival, and the digest — a Remember
// conversation told that the input is a request, not knowledge. Shared by the inbox routes (arrival, Digest again).
import { REPO_ROOT, type Product } from './products';
import { digestInboxItem, impactInboxItem, type InboxImpact } from './inbox';
import { rawInputJudge } from './impact-run';
import { loadScope } from './scope';
import { createSession } from './sessions';
import { startChat } from './agent-host';
import { agentSettings, readSettings } from './settings';
import { markStep } from './onboarding-io';

export async function judgeRawImpact(productDir: string, product: string, name: string): Promise<InboxImpact | null> {
  try { const scope = await loadScope(product); if (!scope) return null; return await impactInboxItem(productDir, scope.graph, name, { judge: await rawInputJudge(productDir) }); }
  catch (e) { console.warn('inbox: impact failed —', e instanceof Error ? e.message : e); return null; }
}

// the digest's brief: raw input is a request or a remark, not a statement of what the product does — the librarian files
// what it states that is new, supersedes what it changes, raises what it contradicts, and never restates it as blocks
export function rawBrief(name: string, from: string | undefined, text: string, impact: InboxImpact | null): string {
  const lines = impact?.candidates.length ? impact.candidates.map(c => `- ${c.id} — ${c.verdict}: ${c.question ?? c.reason}`) : [impact ? '- nothing judged as affected among the closest knowledge' : '- not judged'];
  return `Raw input${from ? ` from ${from}` : ''}, kept in the inbox as ${name}. It is a request or a remark in the person's own words — not a statement of what the product does, so do not restate it as req: blocks or as a decision the person did not make. File only what it states that is new (a fact, a decision the person made, a constraint they set), refine or supersede what it changes, raise what it contradicts as an open question, and leave the rest. Impact judged on arrival against what is known:\n${lines.join('\n')}\n\nThe input:\n\n${text}`;
}

// a Remember conversation as the command box starts one — a librarian on the harness Settings › Agents names, in the Wye folder
export async function digestRaw(p: Product, product: string, name: string, impact: InboxImpact | null, wfUrl: string): Promise<{ session: string | null; error?: string }> {
  return digestInboxItem(p.dir, name, async o => {
    const s = await createSession(p.dir, product, { agent: agentSettings(await readSettings()).librarian, instruction: rawBrief(name, o.source.from, o.instruction, impact), refs: o.refs.slice(0, 50), source: o.source, mode: 'chat', cwd: REPO_ROOT, role: 'librarian', skills: ['skill:remember'], hooks: [] });
    void markStep(p.slug, 'remember');
    const started = await startChat(p.dir, product, s.id, { wfUrl });
    return { id: (started ?? s).id };
  });
}
