import { describe, it, expect } from 'vitest';
import { instantiate, slugify } from './templates';

describe('templates', () => {
  it('slugifies titles', () => { expect(slugify('Plan: Phase 1 (core + server)')).toBe('plan-phase-1-core-server'); expect(slugify('!!!')).toBe('doc'); });
  it('fills every placeholder', () => {
    const out = instantiate('---\nnode: {{kind}}:{{slug}}\ntitle: {{title}}\npart-of: {{parent}}\nlast-verified: {{date}}\n---\n# {{title}}', { title: 'My PRD', slug: 'my-prd', parent: 'module:wf2', date: '2026-09-14' });
    expect(out).toBe('---\nnode: module:my-prd\ntitle: My PRD\npart-of: module:wf2\nlast-verified: 2026-09-14\n---\n# My PRD');
  });
  // the page as a typed node (req:wf2.page.create-typed): the kind is the type, the required properties come as empty keys
  it('a typed page: kind on the node line, the type\'s required properties as empty keys after the bookkeeping', () => {
    const out = instantiate('---\nnode: {{kind}}:{{slug}}\ntitle: {{title}}\nlast-verified: {{date}}\n---\n# {{title}}', { title: 'Platform', slug: 'platform', parent: 'team:org', date: '2026-09-18', kind: 'team', props: ['lead', 'members'] });
    expect(out).toBe('---\nnode: team:platform\ntitle: Platform\nlast-verified: 2026-09-18\nlead:\nmembers:\n---\n# Platform');
  });
});
