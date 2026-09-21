'use strict';
// The cards generator (scripts/cards.js, lib:cards): every file under packages/web/src has a card, every card a file.
// Fixture tests of the pure parts — header extraction, kind and id by path, route → file — then the real check.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { escapeUnknown, headerOf, kindOf, idFor, routeToFiles, normalizeFile, check, write } = require('../scripts/cards');

// --- header extraction: the comment before the code, after 'use client' and the imports
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
const w = (name, text) => { const p = path.join(tmp, name); fs.writeFileSync(p, text); return p; };
assert.strictEqual(headerOf(w('a.tsx', `'use client';\nimport x from 'y';\n\n// A strip of tabs, editor style.\n// The open tab on the ground.\nexport function T() {}\n`)),
  'A strip of tabs, editor style. The open tab on the ground.');
assert.strictEqual(headerOf(w('b.ts', `// Before the imports.\nimport { a,\n  b } from './c';\nexport const x = 1;\n`)), 'Before the imports.');
assert.strictEqual(headerOf(w('c.ts', `/**\n * A block comment\n * on two lines.\n */\nexport const x = 1;\n`)), 'A block comment on two lines.');
assert.strictEqual(headerOf(w('d.ts', `import x from 'y';\nexport const x = 1; // not a header\n`)), '');
// an id-first header names the node
assert.deepStrictEqual(headerOf(w('e.ts', `// op:api.work — GET → items\nexport async function GET() {}\n`), { withId: true }), { id: 'op:api.work', text: 'GET → items' });

// an id the graph does not define is escaped, a defined one and a non-node prefix are left alone
assert.strictEqual(escapeUnknown('tabs (req:wf2.ui.tabs) via rule:app-link at 12:30', new Set(['rule:app-link'])), 'tabs (req&#58;wf2.ui.tabs) via rule:app-link at 12:30');
assert.strictEqual(escapeUnknown('x req:a', null), 'x req:a');

// --- kind and id by path
assert.strictEqual(kindOf('packages/web/src/components/Tabs.tsx'), 'component');
assert.strictEqual(kindOf('packages/web/src/components/EditorScope.ts'), 'component');
assert.strictEqual(kindOf('packages/web/src/lib/retype.ts'), 'lib');
assert.strictEqual(kindOf('packages/web/src/app/api/[product]/resolve/route.ts'), 'op');
assert.strictEqual(kindOf('packages/web/src/app/[product]/goals/page.tsx'), 'page');
assert.strictEqual(kindOf('packages/web/src/app/[product]/layout.tsx'), 'component');
assert.strictEqual(idFor('packages/web/src/components/ConstitutionList.tsx'), 'component:constitution-list');
assert.strictEqual(idFor('packages/web/src/components/EditorScope.ts'), 'component:editor-scope');
assert.strictEqual(idFor('packages/web/src/app/[product]/layout.tsx'), 'component:product-layout');
assert.strictEqual(idFor('packages/web/src/app/layout.tsx'), 'component:root-layout');
assert.strictEqual(idFor('packages/web/src/lib/retype.ts'), 'lib:retype');
assert.strictEqual(idFor('packages/web/src/app/api/[product]/resolve/route.ts'), 'op:api.resolve');
assert.strictEqual(idFor('packages/web/src/app/api/[product]/inbox/[name]/route.ts'), 'op:api.inbox.name');
assert.strictEqual(idFor('packages/web/src/app/api/[product]/inbox/[name]/route.ts', new Set()), 'op:api.inbox');
assert.strictEqual(idFor('packages/web/src/app/[product]/goals/page.tsx'), 'page:web/goals');
assert.strictEqual(idFor('packages/web/src/app/[product]/page.tsx'), 'page:web/product');
assert.strictEqual(idFor('packages/web/src/app/page.tsx'), 'page:web/home');
assert.strictEqual(idFor('packages/web/src/app/[product]/[project]/d/[doc]/page.tsx'), 'page:web/project-d-doc');

