import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const { withSection } = createRequire(import.meta.url)(path.resolve(__dirname, '../../../../lib/sections.js')) as { withSection: (md: string, heading: string, body: string) => string };
const OLD_PR = '# R\n\n## Request\n\n> do it\n\n## Context\n\nc\n\n## Analysis\n\na\n\n## Tasks\n\n- [ ] task:t\n\n## Result\n';

describe('withSection', () => {
  it('replaces the body of a section that is there', () => {
    expect(withSection(OLD_PR, 'Analysis', 'new')).toContain('## Analysis\n\nnew\n\n## Tasks');
  });
  it('puts a missing request-page section where it belongs, not at the end', () => {
    const md = withSection(OLD_PR, 'Summary', 'What gets built');
    expect(md).toContain('> do it\n\n## Summary\n\nWhat gets built\n\n## Context');
    expect(md.trimEnd().endsWith('## Result')).toBe(true);
  });
  it('a section the order does not know goes at the end', () => {
    expect(withSection(OLD_PR, 'Notes', 'n').trimEnd().endsWith('## Notes\n\nn')).toBe(true);
  });
  it('a body that repeats its own heading is not doubled', () => {
    expect(withSection(OLD_PR, 'Analysis', '## Analysis\n\nnew')).not.toMatch(/## Analysis\n\n## Analysis/);
  });
});
