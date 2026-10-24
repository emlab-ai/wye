import { defineConfig } from 'vitest/config';
import path from 'node:path';
import os from 'node:os';
// tests keep their caches in a temp folder and never move a real vault's _build/ (lib/cache-home)
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node', passWithNoTests: true, env: { WYE_INDEX_WARM: '0', WYE_CACHE: process.env.WYE_CACHE || path.join(os.tmpdir(), `wye-test-cache-${process.pid}`), WYE_CACHE_MOVE: '0', WYE_WATCH_ON_LOAD: '0', WYE_AUTOSTART: '0' } },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
