'use strict';
// Query layer over a built graph.json: get / neighbors / search / impact / packet / check / stats.
const fs = require('fs');
const path = require('path');
const { STRUCTURAL } = require('./parse');

class Graph {
    constructor(data) {
        this.data = data;
        this.byId = new Map(data.nodes.map(n => [n.id, n]));
        this.out = new Map(); this.inc = new Map();
        for (const e of data.edges) {
            if (!this.out.has(e.from)) this.out.set(e.from, []); this.out.get(e.from).push(e);
            if (!this.inc.has(e.to)) this.inc.set(e.to, []); this.inc.get(e.to).push(e);
        }
    }
    static load(file) { return new Graph(JSON.parse(fs.readFileSync(file, 'utf8'))); }
    node(id) { return this.byId.get(id); }
    resolve(idOrPrefix) {
        if (this.byId.has(idOrPrefix)) return [idOrPrefix];
        const q = idOrPrefix.toLowerCase();
        return this.data.nodes.filter(n => n.id.toLowerCase() === q || n.id.toLowerCase().endsWith(':' + q) || n.id.toLowerCase().endsWith('.' + q)).map(n => n.id);
    }
    deg(id) { return (this.out.get(id) || []).length + (this.inc.get(id) || []).length; }
    neighborhood(id, depth = 1, { structuralOnly = false, kinds = null } = {}) {
        const dist = new Map([[id, 0]]); let frontier = [id];
        for (let d = 1; d <= depth; d++) {
            const nx = [];
            for (const f of frontier) {
                for (const e of (this.out.get(f) || [])) if (!dist.has(e.to) && (!structuralOnly || STRUCTURAL.has(e.verb))) { dist.set(e.to, d); nx.push(e.to); }
                for (const e of (this.inc.get(f) || [])) if (!dist.has(e.from) && (!structuralOnly || STRUCTURAL.has(e.verb))) { dist.set(e.from, d); nx.push(e.from); }
            }
            frontier = nx;
        }
        if (kinds) for (const [k] of dist) if (k !== id && !kinds.includes(this.byId.get(k).kind)) dist.delete(k);
        return dist;
    }
    search(term, { limit = 25 } = {}) {
        const terms = term.toLowerCase().split(/\s+/).filter(Boolean);
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
        return this.data.nodes.map(n => ({ n, s: score(n) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
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
    packet(task, { budget = 6000, seeds = 6 } = {}) {
        const hits = this.search(task, { limit: seeds }).map(h => h.n.id);
        const rank = new Map();
        hits.forEach((h, i) => { for (const [id, d] of this.neighborhood(h, 2, { structuralOnly: true })) rank.set(id, Math.min(rank.get(id) ?? 99, d + i * 0.1)); });
        const ordered = [...rank.entries()].sort((a, b) => a[1] - b[1] || (this.byId.get(a[0]).kind === 'req' ? -1 : 1)).map(x => this.byId.get(x[0]));
        const parts = [`# Context packet: ${task}\n`, `seeds: ${hits.join(', ')}\n`];
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
    render(n, { brief = false } = {}) {
        const outE = this.out.get(n.id) || [], inE = this.inc.get(n.id) || [];
        const grp = (list, dir) => { const g = {}; for (const e of list) { if (brief && e.verb === 'mentions') continue; (g[e.verb] = g[e.verb] || []).push(dir === 'out' ? e.to : e.from); } return g; };
        const lines = [`## ${n.id}${n.status ? '  [' + n.status + ']' : ''}${n.defined ? '' : '  (referenced only)'}`];
        if (n.title && n.title !== n.id.split(':').slice(1).join(':')) lines.push(n.title);
        if (n.file) lines.push(`_${n.file}:${n.line}_`);
        if (n.body) lines.push('```yaml\n' + (brief ? n.body.split('\n').slice(0, 14).join('\n') : n.body) + '\n```');
        for (const [v, ids] of Object.entries(grp(outE, 'out'))) lines.push(`- ${v} → ${ids.join(', ')}`);
        for (const [v, ids] of Object.entries(grp(inE, 'in'))) lines.push(`- ← ${v} by ${ids.join(', ')}`);
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
                if ((n.status || 'shipped') === 'shipped' && !outV.includes('verified-by')) (strict ? errors : warnings).push(`${n.id}: shipped requirement has no verified-by test`);
            }
            if (n.kind === 'rule' && n.defined && !/^source:/m.test(n.body)) (n.form === 'prose' ? warnings : errors).push(`${n.id}: rule has no source`);
            if (n.defined && n.body) for (const src of sourcesOf(n)) {
                const p = src.split(/[:#]/)[0];
                if (!/^[A-Za-z0-9_./-]+\.[a-z]{1,5}$/.test(p)) continue;
                const roots = (this.data.modules.find(m => m.file === n.file) || {}).sourceRoots || ['.'];
                if (!roots.some(r => fs.existsSync(path.join(repo, r, p)))) (strict ? errors : warnings).push(`${n.id}: source path not found under [${roots.join(', ')}]: ${p}`);
            }
        }
        const contradictions = this.data.edges.filter(e => e.verb === 'contradicts').length;
        if (contradictions) warnings.push(`${contradictions} contradicts edge(s) — resolve before building on either side (see drift nodes)`);
        return { errors, warnings, ok: errors.length === 0 };
    }
}
function sourcesOf(n) {
    const out = [];
    for (const m of (n.body || '').matchAll(/^(?:source|sources|file|component|vm|verified-against)\s*:\s*(.+)$/gm)) {
        for (const part of m[1].split(/[;,]\s*(?=[A-Za-z])/)) { const t = part.trim().replace(/\s*\(.*$/, '').replace(/#.*$/, '').trim(); if (/[\/.]/.test(t) && !/\s/.test(t.split(':')[0])) out.push(t); }
    }
    return out;
}
module.exports = { Graph, sourcesOf };
