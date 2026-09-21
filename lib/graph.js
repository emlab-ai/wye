'use strict';
// frontmatter keys every page has regardless of its type — never 'undeclared'
const PAGE_KEYS = new Set(['node', 'type', 'title', 'icon', 'order', 'last-verified', 'sources', 'source-roots', 'owner', 'status']);
// Query layer over a built graph.json: get / neighbors / search / impact / packet / check / stats.
const fs = require('fs');
const path = require('path');
const { STRUCTURAL, idRegex, KINDS, cleanId } = require('./parse');

// Valid time (decision:memory.bitemporal, req:memory.current-by-construction): a node is current at `asOf` (today by
// default) unless its status ended it, a later node superseded it, or its `until` has passed / its `since` not come.
const ENDED = new Set(['superseded', 'rejected', 'retired']);
const today = () => new Date().toISOString().slice(0, 10);
function isCurrent(n, asOf) {
    if (asOf) { if (n.until && n.until <= asOf) return false; if (n.since && n.since > asOf) return false; return !ENDED.has(n.status) || !!(n.until && n.until > asOf); }
    if (ENDED.has(n.status) || n.supersededBy) return false;
    const now = today();
    if (n.until && n.until <= now) return false;
    if (n.since && n.since > now) return false;
    return true;
}

// the governing verbs the constraint packet follows (both directions), and the kinds it keeps
const PACKET_VERBS = new Set(['governs', 'governed-by', 'gated-by', 'gates', 'affects', 'affected-by', 'refines', 'refined-by', 'part-of', 'has', 'depends-on', 'depended-on-by', 'scope', 'constrained-by', 'about', 'lessons', 'applies-to', 'satisfied-by', 'satisfies', 'rationale', 'rationale-for']);
const PACKET_KINDS = new Set(['rule', 'constraint', 'gate', 'decision', 'goal', 'lesson', 'question']);
// the kinds the verdict pass classifies against each other
const VERDICT_KINDS = new Set(['decision', 'req', 'rule', 'constraint']);
// document structure is not a relation between two pieces of knowledge: the verdict walk does not pass through pages and blocks
const NOT_THROUGH = new Set(['module', 'pr', 'block', 'prop', 'field', 'type', 'product']);

