import { describe, it, expect } from 'vitest';
import { reconcileVerdicts } from './verdict-reconcile';

const vl = (key: string, kind: string, a: string, b: string) => `verdict:${key} ${kind} ${a} — why (kind: ${kind}, model: m, prompt: p, pair: ${a} ${b})`;
const cl = (key: string, a: string, b: string, tag = '#open') => `contradiction:p.${key} ${b} contradicts ${a} — why ${tag} (between: ${b} ${a}, conflict: dynamic)`;
const lines = (v: { key: string; kind: string; a: string; b: string }) => [vl(v.key, v.kind, v.a, v.b), ...(v.kind === 'contradicts' ? [cl(v.key, v.a, v.b)] : [])];

describe('reconcileVerdicts', () => {
  const old = ['Some prose of the node.', vl('k1', 'contradicts', 'req:a', 'decision:b'), cl('k1', 'req:a', 'decision:b'), vl('k9', 'refines', 'req:z', 'decision:b')].join('\n\n');

  it('a new judgement of a pair replaces its old verdict line, and closes the open contradiction when the conflict is gone', () => {
    const r = reconcileVerdicts(old, [{ key: 'k2', kind: 'refines', a: 'req:a', b: 'decision:b' }], lines);
    expect(r.content).not.toContain('verdict:k1');
    expect(r.content).toContain('verdict:k2 refines req:a');
    expect(r.content).toContain('contradiction:p.k1');
    expect(r.content).not.toContain('#open');
    expect(r.content).toMatch(/contradiction:p\.k1 .*#resolved .*now refines/);
    expect(r.content).toContain('verdict:k9');                  // another pair is left alone
    expect(r.content.startsWith('Some prose of the node.')).toBe(true);
    expect(r.changed).toBe(true);
  });
  it('a consistent re-judgement writes no verdict but still closes the contradiction', () => {
    const r = reconcileVerdicts(old, [{ key: 'k3', kind: 'consistent', a: 'req:a', b: 'decision:b' }], lines);
    expect(r.content).not.toContain('verdict:k1'); expect(r.content).not.toContain('verdict:k3');
    expect(r.content).toMatch(/#resolved .*now consistent/);
  });
  it('a pair still in conflict gets the new contradiction in place of the old open one', () => {
    const r = reconcileVerdicts(old, [{ key: 'k4', kind: 'contradicts', a: 'req:a', b: 'decision:b' }], lines);
    expect(r.content).not.toContain('p.k1'); expect(r.content).toContain('contradiction:p.k4');
    expect((r.content.match(/#open/g) ?? []).length).toBe(1);
  });
  it('a contradiction the person already settled is kept as they left it', () => {
    const settled = old.replace('#open', '#dismissed');
    const r = reconcileVerdicts(settled, [{ key: 'k4', kind: 'contradicts', a: 'req:a', b: 'decision:b' }], lines);
    expect(r.content).toContain('contradiction:p.k1'); expect(r.content).toContain('#dismissed');
  });
  it('the same verdict again changes nothing', () => {
    const r = reconcileVerdicts(old, [{ key: 'k1', kind: 'contradicts', a: 'req:a', b: 'decision:b' }], lines);
    expect(r.changed).toBe(false); expect(r.content).toBe(old);
  });
});
