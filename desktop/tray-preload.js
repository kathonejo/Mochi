const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mochiTrayApi', {
  getState: () => ipcRenderer.invoke('tray-get-state'),
  call: (payload) => ipcRenderer.invoke('tray-action', { action: 'call', ...payload }),
  dismiss: (payload) => ipcRenderer.invoke('tray-action', { action: 'dismiss', ...payload }),
  openSettings: () => ipcRenderer.send('open-settings')
});
