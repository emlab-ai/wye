import { describe, it, expect } from 'vitest';
import { openTarget } from './open-target';

describe('openTarget', () => {
  it('a product/project/doc ref becomes the document path', () => {
    expect(openTarget('waterfall', 'waterfall/v2/bugs')).toBe('/waterfall/v2/d/bugs');
  });
  it('a project/doc ref takes the product from the session', () => {
    expect(openTarget('waterfall', 'v2/bugs')).toBe('/waterfall/v2/d/bugs');
  });
  it('a #node suffix becomes the node anchor', () => {
    expect(openTarget('waterfall', 'waterfall/v2/bugs#bug:new-396')).toBe('/waterfall/v2/d/bugs#n-bug%3Anew-396');
  });
  it('an app URL keeps its path and hash', () => {
    expect(openTarget('waterfall', 'http://localhost:3456/waterfall/v2/d/bugs#n-bug%3Anew-396')).toBe('/waterfall/v2/d/bugs#n-bug%3Anew-396');
    expect(openTarget('waterfall', 'http://localhost:3456/waterfall/types/page')).toBe('/waterfall/types/page');
  });
  it('anything else is refused', () => {
    expect(openTarget('waterfall', 'bugs')).toBe('');
    expect(openTarget('waterfall', 'https://example.com/x')).toBe('/x');
    expect(openTarget('waterfall', '')).toBe('');
  });
});
