'use strict';
// The one Wye server of a home (req:waterfall.server.one-per-home): the CLI, the agents and every window use the same
// server, and the CLI starts it, without a window, when nothing answers (req:waterfall.server.cli-starts-it) — an
// agent writing to the vault never needs the app open. The server that `wye app` runs records itself in
// <home>/.cache/server.json (its pid, port and address), so a CLI or a window finds it on whatever port it was
// started on; a server with no record (a dev server, an older Wye) is found on the default port.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const recordFile = home => path.join(home, '.cache', 'server.json');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// the record of the home's running server, or null (a record whose process is gone is removed)
function running(home) {
  let r; try { r = JSON.parse(fs.readFileSync(recordFile(home), 'utf8')); } catch { return null; }
  if (r && r.pid && alive(r.pid) && r.url) return r;
  try { fs.rmSync(recordFile(home)); } catch { /* gone */ }
  return null;
}
function record(home, r) { fs.mkdirSync(path.dirname(recordFile(home)), { recursive: true }); fs.writeFileSync(recordFile(home), JSON.stringify({ ...r, started: new Date().toISOString() }, null, 1) + '\n'); }
// removed only by the process that wrote it — a second `wye app` that found the server running leaves it
function unrecord(home, pid = process.pid) { const r = (() => { try { return JSON.parse(fs.readFileSync(recordFile(home), 'utf8')); } catch { return null; } })(); if (r && r.pid === pid) try { fs.rmSync(recordFile(home)); } catch { /* gone */ } }

const defaultUrl = () => `http://localhost:${process.env.WYE_PORT || 3456}`;
// where the home's server is, or would be started: its record's address, else the default port
const urlOf = home => (running(home) || {}).url || defaultUrl();
// any HTTP answer counts (a dev server mid-compile still owns the port); plain http, not fetch — the CLI's fetch starts
// the server when nothing answers, and this is how it asks
const answers = (url, ms = 1500) => new Promise(res => {
  const r = require('http').get(`${url}/api/products`, x => { x.resume(); res(true); });
  r.on('error', () => res(false)); r.setTimeout(ms, () => { r.destroy(); res(false); });
});

// The home's server, started without a window when nothing answers: `wye app --no-open` detached from this process
// (it outlives the command that started it, restarts itself past the memory cap), its output in
// <home>/.cache/server.log. Two commands starting at once start one server: the first takes a lock file, the others
// wait for the address to answer. Resolves to the address; throws with the log's tail when the server does not come up.
async function ensure(home, { quiet = false } = {}) {
  const url = urlOf(home);
  if (await answers(url)) return url;
  const port = new URL(url).port || '3456';
  const lock = path.join(home, '.cache', 'server.lock'), log = path.join(home, '.cache', 'server.log');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  // a recorded owner is alive but its server does not answer yet: it is starting or restarting (past the memory cap) —
  // wait for it, never start a second one on its port
  const owner = running(home);
  let mine = false;
  if (!owner) try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); mine = true; }
  catch { try { if (Date.now() - fs.statSync(lock).mtimeMs > 150e3) { fs.rmSync(lock); fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); mine = true; } } catch { /* another took it */ } }
  let exited = null;
  if (mine) {
    if (!quiet) console.error(`wye: no Wye server answers on ${url} — starting it without a window (log: ${log}; wye server stop ends it)`);
    const fd = fs.openSync(log, 'a');
    const env = { ...process.env, WYE_HOME: home, WYE_PORT: port }; delete env.WYE_URL; delete env.WF_URL; delete env.WYE_SESSION; delete env.WF_SESSION; delete env.WYE_PRODUCT; delete env.WF_PRODUCT; delete env.WYE_READONLY;
    const child = spawn(process.execPath, [path.join(__dirname, 'wye.js'), 'app', '--no-open', '--port', port], { cwd: home, env, detached: true, stdio: ['ignore', fd, fd] });
    child.on('exit', code => { exited = code; }); child.unref(); fs.closeSync(fd);
  } else if (!quiet) console.error(`wye: the Wye server is starting (${owner ? `pid ${owner.pid}` : 'another command started it'}) — waiting for ${url}`);
  try {
    for (let i = 0; i < 360; i++) {
      if (await answers(url)) return url;
      if (exited !== null) break;
      await new Promise(r => setTimeout(r, 500));
    }
  } finally { if (mine) try { fs.rmSync(lock); } catch { /* gone */ } }
  const tail = (() => { try { return fs.readFileSync(log, 'utf8').split('\n').slice(-12).join('\n'); } catch { return ''; } })();
  throw new Error(`the Wye server did not come up on ${url}${exited !== null ? ` (exit ${exited})` : ' after three minutes'}${/EADDRINUSE/.test(tail) ? ` — port ${port} is taken by a process that does not answer; stop it or set WYE_PORT` : ''}\n${tail}`);
}

// stop the home's recorded server (the `wye app` process owning it, which takes its server down with it)
async function stop(home) {
  const r = running(home); if (!r) return null;
  try { process.kill(r.pid, 'SIGTERM'); } catch { /* gone */ }
  for (let i = 0; i < 40 && alive(r.pid); i++) await new Promise(res => setTimeout(res, 250));
  if (alive(r.pid)) try { process.kill(r.pid, 'SIGKILL'); } catch { /* gone */ }
  unrecord(home, r.pid);
  return r;
}

module.exports = { recordFile, running, record, unrecord, urlOf, defaultUrl, answers, ensure, stop };
