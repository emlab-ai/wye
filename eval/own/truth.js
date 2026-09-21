'use strict';
// `wye eval own --build-truth` (task:memory.eval-truth): the ground truth of tier 1, built once per graph sha from
// what is not the thing being measured — edges, supersessions, drift rows, git commits, session records — and
// written to eval/own/truth-<product>-<graphSha>.json so runs are cheap and repeatable. A run against a different
// graph rebuilds it.
//   requirements   every shipped requirement: its text as a request, the governing set on its edges, its tests
//   supersessions  (old, new) pairs from `supersedes` / superseded-by
//   commits        commits that changed two or more typed blocks in the documents together (git log)
//   sessions       sessions whose record credits two or more typed blocks (rule:task-artifacts)
//   consolidation  sessions with a transcript that wrote decision blocks — the blocks to hide
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseFiles } = require('../../lib/parse');
const { REPO, loadProduct, sessions, nodeText, isTyped } = require('../lib/product');

const GOVERNING = new Set(['rule', 'gate', 'constraint', 'decision']);
const GOVERNING_VERBS = new Set(['satisfied-by', 'governed-by', 'governs', 'gated-by', 'gates', 'affected-by', 'affects', 'constrained-by', 'rationale']);
const truthFile = (P) => path.join(__dirname, `truth-${P.product}-${P.graphSha}.json`);

function requirementTruth(g) {
    const out = [];
    for (const r of g.data.nodes.filter(n => n.kind === 'req' && n.defined && n.status === 'shipped')) {
        const governing = new Set(), tests = new Set();
        for (const e of g.out.get(r.id) || []) { const t = g.node(e.to); if (!t || !t.defined) continue; if (GOVERNING_VERBS.has(e.verb) && GOVERNING.has(t.kind)) governing.add(t.id); if (e.verb === 'verified-by' && (t.kind === 'test' || t.kind === 'ui-test')) tests.add(t.id); }
        for (const e of g.inc.get(r.id) || []) { const t = g.node(e.from); if (!t || !t.defined) continue; if (GOVERNING_VERBS.has(e.verb) && GOVERNING.has(t.kind)) governing.add(t.id); }
        if (!governing.size) continue;
        out.push({ id: r.id, text: nodeText(r), governing: [...governing].sort(), tests: [...tests].sort() });
    }
    return out;
}
function supersessionTruth(g) {
    const out = []; const seen = new Set();
    for (const n of g.data.nodes) {
        if (!n.defined) continue;
        const m = (n.body || '').match(/^supersedes:\s*(.+)$/m);
        const olds = m ? m[1].replace(/[\[\]]/g, '').split(/[,\s]+/).filter(x => x.includes(':')) : [];
        for (const old of olds) { const o = g.node(old); if (!o || !o.defined) continue; const k = old + '|' + n.id; if (seen.has(k)) continue; seen.add(k); out.push({ old: o.id, oldTitle: o.title || nodeText(o).slice(0, 120), current: n.id }); }
        if (n.supersededBy && g.node(n.supersededBy)) { const k = n.id + '|' + n.supersededBy; if (!seen.has(k)) { seen.add(k); out.push({ old: n.id, oldTitle: n.title || nodeText(n).slice(0, 120), current: n.supersededBy }); } }
    }
    return out;
}

