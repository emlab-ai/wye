import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// The desktop app is Electron, which has no window.prompt(): a click that asks with prompt() throws there
// ("prompt() is not supported"). Ask in the page — an inline input — instead.
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.includes('.test.') ? [p] : []; });
describe('no prompt()', () => {
  it('no component asks with window.prompt', () => {
    const src = path.resolve(__dirname, '..');
    // what runs in the window: the components and the pages
    const offenders = [...files(path.join(src, 'components')), ...files(path.join(src, 'app'))].filter(f => /(^|[^\w.])(window\.)?prompt\(/m.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''))).map(f => path.relative(src, f));
    expect(offenders).toEqual([]);
  });
});
