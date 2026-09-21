'use strict';
// The running app as the harness sees it (WF_URL): the semantic hits for a text (op:api.context), the constraint
// packet (op:api.packet), a resolved reference and the agent contract. Every answer that depends on a model — the
// embedding model behind `context` — goes through a Recording so a replay needs no app and no model.
const { Recording } = require('./record');

const WF_URL = (process.env.WF_URL || 'http://localhost:3456').replace(/\/$/, '');

async function api(method, p, body) {
    const r = await fetch(WF_URL + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) throw new Error(`${method} ${p} → ${r.status}: ${(j.message || j.error || text).toString().slice(0, 200)}`);
    return j;
}
async function online() { try { const r = await fetch(WF_URL + '/api/products', { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; } }

// semantic hits for a text: [{ id, score, semantic, keyword }], the hidden count; recorded per (product, text, limit, all)
function semanticRecorder(product, { live } = {}) {
    const rec = new Recording(`semantic-${product}`, { live });
    return {
        rec,
        async hits(text, { limit = 20, all = false } = {}) {
            return rec.get({ product, text, limit, all }, async () => { const j = await api('POST', `/api/${product}/context`, { text, limit, all }); return { hits: j.hits.map(h => ({ id: h.id, score: h.score, semantic: h.semantic, keyword: h.keyword })), hidden: j.hidden || 0 }; }, { what: `context "${text.slice(0, 60)}"`, meta: { model: 'Xenova/all-MiniLM-L6-v2' } });
        },
    };
}

module.exports = { WF_URL, api, online, semanticRecorder };
