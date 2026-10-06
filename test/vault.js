'use strict';
// wye init in a folder (req:wf2.vault-init, lib/vault.js): the folder gains .wye/ laid out as a product, whose
// definition parses with no errors; the note to agents is written once; the links hold on both sides when a vault is
// made below, above and between others; a folder that has a vault is left as it is.
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { initVault, links, readMeta, vaultAbove, vaultsBelow, vaultOf, reach, rescan, applyFixes } = require('../lib/vault');
const { parseFiles } = require('../lib/parse');
const { Graph } = require('../lib/graph');

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wye-vault-')));
const mk = (rel, n = 4) => { const d = path.join(tmp, rel); fs.mkdirSync(d, { recursive: true }); for (let i = 0; i < n; i++) fs.writeFileSync(path.join(d, `f${i}.ts`), `// part ${i}: does a thing\nexport const x${i} = ${i};\n`); };
mk('services/payments/src'); mk('services/payments/refunds/src'); mk('services/search/src'); mk('libs/ui/src'); mk('node_modules/dep/src');
const F = rel => path.join(tmp, rel);
fs.writeFileSync(F('services/payments/CLAUDE.md'), '# Payments\n\nRun the tests with make.\n');
fs.writeFileSync(F('services/search/CLAUDE.md'), '@AGENTS.md\n');

