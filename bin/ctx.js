#!/usr/bin/env node
'use strict';
// ctx — query and maintain a product context graph stored as markdown.
//   ctx build [files...]           parse docs/context-graph/*.md → _build/graph.json + data.js
//   ctx site  [files...] [--out d] build the phone-friendly viewer (index.html + data.js) ready to publish
//   ctx get <id>                   one node with all edges
//   ctx neighbors <id> [-d N] [--kinds a,b] [--structural]
//   ctx search <terms...>
//   ctx impact <id>                everything that depends on the node
//   ctx packet --task "<text>" [--budget N]   a token-budgeted slice for an agent
//   ctx check [--repo dir] [--strict]          lint the graph; exit 1 on errors
//   ctx stats
//   ctx reqs [--status s]          requirement tree with status
const fs = require('fs');
const path = require('path');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, def) => { const i = argv.indexOf('--' + name); if (i === -1) return def; const v = argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('-') && !(arr[i - 1] && arr[i - 1].startsWith('--') && !['--strict', '--structural', '--json'].includes(arr[i - 1])));
const ROOT = opt('root', process.env.CTX_ROOT || 'docs/context-graph');
const BUILD = path.join(ROOT, '_build');
const graphFile = opt('graph', path.join(BUILD, 'graph.json'));

function findDocs(files) {
    if (files.length) return files.map(f => path.resolve(f));
    if (!fs.existsSync(ROOT)) die(`no ${ROOT}; pass files explicitly or --root`);
    return fs.readdirSync(ROOT).filter(f => f.endsWith('.md') && !f.startsWith('_')).map(f => path.join(process.cwd(), ROOT, f));
}
function die(msg) { console.error('ctx: ' + msg); process.exit(2); }
function load() { if (!fs.existsSync(graphFile)) die(`no ${graphFile} — run \`ctx build\` first`); return Graph.load(graphFile); }
function resolveOne(g, id) { const r = g.resolve(id); if (!r.length) die(`unknown node: ${id}`); if (r.length > 1) die(`ambiguous: ${r.join(', ')}`); return r[0]; }
function writeBuild(graph, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'graph.json'), JSON.stringify(graph, null, 1));
    const mdBundle = {}; for (const f of graph.files) mdBundle[f] = fs.readFileSync(path.resolve(f), 'utf8');
    fs.writeFileSync(path.join(outDir, 'data.js'), 'window.GRAPH=' + JSON.stringify(graph) + ';\nwindow.MD_FILES=' + JSON.stringify(mdBundle) + ';\n');
}

switch (cmd) {
    case 'build': {
        const files = findDocs(positional);
        const graph = parseFiles(files);
        writeBuild(graph, BUILD);
        const g = new Graph(graph), s = g.stats();
        console.log(`built ${BUILD}/graph.json from ${files.length} file(s): ${s.nodes} nodes, ${s.edges} edges`);
        console.log('by kind: ' + Object.entries(s.byKind).map(([k, v]) => `${k} ${v.defined}${v.stub ? '+' + v.stub + ' stub' : ''}`).join(' · '));
        break;
    }
    case 'site': {
        const files = findDocs(positional);
        const graph = parseFiles(files);
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
        for (const { n, s } of g.search(term, { limit: +opt('limit', 25) })) console.log(`${s.toFixed(1).padStart(5)}  ${n.id}${n.status ? ' [' + n.status + ']' : ''} — ${n.title}`);
        break;
    }
    case 'impact': {
        const g = load(); const id = resolveOne(g, positional[0] || die('impact <id>'));
        const dist = g.impact(id, +opt('d', 3));
        const byKind = {}; for (const [nid, d] of dist) (byKind[g.node(nid).kind] = byKind[g.node(nid).kind] || []).push([nid, d]);
        console.log(`# impact of ${id}: ${dist.size} dependent node(s)\n`);
        for (const [k, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) { console.log(`## ${k} (${list.length})`); for (const [nid, d] of list.sort((a, b) => a[1] - b[1])) console.log(`- ${nid} (${d} hop${d > 1 ? 's' : ''}) — ${g.node(nid).title}`); }
        break;
    }
    case 'packet': {
        const g = load(); const task = opt('task') || positional.join(' ') || die('packet --task "<text>"');
        process.stdout.write(g.packet(String(task), { budget: +opt('budget', 6000), seeds: +opt('seeds', 6) }));
        break;
    }
    case 'check': {
        const g = load(); const r = g.check({ repo: path.resolve(opt('repo', '.')), strict: argv.includes('--strict') });
        for (const w of r.warnings) console.log('warn  ' + w);
        for (const e of r.errors) console.log('ERROR ' + e);
        console.log(`\n${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
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
