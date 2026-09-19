'use strict';
// The judge (decision:memory.write-time-verdict, decision:memory.model-calls-via-cli): classifies pairs of knowledge
// nodes — duplicate | refines | consistent | contradicts, with the conflict kind for a contradiction (static,
// dynamic, conditional — MemConflict's split) and a one-sentence reason. One model call classifies a batch of pairs;
// the call goes through the agent CLI the app already runs (`claude -p --output-format json`), or the command in
// WF_JUDGE_CMD (reads the prompt on stdin, prints the answer). Every verdict records the model and the prompt hash so
// it can be replayed; verdicts are cached per pair (ids + texts) in <product>/_build/verdicts.json and never asked twice.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PROMPT_VERSION = 1;
const DEFAULT_MODEL = process.env.WF_JUDGE_MODEL || 'claude-haiku-4-5-20251001';
const BATCH = 10;
const sha = s => crypto.createHash('sha1').update(s).digest('hex');

const PROMPT_HEAD = `You classify pairs of statements from one product's specification (requirements, rules, constraints, decisions). For each pair say how B relates to A:
- duplicate: they say the same thing; one of them should go
- refines: B narrows, details or specialises A (or A does B); both can hold
- consistent: both can hold; they agree or are about different things
- contradicts: they cannot both hold as written
For contradicts also name the conflict: "static" (a fact against a fact), "dynamic" (B is a later state of A — a change in time, a supersession), "conditional" (they conflict only under some condition or context). Otherwise conflict is null.
Be strict about "contradicts": different scope, a later refinement or a different level of detail is not a contradiction. Judge the texts as written; do not assume what the product should do.
Answer with a JSON array only — no prose, no code fence — one object per pair, in order: {"i": <index>, "kind": "duplicate|refines|consistent|contradicts", "conflict": "static|dynamic|conditional|null", "reason": "<one sentence>"}.

Pairs:`;
const promptHash = () => sha(PROMPT_HEAD + '#' + PROMPT_VERSION).slice(0, 8);

// The text of a node for the judge: title, then its prose keys, one paragraph
const TEXT_KEYS = ['title', 'statement', 'text', 'when', 'then', 'unless', 'choice', 'context', 'q', 'description', 'purpose'];
function nodeText(n) {
    const body = n.body || ''; const parts = []; const seen = new Set();
    const get = k => { const m = body.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); if (!m) return ''; let v = m[1].trim(); if (/^[>|]-?$/.test(v)) { v = ''; for (const l of body.slice(m.index + m[0].length).split('\n').slice(1)) { if (!/^\s+\S/.test(l)) break; v += (v ? ' ' : '') + l.trim(); } } return v.replace(/^["']|["']$/g, ''); };
    for (const k of TEXT_KEYS) { const v = k === 'title' ? (n.title || get('title')) : get(k); if (v && !seen.has(v)) { seen.add(v); parts.push(k === 'title' || k === 'statement' || k === 'text' || k === 'q' ? v : `${k}: ${v}`); } }
    return parts.join(' ').replace(/\s+/g, ' ').slice(0, 1200);
}
const label = n => `${n.id}${n.status ? ', ' + n.status : ''}${n.date ? ', ' + n.date : ''}`;
function buildPrompt(pairs) {
    return PROMPT_HEAD + '\n' + pairs.map((p, i) => `\n[${i}]\nA (${label(p.a)}): ${p.a.text}\nB (${label(p.b)}): ${p.b.text}`).join('\n') + '\n';
}
const pairKey = (a, b, model) => sha([a.id, sha(a.text), b.id, sha(b.text), model, promptHash()].join('|')).slice(0, 12);

// Run the model once with a prompt; resolves the answer text. WF_JUDGE_CMD (a shell command reading stdin) replaces
// the CLI — the tests use a fake judge; a product can point it at codex or anything else.
function ask(prompt, { model = DEFAULT_MODEL, timeoutMs = 180000 } = {}) {
    return new Promise((resolve, reject) => {
        const custom = process.env.WF_JUDGE_CMD;
        const child = custom ? spawn(custom, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] }) : spawn('claude', ['-p', '--output-format', 'json', '--model', model, '--tools', ''], { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', err = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('judge timed out')); }, timeoutMs);
        child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
        child.on('error', e => { clearTimeout(timer); reject(e); });
        child.on('close', code => {
            clearTimeout(timer);
            if (code !== 0) return reject(new Error(`judge exited ${code}: ${err.slice(0, 300)}`));
            if (custom) return resolve(out);
            try { const j = JSON.parse(out); if (j.is_error) return reject(new Error('judge error: ' + String(j.result).slice(0, 300))); resolve(String(j.result || '')); } catch { resolve(out); }
        });
        child.stdin.end(prompt);
    });
}
// The JSON array in an answer, tolerant of a fence or prose around it
function parseAnswer(text, n) {
    const m = String(text).match(/\[[\s\S]*\]/); if (!m) throw new Error('judge answered without a JSON array: ' + String(text).slice(0, 200));
    const arr = JSON.parse(m[0]); const out = new Array(n).fill(null);
    arr.forEach((v, k) => { const i = Number.isInteger(v.i) ? v.i : k; if (i < 0 || i >= n) return; const kind = ['duplicate', 'refines', 'consistent', 'contradicts'].includes(v.kind) ? v.kind : 'consistent'; out[i] = { kind, conflict: kind === 'contradicts' && ['static', 'dynamic', 'conditional'].includes(v.conflict) ? v.conflict : null, reason: String(v.reason || '').replace(/\s+/g, ' ').slice(0, 300) }; });
    return out;
}

function loadCache(file) { try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); return c && c.entries ? c : { entries: {} }; } catch { return { entries: {} }; } }
function saveCache(file, cache) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, file); }

