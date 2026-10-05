import { describe, it, expect } from 'vitest';
import { toolsLine, TOOLS, type Toolchain } from './toolchain';

// the agent's prompt line: wye always, the tools found, and the ones that are not there
const t = (found: string[]): Toolchain => ({ agents: { claude: true, codex: false }, wye: { link: '', target: '', installed: true, elsewhere: false, blocked: false, onPath: true, dir: '' }, tools: Object.fromEntries(TOOLS.map(n => [n, found.includes(n)])) });

describe('toolsLine', () => {
  it('names what is there and what is not', () => {
    expect(toolsLine(t(['git', 'rg']))).toBe('- tools on this machine: `wye`, `git`, `rg`; not installed: gh, node, npm, jq, python3');
  });
  it('everything there: no missing list', () => {
    expect(toolsLine(t([...TOOLS]))).not.toContain('not installed');
  });
});
