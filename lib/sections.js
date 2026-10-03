'use strict';
// One `## ` section of a document written whole (`wye doc write --section`, the app's section writers): the section's
// body is replaced and its heading kept. A section the page does not have yet goes where it belongs on a request page
// (decision:wf2.pr-summary-first) — Request, Summary, Context, Analysis, Definition, Impact, Questions, Tasks, Result —
// before the first section that comes after it; a section that order does not know goes at the end.
const ORDER = ['Request', 'Summary', 'Context', 'Analysis', 'Definition', 'Impact', 'Questions', 'Tasks', 'Result'];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function withSection(md, heading, body) {
    const h = String(heading).trim();
    const text = String(body).replace(/^\s*## [^\n]*\n/, '').trim();
    const m = md.match(new RegExp(`^## ${esc(h)}[^\\n]*\\n`, 'm'));
    if (m) {
        const start = m.index + m[0].length; const rest = md.slice(start); const next = rest.search(/^## /m);
        return md.slice(0, start) + `\n${text}\n` + (next < 0 ? '' : `\n${rest.slice(next)}`);
    }
    const at = ORDER.indexOf(h);
    if (at >= 0) for (const later of ORDER.slice(at + 1)) {
        const n = md.match(new RegExp(`^## ${esc(later)}[^\\n]*\\n`, 'm'));
        if (n) return `${md.slice(0, n.index).replace(/\s+$/, '')}\n\n## ${h}\n\n${text}\n\n${md.slice(n.index)}`;
    }
    return `${md.replace(/\s+$/, '')}\n\n## ${h}\n\n${text}\n`;
}

module.exports = { withSection, SECTION_ORDER: ORDER };
