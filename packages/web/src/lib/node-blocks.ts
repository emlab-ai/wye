// The pre-defined blocks a node's content can carry, by kind (decision:wf2.column-is-content): what the column used
// to render as fixed sections — a goal's Requirements and Tasks, a question's answer, a decision's parts — are
// blocks in the node's content markdown now: deletable, movable, re-addable. `suggest` says which are missing so
// the column can offer them; nothing is written until the person clicks.
export type NodeBlock = { key: string; label: string; markdown: (id: string) => string; present: (content: string, id: string) => boolean };

const view = (kind: string, id: string) => `<!-- view:${kind} part-of=${id} -->`;
const hasView = (kind: string) => (content: string, id: string) => new RegExp(`<!--\\s*view:${kind}\\b[^>]*part-of=${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|-->)`).test(content);
const hasHeading = (h: string) => (content: string) => new RegExp(`^#{2,4}\\s+${h}\\s*$`, 'm').test(content);
const hasChild = (kind: string) => (content: string, id: string) => new RegExp(`(^|\\n)\\s*-?\\s*${kind}:${id.slice(id.indexOf(':') + 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(content);

const GOAL: NodeBlock[] = [
  { key: 'reqs', label: 'Requirements', markdown: id => `## Requirements\n\n${view('req', id)}`, present: hasView('req') },
  { key: 'tasks', label: 'Tasks', markdown: id => `## Tasks\n\n${view('task', id)}`, present: hasView('task') },
  { key: 'subgoals', label: 'Sub-goals', markdown: id => `## Sub-goals\n\n${view('goal', id)}`, present: hasView('goal') },
];
const REQ: NodeBlock[] = [
  { key: 'when', label: 'When', markdown: id => `- when:${slugOf(id)} `, present: hasChild('when') },
  { key: 'then', label: 'Then', markdown: id => `- then:${slugOf(id)} `, present: hasChild('then') },
  { key: 'unless', label: 'Unless', markdown: id => `- unless:${slugOf(id)} `, present: hasChild('unless') },
  { key: 'tests', label: 'Tests', markdown: id => `## Tests\n\n${view('test', id)}`, present: hasView('test') },
];
const DECISION: NodeBlock[] = [
  { key: 'context', label: 'Context', markdown: id => `- context:${slugOf(id)} `, present: hasChild('context') },
  { key: 'alternative', label: 'Alternative', markdown: id => `- alternative:${slugOf(id)} `, present: () => false },
  { key: 'choice', label: 'Choice', markdown: id => `- choice:${slugOf(id)} `, present: hasChild('choice') },
  { key: 'consequence', label: 'Consequence', markdown: id => `- consequence:${slugOf(id)} `, present: hasChild('consequence') },
];
const QUESTION: NodeBlock[] = [
  { key: 'answer', label: 'Answer', markdown: () => `## Answer\n\n`, present: hasHeading('Answer') },
];
const TASK: NodeBlock[] = [
  { key: 'subtasks', label: 'Sub-tasks', markdown: id => `## Sub-tasks\n\n${view('task', id)}`, present: hasView('task') },
];
const MODULE: NodeBlock[] = [
  { key: 'reqs', label: 'Requirements', markdown: id => `## Requirements\n\n${view('req', id)}`, present: hasView('req') },
  { key: 'decisions', label: 'Decisions', markdown: id => `## Decisions\n\n${view('decision', id)}`, present: hasView('decision') },
  { key: 'tasks', label: 'Tasks', markdown: id => `## Tasks\n\n${view('task', id)}`, present: hasView('task') },
];
const BY_KIND: Record<string, NodeBlock[]> = { goal: GOAL, req: REQ, decision: DECISION, question: QUESTION, task: TASK, module: MODULE, pr: [] };

export const slugOf = (id: string) => id.slice(id.indexOf(':') + 1);
export function blocksFor(kind: string): NodeBlock[] { return BY_KIND[kind] ?? []; }
// the pre-defined blocks the node's content does not have yet
export function suggest(kind: string, id: string, content: string): NodeBlock[] { return blocksFor(kind).filter(b => !b.present(content, id)); }
