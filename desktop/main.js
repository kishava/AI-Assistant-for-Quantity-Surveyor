const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

const appDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'QS-AI');

const PORT = process.env.PORT || '3001';
const APP_URL = `http://127.0.0.1:${PORT}`;
const HEALTH_URL = `${APP_URL}/api/health`;

let mainWindow = null;
let tray = null;
let backendProcess = null;
let splashWindow = null;

/* ─── Path helpers ─── */

function getResourceDir() {
  // In packaged mode, extraResources land next to the asar
  if (app.isPackaged) return process.resourcesPath;
  return __dirname;
}

function getBackendDir() {
  if (process.env.QS_AI_BACKEND_DIR) return process.env.QS_AI_BACKEND_DIR;
  const resourceDir = getResourceDir();

  // packaged: resources/app/backend
  const packagedPath = path.join(resourceDir, 'app', 'backend');
  if (fs.existsSync(packagedPath)) return packagedPath;

  // dev: desktop/../backend
  return path.join(__dirname, '..', 'backend');
}

function getLauncherScriptPath(name) {
  const resourceDir = getResourceDir();
  const packagedPath = path.join(resourceDir, 'app', 'launcher', name);
  if (fs.existsSync(packagedPath)) return packagedPath;
  return path.join(__dirname, '..', 'launcher', name);
}

function getNodeExePath() {
  // 1. Bundled portable node
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'bin', 'node.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  // 2. node.exe on PATH
  return 'node.exe';
}

/* ─── Dependency checks & Services ─── */

function httpPing(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

function getPythonPath() {
  try {
    execSync('python --version', { stdio: 'ignore' });
    return 'python';
  } catch (e) {}

  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const pythonDir = path.join(localAppData, 'Programs', 'Python');
    if (fs.existsSync(pythonDir)) {
      try {
        const dirs = fs.readdirSync(pythonDir).filter(d => d.toLowerCase().startsWith('python'));
        if (dirs.length > 0) {
          dirs.sort().reverse();
          const pyExe = path.join(pythonDir, dirs[0], 'python.exe');
          if (fs.existsSync(pyExe)) {
            return pyExe;
          }
        }
      } catch (e) {}
    }
  }
  return null;
}

