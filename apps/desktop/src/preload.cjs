const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartCityDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: '0.1.0',
  sendAlertNotification: (title, body) => {
    ipcRenderer.send('desktop-notification', { title, body });
  },
  onMenuNavigate: (callback) => {
    ipcRenderer.on('navigate-page', (_event, path) => callback(path));
  },
});
