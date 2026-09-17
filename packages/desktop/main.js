// Waterfall desktop. The Electron main process owns the app server (Next.js) as a child process, waits until it
// answers, and opens the window on it. Agent processes (Claude Code, Codex) are children of that server, so they
// live and die with the app. Closing the last window quits and takes the server and every agent with it.
'use strict';
const { app, BrowserWindow, Menu, shell, Tray, nativeImage, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '../..');           // the waterfall repo
const PORT = Number(process.env.WF_PORT || 3456);
const URL_ = `http://localhost:${PORT}`;
const DEV = !!process.env.WF_DEV;
let server = null; let win = null; let tray = null; let quitting = false;

function ping() { return new Promise(res => { const r = http.get(URL_ + '/api/products', x => { res(x.statusCode < 500); x.resume(); }); r.on('error', () => res(false)); r.setTimeout(1500, () => { r.destroy(); res(false); }); }); }

async function startServer() {
  if (await ping()) { console.log(`server already running at ${URL_}; attaching`); return; }
  const args = DEV ? ['--workspace=packages/web', 'run', 'dev', '--', '-p', String(PORT)] : ['--workspace=packages/web', 'run', 'start', '--', '-p', String(PORT)];
  server = spawn('npm', args, { cwd: ROOT, env: { ...process.env, PORT: String(PORT), BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => process.stdout.write('[web] ' + d));
  server.stderr.on('data', d => process.stderr.write('[web] ' + d));
  server.on('exit', code => { server = null; if (!quitting) dialog.showErrorBox('Waterfall', `The app server stopped (exit ${code}).`); });
  for (let i = 0; i < 120; i++) { if (await ping()) return; await new Promise(r => setTimeout(r, 500)); }
  throw new Error(`the app server did not answer on ${URL_}`);
}

function createWindow() {
  win = new BrowserWindow({ width: 1500, height: 960, minWidth: 900, minHeight: 600, title: 'Waterfall', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', backgroundColor: '#141614', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.loadURL(URL_);
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(URL_)) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
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
  tray.setToolTip('Waterfall');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Waterfall', click: () => { if (win) win.show(); else createWindow(); } }, { label: 'Sessions', click: () => { if (!win) createWindow(); win.loadURL(URL_ + '/'); } }, { type: 'separator' }, { role: 'quit' }]));
}

app.whenReady().then(async () => {
  buildMenu();
  try { await startServer(); } catch (e) { dialog.showErrorBox('Waterfall', e.message); app.quit(); return; }
  createWindow(); createTray();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => { app.quit(); });
app.on('before-quit', () => { quitting = true; if (server) { server.kill('SIGTERM'); } });
