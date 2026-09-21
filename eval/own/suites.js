'use strict';
// Tier 1 (module:benchmarks, req:memory.eval-benchmarks, task:memory.eval-suite): five suites on the product's own
// history. Each takes the product and the truth, returns { scores, runs, meta } — scores as store:eval-results
// wants them ({ value, n, unit? }), runs as the per-item rows the misses are read from. Ground truth never comes
// from the thing measured; everything a score depends on is recorded with it; the graph is the one on disk now.
const path = require('path');
const { spawn } = require('child_process');
const { structuralCandidates } = require('../../lib/impact');
const judge = require('../../lib/judge');
const consolidate = require('../../lib/consolidate');
const { isCurrent } = require('../../lib/graph');
const { Recording } = require('../lib/record');
const { REPO, nodeText } = require('../lib/product');

const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const round = x => x === null ? null : Math.round(x * 1000) / 1000;
const recallAt = (ranked, expected, k) => expected.length ? expected.filter(id => ranked.slice(0, k).includes(id)).length / expected.length : null;

// packet: for every shipped requirement, its text as a request — the constraint packet (top-6 semantic seeds, then
// two hops over the governing verbs, lib/graph#constraints) against the plain vector top-k; recall of the governing
// set on the requirement's own edges. The requirement itself is hidden from the hits (the request stands in for it).
async function packet(P, truth, { semantic, k = 10, log = () => {} } = {}) {
    const g = P.graph; const runs = []; const sizes = [];
    for (const r of truth.requirements) {
        const { hits } = await semantic.hits(r.text, { limit: 30 });
        const ranked = hits.map(h => h.id).filter(id => id !== r.id);
        const seeds = ranked.slice(0, 6);
        const c = g.constraints(seeds);
        const inPacket = new Set([...Object.values(c.byKind).flat(), ...c.questions].map(n => n.id));
        sizes.push(inPacket.size);
        const pr = r.governing.filter(id => inPacket.has(id)).length / r.governing.length;
        const vr = recallAt(ranked, r.governing, k), vr20 = recallAt(ranked, r.governing, 20);
        const tr = r.tests.length ? recallAt(ranked, r.tests, k) : null;
        runs.push({ id: r.id, governing: r.governing, seeds, packetSize: inPacket.size, packetRecall: round(pr), vectorRecall: round(vr), vectorRecall20: round(vr20), testsRecall: round(tr), packetMissed: r.governing.filter(id => !inPacket.has(id)), vectorMissed: r.governing.filter(id => !ranked.slice(0, k).includes(id)) });
    }
    const n = runs.length;
    return {
        scores: {
            'packet.recall': { value: round(mean(runs.map(x => x.packetRecall))), n, note: 'share of the governing set (rules, gates, constraints, decisions on the requirement) in the constraint packet, macro over requirements' },
            [`vector.recall@${k}`]: { value: round(mean(runs.map(x => x.vectorRecall))), n, note: `the same set in the top-${k} semantic hits` },
            'vector.recall@20': { value: round(mean(runs.map(x => x.vectorRecall20))), n },
            'vector.tests-recall@10': { value: round(mean(runs.map(x => x.testsRecall).filter(x => x !== null))), n: runs.filter(x => x.testsRecall !== null).length, note: 'tests on verified-by in the top-10 (the packet never carries tests)', gated: false },
            'packet.size-median': { value: median(sizes), n, unit: 'count', gated: false },
        }, runs, meta: { seeds: 6, k, hops: 2 },
    };
}

// currency: for every supersession, the superseded node's title as the query; the current one's rank in the hits
// (superseded / retired / rejected hidden by construction — decision:memory.bitemporal) and how many ended nodes were served
async function currency(P, truth, { semantic } = {}) {
    const g = P.graph; const runs = [];
    for (const s of truth.supersessions) {
        const { hits, hidden } = await semantic.hits(s.oldTitle, { limit: 10 });
        const ids = hits.map(h => h.id);
        const rank = ids.indexOf(s.current) + 1 || null;
        const served = ids.filter(id => { const n = g.node(id); return n && (!isCurrent(n) || n.supersededBy); });
        runs.push({ old: s.old, current: s.current, query: s.oldTitle, rank, hidden, superseded: served, top: ids.slice(0, 5) });
    }
    const n = runs.length;
    return {
        scores: {
            'currency.mrr': { value: n ? round(mean(runs.map(r => r.rank ? 1 / r.rank : 0))) : null, n, note: 'mean reciprocal rank of the current node when the superseded title is the query' },
            'currency.superseded-served': { value: n ? runs.reduce((a, r) => a + r.superseded.length, 0) : null, n, unit: 'count', lowerIsBetter: true, note: 'ended nodes in the hits (should be 0)' },
        }, runs, meta: {},
    };
}

