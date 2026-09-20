'use strict';
// Impact (decision:exec.impact-run, req:exec.impact-set, req:exec.impact-sub-items, decision:exec.impact-through-the-judge):
// what an edit of a node reaches, and what each reached node needs. Candidates come from structure — the node's
// content first, then two hops over the edges that carry meaning in both directions, with decay and the path — and
// from text (the web app adds the semantic hits structure did not reach). A model call per candidate, batched,
// reads the before, the after, the candidate and its path and answers unaffected | update (with the new text or
// property values) | rework (a sentence: more than a block has to change) | contradicts | ask (a question first).
// The call goes through lib/judge.js's `ask` (the agent CLI, or WF_JUDGE_CMD); answers are cached per
// (before, after, candidate) in <product>/_build/impact.json and never asked twice.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const judge = require('./judge');

const PROMPT_VERSION = 1;
const BATCH = 10;
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const DEFAULT_MODEL = process.env.WF_IMPACT_MODEL || judge.DEFAULT_MODEL;

// The edges an edit travels, from the changed node outward. `out` follows the node's own edges (what it is satisfied
// by, what it governs…), `inc` the edges pointing at it (what refines it, what is part of it, what mentions it).
// Weight is the decay per hop along that verb; content (has) is first and undecayed.
const OUT = { has: 1, 'satisfied-by': 0.8, 'verified-by': 0.7, governs: 0.8, affects: 0.7, resolves: 0.5, 'depends-on': 0.5, refines: 0.6, 'part-of': 0.5 };
const INC = { refines: 0.9, 'part-of': 0.7, 'depends-on': 0.8, 'governed-by': 0.8, 'satisfied-by': 0.8, 'verified-by': 0.7, mentions: 0.4, 'related-to': 0.5, affects: 0.6, governs: 0.6, has: 0.3, resolves: 0.4, produced: 0.2 };
const INVERSE = { has: 'content', refines: 'refined-by', 'part-of': 'contains', 'depends-on': 'depended-on-by', 'governed-by': 'governs', 'satisfied-by': 'satisfies', 'verified-by': 'verifies', mentions: 'mentioned-by', 'related-to': 'related-from', affects: 'affected-by', governs: 'governed-by', resolves: 'resolved-by', produced: 'produced-by' };
const NOT_THROUGH = new Set(['module', 'pr', 'block', 'prop', 'field', 'type', 'product', 'verdict', 'contradiction']);
// a mechanism (what satisfies or verifies) is a candidate but not a hop: the other things it serves are siblings
const LEAF = new Set(['op', 'component', 'lib', 'test', 'ui-test', 'page', 'action', 'entity', 'tool', 'store', 'flag', 'setting', 'gate']);

// Structural candidates of `id` in a lib/graph Graph (or anything with byId / out / inc maps): [{ id, kind, title,
// distance, weight, path, via }], content first, then by weight; `hops` deep; nothing through a page or a paragraph.
// a step back along the inverse of the step just taken (satisfied-by → satisfies: the mechanism's other
// requirements) is a sibling, not a dependent: never walked
const BACK = { 'satisfied-by': 'satisfies', satisfies: 'satisfied-by', 'verified-by': 'verifies', verifies: 'verified-by', refines: 'refined-by', 'refined-by': 'refines', 'part-of': 'contains', contains: 'part-of', governs: 'governed-by', 'governed-by': 'governs', affects: 'affected-by', 'affected-by': 'affects', 'depends-on': 'depended-on-by', 'depended-on-by': 'depends-on' };
function structuralCandidates(g, id, { hops = 2, min = 0.4 } = {}) {
    const best = new Map();   // id -> { weight, distance, path }
    const consider = (to, weight, distance, pathArr, via) => {
        if (to === id) return;
        const n = g.byId.get(to); if (!n || !n.defined || NOT_THROUGH.has(n.kind)) return;
        const cur = best.get(to);
        if (!cur || cur.weight < weight) best.set(to, { weight, distance, path: pathArr, via, n });
    };
    let frontier = [{ id, weight: 1, path: [] }];
    for (let d = 1; d <= hops; d++) {
        const next = [];
        for (const f of frontier) {
            for (const e of (g.out.get(f.id) || [])) {
                if (e.generated) continue;   // a generated inverse: its forward twin is walked from `inc`
                const w = OUT[e.verb]; if (!w) continue;
                const label = e.verb === 'has' ? 'content' : e.verb;
                if (e.verb === 'has' && d > 1) continue;   // content only of the changed node itself
                if (f.path.length && BACK[f.path[f.path.length - 1]] === label) continue;
                const weight = f.weight * w; if (weight < min) continue;
                consider(e.to, weight, d, [...f.path, label], e.verb === 'has' ? 'content' : 'structure');
                if (!LEAF.has((g.byId.get(e.to) || {}).kind)) next.push({ id: e.to, weight, path: [...f.path, label] });
            }
            for (const e of (g.inc.get(f.id) || [])) {
                const w = INC[e.verb]; if (!w) continue;
                const label = INVERSE[e.verb] || e.verb;
                if (f.path.length && BACK[f.path[f.path.length - 1]] === label) continue;
                const weight = f.weight * w; if (weight < min) continue;
                consider(e.from, weight, d, [...f.path, label], 'structure');
                if (!LEAF.has((g.byId.get(e.from) || {}).kind)) next.push({ id: e.from, weight, path: [...f.path, label] });
            }
        }
        frontier = next.filter(x => x.weight >= min);
    }
    return [...best.entries()].map(([cid, b]) => ({ id: cid, kind: b.n.kind, title: b.n.title, status: b.n.status, distance: b.distance, weight: Math.round(b.weight * 100) / 100, path: b.path.join(' → '), via: b.via, text: judge.nodeText(b.n) }))
        .sort((a, b) => (a.via === 'content' ? -1 : b.via === 'content' ? 1 : 0) || b.weight - a.weight || a.id.localeCompare(b.id));
}

