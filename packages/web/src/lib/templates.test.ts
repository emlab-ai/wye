import { describe, it, expect } from 'vitest';
import { instantiate, slugify } from './templates';

describe('templates', () => {
  it('slugifies titles', () => { expect(slugify('Plan: Phase 1 (core + server)')).toBe('plan-phase-1-core-server'); expect(slugify('!!!')).toBe('doc'); });
  it('fills every placeholder', () => {
    const out = instantiate('---\nnode: module:{{slug}}\ntitle: {{title}}\npart-of: module:{{parent}}\nlast-verified: {{date}}\n---\n# {{title}}', { title: 'My PRD', slug: 'my-prd', parent: 'wf2', date: '2026-09-14' });
    expect(out).toBe('---\nnode: module:my-prd\ntitle: My PRD\npart-of: module:wf2\nlast-verified: 2026-09-14\n---\n# My PRD');
  });
});