// contradictions: the verdict-pass benchmark that exists (test:verdict-bench) — the drift rows as positives, a fixed
// sample of same-kind neighbour pairs as negatives; the recording is its own (test/fixtures/verdict-bench.json)
function contradictions(P, truth, { live = false, negatives = 30 } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(REPO, 'test', 'verdict-bench.js'), '--root', path.relative(REPO, P.productDir), '--negatives', String(negatives), '--json'], { cwd: REPO, env: { ...process.env, WATERFALL_LIVE: live ? '1' : '' } });
        let out = '', err = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
        child.on('close', code => {
            if (code !== 0) return reject(new Error(`verdict-bench exited ${code}: ${err.slice(0, 300)}`));
            let r; try { r = JSON.parse(out); } catch (e) { return reject(new Error('verdict-bench printed no JSON: ' + out.slice(0, 200))); }
            const byKind = {}; for (const [k, v] of Object.entries(r.byConflict || {})) if (k !== 'missed') byKind[k] = v;
            resolve({
                scores: {
                    'contradictions.recall': { value: r.recall === null ? null : round(r.recall), n: r.judgedPositives, judge: true, note: `drift pairs judged contradicts; by conflict: ${Object.entries(byKind).map(([k, v]) => k + ' ' + v).join(', ') || 'none'}; ${r.positives - r.judgedPositives} unjudged` },
                    'contradictions.precision': { value: r.precision === null ? null : round(r.precision), n: r.judgedNegatives, judge: true, note: 'same-kind neighbour pairs left alone (precision proxy)' },
                }, runs: { misses: r.misses, falseAlarms: r.falseAlarms }, meta: { models: r.model, positives: r.positives, negatives: r.negatives, byConflict: r.byConflict, recording: 'test/fixtures/verdict-bench.json' },
            });
        });
    });
}

// impact: for every commit and session that changed typed blocks together, the candidate step on the first block —
// structural (lib/impact#structuralCandidates on today's graph), semantic (the hits for its text), blended (structure
// first, then the hits it missed, as the app runs it) — recall@5 / @10 of the co-changed blocks
async function impact(P, truth, { semantic } = {}) {
    const g = P.graph; const runs = [];
    const entries = [...truth.commits.map(c => ({ kind: 'commit', ref: c.sha, date: c.date, changed: c.changed })), ...truth.sessions.map(s => ({ kind: 'session', ref: s.session, date: s.date, changed: s.changed }))];
    for (const e of entries) {
        const [first, ...rest] = e.changed.filter(id => g.node(id) && g.node(id).defined);
        if (!first || !rest.length) continue;
        const structural = structuralCandidates(g, first, { hops: 2, min: 0.3 }).map(c => c.id);
        const { hits } = await semantic.hits(nodeText(g.node(first)), { limit: 20 });
        const sem = hits.map(h => h.id).filter(id => id !== first);
        const blended = [...structural, ...sem.filter(id => !structural.includes(id))];
        runs.push({ kind: e.kind, ref: e.ref, date: e.date, query: first, expected: rest, structural5: round(recallAt(structural, rest, 5)), structural10: round(recallAt(structural, rest, 10)), semantic5: round(recallAt(sem, rest, 5)), semantic10: round(recallAt(sem, rest, 10)), blended5: round(recallAt(blended, rest, 5)), blended10: round(recallAt(blended, rest, 10)), candidates: structural.length, missed10: rest.filter(id => !blended.slice(0, 10).includes(id)) });
    }
    const n = runs.length; const by = k => round(mean(runs.map(r => r[k])));
    return {
        scores: {
            'impact.structural.recall@5': { value: by('structural5'), n }, 'impact.structural.recall@10': { value: by('structural10'), n },
            'impact.semantic.recall@5': { value: by('semantic5'), n }, 'impact.semantic.recall@10': { value: by('semantic10'), n },
            'impact.blended.recall@5': { value: by('blended5'), n }, 'impact.blended.recall@10': { value: by('blended10'), n, note: 'structure first, then the semantic hits it missed — what the app runs' },
        }, runs, meta: { commits: truth.commits.length, sessions: truth.sessions.length, note: 'candidates on the graph as it is now, not at the commit' },
    };
}