// A child whose text repeats the old value verbatim (req:exec.impact-sub-items): proposed as an update without a
// model call — the old text swapped for the new inside the child's text.
function verbatimUpdate(candidateText, beforeText, afterText) {
    const b = (beforeText || '').trim(); if (b.length < 12 || !candidateText.includes(b)) return null;
    return candidateText.split(b).join((afterText || '').trim());
}

const PROMPT_HEAD = `A node of a product's specification changed. For each candidate node that the change may reach — with the path from the changed node — say what the change means for it:
- unaffected: the candidate still holds as written
- update: the candidate needs a small change to stay true — give the new text (and/or property values) for it, complete, ready to write
- rework: more than the block has to change — say in one sentence what has to change and where
- contradicts: the new value and the candidate cannot both hold, and neither a small update nor rework resolves which is right
- ask: a person must answer a question before anyone can tell — give the question
Judge the texts as written. Prefer unaffected when the change does not touch what the candidate says. An update rewrites only what the change makes wrong; keep the candidate's own words otherwise.
Answer with a JSON array only — no prose, no code fence — one object per candidate, in order: {"i": <index>, "verdict": "unaffected|update|rework|contradicts|ask", "reason": "<one sentence>", "update": {"text": "<new text>", "props": {"<key>": "<value>"}} | null, "question": "<the question>" | null}.
`;
const promptHash = () => sha(PROMPT_HEAD + '#' + PROMPT_VERSION).slice(0, 8);
function buildPrompt(change, cands) {
    const head = `${PROMPT_HEAD}\nThe changed node: ${change.node} (${change.kind})\nBEFORE: ${change.before}\nAFTER: ${change.after}\n\nCandidates:`;
    return head + cands.map((c, i) => `\n\n[${i}] ${c.id} (${c.kind}${c.status ? ', ' + c.status : ''}; path: ${c.path || 'by text'})\n${c.text}`).join('') + '\n';
}
const cacheKey = (change, c, model) => sha([change.node, sha(change.before), sha(change.after), c.id, sha(c.text), model, promptHash()].join('|')).slice(0, 12);

function parseAnswer(text, n) {
    const m = String(text).match(/\[[\s\S]*\]/); if (!m) throw new Error('impact judge answered without a JSON array: ' + String(text).slice(0, 200));
    const arr = JSON.parse(m[0]); const out = new Array(n).fill(null);
    arr.forEach((v, k) => {
        const i = Number.isInteger(v.i) ? v.i : k; if (i < 0 || i >= n) return;
        const verdict = ['unaffected', 'update', 'rework', 'contradicts', 'ask'].includes(v.verdict) ? v.verdict : 'unaffected';
        const update = verdict === 'update' && v.update && typeof v.update === 'object' ? { text: typeof v.update.text === 'string' ? v.update.text.trim() : undefined, props: v.update.props && typeof v.update.props === 'object' ? Object.fromEntries(Object.entries(v.update.props).map(([k, x]) => [k, String(x)])) : undefined } : null;
        out[i] = { verdict, reason: String(v.reason || '').replace(/\s+/g, ' ').slice(0, 300), update, question: verdict === 'ask' ? String(v.question || v.reason || '').slice(0, 300) : null };
    });
    return out;
}
function loadCache(file) { try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); return c && c.entries ? c : { entries: {} }; } catch { return { entries: {} }; } }
function saveCache(file, cache) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, file); }

// Judge the candidates of a change { node, kind, before, after } (texts): one verdict per candidate in order — null
// where the budget did not reach — each { verdict, reason, update, question, model, prompt, at, cached, key }.
// `onBatch(verdicts)` reports every batch as it lands, so a card can fill in while the run goes on.
async function judgeImpact(change, cands, { model = DEFAULT_MODEL, cacheFile = null, budget = { candidates: 20, calls: 3 }, log = () => {}, onBatch = null } = {}) {
    const cache = cacheFile ? loadCache(cacheFile) : { entries: {} };
    const out = cands.map(c => { const key = cacheKey(change, c, model); const hit = cache.entries[key]; return hit ? { ...hit, cached: true, key } : null; });
    if (onBatch && out.some(Boolean)) await onBatch(out.map((v, i) => v ? { i, v } : null).filter(Boolean));
    const todo = cands.map((c, i) => [c, i]).filter(([, i]) => !out[i]).slice(0, budget.candidates);
    let calls = 0;
    for (let k = 0; k < todo.length && calls < budget.calls; k += BATCH) {
        const batch = todo.slice(k, k + BATCH); calls++;
        let answers;
        try { answers = parseAnswer(await judge.ask(buildPrompt(change, batch.map(([c]) => c)), { model }), batch.length); } catch (e) { log(`impact: ${e.message}`); break; }
        const landed = [];
        batch.forEach(([c, i], j) => {
            const v = answers[j]; if (!v) return;
            const key = cacheKey(change, c, model);
            const rec = { ...v, model, prompt: promptHash(), at: new Date().toISOString() };
            cache.entries[key] = rec; out[i] = { ...rec, cached: false, key }; landed.push({ i, v: out[i] });
        });
        if (cacheFile) saveCache(cacheFile, cache);
        if (onBatch && landed.length) await onBatch(landed);
    }
    return out;
}

module.exports = { structuralCandidates, verbatimUpdate, judgeImpact, buildPrompt, parseAnswer, promptHash, cacheKey, DEFAULT_MODEL, PROMPT_VERSION, OUT, INC };
