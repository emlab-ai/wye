// Obsidian Excalidraw files in an import (decision:wf2.import-drawings). The plugin keeps a drawing as a markdown note
// (`<name>.excalidraw.md`, front matter `excalidraw-plugin: parsed`): a "Text Elements" list and the scene itself in a
// ```compressed-json block (LZ-string, base64) or a plain ```json one. On import it becomes a page with a Wye drawing
// on it — the scene stored as docs/drawings/<slug>.excalidraw, the page `![Title](drawings/<slug>.excalidraw)` — and
// the drawing's words listed under it, so search and agents read them. Pure.
import LZString from 'lz-string';

export type Scene = { type: 'excalidraw'; version: number; source: string; elements: Record<string, unknown>[]; appState: Record<string, unknown>; files: Record<string, unknown> };

export const isObsidianDrawing = (path: string, text: string) =>
  /\.excalidraw\.md$/i.test(path) || /^---\n[\s\S]*?^excalidraw-plugin:/m.test(text.slice(0, 2000));

// "Drawing 2025-09-24 16.54.22.excalidraw.md" → "Drawing 2025-09-24 16.54.22"
export const drawingName = (path: string) => (path.split('/').pop() ?? path).replace(/\.md$/i, '').replace(/\.excalidraw$/i, '').trim();

export function parseObsidianDrawing(text: string): Scene | null {
  const compressed = text.match(/```compressed-json\s*\n([\s\S]*?)\n```/);
  const plain = text.match(/```json\s*\n([\s\S]*?)\n```/);
  let j: { elements?: Record<string, unknown>[]; appState?: Record<string, unknown>; files?: Record<string, unknown> } | null = null;
  try {
    if (compressed) j = JSON.parse(LZString.decompressFromBase64(compressed[1].replace(/\s+/g, '')) ?? '');
    else if (plain) j = JSON.parse(plain[1]);
  } catch { return null; }
  if (!j || !Array.isArray(j.elements)) return null;
  const elements = j.elements.filter(e => !e.isDeleted);
  return { type: 'excalidraw', version: 2, source: 'wye-import', elements, appState: { viewBackgroundColor: (j.appState?.viewBackgroundColor as string) ?? '#ffffff', gridSize: null }, files: j.files ?? {} };
}

// Something to see: a shape, a line, an image, or a text with words (an empty text box is nothing).
export const visibleElements = (s: Scene) => s.elements.filter(e => !(e.type === 'text' && !String(e.text ?? '').trim()));

export const sceneTexts = (s: Scene) => [...new Set(s.elements.filter(e => e.type === 'text').map(e => String(e.text ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];

// The page body: the drawing, then its words.
export function drawingBody(title: string, src: string, s: Scene): string {
  const words = sceneTexts(s);
  return `# ${title}\n\n![${title}](${src})\n${words.length ? `\n## Text in the drawing\n\n${words.map(w => `- ${w}`).join('\n')}\n` : ''}`;
}
