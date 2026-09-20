'use strict';
// lib/jev (Jev auto-linking design): the client sends one systemone request with the key, parses noul and choice
// answers, retries on 429/529, and does nothing at all without a key.
const assert = require('assert');
const { jev, LINK_MIN, promptVersion } = require('../lib/jev');

const calls = [];
const fake = (responses) => async (url, init) => {
  calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
  const r = responses.shift();
  return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
};

(async () => {
  // no key: disabled, no call, empty results
  const off = jev({ key: '', fetch: fake([]) });
  assert.strictEqual(off.enabled, false);
  assert.deepStrictEqual(await off.judgeLinks('some text', [{ id: 'req:a', text: 'A' }]), []);
  assert.deepStrictEqual(await off.judgeKind('some text'), { kind: 'note', p: 0 });
  assert.strictEqual(calls.length, 0);

  // judgeLinks: one noul per candidate, keyed by index, answers back in order
  const c = jev({ key: 'k-123', fetch: fake([{ status: 200, body: { model: 'jev-1.13.0', answers: { 0: { type: 'noul', noul: 0.91 }, 1: { type: 'noul', noul: 0.12 } }, usage: { input_tokens: 10, output_tokens: 2 } } }]) });
  assert.strictEqual(c.enabled, true);
  const links = await c.judgeLinks('The checkout rounds half-up.', [{ id: 'rule:round', text: 'Prices round half-up' }, { id: 'req:login', text: 'Users log in with email' }]);
  assert.deepStrictEqual(links, [{ id: 'rule:round', p: 0.91 }, { id: 'req:login', p: 0.12 }]);
  const req = calls[0];
  assert.strictEqual(req.url, 'https://api.typesafe.ai/v1/systemone');
  assert.strictEqual(req.init.method, 'POST');
  assert.strictEqual(req.init.headers.Authorization, 'Bearer k-123');
  assert.strictEqual(req.init.body.model, 'jev-latest');
  assert.strictEqual(req.init.body.state, 'The checkout rounds half-up.');
  assert.strictEqual(req.init.body.questions['0'].type, 'noul');
  assert.ok(req.init.body.questions['0'].instructions.question.includes('`knowledge`'));
  assert.strictEqual(req.init.body.questions['0'].instructions.knowledge, 'rule:round: Prices round half-up');

  // empty candidates: no call
  assert.deepStrictEqual(await c.judgeLinks('text', []), []);
  assert.strictEqual(calls.length, 1);

  // judgeKind: a choice over the five kinds
  const k = jev({ key: 'k', fetch: fake([{ status: 200, body: { model: 'm', answers: { kind: { type: 'choice', choice: 'decision', probabilities: { decision: 0.9, requirement: 0.05, rule: 0.03, question: 0.01, note: 0.01 }, confidence: 0.88 } }, usage: {} } }]) });
  assert.deepStrictEqual(await k.judgeKind('We go with Postgres because of the team.'), { kind: 'decision', p: 0.9 });
  assert.deepStrictEqual(Object.keys(calls[1].init.body.questions.kind.criteria), ['decision', 'requirement', 'rule', 'question', 'note']);

  // 429 then 200: retried; 401: thrown with the status
  const r = jev({ key: 'k', fetch: fake([{ status: 429, body: { error: 'rate' } }, { status: 200, body: { model: 'm', answers: { 0: { type: 'noul', noul: 0.5 } }, usage: {} } }]), backoffMs: 1 });
  assert.deepStrictEqual(await r.judgeLinks('t', [{ id: 'x:y', text: 'z' }]), [{ id: 'x:y', p: 0.5 }]);
  const bad = jev({ key: 'k', fetch: fake([{ status: 401, body: { error: 'invalid key' } }]), backoffMs: 1 });
  await assert.rejects(() => bad.judgeLinks('t', [{ id: 'x:y', text: 'z' }]), /401/);

  assert.strictEqual(LINK_MIN, 0.85);
  assert.match(promptVersion(), /^[0-9a-f]{8}$/);
  console.log('jev: ok');
})().catch(e => { console.error(e); process.exit(1); });
