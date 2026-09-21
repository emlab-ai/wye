import { NextResponse } from 'next/server';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getProduct, REPO_ROOT } from '@/lib/products';

// op:api.code (req:wf2.code-preview) — GET ?path=<file>[#<symbol>|:<line>] → the file's text from the product's code
// (its `repo:` in _product.md, else this repo), the language for the viewer, and the line a symbol is defined on
// (`#name` → the line with `function name`, `const name`, `class name`, `name(`…); 1 MB at most; a path must resolve
// inside the code root. ?dir=<folder> lists a folder instead.
const LANG: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html', yml: 'yaml', yaml: 'yaml', py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', php: 'php', sh: 'shell', bash: 'shell', sql: 'sql', xml: 'xml', toml: 'ini', ini: 'ini', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', graphql: 'graphql', dockerfile: 'dockerfile', txt: 'plaintext' };

export async function GET(req: Request, { params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = await getProduct(product); if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const root = p.meta.repo ? path.resolve(p.meta.repo) : REPO_ROOT;
  const sp = new URL(req.url).searchParams;
  const raw = (sp.get('path') ?? sp.get('dir') ?? '').trim();
  const m = raw.match(/^(.*?)(?:#([A-Za-z0-9_$.]+)|:(\d+))?$/); const rel = (m?.[1] ?? raw).replace(/^\.\//, '');
  if (!rel) return NextResponse.json({ error: 'invalid', message: 'path required' }, { status: 422 });
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return NextResponse.json({ error: 'invalid', message: 'the path leaves the code folder' }, { status: 422 });
  let st; try { st = await stat(abs); } catch { return NextResponse.json({ error: 'not_found', message: `${rel} is not in ${root}` }, { status: 404 }); }
  if (st.isDirectory()) {
    const names = (await readdir(abs, { withFileTypes: true })).filter(e => !e.name.startsWith('.') && e.name !== 'node_modules').map(e => ({ name: e.name, dir: e.isDirectory() })).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    return NextResponse.json({ root, path: rel, dir: true, entries: names });
  }
  if (st.size > 1024 * 1024) return NextResponse.json({ error: 'invalid', message: `${rel} is ${Math.round(st.size / 1024)} KB — too large to show` }, { status: 422 });
  const text = await readFile(abs, 'utf8');
  const ext = path.extname(rel).slice(1).toLowerCase(); const base = path.basename(rel).toLowerCase();
  const language = LANG[ext] ?? (base === 'dockerfile' ? 'dockerfile' : 'plaintext');
  let line = m?.[3] ? Number(m[3]) : 0;
  if (!line && m?.[2]) {
    const sym = m[2].split('.').pop()!; const esc = sym.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&');
    const re = new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\*?\\s+${esc}\\b|(?:const|let|var|class|interface|type|enum)\\s+${esc}\\b|${esc}\\s*[:=(]|def\\s+${esc}\\b|func\\s+(?:\\([^)]*\\)\\s*)?${esc}\\b)`);
    const lines = text.split('\n'); const i = lines.findIndex(l => re.test(l)); if (i >= 0) line = i + 1;
  }
  return NextResponse.json({ root, path: rel, language, text, line, size: st.size, mtime: st.mtime.toISOString() });
}
