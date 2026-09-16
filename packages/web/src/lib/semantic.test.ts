import { describe, it, expect } from 'vitest';
import { keywords, nodeText } from './semantic';

describe('keywords', () => {
  it('drops stop words and short tokens, keeps ids and code names', () => {
    expect(keywords('The outbox accepts only operational kinds (orderUpsert) for entity:offline.outbox')).toEqual(['outbox', 'accepts', 'only', 'operational', 'kinds', 'orderupsert', 'entity:offline.outbox']);
  });
});
describe('nodeText', () => {
  it('joins the title with prose fields and strips markdown', () => {
    const n = { id: 'rule:x', kind: 'rule', title: 'Always on', status: '', section: '', subsection: '', body: 'id: rule:x\nstatement: The [engine](entity:e) **never** uploads.\nsource: f.ts', defined: true, file: '', line: 0 };
    expect(nodeText(n)).toBe('Always on. The engine never uploads.');
  });
});
