import { describe, it, expect } from 'vitest';
import { digestSnapshot, digestContext, contextMarkdown, prependSummary, type DigestNode } from './digest';

const n = (id: string, status: string, body: string, title = id): DigestNode => ({ id, kind: id.split(':')[0], title, status, body: `id: ${id}\n${body}`, defined: true });
const before = [n('project:ea.atlas', 'active', 'pace: holding'), n('commitment:ea.ship', 'proposed', 'due: 2026-10-07\nstate: open\nproject: project:ea.atlas'), n('risk:ea.quota', 'open', 'project: project:ea.atlas'), n('block:x', '', 'text: ignored')];

describe('the digest context', () => {
  it('compares a snapshot with now: arrived, changed, closed — grouped by project or person, ids kept', () => {
    const prev = digestSnapshot(before, '2026-10-04');
    expect(Object.keys(prev.nodes)).toEqual(['project:ea.atlas', 'commitment:ea.ship', 'risk:ea.quota']);
    const now = [n('project:ea.atlas', 'active', 'pace: slowing', 'Atlas'), n('commitment:ea.ship', 'proposed', 'due: 2026-10-07\nstate: met\nproject: project:ea.atlas'), n('risk:ea.quota', 'open', 'project: project:ea.atlas\nlast-verified: 2026-10-05'),
      n('thread:ea.q', 'open', 'from: person:ea.jane\nchannel: #safety'), n('commitment:ea.late', 'proposed', 'due: 2026-10-01\nstate: open\nto: [person:ea.jane]')];
    const c = digestContext(prev, now, '2026-10-05');
    expect(c.added.map(x => x.id)).toEqual(['thread:ea.q', 'commitment:ea.late']);
    expect(c.changed.map(x => x.id)).toEqual(['project:ea.atlas']);   // last-verified alone is not a change
    expect(c.closedNow.map(x => x.id)).toEqual(['commitment:ea.ship']);
    expect(c.late.map(x => x.id)).toEqual(['commitment:ea.late']); expect(c.waiting.map(x => x.id)).toEqual(['thread:ea.q']);
    const md = contextMarkdown(c, id => (id === 'person:ea.jane' ? 'Jane Roe' : id === 'project:ea.atlas' ? 'Atlas' : id), '2026-10-05');
    expect(md).toContain('Since the last summary (2026-10-04).');
    expect(md).toContain('### Arrived (2)\n\n#### Jane Roe (person:ea.jane)\n- thread thread:ea.q — thread:ea.q (open)\n- commitment commitment:ea.late');
    expect(md).toContain('### Closed (1)\n\n#### Atlas (project:ea.atlas)\n- commitment commitment:ea.ship');
  });
  it('with no summary before, nothing is "since": only what waits now', () => {
    const c = digestContext(null, before, '2026-10-05');
    expect(c.added).toEqual([]); expect(c.dueSoon.map(x => x.id)).toEqual(['commitment:ea.ship']);
    expect(contextMarkdown(c, id => id, '2026-10-05')).toContain('No summary was written before');
  });
});

describe('writing the summary into the page', () => {
  const page = '# Digest\n\n## Needs you now\n\n<!-- view:task -->\n\n## Daily summary\n\n_Each weekday morning…_\n';
  it('the newest entry goes on top under the intro; the same day is replaced; old ones are kept up to the limit', () => {
    const one = prependSummary(page, '2026-10-05', '- Atlas slipped');
    expect(one).toBe('# Digest\n\n## Needs you now\n\n<!-- view:task -->\n\n## Daily summary\n\n_Each weekday morning…_\n\n### 2026-10-05\n\n- Atlas slipped\n');
    const two = prependSummary(one, '2026-10-06', '- Jane waits');
    expect(two.indexOf('### 2026-10-06')).toBeLessThan(two.indexOf('### 2026-10-05'));
    const again = prependSummary(two, '2026-10-06', '- Jane answered');
    expect(again).toContain('- Jane answered'); expect(again).not.toContain('- Jane waits');
    expect(prependSummary(again, '2026-10-07', 'x', 2)).not.toContain('### 2026-10-05');
  });
  it('a section after it stays after it; a page without the section gets one', () => {
    const withAfter = page.replace('_Each weekday morning…_\n', '_intro_\n\n## Notes\n\nmine\n');
    expect(prependSummary(withAfter, '2026-10-05', 'x')).toContain('### 2026-10-05\n\nx\n\n## Notes\n\nmine');
    expect(prependSummary('# Digest\n', '2026-10-05', 'x')).toBe('# Digest\n\n## Daily summary\n\n### 2026-10-05\n\nx\n');
  });
});

describe('quiet projects', () => {
  it('last activity: meetings and dated items about the project, changes to it or its items, commitments met; open ones quiet 14+ days', async () => {
    const { quietProjects } = await import('./digest');
    const nodes = [
      n('project:ea.a', 'active', ''), n('project:ea.b', 'active', ''), n('project:ea.c', 'done', ''), n('project:ea.d', 'active', ''),
      n('meeting:ea.m', '', 'date: 2026-09-01\nprojects: [project:ea.a]'), n('decision:x.d', 'proposed', 'date: 2026-10-01\nproject: project:ea.b'),
      n('commitment:ea.k', 'proposed', 'project: project:ea.d\nmet-on: 2026-09-10'), n('fact:x.f', '', 'date: 2026-12-01\nproject: project:ea.d'),
    ];
    const q = quietProjects(nodes, [{ node: 'commitment:ea.k', at: '2026-09-12T10:00:00Z' }], '2026-10-05');
    expect(q.map(x => [x.id, x.last, x.days])).toEqual([['project:ea.a', '2026-09-01', 34], ['project:ea.d', '2026-09-12', 23]]);   // b moved 4 days ago; c is done; a future date is not activity
  });
});
