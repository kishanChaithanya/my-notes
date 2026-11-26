// Exposes a small, explicit bridge to the renderer. No Node APIs leak into the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesDesktop', {
  platform: process.platform,
  /** Subscribe to menu commands. Returns an unsubscribe function. */
  onCommand(cb) {
    const listener = (_e, cmd, arg) => cb(cmd, arg);
    ipcRenderer.on('command', listener);
    return () => ipcRenderer.removeListener('command', listener);
  },
  /** Report UI state so the menu bar can enable/check items. */
  setState(state) {
    ipcRenderer.send('ui-state', state);
  },
  saveText(name, ext, text) {
    return ipcRenderer.invoke('save-text', { name, ext, text });
  },
});
