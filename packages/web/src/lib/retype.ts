// Changing a page's type changes its id (rule:doc-retype): the frontmatter node line takes the new kind and every
// reference to the old id in the product's documents is rewritten to the new one — a whole-id match, so
// `module:platform-ops` and `module:platform.x` are not touched by a rewrite of `module:platform`. Pure.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function rewriteId(md: string, from: string, to: string): { md: string; count: number } {
  // after the id: no id character, and no `.` that starts more id (a full stop ending a sentence is fine)
  const re = new RegExp(`(^|[^A-Za-z0-9_./#-])${esc(from)}(?![A-Za-z0-9_/#-]|\\.[A-Za-z0-9_])`, 'g');
  let count = 0;
  const out = md.replace(re, (_, pre: string) => { count++; return pre + to; });
  return { md: out, count };
}

// The page's own frontmatter: `node: <old kind>:<slug>` → `node: <kind>:<slug>`; the decorative `type:` line is dropped.
export function retypeFrontmatter(md: string, kind: string): { md: string; from: string; to: string } | null {
  const fm = md.match(/^---\n([\s\S]*?)\n---/); if (!fm) return null;
  const nm = fm[1].match(/^node:\s*([a-z-]+):([^\s]+)/m); if (!nm) return null;
  const from = `${nm[1]}:${nm[2]}`, to = `${kind}:${nm[2]}`;
  const lines = fm[1].split('\n').filter(l => !/^type:\s/.test(l)).map(l => l.replace(/^node:\s*.*$/, `node: ${to}`));
  return { md: '---\n' + lines.join('\n') + '\n---' + md.slice(fm[0].length), from, to };
}
