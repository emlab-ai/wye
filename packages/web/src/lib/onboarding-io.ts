// The Quick start's state for one product (docs/superpowers/specs/2026-10-05-onboarding-design.md): the Signals read
// from the built graph in a pass over its nodes and edges (no file reads, no model calls — a product of thousands of
// nodes costs one walk), the agent check, and the per-machine marks in <data>/_settings.json `onboarding`.
import path from 'node:path';
import type { GraphData } from './graph';
import { HIDDEN_KINDS } from './graph';
import { PART_KINDS } from './kinds';
import { isSystemFile } from './doc';
import { prsPageId } from './pr-doc';
import { loadScope, type Scope } from './scope';
import { DATA_ROOT } from './products';
import { readSettings, writeSettings, type Settings } from './settings';
import { withFileLock } from './write';
import { agentsAvailable, type Agents } from './agents-available';
import { wyeHome, type CliStatus } from './toolchain';
import { STEPS, onboardingOf, type Onboarding, type Signals, type StepKey } from './onboarding';

// a person's document: Markdown under a project's docs/, not an app-written page in .wye/ (rule:prs-folder)
const personDoc = (file: string) => /(^|\/)projects\/[^/]+\/docs\//.test(file) && !isSystemFile(file);
const BUILT = new Set(['building', 'done']);

export interface PrPage { id: string; project: string; file: string; status: string; started: string }
// The product's Prompt Requests: the pages `part-of` a project's PRs page (prsPageId) — the same children the rail's
// PRs folder lists — with the front matter status and start, newest first. One pass over the edges.
export function prPagesOf(g: Pick<GraphData, 'nodes' | 'edges'>, projects: string[]): PrPage[] {
  const home = new Map(projects.map(p => [prsPageId(p), p]));
  const byId = new Map(g.nodes.map(n => [n.id, n])); const seen = new Set<string>(); const out: PrPage[] = [];
  for (const e of g.edges) {
    const project = e.verb === 'part-of' && !e.generated ? home.get(e.to) : undefined; if (!project || seen.has(e.from)) continue;
    const n = byId.get(e.from); if (!n || n.defined === false) continue; seen.add(n.id);
    out.push({ id: n.id, project, file: n.file, status: n.status, started: n.body.match(/^started:[ \t]*(.*)$/m)?.[1].trim() ?? '' });
  }
  return out.sort((a, b) => b.started.localeCompare(a.started) || a.id.localeCompare(b.id));
}

// documents: the person's pages; blocks: their defined nodes with an id — not a page, not a hidden kind, not a card's
// part (a decision's choice), not app-written (.wye hooks, skills); links: edges written between two blocks;
// approved: a block approved anywhere in a project (a decision approved on a PR page counts); prs / built: PR pages
export function signalsOf(scope: Pick<Scope, 'graph' | 'projects'>, agents: Agents, marked: string[]): Signals {
  const g = scope.graph; const pages = new Set(g.modules.map(m => m.id));
  const documents = g.modules.filter(m => personDoc(m.file)).length;
  const blocks = new Set<string>(); let approved = 0;
  for (const n of g.nodes) {
    if (!n.defined || pages.has(n.id) || n.kind === 'module' || HIDDEN_KINDS.has(n.kind) || PART_KINDS.has(n.kind)) continue;
    if (personDoc(n.file)) blocks.add(n.id);
    if (n.status === 'approved' && /(^|\/)projects\//.test(n.file)) approved++;
  }
  let links = 0; for (const e of g.edges) if (!e.generated && e.from !== e.to && blocks.has(e.from) && blocks.has(e.to)) links++;
  const prs = prPagesOf(g, scope.projects.map(p => p.slug));
  return { agent: agents.claude || agents.codex, documents, blocks: blocks.size, links, approved, prs: prs.length, built: prs.filter(p => BUILT.has(p.status)).length, marked };
}

const KEYS = new Set<string>(STEPS.map(s => s.key));
// what this machine has marked for the product: known step keys only, once each
export function marksOf(s: Settings, product: string): { done: StepKey[]; dismissed: boolean } {
  const o = s.onboarding?.[product];
  const done = Array.isArray(o?.done) ? [...new Set(o.done.filter(k => KEYS.has(k)))] as StepKey[] : [];
  return { done, dismissed: o?.dismissed === true };
}

// the `wye` command's install (bin/wye-home.js): null when it cannot be read, so the page says "unknown", not "missing"
const wyeStatus = (): CliStatus | null => { try { return wyeHome().cliStatus(); } catch { return null; } };

export async function readOnboarding(product: string): Promise<(Onboarding & { agents: Agents; wye: CliStatus | null }) | null> {
  const scope = await loadScope(product); if (!scope) return null;
  const [agents, settings] = await Promise.all([agentsAvailable(), readSettings()]);
  const m = marksOf(settings, scope.product.slug);
  return { ...onboardingOf(signalsOf(scope, agents, m.done), m.dismissed), agents, wye: wyeStatus() };
}

// read-modify-write under the settings file's lock, so a Remember and an Ask marked at once both land
const settingsLock = (root: string) => path.join(root, '_settings.json');
export async function markStep(product: string, key: StepKey, root: string = DATA_ROOT): Promise<void> {
  // a mark is a convenience: it never fails the request that earned it (caught inside the lock — withFileLock's own
  // `finally` chain would report a rejection as unhandled)
  await withFileLock(settingsLock(root), async () => {
    try {
      const m = marksOf(await readSettings(root), product); if (m.done.includes(key)) return;
      await writeSettings({ onboarding: { [product]: { done: [...m.done, key] } } }, root);
    } catch { /* not written */ }
  });
}
export async function setDismissed(product: string, dismissed: boolean, root: string = DATA_ROOT): Promise<void> {
  await withFileLock(settingsLock(root), () => writeSettings({ onboarding: { [product]: { dismissed } } }, root));
}
