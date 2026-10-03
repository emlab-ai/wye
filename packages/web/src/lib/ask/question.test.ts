import { describe, it, expect } from 'vitest';
import { isQuestion } from './question';
describe('isQuestion', () => {
  it.each(['why did we drop invites', 'How does search work', 'is login done?', 'what owns req:a', 'invites?', 'can agents propose'])('yes: %s', q => expect(isQuestion(q)).toBe(true));
  it.each(['invite email', 'req:wf2.ui.search', 'page: login', 'why', ''])('no: %s', q => expect(isQuestion(q)).toBe(false));
});
