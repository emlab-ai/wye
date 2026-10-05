'use strict';
// A build that replays a file from the parse cache must produce exactly what parsing it again produces
// (decision:wf2.parse-cache). The app's build coordinator keeps one cache per product across builds, so an edge the
// per-file pass forgot to record — one written through the shared state instead of the file's own recorder —
// disappears on the second build and takes a whole rail's tree with it.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { parseFiles, newParseCache } = require('../lib/parse');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wye-cache-'));
const write = (name, md) => { const f = path.join(dir, name); fs.writeFileSync(f, md); return f; };

// a page under another (frontmatter `part-of:`), a card whose key is a property of its type, and one written from the
// other side (`satisfies:` — the inverse of satisfied-by), which is the shape that broke
const types = write('types.md', `---
node: module:types
title: Types
---

\`\`\`yaml
- id: type:thing
  extends: type:node
  purpose: a thing
  props:
    satisfied-by: list of node? -(inverse)-> satisfies
  open: true
\`\`\`
`);
const parent = write('parent.md', `---
node: module:parent
title: Parent
---

# Parent
`);
const child = write('child.md', `---
node: module:child
title: Child
part-of: module:parent
see: module:types
---

# Child

\`\`\`yaml
- id: thing:a
  title: A
- id: thing:b
  title: B
  satisfies: thing:a
\`\`\`

thing:just-added
`);

const files = [types, parent, child];
const key = g => g.edges.filter(e => !e.generated).map(e => `${e.from}|${e.verb}|${e.to}`).sort().join('\n');
const cold = parseFiles(files, { cwd: dir });
const cache = newParseCache();
const first = parseFiles(files, { cache, cwd: dir });
const replayed = parseFiles(files, { cache, cwd: dir });

assert.strictEqual(key(first), key(cold), 'a cached first build is a cold build');
assert.strictEqual(key(replayed), key(cold), 'a replayed build is a cold build');
assert.ok(key(cold).includes('module:child|part-of|module:parent'), 'the page under another');
assert.ok(key(cold).includes('module:child|see|module:types'), 'a frontmatter relation');
assert.ok(key(cold).includes('thing:a|satisfied-by|thing:b'), 'a link written from the other side');
// an id alone on its line (a block just added in the editor) is a node the file defines once every file is read:
// kept aside by the per-file pass, so it has to be replayed too — it used to exist on a cold build only
const defined = g => g.nodes.filter(n => n.defined).map(n => n.id).sort().join('\n');
assert.ok(defined(cold).includes('thing:just-added'), 'an id alone on its line is a node');
assert.strictEqual(defined(first), defined(cold), 'a cached first build defines what a cold build defines');
assert.strictEqual(defined(replayed), defined(cold), 'a replayed build defines what a cold build defines');

// and after one file changes: the others replay, the changed one is parsed again, the graph still matches a cold parse
fs.writeFileSync(child, fs.readFileSync(child, 'utf8').replace('title: B', 'title: B two'));
const again = parseFiles(files, { cache, cwd: dir });
assert.strictEqual(key(again), key(parseFiles(files, { cwd: dir })), 'one file changed, the rest replayed');

fs.rmSync(dir, { recursive: true, force: true });
console.log(`ok — parse cache: ${cold.edges.length} edges, replayed identically`);