// Judge pairs [{ a: { id, text, status, date }, b: {...} }]; cached ones come back at once, the rest go to the model in
// batches, within the budget (`pairs` new pairs, `calls` model calls per run). Returns one verdict per pair in order —
// `null` for a pair the budget did not reach — each { a, b, kind, conflict, reason, model, prompt, at, cached, key }.
async function judgePairs(pairs, { model = DEFAULT_MODEL, cacheFile = null, budget = { pairs: 40, calls: 6 }, log = () => {} } = {}) {
    const cache = cacheFile ? loadCache(cacheFile) : { entries: {} };
    const out = pairs.map(p => { const key = pairKey(p.a, p.b, model); const hit = cache.entries[key]; return hit ? { ...hit, a: p.a.id, b: p.b.id, cached: true, key } : null; });
    const todo = pairs.map((p, i) => [p, i]).filter(([, i]) => !out[i]).slice(0, budget.pairs);
    let calls = 0;
    for (let k = 0; k < todo.length && calls < budget.calls; k += BATCH) {
        const batch = todo.slice(k, k + BATCH); calls++;
        const prompt = buildPrompt(batch.map(([p]) => p));
        let answers;
        try { answers = parseAnswer(await ask(prompt, { model }), batch.length); } catch (e) { log(`judge: ${e.message}`); break; }
        batch.forEach(([p, i], j) => {
            const v = answers[j]; if (!v) return;
            const key = pairKey(p.a, p.b, model);
            const rec = { a: p.a.id, b: p.b.id, kind: v.kind, conflict: v.conflict, reason: v.reason, model, prompt: promptHash(), at: new Date().toISOString() };
            cache.entries[key] = rec; out[i] = { ...rec, cached: false, key };
        });
    }
    if (cacheFile && todo.length) saveCache(cacheFile, cache);
    return out;
}

// The lines written under the judged node (its content) for a verdict that is not "consistent": the verdict itself
// and, for duplicate / contradicts, an open contradiction: node — both prose lines the parser reads as nodes.
function verdictLines(v, { product = 'x' } = {}) {
    if (!v || v.kind === 'consistent') return [];
    const extra = `(kind: ${v.kind}${v.conflict ? ', conflict: ' + v.conflict : ''}, model: ${v.model}, prompt: ${v.prompt}, pair: ${v.a} ${v.b})`;
    const lines = [`verdict:${v.key} ${v.kind} ${v.a} — ${v.reason} ${extra}`];
    if (v.kind === 'contradicts' || v.kind === 'duplicate') lines.push(`contradiction:${product}.${v.key} ${v.b} ${v.kind === 'duplicate' ? 'duplicates' : 'contradicts'} ${v.a} — ${v.reason} #open (between: ${v.b} ${v.a}, conflict: ${v.conflict || 'static'})`);
    return lines;
}

module.exports = { judgePairs, nodeText, buildPrompt, parseAnswer, promptHash, pairKey, verdictLines, ask, DEFAULT_MODEL, PROMPT_VERSION };
