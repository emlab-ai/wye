import { describe, it, expect } from 'vitest';
import { STEPS, MARKED, EMPTY_SIGNALS, onboardingOf, type Signals, type StepKey } from './onboarding';

// the Quick start's step model (docs/superpowers/specs/2026-10-05-onboarding-design.md): pure over Signals
const ORDER: StepKey[] = ['agent', 'document', 'block', 'link', 'remember', 'approve', 'ask', 'pr', 'build'];
const ALL: Signals = { agent: true, documents: 1, blocks: 1, links: 1, approved: 1, prs: 1, built: 1, marked: ['remember', 'ask'] };
const one = (patch: Partial<Signals>): Signals => ({ ...EMPTY_SIGNALS, ...patch });
const doneOf = (s: Signals, key: StepKey) => onboardingOf(s, false).steps.find(x => x.key === key)!.done;

describe('onboarding steps', () => {
  it('nine steps, unique keys, in the spec order and groups', () => {
    expect(STEPS.map(s => s.key)).toEqual(ORDER);
    expect(new Set(STEPS.map(s => s.key)).size).toBe(9);
    expect(STEPS.map(s => s.group)).toEqual(['setup', 'setup', 'setup', 'setup', 'loop', 'loop', 'loop', 'loop', 'loop']);
    expect(MARKED).toEqual(['remember', 'ask']);
    for (const s of STEPS) { expect(s.title).toBeTruthy(); expect(s.why).toMatch(/\.$/); expect(s.why).not.toMatch(/!|\bsimply\b|\bjust\b|\beasy\b/i); }
  });
  it('every step is open on EMPTY_SIGNALS', () => {
    for (const k of ORDER) expect(doneOf(EMPTY_SIGNALS, k)).toBe(false);
  });
  it.each<[StepKey, Partial<Signals>]>([
    ['agent', { agent: true }], ['document', { documents: 1 }], ['block', { blocks: 2 }], ['link', { links: 1 }],
    ['remember', { marked: ['remember'] }], ['approve', { approved: 1 }], ['ask', { marked: ['ask'] }], ['pr', { prs: 1 }], ['build', { built: 1 }],
  ])('%s is done when its signal is set, and only it', (key, patch) => {
    const s = one(patch);
    expect(doneOf(s, key)).toBe(true);
    expect(onboardingOf(s, false).done).toBe(1);
  });
  it('a mark of one step does not tick another', () => {
    expect(doneOf(one({ marked: ['ask'] }), 'remember')).toBe(false);
  });
  it('done/total, next is the first open step, null when complete', () => {
    const o = onboardingOf(EMPTY_SIGNALS, false);
    expect(o).toMatchObject({ done: 0, total: 9, next: 'agent', complete: false, dismissed: false, show: true });
    expect(onboardingOf(one({ agent: true, documents: 3 }), false)).toMatchObject({ done: 2, next: 'block' });
    expect(onboardingOf(one({ documents: 3 }), false).next).toBe('agent');
    expect(onboardingOf(ALL, false)).toMatchObject({ done: 9, total: 9, next: null, complete: true, show: false });
  });
  it('show is false when dismissed or complete', () => {
    expect(onboardingOf(EMPTY_SIGNALS, true)).toMatchObject({ dismissed: true, show: false, complete: false });
    expect(onboardingOf(ALL, false).show).toBe(false);
  });
  it('a step state carries no done() function (it goes over JSON)', () => {
    const st = onboardingOf(EMPTY_SIGNALS, false).steps[0] as unknown as Record<string, unknown>;
    expect(typeof st.done).toBe('boolean');
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
  });
});
