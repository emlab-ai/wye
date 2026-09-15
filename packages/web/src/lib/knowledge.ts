// The knowledge index: how nodes are grouped and named for humans.
export const KIND_LABELS: Record<string, string> = {
  req: 'Requirements', entity: 'Entities', rule: 'Rules', decision: 'Decisions', question: 'Questions', task: 'Tasks',
  op: 'Operations', page: 'Pages', action: 'Actions', state: 'State machines', value: 'Values', flag: 'Flags', gate: 'Gates',
  test: 'Tests', 'ui-test': 'UI tests', drift: 'Drift', product: 'Products',
};
export const KIND_ORDER = Object.keys(KIND_LABELS);
