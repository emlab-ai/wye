#!/usr/bin/env node
'use strict';
// Before packing: Turbopack loads the server's external packages (next.config.ts serverExternalPackages) through
// hashed aliases — packages/web/.next/node_modules/@duckdb/node-api-<hash> → the real package — and npm does not pack
// symlinks. This writes the aliases to .next/wye-externals.json; `wye app` recreates them (bin/wye-home.js#prepareApp).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'packages', 'web', '.next', 'node_modules');
const out = {};
const walk = (d, prefix) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory() && e.name.startsWith('@') && !prefix) walk(path.join(d, e.name), e.name);
    else if (e.isSymbolicLink()) { const m = name.match(/^(.*)-[0-9a-f]{16}$/); if (m) out[name] = m[1]; }
  }
};
if (fs.existsSync(dir)) walk(dir, '');
fs.writeFileSync(path.join(dir, '..', 'wye-externals.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`externals: ${Object.keys(out).length ? Object.entries(out).map(([a, p]) => `${p} (${a})`).join(', ') : 'none'}`);
