'use strict';
// `wye eval ask` (decision:wf2.ask-two-lanes): the retriever's recall@k over eval/ask/questions.json — a question
// scores 1 when any expected ref (a node id, or a code path prefix) is among the top k passages, with graph expansion
// on as the fast lane uses it. Exit 2 when overall recall < 0.6.
const fs = require('fs'); const path = require('path');
const WF_URL = process.env.WYE_URL || process.env.WF_URL || 'http://localhost:3456';
async function run({ product, k = 10, rerank = false }) {
  const qs = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8')); const rows = [];
  for (const { q, expect } of qs) {
    const r = await fetch(`${WF_URL}/api/${product}/search?${new URLSearchParams({ q, limit: String(k), expand: '1', ...(rerank ? { rerank: '1' } : {}) })}`); const j = await r.json();
    const refs = (j.hits || []).slice(0, k).map(h => h.ref);
    const hit = expect.some(e => refs.some(ref => ref === e || ref.startsWith(e + ':')));
    rows.push({ q, hit, top: refs.slice(0, 3) });
  }
  return { k, recall: rows.filter(r => r.hit).length / rows.length, rows };
}
function print(r, { json } = {}) {
  if (json) return console.log(JSON.stringify(r, null, 2));
  for (const x of r.rows) console.log(`${x.hit ? '✓' : '✗'} ${x.q}${x.hit ? '' : `\n    top: ${x.top.join(', ')}`}`);
  console.log(`\nrecall@${r.k}: ${(r.recall * 100).toFixed(0)}% (${r.rows.filter(x => x.hit).length}/${r.rows.length})`);
}
module.exports = { run, print };