// --- routes to files (both directions of the dynamic segments)
const exists = new Set([
  'packages/web/src/app/api/[product]/sessions/[id]/message/route.ts',
  'packages/web/src/app/[product]/knowledge/page.tsx', 'packages/web/src/app/[product]/knowledge/[kind]/page.tsx',
  'packages/web/src/app/[product]/[project]/d/[doc]/page.tsx', 'packages/web/src/app/[product]/page.tsx',
]);
assert.deepStrictEqual(routeToFiles('POST /api/<product>/sessions/<id>/message', exists), ['packages/web/src/app/api/[product]/sessions/[id]/message/route.ts']);
assert.deepStrictEqual(routeToFiles('GET | PATCH /api/<product>/sessions/<id>/message', exists), ['packages/web/src/app/api/[product]/sessions/[id]/message/route.ts']);
assert.deepStrictEqual(routeToFiles('/<product>/knowledge[/<kind>]', exists).sort(), ['packages/web/src/app/[product]/knowledge/[kind]/page.tsx', 'packages/web/src/app/[product]/knowledge/page.tsx']);
assert.deepStrictEqual(routeToFiles('/<product>/<project>/d/<page> (the editor)', exists), ['packages/web/src/app/[product]/[project]/d/[doc]/page.tsx']);
assert.deepStrictEqual(routeToFiles('/<product>', exists), ['packages/web/src/app/[product]/page.tsx']);
assert.deepStrictEqual(routeToFiles('skills/wye-context/SKILL.md', exists), []);
assert.strictEqual(normalizeFile('app/[product]/work/page.tsx'), 'packages/web/src/app/[product]/work/page.tsx');
assert.strictEqual(normalizeFile('packages/web/src/lib/x.ts#fn'), 'packages/web/src/lib/x.ts');
assert.strictEqual(normalizeFile('(run by hand)'), null);