// consolidation: for every session that wrote decision blocks, hide them and run the consolidation prompt over the
// transcript (lib/consolidate.js — the prompt the app runs); a hidden block is found when a candidate's title or text
// shares most of its words. One model call per session, recorded in eval/recorded/consolidation.json.
const words = s => new Set(String(s).toLowerCase().replace(/[`*_#>\[\]()"'.,:;!?/]/g, ' ').split(/\s+/).filter(w => w.length > 3));
function overlap(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size); }
async function consolidation(P, truth, { live = false, model = judge.DEFAULT_MODEL, threshold = 0.5, loose = 0.35, log = () => {} } = {}) {
    const rec = new Recording('consolidation', { live });
    const runs = []; let calls = 0;
    const { sessions } = require('../lib/product');
    const byId = new Map(sessions(P.productDir).map(s => [s.id, s]));
    for (const t of truth.consolidation) {
        const s = byId.get(t.session); if (!s || !Array.isArray(s.transcript)) { runs.push({ session: t.session, skipped: 'no transcript on this machine' }); continue; }
        const excerpt = consolidate.transcriptExcerpt(s.transcript);
        if (excerpt.length < 200) { runs.push({ session: t.session, skipped: 'transcript too short' }); continue; }
        const prompt = consolidate.consolidationPrompt(excerpt, t.written);
        // keyed on the session, the excerpt and the prompt version — not the prompt text, which carries the titles of
        // the written blocks and would drift with every edit of them
        const key = { session: t.session, model, prompt: consolidate.promptHash(), excerpt: require('crypto').createHash('sha1').update(excerpt).digest('hex').slice(0, 16) };
        let answer;
        try { answer = await rec.get(key, async () => { calls++; log(`consolidation: asking ${model} about session ${t.session} (${excerpt.length} chars)`); return judge.ask(prompt, { model }); }, { what: `consolidation of session ${t.session}`, meta: { model, prompt: consolidate.promptHash() } }); }
        catch (e) { if (e.name === 'MissingRecording') throw e; runs.push({ session: t.session, error: e.message }); continue; }
        const candidates = consolidate.parseCandidates(answer);
        const found = t.hidden.map(h => { const best = candidates.map(c => ({ c, score: Math.max(overlap(h.title, c.title), overlap(h.title + ' ' + h.text, c.title + ' ' + c.text)) })).sort((a, b) => b.score - a.score)[0]; return { id: h.id, title: h.title, found: !!best && best.score >= threshold, loose: !!best && best.score >= loose, match: best ? { title: best.c.title, score: round(best.score) } : null }; });
        runs.push({ session: t.session, hidden: t.hidden.length, candidates: candidates.length, found: found.filter(f => f.found).length, foundLoose: found.filter(f => f.loose).length, items: found });
    }
    const judged = runs.filter(r => r.hidden);
    const hiddenN = judged.reduce((a, r) => a + r.hidden, 0), foundN = judged.reduce((a, r) => a + r.found, 0), looseN = judged.reduce((a, r) => a + r.foundLoose, 0);
    return {
        scores: {
            'consolidation.recall': { value: hiddenN ? round(foundN / hiddenN) : null, n: hiddenN, judge: true, note: `${foundN} of ${hiddenN} hidden decision blocks over ${judged.length} sessions came back as candidates (word overlap ≥ ${threshold}); the misses a person marks real are the second set (eval/own/consolidation-labels.json)` },
            'consolidation.recall-loose': { value: hiddenN ? round(looseN / hiddenN) : null, n: hiddenN, judge: true, gated: false, note: `the same with word overlap ≥ ${loose} — the matcher's slack, not a second claim` },
            'consolidation.candidates-per-session': { value: judged.length ? round(mean(judged.map(r => r.candidates))) : null, n: judged.length, unit: 'count', gated: false },
        }, runs, meta: { model, prompt: consolidate.promptHash(), calls, recording: 'eval/recorded/consolidation.json', misses: judged.flatMap(r => r.items.filter(i => !i.found).map(i => ({ session: r.session, id: i.id, title: i.title }))) },
    };
}

module.exports = { packet, currency, contradictions, impact, consolidation, SUITES: ['packet', 'currency', 'contradictions', 'impact', 'consolidation'] };