function isOllamaInstalled() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const ollamaPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
  if (fs.existsSync(ollamaPath)) return true;
  try {
    execSync('where ollama', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

async function isOllamaReady() {
  if (await httpPing('http://127.0.0.1:11434/api/tags')) return true;
  return isOllamaInstalled();
}

async function isChromaReady() {
  if (await httpPing('http://127.0.0.1:8000/api/v2/heartbeat')) return true;
  try {
    execSync('chroma --version', { stdio: 'ignore' });
    return true;
  } catch (e) {}
  const pythonExe = getPythonPath();
  if (!pythonExe) return false;
  try {
    execSync(`"${pythonExe}" -c "import chromadb"`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

async function areDependenciesInstalled() {
  const [ollama, chroma] = await Promise.all([
    isOllamaReady(),
    isChromaReady()
  ]);
  return ollama && chroma;
}

function updateSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safe = String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  splashWindow.webContents.executeJavaScript(
    `document.querySelector('p').textContent = '${safe}';`
  ).catch(() => {});
}

function runDependencyEnsure(options = {}) {
  const { quickStart = true, timeoutMs = 45000 } = options;
  return new Promise((resolve) => {
    const scriptPath = getLauncherScriptPath('check-deps.ps1');
    if (process.platform !== 'win32' || !fs.existsSync(scriptPath)) {
      return resolve();
    }

    console.log('[QS] Quick dependency check…');
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath, '-Quiet',
    ];
    if (quickStart) {
      args.push('-QuickStart');
    } else {
      args.push('-InstallIfMissing', '-PullModels');
    }

    const proc = spawn('powershell.exe', args, { windowsHide: true });
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(() => {
      console.warn('[QS] Dependency check timed out — continuing startup.');
      try { proc.kill(); } catch { /* ignore */ }
      done();
    }, timeoutMs);

    proc.on('close', () => { clearTimeout(timer); done(); });
    proc.on('error', () => { clearTimeout(timer); done(); });
  });
}

function pullModelsInBackground() {
  const flagFile = path.join(appDataDir, 'deps-bootstrap.done');
  if (fs.existsSync(flagFile)) return;

  const scriptPath = getLauncherScriptPath('install-deps.ps1');
  if (!fs.existsSync(scriptPath)) return;

  try {
    fs.mkdirSync(appDataDir, { recursive: true });
    fs.writeFileSync(flagFile, new Date().toISOString());
  } catch { /* ignore */ }

  console.log('[QS] First-run setup: installing dependencies & models in background…');
  spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath, '-Silent',
  ], { windowsHide: true, detached: true }).unref();
}

let chromaProcess = null;

async function startServicesIfNeeded() {
  // Ensure AppData and .env exist
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }
  const envDest = path.join(appDataDir, '.env');
  if (!fs.existsSync(envDest)) {
    const backendDir = getBackendDir();
    const envSrc = path.join(backendDir, '.env');
    const envExample = path.join(backendDir, '.env.example');
    if (fs.existsSync(envSrc)) {
      fs.copyFileSync(envSrc, envDest);
    } else if (fs.existsSync(envExample)) {
      fs.copyFileSync(envExample, envDest);
    }
  }

  // 1. Start Ollama service if not running
  const ollamaRunning = await httpPing('http://127.0.0.1:11434/api/tags');
  if (!ollamaRunning) {
    console.log('[QS] Starting Ollama service...');
    const localAppData = process.env.LOCALAPPDATA || '';
    const ollamaPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
    if (fs.existsSync(ollamaPath)) {
      spawn(ollamaPath, ['serve'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
    }
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await httpPing('http://127.0.0.1:11434/api/tags')) {
        console.log('[QS] Ollama service started.');
        break;
      }
    }
  }

  // 2. Start ChromaDB service if not running
  const chromaRunning = await httpPing('http://127.0.0.1:8000/api/v2/heartbeat');
  if (!chromaRunning) {
    const chromaDataDir = path.join(appDataDir, 'chroma_data');
    if (!fs.existsSync(chromaDataDir)) {
      fs.mkdirSync(chromaDataDir, { recursive: true });
    }

    console.log('[QS] Starting ChromaDB service...');
    const runPythonFallback = () => {
      const pythonExe = getPythonPath();
      if (pythonExe) {
        console.log('[QS] Launching ChromaDB via python CLI module...');
        chromaProcess = spawn(pythonExe, ['-m', 'chromadb.cli.cli', 'run', '--path', chromaDataDir], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
        chromaProcess.stdout.on('data', (d) => console.log('[chroma-py]', d.toString().trim()));
        chromaProcess.stderr.on('data', (d) => console.error('[chroma-py-err]', d.toString().trim()));
      } else {
        console.error('[QS] Python not found for ChromaDB fallback.');
      }
    };

    console.log('[QS] Starting ChromaDB service...');
    console.log('[QS] Launching ChromaDB via direct command...');
    chromaProcess = spawn('chroma', ['run', '--path', chromaDataDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: true,
    });
    chromaProcess.stdout.on('data', (d) => console.log('[chroma]', d.toString().trim()));
    chromaProcess.stderr.on('data', (d) => console.error('[chroma-err]', d.toString().trim()));

    let fallbackTriggered = false;
    chromaProcess.on('close', (code) => {
      if (code !== 0 && !fallbackTriggered) {
        fallbackTriggered = true;
        console.log(`[QS] ChromaDB direct command exited with code ${code}. Trying python fallback...`);
        runPythonFallback();
      }
    });
    chromaProcess.on('error', (err) => {
      if (!fallbackTriggered) {
        fallbackTriggered = true;
        console.log(`[QS] Failed to spawn ChromaDB directly: ${err.message}. Trying python fallback...`);
        runPythonFallback();
      }
    });

    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await httpPing('http://127.0.0.1:8000/api/v2/heartbeat')) {
        console.log('[QS] ChromaDB service started.');
        break;
      }
    }
  }
}

