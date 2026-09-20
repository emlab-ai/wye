'use strict';
// Consolidation's model side (decision:memory.consolidate-sessions), shared by the app (packages/web/src/lib/consolidate.ts)
// and the eval suite (eval/own — the consolidation benchmark hides a session's decision blocks and asks whether the
// same prompt finds them): the transcript excerpt, the prompt and the parser of its answer. One place, so the
// benchmark measures the prompt the app runs, and the prompt hash names it.
const crypto = require('crypto');

const PROMPT_VERSION = 1;

// The conversation as the judge reads it: the person's and the agent's words, numbered by transcript index (`#n` is
// the evidence key, session:<id>#<n>), tools and thinking left out, the middle cut when it is long.
function transcriptExcerpt(events, budget = 40000) {
    const rows = events.map((e, i) => ({ i, e })).filter(({ e }) => (e.kind === 'user' || e.kind === 'assistant' || e.kind === 'summary') && (e.text || e.prompt)).map(({ i, e }) => `#${i} ${e.kind === 'user' ? 'PERSON' : 'AGENT'}: ${(e.text || e.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 2500)}`);
    const total = rows.reduce((a, r) => a + r.length + 1, 0);
    if (total <= budget) return rows.join('\n');
    // keep messages from both ends, the first and the last alternately, until the budget is spent
    const keep = new Set(); let used = 0, lo = 0, hi = rows.length - 1;
    while (lo <= hi) { const i = keep.size % 2 === 0 ? lo++ : hi--; if (used + rows[i].length + 1 > budget) break; keep.add(i); used += rows[i].length + 1; }
    const out = []; let gap = 0;
    rows.forEach((r, i) => { if (keep.has(i)) { if (gap) out.push(`… (${gap} messages left out) …`); gap = 0; out.push(r); } else gap++; });
    if (gap) out.push(`… (${gap} messages left out) …`);
    return out.join('\n');
}

const PROMPT_HEAD = `Below is a conversation between a person and a coding agent working on a product whose knowledge (requirements, rules, decisions, constraints, questions) is kept as typed blocks in documents. Read it and list what it produced as knowledge:
- decision: something the person or the agent settled ("let's do X", "no, Y instead", "we go with Z") — title, and text = the choice with its reason
- constraint: a standing rule about the product or how it is built stated as always/never ("always Z", "we never …")
- question: something raised and left open (no answer in the conversation)
- lesson: something learned the hard way ("this broke because …", "it turned out that …", "next time …")
Only knowledge about the product and how it is built — not the agent's step-by-step narration, not task progress. Attribute each to "person" or "agent" (who said or decided it) and cite the message numbers (#n) where it is said as evidence.

Then compare with the blocks the session already wrote into the documents (listed below by id and title) and output ONLY the candidates that none of those blocks already carries. If everything was written, output [].

Answer with a JSON array only — no prose, no code fence: [{"kind": "decision|constraint|question|lesson", "title": "<one line, max 90 chars>", "text": "<one paragraph>", "context": "<one sentence: what prompted it, optional>", "by": "person|agent", "evidence": [<message numbers>]}]`;
const promptHash = () => crypto.createHash('sha1').update(PROMPT_HEAD + '#' + PROMPT_VERSION).digest('hex').slice(0, 8);

function consolidationPrompt(excerpt, written) {
    return `${PROMPT_HEAD}

Blocks already written by this session:
${written.length ? written.map(w => `- ${w.id} — ${w.title}`).join('\n') : '(none)'}

Conversation:
${excerpt}
`;
}

function parseCandidates(text) {
    const m = String(text).match(/\[[\s\S]*\]/); if (!m) return [];
    let arr; try { arr = JSON.parse(m[0]); } catch { return []; }
    if (!Array.isArray(arr)) return [];
    return arr.filter(c => c && ['decision', 'constraint', 'question', 'lesson'].includes(c.kind) && c.title).map(c => ({ kind: c.kind, title: String(c.title).replace(/\s+/g, ' ').trim().slice(0, 110), text: String(c.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200), context: c.context ? String(c.context).replace(/\s+/g, ' ').trim().slice(0, 400) : undefined, by: c.by === 'agent' ? 'agent' : 'person', evidence: Array.isArray(c.evidence) ? c.evidence.map(Number).filter(Number.isInteger) : [] }));
}

module.exports = { transcriptExcerpt, consolidationPrompt, parseCandidates, promptHash, PROMPT_VERSION };
