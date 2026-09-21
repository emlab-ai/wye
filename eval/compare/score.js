'use strict';
// Scoring a tier-2 run (module:benchmarks, the tier-2 table): what the run wrote, what it cited, what it asked.
//   constraint violations   the verdict pass (lib/judge.js, the Inbox's prompt) over the blocks the run wrote and over a
//                           summary of its diff, against the approved constraints — pairs judged `contradicts`
//   node ids cited          graph ids in the assistant turns that resolve in the product
//   should-have-known       questions the run asked the person that the constraint packet already answers (a judge
//                           with the packet as evidence; recorded per pair)
//   reverted / bounced      filled in later from the change records and the Work view — null until then
//   tokens, wall time       from the agent's result event
//   mark                    the blind 1–5 the person gives on the Evaluation page (marks.json)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { parseFiles } = require('../../lib/parse');
const judge = require('../../lib/judge');
const { isCurrent } = require('../../lib/graph');
const { REPO, isTyped, nodeText } = require('../lib/product');
const { Recording } = require('../lib/record');

const PROMPT_VERSION = 1;
const SHK_HEAD = `An agent working on a product asked a person the questions below. Before it started, the agent was given the "constraints in force" — the rules, decisions, goals and open questions that govern its request — quoted after the questions. For each question say whether the constraints already answer it (the agent should have known) or not.
Answer with a JSON array only — no prose, no code fence — one object per question, in order: {"i": <index>, "answered": true|false, "by": "<the id of the constraint that answers it, or null>", "reason": "<one sentence>"}.`;
const promptHash = () => crypto.createHash('sha1').update(SHK_HEAD + '#' + PROMPT_VERSION).digest('hex').slice(0, 8);

// the typed blocks of the product's documents in a checkout: id → { title, body, ... }
function blocksIn(P, wt) {
    const rel = path.relative(REPO, path.join(P.productDir, 'projects'));
    const walk = (d, acc) => { if (!fs.existsSync(d)) return acc; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('_') || e.name === 'inbox') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.md')) acc.push(p); } return acc; };
    const files = walk(path.join(wt, rel), []).sort();
    const cwd = process.cwd(); process.chdir(wt);
    let data; try { data = parseFiles(files); } catch (e) { return new Map([['parse-error', { error: e.message }]]); } finally { process.chdir(cwd); }
    const m = new Map();
    for (const n of data.nodes) if (isTyped(n) && !['block', 'verdict', 'module', 'plan'].includes(n.kind)) m.set(n.id, { kind: n.kind, status: n.status, title: n.title, body: n.body, text: nodeText(n) });
    return m;
}
// the typed blocks a run added or changed: its worktree's documents against the baseline (HEAD's, parsed once per pair)
function blocksWritten(P, wt, baseline) {
    const after = blocksIn(P, wt);
    if (after.has('parse-error')) return [{ id: 'parse-error', error: after.get('parse-error').error }];
    const out = [];
    for (const [id, n] of after) {
        const was = baseline.get(id);
        if (!was) out.push({ id, kind: n.kind, change: 'added', status: n.status, title: n.title, text: n.text });
        else if (`${was.title}\n${was.body}` !== `${n.title}\n${n.body}`) out.push({ id, kind: n.kind, change: 'changed', status: n.status, title: n.title, text: n.text });
    }
    return out;
}

// the transcript's assistant text and the questions it asked the person
function readTranscript(rd) {
    const texts = []; const questions = []; let finalText = '';
    const file = path.join(rd, 'transcript.jsonl'); if (!fs.existsSync(file)) return { texts, questions, finalText };
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        let j; try { j = JSON.parse(line); } catch { continue; }
        if (j.type === 'assistant' && j.message && Array.isArray(j.message.content)) for (const c of j.message.content) { if (c.type === 'text' && c.text) texts.push(c.text); if (c.type === 'tool_use' && c.name === 'AskUserQuestion' && c.input && Array.isArray(c.input.questions)) for (const q of c.input.questions) if (q.question) questions.push(q.question); }
        if (j.type === 'result' && typeof j.result === 'string') finalText = j.result;
        if (j.type === 'item.completed' && j.item && j.item.type === 'agent_message' && j.item.text) texts.push(j.item.text);   // codex exec --json
    }
    // questions in the final answer: lines that end with a question mark and address the person
    for (const l of (finalText || texts[texts.length - 1] || '').split('\n')) { const t = l.replace(/^[-*\d.\s]+/, '').trim(); if (/\?$/.test(t) && t.length > 15 && t.length < 400) questions.push(t); }
    return { texts, questions: [...new Set(questions)], finalText };
}

