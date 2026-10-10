import { describe, it, expect } from 'vitest';
import { planOf, sidesOf } from './contradiction';
import { indexGraph, type GraphData, type GraphNode } from './graph';

const node = (id: string, body = '', o: Partial<GraphNode> = {}): GraphNode =>
  ({ id, kind: id.split(':')[0], title: o.title ?? id.split(':')[1], status: o.status ?? 'approved', section: '', subsection: '', body, defined: true, file: 'f.md', line: 1, ...o });

const g = {
  nodes: [
    node('req:cc.phone-only', 'text: CoffeeClub runs on phones only', { title: 'Phones only' }),
    node('rule:root.tablet-support', 'statement: the iOS build declares iPad support', { title: 'iPad support' }),
    node('decision:cc.no-tablets', 'text: we do not design for tablets', { title: 'No tablets' }),
    node('decision:cc.universal-build', 'text: one universal iOS build', { title: 'Universal build' }),
    node('decision:cc.ios-first', 'text: iOS first', { title: 'iOS first' }),
    node('contradiction:cc.abc123', 'text: req:cc.phone-only contradicts rule:root.tablet-support — A excludes tablets, B declares iPad support\nbetween: [req:cc.phone-only, rule:root.tablet-support]\nconflict: static', { status: 'open', title: 'req:cc.phone-only contradicts rule:root.tablet-support' }),
  ],
  edges: [
    { from: 'decision:cc.no-tablets', verb: 'affects', to: 'req:cc.phone-only' },
    { from: 'rule:root.tablet-support', verb: 'governed-by', to: 'decision:cc.universal-build' },
    { from: 'decision:cc.ios-first', verb: 'affects', to: 'req:cc.phone-only' },
    { from: 'decision:cc.ios-first', verb: 'affects', to: 'rule:root.tablet-support' },
    { from: 'decision:cc.ios-first', verb: 'mentions', to: 'contradiction:cc.abc123' },
  ],
} as unknown as GraphData;
const idx = indexGraph(g);
const c = idx.byId.get('contradiction:cc.abc123')!;

describe('the two sides of a contradiction and the decisions behind them', () => {
  it('reads between:, names each side, and tells a decision behind one side from one behind both', () => {
    const s = sidesOf(idx, c)!;
    expect([s.a.id, s.b.id]).toEqual(['req:cc.phone-only', 'rule:root.tablet-support']);
    expect(s.a.title).toBe('Phones only');
    expect(s.decisions.map(d => `${d.id}:${d.side}`).sort()).toEqual(['decision:cc.ios-first:both', 'decision:cc.no-tablets:a', 'decision:cc.universal-build:b']);
  });
  it('falls back to the ids the text names when between: is missing', () => {
    const s = sidesOf(idx, { id: 'contradiction:x', body: 'text: req:cc.phone-only contradicts rule:root.tablet-support — reason', title: '' })!;
    expect([s.a.id, s.b.id]).toEqual(['req:cc.phone-only', 'rule:root.tablet-support']);
    expect(sidesOf(idx, { id: 'contradiction:y', body: 'text: nothing here', title: '' })).toBeNull();
  });
});

describe('what resolving writes', () => {
  const s = sidesOf(idx, c)!;
  it('keeping A supersedes B and the decisions that stood only behind B', () => {
    const p = planOf('cc', c, s, { keep: 'a', why: 'the app is a phone app; the universal build was a default nobody chose' });
    expect(p.decision.slug).toBe('cc.resolve-abc123');
    expect(p.decision.title).toBe('Phones only holds; iPad support is superseded');
    expect(p.supersede).toEqual(['rule:root.tablet-support', 'decision:cc.universal-build']);
    expect(p.decision.props.supersedes).toBe('[rule:root.tablet-support, decision:cc.universal-build]');
    expect(p.decision.props.affects).toBe('[req:cc.phone-only, rule:root.tablet-support]');
    expect(p.decision.props.resolves).toBe('contradiction:cc.abc123');
    expect(p.decision.props.status).toBe('approved');
    expect(p.resolution).toBe('req:cc.phone-only holds — decision:cc.resolve-abc123');
    expect(p.refines).toBeUndefined();
  });
  it('keeping B supersedes A and its own decisions, never the one behind both', () => {
    const p = planOf('cc', c, s, { keep: 'b', why: 'iPads are sold in the shops' });
    expect(p.supersede).toEqual(['req:cc.phone-only', 'decision:cc.no-tablets']);
  });
  it('both hold: nothing is superseded, A refines B', () => {
    const p = planOf('cc', c, s, { keep: 'both', why: 'phones are the design target; the build may still run on an iPad' });
    expect(p.supersede).toEqual([]);
    expect(p.refines).toEqual(['req:cc.phone-only', 'rule:root.tablet-support']);
    expect(p.decision.props.supersedes).toBeUndefined();
  });
  it('neither holds: both sides and both one-sided decisions go', () => {
    const p = planOf('cc', c, s, { keep: 'none', why: 'the question is moot: there is no iOS build', title: 'No iOS build at all' });
    expect(p.supersede.sort()).toEqual(['decision:cc.no-tablets', 'decision:cc.universal-build', 'req:cc.phone-only', 'rule:root.tablet-support']);
    expect(p.decision.title).toBe('No iOS build at all');
  });
});
