// Wye desktop. The Electron main process owns the app server (Next.js) as a child process, waits until it
// answers, and opens the window on it. Agent processes (Claude Code, Codex) are children of that server, so they
// live and die with the app. Closing the last window quits and takes the server and every agent with it.
'use strict';
const { app, BrowserWindow, Menu, shell, Tray, nativeImage, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const fs = require('node:fs');

// The checkout Wye runs over — the folder with package.json (name "wye"), packages/web and data/products. From the
// source tree it is the repo two levels up; a packaged app (Wye.app, AppImage) takes WYE_ROOT, then the folder it was
// told once (config.json in the app's user-data folder), else asks for it at first launch.
let ROOT = null;
const PORT = Number(process.env.WYE_PORT || 3456);
const URL_ = `http://localhost:${PORT}`;
const DEV = !!process.env.WYE_DEV;
let server = null; let win = null; let tray = null; let quitting = false; let status = null;

const configFile = () => path.join(app.getPath('userData'), 'config.json');
// stdout of a packaged app goes nowhere a person looks: every line also lands in desktop.log next to config.json
const logFile = () => path.join(app.getPath('userData'), 'desktop.log');
function dlog(...a) { const line = `${new Date().toISOString()} ${a.join(' ')}`; console.log(line); try { fs.mkdirSync(path.dirname(logFile()), { recursive: true }); fs.appendFileSync(logFile(), line + '\n'); } catch { /* no log */ } }
function readConfig() { try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')); } catch { return {}; } }
function writeConfig(c) { fs.mkdirSync(path.dirname(configFile()), { recursive: true }); fs.writeFileSync(configFile(), JSON.stringify(c, null, 2)); }
function isWyeRoot(dir) {
  try { const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); return pkg.name === 'wye' && fs.existsSync(path.join(dir, 'packages/web/package.json')); } catch { return false; }
}
async function resolveRoot() {
  const tried = [process.env.WYE_ROOT, readConfig().root, app.isPackaged ? null : path.resolve(__dirname, '../..')].filter(Boolean);
  for (const c of tried) if (isWyeRoot(c)) return c;
  for (;;) {
    const { response } = await dialog.showMessageBox({ type: 'info', title: 'Wye', message: 'Where is your Wye checkout?', detail: 'Wye runs over the files of a git clone of github.com/emlab-ai/wye — the folder with package.json and data/products. Choose it once; the app remembers it (File › Choose checkout… changes it).', buttons: ['Choose folder…', 'Quit'], defaultId: 0, cancelId: 1 });
    if (response !== 0) return null;
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Choose the Wye checkout' });
    const dir = !r.canceled && r.filePaths[0];
    if (!dir) continue;
    if (!isWyeRoot(dir)) { await dialog.showMessageBox({ type: 'error', title: 'Wye', message: 'That folder is not a Wye checkout', detail: `Expected ${path.join(dir, 'package.json')} (name "wye") and packages/web inside it. Clone https://github.com/emlab-ai/wye first.` }); continue; }
    writeConfig({ ...readConfig(), root: dir }); return dir;
  }
}

// A GUI app on macOS and Linux starts with a bare PATH (no nvm, no homebrew, no ~/.local/bin): take the PATH the
// person's login shell has, so npm, node, claude and codex are found the same way as in a terminal.
function fixPath() {
  if (process.platform === 'win32' || !app.isPackaged) return;
  try {
    const sh = process.env.SHELL || '/bin/bash';
    const out = require('node:child_process').execFileSync(sh, ['-ilc', 'echo -n "$PATH"'], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
    if (out.trim()) process.env.PATH = out.trim();
  } catch (e) { dlog('[desktop] could not read the shell PATH:', e.message); }
}

// A small window that says what the first launch is doing (installing, building, starting) — the main window opens
// only once the server answers.
function showStatus(text) {
  if (!status) {
    status = new BrowserWindow({ width: 460, height: 150, resizable: false, minimizable: false, maximizable: false, fullscreenable: false, title: 'Wye', backgroundColor: '#141614', show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    status.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="margin:0;background:#141614;color:#e8e8e4;font:15px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;padding:0 28px;text-align:center"><div><div style="font-weight:700;font-size:20px;margin-bottom:8px">Wye</div><div id="m"></div></div></body>'));
    status.once('ready-to-show', () => status && status.show());
    status.on('closed', () => { status = null; });
  }
  status.webContents.executeJavaScript(`document.getElementById('m').textContent = ${JSON.stringify(text)}`).catch(() => {});
}
function hideStatus() { if (status) { status.close(); status = null; } }

// npm in the checkout, output to .cache/desktop-web.log; resolves on exit 0, rejects otherwise.
function npm(args, label) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
    const log = fs.openSync(path.join(ROOT, '.cache/desktop-web.log'), 'a');
    fs.writeSync(log, `\n[desktop] ${new Date().toISOString()} ${label}: npm ${args.join(' ')}\n`);
    const p = spawn('npm', args, { cwd: ROOT, env: { ...process.env, BROWSER: 'none' }, stdio: ['ignore', log, log] });
    p.on('error', reject);
    p.on('exit', code => { fs.closeSync(log); code === 0 ? resolve() : reject(new Error(`${label} failed (npm exit ${code}). See ${path.join(ROOT, '.cache/desktop-web.log')}`)); });
  });
}

// First launch from a fresh clone: dependencies, then the production build of the web app (a few minutes, once).
async function ensureBuilt() {
  if (!fs.existsSync(path.join(ROOT, 'node_modules/next/package.json'))) { showStatus('Installing dependencies (first launch, a few minutes)…'); await npm(['install'], 'install'); }
  if (!DEV && !fs.existsSync(path.join(ROOT, 'packages/web/.next/BUILD_ID'))) { showStatus('Building the web app (first launch, a few minutes)…'); await npm(['run', 'build', '--workspace=packages/web'], 'build'); }
}

// Is something answering on the port? Any HTTP answer counts — a dev server mid-compile or showing a build error
// still owns the port, and a second `next dev` there would only fail with EADDRINUSE. The timeout is generous for
// the same reason (Turbopack can hold a request for seconds while it rebuilds).
function ping() { return new Promise(res => { const r = http.get(URL_ + '/api/products', x => { res(true); x.resume(); }); r.on('error', () => res(false)); r.setTimeout(6000, () => { r.destroy(); res(false); }); }); }

async function startServer() {
  if (await ping()) { dlog(`server already running at ${URL_}; attaching`); return; }
  const args = DEV ? ['--workspace=packages/web', 'run', 'dev', '--', '-p', String(PORT)] : ['--workspace=packages/web', 'run', 'start', '--', '-p', String(PORT)];
  // The server runs in its own process group with its output in a log file, so a desktop relaunch (hot reload)
  // leaves it running and a real quit can take the whole group down.
  fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
  const log = fs.openSync(path.join(ROOT, '.cache/desktop-web.log'), 'a');
  dlog(`[desktop] starting the web server (${DEV ? 'dev' : 'production'}); log: .cache/desktop-web.log`);
  showStatus('Starting the server…');
  server = spawn('npm', args, { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BROWSER: 'none' }, stdio: ['ignore', log, log], detached: true });
  server.on('error', e => { server = null; if (!quitting) dialog.showErrorBox('Wye', `Could not start npm in ${ROOT}: ${e.message}. Is Node.js installed and on the PATH of your login shell?`); });
  let exited = null;
  server.on('exit', code => { server = null; exited = code; });
  for (let i = 0; i < 240; i++) {
    if (await ping()) return;
    if (exited !== null) {
      // the usual reason: another server already holds the port (EADDRINUSE) — attach to it if it answers now
      if (await ping()) return;
      const tail = (() => { try { return fs.readFileSync(path.join(ROOT, '.cache/desktop-web.log'), 'utf8').split('\n').slice(-12).join('\n'); } catch { return ''; } })();
      throw new Error(`The app server stopped (exit ${exited}).${/EADDRINUSE/.test(tail) ? ` Port ${PORT} is taken by another process that does not answer — stop it, or start Wye with WYE_PORT=<other port>.` : ''} See .cache/desktop-web.log in the checkout.`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`the app server did not answer on ${URL_} after two minutes; see .cache/desktop-web.log in the checkout`);
}

function createWindow() {
  // standard OS title bar and window controls on every platform
  win = new BrowserWindow({ width: 1500, height: 960, minWidth: 900, minHeight: 600, title: 'Wye', backgroundColor: '#141614', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.loadURL(URL_);
  // an app link the page opens as a new window (target=_blank) stays in this window; File › New window is the way
  // to get a second one (rule:app-link)
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(URL_)) { if (win) win.loadURL(url); } else shell.openExternal(url); return { action: 'deny' }; });
  // a click on a foreign link (a transcript, a document) opens the system browser; the window stays on the app (rule:app-link)
  win.webContents.on('will-navigate', (ev, url) => { if (url.startsWith(URL_)) return; ev.preventDefault(); shell.openExternal(url); });
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [{ label: 'New window', accelerator: 'CmdOrCtrl+N', click: createWindow }, { label: 'Open in browser', click: () => shell.openExternal(win ? win.webContents.getURL() : URL_) }, { label: 'Choose checkout…', click: chooseRoot }, { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => win && win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() }, { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => win && win.webContents.navigationHistory.canGoForward() && win.webContents.navigationHistory.goForward() }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOUlEQVQ4T2NkYGD4z0ABYBzVQBBQLYCIAgwMDP8ZGBgYGRkZ/zMwMEA8Q2gYGBhAgBHmBQYGBgYAeF0EBTz0X1UAAAAASUVORK5CYII=');
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Wye');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Wye', click: () => { if (win) win.show(); else createWindow(); } }, { label: 'Sessions', click: () => { if (!win) createWindow(); win.loadURL(URL_ + '/'); } }, { type: 'separator' }, { role: 'quit' }]));
}

