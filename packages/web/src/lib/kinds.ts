// Per-kind skeletons for new cards, from the required/recommended keys in schema/kinds.yaml.
export const CARD_KINDS = ['goal', 'task', 'req', 'rule', 'entity', 'value', 'state', 'op', 'page', 'gate', 'flag', 'decision', 'question', 'test'] as const;
export type CardKind = typeof CARD_KINDS[number];

export const SKELETONS: Record<CardKind, string[]> = {
  goal: ['title: ', 'status: proposed'],
  task: ['title: ', 'status: open', 'part-of: '],
  req: ['title: ', 'when: ', 'then: ', 'status: proposed', 'satisfied-by: []', 'requires-tests: []'],
  rule: ['statement: ', 'source: ', 'status: proposed', 'requires-tests: []'],
  entity: ['description: ', 'source: ', 'fields:', '  name: string'],
  value: ['source: ', 'values: [a, b]'],
  state: ['owner: entity:', 'states: [a, b]', 'transitions:', '  - a -> b : trigger'],
  op: ['args: ', 'does: ', 'gate: ', 'source: '],
  page: ['route: ', 'component: ', 'actions:', '  - action:slug: what it does'],
  gate: ['statement: ', 'applies-to: []'],
  flag: ['scope: ', 'source: '],
  decision: ['date: ', 'status: proposed', 'context: ', 'options:', '  - ', 'choice: ', 'consequences: ', 'governs: []'],
  question: ['q: '],
  test: ['file: ', 'description: ', 'cases:', '  - case-name: what it asserts', 'count: 1'],
};

export function skeleton(kind: CardKind, slug: string, date = new Date().toISOString().slice(0, 10)): string {
  return [`id: ${kind}:${slug}`, ...SKELETONS[kind].map(l => l === 'date: ' ? `date: ${date}` : l)].join('\n');
}
// The parts of a requirement or a decision (decision:wf2.req-free-text, decision:wf2.decision-free-text): child blocks
// with a text and nothing else — no status, no properties, no details.
export const PART_KINDS = new Set(['when', 'then', 'unless', 'context', 'choice', 'alternative', 'consequence', 'statement', 'scope', 'rationale', 'note']);
