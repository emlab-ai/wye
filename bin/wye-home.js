'use strict';
// Wye's home: a folder laid out like the Wye checkout, which is what the app and its agents read and write. Running from
// a clone, it is the clone itself. Installed from npm, it is ~/.wye (or WYE_HOME): `data/` holds the person's products
// and stays theirs across updates; the code folders are links into the installed package, so an update swaps the code
// under the same paths and every `data/products/<product>/…` path an agent is told keeps working.
const fs = require('fs');
const os = require('os');
const path = require('path');

const INSTALL = path.resolve(__dirname, '..');
// the folders of the package the home links to (what REPO_ROOT-relative code reads: prompts, schema, templates…)
const CODE = ['bin', 'lib', 'packages', 'prompts', 'schema', 'skills', 'templates', 'viewer', 'package.json'];

// a clone has its own data/products; an installed package does not
const isCheckout = () => fs.existsSync(path.join(INSTALL, 'data', 'products'));

function home() {
  if (process.env.WYE_HOME) return path.resolve(process.env.WYE_HOME);
  return isCheckout() ? INSTALL : path.join(os.homedir(), '.wye');
}

// Make the home ready: data/products, and a link per code folder pointing at this install (relinked when the install
// moved, e.g. a new Node version's global folder). A clone needs nothing.
function ensureHome() {
  const h = home();
  if (h === INSTALL) return h;
  fs.mkdirSync(path.join(h, 'data', 'products'), { recursive: true });
  for (const name of CODE) {
    const target = path.join(INSTALL, name), link = path.join(h, name);
    if (!fs.existsSync(target)) continue;
    let cur = null; try { cur = fs.readlinkSync(link); } catch { /* none yet, or a real folder */ }
    if (cur === target) continue;
    if (cur !== null || !fs.existsSync(link)) { try { fs.unlinkSync(link); } catch { /* not there */ } fs.symlinkSync(target, link); }
    else console.error(`wye: ${link} is a real ${fs.statSync(link).isDirectory() ? 'folder' : 'file'}, not a link to the package — left as it is`);
  }
  return h;
}

// The Claude Code skills (skills/*) linked into ~/.claude/skills, so any session can work with Wye.
function linkSkills() {
  const dir = path.join(os.homedir(), '.claude', 'skills'); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const s of fs.readdirSync(path.join(INSTALL, 'skills'), { withFileTypes: true })) {
    if (!s.isDirectory()) continue;
    const link = path.join(dir, s.name), target = path.join(INSTALL, 'skills', s.name);
    try { fs.unlinkSync(link); } catch { /* none yet */ }
    fs.symlinkSync(target, link); out.push(link);
  }
  return out;
}

// The folder `next start` runs in. Turbopack loads the server's external packages (next.config.ts
// serverExternalPackages) through hashed aliases in .next/node_modules — `@duckdb/node-api-<hash>` → the package — which
// npm cannot pack (symlinks), so the package carries their names (.next/wye-externals.json, scripts/externals-manifest.js)
// and they are made here: in the installed app when it is writable, else in a copy of the built app under the home
// (<home>/.cache/app/<build>), one per build. A clone's build has its own links and runs where it is.
function prepareApp(web, homeDir) {
  const next = path.join(web, '.next');
  if (fs.existsSync(path.join(next, 'node_modules'))) return web;
  let map; try { map = JSON.parse(fs.readFileSync(path.join(next, 'wye-externals.json'), 'utf8')); } catch { return web; }
  let dir = web;
  try { fs.accessSync(next, fs.constants.W_OK); } catch {
    const build = fs.readFileSync(path.join(next, 'BUILD_ID'), 'utf8').trim();
    dir = path.join(homeDir, '.cache', 'app', build);
    if (!fs.existsSync(path.join(dir, '.next', 'BUILD_ID'))) {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of ['package.json', 'next.config.ts']) fs.copyFileSync(path.join(web, f), path.join(dir, f));
      fs.cpSync(next, path.join(dir, '.next'), { recursive: true });
      fs.symlinkSync(path.join(INSTALL, 'node_modules'), path.join(dir, 'node_modules'));
    }
  }
  for (const [alias, pkg] of Object.entries(map)) {
    let target = null;   // the package folder: the first node_modules/<pkg> walking up from the installed app
    for (let d = web; ; d = path.dirname(d)) { const t = path.join(d, 'node_modules', pkg); if (fs.existsSync(path.join(t, 'package.json'))) { target = t; break; } if (path.dirname(d) === d) break; }
    if (!target) { console.error(`wye: ${pkg} is not installed — reinstall the package`); continue; }
    const link = path.join(dir, '.next', 'node_modules', alias); fs.mkdirSync(path.dirname(link), { recursive: true });
    try { fs.unlinkSync(link); } catch { /* none yet */ }
    fs.symlinkSync(target, link);
  }
  return dir;
}

module.exports = { INSTALL, home, ensureHome, linkSkills, prepareApp, isCheckout };
