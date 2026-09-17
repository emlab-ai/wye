import { describe, it, expect } from 'vitest';
import { describeScene } from './annotations';

// an image 1000×500 at 0,0; a labelled box top-right; an ellipse bottom-left; an arrow between them with a label; a free label
const els = [
  { id: 'img', type: 'image', x: 0, y: 0, width: 1000, height: 500, fileId: 'f1', customData: { asset: 'assets/screen.png' } },
  { id: 'box', type: 'rectangle', x: 700, y: 20, width: 200, height: 60, boundElements: [{ id: 'box-t', type: 'text' }, { id: 'arr', type: 'arrow' }] },
  { id: 'box-t', type: 'text', text: 'Login button', containerId: 'box', x: 710, y: 30, width: 100, height: 20 },
  { id: 'ell', type: 'ellipse', x: 50, y: 380, width: 200, height: 100, boundElements: [{ id: 'ell-t', type: 'text' }, { id: 'arr', type: 'arrow' }] },
  { id: 'ell-t', type: 'text', text: 'Dashboard', containerId: 'ell', x: 60, y: 400, width: 100, height: 20 },
  { id: 'arr', type: 'arrow', x: 700, y: 80, width: -500, height: 300, points: [[0, 0], [-500, 300]], startBinding: { elementId: 'box' }, endBinding: { elementId: 'ell' }, boundElements: [{ id: 'arr-t', type: 'text' }] },
  { id: 'arr-t', type: 'text', text: 'submits', containerId: 'arr', x: 450, y: 220, width: 60, height: 20 },
  { id: 'free', type: 'text', text: 'needs a loading state', x: 400, y: 450, width: 200, height: 20 },
  { id: 'loose', type: 'arrow', x: 500, y: 250, width: 190, height: -200, points: [[0, 0], [190, -200]] },
  { id: 'gone', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, isDeleted: true },
];

describe('describeScene', () => {
  const out = describeScene(els);
  it('names the image and its size', () => { expect(out).toContain('image assets/screen.png, 1000×500'); });
  it('describes labelled regions with their position on the image', () => {
    expect(out).toContain('region "Login button" — rectangle, top-right (x 70–90%, y 4–16%)');
    expect(out).toContain('region "Dashboard" — ellipse, bottom-left (x 5–25%, y 76–96%)');
  });
  it('describes arrows by what they connect', () => {
    expect(out).toContain('arrow "submits" from "Login button" to "Dashboard"');
    expect(out).toContain('arrow from (50%, 50%) to (69%, 10%) — near "Login button"');
  });
  it('lists free labels with their position and skips deleted elements', () => {
    expect(out).toContain('label "needs a loading state" at (40%, 90%)');
    expect(out).not.toContain('region "" —');
  });
  it('works without an image, in canvas pixels', () => {
    const o = describeScene(els.filter(e => e.type !== 'image'));
    expect(o).toContain('region "Login button" — rectangle, at (700, 20) 200×60');
  });
});
