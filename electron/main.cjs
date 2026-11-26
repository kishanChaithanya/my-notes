// Electron main process: native window, macOS menu bar, and file/print helpers.
// The renderer is the existing React app; menu items are forwarded to it as commands.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '..', 'dist');
// A stable, secure custom origin so IndexedDB data persists across launches.
const APP_ORIGIN = 'app://notes';

app.setName('My Notes');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** @type {BrowserWindow | null} */
let win = null;

// Mirrors what the renderer reports, so menu items can be enabled/checked correctly.
let uiState = {
  hasNote: false,
  inTrash: false,
  pinned: false,
  editable: false,
  title: '',
  hideFolders: false,
  showNoteCount: true,
  sortBy: 'edited',
  sortDir: 'desc',
};
let keepOnTop = false;

// ---------- window bounds persistence ----------

const boundsFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
  } catch {
    return { width: 1180, height: 760 };
  }
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  try {
    fs.writeFileSync(boundsFile(), JSON.stringify(win.getBounds()));
  } catch {
    /* not critical */
  }
}

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    ...loadBounds(),
    minWidth: 760,
    minHeight: 480,
    title: 'My Notes',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win?.show());
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('closed', () => { win = null; });

  // Open external links in the default browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_ORIGIN) && !(DEV_URL && url.startsWith(DEV_URL))) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadURL(`${APP_ORIGIN}/index.html`);
}

/** Send a menu command to the renderer, opening a window first if needed. */
function send(cmd, arg) {
  if (!win) createWindow();
  win.webContents.send('command', cmd, arg);
}

// ---------- menu (structure and shortcuts follow macOS Notes) ----------

