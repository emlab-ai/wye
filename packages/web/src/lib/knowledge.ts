// The knowledge index: how nodes are grouped and named for humans.
export const KIND_LABELS: Record<string, string> = {
  goal: 'Goals', req: 'Requirements', entity: 'Entities', rule: 'Rules', constraint: 'Constraints', decision: 'Decisions', question: 'Questions', task: 'Tasks', lesson: 'Lessons', contradiction: 'Contradictions',
  op: 'Operations', page: 'Pages', action: 'Actions', state: 'State machines', value: 'Values', flag: 'Flags', gate: 'Gates',
  test: 'Tests', 'ui-test': 'UI tests', drift: 'Drift', product: 'Products', type: 'Types',
};
export const KIND_ORDER = Object.keys(KIND_LABELS);

// The line that makes one node of a kind, for a page that has none yet (the onboarding's empty states) — the README's
// own examples where it has one, else the bare shape.
const EXAMPLES: Record<string, string> = {
  goal: 'goal:app.fast Every common action should feel immediate.',
  req: 'req:account.delete When a person deletes their account, their data is removed within 30 days.',
  rule: 'rule:payments.capture Payment must be captured before an order can be completed.',
  decision: 'decision:payments.provider Use Stripe for online card processing.',
  constraint: 'constraint:tenants.isolated Never expose one tenant\'s data to another tenant.',
  entity: 'entity:order One customer\'s active purchase.',
  task: '- [ ] task:settings-page Build the settings page.',
  question: 'question:refund.window Do enterprise contracts still promise 30 days?',
  test: 'test:account.delete verifies req:account.delete.',
};
export const kindExample = (kind: string) => EXAMPLES[kind] ?? `${kind}:area.name One line that says what it is.`;
