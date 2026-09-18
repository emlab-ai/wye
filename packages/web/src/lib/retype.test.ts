import { describe, it, expect } from 'vitest';
import { rewriteId, retypeFrontmatter } from './retype';

describe('rewriteId', () => {
  it('rewrites every whole-id occurrence: frontmatter keys, yaml values, prose ids, embeds, links', () => {
    const md = [
      '---', 'node: module:x', 'part-of: module:platform', '---', '# X',
      'See module:platform and [the team](module:platform) or ![[module:platform]].',
      '```yaml', '- id: req:a', '  part-of: [module:platform, module:other]', '```',
      'req:b Something part of module:platform. #proposed',
    ].join('\n');
    const r = rewriteId(md, 'module:platform', 'team:platform');
    expect(r.count).toBe(6);
    expect(r.md).toBe([
      '---', 'node: module:x', 'part-of: team:platform', '---', '# X',
      'See team:platform and [the team](team:platform) or ![[team:platform]].',
      '```yaml', '- id: req:a', '  part-of: [team:platform, module:other]', '```',
      'req:b Something part of team:platform. #proposed',
    ].join('\n'));
  });
  it('a longer id that starts with the old one is left alone', () => {
    const r = rewriteId('module:platform-ops and module:platform.x and module:platform', 'module:platform', 'team:platform');
    expect(r.count).toBe(1);
    expect(r.md).toBe('module:platform-ops and module:platform.x and team:platform');
  });
  it('nothing to do → count 0, text unchanged', () => {
    expect(rewriteId('no ids here', 'module:a', 'team:a')).toEqual({ md: 'no ids here', count: 0 });
  });
});

describe('retypeFrontmatter', () => {
  it('the node line takes the new kind, the rest stays; the old type: line goes', () => {
    const md = '---\nnode: module:platform\ntype: module\ntitle: Platform\nstatus: active\n---\n\n# Platform\n';
    expect(retypeFrontmatter(md, 'team')).toEqual({ md: '---\nnode: team:platform\ntitle: Platform\nstatus: active\n---\n\n# Platform\n', from: 'module:platform', to: 'team:platform' });
  });
  it('no frontmatter or no node line → null', () => {
    expect(retypeFrontmatter('# nope', 'team')).toBeNull();
    expect(retypeFrontmatter('---\ntitle: x\n---\n', 'team')).toBeNull();
  });
});