// the typed nodes of a set of markdown files at a commit: parse them from a temp copy (parseFiles reads paths)
function nodesAt(sha, files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-eval-'));
    const paths = [];
    for (const f of files) { let s; try { s = execFileSync('git', ['show', `${sha}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { continue; } const p = path.join(dir, f.replace(/\//g, '__')); fs.writeFileSync(p, s); paths.push(p); }
    const cwd = process.cwd(); process.chdir(REPO);
    let data; try { data = paths.length ? parseFiles(paths) : { nodes: [] }; } finally { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); }
    const m = new Map();
    for (const n of data.nodes) if (isTyped(n) && !['block', 'verdict', 'plan', 'module'].includes(n.kind)) m.set(n.id, `${n.title}\n${n.body}`);
    return m;
}
// commits that changed ≥2 typed blocks together (the first changed block is the query, the rest the expected reach)
function commitTruth(P, { limit = 150, maxSet = 30, log = () => {} } = {}) {
    const docs = path.relative(REPO, path.join(P.productDir, 'projects'));
    let lines; try { lines = execFileSync('git', ['log', `-n${limit}`, '--format=%H%x09%ad%x09%s', '--date=short', '--name-only', '--', docs], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 }).split('\n'); } catch { return []; }
    const commits = []; let cur = null;
    for (const l of lines) { const m = l.match(/^([0-9a-f]{40})\t(\S+)\t(.*)$/); if (m) { cur = { sha: m[1], date: m[2], subject: m[3], files: [] }; commits.push(cur); } else if (cur && l.endsWith('.md') && l.startsWith(docs)) cur.files.push(l); }
    const out = [];
    for (const c of commits) {
        if (!c.files.length || c.files.length > 25) continue;
        const before = nodesAt(c.sha + '~1', c.files), after = nodesAt(c.sha, c.files);
        const changed = [...after.keys()].filter(id => before.get(id) !== after.get(id));
        if (changed.length < 2 || changed.length > maxSet) continue;
        out.push({ sha: c.sha.slice(0, 12), date: c.date, subject: c.subject.slice(0, 120), changed, added: changed.filter(id => !before.has(id)) });
        log(`commit ${c.sha.slice(0, 8)} ${c.date}: ${changed.length} blocks`);
    }
    return out;
}
function sessionTruth(P, { maxSet = 30 } = {}) {
    const g = P.graph; const out = [];
    for (const s of sessions(P.productDir)) {
        if (!['done', 'failed', 'cancelled'].includes(s.status)) continue;
        const blocks = (s.artifacts && s.artifacts.blocks || []).filter(b => ['added', 'changed'].includes(b.change) && !/^(block|plan|verdict|module):/.test(b.id) && g.node(b.id) && g.node(b.id).defined);
        const ids = [...new Set(blocks.map(b => b.id))];
        if (ids.length < 2 || ids.length > maxSet) continue;
        out.push({ session: s.id, date: String(s.createdAt).slice(0, 10), status: s.status, changed: ids, added: [...new Set(blocks.filter(b => b.change === 'added').map(b => b.id))] });
    }
    return out;
}
function consolidationTruth(P) {
    const g = P.graph; const out = [];
    for (const s of sessions(P.productDir)) {
        if (!Array.isArray(s.transcript) || s.transcript.length < 4 || !['done', 'failed', 'cancelled'].includes(s.status)) continue;   // a running session's transcript is not final
        const blocks = (s.artifacts && s.artifacts.blocks || []).filter(b => b.change === 'added');
        const hidden = [...new Set(blocks.filter(b => b.id.startsWith('decision:')).map(b => b.id))].filter(id => g.node(id) && g.node(id).defined).map(id => ({ id, title: g.node(id).title || nodeText(g.node(id)).slice(0, 120), text: nodeText(g.node(id)) }));
        if (!hidden.length) continue;
        const written = [...new Set(blocks.filter(b => !b.id.startsWith('decision:') && !/^(block|verdict):/.test(b.id)).map(b => b.id))].map(id => ({ id, title: (g.node(id) && g.node(id).title) || id }));
        out.push({ session: s.id, date: String(s.createdAt).slice(0, 10), events: s.transcript.length, hidden, written });
    }
    return out;
}

function buildTruth(P, { log = () => {} } = {}) {
    const g = P.graph;
    const truth = { product: P.product, graphSha: P.graphSha, gitSha: P.gitSha, builtAt: new Date().toISOString(), requirements: requirementTruth(g), supersessions: supersessionTruth(g), commits: commitTruth(P, { log }), sessions: sessionTruth(P), consolidation: consolidationTruth(P) };
    fs.writeFileSync(truthFile(P), JSON.stringify(truth, null, 1) + '\n');
    return truth;
}
// the truth for the current graph: read when its sha matches, rebuilt otherwise
function loadTruth(P, { log = () => {}, rebuild = false } = {}) {
    const f = truthFile(P);
    if (!rebuild && fs.existsSync(f)) { try { const t = JSON.parse(fs.readFileSync(f, 'utf8')); if (t.graphSha === P.graphSha) return t; } catch { /* rebuild */ } }
    log(`building the ground truth for graph ${P.graphSha}`);
    return buildTruth(P, { log });
}
function truthSummary(t) { return `requirements ${t.requirements.length} (governing sets), supersessions ${t.supersessions.length}, commits ${t.commits.length}, sessions ${t.sessions.length}, consolidation sessions ${t.consolidation.length}`; }

module.exports = { buildTruth, loadTruth, truthFile, truthSummary, GOVERNING };
