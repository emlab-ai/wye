import { describe, it, expect } from 'vitest';
import { parseObsidianDrawing, isObsidianDrawing, drawingName, drawingBody, visibleElements } from './obsidian-drawing';
import { plan } from './import-docs';

const CJ = 'N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcmTGAWxkbBoQBtUHgQh0ZcNDiJ8MVGHSMA5p0nIEABnIQt5InjAALBAEZN2kEZjZlRsAgCsmgL6kRuMQCNJkWGLAUB3INeHMdM0tA5AdEAFkAYQAFEDcPMVRfaQCg31zEZSY4cmwaABEOGEDPeDB8AFcYFwBdcnQoKABlRUCEUApsGCIAIXRUAGtlfHp6xlwE+kx6fDEAYgAzTdTydexOAXhgFxcgA';
const note = (block: string) => `---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n==⚠  Switch to EXCALIDRAW VIEW ⚠==\n\n# Excalidraw Data\n\n## Text Elements\nMCP ^b\n\n%%\n## Drawing\n${block}\n%%\n`;

describe('Obsidian Excalidraw notes', () => {
  it('a compressed scene is read, deleted elements dropped', () => {
    const s = parseObsidianDrawing(note('```compressed-json\n' + CJ.replace(/(.{60})/g, '$1\n') + '\n```'))!;
    expect(s.elements.map(e => e.id)).toEqual(['a', 'b']);
    expect(s.type).toBe('excalidraw');
  });
  it('a plain json scene too; an empty one has nothing visible; names come from the file', () => {
    const s = parseObsidianDrawing(note('```json\n{"type":"excalidraw","elements":[{"id":"t","type":"text","text":"  "}]}\n```'))!;
    expect(visibleElements(s)).toEqual([]);
    expect(isObsidianDrawing('V/Drawing 1.excalidraw.md', '')).toBe(true);
    expect(isObsidianDrawing('V/x.md', note(''))).toBe(true);
    expect(drawingName('V/Ex/Drawing 2025-09-24 16.54.22.excalidraw.md')).toBe('Drawing 2025-09-24 16.54.22');
  });
  it('the page is the drawing and its words', () => {
    const s = parseObsidianDrawing(note('```compressed-json\n' + CJ + '\n```'))!;
    expect(drawingBody('D', 'drawings/d.excalidraw', s)).toBe('# D\n\n![D](drawings/d.excalidraw)\n\n## Text in the drawing\n\n- MCP\n');
  });
});

describe('an import with drawings', () => {
  it('writes the scene under drawings/, a page showing it, and an embed in another note shows the drawing; empty drawings are skipped', () => {
    const p = plan([
      { path: 'V/Excalidraw/Drawing 1.excalidraw.md', text: note('```compressed-json\n' + CJ + '\n```') },
      { path: 'V/Excalidraw/Drawing 2.excalidraw.md', text: note('```json\n{"type":"excalidraw","elements":[]}\n```') },
      { path: 'V/Notes/Arch.md', text: '# Arch\n\n![[Drawing 1.excalidraw]]\n' },
    ], { project: 'p', analyse: true, existing: new Set() });
    const d = p.docs.find(x => x.from === 'V/Excalidraw/Drawing 1.excalidraw.md')!;
    expect(d.title).toBe('Drawing 1');
    expect(d.md).toContain(`![Drawing 1](drawings/${d.slug}.excalidraw)`);
    expect(d.md).toContain('status: raw'); expect(d.md).not.toContain('excalidraw-plugin');
    expect(JSON.parse(p.drawings![0].json).elements).toHaveLength(2);
    expect(p.drawings![0].to).toBe(`drawings/${d.slug}.excalidraw`);
    expect(p.docs.find(x => x.from === 'V/Notes/Arch.md')!.md).toContain(`![Drawing 1](drawings/${d.slug}.excalidraw)`);
    expect(p.skipped).toContainEqual({ path: 'V/Excalidraw/Drawing 2.excalidraw.md', reason: 'an empty drawing' });
  });
});
