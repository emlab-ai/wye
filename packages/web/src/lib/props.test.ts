import { describe, it, expect } from 'vitest';
import { parseExtra, withExtra } from './props';

describe('extra props', () => {
  it('parses and rewrites the trailing property group', () => {
    expect(parseExtra('owner: alex, target: 2026-10')).toEqual({ owner: 'alex', target: '2026-10' });
    expect(withExtra('owner: alex, target: 2026-10', 'progress', '40')).toBe('owner: alex, target: 2026-10, progress: 40');
    expect(withExtra('owner: alex, target: 2026-10', 'owner', '')).toBe('target: 2026-10');
    expect(withExtra('', 'owner', 'bo')).toBe('owner: bo');
    // property names of a product's own types may be camelCase (startDate), like lib/parse.js reads them
    expect(parseExtra('foundIn: 1.2, severity: high')).toEqual({ foundIn: '1.2', severity: 'high' });
    expect(withExtra('foundIn: 1.2', 'reportedBy', 'person:ana')).toBe('foundIn: 1.2, reportedBy: person:ana');
  });
});
