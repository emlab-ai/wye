import { describe, it, expect } from 'vitest';
import { askingOf } from './asking';

describe('askingOf (req:wf2.sessions.question-toast)', () => {
  const ask = { kind: 'permission', requestId: 'r1', name: 'AskUserQuestion', input: { questions: [{ question: 'Build what the page says?' }] } };
  it('an unanswered AskUserQuestion is the question', () => {
    expect(askingOf([{ kind: 'user' }, ask])).toEqual({ requestId: 'r1', kind: 'question', text: 'Build what the page says?' });
  });
  it('an answered one is not', () => {
    expect(askingOf([ask, { kind: 'note', requestId: 'r1', text: 'allowed r1' }])).toBeUndefined();
  });
  it('another tool\'s permission is a permission, with its description', () => {
    expect(askingOf([{ kind: 'permission', requestId: 'r2', name: 'Bash', text: 'rm -rf build' }])).toEqual({ requestId: 'r2', kind: 'permission', text: 'Bash — rm -rf build' });
  });
  it('the last open one wins', () => {
    expect(askingOf([ask, { kind: 'note', requestId: 'r1' }, { kind: 'permission', requestId: 'r3', name: 'AskUserQuestion', input: { questions: [{ question: 'Second?' }] } }])!.text).toBe('Second?');
  });
});
