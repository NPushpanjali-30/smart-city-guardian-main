const { app, BrowserWindow, Menu, Tray, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
let tray = null;
let localStaticServer = null;

// Determine path to built web assets
const webDistPath = fs.existsSync(path.resolve(__dirname, '../web-dist'))
  ? path.resolve(__dirname, '../web-dist')
  : path.resolve(__dirname, '../../web/dist');

/**
 * Creates a lightweight local HTTP server to serve the SPA static bundle cleanly,
 * avoiding file:// protocol CORS and path routing quirks.
 */
function startStaticWebServer(port = 58241) {
  return new Promise((resolve) => {
    localStaticServer = http.createServer((req, res) => {
      let reqPath = decodeURI(req.url.split('?')[0]);
      if (reqPath === '/' || !path.extname(reqPath)) {
        reqPath = '/index.html';
      }

      const filePath = path.join(webDistPath, reqPath);

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // Fallback to index.html for SPA client-side routing
          fs.readFile(path.join(webDistPath, 'index.html'), (fallbackErr, indexData) => {
            if (fallbackErr) {
              res.writeHead(404);
              res.end('Not Found');
            } else {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(indexData);
            }
          });
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff2': 'font/woff2',
        };

        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    localStaticServer.listen(port, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: 'Smart City Guardian',
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
        ]
      : []),
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('navigate-page', '/dashboard'),
        },
        {
          label: 'Live Risk Map',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('navigate-page', '/map'),
        },
        {
          label: 'Emergency Alerts',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('navigate-page', '/alerts'),
        },
        {
          label: 'EOC Authority Center',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('navigate-page', '/admin'),
        },
        {
          label: 'Home Overview',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.send('navigate-page', '/'),
        },
      ],
    },
    {
      label: 'EOC Operations',
      submenu: [
        {
          label: 'Broadcast Emergency Alert...',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            if (Notification.isSupported()) {
              new Notification({
                title: 'EOC Emergency Broadcast Active',
                body: 'Flash flood safety alerts streaming to municipal dispatch corridors.',
              }).show();
            }
            mainWindow?.webContents.send('navigate-page', '/alerts');
          },
        },
        {
          label: 'Inspect Active Road Corridors',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow?.webContents.send('navigate-page', '/admin'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Smart City Guardian',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#0a0f1d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  createApplicationMenu();

  // Prefer active dev server if running, otherwise use local bundled static server
  const devUrl = 'http://localhost:5173';
  let targetUrl = devUrl;

  const isDevRunning = await new Promise((resolve) => {
    http.get(devUrl, () => resolve(true)).on('error', () => resolve(false));
  });

  if (!isDevRunning) {
    targetUrl = await startStaticWebServer(58241);
  }

  mainWindow.loadURL(targetUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC listener for desktop notifications
ipcMain.on('desktop-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (localStaticServer) {
    localStaticServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
