// Build a product's graph (decision:wf2.parse-cache): the documents under a root → parseFiles → graph.json in `out`:
// the vault's cache folder (lib/cache-home) as the app and the CLI pass it, else the vault's own _build/ — what an
// app built before the cache folders expects of this module (decision:waterfall.legacy-build-copied-not-moved).
// The CLI (`wye build`) and the app (packages/web/src/lib/build.ts, in-process with a parse cache kept across builds)
// share this so a build is one thing. `check` formats a graph's problems the way `wye check` prints them.
const fs = require('fs');
const path = require('path');
const { parseFiles } = require('./parse');
const { Graph } = require('./graph');

// Every .md under the root (a product folder: projects/*/docs/*.md, or a flat docs folder), skipping _build and
// files or folders that start with "_" (product and project metadata, generated output), inbox and node_modules.
// a project's .wye/ (the app's system pages) is read after its docs/: where a node is defined twice, the person's page wins
const docOrder = (a, b) => { const k = f => f.replace(/\/\.wye\//, '/~wye/'); return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0; };
// An installed package is a directory link, projects/<p>/.wye/packages/<pkg> → <system>/projects/<pkg>/docs
// (decision:install.directory-link): followed there and only there, a broken one skipped; its documents keep the link's
// path, so they are documents of project p (lib/doc.ts#docRoute).
const isPackageLink = (dir, e) => { if (!e.isSymbolicLink() || path.basename(dir) !== 'packages' || path.basename(path.dirname(dir)) !== '.wye') return false; try { return fs.statSync(path.join(dir, e.name)).isDirectory(); } catch { return false; } };
function findDocs(root) {
    const out = [];
    const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('_') || e.name === 'node_modules' || e.name === 'inbox') continue; const p = path.join(dir, e.name); if (e.isDirectory() || isPackageLink(dir, e)) walk(p); else if (e.name.endsWith('.md')) out.push(path.resolve(p)); } };
    walk(root);
    return out.sort(docOrder);
}

function writeGraph(graph, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const tmp = path.join(outDir, `graph.json.tmp-${process.pid}`);
    fs.writeFileSync(tmp, JSON.stringify(graph));
    fs.renameSync(tmp, path.join(outDir, 'graph.json'));
}

// Parse the root's documents and write graph.json to the cache folder. `cache` (parse.newParseCache) makes the next build of the
// same root replay the unchanged files; `cwd` is what file paths in the graph are relative to (the repo root).
// A product's own status lists for types it did not declare (a base kind's, decision:wf2.statuses-per-type): lines
// `statuses-<type>: [a, b, c]` in the front matter of its _product.md.
function statusOverrides(root) {
    let md = ''; try { md = fs.readFileSync(path.join(root, '_product.md'), 'utf8'); } catch { return {}; }
    const fm = (md.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
    const out = {};
    for (const m of fm.matchAll(/^statuses-([a-z][a-z0-9-]*):\s*\[(.*)\]\s*$/gm)) out[m[1]] = m[2].split(',').map(x => x.trim()).filter(Boolean);
    return out;
}

// The vault's files as the last build read them (req:waterfall.cache-home.branch-switch): manifest.json in the cache
// folder, each document's size, mtime and content hash, relative to the root. A file whose size and mtime did not move
// keeps its hash without being read again.
const crypto = require('crypto');
const MANIFEST = 'manifest.json';
const hashFile = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
const legacyOut = root => path.join(root, '_build');
function readManifest(root, out = legacyOut(root)) { try { return JSON.parse(fs.readFileSync(path.join(out, MANIFEST), 'utf8')); } catch { return null; } }
function entryOf(f, was) {
    const s = fs.statSync(f);
    return was && was[0] === s.size && was[1] === s.mtimeMs ? was : [s.size, s.mtimeMs, hashFile(f)];
}
function writeManifest(root, docs, was, out) {
    const files = {};
    for (const f of [path.join(root, '_product.md'), ...docs]) {
        const rel = path.relative(root, f); if (rel.startsWith('..')) continue;   // what Wye ships, rendered into the cache folder
        try { files[rel] = entryOf(f, was && was.files[rel]); } catch { /* gone since the walk */ }
    }
    const f = path.join(out, MANIFEST), tmp = `${f}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ files })); fs.renameSync(tmp, f);
}
// What changed on disk since the last build — added, removed, or with other content (a git checkout, a pull, an edit
// while nothing was running). A file only touched (same content, new mtime) is not a change: its manifest entry takes
// the new mtime. Null when there is no manifest (a graph built before manifests, or none): rebuild to be sure.
function staleFiles(root, out = legacyOut(root)) {
    const m = readManifest(root, out); if (!m) return null;
    const now = [path.join(root, '_product.md'), ...findDocs(root)].filter(f => fs.existsSync(f)).map(f => path.relative(root, f));
    const changed = []; let touched = false;
    for (const rel of now) {
        const was = m.files[rel]; if (!was) { changed.push(rel); continue; }
        let s; try { s = fs.statSync(path.join(root, rel)); } catch { changed.push(rel); continue; }
        if (s.size === was[0] && s.mtimeMs === was[1]) continue;
        if (s.size === was[0] && hashFile(path.join(root, rel)) === was[2]) { m.files[rel] = [s.size, s.mtimeMs, was[2]]; touched = true; continue; }
        changed.push(rel);
    }
    const here = new Set(now); for (const rel of Object.keys(m.files)) if (!here.has(rel)) changed.push(rel);
    if (touched && !changed.length) { try { fs.writeFileSync(path.join(out, MANIFEST), JSON.stringify(m)); } catch { /* read-only: checked again next time */ } }
    return changed;
}

function buildGraph(root, { cache, cwd = process.cwd(), files, shipped = true, out = legacyOut(root) } = {}) {
    let docs = files && files.length ? files.map(f => path.resolve(f)) : findDocs(root);
    const was = readManifest(root, out);
    // a product gets what Wye ships — skills, workflows, hooks — from the install, rendered into the cache folder's shipped/ (lib/shipped)
    if (shipped && fs.existsSync(path.join(root, 'projects'))) {
        const sh = require('./shipped');
        if (sh.migrateCopies(root).length) docs = docs.filter(f => fs.existsSync(f));   // a product's untouched copies of them go first
        docs = [...docs, ...sh.writeShipped(root, docs, undefined, out)];
    }
    const graph = parseFiles(docs, { cache, cwd, statusOverrides: statusOverrides(root) });
    writeGraph(graph, out);
    try { writeManifest(root, docs, was, out); } catch (e) { console.error(`wye: the build's manifest was not written — ${e.message}`); }
    return { graph, files: docs };
}

// The check's lines as `wye check` prints them: `warn  …` and `ERROR …`, then the count line.
function checkLines(graph, { repo, strict = false } = {}) {
    const r = new Graph(graph).check({ repo, strict });
    return { errors: r.errors, warnings: r.warnings, output: [...r.warnings.map(w => 'warn  ' + w), ...r.errors.map(e => 'ERROR ' + e), '', `${r.errors.length} error(s), ${r.warnings.length} warning(s)`].join('\n') };
}

module.exports = { findDocs, writeGraph, buildGraph, checkLines, staleFiles, readManifest };
