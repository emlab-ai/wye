import { describe, it, expect } from 'vitest';
import { edgeEnd, edgeEnds, type Box } from './floating';

const box = (x: number, y: number): Box => ({ x, y, w: 200, h: 40 });

describe('where a link touches a card', () => {
  it('leaves through the side that faces the other card', () => {
    const a = box(0, 0);
    expect(edgeEnd(a, box(400, 0)).side).toBe('right');
    expect(edgeEnd(a, box(-400, 0)).side).toBe('left');
    expect(edgeEnd(a, box(0, 400)).side).toBe('bottom');
    expect(edgeEnd(a, box(0, -400)).side).toBe('top');
    // straight down and a little across is still the bottom, not the corner
    expect(edgeEnd(a, box(60, 300)).side).toBe('bottom');
  });
  it('touches the box, never its centre', () => {
    const a = box(0, 0);
    const right = edgeEnd(a, box(400, 0));
    expect(right).toEqual({ x: 200, y: 20, side: 'right' });
    const below = edgeEnd(a, box(0, 400));
    expect(below).toEqual({ x: 100, y: 40, side: 'bottom' });
  });
  it('gives each end the side facing the other', () => {
    const { from, to } = edgeEnds(box(0, 0), box(0, 300));
    expect([from.side, to.side]).toEqual(['bottom', 'top']);
    expect(from.y).toBeLessThan(to.y);
  });
  it('picks a side even when one card sits on the other', () => {
    expect(edgeEnd(box(0, 0), box(0, 0)).side).toBe('right');
  });
});