class Graph {
    constructor(data) {
        this.data = data;
        this.byId = new Map(data.nodes.map(n => [n.id, n]));
        this.out = new Map(); this.inc = new Map();
        // generated inverse edges live in `out` only: their forward twin already sits in `inc`
        for (const e of data.edges) {
            if (!this.out.has(e.from)) this.out.set(e.from, []); this.out.get(e.from).push(e);
            if (e.generated) continue;
            if (!this.inc.has(e.to)) this.inc.set(e.to, []); this.inc.get(e.to).push(e);
        }
        this.types = new Map((data.types || []).map(t => [t.id, t]));
        this.inverses = data.inverses || {};
        this.idRe = idRegex(data.kinds || KINDS);
    }
    // type of a node's kind, and whether that kind is (transitively) the given type slug
    typeOf(id) { return this.types.get('type:' + id.split(':')[0]); }
    isA(id, typeSlug) { const t = this.typeOf(id); return typeSlug === 'node' || !!(t && t.chain.includes('type:' + typeSlug)); }
    idsIn(text) { const out = []; let m; this.idRe.lastIndex = 0; while ((m = this.idRe.exec(text))) out.push(cleanId(m[0])); return out; }
    static load(file) { return new Graph(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    node(id) { return this.byId.get(id); }
    resolve(idOrPrefix) {
        if (this.byId.has(idOrPrefix)) return [idOrPrefix];
        const q = idOrPrefix.toLowerCase();
        return this.data.nodes.filter(n => n.id.toLowerCase() === q || n.id.toLowerCase().endsWith(':' + q) || n.id.toLowerCase().endsWith('.' + q)).map(n => n.id);
    }
    deg(id) { return (this.out.get(id) || []).length + (this.inc.get(id) || []).length; }
    // `notThrough`: kinds the walk does not pass through (a document's has → every card would make everything two hops away)
    neighborhood(id, depth = 1, { structuralOnly = false, kinds = null, notThrough = null } = {}) {
        const dist = new Map([[id, 0]]); let frontier = [id];
        const blocked = nid => notThrough && this.byId.has(nid) && notThrough.has(this.byId.get(nid).kind);
        for (let d = 1; d <= depth; d++) {
            const nx = [];
            for (const f of frontier) {
                for (const e of (this.out.get(f) || [])) if (!dist.has(e.to) && (!structuralOnly || STRUCTURAL.has(e.verb)) && !blocked(e.to)) { dist.set(e.to, d); nx.push(e.to); }
                for (const e of (this.inc.get(f) || [])) if (!dist.has(e.from) && (!structuralOnly || STRUCTURAL.has(e.verb)) && !blocked(e.from)) { dist.set(e.from, d); nx.push(e.from); }
            }
            frontier = nx;
        }
        if (kinds) for (const [k] of dist) if (k !== id && !kinds.includes(this.byId.get(k).kind)) dist.delete(k);
        return dist;
    }
    // ended nodes (isCurrent) and archived ones (a plan that is done — decision:memory.forgetting) leave search and the
    // packet unless `all` or `asOf` asks for them; `hidden` counts them
    current(nodes, { all = false, asOf = null } = {}) {
        if (all) return { nodes, hidden: 0 };
        const out = nodes.filter(n => isCurrent(n, asOf) && !n.archived);
        return { nodes: out, hidden: nodes.length - out.length };
    }
    search(term, { limit = 25, all = false, asOf = null } = {}) {
        const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
        // anonymous blocks exist for addressing and links; they only surface when the search names them
        const blocks = terms.some(t => t.startsWith('block:'));
        const score = n => {
            let s = 0;
            const id = n.id.toLowerCase(), title = (n.title || '').toLowerCase(), body = (n.body || '').toLowerCase();
            for (const t of terms) {
                if (id.includes(t)) s += 5;
                if (title.includes(t)) s += 3;
                if (body.includes(t)) s += 1 + Math.min(3, (body.split(t).length - 1) * 0.5);
            }
            if (n.kind === 'req') s *= 1.5;
            if (!n.defined) s *= 0.5;
            return s;
        };
        const scored = this.data.nodes.filter(n => blocks || n.kind !== 'block').map(n => ({ n, s: score(n) })).filter(x => x.s > 0);
        const cur = this.current(scored.map(x => x.n), { all, asOf }); const keep = new Set(cur.nodes);
        const hits = scored.filter(x => keep.has(x.n)).sort((a, b) => b.s - a.s).slice(0, limit);
        hits.hidden = cur.hidden;
        return hits;
    }
    // Everything that depends on `id`: follow INCOMING structural edges outward (things that point at it), depth 3.
    impact(id, depth = 3) {
        const dist = new Map([[id, 0]]); let frontier = [id];
        for (let d = 1; d <= depth; d++) {
            const nx = [];
            for (const f of frontier) {
                for (const e of (this.inc.get(f) || [])) if (!dist.has(e.from) && STRUCTURAL.has(e.verb)) { dist.set(e.from, d); nx.push(e.from); }
                // an entity's fields and a page's actions are part of it: follow outgoing has/has-action too
                for (const e of (this.out.get(f) || [])) if (!dist.has(e.to) && (e.verb === 'has' || e.verb === 'has-action') && d === 1) { dist.set(e.to, d); nx.push(e.to); }
            }
            frontier = nx;
        }
        dist.delete(id);
        return dist;
    }
    packet(task, { budget = 6000, seeds = 6, all = false, asOf = null } = {}) {
        const hits = this.search(task, { limit: seeds, all, asOf }).map(h => h.n.id);
        const rank = new Map();
        hits.forEach((h, i) => { for (const [id, d] of this.neighborhood(h, 2, { structuralOnly: true })) rank.set(id, Math.min(rank.get(id) ?? 99, d + i * 0.1)); });
        const cur = this.current([...rank.keys()].map(id => this.byId.get(id)), { all, asOf });
        const ordered = cur.nodes.sort((a, b) => rank.get(a.id) - rank.get(b.id) || (a.kind === 'req' ? -1 : 1));
        const parts = [`# Context packet: ${task}\n`, `seeds: ${hits.join(', ')}${cur.hidden ? `  (${cur.hidden} superseded / retired / archived hidden — --all shows them)` : ''}\n`];
        const sources = new Set(); let used = parts.join('').length;
        for (const n of ordered) {
            const block = this.render(n, { brief: true });
            if (used + block.length > budget) break;
            parts.push(block); used += block.length;
            for (const s of sourcesOf(n)) sources.add(s);
        }
        parts.push(`\n## Files cited by these nodes\n${[...sources].sort().map(s => '- ' + s).join('\n')}\n`);
        return parts.join('\n');
    }
    // The constraint packet (decision:memory.constraint-packet, req:memory.intake-packet): everything that governs a
    // request, computed structurally — from the seeds (the refs a person attached plus the search hits for the text),
    // every rule, constraint, gate, lesson, goal and approved decision within `hops` over the governing verbs, plus
    // every open question on those nodes; ended nodes out by construction (isCurrent). Complete, not top-k.
    constraints(seedIds, { hops = 2, all = false, asOf = null } = {}) {
        const seeds = seedIds.filter(id => this.byId.has(id));
        const dist = new Map(seeds.map(id => [id, 0])); let frontier = seeds;
        for (let d = 1; d <= hops; d++) {
            const nx = [];
            for (const f of frontier) {
                for (const e of (this.out.get(f) || [])) if (PACKET_VERBS.has(e.verb) && !dist.has(e.to)) { dist.set(e.to, d); nx.push(e.to); }
                for (const e of (this.inc.get(f) || [])) if (PACKET_VERBS.has(e.verb) && !dist.has(e.from)) { dist.set(e.from, d); nx.push(e.from); }
            }
            frontier = nx;
        }
        // in force: a decision, constraint or lesson that is not proposed / rejected; rules and gates whatever their status (shown with it)
        const keep = n => n.defined && PACKET_KINDS.has(n.kind) && (!['decision', 'constraint', 'lesson'].includes(n.kind) || !['proposed', 'draft', 'rejected', 'superseded', 'question'].includes(n.status));
        const reached = [...dist.keys()].map(id => this.byId.get(id)).filter(keep);
        // a constraint with no scope binds everything: in the packet whether or not the traversal reached it
        for (const n of this.data.nodes) if (n.kind === 'constraint' && n.defined && n.status === 'approved' && !dist.has(n.id) && !(this.out.get(n.id) || []).some(e => e.verb === 'scope')) { dist.set(n.id, hops); reached.push(n); }
        const cur = this.current(reached, { all, asOf });
        const kept = new Set(cur.nodes.map(n => n.id));
        const open = n => n.kind === 'question' && n.defined && ['', 'open', 'question'].includes(n.status);
        // open questions on the seeds, on what was reached and on what is kept
        const questions = this.data.nodes.filter(n => open(n) && (dist.has(n.id) || (this.out.get(n.id) || []).some(e => dist.has(e.to) || kept.has(e.to)) || (this.inc.get(n.id) || []).some(e => dist.has(e.from) || kept.has(e.from))));
        const byKind = {};
        for (const n of cur.nodes) if (n.kind !== 'question') (byKind[n.kind] = byKind[n.kind] || []).push(n);
        for (const list of Object.values(byKind)) list.sort((a, b) => dist.get(a.id) - dist.get(b.id) || a.id.localeCompare(b.id));
        return { seeds, byKind, questions, hidden: cur.hidden, hops: dist };
    }
    // The pairs the verdict pass classifies for a new or changed node (decision:memory.write-time-verdict): every
    // decision, requirement, rule or constraint within two hops (nearest first, `limit` at most) plus every approved
    // constraint; ended and archived neighbours skipped. Pairs are { a: neighbour, b: the node } — B relates to A.
    verdictPairs(ids, { limit = 12 } = {}) {
        const { nodeText } = require('./judge');
        const asJudged = n => ({ id: n.id, kind: n.kind, status: n.status, date: (n.body || '').match(/^date:\s*(\S+)/m)?.[1] || n.since || '', text: nodeText(n) });
        const pairs = []; const seen = new Set();
        for (const id of ids) {
            const b = this.byId.get(id); if (!b || !b.defined || !VERDICT_KINDS.has(b.kind) || !isCurrent(b) || b.archived) continue;
            const near = [...this.neighborhood(id, 2, { notThrough: NOT_THROUGH })].filter(([nid]) => nid !== id).sort((x, y) => x[1] - y[1]).map(([nid]) => this.byId.get(nid)).filter(n => n && n.defined && VERDICT_KINDS.has(n.kind) && isCurrent(n) && !n.archived && !n.id.startsWith('verdict:'));
            const constitution = this.data.nodes.filter(n => n.kind === 'constraint' && n.defined && n.status === 'approved' && isCurrent(n));
            const others = [...new Set(near.slice(0, limit).concat(constitution))].filter(n => n.id !== id);
            for (const a of others) { const k = a.id + '|' + id; if (seen.has(k)) continue; seen.add(k); pairs.push({ a: asJudged(a), b: asJudged(b) }); }
        }
        return pairs;
    }
    // Every same-kind pair that shares a neighbour (wye check --deep — Karpathy's lint --deep): the pairs a whole-graph
    // verdict pass would judge, nearest first, capped
    deepPairs({ limit = 400 } = {}) {
        const { nodeText } = require('./judge');
        const asJudged = n => ({ id: n.id, kind: n.kind, status: n.status, date: (n.body || '').match(/^date:\s*(\S+)/m)?.[1] || '', text: nodeText(n) });
        const judged = this.data.nodes.filter(n => n.defined && VERDICT_KINDS.has(n.kind) && isCurrent(n) && !n.archived);
        const pairs = new Map();
        for (const n of judged) {
            for (const [nid, d] of this.neighborhood(n.id, 1, { notThrough: NOT_THROUGH })) {
                if (nid === n.id) continue;
                for (const [mid] of this.neighborhood(nid, 1, { notThrough: NOT_THROUGH })) {
                    const m = this.byId.get(mid); if (!m || mid === n.id || mid === nid || !m.defined || !VERDICT_KINDS.has(m.kind) || !isCurrent(m) || m.archived) continue;
                    if (m.kind !== n.kind) continue;
                    const [x, y] = [n, m].sort((p, q) => p.id.localeCompare(q.id)); const k = x.id + '|' + y.id;
                    if (!pairs.has(k)) pairs.set(k, { a: asJudged(x), b: asJudged(y), via: nid, d });
                }
            }
        }
        return [...pairs.values()].slice(0, limit);
    }
    // one line per node: id, status, statement / title, and the source of a rule
    constraintLine(n) {
        const get = k => { const m = (n.body || '').match(new RegExp('^' + k + ':\\s*(.*)$', 'm')); if (!m) return ''; let v = m[1].trim(); if (/^[>|]-?$/.test(v)) { v = ''; for (const l of n.body.split(new RegExp('^' + k + ':.*$', 'm'))[1].split('\n').slice(1)) { if (!/^\s+\S/.test(l)) break; v += ' ' + l.trim(); } } return v.replace(/^["']|["']$/g, '').trim(); };
        const text = (n.kind === 'question' ? get('q') : n.kind === 'goal' || n.kind === 'decision' ? (n.title || get('title')) : get('statement') || get('text') || n.title) || n.title;
        const src = n.kind === 'rule' ? get('source') : '';
        return `- ${n.id}${n.status ? ' [' + n.status + ']' : ''} — ${text.replace(/\s+/g, ' ').slice(0, 220)}${src ? ` (source: ${src.split(/;\s*/)[0].slice(0, 80)})` : ''}`;
    }
    renderConstraints(c, { budget = 10000 } = {}) {
        const order = ['constraint', 'rule', 'gate', 'decision', 'goal', 'lesson', 'question'];
        const label = { constraint: 'Constraints (constitution)', rule: 'Rules', gate: 'Gates', decision: 'Decisions (approved)', goal: 'Goals', lesson: 'Lessons', question: 'Open questions' };
        const groups = Object.entries(c.byKind).concat(c.questions.length ? [['question', c.questions]] : []).sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
        const total = groups.reduce((a, [, l]) => a + l.length, 0);
        if (!total) return `_No rules, constraints, decisions or goals govern this yet (seeds: ${c.seeds.join(', ') || 'none'})._`;
        const head = `_Computed from the seeds (${c.seeds.join(', ')}) over governs, gated-by, affects, refines, part-of, depends-on and scope, two hops; complete, not a top-k. ${c.hidden ? c.hidden + ' superseded / retired / archived hidden. ' : ''}Cite these ids; when the request cannot respect one, say so with a question: block next to it._`;
        // the budget is shared: every kind gets an equal share first (nearest nodes first), then what is left fills in kind order
        const lines = groups.map(([k, l]) => ({ k, n: l.length, lines: l.map(n => this.constraintLine(n)), shown: 0 }));
        let left = budget - head.length; const share = Math.floor(left / lines.length);
        for (const g of lines) { let used = 0; while (g.shown < g.lines.length && used + g.lines[g.shown].length <= share) { used += g.lines[g.shown].length; g.shown++; } left -= used; }
        for (const g of lines) while (g.shown < g.lines.length && g.lines[g.shown].length <= left) { left -= g.lines[g.shown].length; g.shown++; }
        const parts = [head]; let cut = 0;
        for (const g of lines) { parts.push([`\n### ${label[g.k] || g.k} (${g.n})`].concat(g.lines.slice(0, g.shown)).join('\n')); cut += g.n - g.shown; }
        if (cut) parts.push(`\n_… ${cut} more not shown (budget); \`wf packet --for "<text>" --budget 30000\` lists them._`);
        return parts.join('\n');
    }
    render(n, { brief = false } = {}) {
        const outE = this.out.get(n.id) || [], inE = this.inc.get(n.id) || [];
        const grp = (list, dir) => { const g = {}; for (const e of list) { if (brief && e.verb === 'mentions') continue; const other = dir === 'out' ? e.to : e.from; if (brief && other.startsWith('block:')) continue; (g[e.verb] = g[e.verb] || []).push(other); } return g; };
        const lines = [`## ${n.id}${n.status ? '  [' + n.status + ']' : ''}${n.defined ? '' : '  (referenced only)'}${n.supersededBy ? '  superseded by ' + n.supersededBy + (n.until ? ' on ' + n.until : '') : n.until ? '  until ' + n.until : ''}`];
        if (n.title && n.title !== n.id.split(':').slice(1).join(':')) lines.push(n.title);
        if (n.file) lines.push(`_${n.file}:${n.line}_`);
        // a product-declared type: its chain, so an agent knows a manager is an employee is a person
        const t = this.typeOf(n.id);
        if (t && t.file && !t.file.startsWith('schema/') && n.kind !== 'type') lines.push(`type: ${t.chain.slice(1).reverse().map(x => x.slice(5)).join(' < ')}`);
        if (n.body) lines.push('```yaml\n' + (brief ? n.body.split('\n').slice(0, 14).join('\n') : n.body) + '\n```');
        for (const [v, ids] of Object.entries(grp(outE, 'out'))) lines.push(`- ${v} → ${ids.join(', ')}`);
        // incoming edges whose verb has an inverse are already listed above as the generated inverse
        for (const [v, ids] of Object.entries(grp(inE.filter(e => !this.inverses[e.verb]), 'in'))) lines.push(`- ← ${v} by ${ids.join(', ')}`);
        return lines.join('\n') + '\n';
    }
    stats() {
        const byKind = {};
        for (const n of this.data.nodes) { byKind[n.kind] = byKind[n.kind] || { defined: 0, stub: 0 }; byKind[n.kind][n.defined ? 'defined' : 'stub']++; }
        const byVerb = {}; for (const e of this.data.edges) byVerb[e.verb] = (byVerb[e.verb] || 0) + 1;
        const reqs = this.data.nodes.filter(n => n.kind === 'req'); const st = {};
        for (const r of reqs) st[r.status || 'shipped'] = (st[r.status || 'shipped'] || 0) + 1;
        return { nodes: this.data.nodes.length, edges: this.data.edges.length, byKind, byVerb, reqStatus: st, modules: this.data.modules };
    }
    check({ repo = process.cwd(), strict = false } = {}) {
        const errors = [], warnings = [];
        const stubs = this.data.nodes.filter(n => !n.defined);
        const stubByKind = {}; for (const s of stubs) (stubByKind[s.kind] = stubByKind[s.kind] || []).push(s.id);
        for (const [k, ids] of Object.entries(stubByKind)) {
            // tests, ui-tests and other modules are expected to be referenced without a description
            (['rule', 'req'].includes(k) ? errors : warnings).push(`${ids.length} ${k} node(s) referenced but never described: ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ', …' : ''}`);
        }
        for (const n of this.data.nodes) {
            const outV = (this.out.get(n.id) || []).map(e => e.verb);
            const prose = n.form === 'prose'; // prose nodes are product knowledge, not code contracts: lenient
            if (n.kind === 'req' && n.defined) {
                if (!outV.includes('satisfied-by') && !outV.includes('see') && !['proposed', 'question'].includes(n.status)) (prose ? warnings : errors).push(`${n.id}: requirement has no satisfied-by (status ${n.status || 'shipped'})`);
            }
            // shapes (decision:memory.shapes): the type's own checks — "shipped requires verified-by", "* requires source as
            // error" — in the type's words; a prose node only ever warns; --strict makes every shape an error
            const t = n.defined && n.body && !['field', 'prop', 'block'].includes(n.kind) ? this.typeOf(n.id) : null;
            if (t && t.shapes) {
                const status = n.status || (n.kind === 'req' ? 'shipped' : '');
                const have = new Set([...bodyProps(n.body)].filter(([, v]) => v).map(([k]) => k).concat(outV));   // an empty `verified-by: []` is not there
                for (const sh of t.shapes) {
                    if (sh.all) {
                        if (sh.status !== '*' && sh.status !== status) continue;
                        const missing = sh.all.filter(alts => !alts.some(a => have.has(a)));
                        if (missing.length) ((strict || sh.level === 'error') && !prose ? errors : warnings).push(`${n.id}: ${sh.status === '*' ? kindName(n) : status + ' ' + kindName(n)} has no ${missing.map(a => a.join(' or ')).join(', ')} (${sh.from.slice(5)}: ${sh.text})`);
                    } else if (sh.prop) {
                        for (const e of (this.out.get(n.id) || [])) if (e.verb === sh.prop) { const tn = this.byId.get(e.to); if (tn && tn.defined && (tn.status || '') !== sh.refStatus) (strict && !prose ? errors : warnings).push(`${n.id}: ${sh.prop} → ${e.to} is ${tn.status || 'without status'}, not ${sh.refStatus} (${sh.from.slice(5)}: ${sh.text})`); }
                    }
                }
            }
            if (n.defined && n.body) for (const src of sourcesOf(n)) {
                const p = src.split(/[:#]/)[0];
                if (!/^[A-Za-z0-9_./-]+\.[a-z]{1,5}$/.test(p)) continue;
                const roots = (this.data.modules.find(m => m.file === n.file) || {}).sourceRoots || ['.'];
                if (!roots.some(r => fs.existsSync(path.join(repo, r, p)))) (strict ? errors : warnings).push(`${n.id}: source path not found under [${roots.join(', ')}]: ${p}`);
            }
        }
        // ontology: type declarations (from the parser) and instances against their type's effective properties
        for (const pr of this.data.problems || []) (pr.level === 'error' ? errors : warnings).push(pr.msg);
        for (const n of this.data.nodes) {
            if (!n.defined || !n.body || ['field', 'prop', 'drift', 'block', 'type'].includes(n.kind)) continue;
            const t = this.typeOf(n.id); if (!t) continue;
            const have = bodyProps(n.body);
            for (const p of t.props) {
                if (!have.has(p.name)) { if (p.required) warnings.push(`${n.id}: required property ${p.name} missing (${p.from})`); continue; }
                const v = have.get(p.name);
                if (p.ref) {
                    const ids = this.idsIn(v);
                    if (!ids.length && v.trim()) { if (!t.open) warnings.push(`${n.id}: ${p.name} "${v.trim().slice(0, 40)}" is not a ${p.many ? 'list of' : 'ref to'} ${p.ref}`); continue; }
                    for (const id of ids) if (!this.isA(id, p.ref)) errors.push(`${n.id}: ${p.name} → ${id} is not a ${p.ref}`);
                } else if (v.trim() && !valueOk(p, v.trim())) warnings.push(`${n.id}: ${p.name} "${v.trim().slice(0, 40)}" is not a ${p.type}`);
            }
            // a page's frontmatter carries the page bookkeeping keys on top of the type's properties (rule:page-node-line)
            const isPage = n.line === 1 && this.data.modules.some(m => m.id === n.id);
            if (!t.open) for (const k of have.keys()) if (!t.props.some(p => p.name === k) && !['id', 'text', 'title', 'status', 'session'].includes(k) && !(isPage && PAGE_KEYS.has(k))) warnings.push(`${n.id}: undeclared property ${k} (type ${t.id})`);
        }
        const contradictions = this.data.edges.filter(e => e.verb === 'contradicts').length;
        if (contradictions) warnings.push(`${contradictions} contradicts edge(s) — resolve before building on either side (see drift nodes)`);
        return { errors, warnings, ok: errors.length === 0 };
    }
}
const kindName = n => ({ req: 'requirement' }[n.kind] || n.kind);
// top-level `key: value` pairs of a node body; a `>`/`|` or nested value is the indented lines joined
function bodyProps(body) {
    const out = new Map(); let key = null;
    for (const l of body.split('\n')) {
        const m = l.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/);
        if (m && !/^\s/.test(l)) { key = m[1]; out.set(key, (m[2] || '').replace(/\s+#.*$/, '').replace(/^[>|]-?\s*$/, '').replace(/^\[\s*\]$/, '').trim()); continue; }
        if (key && /^\s+\S/.test(l)) out.set(key, (out.get(key) + ' ' + l.trim()).trim());
    }
    return out;
}
function valueOk(p, v) {
    v = v.replace(/^["']|["']$/g, '');
    switch (p.type) {
        case 'number': return /^-?\d+(\.\d+)?%?$/.test(v);
        case 'date': return /^\d{4}-\d{2}-\d{2}/.test(v);
        case 'month': return /^\d{4}-\d{2}$/.test(v);
        case 'bool': return /^(true|false|yes|no)$/i.test(v);
        default: return p.enum ? (p.many ? v.replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean).every(x => p.enum.includes(x)) : p.enum.includes(v)) : true;
    }
}
function sourcesOf(n) {
    const out = [];
    for (const m of (n.body || '').matchAll(/^(?:source|sources|file|component|vm|verified-against)\s*:\s*(.+)$/gm)) {
        for (const part of m[1].split(/[;,]\s*(?=[A-Za-z])/)) { const t = part.trim().replace(/\s*\(.*$/, '').replace(/#.*$/, '').trim(); if (/[\/.]/.test(t) && !/\s/.test(t.split(':')[0])) out.push(t); }
    }
    return out;
}
module.exports = { Graph, sourcesOf, isCurrent, ENDED, PACKET_VERBS, PACKET_KINDS, VERDICT_KINDS };