// --- write mode on a scratch root: a moved file is re-pointed, a deleted one retired, a new one gets a proposed card
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-root-'));
const mk = (p, text) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), text); };
mk('packages/web/src/components/sub/Moved.tsx', `'use client';\n// Moved here.\nexport const M = 1;\n`);
mk('packages/web/src/components/Fresh.tsx', `// A fresh component (req:not.yet).\nexport const F = 1;\n`);
mk('packages/web/src/lib/thing.ts', `import { a } from '@/lib/known';\n// A thing.\nexport const t = a;\n`);
mk('packages/web/src/lib/known.ts', `// Known.\nexport const a = 1;\n`);
mk('packages/web/src/app/api/[product]/ping/route.ts', `// Pong.\nexport async function GET() {}\nexport async function POST() {}\n`);
mk('packages/web/src/app/[product]/hello/page.tsx', `// Hello page.\nexport default function P() {}\n`);
mk('data/products/wye/projects/v2/docs/components.md', `---\nnode: module:components\n---\n\n## A\n\n<!-- list:component -->\n\n\`\`\`yaml\n- id: component:moved\n  file: packages/web/src/components/Moved.tsx\n  side: client\n  purpose: Hand-written purpose.\n  part-of: module:components\n- id: component:gone\n  file: packages/web/src/components/Gone.tsx\n  side: client\n  purpose: Was here.\n  part-of: module:components\n\`\`\`\n\n<!-- /list:component -->\n`);
mk('data/products/wye/projects/v2/docs/api.md', `---\nnode: module:api\n---\n\n## A\n\n<!-- list:op -->\n\n\`\`\`yaml\n- id: op:api.old\n  args: GET /api/<product>/ping\n  does: Ping.\n  source: packages/web/src/app/api\n  part-of: module:api\n\`\`\`\n\n<!-- /list:op -->\n`);
mk('data/products/wye/projects/v2/docs/pages.md', `---\nnode: module:pages\n---\n`);
mk('data/products/wye/projects/v2/docs/app-storage.md', `---\nnode: module:app-storage\n---\n\n## Libraries\n\n<!-- list:lib -->\n\n\`\`\`yaml\n- id: lib:known\n  file: packages/web/src/lib/known.ts\n  side: server\n  purpose: Known.\n  part-of: module:app-storage\n\`\`\`\n\n<!-- /list:lib -->\n`);
mk('data/products/wye/projects/v2/docs/app-graph.md', `---\nnode: module:app-graph\n---\n\n<!-- list:lib -->\n\n\`\`\`yaml\n\`\`\`\n\n<!-- /list:lib -->\n`);
const before = check(root);
assert.deepStrictEqual(before.uncovered, ['packages/web/src/app/[product]/hello/page.tsx', 'packages/web/src/components/Fresh.tsx', 'packages/web/src/components/sub/Moved.tsx', 'packages/web/src/lib/thing.ts']);
assert.deepStrictEqual(before.missing.map((m) => m.id).sort(), ['component:gone', 'component:moved']);
const done = write(root, () => {});
assert.deepStrictEqual(done.moved, ['component:moved: packages/web/src/components/Moved.tsx → packages/web/src/components/sub/Moved.tsx']);
assert.deepStrictEqual(done.retired, ['component:gone (packages/web/src/components/Gone.tsx deleted)']);
assert.deepStrictEqual(done.tightened, ['op:api.old: packages/web/src/app/api/[product]/ping/route.ts']);
assert.deepStrictEqual(done.added.map((a) => a.split(' ')[0]).sort(), ['component:fresh', 'lib:thing', 'page:web/hello']);
const comp = fs.readFileSync(path.join(root, 'data/products/wye/projects/v2/docs/components.md'), 'utf8');
assert.ok(comp.includes('  file: packages/web/src/components/sub/Moved.tsx\n  side: client\n  purpose: Hand-written purpose.'), 'moved card keeps its purpose');
assert.ok(comp.includes('- id: component:gone\n  status: retired\n  file:'), 'gone card retired in place');
assert.ok(/## Unsorted[\s\S]*- id: component:fresh\n  file: packages\/web\/src\/components\/Fresh.tsx\n  side: server\n  purpose: >\n    A fresh component \(req:not.yet\)\.\n  status: proposed\n  part-of: module:components/.test(comp), 'fresh card under Unsorted with the header as purpose\n' + comp);
const stor = fs.readFileSync(path.join(root, 'data/products/wye/projects/v2/docs/app-storage.md'), 'utf8');
assert.ok(stor.includes('- id: lib:thing\n  file: packages/web/src/lib/thing.ts'), 'lib goes to the page holding what it imports');
const api = fs.readFileSync(path.join(root, 'data/products/wye/projects/v2/docs/api.md'), 'utf8');
assert.ok(api.includes('  source: packages/web/src/app/api/[product]/ping/route.ts'), 'op source tightened');
const pages = fs.readFileSync(path.join(root, 'data/products/wye/projects/v2/docs/pages.md'), 'utf8');
assert.ok(pages.includes('- id: page:web/hello\n  route: /<product>/hello\n  component: packages/web/src/app/[product]/hello/page.tsx'), 'page card with its route');
const after = check(root);
assert.deepStrictEqual([after.uncovered, after.missing], [[], []]);
assert.deepStrictEqual(write(root, () => {}), { added: [], moved: [], retired: [], tightened: [] }, 'a second write changes nothing');
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });

// --- the real tree: every file has a card, every card a file
const real = check();
const lines = [];
if (real.uncovered.length) lines.push(`${real.uncovered.length} file(s) under packages/web/src without a card — run \`npm run cards\`:\n  ${real.uncovered.join('\n  ')}`);
if (real.missing.length) lines.push(`${real.missing.length} card(s) whose file is gone — run \`npm run cards\`:\n  ${real.missing.map((m) => `${m.id} → ${m.file}`).join('\n  ')}`);
assert.strictEqual(lines.length, 0, lines.join('\n'));
console.log(`cards ok: ${real.files} files, ${real.cards} cards`);