function buildMenu() {
  const s = uiState;
  const canEdit = s.hasNote && s.editable;
  const cmd = (label, command, accelerator, extra = {}) => ({
    label, accelerator, click: () => send(command), ...extra,
  });
  const fmt = (label, command, accelerator) => cmd(label, command, accelerator, { enabled: canEdit });
  const radio = (label, key, value) => ({
    label, type: 'radio', checked: s[key] === value, click: () => send('set-' + key, value),
  });

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        cmd('New Note', 'new-note', 'CmdOrCtrl+N'),
        cmd('New Folder', 'new-folder', 'Shift+CmdOrCtrl+N'),
        { type: 'separator' },
        { role: 'close' },
        { type: 'separator' },
        {
          label: 'Export as',
          enabled: s.hasNote,
          submenu: [
            { label: 'PDF…', click: exportPdf },
            cmd('Markdown…', 'export-markdown'),
          ],
        },
        { type: 'separator' },
        cmd(s.pinned ? 'Unpin Note' : 'Pin Note', 'toggle-pin', undefined, { enabled: s.hasNote && !s.inTrash }),
        cmd('Duplicate Note', 'duplicate-note', 'CmdOrCtrl+D', { enabled: s.hasNote && !s.inTrash }),
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', enabled: s.hasNote, click: () => win?.webContents.print() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle', accelerator: 'Alt+Shift+CmdOrCtrl+V' },
        cmd(s.inTrash ? 'Delete Permanently' : 'Delete Note', 'delete-note', 'CmdOrCtrl+Backspace', { enabled: s.hasNote }),
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          submenu: [cmd('Note List Search…', 'focus-search', 'Alt+CmdOrCtrl+F')],
        },
        { type: 'separator' },
        { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] },
      ],
    },
    {
      label: 'Format',
      submenu: [
        fmt('Title', 'fmt-title', 'Shift+CmdOrCtrl+T'),
        fmt('Heading', 'fmt-heading', 'Shift+CmdOrCtrl+H'),
        fmt('Subheading', 'fmt-subheading', 'Shift+CmdOrCtrl+J'),
        fmt('Body', 'fmt-body', 'Shift+CmdOrCtrl+B'),
        fmt('Monostyled', 'fmt-mono', 'Shift+CmdOrCtrl+M'),
        fmt('Bulleted List', 'fmt-bullet', 'Shift+CmdOrCtrl+7'),
        fmt('Numbered List', 'fmt-numbered', 'Shift+CmdOrCtrl+9'),
        fmt('Block Quote', 'fmt-quote', "CmdOrCtrl+'"),
        { type: 'separator' },
        fmt('Checklist', 'fmt-checklist', 'Shift+CmdOrCtrl+L'),
        fmt('Mark as Checked', 'check-toggle', 'Shift+CmdOrCtrl+U'),
        {
          label: 'More',
          enabled: canEdit,
          submenu: [
            fmt('Check All', 'check-all'),
            fmt('Uncheck All', 'uncheck-all'),
            fmt('Move Checked to Bottom', 'checked-to-bottom'),
            fmt('Delete Checked', 'delete-checked'),
          ],
        },
        { type: 'separator' },
        {
          label: 'Font',
          submenu: [
            fmt('Bold', 'fmt-bold', 'CmdOrCtrl+B'),
            fmt('Italic', 'fmt-italic', 'CmdOrCtrl+I'),
            fmt('Underline', 'fmt-underline', 'CmdOrCtrl+U'),
            fmt('Strikethrough', 'fmt-strike'),
          ],
        },
        {
          label: 'Indentation',
          submenu: [
            fmt('Increase', 'indent', 'CmdOrCtrl+]'),
            fmt('Decrease', 'outdent', 'CmdOrCtrl+['),
          ],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Sort By',
          submenu: [
            radio('Date Edited', 'sortBy', 'edited'),
            radio('Date Created', 'sortBy', 'created'),
            radio('Title', 'sortBy', 'title'),
            { type: 'separator' },
            radio(s.sortBy === 'title' ? 'Ascending' : 'Newest First', 'sortDir', 'desc'),
            radio(s.sortBy === 'title' ? 'Descending' : 'Oldest First', 'sortDir', 'asc'),
          ],
        },
        { type: 'separator' },
        {
          label: 'Hide Folders', type: 'checkbox', checked: s.hideFolders, accelerator: 'Ctrl+CmdOrCtrl+S',
          click: () => send('toggle-folders'),
        },
        {
          label: 'Show Note Count', type: 'checkbox', checked: s.showNoteCount,
          click: () => send('toggle-note-count'),
        },
        { type: 'separator' },
        { role: 'zoomIn', accelerator: 'Shift+CmdOrCtrl+.' },
        { role: 'zoomOut', accelerator: 'Shift+CmdOrCtrl+,' },
        { role: 'resetZoom', label: 'Actual Size', accelerator: 'Shift+CmdOrCtrl+0' },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: 'Ctrl+CmdOrCtrl+F' },
        ...(DEV_URL || !app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom', accelerator: 'Ctrl+CmdOrCtrl+Z' },
        {
          label: 'Keep on Top', type: 'checkbox', checked: keepOnTop,
          click: (item) => { keepOnTop = item.checked; win?.setAlwaysOnTop(keepOnTop, 'floating'); },
        },
        { type: 'separator' },
        { label: 'My Notes', accelerator: 'CmdOrCtrl+0', click: () => { if (!win) createWindow(); else win.show(); } },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    { role: 'help', submenu: [] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- export ----------

const safeName = (t) => (t || 'Untitled').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 80);

async function exportPdf() {
  if (!win) return;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: `${safeName(uiState.title)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return;
  const data = await win.webContents.printToPDF({ printBackground: false, pageSize: 'A4' });
  fs.writeFileSync(filePath, data);
}

ipcMain.handle('save-text', async (_e, { name, ext, text }) => {
  if (!win) return false;
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: `${safeName(name)}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, text, 'utf8');
  return true;
});

ipcMain.on('ui-state', (_e, next) => {
  uiState = { ...uiState, ...next };
  buildMenu();
});

// ---------- lifecycle ----------

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
