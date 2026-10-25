'use strict';
// The passwords of workspaces at an address (req:waterfall.remote-ws.url): a Wye served elsewhere behind a proxy that
// asks for a user and a password (docs/server.md). Kept on this machine only, in one file readable by the person alone
// (~/.wye/credentials.json, 0600; WYE_CREDENTIALS moves it) — never in the app's settings or a vault, which can be
// committed. Keyed by the address; read by the CLI (bin/wye.js) and by the window and the app (lib/remote).
const fs = require('fs');
const os = require('os');
const path = require('path');

const file = () => process.env.WYE_CREDENTIALS ? path.resolve(process.env.WYE_CREDENTIALS) : path.join(os.homedir(), '.wye', 'credentials.json');
const key = url => { const u = new URL(url); return (u.origin + u.pathname).replace(/\/+$/, ''); };
function readAll() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) || {}; } catch { return {}; } }
function writeAll(all) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = file() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(all, null, 1) + '\n', { mode: 0o600 }); fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, file());
}
// the stored user and password for an address (or the one whose path it is under), else null
function get(url) {
  const all = readAll(); let k; try { k = key(url); } catch { return null; }
  for (let p = k; p.includes('//'); p = p.slice(0, p.lastIndexOf('/'))) { if (all[p]) return all[p]; if (!p.slice(p.indexOf('//') + 2).includes('/')) break; }
  return null;
}
function set(url, user, password) { const all = readAll(); all[key(url)] = { user: String(user), password: String(password) }; writeAll(all); }
function remove(url) { const all = readAll(); delete all[key(url)]; writeAll(all); }
// the Authorization header for a request to that address, or null
function header(url) { const c = get(url); return c ? 'Basic ' + Buffer.from(`${c.user}:${c.password}`).toString('base64') : null; }

module.exports = { file, get, set, remove, header };
