// Wye desktop. The Electron main process owns the app server (Next.js) as a child process, waits until it
// answers, and opens the window on it. Agent processes (Claude Code, Codex) are children of that server, so they
// live and die with the app. Closing the last window quits and takes the server and every agent with it.
'use strict';
const { app, BrowserWindow, Menu, shell, Tray, nativeImage, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '../..');           // the wye repo
const PORT = Number(process.env.WYE_PORT || 3456);
const URL_ = `http://localhost:${PORT}`;
const DEV = !!process.env.WYE_DEV;
let server = null; let win = null; let tray = null; let quitting = false;

function ping() { return new Promise(res => { const r = http.get(URL_ + '/api/products', x => { res(x.statusCode < 500); x.resume(); }); r.on('error', () => res(false)); r.setTimeout(1500, () => { r.destroy(); res(false); }); }); }

async function startServer() {
  if (await ping()) { console.log(`server already running at ${URL_}; attaching`); return; }
  const args = DEV ? ['--workspace=packages/web', 'run', 'dev', '--', '-p', String(PORT)] : ['--workspace=packages/web', 'run', 'start', '--', '-p', String(PORT)];
  // The server runs in its own process group with its output in a log file, so a desktop relaunch (hot reload)
  // leaves it running and a real quit can take the whole group down.
  const fs = require('node:fs');
  fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
  const log = fs.openSync(path.join(ROOT, '.cache/desktop-web.log'), 'a');
  console.log(`[desktop] starting the web server (${DEV ? 'dev' : 'production'}); log: .cache/desktop-web.log`);
  server = spawn('npm', args, { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BROWSER: 'none' }, stdio: ['ignore', log, log], detached: true });
  server.on('exit', code => { server = null; if (!quitting) dialog.showErrorBox('Wye', `The app server stopped (exit ${code}). See .cache/desktop-web.log`); });
  for (let i = 0; i < 120; i++) { if (await ping()) return; await new Promise(r => setTimeout(r, 500)); }
  throw new Error(`the app server did not answer on ${URL_}`);
}

function createWindow() {
  // standard OS title bar and window controls on every platform
  win = new BrowserWindow({ width: 1500, height: 960, minWidth: 900, minHeight: 600, title: 'Wye', backgroundColor: '#141614', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.loadURL(URL_);
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(URL_)) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
  // a click on a foreign link (a transcript, a document) opens the system browser; the window stays on the app (rule:app-link)
  win.webContents.on('will-navigate', (ev, url) => { if (url.startsWith(URL_)) return; ev.preventDefault(); shell.openExternal(url); });
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [{ label: 'New window', accelerator: 'CmdOrCtrl+N', click: createWindow }, { label: 'Open in browser', click: () => shell.openExternal(win ? win.webContents.getURL() : URL_) }, { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' }] },
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
      timer = setTimeout(() => { console.log(`[desktop] ${file} changed — relaunching`); quitting = true; relaunching = true; if (server) server.unref(); app.relaunch(); app.exit(0); }, 300);
    });
  } catch (e) { console.warn('[desktop] cannot watch for changes:', e.message); }
}

app.whenReady().then(async () => {
  buildMenu();
  if (DEV) watchSelf();
  try { await startServer(); } catch (e) { dialog.showErrorBox('Wye', e.message); app.quit(); return; }
  createWindow(); createTray();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => { app.quit(); });
let relaunching = false;
app.on('before-quit', () => { quitting = true; if (server && !relaunching) { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } } });
