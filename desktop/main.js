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

const depsStatusPath = () => path.join(appDataDir, 'deps-status.json');

function updateSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send('splash-status', String(text));
}

function updateSplashHint(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send('splash-hint', String(text || ''));
}

function updateSplashLog(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send('splash-log', String(text));
}

function readDepsStatus() {
  try {
    if (fs.existsSync(depsStatusPath())) {
      return JSON.parse(fs.readFileSync(depsStatusPath(), 'utf8'));
    }
  } catch { /* ignore */ }
  return null;
}

function runPowerShellScript(scriptName, scriptArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const scriptPath = getLauncherScriptPath(scriptName);
    if (process.platform !== 'win32' || !fs.existsSync(scriptPath)) {
      return resolve({ code: 0, stdout: '' });
    }

    const proc = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      ...scriptArgs,
    ], { windowsHide: options.hideWindow !== false });

    let stdout = '';
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.onProgress) {
        text.split(/\r?\n/).forEach((line) => {
          const trimmed = line.trim();
          if (trimmed.includes('[QS_PROGRESS]')) {
            options.onProgress(trimmed.replace(/\[QS_PROGRESS\]/g, '').trim());
          }
        });
      }
    });
    proc.stderr.on('data', (d) => console.error('[deps]', d.toString().trim()));

    if (options.timeoutMs) {
      setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
      }, options.timeoutMs);
    }

    proc.on('close', (code) => resolve({ code: code ?? 1, stdout }));
    proc.on('error', (err) => reject(err));
  });
}

async function runDepsReport() {
  const { stdout } = await runPowerShellScript('check-deps.ps1', ['-ReportOnly', '-Json', '-Quiet']);
  const line = stdout.trim().split('\n').filter((l) => l.trim().startsWith('{')).pop();
  if (!line) {
    return { ok: false, needsInstall: true, issues: ['Could not read dependency status'] };
  }
  try {
    return JSON.parse(line);
  } catch {
    return { ok: false, needsInstall: true, issues: ['Could not parse dependency status'] };
  }
}

function shouldRunFullInstall(report, prevStatus) {
  if (report?.needsInstall) return true;
  if (prevStatus && prevStatus.success === false) return true;
  return false;
}

async function runFullDepsInstall(onProgress) {
  console.log('[QS] Running full dependency install with UI progress…');
  return runPowerShellScript('install-deps.ps1', ['-StreamProgress'], {
    hideWindow: true,
    onProgress: onProgress,
  });
}

async function runQuickStartDeps() {
  await runPowerShellScript('check-deps.ps1', ['-QuickStart', '-Quiet'], {
    timeoutMs: 30000,
  });
}

async function showMissingDepsDialog(issues, isSetupPhase = false) {
  const list = (issues && issues.length)
    ? issues.map((i) => `• ${i}`).join('\n')
    : '• Some components are missing or not running';

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'QS Assistant — dependencies',
    message: isSetupPhase
      ? 'Setup did not finish successfully'
      : 'Some components need attention',
    detail:
      `${list}\n\n` +
      'Chat needs Ollama running with AI models.\n' +
      'Document search needs Python + ChromaDB.\n\n' +
      'You can retry setup, install Ollama manually, or continue with limited features.',
    buttons: ['Retry setup', 'Open Ollama website', 'Continue anyway'],
    defaultId: 0,
    cancelId: 2,
  });

  if (response === 0) return 'retry';
  if (response === 1) {
    shell.openExternal('https://ollama.com');
    return 'ollama';
  }
  return 'continue';
}

async function ensureDependenciesWithUI() {
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }

  let report = await runDepsReport();
  let prevStatus = readDepsStatus();

  while (shouldRunFullInstall(report, prevStatus)) {
    updateSplashStatus('Installing AI dependencies…');
    updateSplashHint('Internet required. First setup may take 10–30 minutes.');
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.setSize(480, 400);
    }

    const { code } = await runFullDepsInstall((line) => {
      if (line) {
        updateSplashStatus(line);
        updateSplashLog(line);
      }
    });

    report = await runDepsReport();
    prevStatus = readDepsStatus();

    if (code === 0 && !report.needsInstall && report.ok) {
      updateSplashHint('');
      break;
    }

    const action = await showMissingDepsDialog(report.issues || [], true);
    if (action === 'retry') {
      prevStatus = { success: false };
      continue;
    }
    if (action === 'ollama') {
      prevStatus = { success: false };
      continue;
    }
    break;
  }

  updateSplashHint('');
  updateSplashStatus('Starting local services…');
  await runQuickStartDeps();
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
    width: 480,
    height: 360,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0b0f19',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js'),
    },
  });

  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
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
    title: `QS Assistant v${app.getVersion()}`,
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
    updateSplashStatus('Starting backend…');
    if (!startBackend()) return;

    updateSplashStatus('Checking dependencies…');
    await ensureDependenciesWithUI();

    await startServicesIfNeeded();

    const report = await runDepsReport();
    if (report.issues?.length && !report.ok) {
      const action = await showMissingDepsDialog(report.issues);
      if (action === 'retry') {
        await runFullDepsInstall((line) => {
          if (line) {
            updateSplashStatus(line);
            updateSplashLog(line);
          }
        });
        await startServicesIfNeeded();
      }
    }

    updateSplashStatus('Opening workspace…');
    await waitForHealth(90);
    createWindow();
    try { createTray(); } catch { /* optional */ }
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