/* ─── Splash screen ─── */

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const html = `
  <html>
  <head><style>
    body { margin:0; font-family:'Segoe UI',sans-serif; display:flex; align-items:center;
           justify-content:center; height:100vh; background:rgba(15,15,25,0.92);
           border-radius:18px; color:#fff; flex-direction:column; user-select:none; }
    h2   { margin:0 0 8px; font-size:22px; font-weight:600; }
    p    { margin:0; font-size:13px; color:#aaa; }
    .loader { margin-top:22px; width:38px; height:38px; border:3px solid #333;
              border-top-color:#6c63ff; border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  </style></head>
  <body>
    <h2>QS Assistant</h2>
    <p>Starting up…</p>
    <div class="loader"></div>
  </body></html>`;

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

/* ─── Backend lifecycle ─── */

function startBackend() {
  const backendDir = getBackendDir();
  const nodeCmd = getNodeExePath();

  console.log('[QS] Backend dir :', backendDir);
  console.log('[QS] Node cmd    :', nodeCmd);

  if (app.isPackaged && nodeCmd === 'node.exe') {
    const bundled = path.join(process.resourcesPath, 'bin', 'node.exe');
    if (!fs.existsSync(bundled)) {
      dialog.showErrorBox('QS Assistant',
        'Bundled Node.js runtime is missing.\n\n' +
        'Rebuild the portable app:\n' +
        '  powershell -File scripts\\package-desktop.ps1\n\n' +
        'Ensure desktop\\bin\\node.exe exists before building.');
      app.quit();
      return false;
    }
  }

  if (!fs.existsSync(backendDir)) {
    dialog.showErrorBox('QS Assistant', `Backend folder not found:\n${backendDir}`);
    app.quit();
    return false;
  }

  const entryFile = fs.existsSync(path.join(backendDir, 'start-prod.js'))
    ? 'start-prod.js'
    : 'server.js';
  if (!fs.existsSync(path.join(backendDir, entryFile))) {
    dialog.showErrorBox('QS Assistant', `Backend entry not found in:\n${backendDir}`);
    app.quit();
    return false;
  }

  backendProcess = spawn(nodeCmd, [entryFile], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      USE_APPDATA: 'true',
      PORT,
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (d) => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr.on('data', (d) => console.error('[backend]', d.toString().trim()));

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
    dialog.showErrorBox('QS Assistant', `Could not start backend:\n${err.message}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`[QS] Backend exited with code ${code}`);
  });

  return true;
}

function waitForHealth(retries = 60) {
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

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (chromaProcess) {
    chromaProcess.kill();
    chromaProcess = null;
  }
}

/* ─── Window ─── */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'QS Assistant',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) { splashWindow.close(); splashWindow = null; }
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'tray-icon.png')
    : path.join(__dirname, 'tray-icon.png');

  if (!fs.existsSync(iconPath)) return; // skip if no icon
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open QS Assistant', click: () => mainWindow?.show() },
    { label: 'Open in Browser', click: () => shell.openExternal(APP_URL) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('QS Assistant');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

/* ─── App lifecycle ─── */

app.whenReady().then(async () => {
  createSplashWindow();

  try {
    updateSplashStatus('Checking services…');
    await runDependencyEnsure({ quickStart: true, timeoutMs: 45000 });

    updateSplashStatus('Starting Ollama & ChromaDB…');
    await startServicesIfNeeded();

    updateSplashStatus('Starting QS Assistant…');
    if (!startBackend()) return;

    await waitForHealth(90);
    createWindow();
    try { createTray(); } catch { /* optional */ }

    // Pull models after UI is up (first-time setup can take a while)
    pullModelsInBackground();
  } catch (err) {
    if (splashWindow) { splashWindow.close(); splashWindow = null; }
    console.error('Launch failed:', err);
    dialog.showErrorBox('QS Assistant',
      'Could not start the application.\n\n' +
      '1. Close any other QS Assistant instance\n' +
      '2. Ensure port 3001 is free\n' +
      '3. Start Ollama from the system tray\n\n' +
      `Details: ${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows
});

app.on('before-quit', async (e) => {
  e.preventDefault();
  console.log('[QS] Quitting app, triggering guest data cleanup...');
  try {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/guest-cleanup',
      method: 'POST'
    });
    req.on('error', () => {});
    req.end();
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (err) {
    console.error('Guest cleanup request failed:', err);
  }
  stopBackend();
  app.exit(0);
});
