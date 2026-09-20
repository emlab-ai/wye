'use strict';
// Jev (TypeSafe AI) — the decision model that judges candidate links (docs/superpowers/specs/2026-09-20-jev-auto-linking-design.md):
// one POST per judgement with a state and a map of typed questions, typed answers with calibrated probabilities back.
// Candidates always come from the local search; Jev only says, per candidate, how likely the text is about it. The
// client is bound to a key (the app's settings, or TYPESAFE_API_KEY for tests and evals); without one it is disabled
// and every method returns the empty result without a call.
const crypto = require('crypto');

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = process.env.WF_JEV_MODEL || 'jev-latest';
// above this probability a link is written automatically; below it a candidate is only a suggestion
const LINK_MIN = 0.85;
const PROMPT_VERSION = 1;

const LINK_QUESTION = 'Is the text specifically about, or does it directly depend on, the piece of knowledge in `knowledge`? Yes only if a reader of the text would want that knowledge linked from it.';
const KINDS = {
  decision: 'a choice that was made, with its reason ("we go with X because …")',
  requirement: 'what the product must do for someone ("when …, then …")',
  rule: 'a standing rule about the product or how it is built ("always …", "never …")',
  question: 'something raised and left open, without an answer',
  note: 'anything else: pasted material, an observation, a reference',
};
const KIND_QUESTION = 'Which kind of knowledge is this text?';
const promptVersion = () => crypto.createHash('sha1').update(LINK_QUESTION + KIND_QUESTION + JSON.stringify(KINDS) + '#' + PROMPT_VERSION).digest('hex').slice(0, 8);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function jev({ key, model = DEFAULT_MODEL, fetch: f = globalThis.fetch, backoffMs = 500 } = {}) {
  const enabled = !!key;

  async function ask(state, questions, { timeoutMs = 10000 } = {}) {
    if (!enabled) throw new Error('jev: no key');
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(backoffMs * 2 ** (attempt - 1));
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await f(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, state, questions }), signal: ctl.signal });
        if (r.ok) return await r.json();
        last = new Error(`jev: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
        if (r.status !== 429 && r.status !== 529) throw last; // only a rate limit or an overload is worth a retry
      } finally { clearTimeout(t); }
    }
    throw last;
  }

  // per candidate: how likely is the text about it — one noul question each, keyed by index, one call
  async function judgeLinks(text, candidates) {
    if (!enabled || !candidates.length) return [];
    const questions = {};
    candidates.forEach((c, i) => { questions[String(i)] = { type: 'noul', instructions: { knowledge: `${c.id}: ${String(c.text || '').slice(0, 400)}`, question: LINK_QUESTION } }; });
    const { answers } = await ask(text, questions);
    return candidates.map((c, i) => ({ id: c.id, p: Number(answers?.[String(i)]?.noul ?? 0) }));
  }

  // which of the five inbox kinds the text is, with the probability of the winner
  async function judgeKind(text) {
    if (!enabled) return { kind: 'note', p: 0 };
    const { answers } = await ask(text, { kind: { type: 'choice', instructions: KIND_QUESTION, criteria: KINDS } });
    const a = answers?.kind; if (!a || !a.choice) return { kind: 'note', p: 0 };
    return { kind: a.choice, p: Number(a.probabilities?.[a.choice] ?? 0) };
  }

  return { enabled, model, ask, judgeLinks, judgeKind };
}

module.exports = { jev, LINK_MIN, DEFAULT_MODEL, ENDPOINT, promptVersion };
