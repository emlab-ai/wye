#!/usr/bin/env node
'use strict';
// wye's graph commands (bin/wye.js forwards `wye build`, `wye check`, `wye get`… here; `wye graph <cmd>` for the rest)
// — query and maintain a product context graph stored as markdown, no app needed.
//   wye build [files...]           parse docs/context-graph/*.md → _build/graph.json + data.js
//   wye site  [files...] [--out d] build the phone-friendly viewer (index.html + data.js) ready to publish
//   wye get <id>                   one node with all edges
//   wye neighbors <id> [-d N] [--kinds a,b] [--structural]
//   wye search <terms...> [--all | --as-of <date>]   (superseded, rejected and retired nodes are hidden by default)
//   wye impact <id> [--explain] [--semantic] [--after "<new text>"] [--json]
//        everything that depends on the node; --explain: the candidates an edit reaches with the path and weight
//        (req:exec.impact-set); --semantic adds the search hits structure did not reach; --after judges each
//        candidate against the change through the model (unaffected | update | rework | contradicts | ask)
//   wye packet --task "<text>" [--budget N]   a token-budgeted slice for an agent
//   wye constraints --task "<text>" [--ref id,id] [--budget N] [--json]   what governs a request: every rule, constraint, gate,
//                                  approved decision, goal and open question within two hops of the seeds, complete
//   wye check [--repo dir] [--strict] [--deep]   lint the graph; exit 1 on errors; --deep judges same-kind pairs for contradictions
//   wye verdicts <id...> [--json]  classify a node against its neighbours (duplicate | refines | consistent | contradicts)
//   wye stats
//   wye reqs [--status s]          requirement tree with status
const fs = require('fs');
const path = require('path');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, def) => { const i = argv.indexOf('--' + name); if (i === -1) return def; const v = argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('-') && !(arr[i - 1] && arr[i - 1].startsWith('--') && !['--strict', '--structural', '--json', '--all', '--deep', '--explain', '--semantic'].includes(arr[i - 1])));
const ROOT = opt('root', process.env.CTX_ROOT || (require('fs').existsSync('data/products/wye') ? 'data/products/wye' : 'docs/context-graph'));
const BUILD = path.join(ROOT, '_build');
const graphFile = opt('graph', path.join(BUILD, 'graph.json'));

// Every .md under the root (a product folder: projects/*/docs/*.md, or a flat docs folder), skipping _build and
// files or folders that start with "_" (product and project metadata, generated output).
function findDocs(files) {
    if (files.length) return files.map(f => path.resolve(f));
    if (!fs.existsSync(ROOT)) die(`no ${ROOT}; pass files explicitly or --root`);
    const out = [];
    const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('_') || e.name === 'node_modules' || e.name === 'inbox') continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) out.push(path.resolve(p)); } };
    walk(ROOT);
    return out.sort();
}
function die(msg) { console.error('wye: ' + msg); process.exit(2); }
function load() { if (!fs.existsSync(graphFile)) die(`no ${graphFile} — run \`wye build\` first`); return Graph.load(graphFile); }
function resolveOne(g, id) { const r = g.resolve(id); if (!r.length) die(`unknown node: ${id}`); if (r.length > 1) die(`ambiguous: ${r.join(', ')}`); return r[0]; }
function writeBuild(graph, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'graph.json'), JSON.stringify(graph, null, 1));
    const mdBundle = {}; for (const f of graph.files) mdBundle[f] = fs.readFileSync(path.resolve(f), 'utf8');
    fs.writeFileSync(path.join(outDir, 'data.js'), 'window.GRAPH=' + JSON.stringify(graph) + ';\nwindow.MD_FILES=' + JSON.stringify(mdBundle) + ';\n');
}

