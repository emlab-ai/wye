import { describe, it, expect } from 'vitest';
import { openTarget } from './open-target';

describe('openTarget', () => {
  it('a product/project/doc ref becomes the document path', () => {
    expect(openTarget('wye', 'wye/v2/bugs')).toBe('/wye/v2/d/bugs');
  });
  it('a project/doc ref takes the product from the session', () => {
    expect(openTarget('wye', 'v2/bugs')).toBe('/wye/v2/d/bugs');
  });
  it('a #node suffix becomes the node anchor', () => {
    expect(openTarget('wye', 'wye/v2/bugs#bug:new-396')).toBe('/wye/v2/d/bugs#n-bug%3Anew-396');
  });
  it('an app URL keeps its path and hash', () => {
    expect(openTarget('wye', 'http://localhost:3456/wye/v2/d/bugs#n-bug%3Anew-396')).toBe('/wye/v2/d/bugs#n-bug%3Anew-396');
    expect(openTarget('wye', 'http://localhost:3456/wye/types/page')).toBe('/wye/types/page');
  });
  it('anything else is refused', () => {
    expect(openTarget('wye', 'bugs')).toBe('');
    expect(openTarget('wye', 'https://example.com/x')).toBe('/x');
    expect(openTarget('wye', '')).toBe('');
  });
});
