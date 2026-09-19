#!/usr/bin/env node
'use strict';
// A judge for the tests (WF_JUDGE_CMD): reads the prompt, answers by rule — a pair whose texts share the marker
// word "CONTRA" contradicts (static), "SAME" duplicates, "NARROW" refines, everything else is consistent.
let s = ''; process.stdin.on('data', d => { s += d; }).on('end', () => {
    const pairs = [...s.matchAll(/\n\[(\d+)\]\nA \(([^)]*)\): (.*)\nB \(([^)]*)\): (.*)/g)];
    const out = pairs.map(m => { const both = m[3] + ' ' + m[5]; const has = w => m[3].includes(w) && m[5].includes(w); return { i: Number(m[1]), kind: has('CONTRA') ? 'contradicts' : has('SAME') ? 'duplicate' : has('NARROW') ? 'refines' : 'consistent', conflict: has('CONTRA') ? (both.includes('LATER') ? 'dynamic' : 'static') : null, reason: `fake verdict on ${m[2].split(',')[0]} vs ${m[4].split(',')[0]}` }; });
    process.stdout.write(JSON.stringify(out));
});
