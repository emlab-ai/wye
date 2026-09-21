// Build a product's graph (decision:wf2.parse-cache): the documents under a root → parseFiles → _build/graph.json.
// The CLI (`ctx build`) and the app (packages/web/src/lib/build.ts, in-process with a parse cache kept across builds)
// share this so a build is one thing. `check` formats a graph's problems the way `ctx check` prints them.
const fs = require('fs');
const path = require('path');
const { parseFiles } = require('./parse');
const { Graph } = require('./graph');

// Every .md under the root (a product folder: projects/*/docs/*.md, or a flat docs folder), skipping _build and
// files or folders that start with "_" (product and project metadata, generated output), inbox and node_modules.
function findDocs(root) {
    const out = [];
    const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name.startsWith('_') || e.name === 'node_modules' || e.name === 'inbox') continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) out.push(path.resolve(p)); } };
    walk(root);
    return out.sort();
}

function writeGraph(graph, outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const tmp = path.join(outDir, `graph.json.tmp-${process.pid}`);
    fs.writeFileSync(tmp, JSON.stringify(graph));
    fs.renameSync(tmp, path.join(outDir, 'graph.json'));
}

// Parse the root's documents and write _build/graph.json. `cache` (parse.newParseCache) makes the next build of the
// same root replay the unchanged files; `cwd` is what file paths in the graph are relative to (the repo root).
function buildGraph(root, { cache, cwd = process.cwd(), files } = {}) {
    const docs = files && files.length ? files.map(f => path.resolve(f)) : findDocs(root);
    const graph = parseFiles(docs, { cache, cwd });
    writeGraph(graph, path.join(root, '_build'));
    return { graph, files: docs };
}

// The check's lines as `ctx check` prints them: `warn  …` and `ERROR …`, then the count line.
function checkLines(graph, { repo, strict = false } = {}) {
    const r = new Graph(graph).check({ repo, strict });
    return { errors: r.errors, warnings: r.warnings, output: [...r.warnings.map(w => 'warn  ' + w), ...r.errors.map(e => 'ERROR ' + e), '', `${r.errors.length} error(s), ${r.warnings.length} warning(s)`].join('\n') };
}

module.exports = { findDocs, writeGraph, buildGraph, checkLines };
