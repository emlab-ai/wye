// The knowledge index: how nodes are grouped and named for humans.
export const KIND_LABELS: Record<string, string> = {
  goal: 'Goals', req: 'Requirements', entity: 'Entities', rule: 'Rules', constraint: 'Constraints', decision: 'Decisions', question: 'Questions', task: 'Tasks', lesson: 'Lessons', contradiction: 'Contradictions',
  op: 'Operations', page: 'Pages', action: 'Actions', state: 'State machines', value: 'Values', flag: 'Flags', gate: 'Gates',
  test: 'Tests', 'ui-test': 'UI tests', drift: 'Drift', product: 'Products', type: 'Types',
};
export const KIND_ORDER = Object.keys(KIND_LABELS);
