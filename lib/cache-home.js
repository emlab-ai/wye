'use strict';
// Where a vault's caches live (decision:waterfall.caches-live-in-the-wye-home): not in the vault, but in one folder in
// the Wye home, one subfolder per vault — <home>/.cache/vaults/<name>-<8 hex of the vault's real path>
// (decision:waterfall.cache-keyed-by-vault-path), so two clones or worktrees of one repo never share a cache and every
// cache on the machine can be listed, sized and cleared in one place. WYE_CACHE moves the whole root.
// What goes in it: what _build/ held, except eval results (committed on purpose, they stay in the vault).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// the root of every vault's cache; `home` is the Wye home (bin/wye-home.js home(), the app's REPO_ROOT)
function cacheRoot(home) {
  if (process.env.WYE_CACHE) return path.resolve(process.env.WYE_CACHE);
  return path.join(home || require('../bin/wye-home').home(), '.cache', 'vaults');
}

const real = d => { try { return fs.realpathSync(d); } catch { return path.resolve(d); } };
// a vault folder is <folder>/.wye (named by its folder) or a product folder <home>/data/products/<slug>
function nameOf(dir) {
  const r = real(dir); const b = path.basename(r);
  return (b === '.wye' || b === 'wye' ? path.basename(path.dirname(r)) : b).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'vault';
}
const keyOf = dir => `${nameOf(dir)}-${crypto.createHash('sha1').update(real(dir)).digest('hex').slice(0, 8)}`;

// The one-time move (req:waterfall.cache-home.moved-once): what a vault still has in its own _build/ is renamed into
// its cache folder — the Ask index too, so nothing is embedded again — except eval/, results committed on purpose. A
// part the cache folder already has wins (it was written since); the vault's copy goes. _build/ goes when empty.
// WYE_CACHE_MOVE=0 turns it off (the test runs: they read real products and must never move their caches).
function moveOld(cdir, dir) {
  if (process.env.WYE_CACHE_MOVE === '0') return;
  const old = path.join(dir, '_build'); let names;
  try { if (!fs.statSync(old).isDirectory()) return; names = fs.readdirSync(old); } catch { return; }
  fs.mkdirSync(cdir, { recursive: true });
  for (const n of names) {
    if (n === 'eval') continue;
    const from = path.join(old, n), to = path.join(cdir, n);
    try {
      if (fs.existsSync(to)) fs.rmSync(from, { recursive: true, force: true });
      else try { fs.renameSync(from, to); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.cpSync(from, to, { recursive: true }); fs.rmSync(from, { recursive: true, force: true }); }
    } catch (e) { console.error(`wye: could not move ${from} to ${to} — ${e.message}`); }
  }
  try { if (!fs.readdirSync(old).length) fs.rmdirSync(old); } catch { /* left as it is */ }
}

// a record of whose cache a folder is, written once per process: what `wye cache list` reads to name the vault and
// tell an orphan (its vault folder gone) from a live one
const seen = new Set();
function stamp(cdir, dir) {
  if (seen.has(cdir)) return; seen.add(cdir);
  moveOld(cdir, dir);
  try {
    fs.mkdirSync(cdir, { recursive: true });
    const f = path.join(cdir, 'vault.json');
    let was = {}; try { was = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* first time */ }
    fs.writeFileSync(f, JSON.stringify({ vault: real(dir), name: nameOf(dir), created: was.created || new Date().toISOString(), used: new Date().toISOString() }, null, 1) + '\n');
  } catch { /* a read-only home: the callers' own writes will say so */ }
}

// the cache folder of the vault at `dir`, made on first use
function cacheDir(dir, home) {
  const c = path.join(cacheRoot(home), keyOf(dir));
  stamp(c, dir);
  return c;
}

// The vault a cache folder belongs to, from its vault.json (null when it is not one)
const owners = new Map();
function vaultOfCache(cdir) {
  if (!owners.has(cdir)) { let v = null; try { v = JSON.parse(fs.readFileSync(path.join(cdir, 'vault.json'), 'utf8')).vault || null; } catch { /* not a cache folder */ } owners.set(cdir, v); }
  return owners.get(cdir);
}

// A document Wye ships (lib/shipped), rendered into <cache>/shipped/<project>/<name>.md — or, before the move, into
// <vault>/_build/shipped/<project>/ — read as the vault's own: which vault, which project, which file name. Null for
// any other file.
function shippedParts(file) {
  const m = String(file).replace(/\\/g, '/').match(/^(.*)\/shipped\/([^/]+)\/([^/]+\.md)$/); if (!m) return null;
  const vault = path.basename(m[1]) === '_build' ? path.dirname(m[1]) : vaultOfCache(m[1]);
  return vault ? { vault, project: m[2], name: m[3] } : null;
}

module.exports = { cacheRoot, cacheDir, keyOf, nameOf, vaultOfCache, shippedParts };
