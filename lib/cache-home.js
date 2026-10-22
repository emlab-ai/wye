'use strict';
// Where a vault's caches live (decision:waterfall.caches-live-in-the-wye-home): not in the vault, but in one folder per
// machine, one subfolder per vault — ~/.wye/.cache/vaults/<name>-<8 hex of the vault's real path>
// (decision:waterfall.cache-keyed-by-vault-path, decision:waterfall.one-cache-root-per-machine). Every app and CLI on
// the machine, whatever its Wye home, uses the same folder for a vault, as they all used the vault's _build/ before;
// two clones or worktrees of one repo never share one; every cache can be listed, sized and cleared in one place.
// WYE_CACHE moves the root. What goes in it: what _build/ held, except eval results (committed on purpose).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// the root of every vault's cache on this machine
function cacheRoot() {
  if (process.env.WYE_CACHE) return path.resolve(process.env.WYE_CACHE);
  return path.join(require('os').homedir(), '.wye', '.cache', 'vaults');
}

const real = d => { try { return fs.realpathSync(d); } catch { return path.resolve(d); } };
// a vault folder is <folder>/.wye (named by its folder) or a product folder <home>/data/products/<slug>
function nameOf(dir) {
  const r = real(dir); const b = path.basename(r);
  return (b === '.wye' || b === 'wye' ? path.basename(path.dirname(r)) : b).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'vault';
}
const keyOf = dir => `${nameOf(dir)}-${crypto.createHash('sha1').update(real(dir)).digest('hex').slice(0, 8)}`;

// The one-time copy (req:waterfall.cache-home.moved-once, decision:waterfall.legacy-build-copied-not-moved): what a
// vault still has in its own _build/ is copied into its cache folder — the Ask index too, so nothing is embedded
// again — except eval/, results committed on purpose; a part the cache folder already has is kept. The vault's
// _build/ is left for an app still running older code (it reads and writes there) and removed once nothing has
// written it for LEGACY_DAYS. WYE_CACHE_MOVE=0 turns both off (the test runs: they read real products).
const LEGACY_DAYS = 3;
const newest = p => { try { const st = fs.statSync(p); if (!st.isDirectory()) return st.mtimeMs; let m = st.mtimeMs; for (const e of fs.readdirSync(p)) m = Math.max(m, newest(path.join(p, e))); return m; } catch { return 0; } };
function copyOld(cdir, dir) {
  if (process.env.WYE_CACHE_MOVE === '0') return;
  const old = path.join(dir, '_build'); let names;
  try { if (!fs.statSync(old).isDirectory()) return; names = fs.readdirSync(old).filter(n => n !== 'eval'); } catch { return; }
  fs.mkdirSync(cdir, { recursive: true });
  const mark = path.join(cdir, '.copied');
  if (!fs.existsSync(mark)) {
    for (const n of names) {
      const from = path.join(old, n), to = path.join(cdir, n);
      if (fs.existsSync(to)) continue;
      try { fs.cpSync(from, to, { recursive: true, preserveTimestamps: true }); } catch (e) { console.error(`wye: could not copy ${from} to ${to} — ${e.message}`); }
    }
    try { fs.writeFileSync(mark, new Date().toISOString() + '\n'); } catch { /* read-only */ }
  }
  // the leftover goes once no older app has written it for a while
  if (names.length && Date.now() - Math.max(...names.map(n => newest(path.join(old, n)))) > LEGACY_DAYS * 864e5) {
    for (const n of names) { try { fs.rmSync(path.join(old, n), { recursive: true, force: true }); } catch { /* in use */ } }
    try { if (!fs.readdirSync(old).length) fs.rmdirSync(old); } catch { /* left as it is */ }
  }
}

// a record of whose cache a folder is, written once per process: what `wye cache list` reads to name the vault and
// tell an orphan (its vault folder gone) from a live one
const seen = new Set();
function stamp(cdir, dir) {
  if (seen.has(cdir)) return; seen.add(cdir);
  copyOld(cdir, dir);
  try {
    fs.mkdirSync(cdir, { recursive: true });
    const f = path.join(cdir, 'vault.json');
    let was = {}; try { was = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* first time */ }
    fs.writeFileSync(f, JSON.stringify({ vault: real(dir), name: nameOf(dir), created: was.created || new Date().toISOString(), used: new Date().toISOString() }, null, 1) + '\n');
  } catch { /* a read-only home: the callers' own writes will say so */ }
}

// the cache folder of the vault at `dir`, made on first use
function cacheDir(dir) {
  const c = path.join(cacheRoot(), keyOf(dir));
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

// Where the repo holding a vault stands: `<branch or detached>@<commit>`, read from .git without running git (cheap
// enough to ask before every load). A branch switch, a pull, a reset moves it — the moment a vault's files changed
// without anyone editing them (decision:waterfall.branch-switch-is-not-an-edit). Null outside a git repo.
function gitHead(dir) {
  let d = real(dir);
  for (;;) {
    const g = path.join(d, '.git');
    try {
      let gd = g;
      if (fs.statSync(g).isFile()) gd = path.resolve(d, fs.readFileSync(g, 'utf8').replace(/^gitdir:\s*/, '').trim());   // a worktree
      const head = fs.readFileSync(path.join(gd, 'HEAD'), 'utf8').trim();
      const ref = head.startsWith('ref: ') ? head.slice(5) : null;
      if (!ref) return `detached@${head}`;
      const common = (() => { try { return path.resolve(gd, fs.readFileSync(path.join(gd, 'commondir'), 'utf8').trim()); } catch { return gd; } })();
      for (const base of [gd, common]) { try { return `${ref}@${fs.readFileSync(path.join(base, ref), 'utf8').trim()}`; } catch { /* packed */ } }
      try { const line = fs.readFileSync(path.join(common, 'packed-refs'), 'utf8').split('\n').find(l => l.endsWith(' ' + ref)); return `${ref}@${line ? line.split(' ')[0] : ''}`; } catch { return `${ref}@`; }
    } catch { /* not here */ }
    const up = path.dirname(d); if (up === d) return null; d = up;
  }
}

module.exports = { cacheRoot, cacheDir, keyOf, nameOf, vaultOfCache, shippedParts, gitHead };
