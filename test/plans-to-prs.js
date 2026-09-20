'use strict';
// scripts/plans-to-prs (Prompt Requests D1): every type:plan document becomes a type:pr one — file, node, type,
// status, part-of, the Plans page, every reference in the product, every session's planDoc.
const fs = require('fs'); const path = require('path'); const os = require('os'); const assert = require('assert');
const { migrate } = require('../scripts/plans-to-prs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wye-mig-'));
const docs = path.join(tmp, 'projects/p/docs'); fs.mkdirSync(docs, { recursive: true }); fs.mkdirSync(path.join(tmp, '_sessions'), { recursive: true });
fs.writeFileSync(path.join(tmp, '_product.md'), '---\ntitle: T\n---\n');
fs.writeFileSync(path.join(docs, 'plans.md'), '---\nnode: module:p-plans\ntype: module\ntitle: Plans\n---\n\n# Plans\n\n<!-- view:plan -->\n');
fs.writeFileSync(path.join(docs, 'plan-x.md'), '---\nnode: plan:plan-x\ntype: plan\ntitle: X\nstatus: defining\nsession: s1\npart-of: module:p-plans\n---\n\n# X\n\n## Tasks\n\n- [ ] task:plan-x X #in-progress (worker: claude-code, session: s1)\n');
fs.writeFileSync(path.join(docs, 'plan-y.md'), '---\nnode: plan:plan-y\ntype: plan\ntitle: Y\nstatus: done\nsession: s2\npart-of: module:p-plans\n---\n\n# Y\n');
fs.writeFileSync(path.join(docs, 'other.md'), '---\nnode: module:other\ntitle: O\n---\n\nSee plan:plan-x and plan:plan-y.\n\n- [ ] task:o.one Do #open (part-of: plan:plan-x)\n');
fs.writeFileSync(path.join(tmp, '_sessions/s1.json'), JSON.stringify({ id: 's1', status: 'running', planDoc: 't/p/plan-x', refs: ['task:plan-x'] }));
fs.writeFileSync(path.join(tmp, '_sessions/s2.json'), JSON.stringify({ id: 's2', status: 'done', planDoc: 't/p/plan-y' }));
const r = migrate(tmp, {});
assert.deepStrictEqual(r.docs.sort(), ['pr-x', 'pr-y']);
assert.ok(!fs.existsSync(path.join(docs, 'plan-x.md')) && fs.existsSync(path.join(docs, 'pr-x.md')));
const x = fs.readFileSync(path.join(docs, 'pr-x.md'), 'utf8');
assert.match(x, /^node: pr:pr-x$/m); assert.match(x, /^type: pr$/m); assert.match(x, /^status: refining$/m); assert.match(x, /^part-of: module:p-prs$/m); assert.match(x, /- \[ \] task:pr-x X/);
assert.match(fs.readFileSync(path.join(docs, 'pr-y.md'), 'utf8'), /^status: done$/m);
const rq = fs.readFileSync(path.join(docs, 'prs.md'), 'utf8');
assert.ok(!fs.existsSync(path.join(docs, 'plans.md'))); assert.match(rq, /^node: module:p-prs$/m); assert.match(rq, /^title: PRs$/m); assert.match(rq, /view:pr/);
const o = fs.readFileSync(path.join(docs, 'other.md'), 'utf8');
assert.match(o, /See pr:pr-x and pr:pr-y\./); assert.match(o, /part-of: pr:pr-x/);
const s1 = JSON.parse(fs.readFileSync(path.join(tmp, '_sessions/s1.json'), 'utf8'));
assert.strictEqual(s1.prDoc, 't/p/pr-x'); assert.strictEqual(s1.planDoc, undefined); assert.deepStrictEqual(s1.refs, ['task:pr-x']);
assert.strictEqual(migrate(tmp, {}).docs.length, 0); // idempotent
console.log('plans-to-prs: ok');