switch (cmd) {
    case 'build': {
        // one build path with the app (lib/build): graph.json only — the viewer's data.js is `ctx site`'s
        const { graph, files } = require('../lib/build').buildGraph(ROOT, { files: positional.length ? findDocs(positional) : undefined });
        const g = new Graph(graph), s = g.stats();
        console.log(`built ${BUILD}/graph.json from ${files.length} file(s): ${s.nodes} nodes, ${s.edges} edges`);
        console.log('by kind: ' + Object.entries(s.byKind).map(([k, v]) => `${k} ${v.defined}${v.stub ? '+' + v.stub + ' stub' : ''}`).join(' · '));
        break;
    }
    case 'site': {
        const files = findDocs(positional);
        const graph = parseFiles(files);
        // anonymous block nodes exist for addressing; the phone viewer does not need them (--blocks keeps them)
        if (!argv.includes('--blocks')) { const drop = new Set(graph.nodes.filter(n => n.kind === 'block').map(n => n.id)); graph.nodes = graph.nodes.filter(n => !drop.has(n.id)); graph.edges = graph.edges.filter(e => !drop.has(e.from) && !drop.has(e.to)); }
        const out = path.resolve(opt('out', path.join(BUILD, 'site')));
        writeBuild(graph, out);
        fs.copyFileSync(path.join(__dirname, '..', 'viewer', 'index.html'), path.join(out, 'index.html'));
        console.log(`site built in ${out}\n  index.html  data.js  graph.json\npublish with the Artifact tool: file_path=${path.join(out, 'index.html')} files={"data.js": "${path.join(out, 'data.js')}"}`);
        break;
    }
    case 'get': {
        const g = load(); const id = resolveOne(g, positional[0] || die('get <id>'));
        console.log(g.render(g.node(id)));
        break;
    }
    case 'neighbors': {
        const g = load(); const id = resolveOne(g, positional[0] || die('neighbors <id>'));
        const depth = +opt('d', 1); const kinds = opt('kinds') ? String(opt('kinds')).split(',') : null;
        const dist = g.neighborhood(id, depth, { structuralOnly: argv.includes('--structural'), kinds });
        console.log(g.render(g.node(id)));
        for (const [nid, d] of [...dist].sort((a, b) => a[1] - b[1])) if (nid !== id) console.log(`${'  '.repeat(d)}${nid}${g.node(nid).status ? ' [' + g.node(nid).status + ']' : ''} — ${g.node(nid).title}`);
        break;
    }
    case 'search': {
        const g = load(); const term = positional.join(' ') || die('search <terms>');
        const hits = g.search(term, { limit: +opt('limit', 25), all: argv.includes('--all'), asOf: opt('as-of', null) });
        for (const { n, s } of hits) console.log(`${s.toFixed(1).padStart(5)}  ${n.id}${n.status ? ' [' + n.status + ']' : ''} — ${n.title}`);
        if (hits.hidden) console.log(`(${hits.hidden} superseded / retired / archived hidden — --all or --as-of <date> shows them)`);
        break;
    }
    case 'impact': {
        const g = load(); const id = resolveOne(g, positional[0] || die('impact <id>'));
        if (opt('explain') || opt('semantic') || opt('after')) {
            // the impact set of an edit (req:exec.impact-for-agents): structural candidates with paths, the text
            // hits structure missed, and — with --after — the model's verdict per candidate
            const impact = require('../lib/impact');
            const n = g.node(id); const { nodeText } = require('../lib/judge');
            const cands = impact.structuralCandidates(g, id, { hops: +opt('d', 2) });
            if (opt('semantic')) { const have = new Set(cands.map(c => c.id)); for (const h of g.search(opt('after') || nodeText(n), { limit: 10 })) if (!have.has(h.n.id) && h.n.id !== id && h.n.kind !== 'block') cands.push({ id: h.n.id, kind: h.n.kind, title: h.n.title, status: h.n.status, distance: 0, weight: 0, path: '', via: 'text', text: nodeText(h.n) }); }
            const print = verdicts => {
                if (opt('json')) return console.log(JSON.stringify({ id, candidates: cands.map((c, i) => ({ ...c, verdict: verdicts ? verdicts[i] : undefined })) }, null, 2));
                console.log(`# impact of an edit to ${id}: ${cands.length} candidate(s)\n`);
                for (const [i, c] of cands.entries()) { const v = verdicts && verdicts[i]; console.log(`- ${c.id} [${c.kind}] ${c.via === 'text' ? 'by text' : `${c.path} (${c.weight})`}${v ? ` → ${v.verdict}${v.reason ? ': ' + v.reason : ''}${v.update && v.update.text ? '\n    proposed: ' + v.update.text : ''}${v.question ? '\n    question: ' + v.question : ''}` : ''}`); }
            };
            if (!opt('after')) { print(null); break; }
            const change = { node: id, kind: n.kind, before: nodeText(n), after: opt('after') };
            impact.judgeImpact(change, cands, { cacheFile: path.join(BUILD, 'impact.json'), budget: { candidates: +opt('budget', 20), calls: 3 }, log: m => console.error('wye: ' + m) }).then(print).catch(e => die(e.message));
            break;
        }
        const dist = g.impact(id, +opt('d', 3));
        const byKind = {}; for (const [nid, d] of dist) (byKind[g.node(nid).kind] = byKind[g.node(nid).kind] || []).push([nid, d]);
        console.log(`# impact of ${id}: ${dist.size} dependent node(s)\n`);
        for (const [k, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) { console.log(`## ${k} (${list.length})`); for (const [nid, d] of list.sort((a, b) => a[1] - b[1])) console.log(`- ${nid} (${d} hop${d > 1 ? 's' : ''}) — ${g.node(nid).title}`); }
        break;
    }
    case 'packet': {
        const g = load(); const task = opt('task') || positional.join(' ') || die('packet --task "<text>"');
        process.stdout.write(g.packet(String(task), { budget: +opt('budget', 6000), seeds: +opt('seeds', 6), all: argv.includes('--all'), asOf: opt('as-of', null) }));
        break;
    }
    case 'constraints': {
        // the constraint packet for a text and/or seed ids: what governs it, complete (decision:memory.constraint-packet)
        const g = load(); const task = opt('task') || opt('for') || ''; const refs = String(opt('ref', '') || '').split(',').filter(Boolean).map(r => resolveOne(g, r));
        if (!task && !refs.length) die('constraints --task "<text>" [--ref id,id] [--budget N] [--all | --as-of d]');
        const all = argv.includes('--all'), asOf = opt('as-of', null);
        const seeds = refs.concat(task ? g.search(String(task), { limit: +opt('seeds', 6), all, asOf }).map(h => h.n.id) : []);
        const c = g.constraints([...new Set(seeds)], { all, asOf });
        if (argv.includes('--json')) { console.log(JSON.stringify({ seeds: c.seeds, hidden: c.hidden, questions: c.questions.map(n => n.id), byKind: Object.fromEntries(Object.entries(c.byKind).map(([k, l]) => [k, l.map(n => ({ id: n.id, status: n.status, hops: c.hops.get(n.id) }))])) }, null, 2)); break; }
        console.log(`# Constraints in force: ${task || refs.join(', ')}\n`);
        console.log(g.renderConstraints(c, { budget: +opt('budget', 10000) }));
        break;
    }
    case 'verdicts': {
        // the verdict pass for given nodes (decision:memory.write-time-verdict): pairs against their neighbours, judged
        // and cached in _build/verdicts.json; prints every verdict, contradictions first. --json for the app.
        const g = load(); const ids = positional.map(id => resolveOne(g, id)); if (!ids.length) die('verdicts <id...> [--limit N] [--budget-pairs N] [--budget-calls N] [--json]');
        const { judgePairs } = require('../lib/judge');
        const pairs = g.verdictPairs(ids, { limit: +opt('limit', 12) });
        judgePairs(pairs, { cacheFile: path.join(BUILD, 'verdicts.json'), budget: { pairs: +opt('budget-pairs', 40), calls: +opt('budget-calls', 6) }, log: m => console.error('wye: ' + m) }).then(vs => {
            if (argv.includes('--json')) { console.log(JSON.stringify(vs, null, 1)); return; }
            const order = { contradicts: 0, duplicate: 1, refines: 2, consistent: 3 };
            const done = vs.filter(Boolean).sort((x, y) => order[x.kind] - order[y.kind]);
            for (const v of done) console.log(`${v.kind.padEnd(11)} ${v.b} ↔ ${v.a}${v.conflict ? ' [' + v.conflict + ']' : ''} — ${v.reason}${v.cached ? '  (cached)' : ''}`);
            const pending = vs.filter(v => !v).length; if (pending) console.log(`(${pending} pair(s) not yet classified — budget)`);
            if (!vs.length) console.log('no neighbours to classify against');
        });
        break;
    }
    case 'check': {
        const g = load(); const r = g.check({ repo: path.resolve(opt('repo', '.')), strict: argv.includes('--strict') });
        for (const w of r.warnings) console.log('warn  ' + w);
        for (const e of r.errors) console.log('ERROR ' + e);
        console.log(`\n${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
        if (argv.includes('--deep')) {
            // --deep (task:memory.lint-deep): the verdict pass over every same-kind pair that shares a neighbour; new
            // contradictions are reported, never written — write them with `wye verdicts` / the app
            const { judgePairs } = require('../lib/judge');
            const pairs = g.deepPairs({ limit: +opt('limit', 400) });
            console.log(`\ndeep: ${pairs.length} same-kind pair(s) sharing a neighbour`);
            judgePairs(pairs, { cacheFile: path.join(BUILD, 'verdicts.json'), budget: { pairs: +opt('budget-pairs', 60), calls: +opt('budget-calls', 8) }, log: m => console.error('wye: ' + m) }).then(vs => {
                const found = vs.filter(v => v && (v.kind === 'contradicts' || v.kind === 'duplicate'));
                for (const v of found) console.log(`${v.kind.toUpperCase()} ${v.a} ↔ ${v.b}${v.conflict ? ' [' + v.conflict + ']' : ''} — ${v.reason}`);
                const pending = vs.filter(v => !v).length;
                console.log(`\ndeep: ${found.length} contradiction(s) / duplicate(s) in ${vs.filter(Boolean).length} judged pair(s)${pending ? `, ${pending} not reached (budget — run again)` : ''}`);
                process.exit(r.ok && !found.length ? 0 : 1);
            });
            break;
        }
        process.exit(r.ok ? 0 : 1);
    }
    case 'stats': { console.log(JSON.stringify(load().stats(), null, 2)); break; }
    case 'reqs': {
        const g = load(); const want = opt('status');
        const reqs = g.data.nodes.filter(n => n.kind === 'req');
        const kids = id => reqs.filter(r => (g.out.get(r.id) || []).some(e => e.verb === 'refines' && e.to === id));
        const roots = reqs.filter(r => !(g.out.get(r.id) || []).some(e => e.verb === 'refines' && g.node(e.to).kind === 'req'));
        const tested = r => (g.out.get(r.id) || []).some(e => e.verb === 'verified-by');
        const print = (r, d) => { const st = r.status || 'shipped'; if (!want || st === want) console.log(`${'  '.repeat(d)}${st === 'shipped' ? (tested(r) ? '●' : '◐') : st === 'proposed' ? '○' : st === 'question' ? '?' : '◐'} ${r.id.slice(4)}  ${r.title}${st !== 'shipped' ? '  [' + st + ']' : tested(r) ? '' : '  [no test]'}`); for (const k of kids(r.id)) print(k, d + 1); };
        for (const r of roots) print(r, 0);
        break;
    }
    default:
        console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 14).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
        process.exit(cmd ? 2 : 0);
}
