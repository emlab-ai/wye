// Source paths in a property's text (req:wf2.code-preview): `packages/web/src/lib/x.ts#fn`, `eval/lib/record.js:22`,
// a list of them separated by `;` or `,` — every token that reads as a file with a code-like extension, with its
// `#symbol` / `:line` kept. A `<placeholder>` in the path is not a file.
const EXT = 'ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|yml|yaml|py|go|rs|java|kt|swift|rb|php|sh|sql|toml|xml|c|h|cpp|hpp|cs|graphql|txt';
const PATH_RE = new RegExp(`(?:^|[\\s;,(\\[])((?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+\\.(?:${EXT})(?:#[A-Za-z0-9_$.]+|:\\d+)?)(?=$|[\\s;,)\\]])`, 'g');
export function codePaths(text: string): string[] {
  if (!text || text.includes('<')) return [];
  const out: string[] = [];
  for (const m of text.matchAll(PATH_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
export const CODE_KEYS = new Set(['source', 'file', 'path', 'files', 'sources', 'code', 'test', 'tests']);
