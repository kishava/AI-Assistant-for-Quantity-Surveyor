const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  onStatus: (callback) => {
    ipcRenderer.on('splash-status', (_event, message) => callback(message));
  },
  onHint: (callback) => {
    ipcRenderer.on('splash-hint', (_event, message) => callback(message));
  },
  onLog: (callback) => {
    ipcRenderer.on('splash-log', (_event, message) => callback(message));
  },
});
