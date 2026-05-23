const { app, BrowserWindow, Tray, Menu, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || '3001';
const APP_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${APP_URL}/api/health`;

let mainWindow = null;
let tray = null;
let backendProcess = null;

function getBackendDir() {
  if (process.env.QS_AI_BACKEND_DIR) return process.env.QS_AI_BACKEND_DIR;
  return path.join(__dirname, '..', 'backend');
}

function startBackend() {
  const backendDir = getBackendDir();
  const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';

  backendProcess = spawn(nodeCmd, ['start-prod.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      USE_APPDATA: 'true',
      PORT,
      HOST: '127.0.0.1',
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });
}

function waitForHealth(retries = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tick = () => {
      http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      attempts += 1;
      if (attempts >= retries) return reject(new Error('Backend health check timed out'));
      setTimeout(tick, 1000);
    };
    tick();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'QS Assistant',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'tray-icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open QS Assistant', click: () => mainWindow?.show() },
    { label: 'Open in Browser', click: () => shell.openExternal(APP_URL) },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setToolTip('QS Assistant');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForHealth();
    createWindow();
    try {
      createTray();
    } catch {
      // tray icon optional
    }
  } catch (err) {
    console.error(err);
    shell.openExternal('https://ollama.ai');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // keep running in tray on Windows
  }
});

app.on('before-quit', () => {
  stopBackend();
});
