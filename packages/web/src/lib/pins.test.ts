import { describe, it, expect } from 'vitest';
import { parsePins, formatPins, togglePin, resolvePins } from './pins';

describe('pins', () => {
  it('reads and writes the product file\'s list', () => {
    expect(parsePins('[v2/prd, cr/~pr-3]')).toEqual(['v2/prd', 'cr/~pr-3']);
    expect(parsePins(undefined)).toEqual([]); expect(parsePins('[]')).toEqual([]);
    expect(formatPins(['v2/prd', 'cr/~pr-3'])).toBe('[v2/prd, cr/~pr-3]');
  });
  it('pins at the end, once; unpins', () => {
    expect(togglePin(['a/x'], 'b/y', true)).toEqual(['a/x', 'b/y']);
    expect(togglePin(['a/x', 'b/y'], 'a/x', true)).toEqual(['a/x', 'b/y']);
    expect(togglePin(['a/x', 'b/y'], 'a/x', false)).toEqual(['b/y']);
  });
  it('shows the pinned documents that still exist, in pin order, with their title', () => {
    const docs = [{ project: 'v2', slug: 'prd', title: 'PRD', icon: '📄' }, { project: 'cr', slug: '~pr-3', title: '#3 Assistant', icon: '🗺' }];
    expect(resolvePins(['cr/~pr-3', 'v2/gone', 'v2/prd'], docs)).toEqual([
      { ref: 'cr/~pr-3', project: 'cr', slug: '~pr-3', title: '#3 Assistant', icon: '🗺' },
      { ref: 'v2/prd', project: 'v2', slug: 'prd', title: 'PRD', icon: '📄' },
    ]);
  });
});