// Hot reload. The page itself hot-reloads through Next.js Fast Refresh (the window loads the dev server). The
// Electron side relaunches itself when a file in packages/desktop changes.
function watchSelf() {
  const fs = require('node:fs');
  let timer = null;
  try {
    fs.watch(__dirname, { recursive: true }, (_ev, file) => {
      if (!file || !/\.(js|json)$/.test(file) || file.includes('node_modules')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { dlog(`[desktop] ${file} changed — relaunching`); quitting = true; relaunching = true; if (server) server.unref(); app.relaunch(); app.exit(0); }, 300);
    });
  } catch (e) { dlog('[desktop] cannot watch for changes:', e.message); }
}

// File › Choose checkout…: remember another folder and relaunch on it (the server of the old one is left running
// only if it was not ours).
async function chooseRoot() {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose the Wye checkout' });
  const dir = !r.canceled && r.filePaths[0];
  if (!dir) return;
  if (!isWyeRoot(dir)) { dialog.showErrorBox('Wye', `${dir} is not a Wye checkout (package.json named "wye" with packages/web).`); return; }
  writeConfig({ ...readConfig(), root: dir });
  quitting = true; app.relaunch({ env: { ...process.env, WYE_ROOT: dir } }); app.quit();
}

app.whenReady().then(async () => {
  fixPath();
  ROOT = await resolveRoot();
  if (!ROOT) { app.quit(); return; }
  dlog(`[desktop] checkout: ${ROOT}; log: ${logFile()}`);
  buildMenu();
  if (DEV) watchSelf();
  try { await ensureBuilt(); await startServer(); } catch (e) { hideStatus(); dialog.showErrorBox('Wye', e.message); app.quit(); return; }
  hideStatus();
  createWindow(); createTray();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => { app.quit(); });
let relaunching = false;
app.on('before-quit', () => { quitting = true; if (server && !relaunching) { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } } });
