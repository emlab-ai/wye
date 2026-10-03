import { describe, it, expect } from 'vitest';
import { dot, toVector } from './embed';

describe('vectors', () => {
  it('dot multiplies pairwise', () => { expect(dot([1, 2, 3], new Float32Array([1, 0, 2]))).toBe(7); });
  it('toVector rounds to float32 and pads or cuts to the dimension', () => {
    expect(toVector([0.5, 0.25], 3)).toEqual([0.5, 0.25, 0]);
    expect(toVector([1, 2, 3, 4], 2)).toEqual([1, 2]);
  });
});
