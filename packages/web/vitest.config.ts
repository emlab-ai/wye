import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node', passWithNoTests: true },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
