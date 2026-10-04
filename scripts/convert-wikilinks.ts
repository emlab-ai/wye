// Obsidian [[links]] left in a product's pages (imported before lib:wikilinks) → Wye links, by the same lookup an import
// uses: the product's things by name and alias, then its pages. Run: node_modules/.bin/jiti scripts/convert-wikilinks.ts <product> [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { graphLinks, convertWikilinks } from '../packages/web/src/lib/wikilinks';
const product = process.argv[2]; const dry = process.argv.includes('--dry-run');
const root = path.join(__dirname, '..', 'data', 'products', product);
const graph = JSON.parse(readFileSync(`${root}/_build/graph.json`, 'utf8'));
const links = graphLinks(graph);
let pages = 0, done = 0; const left = new Map<string, number>();
for (const proj of readdirSync(`${root}/projects`)) {
  const dir = `${root}/projects/${proj}/docs`; let files: string[] = []; try { files = readdirSync(dir).filter(f => f.endsWith('.md')); } catch { continue; }
  for (const f of files) {
    const p = path.join(dir, f); const text = readFileSync(p, 'utf8'); if (!text.includes('[[')) continue;
    const c = convertWikilinks(text, n => links.entities(n) ?? links.pages(n));
    for (const u of c.unresolved) left.set(u, (left.get(u) ?? 0) + 1);
    if (c.resolved) { pages++; done += c.resolved; if (!dry) writeFileSync(p, c.text); }
  }
}
console.log(`${dry ? 'would convert' : 'converted'} ${done} links on ${pages} pages; unresolved names: ${left.size}`);
console.log([...left].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, k]) => `  ${k}× ${n}`).join('\n'));