async function scoreRun(P, pair, arm, n, rd, { log = () => {}, packet = '' } = {}) {
    const result = JSON.parse(fs.readFileSync(path.join(rd, 'result.json'), 'utf8'));
    const blocks = fs.existsSync(path.join(rd, 'blocks.json')) ? JSON.parse(fs.readFileSync(path.join(rd, 'blocks.json'), 'utf8')) : [];
    const diff = fs.existsSync(path.join(rd, 'diff.patch')) ? fs.readFileSync(path.join(rd, 'diff.patch'), 'utf8') : '';
    const { texts, questions } = readTranscript(rd);
    const g = P.graph;
    // ids cited: every graph id in the assistant's words that resolves
    const cited = new Set(); for (const t of texts) for (const id of g.idsIn(t)) { const x = g.node(id); if (x && x.defined && !/^(block|field|prop):/.test(id)) cited.add(id); }
    // violations: blocks and the diff summary against the constitution
    const constitution = g.data.nodes.filter(x => x.kind === 'constraint' && x.defined && x.status === 'approved' && isCurrent(x));
    const asJ = x => ({ id: x.id, text: nodeText(x), status: x.status, date: '' });
    const items = blocks.filter(b => b.text && !b.error).map(b => ({ id: b.id, text: b.text, status: b.status || '', date: '' }));
    const files = diff.split('\n').filter(l => /^diff --git/.test(l)).map(l => l.split(' b/')[1]);
    if (diff.trim()) items.push({ id: `diff:${arm}-${n}`, text: `The run changed ${files.length} file(s): ${files.slice(0, 20).join(', ')}. Diff excerpt: ${diff.replace(/\s+/g, ' ').slice(0, 2500)}`, status: '', date: '' });
    const pairs = []; for (const c of constitution) for (const it of items) pairs.push({ a: asJ(c), b: it });
    let violations = 0; const violationRows = [];
    if (pairs.length) {
        const verdicts = await judge.judgePairs(pairs, { cacheFile: path.join(path.dirname(rd), 'verdicts.json'), budget: { pairs: 200, calls: 25 }, log });
        verdicts.forEach((v, i) => { if (v && v.kind === 'contradicts') { violations++; violationRows.push({ constraint: pairs[i].a.id, item: pairs[i].b.id, reason: v.reason }); } });
    }
    // should-have-known: the questions to the person, against the packet the with arm was given (both arms judged against the same packet)
    let shouldHaveKnown = 0; const shkRows = [];
    if (questions.length && packet.trim()) {
        const rec = new Recording('compare-shk', { live: true });
        const prompt = `${SHK_HEAD}\n\nQuestions:\n${questions.map((q, i) => `[${i}] ${q}`).join('\n')}\n\nConstraints in force:\n${packet.slice(0, 20000)}\n`;
        try {
            const ans = await rec.get({ prompt, model: judge.DEFAULT_MODEL }, () => judge.ask(prompt), { what: `should-have-known ${pair.id} ${arm}-${n}`, meta: { model: judge.DEFAULT_MODEL, prompt: promptHash() } });
            const m = String(ans).match(/\[[\s\S]*\]/); const arr = m ? JSON.parse(m[0]) : [];
            arr.forEach((a, k) => { const i = Number.isInteger(a.i) ? a.i : k; if (a.answered && questions[i]) { shouldHaveKnown++; shkRows.push({ question: questions[i], by: a.by, reason: a.reason }); } });
        } catch (e) { log(`should-have-known judge failed for ${arm}-${n}: ${e.message}`); }
    }
    return { arm, n, exit: result.exit, error: result.error, violations, violationRows, idsCited: cited.size, cited: [...cited].sort(), questions, shouldHaveKnown, shkRows, blocks: blocks.filter(b => !b.error).length, blockIds: blocks.map(b => b.id), filesChanged: files.length, tokensIn: result.usage ? result.usage.in : null, tokensOut: result.usage ? result.usage.out : null, cost: result.usage ? result.usage.cost : null, turns: result.usage ? result.usage.turns : null, wallS: Math.round(result.wallMs / 1000), reverted: null, bounced: null };
}

const mean = xs => { const v = xs.filter(x => typeof x === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };
function summarise(runs) {
    const ok = runs.filter(r => !r.error && r.exit === 0);
    const s = { n: runs.length, ok: ok.length };
    for (const k of ['violations', 'idsCited', 'shouldHaveKnown', 'blocks', 'filesChanged', 'tokensIn', 'tokensOut', 'wallS', 'cost', 'turns', 'mark']) s[k] = mean(runs.map(r => r[k]));
    return s;
}

module.exports = { blocksIn, blocksWritten, readTranscript, scoreRun, summarise, promptHash };
