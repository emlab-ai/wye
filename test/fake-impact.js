#!/usr/bin/env node
'use strict';
// An impact judge for the tests (WF_JUDGE_CMD): reads the prompt, answers by marker word in the candidate's text —
// UPDATE → update (the word "old" swapped for "new" in the text), REWORK → rework, CONTRA → contradicts, ASK → ask,
// everything else unaffected.
let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => {
    const cands = [...s.matchAll(/\n\[(\d+)\] (\S+) \(([^)]*)\)\n(.*)/g)];
    const out = cands.map(m => {
        const t = m[4]; const i = Number(m[1]);
        if (t.includes('UPDATE')) return { i, verdict: 'update', reason: `fake update of ${m[2]}`, update: { text: t.replace(/\bold\b/g, 'new') } };
        if (t.includes('REWORK')) return { i, verdict: 'rework', reason: `fake rework of ${m[2]}: rewrite the section` };
        if (t.includes('CONTRA')) return { i, verdict: 'contradicts', reason: `fake contradiction with ${m[2]}` };
        if (t.includes('ASK')) return { i, verdict: 'ask', reason: 'fake ask', question: `what about ${m[2]}?` };
        return { i, verdict: 'unaffected', reason: 'fake unaffected' };
    });
    process.stdout.write(JSON.stringify(out));
});
