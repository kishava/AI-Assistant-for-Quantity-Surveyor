const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  onStatus: (callback) => {
    ipcRenderer.on('splash-status', (_event, message) => callback(message));
  },
});
