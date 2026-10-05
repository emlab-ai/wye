// The Quick start (docs/superpowers/specs/2026-10-05-onboarding-design.md): nine steps that tick themselves from the
// product's real state. Pure — Signals in, step states out — so it is tested without a product; lib/onboarding-io
// reads the Signals from the graph, the disk and the per-machine marks in _settings.json.
export type StepKey = 'agent' | 'document' | 'block' | 'link' | 'remember' | 'approve' | 'ask' | 'pr' | 'build';
export type StepGroup = 'setup' | 'loop';
export interface Signals { agent: boolean; documents: number; blocks: number; links: number; approved: number; prs: number; built: number; marked: string[] }
export interface StepDef { key: StepKey; group: StepGroup; title: string; why: string; shortcut?: string; done(s: Signals): boolean }
export interface StepState { key: StepKey; group: StepGroup; title: string; why: string; shortcut?: string; done: boolean }
export interface Onboarding { steps: StepState[]; done: number; total: number; next: StepKey | null; complete: boolean; dismissed: boolean; show: boolean }

export const EMPTY_SIGNALS: Signals = { agent: false, documents: 0, blocks: 0, links: 0, approved: 0, prs: 0, built: 0, marked: [] };

// Set up, then the loop (Remember → Inbox approve → Ask → Prompt Request → build), in the spec's order
export const STEPS: StepDef[] = [
  { key: 'agent', group: 'setup', title: 'Connect a coding agent', why: 'Wye runs Claude Code or Codex for the librarian, Ask and builds; documents and the graph work without one.', done: s => s.agent },
  { key: 'document', group: 'setup', title: 'Write or import a first document', why: 'A document is Markdown in your product folder, and everything else is read from it.', done: s => s.documents > 0 },
  { key: 'block', group: 'setup', title: 'Give something an id', why: 'A line like req:checkout.fast makes it a block that agents, links and checks can name.', done: s => s.blocks > 0 },
  { key: 'link', group: 'setup', title: 'Connect two blocks', why: 'Links say what refines, satisfies or depends on what, so a change shows what it touches.', done: s => s.links > 0 },
  { key: 'remember', group: 'loop', title: 'Remember a note', why: 'Paste what you learned and the librarian files it as proposed knowledge.', shortcut: '⌘M', done: s => s.marked.includes('remember') },
  { key: 'approve', group: 'loop', title: 'Approve something in the Inbox', why: 'Agents propose, a person approves; approved knowledge is what agents build from.', done: s => s.approved > 0 },
  { key: 'ask', group: 'loop', title: 'Ask a question', why: 'Ask answers from the product’s own knowledge and cites the blocks it used.', shortcut: '⌘F', done: s => s.marked.includes('ask') },
  { key: 'pr', group: 'loop', title: 'Open a Prompt Request', why: 'A Prompt Request is your suggestion to change the knowledge, refined with the librarian before anything is built.', shortcut: '⌘P', done: s => s.prs > 0 },
  { key: 'build', group: 'loop', title: 'Build it with an agent', why: 'An approved Prompt Request goes to a coding agent, and what it learns comes back for review.', done: s => s.built > 0 },
];
// the steps nothing on disk shows: only a mark (Remember sent, Ask answered) ticks them
export const MARKED: StepKey[] = ['remember', 'ask'];

export function onboardingOf(s: Signals, dismissed: boolean): Onboarding {
  const steps = STEPS.map(({ done, ...d }) => ({ ...d, done: done(s) }));
  const done = steps.filter(x => x.done).length, total = steps.length, complete = done === total;
  return { steps, done, total, next: steps.find(x => !x.done)?.key ?? null, complete, dismissed, show: !complete && !dismissed };
}