// a vault with nothing above or below
const pay = initVault({ folder: F('services/payments') });
assert.strictEqual(pay.existing, false); assert.strictEqual(pay.slug, 'payments'); assert.strictEqual(pay.parent, null);
const dir = F('services/payments/.wye');
for (const f of ['_product.md', '_agent.md', '.gitignore', 'inbox', 'projects/payments/_project.md', 'projects/payments/docs/payments.md', 'projects/payments/docs/plan.md']) assert(fs.existsSync(path.join(dir, f)), `${f} is written`);
const meta = fs.readFileSync(path.join(dir, '_product.md'), 'utf8');
assert(/^slug: payments$/m.test(meta) && !/^repo:/m.test(meta) && !meta.includes(tmp), 'the vault names its slug and no path of this machine');
assert(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').includes('_build/'), 'the built graph stays out of git');
const docs = path.join(dir, 'projects/payments/docs');
assert(!fs.readdirSync(docs).some(f => fs.readFileSync(path.join(docs, f), 'utf8').includes(tmp)), 'no page holds an absolute path');
const g = new Graph(parseFiles(fs.readdirSync(docs).filter(f => f.endsWith('.md')).map(f => path.join(docs, f)).sort()));
const defined = g.data.nodes.filter(n => n.defined).map(n => n.id);
assert.strictEqual(new Set(defined).size, defined.length, 'every id defined once');
assert.deepStrictEqual(g.check({ repo: F('services/payments') }).errors, [], 'the definition checks against the folder as its code');
assert(defined.includes('module:payments') && defined.includes('goal:payments.defined') && defined.some(id => id.startsWith('task:payments.describe.')), 'ids carry the vault\'s slug');
// the note: appended to a CLAUDE.md that exists, AGENTS.md made
const claude = fs.readFileSync(F('services/payments/CLAUDE.md'), 'utf8');
assert(claude.startsWith('# Payments\n\nRun the tests with make.\n') && claude.includes('<!-- wye:vault -->') && claude.includes('wye propose payments/payments/decisions') && claude.includes('--product payments'), 'CLAUDE.md keeps its text and gains the section');
assert(fs.readFileSync(F('services/payments/AGENTS.md'), 'utf8').includes('<!-- wye:vault -->'), 'AGENTS.md is written');

// again: nothing is written, the person is told where it is
const before = fs.readFileSync(F('services/payments/CLAUDE.md'), 'utf8');
const again = initVault({ folder: F('services/payments') });
assert(again.existing && again.dir === dir && again.slug === 'payments' && fs.readFileSync(F('services/payments/CLAUDE.md'), 'utf8') === before, 'an existing vault is kept');
// the section is refreshed in place when an older one is there: everything around it is kept byte for byte
fs.writeFileSync(F('services/payments/CLAUDE.md'), '# Payments\n\nRun the tests with make.\n\n<!-- wye:vault -->\n## old note\n<!-- /wye:vault -->\n\n## After\n\nNever touch prod.\n');
initVault({ folder: F('services/payments') });
const refreshed = fs.readFileSync(F('services/payments/CLAUDE.md'), 'utf8');
assert(refreshed.startsWith('# Payments\n\nRun the tests with make.\n\n<!-- wye:vault -->') && refreshed.endsWith('<!-- /wye:vault -->\n\n## After\n\nNever touch prod.\n') && !refreshed.includes('## old note') && refreshed.includes('wye propose') && refreshed.split('<!-- wye:vault -->').length === 2, 'an older section is replaced, the text around it kept');
assert.strictEqual(fs.readFileSync(F('services/payments/CLAUDE.md'), 'utf8'), refreshed, 'a second refresh changes nothing');

// below: the child names its parent, the parent lists it
const ref = initVault({ folder: F('services/payments/refunds') });
assert.strictEqual(ref.parent, F('services/payments')); assert.deepStrictEqual(ref.linked, [F('services/payments')]);
assert.strictEqual(readMeta(F('services/payments/refunds')).parent, '..');
assert.deepStrictEqual(readMeta(F('services/payments')).vaults, ['refunds']);

// above: the root finds the nearest vaults below (not refunds, not node_modules), and they name it; their code is not its own
const root = initVault({ folder: tmp, slug: 'acme', title: 'Acme' });
assert.deepStrictEqual(root.children, [F('services/payments')]);
assert.deepStrictEqual(readMeta(tmp).vaults, ['services/payments']);
assert.strictEqual(readMeta(F('services/payments')).parent, '../..');
assert.strictEqual(readMeta(F('services/payments/refunds')).parent, '..', 'a grandchild keeps its parent');
assert(root.areas.every(a => !a.files.some(f => f.startsWith('services/payments/'))), 'a child vault\'s code is left to the child');

// beside: the parent gains it; CLAUDE.md that takes AGENTS.md in is left alone
initVault({ folder: F('services/search') });
assert.deepStrictEqual(readMeta(tmp).vaults, ['services/payments', 'services/search']);
assert.strictEqual(fs.readFileSync(F('services/search/CLAUDE.md'), 'utf8'), '@AGENTS.md\n');

// between: a vault made on services/ takes over the children of the root that sit below it
const svc = initVault({ folder: F('services') });
assert.deepStrictEqual(svc.children.sort(), [F('services/payments'), F('services/search')]);
assert.deepStrictEqual(readMeta(tmp).vaults, ['services']);
assert.deepStrictEqual(readMeta(F('services')).vaults, ['payments', 'search']);
assert.strictEqual(readMeta(F('services')).parent, '..');
assert.strictEqual(readMeta(F('services/search')).parent, '..');
assert.deepStrictEqual(links(F('services')), { parent: tmp, vaults: [F('services/payments'), F('services/search')], missing: [] });
assert.strictEqual(vaultAbove(F('services/payments/refunds/src')), F('services/payments/refunds'));
assert.deepStrictEqual(vaultsBelow(tmp), [F('services')]);

// a slug taken by a linked vault is refused; a link to a vault that is gone is reported, not rewritten
mk('libs/payments/src');
assert.throws(() => initVault({ folder: F('libs/payments'), slug: 'services' }), /already called services/);
assert(!fs.existsSync(F('libs/payments/.wye')), 'a refused init writes nothing');
fs.rmSync(F('services/search/.wye'), { recursive: true });
assert.deepStrictEqual(links(F('services')).missing, ['search']);
assert.deepStrictEqual(readMeta(F('services')).vaults, ['payments', 'search']);
// a workspace (decision:wf2.workspace-is-the-top): the vaults a folder reaches, through the links alone
const folders = l => l.map(v => path.relative(tmp, v.folder) || '.');
assert.deepStrictEqual(folders(reach(tmp)), ['.', 'services', 'services/payments', 'services/payments/refunds'], 'the root reaches every vault below, parents first; a link to a vault that is gone is left out');
assert.deepStrictEqual(reach(tmp).map(v => v.parent && path.relative(tmp, v.parent)), [null, '', 'services', 'services/payments']);
assert.deepStrictEqual(folders(reach(F('services/payments'))), ['services/payments', 'services/payments/refunds'], 'a service opened alone');
mk('apps/web/src'); initVault({ folder: F('apps/web') });
assert.deepStrictEqual(folders(reach(F('apps'))), ['apps/web'], 'a folder without a vault takes the links of the vault above that point inside it');
assert.deepStrictEqual(folders(reach(F('services/payments/src'))), [], 'a folder inside a vault, with none below, reaches none');
assert.strictEqual(vaultOf(F('services/payments/src/f0.ts')), F('services/payments')); assert.strictEqual(vaultOf(F('services/payments')), F('services/payments'));
// Rescan: the one full walk; a vault made by hand is found, a dead link is dropped — proposed, written only when applied
fs.cpSync(F('apps/web/.wye'), F('libs/ui/.wye'), { recursive: true });
const scan = rescan(tmp);
assert.deepStrictEqual(scan.vaults.map(f => path.relative(tmp, f) || '.').sort(), ['.', 'apps/web', 'libs/ui', 'services', 'services/payments', 'services/payments/refunds']);
const fix = Object.fromEntries(scan.fixes.map(f => [path.relative(tmp, f.folder) || '.', f]));
assert.deepStrictEqual(fix['.'].vaults, ['apps/web', 'libs/ui', 'services']); assert.deepStrictEqual(fix.services.vaults, ['payments']);
assert.deepStrictEqual(readMeta(F('services')).vaults, ['payments', 'search'], 'a rescan writes nothing');
assert.deepStrictEqual(applyFixes(scan.fixes).length, scan.fixes.length);
assert.deepStrictEqual(rescan(tmp).fixes, [], 'after the fixes the links are what the walk finds');
assert.deepStrictEqual(folders(reach(tmp)), ['.', 'apps/web', 'libs/ui', 'services', 'services/payments', 'services/payments/refunds']);
// no vault at or above: the list a Rescan kept stands in
const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wye-bare-')));
fs.mkdirSync(path.join(bare, 'a/src'), { recursive: true }); fs.writeFileSync(path.join(bare, 'a/src/x.ts'), 'export const x = 1;\n'); initVault({ folder: path.join(bare, 'a') });
assert.deepStrictEqual(reach(bare), []); assert.deepStrictEqual(rescan(bare).vaults, [path.join(bare, 'a')]);
assert.deepStrictEqual(reach(bare, rescan(bare).roots).map(v => v.folder), [path.join(bare, 'a')]);
fs.rmSync(bare, { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });
console.log('vault ok — init here, the note to agents, links below / above / beside / between, a workspace through the links, rescan');
