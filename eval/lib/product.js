'use strict';
// The product under evaluation: its documents parsed into a lib/graph Graph, the graph sha (over the documents' text,
// so it is the same on every machine that has the same files), the git sha, the sessions and change records.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { parseFiles } = require('../../lib/parse');
const { Graph } = require('../../lib/graph');

const REPO = path.resolve(__dirname, '..', '..');
const productDirOf = product => path.isAbsolute(product) ? product : path.join(REPO, 'data', 'products', product);

function docFiles(productDir) {
    const files = [];
    const root = path.join(productDir, 'projects');
    if (!fs.existsSync(root)) return files;
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('_') || e.name === 'inbox') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) files.push(p); } })(root);
    return files.sort();
}
function graphSha(productDir) {
    const h = crypto.createHash('sha1');
    for (const f of docFiles(productDir)) { h.update(path.relative(productDir, f)); h.update('\0'); h.update(fs.readFileSync(f)); h.update('\0'); }
    return h.digest('hex').slice(0, 12);
}
function gitSha() { try { return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { return null; } }

let cache = null;
// { product, productDir, graph (lib/graph Graph), graphSha, gitSha, files }
function loadProduct(product) {
    const productDir = productDirOf(product);
    if (!fs.existsSync(productDir)) throw new Error(`no product at ${productDir}`);
    const sha = graphSha(productDir);
    if (cache && cache.productDir === productDir && cache.graphSha === sha) return cache;
    const files = docFiles(productDir);
    const cwd = process.cwd(); process.chdir(REPO);
    let data; try { data = parseFiles(files); } finally { process.chdir(cwd); }
    cache = { product: path.basename(productDir), productDir, graph: new Graph(data), graphSha: sha, gitSha: gitSha(), files };
    return cache;
}

// session records (rule:task-artifacts): every _sessions/<id>.json
function sessions(productDir) {
    const dir = path.join(productDir, '_sessions');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => /^[0-9a-f]+\.json$/.test(f)).map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
// change records (store:changes): every _changes/<id>.json
function changes(productDir) {
    const dir = path.join(productDir, '_changes');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
}

// the text a node stands for in a query: title + prose keys (lib/judge#nodeText)
const { nodeText } = require('../../lib/judge');
const KNOWLEDGE = new Set(['req', 'rule', 'decision', 'constraint', 'goal', 'gate', 'lesson', 'question', 'task', 'entity', 'op', 'page', 'component', 'lib', 'test', 'ui-test', 'store', 'flag', 'setting', 'action', 'tool', 'state', 'module', 'plan', 'drift', 'contradiction', 'verdict']);
const isTyped = n => n && n.defined && KNOWLEDGE.has(n.kind);

module.exports = { REPO, productDirOf, docFiles, graphSha, gitSha, loadProduct, sessions, changes, nodeText, isTyped };
