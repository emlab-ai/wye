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

// a record of whose cache a folder is, written once per process: what `wye cache list` reads to name the vault and
// tell an orphan (its vault folder gone) from a live one
const seen = new Set();
function stamp(cdir, dir) {
  if (seen.has(cdir)) return; seen.add(cdir);
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

module.exports = { cacheRoot, cacheDir, keyOf, nameOf };
