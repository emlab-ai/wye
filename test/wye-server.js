'use strict';
// The home's one server (bin/wye-server, req:waterfall.server.one-per-home): its record is found while its process
// lives and dropped when it is gone; only the process that wrote it removes it; a server answering is used, never a
// second one started; a command that reaches no server with WYE_AUTOSTART=0 fails as before instead of starting one.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { execFileSync } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wye-server-'));
const srv = require('../bin/wye-server');

(async () => {
  assert.strictEqual(srv.running(home), null, 'no record, no server');
  srv.record(home, { pid: process.pid, port: 4999, url: 'http://localhost:4999' });
  assert.strictEqual(srv.running(home).url, 'http://localhost:4999');
  assert.strictEqual(srv.urlOf(home), 'http://localhost:4999', 'the CLI goes where the record says');
  srv.unrecord(home, process.pid + 1);
  assert.ok(srv.running(home), 'another process never removes the record');
  srv.unrecord(home);
  assert.strictEqual(srv.running(home), null);
  srv.record(home, { pid: 2 ** 22 + 12345, port: 4999, url: 'http://localhost:4999' });
  assert.strictEqual(srv.running(home), null, 'a record whose process is gone is dropped');
  assert.ok(!fs.existsSync(srv.recordFile(home)));

  // a server already answering is the one used: ensure returns at once and starts nothing
  const s = http.createServer((q, r) => r.end('[]')); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; process.env.WYE_PORT = String(port);
  assert.strictEqual(await srv.answers(`http://localhost:${port}`), true);
  assert.strictEqual(await srv.ensure(home, { quiet: true }), `http://localhost:${port}`);
  assert.ok(!fs.existsSync(path.join(home, '.cache', 'server.log')), 'nothing was started');
  s.close();
  assert.strictEqual(await srv.answers(`http://localhost:${port}`), false);

  // WYE_AUTOSTART=0: a command reaching no server fails, nothing is started
  const vault = path.join(home, 'v'); fs.mkdirSync(path.join(vault, '.wye'), { recursive: true });
  fs.writeFileSync(path.join(vault, '.wye', '_product.md'), '---\nslug: v\ntitle: V\n---\n');
  let err = '';
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'wye.js'), 'inbox'], { cwd: vault, env: { ...process.env, WYE_HOME: home, WYE_PORT: String(port), WYE_AUTOSTART: '0' }, stdio: 'pipe' }); }
  catch (e) { err = String(e.stderr); }
  assert.match(err, /fetch failed|ECONNREFUSED/);
  assert.ok(!fs.existsSync(path.join(home, '.cache', 'server.log')), 'WYE_AUTOSTART=0 starts nothing');

  fs.rmSync(home, { recursive: true, force: true });
  console.log('wye-server: ok');
})().catch(e => { console.error(e); process.exit(1); });
