import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { productRepo, REPO_ROOT, type Product } from './products';

const p = (repo?: string) => ({ slug: 'x', dir: '/d', graphPath: '', meta: { title: '', icon: '', description: '', kind: '', status: '', settings: {}, ...(repo !== undefined ? { repo } : {}) } }) as Product;
describe('productRepo', () => {
  it('is null when the product names no repo', () => { expect(productRepo(p())).toBeNull(); expect(productRepo(p(''))).toBeNull(); });
  it('takes an absolute path as it is', () => { expect(productRepo(p('/src/app'))).toBe('/src/app'); });
  it('resolves a relative path against the repo the app runs from, not the server cwd', () => {
    expect(productRepo(p('.'))).toBe(REPO_ROOT); expect(productRepo(p('../other'))).toBe(path.resolve(REPO_ROOT, '../other'));
  });
});
