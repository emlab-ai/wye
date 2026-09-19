#!/usr/bin/env node
'use strict';
// A model for the consolidation tests (WF_JUDGE_CMD): answers with the candidates the conversation on stdin marks
// with [[decision: …]], [[constraint: …]], [[question: …]], [[lesson: …]] — minus any whose title is already written.
let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => {
    const written = [...s.matchAll(/^- (\S+) — (.*)$/gm)].map(m => m[2].toLowerCase());
    const out = [];
    for (const line of s.split('\n')) {
        const h = line.match(/^#(\d+) (PERSON|AGENT): /); if (!h) continue;
        for (const m of line.matchAll(/\[\[(decision|constraint|question|lesson): ([^\]]+)\]\]/g)) {
            const title = m[2].trim(); if (written.some(w => w.includes(title.toLowerCase().slice(0, 20)))) continue;
            out.push({ kind: m[1], title, text: title + ' — said in the conversation.', by: h[2] === 'PERSON' ? 'person' : 'agent', evidence: [Number(h[1])] });
        }
    }
    process.stdout.write(JSON.stringify(out));
});
