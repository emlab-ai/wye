'use strict';
// A vault's cache folder (plan:cache-home, lib/cache-home.js): in the Wye home, named by the vault and its real path,
// so two clones of one vault never share one; WYE_CACHE moves the root; the folder records whose it is.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wye-cache-home-')));
delete process.env.WYE_CACHE;
const { cacheRoot, cacheDir, keyOf } = require('../lib/cache-home');

const a = path.join(tmp, 'clone-a', 'shop', '.wye'), b = path.join(tmp, 'clone-b', 'shop', '.wye'), p = path.join(tmp, 'home', 'data', 'products', 'Ea Notes');
for (const d of [a, b, p]) fs.mkdirSync(d, { recursive: true });

assert.strictEqual(cacheRoot(), path.join(os.homedir(), '.wye', '.cache', 'vaults'), 'one root per machine, whatever the Wye home');
const root = path.join(tmp, 'caches'); process.env.WYE_CACHE = root;
assert.strictEqual(cacheRoot(), root, 'WYE_CACHE moves the root');
const ca = cacheDir(a), cb = cacheDir(b), cp = cacheDir(p);
assert.strictEqual(path.dirname(ca), root);
assert.match(path.basename(ca), /^shop-[0-9a-f]{8}$/, 'a .wye vault is named by its folder');
assert.match(path.basename(cp), /^ea-notes-[0-9a-f]{8}$/, 'a product folder by its slug');
assert.notStrictEqual(ca, cb, 'two clones of one vault never share a cache');
assert.strictEqual(cacheDir(a), ca, 'the same vault, the same folder');
assert.strictEqual(keyOf(path.join(tmp, 'clone-a', 'shop', '.', '.wye')), path.basename(ca), 'the key is of the real path');
const rec = JSON.parse(fs.readFileSync(path.join(ca, 'vault.json'), 'utf8'));
assert.strictEqual(rec.vault, a); assert.strictEqual(rec.name, 'shop');

// the one-time copy: an existing vault's _build/ is copied to its cache folder, eval results stay out of it, a part
// the cache folder already has is kept; the vault's _build/ stays for an app on older code until nothing wrote it
// for three days
process.env.WYE_CACHE_MOVE = '1';
const fresh = (() => { delete require.cache[require.resolve('../lib/cache-home')]; return require('../lib/cache-home'); })();
const v = path.join(tmp, 'moving', '.wye'), w = path.join(tmp, 'moving-2', '.wye');
const put = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
put(path.join(v, '_build', 'graph.json'), 'old graph'); put(path.join(v, '_build', 'search.lance', 'data', 'x.lance'), 'vectors');
put(path.join(v, '_build', 'verdicts.json'), '{}'); put(path.join(v, '_build', 'shipped', 'p', 'skill-x.md'), '# x'); put(path.join(v, '_build', 'eval', 'run.json'), '{}');
const cv = path.join(root, keyOf(v)); put(path.join(cv, 'graph.json'), 'newer graph');
assert.strictEqual(fresh.cacheDir(v), cv);
assert.strictEqual(fs.readFileSync(path.join(cv, 'search.lance', 'data', 'x.lance'), 'utf8'), 'vectors', 'the index is copied, not rebuilt');
assert.ok(fs.existsSync(path.join(cv, 'verdicts.json')) && fs.existsSync(path.join(cv, 'shipped', 'p', 'skill-x.md')), 'judgements and shipped pages are copied');
assert.ok(!fs.existsSync(path.join(cv, 'eval')), 'eval results are not');
assert.strictEqual(fs.readFileSync(path.join(cv, 'graph.json'), 'utf8'), 'newer graph', 'what the cache folder has is kept');
assert.ok(fs.existsSync(path.join(v, '_build', 'graph.json')), 'the vault\'s _build/ stays while an older app may use it');
const old = Date.now() / 1000 - 4 * 86400; const age = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) age(f); fs.utimesSync(f, old, old); } };
put(path.join(w, '_build', 'graph.json'), 'g'); age(path.join(w, '_build')); fresh.cacheDir(w);
assert.ok(!fs.existsSync(path.join(w, '_build')), 'a _build/ nothing wrote for three days goes');
assert.strictEqual(fs.readFileSync(path.join(root, keyOf(w), 'graph.json'), 'utf8'), 'g', 'after it was copied');
const sp = fresh.shippedParts(path.join(cv, 'shipped', 'p', 'skill-x.md'));
assert.deepStrictEqual(sp, { vault: v, project: 'p', name: 'skill-x.md' }, 'a shipped page names its vault from the cache folder');
assert.deepStrictEqual(fresh.shippedParts(path.join(v, '_build', 'shipped', 'p', 'skill-x.md')), { vault: v, project: 'p', name: 'skill-x.md' });

process.env.WYE_CACHE_MOVE = '0';
const z = path.join(tmp, 'kept', '.wye'); put(path.join(z, '_build', 'graph.json'), 'g'); fresh.cacheDir(z);
assert.ok(!fs.existsSync(path.join(root, keyOf(z), 'graph.json')), 'WYE_CACHE_MOVE=0 copies nothing');

// the manifest (req:waterfall.cache-home.branch-switch): after a build nothing is stale; a file only touched is not a
// change; one with other content, a new one and a removed one are
const { buildGraph, staleFiles } = require('../lib/build');
const mv = path.join(tmp, 'mvault', '.wye'), doc = n => path.join(mv, 'projects', 'p', 'docs', n);
put(path.join(mv, '_product.md'), '---\ntitle: M\n---\n'); put(doc('a.md'), '---\nnode: module:a\ntitle: A\n---\n# A\n'); put(doc('b.md'), '---\nnode: module:b\ntitle: B\n---\n# B\n');
const out = fresh.cacheDir(mv);
assert.strictEqual(staleFiles(mv, out), null, 'no manifest before the first build');
buildGraph(mv, { cwd: tmp, shipped: false, out });
assert.deepStrictEqual(staleFiles(mv, out), []);
const later = new Date(Date.now() + 5000); fs.utimesSync(doc('a.md'), later, later);
assert.deepStrictEqual(staleFiles(mv, out), [], 'a touched file with the same content is not a change');
fs.writeFileSync(doc('a.md'), '---\nnode: module:a\ntitle: A2\n---\n# A2\n'); fs.rmSync(doc('b.md')); put(doc('c.md'), '# C\n');
assert.deepStrictEqual(staleFiles(mv, out).sort(), ['projects/p/docs/a.md', 'projects/p/docs/b.md', 'projects/p/docs/c.md']);
buildGraph(mv, { cwd: tmp, shipped: false, out });
assert.deepStrictEqual(staleFiles(mv, out), []);
delete process.env.WYE_CACHE;

fs.rmSync(tmp, { recursive: true, force: true });
console.log('cache-home: ok');
