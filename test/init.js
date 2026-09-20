'use strict';
// wye init (req:wf2.cli.init): the definition of a repository, shallow — the tree, the cards from the scan, the describe
// tasks — parses to a graph with no errors, defines every id once, and a feature inside the product embeds what the
// product already defines instead of defining it again.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { init, headerPurpose } = require('../lib/init');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wye-init-'));
const repo = path.join(__dirname, '..');
const r = init({ dataRoot: tmp, product: 'scan', title: 'Scan', repo, description: 'test' });
assert(r.made.written.length > 20, 'pages written');
assert(r.areas.some(a => a.dir === 'packages/web'), 'the web workspace is a module');
assert(r.made.counts.components > 30 && r.made.counts.pages > 10 && r.made.counts.ops > 10, 'the scan finds pages, components and operations');
const docs = path.join(tmp, 'products/scan/projects/main/docs');
const files = fs.readdirSync(docs).filter(f => f.endsWith('.md')).map(f => path.join(docs, f)).sort();
const g = new Graph(parseFiles(files));
const defined = g.data.nodes.filter(n => n.defined).map(n => n.id);
assert.strictEqual(new Set(defined).size, defined.length, 'every id defined once');
const problems = g.check({ repo }).errors;
assert.deepStrictEqual(problems, [], 'ctx check has no errors: ' + JSON.stringify(problems.slice(0, 3)));
assert(defined.includes('task:main.describe.web') && fs.readFileSync(path.join(docs, 'plan.md'), 'utf8').includes('task:main.describe.web') && /describe\.web[^\n]*#ready/.test(fs.readFileSync(path.join(docs, 'plan.md'), 'utf8')), 'a ready describe task per module');
assert(fs.readFileSync(path.join(docs, 'web.md'), 'utf8').includes('<!-- list:lib -->'), 'the module page holds its libraries in a list region');
// a second init keeps every page
const again = init({ dataRoot: tmp, product: 'scan', title: 'Scan', repo, description: 'test' });
assert.strictEqual(again.made.written.length, 0, 'nothing overwritten');
// a feature: components the product defines are embedded, not redefined
const f = init({ dataRoot: tmp, product: 'scan', repo, feature: 'Editor', path: 'packages/web/src/components' });
const comp = fs.readFileSync(path.join(tmp, 'products/scan/projects/editor/docs/components.md'), 'utf8');
assert(!/^- id: component:/m.test(comp) && /^!\[\[component:/m.test(comp), 'the feature embeds the product\'s components');
assert(f.made.written.length > 10, 'the feature has its pages');
// header comments: the first block, one line, ids neutralised
const p = headerPurpose(path.join(repo, 'lib/init.js'));
assert(p.startsWith('`wye init` (req&#58;wf2.cli.init)'), 'header purpose: ' + p.slice(0, 60));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('init ok — ' + r.made.written.length + ' pages, ' + r.areas.length + ' modules, ' + defined.length + ' ids');
