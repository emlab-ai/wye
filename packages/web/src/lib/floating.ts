// Where a link between two nodes should touch them (decision:map.links-take-the-nearest-sides): the canvas draws every
// edge from the side of one card that faces the other, so a node below its parent is joined bottom to top and one to
// the left is joined left to right — never the long sweep a fixed right-to-left handle pair gives. Pure geometry over
// two boxes; the canvas turns it into a curve.
export type Box = { x: number; y: number; w: number; h: number };
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type End = { x: number; y: number; side: Side };

// The point where the line joining the two centres leaves box `a`, and the side it leaves through. `gap` holds the
// point that far off the box, so an arrowhead sits beside a card instead of on its border.
export function edgeEnd(a: Box, b: Box, gap = 0): End {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const dx = b.x + b.w / 2 - ax, dy = b.y + b.h / 2 - ay;
  const hw = a.w / 2, hh = a.h / 2;
  // through a left or right side when the direction is flatter than the box's own diagonal
  if (dx !== 0 && Math.abs(dx) * hh >= Math.abs(dy) * hw) {
    return { x: ax + Math.sign(dx) * (hw + gap), y: ay + (dy * hw) / Math.abs(dx), side: dx > 0 ? 'right' : 'left' };
  }
  if (dy !== 0) return { x: ax + (dx * hh) / Math.abs(dy), y: ay + Math.sign(dy) * (hh + gap), side: dy > 0 ? 'bottom' : 'top' };
  return { x: ax + hw + gap, y: ay, side: 'right' };   // one card exactly over the other: pick a side and move on
}

// Both ends of one link, each facing the other card.
export function edgeEnds(a: Box, b: Box, gap = 0): { from: End; to: End } { return { from: edgeEnd(a, b, gap), to: edgeEnd(b, a, gap) }; }
