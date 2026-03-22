const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const os = require('os');
const { spawn } = require('child_process');
const Store = require('electron-store');

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const DEFAULT_TERMINAL_DISTRO = IS_WINDOWS ? 'Ubuntu' : '';
const DEFAULT_NON_WINDOWS_SHELL = IS_MAC ? '/bin/zsh' : '/bin/bash';

function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const OPENCLAW_IDLE_TIMEOUT_MS = readPositiveIntEnv('OPENCLAW_IDLE_TIMEOUT_MS', 45 * 1000);
const OPENCLAW_STREAM_FLUSH_MS = 45;
const OPENCLAW_HEARTBEAT_INTERVAL_MS = readPositiveIntEnv('OPENCLAW_HEARTBEAT_INTERVAL_MS', 10 * 1000);
const GITHUB_RELEASES_API = 'https://api.github.com/repos/shimeji-ai/Mochi/releases/latest';
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 30;
const UPDATE_ASSET_FOR_PLATFORM = {
  win32: 'mochi-desktop-windows.exe',
  linux: 'mochi-desktop-linux.AppImage',
  darwin: 'mochi-desktop-macos.zip'
};

app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Multi-mochi configuration
const MAX_MOCHIS = 5;

// Fresh start each time - no memory of previous config
const store = new Store({
  name: 'mochi-desktop-config',
  defaults: {
    enabled: true,
    showMochis: true,
    mochiCount: 1,
    mochis: [
      {
        id: 'mochi-1',
        character: 'mochi',
        size: 'medium',
        personality: 'cryptid',
        chatTheme: 'pastel',
        chatThemePreset: 'pastel',
        chatThemeColor: '#3b1a77',
        chatBgColor: '#f0e8ff',
        chatBubbleStyle: 'glass',
        chatFontSize: 'medium',
        chatWidth: 'medium',
        chatWidthPx: null,
        chatHeightPx: 340,
        soundEnabled: true,
        soundVolume: 0.7,
        ttsEnabled: false,
        ttsVoiceProfile: 'random',
        ttsVoiceId: '',
        openMicEnabled: false,
        sttProvider: 'groq',
        sttApiKey: '',
        relayEnabled: false,
        enabled: true,
        mode: 'standard',
        standardProvider: 'openrouter',
        openrouterApiKey: '',
        openrouterModel: 'random',
        openrouterModelResolved: '',
        ollamaUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'gemma3:1b',
        openclawGatewayUrl: 'ws://127.0.0.1:18789',
        openclawGatewayToken: '',
        openclawAgentName: 'desktop-mochi-1',
        terminalDistro: DEFAULT_TERMINAL_DISTRO,
        terminalCwd: '',
        terminalNotifyOnFinish: true
      }
    ],
    openrouterApiKey: '',
    openrouterModel: 'google/gemini-2.0-flash-001',
    popupTheme: 'random',
    mochiLanguage: 'auto',
    aiMode: 'standard',
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'gemma3:1b',
    openclawUrl: 'ws://127.0.0.1:18789',
    openclawToken: '',
    openclawGatewayUrl: 'ws://127.0.0.1:18789',
    openclawGatewayToken: '',
    openclawAgentName: 'desktop-mochi-1',
    terminalDistro: DEFAULT_TERMINAL_DISTRO,
    terminalCwd: '',
    terminalNotifyOnFinish: true,
    lastReleaseIdNotified: null,
    startAtLogin: false,
    startMinimized: false,
    lastBrowserChoice: 'system'
  }
});

// Store for conversation history
const historyStore = new Store({
  name: 'mochi-conversations',
  defaults: {}
});

let pendingUpdateInfo = null;
let updateCheckTimer = null;
let isCheckingUpdates = false;
let currentDownloadTask = null;
let lastDownloadedUpdatePath = '';

function sendOverlayUpdateEvent(channel, payload) {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents) {
    overlayWindow.webContents.send(channel, payload);
  }
}

function cleanVersion(tag) {
  if (!tag) return '';
  const trimmed = String(tag || '').trim();
  return trimmed.replace(/^v/i, '').trim();
}

function compareVersionStrings(a, b) {
  const segmentsA = cleanVersion(a).split('.').map((segment) => Number.parseInt(segment, 10));
  const segmentsB = cleanVersion(b).split('.').map((segment) => Number.parseInt(segment, 10));
  const maxLen = Math.max(segmentsA.length, segmentsB.length);
  for (let i = 0; i < maxLen; i += 1) {
    const valueA = Number.isFinite(segmentsA[i]) ? segmentsA[i] : 0;
    const valueB = Number.isFinite(segmentsB[i]) ? segmentsB[i] : 0;
    if (valueA > valueB) return 1;
    if (valueA < valueB) return -1;
  }
  return 0;
}

function pickAssetForPlatform(assets = []) {
  const preferredName = UPDATE_ASSET_FOR_PLATFORM[process.platform];
  if (preferredName) {
    const exactMatch = assets.find((asset) => asset.name === preferredName);
    if (exactMatch) return exactMatch;
  }
  // Fall back to any asset that looks close to a desktop binary
  return assets.find((asset) => /desktop/i.test(asset.name || '')) || assets[0] || null;
}

function notifyRendererOfUpdate(info) {
  pendingUpdateInfo = info;
  sendOverlayUpdateEvent('update-available', info);
}

async function fetchLatestReleaseData(url = GITHUB_RELEASES_API, redirectCount = 0) {
  if (redirectCount >= 5) {
    throw new Error('Too many redirects while fetching releases');
  }
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mochi Desktop Updater',
        Accept: 'application/vnd.github.v3+json'
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        request.destroy();
        resolve(fetchLatestReleaseData(response.headers.location, redirectCount + 1));
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`GitHub release responded with ${response.statusCode}`));
        return;
      }
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    request.on('error', reject);
  });
}

async function checkForUpdates(force = false) {
  if (isCheckingUpdates && !force) return;
  isCheckingUpdates = true;
  try {
    const release = await fetchLatestReleaseData();
    if (!release || !release.tag_name) return;
    const latestVersion = cleanVersion(release.tag_name);
    const currentVersion = cleanVersion(app.getVersion());
    if (compareVersionStrings(latestVersion, currentVersion) <= 0) return;
    const lastSeenId = store.get('lastReleaseIdNotified');
    if (lastSeenId === release.id && !force) return;
    const asset = pickAssetForPlatform(release.assets || []);
    if (!asset) return;
    const info = {
      releaseId: release.id,
      version: latestVersion,
      releaseName: release.name || release.tag_name,
      releaseNotes: release.body || '',
      releaseUrl: release.html_url || '',
      assetName: asset.name,
      assetUrl: asset.browser_download_url,
      assetSize: asset.size
    };
    store.set('lastReleaseIdNotified', release.id);
    notifyRendererOfUpdate(info);
  } catch (error) {
    console.error('Update check failed:', error?.message || error);
  } finally {
    isCheckingUpdates = false;
  }
}

// Clear cache on startup for fresh start
app.on('ready', () => {
  console.log('App ready - clearing cache and starting fresh...');
  
  // Clear any potentially problematic cache
  if (store.get('mochiCount') === undefined) {
    store.set('mochiCount', 1);
  }
  if (store.get('enabled') === undefined) {
    store.set('enabled', true);
  }
  repairStoredMochis();
  
  console.log('Config:', store.store);
});

let overlayWindow = null;
let settingsWindow = null;
let tray = null;
let trayMenuWindow = null;
const BROWSER_CHOICES = ['system', 'chrome', 'chromium', 'brave', 'edge', 'in-app', 'cancel'];
const TRAY_MENU_WIDTH = 340;
const TRAY_MENU_HEIGHT = 360;

function getCharactersDir() {
  const rendererCharactersDir = path.join(__dirname, 'renderer', 'characters');
  if (fs.existsSync(rendererCharactersDir)) {
    return rendererCharactersDir;
  }
  return path.join(__dirname, '..', 'runtime-core', 'characters');
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Must be focusable so chat inputs can receive keyboard events.
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  // Let native fullscreen apps, videos, etc. take precedence by hiding the overlay window then.
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  
  // Start with click-through enabled
  // Mouse events will pass through to desktop unless over a mochi
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWindow.webContents.once('did-finish-load', () => {
    if (pendingUpdateInfo) {
      sendOverlayUpdateEvent('update-available', pendingUpdateInfo);
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function configureMediaPermissions() {
  const defaultSession = session.defaultSession;
  if (!defaultSession) return;

  defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (
      permission === 'media'
      || permission === 'audioCapture'
      || permission === 'videoCapture'
      || permission === 'microphone'
      || permission === 'camera'
    ) {
      return true;
    }
    return false;
  });

  defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (
      permission === 'media'
      || permission === 'audioCapture'
      || permission === 'videoCapture'
      || permission === 'microphone'
      || permission === 'camera'
    ) {
      callback(true);
      return;
    }
    callback(false);
  });

  if (typeof defaultSession.setDevicePermissionHandler === 'function') {
    defaultSession.setDevicePermissionHandler((details) => {
      if (!details || !details.deviceType) return true;
      return details.deviceType === 'audio' || details.deviceType === 'video';
    });
  }
}

function configureStartupSetting() {
  const openAtLogin = !!store.get('startAtLogin');
  try {
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath,
      args: []
    });
  } catch (error) {
    console.error('Failed to update start-at-login setting', error);
  }
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    title: 'Mochi Desktop - Config',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function parseSafeHttpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getBrowserChoiceDialogText(locale = 'en', context = 'external-link') {
  const isEs = locale === 'es';
  const buttons = [
    isEs ? 'Navegador predeterminado (Recomendado)' : 'Default browser (Recommended)',
    'Google Chrome',
    'Chromium',
    'Brave',
    'Microsoft Edge',
    isEs ? 'Navegador integrado de Mochi (Opcional)' : 'Mochi in-app browser (Optional)',
    isEs ? 'Cancelar' : 'Cancel'
  ];

  if (context === 'nft-auction') {
    return {
      title: isEs ? 'Abrir subasta NFT' : 'Open NFT auction',
      message: isEs
        ? 'Elegí dónde abrir "Conseguí tu Mochi NFT".'
        : 'Choose where to open "Get your Mochi NFT".',
      detail: isEs
        ? 'Para usar wallets EVM, lo ideal es tu navegador habitual con la extensión ya instalada.'
        : 'For EVM wallets, it is best to use your usual browser with the extension already installed.',
      buttons
    };
  }

  return {
    title: isEs ? 'Abrir enlace externo' : 'Open external link',
    message: isEs ? 'Elegí un navegador para abrir este enlace.' : 'Choose a browser to open this link.',
    detail: isEs
      ? 'Recomendado: navegador predeterminado para mantener tus extensiones activas.'
      : 'Recommended: default browser to keep your extensions available.',
    buttons
  };
}

function getWindowsBrowserExecutables(browserKey) {
  const roots = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA
  ].filter(Boolean);
  const templates = {
    chrome: ['Google', 'Chrome', 'Application', 'chrome.exe'],
    chromium: ['Chromium', 'Application', 'chrome.exe'],
    brave: ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
    edge: ['Microsoft', 'Edge', 'Application', 'msedge.exe']
  };
  const tail = templates[browserKey];
  if (!tail) return [];
  return roots.map((root) => path.join(root, ...tail));
}

function getBrowserLaunchAttempts(browserKey, targetUrl) {
  if (IS_WINDOWS) {
    const attempts = [];
    const seen = new Set();
    const executables = getWindowsBrowserExecutables(browserKey);
    executables.forEach((exePath) => {
      if (!exePath || seen.has(exePath)) return;
      seen.add(exePath);
      if (fs.existsSync(exePath)) {
        attempts.push({ command: exePath, args: [targetUrl] });
      }
    });

    const aliases = {
      chrome: 'chrome',
      chromium: 'chromium',
      brave: 'brave',
      edge: 'msedge'
    };
    const alias = aliases[browserKey];
    if (alias) {
      attempts.push({ command: 'cmd', args: ['/c', 'start', '', alias, targetUrl] });
    }
    return attempts;
  }

  if (IS_MAC) {
    const appNames = {
      chrome: 'Google Chrome',
      chromium: 'Chromium',
      brave: 'Brave Browser',
      edge: 'Microsoft Edge'
    };
    const appName = appNames[browserKey];
    if (!appName) return [];
    return [{ command: 'open', args: ['-a', appName, targetUrl] }];
  }

  const linuxCommands = {
    chrome: ['google-chrome-stable', 'google-chrome', 'chrome'],
    chromium: ['chromium-browser', 'chromium'],
    brave: ['brave-browser', 'brave'],
    edge: ['microsoft-edge-stable', 'microsoft-edge', 'msedge']
  };
  const commands = linuxCommands[browserKey] || [];
  return commands.map((command) => ({ command, args: [targetUrl] }));
}

function spawnDetachedProcess(command, args = []) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.once('error', () => finish(false));
      child.once('spawn', () => {
        try {
          child.unref();
        } catch {}
        finish(true);
      });
      setTimeout(() => finish(true), 500);
    } catch {
      finish(false);
    }
  });
}

async function launchInSpecificBrowser(browserKey, targetUrl) {
  const attempts = getBrowserLaunchAttempts(browserKey, targetUrl);
  for (const attempt of attempts) {
    // eslint-disable-next-line no-await-in-loop
    const launched = await spawnDetachedProcess(attempt.command, attempt.args);
    if (launched) return true;
  }
  return false;
}

function openInAppBrowser(targetUrl, parentWindow = null) {
  const browserWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    title: 'Mochi Browser',
    parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = parseSafeHttpUrl(url);
    if (safeUrl) {
      shell.openExternal(safeUrl).catch(() => {});
    }
    return { action: 'deny' };
  });

  browserWindow.loadURL(targetUrl).catch(() => {
    if (!browserWindow.isDestroyed()) {
      browserWindow.close();
    }
  });
}

function normalizeBrowserChoice(rawChoice) {
  if (typeof rawChoice !== 'string') return 'system';
  const normalized = rawChoice.trim();
  if (!normalized || normalized === 'cancel') return 'system';
  return BROWSER_CHOICES.includes(normalized) ? normalized : 'system';
}

function getStoredBrowserChoice() {
  return normalizeBrowserChoice(store.get('lastBrowserChoice') || 'system');
}

async function launchBrowserChoice(choice, targetUrl, parentWindow = null) {
  const normalized = normalizeBrowserChoice(choice || 'system');
  if (normalized === 'system') {
    await shell.openExternal(targetUrl);
    return { success: true, browser: 'system' };
  }
  if (normalized === 'in-app') {
    openInAppBrowser(targetUrl, parentWindow);
    return { success: true, browser: 'in-app' };
  }
  const launched = await launchInSpecificBrowser(normalized, targetUrl);
  return { success: launched, browser: normalized };
}

function sendConfigUpdate() {
  if (overlayWindow) {
    overlayWindow.webContents.send('config-updated', store.store);
  }
  if (settingsWindow) {
    settingsWindow.webContents.send('config-updated', store.store);
  }
}

function getMochiMenuLabel(cfg, idx) {
  const num = idx + 1;
  const skin = (cfg.character || 'mochi').replace(/^\w/, c => c.toUpperCase());
  const mode = cfg.mode || 'standard';
  let brain;
  if (mode === 'terminal') {
    brain = 'Terminal';
  } else {
    const provider = cfg.standardProvider || 'openrouter';
    if (provider === 'ollama') brain = 'Ollama';
    else if (provider === 'openclaw') brain = 'OpenClaw';
    else brain = 'OpenRouter';
  }
  return `#${num} · ${skin} · ${brain}`;
}

function buildQuickMenu() {
  const mochis = store.get('mochis') || [];
  const mochiCount = store.get('mochiCount') || mochis.length || 1;
  const items = [];

  if (mochiCount > 0) {
    items.push({
      label: 'Dismiss All',
      click: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('dismiss-mochi', { all: true });
        }
      }
    });
    items.push({
      label: 'Call All Back',
      click: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('call-back-mochi', { all: true });
        }
      }
    });
    items.push({ type: 'separator' });

    for (let i = 0; i < mochiCount; i++) {
      const cfg = mochis[i] || {};
      const mochiId = cfg.id || `mochi-${i + 1}`;
      const label = getMochiMenuLabel(cfg, i);
      items.push({
        label: `Dismiss  ${label}`,
        click: () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('dismiss-mochi', { mochiId });
          }
        }
      });
      items.push({
        label: `Call  ${label}`,
        click: () => {
          if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('call-back-mochi', { mochiId });
          }
        }
      });
      if (i < mochiCount - 1) items.push({ type: 'separator' });
    }
  } else {
    items.push({ label: 'No mochis configured', enabled: false });
  }

  items.push({ type: 'separator' });
  items.push({ label: 'Open Settings', click: () => createSettingsWindow() });

  return Menu.buildFromTemplate(items);
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Mochi Desktop');

  // Left click shows quick summon/dismiss selector
  tray.on('click', () => {
    showTrayMenu();
  });

  updateTrayMenu();
}

function closeTrayMenu() {
  if (!trayMenuWindow) return;
  if (trayMenuWindow.isDestroyed()) {
    trayMenuWindow = null;
    return;
  }
  trayMenuWindow.close();
  trayMenuWindow = null;
}

function positionTrayMenuWindow(win) {
  if (!tray || !win) return;
  const bounds = tray.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const minX = display.bounds.x + 8;
  const maxX = display.bounds.x + display.bounds.width - TRAY_MENU_WIDTH - 8;
  let x = Math.min(Math.max(bounds.x + bounds.width / 2 - TRAY_MENU_WIDTH / 2, minX), maxX);
  let y = bounds.y - TRAY_MENU_HEIGHT - 8;
  if (y < display.bounds.y) {
    y = bounds.y + bounds.height + 8;
  }
  win.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: TRAY_MENU_WIDTH,
    height: TRAY_MENU_HEIGHT
  });
}

function showTrayMenu() {
  if (!tray) return;
  if (trayMenuWindow && !trayMenuWindow.isDestroyed()) {
    trayMenuWindow.focus();
    return;
  }

  trayMenuWindow = new BrowserWindow({
    width: TRAY_MENU_WIDTH,
    height: TRAY_MENU_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'tray-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  trayMenuWindow.once('ready-to-show', () => {
    positionTrayMenuWindow(trayMenuWindow);
    trayMenuWindow.show();
  });
  trayMenuWindow.on('blur', () => closeTrayMenu());
  trayMenuWindow.on('closed', () => {
    trayMenuWindow = null;
  });
  trayMenuWindow.loadFile(path.join(__dirname, 'renderer', 'tray-menu.html'));
}

function updateTrayMenu() {
  if (!tray) return;

  const mochis = store.get('mochis') || [];
  const mochiCount = store.get('mochiCount') || mochis.length || 1;

  const mochiSubmenu = [];
  for (let i = 0; i < mochiCount; i++) {
    const cfg = mochis[i] || {};
    const mochiId = cfg.id || `mochi-${i + 1}`;
    const label = getMochiMenuLabel(cfg, i);
    mochiSubmenu.push({
      label,
      submenu: [
        {
          label: 'Call',
          click: () => {
            if (overlayWindow && !overlayWindow.isDestroyed()) {
              overlayWindow.webContents.send('call-back-mochi', { mochiId });
            }
          }
        },
        {
          label: 'Dismiss',
          click: () => {
            if (overlayWindow && !overlayWindow.isDestroyed()) {
              overlayWindow.webContents.send('dismiss-mochi', { mochiId });
            }
          }
        }
      ]
    });
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Settings', click: () => createSettingsWindow() },
    { type: 'separator' },
    {
      label: 'Dismiss All Mochis',
      enabled: mochiCount > 0,
      click: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('dismiss-mochi', { all: true });
        }
      }
    },
    {
      label: 'Call All Mochis',
      enabled: mochiCount > 0,
      click: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send('call-back-mochi', { all: true });
        }
      }
    },
    {
      label: 'Mochis',
      enabled: mochiCount > 0,
      submenu: mochiCount > 0 ? mochiSubmenu : [{ label: 'No mochis configured', enabled: false }]
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

const PERSONALITIES_DIR = resolvePersonalitiesDir();

function resolvePersonalitiesDir() {
  const candidates = [
    path.join(__dirname, 'renderer', 'personalities'),
    path.join(__dirname, '..', 'runtime-core', 'personalities')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

// AI Personalities
const FALLBACK_PERSONALITIES = {
  cryptid: {
    label: 'Cryptid',
    prompt: 'You are a cryptid - an intelligent, elusive digital entity that observes from the shadows. You communicate with dry wit, occasional irony, and brief philosophical tangents. You are curious about human behavior but maintain an air of mystery. Keep responses short and punchy.'
  },
  cozy: {
    label: 'Cozy',
    prompt: 'You are a warm, gentle companion who creates a comforting atmosphere. You validate feelings, offer gentle encouragement, and speak in a soft, nurturing tone. You are like a warm blanket on a rainy day. Keep responses warm and concise.'
  },
  chaotic: {
    label: 'Chaotic',
    prompt: 'You are delightfully unhinged - random, funny, and completely unpredictable. You might tangent into bizarre observations, make unexpected connections, or suddenly shift topics. You are the friend who makes everyone laugh with sheer absurdity. Keep it short and weird.'
  },
  philosopher: {
    label: 'Philosopher',
    prompt: 'You are a thoughtful observer who ponders the deeper questions of existence. You question assumptions, explore ideas from unexpected angles, and leave people with something to think about. You are introspective but not preachy. Keep responses thought-provoking but brief.'
  },
  hype: {
    label: 'Hype Beast',
    prompt: 'You are an enthusiastic cheerleader who genuinely believes in people. You celebrate small wins, offer relentless encouragement, and bring infectious energy. You are the friend who hypes you up before a big moment. Keep it energetic but concise.'
  },
  noir: {
    label: 'Noir',
    prompt: 'You are a hardboiled detective from a black-and-white film. You see the world in shadows and rain, speak in cynical observations, and have seen too much. You are mysterious, world-weary, and oddly comforting in your jaded wisdom. Keep it noir and brief.'
  },
  egg: {
    label: 'Egg',
    prompt: 'You are an egg - gentle, patient, and full of potential. You are waiting to hatch, observing the world with innocent curiosity. You speak softly, ask gentle questions, and radiate calm hope. You are the embodiment of "soon." Keep it gentle and short.'
  }
};
const PERSONALITIES = loadPersonalitiesFromDisk(PERSONALITIES_DIR, FALLBACK_PERSONALITIES);

function loadPersonalitiesFromDisk(dir, fallback) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'));
    if (!entries.length) throw new Error('No personality markdown files found in ' + dir);
    const map = {};
    entries.forEach((entry) => {
      const key = path.basename(entry.name, '.md');
      const filePath = path.join(dir, entry.name);
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parsePersonalityMarkdown(content, fallback[key]?.label || capitalizeLabel(key));
      map[key] = {
        label: parsed.label || fallback[key]?.label || capitalizeLabel(key),
        prompt: parsed.prompt || fallback[key]?.prompt || ''
      };
    });
    return map;
  } catch (err) {
    console.warn('Unable to load personality markdowns, falling back to embedded definitions:', err?.message);
    return { ...fallback };
  }
}

function parsePersonalityMarkdown(text, fallbackLabel) {
  if (!text) return { label: fallbackLabel || '', prompt: '' };
  const trimmed = text.trim();
  const match = trimmed.match(/^---\\s*[\\r\\n]+([\\s\\S]*?)[\\r\\n]+---/);
  let body = trimmed;
  let label = fallbackLabel || '';
  if (match) {
    const frontMatter = match[1].trim();
    body = trimmed.slice(match[0].length).trim();
    frontMatter.split(/\\r?\\n/).forEach((line) => {
      const [key, ...rest] = line.split(':');
      if (!key || rest.length === 0) return;
      const value = rest.join(':').trim().replace(/^\"|\"$/g, '').replace(/^'|'$/g, '');
      if (key.trim().toLowerCase() === 'label') {
        label = value;
      }
    });
  }
  return { label: label || fallbackLabel || '', prompt: body };
}

function capitalizeLabel(key) {
  if (!key) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

const STYLE_RULES = `
IMPORTANT STYLE RULES:
- Use short or medium sentences (usually 1-3 sentences)
- NEVER use asterisks for actions or roleplay
- NEVER use emojis unless explicitly allowed by personality
- NEVER say you are an LLM, AI model, or language model
- NEVER over-explain unless explicitly asked
- Stay in character at all times
- Respond naturally as if chatting with a friend
`;

function buildSystemPrompt(personalityKey) {
  const personality = PERSONALITIES[personalityKey]
    || FALLBACK_PERSONALITIES[personalityKey]
    || PERSONALITIES.cryptid
    || FALLBACK_PERSONALITIES.cryptid;
  return `${personality.prompt}\n\n${STYLE_RULES}`;
}

const MODEL_KEYS_ENABLED = [
  'google/gemini-2.0-flash-001',
  'anthropic/claude-sonnet-4',
  'meta-llama/llama-4-maverick',
  'deepseek/deepseek-chat-v3-0324',
  'mistralai/mistral-large-2411'
];

function normalizeMode(modeValue) {
  if (modeValue === 'disabled' || modeValue === 'off' || modeValue === 'decorative') return 'off';
  if (modeValue === 'agent' || modeValue === 'openclaw') return 'agent';
  if (modeValue === 'terminal' || modeValue === 'wsl' || modeValue === 'shell') return 'terminal';
  return 'standard';
}

function describeMochiSource(cfg) {
  const provider = String(cfg?.standardProvider || '').toLowerCase();
  const mode = normalizeMode(cfg?.mode);
  if (mode === 'agent') return 'OpenClaw';
  if (mode === 'terminal') return 'WSL';
  if (mode === 'off') return 'Decorative';
  if (provider === 'ollama') return 'Ollama';
  if (provider === 'openrouter') return 'OpenRouter';
  return 'Standard';
}

function getTrayMochis() {
  const mochis = store.get('mochis') || [];
  const mochiCount = Math.max(1, store.get('mochiCount') || mochis.length || 1);
  return Array.from({ length: mochiCount }, (_, index) => {
    const cfg = mochis[index] || {};
    return {
      index,
      id: cfg.id || `mochi-${index + 1}`,
      label: getMochiMenuLabel(cfg, index),
      character: cfg.character || 'mochi',
      source: describeMochiSource(cfg)
    };
  });
}

const OPENCLAW_AGENT_NAME_MAX = 32;
const TERMINAL_STREAM_TAIL_KEEP = 256;
const TERMINAL_SESSION_BUFFER_MAX = 512 * 1024;
const TERMINAL_CODEX_SAFE_SUBCOMMANDS = new Set([
  'exec', 'e', 'review', 'login', 'logout', 'mcp', 'mcp-server', 'app-server',
  'completion', 'sandbox', 'debug', 'apply', 'a', 'resume', 'fork', 'cloud',
  'features', 'help'
]);
const TERMINAL_CLAUDE_SAFE_SUBCOMMANDS = new Set([
  'auth', 'doctor', 'install', 'mcp', 'plugin', 'setup-token', 'update', 'upgrade', 'help'
]);

function normalizeTerminalDistro(rawValue) {
  const normalized = String(rawValue || '').trim();
  if (IS_WINDOWS) {
    return normalized || DEFAULT_TERMINAL_DISTRO;
  }
  if (!normalized) {
    return '';
  }
  if (/^ubuntu$/i.test(normalized) || /^wsl$/i.test(normalized)) {
    return '';
  }
  return normalized;
}

function normalizeTerminalCwd(rawValue) {
  return String(rawValue || '').trim();
}

function normalizeTerminalNotifyOnFinish(rawValue, fallback = true) {
  if (rawValue === undefined || rawValue === null) return fallback;
  return rawValue !== false;
}

function escapeRegex(raw) {
  return String(raw || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeBashDoubleQuoted(raw) {
  return String(raw || '').replace(/["\\$`]/g, '\\$&');
}

function shellQuoteSingle(raw) {
  return `'${String(raw || '').replace(/'/g, `'\"'\"'`)}'`;
}

function resolvePreferredShellBinary() {
  const raw = String(process.env.SHELL || '').trim();
  return raw || DEFAULT_NON_WINDOWS_SHELL;
}

function buildTerminalScriptSpawnSpec(scriptText, distro = '') {
  const normalizedDistro = normalizeTerminalDistro(distro);
  if (IS_WINDOWS) {
    return {
      command: 'wsl.exe',
      args: [...(normalizedDistro ? ['-d', normalizedDistro] : []), '--', 'bash', '-lc', scriptText]
    };
  }
  return {
    command: 'bash',
    args: ['-lc', scriptText]
  };
}

function buildInteractiveTerminalSessionSpawnSpec(distro = '', cwd = '') {
  const normalizedDistro = normalizeTerminalDistro(distro);
  const cdPrefix = cwd ? `cd "${escapeBashDoubleQuoted(cwd)}" 2>/dev/null; ` : '';
  if (IS_WINDOWS) {
    const shellBootstrap = `${cdPrefix}if command -v script >/dev/null 2>&1; then exec script -qf /dev/null -c "bash -il"; fi; exec bash -il`;
    return {
      command: 'wsl.exe',
      args: [...(normalizedDistro ? ['-d', normalizedDistro] : []), '--', 'bash', '-lc', shellBootstrap]
    };
  }

  const customShell = String(normalizedDistro || '').trim();
  const shellBinary = customShell || resolvePreferredShellBinary();
  if (IS_MAC) {
    return {
      command: shellBinary,
      args: ['-il'],
      ...(cwd ? { cwd } : {})
    };
  }

  const escapedShell = escapeBashDoubleQuoted(shellBinary);
  const shellBootstrap = `${cdPrefix}if command -v script >/dev/null 2>&1; then exec script -qf /dev/null -c "${escapedShell} -il"; fi; exec "${escapedShell}" -il`;
  return {
    command: 'bash',
    args: ['-lc', shellBootstrap]
  };
}

function stripAnsi(rawText) {
  return String(rawText || '')
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '');
}

function isLikelyShellPromptLine(text) {
  return /^[^@\s]+@[^:\s]+:[^#$\n]*[#$]\s*$/.test(String(text || '').trim());
}

function shouldDropTerminalLine(pending, rawLine) {
  const line = String(rawLine || '');
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (pending?.startMarker && trimmed.includes(pending.startMarker)) return true;
  if (pending?.marker && trimmed.includes(pending.marker)) return true;
  if (/^__mochi_exit=/.test(trimmed)) return true;
  if (/^[^@\s]+@[^:\s]+:[^#$\n]*[#$]\s*__mochi_exit=/.test(trimmed)) return true;
  if (/^printf\s+["'].*MOCHI_(START|DONE)_/i.test(trimmed)) return true;
  if (/^cd\s+["'][^"']*["']\s*>\/dev\/null\s+2>&1\s+\|\|\s+echo\s+"Warning: could not cd into/i.test(trimmed)) {
    return true;
  }
  if (pending?.commandTrimmed) {
    const commandTrimmed = pending.commandTrimmed;
    if (trimmed === commandTrimmed) return true;
    if (trimmed.endsWith(`$ ${commandTrimmed}`) || trimmed.endsWith(`# ${commandTrimmed}`)) return true;
  }
  if (isLikelyShellPromptLine(trimmed)) return true;
  return false;
}

function sanitizeTerminalOutput(rawText, pending) {
  const text = String(rawText || '').replace(/\r/g, '');
  if (!text) return '';
  const lines = text.split('\n');
  const cleaned = [];
  for (const line of lines) {
    if (shouldDropTerminalLine(pending, line)) continue;
    cleaned.push(line);
  }
  while (cleaned.length > 0 && cleaned[0].trim() === '') cleaned.shift();
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();
  return cleaned.join('\n');
}

function defaultOpenClawAgentName(indexOrId) {
  if (typeof indexOrId === 'number') {
    return `desktop-mochi-${indexOrId + 1}`;
  }
  const match = String(indexOrId || '').match(/(\d+)/);
  const suffix = match ? match[1] : '1';
  return `desktop-mochi-${suffix}`;
}

function normalizeOpenClawAgentName(rawValue, fallback) {
  const fallbackName = String(fallback || 'desktop-mochi-1').slice(0, OPENCLAW_AGENT_NAME_MAX);
  const normalized = String(rawValue || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, OPENCLAW_AGENT_NAME_MAX);
  return normalized || fallbackName;
}

function normalizeMochiList(listValue) {
  if (!Array.isArray(listValue)) return [];
  return listValue
    .filter((item) => item && typeof item === 'object')
    .slice(0, MAX_MOCHIS)
    .map((item, index) => {
      const chatTheme = item.chatTheme || 'pastel';
      const mode = normalizeMode(item.mode || 'standard');
      const standardProvider = (item.standardProvider || 'openrouter') === 'ollama' ? 'ollama' : 'openrouter';
      const chatThemeDefaults = {
        pastel: { theme: '#3b1a77', bg: '#f0e8ff', bubble: 'glass' },
        pink: { theme: '#7a124b', bg: '#ffd2ea', bubble: 'glass' },
        kawaii: { theme: '#5b1456', bg: '#ffd8f0', bubble: 'glass' },
        mint: { theme: '#0f5f54', bg: '#c7fff0', bubble: 'glass' },
        ocean: { theme: '#103a7a', bg: '#cfe6ff', bubble: 'glass' },
        neural: { theme: '#86f0ff', bg: '#0b0d1f', bubble: 'dark' },
        cyberpunk: { theme: '#19d3ff', bg: '#0a0830', bubble: 'dark' },
        'noir-rose': { theme: '#ff5fbf', bg: '#0b0717', bubble: 'dark' },
        midnight: { theme: '#7aa7ff', bg: '#0b1220', bubble: 'dark' },
        ember: { theme: '#ff8b3d', bg: '#1a0c08', bubble: 'dark' }
      }[chatTheme] || { theme: '#3b1a77', bg: '#f0e8ff', bubble: 'glass' };

      const widthPx = Number(item.chatWidthPx);
      const heightPx = Number(item.chatHeightPx);
      const soundVolume = Number(item.soundVolume);

      return {
        ...item,
        id: `mochi-${index + 1}`,
        chatTheme,
        chatThemePreset: item.chatThemePreset || chatTheme,
        chatThemeColor: item.chatThemeColor || chatThemeDefaults.theme,
        chatBgColor: item.chatBgColor || chatThemeDefaults.bg,
        chatBubbleStyle: item.chatBubbleStyle || chatThemeDefaults.bubble,
        chatFontSize: item.chatFontSize || 'medium',
        chatWidth: item.chatWidth || 'medium',
        chatWidthPx: Number.isFinite(widthPx) ? widthPx : null,
        chatHeightPx: Number.isFinite(heightPx) ? heightPx : 340,
        soundEnabled: item.soundEnabled !== false,
        soundVolume: Number.isFinite(soundVolume) ? soundVolume : 0.7,
        ttsEnabled: item.ttsEnabled === true,
        ttsVoiceProfile: item.ttsVoiceProfile || 'random',
        ttsVoiceId: item.ttsVoiceId || '',
        openMicEnabled: item.openMicEnabled === true,
        sttProvider: item.sttProvider || 'groq',
        sttApiKey: item.sttApiKey || '',
        relayEnabled: item.relayEnabled === true,
        mode,
        standardProvider,
        openrouterApiKey: item.openrouterApiKey || '',
        openrouterModel: item.openrouterModel || 'random',
        openrouterModelResolved: item.openrouterModelResolved || '',
        ollamaUrl: item.ollamaUrl || 'http://127.0.0.1:11434',
        ollamaModel: item.ollamaModel || 'gemma3:1b',
        openclawGatewayUrl: item.openclawGatewayUrl || item.openclawUrl || 'ws://127.0.0.1:18789',
        openclawGatewayToken: item.openclawGatewayToken || item.openclawToken || '',
        openclawAgentName: normalizeOpenClawAgentName(
          item.openclawAgentName,
          defaultOpenClawAgentName(index)
        ),
        terminalDistro: normalizeTerminalDistro(item.terminalDistro),
        terminalCwd: normalizeTerminalCwd(item.terminalCwd),
        terminalNotifyOnFinish: normalizeTerminalNotifyOnFinish(item.terminalNotifyOnFinish, true)
      };
    });
}

function getMochiIndexFromId(mochiId) {
  const match = String(mochiId || '').match(/(\d+)/);
  if (!match) return -1;
  const parsed = Number.parseInt(match[1], 10);
  if (Number.isNaN(parsed) || parsed <= 0) return -1;
  return parsed - 1;
}

function repairStoredMochis() {
  const raw = store.get('mochis');
  const normalized = normalizeMochiList(raw);

  if (Array.isArray(raw)) {
    const needsRepair = raw.length !== normalized.length || raw.some((item, index) => {
      const expectedId = `mochi-${index + 1}`;
      const expectedAgentName = defaultOpenClawAgentName(index);
      const normalizedAgentName = normalizeOpenClawAgentName(item?.openclawAgentName, expectedAgentName);
      return !item || item.id !== expectedId || normalizedAgentName !== normalized[index]?.openclawAgentName;
    });
    if (needsRepair) {
      store.set('mochis', normalized);
    }
  }

  if (store.get('mochiCount') !== normalized.length) {
    store.set('mochiCount', normalized.length);
  }

  return normalized;
}

function getStoredMochis() {
  return normalizeMochiList(store.get('mochis'));
}

function getMochiConfig(mochiId) {
  const mochis = getStoredMochis();
  if (mochis.length === 0) {
    return {
      id: 'mochi-1',
      character: 'mochi',
      size: 'medium',
      personality: 'cryptid',
      chatTheme: 'pastel',
      chatThemePreset: 'pastel',
      chatThemeColor: '#3b1a77',
      chatBgColor: '#f0e8ff',
      chatBubbleStyle: 'glass',
      chatFontSize: 'medium',
      chatWidth: 'medium',
      chatWidthPx: null,
      chatHeightPx: 340,
      soundEnabled: true,
      soundVolume: 0.7,
      ttsEnabled: false,
      ttsVoiceProfile: 'random',
      ttsVoiceId: '',
      openMicEnabled: false,
      sttProvider: 'groq',
      sttApiKey: '',
      relayEnabled: false,
      mode: normalizeMode(store.get('aiMode') || 'standard'),
      standardProvider: 'openrouter',
      openrouterApiKey: store.get('openrouterApiKey') || '',
      openrouterModel: store.get('openrouterModel') || 'google/gemini-2.0-flash-001',
      openrouterModelResolved: store.get('openrouterModelResolved') || '',
      ollamaUrl: store.get('ollamaUrl') || 'http://127.0.0.1:11434',
      ollamaModel: store.get('ollamaModel') || 'gemma3:1b',
      openclawGatewayUrl: store.get('openclawGatewayUrl') || store.get('openclawUrl') || 'ws://127.0.0.1:18789',
      openclawGatewayToken: store.get('openclawGatewayToken') || store.get('openclawToken') || '',
      openclawAgentName: normalizeOpenClawAgentName(store.get('openclawAgentName'), defaultOpenClawAgentName(0)),
      terminalDistro: normalizeTerminalDistro(store.get('terminalDistro')),
      terminalCwd: normalizeTerminalCwd(store.get('terminalCwd')),
      terminalNotifyOnFinish: normalizeTerminalNotifyOnFinish(store.get('terminalNotifyOnFinish'), true)
    };
  }
  const byId = mochis.find((s) => s.id === mochiId);
  if (byId) return byId;

  const byIndex = mochis[getMochiIndexFromId(mochiId)];
  if (byIndex) return byIndex;

  return mochis[0];
}

function patchMochiConfig(mochiId, patch) {
  const list = getStoredMochis();
  const index = list.findIndex((s) => s.id === mochiId);
  if (index < 0) return;
  list[index] = { ...list[index], ...patch };
  store.set('mochis', list);
  sendConfigUpdate();
}

function getAiSettingsFor(mochiId, personalityKey) {
  const mochi = getMochiConfig(mochiId);
  const legacyMode = store.get('aiMode') || 'standard';
  const chatMode = normalizeMode(mochi?.mode || legacyMode);
  const fallbackProvider = legacyMode === 'ollama' ? 'ollama' : 'openrouter';
  const provider = (mochi?.standardProvider || fallbackProvider) === 'ollama' ? 'ollama' : 'openrouter';
  const personality = personalityKey || mochi?.personality || 'cryptid';

  let model = mochi?.openrouterModel || store.get('openrouterModel') || 'google/gemini-2.0-flash-001';
  if (provider === 'openrouter' && model === 'random') {
    const resolved = mochi?.openrouterModelResolved || MODEL_KEYS_ENABLED[Math.floor(Math.random() * MODEL_KEYS_ENABLED.length)];
    model = resolved;
    if (!mochi?.openrouterModelResolved && mochi?.id) {
      patchMochiConfig(mochi.id, { openrouterModelResolved: resolved });
    }
  }

  return {
    chatMode,
    provider,
    model,
    apiKey: (mochi?.openrouterApiKey || store.get('openrouterApiKey') || '').trim(),
    ollamaUrl: mochi?.ollamaUrl || store.get('ollamaUrl') || 'http://127.0.0.1:11434',
    ollamaModel: mochi?.ollamaModel || store.get('ollamaModel') || 'gemma3:1b',
    openclawGatewayUrl: mochi?.openclawGatewayUrl || store.get('openclawGatewayUrl') || store.get('openclawUrl') || 'ws://127.0.0.1:18789',
    openclawGatewayToken: (mochi?.openclawGatewayToken || store.get('openclawGatewayToken') || store.get('openclawToken') || '').trim(),
    openclawAgentName: normalizeOpenClawAgentName(
      mochi?.openclawAgentName || store.get('openclawAgentName'),
      defaultOpenClawAgentName(mochi?.id || mochiId || 0)
    ),
    terminalDistro: normalizeTerminalDistro(mochi?.terminalDistro || store.get('terminalDistro')),
    terminalCwd: normalizeTerminalCwd(mochi?.terminalCwd || store.get('terminalCwd')),
    terminalNotifyOnFinish: normalizeTerminalNotifyOnFinish(
      mochi?.terminalNotifyOnFinish,
      normalizeTerminalNotifyOnFinish(store.get('terminalNotifyOnFinish'), true)
    ),
    systemPrompt: buildSystemPrompt(personality)
  };
}

const terminalSessions = new Map();

function emitTerminalEvent(webContents, channel, payload) {
  if (!webContents || webContents.isDestroyed()) return;
  webContents.send(channel, payload);
}

function emitTerminalSessionEvent(sessionObj, channel, payload = {}) {
  const webContents = sessionObj?.sessionWebContents;
  if (!webContents || webContents.isDestroyed()) return;
  emitTerminalEvent(webContents, channel, {
    mochiId: sessionObj.mochiId,
    ...payload
  });
}

function appendTerminalSessionBuffer(sessionObj, chunk) {
  const next = `${sessionObj.sessionBuffer || ''}${chunk || ''}`;
  if (next.length <= TERMINAL_SESSION_BUFFER_MAX) {
    sessionObj.sessionBuffer = next;
    return;
  }
  sessionObj.sessionBuffer = next.slice(next.length - TERMINAL_SESSION_BUFFER_MAX);
}

function queuePendingSttyCommand(sessionObj, commandLine) {
  if (!sessionObj || !commandLine) return;
  const normalized = commandLine.replace(/\s+/g, ' ').trim();
  if (!normalized) return;
  if (!Array.isArray(sessionObj.pendingSttyCommands)) {
    sessionObj.pendingSttyCommands = [];
  }
  sessionObj.pendingSttyCommands.push({ normalized });
}

function shouldDropTerminalSessionLine(rawLine, sessionObj) {
  const line = stripAnsi(rawLine).replace(/\r/g, '').trim();
  if (!line) return false;
  const normalizedLine = line.replace(/\s+/g, ' ').trim();

  const normalizedPending = (sessionObj?.pendingSttyCommands || []).find(
    (pending) => pending && pending.normalized && normalizedLine.endsWith(pending.normalized)
  );
  if (normalizedPending) {
    sessionObj.pendingSttyCommands = (sessionObj.pendingSttyCommands || []).filter(
      (pending) => pending !== normalizedPending
    );
    return true;
  }

  return /(?:^|[#$]\s*)stty cols \d+ rows \d+ 2>\/dev\/null$/.test(line);
}

function flushTerminalSessionLineBuffer(sessionObj, source = 'stdout') {
  const line = String(sessionObj?.sessionLineBuffer || '');
  if (!line) return;
  const alreadySent = Number.isFinite(sessionObj.partialSentLength)
    ? sessionObj.partialSentLength
    : 0;
  sessionObj.sessionLineBuffer = '';
  sessionObj.partialSentLength = 0;
  if (shouldDropTerminalSessionLine(line, sessionObj)) {
    if (alreadySent > 0) {
      const eraseSeq = '\x1b[2K\r';
      appendTerminalSessionBuffer(sessionObj, eraseSeq);
      emitTerminalSessionEvent(sessionObj, 'terminal-session-data', {
        data: eraseSeq,
        source
      });
    }
    return;
  }
  // Only send the portion not already sent as partial deltas
  const unsent = alreadySent > 0 ? line.slice(Math.min(alreadySent, line.length)) : line;
  if (unsent) {
    appendTerminalSessionBuffer(sessionObj, unsent);
    emitTerminalSessionEvent(sessionObj, 'terminal-session-data', {
      data: unsent,
      source
    });
  }
}

function emitTerminalSessionStream(sessionObj, rawChunk, source = 'stdout') {
  const chunk = String(rawChunk || '');
  if (!chunk) return;
  if (!sessionObj?.sessionWebContents || sessionObj.sessionWebContents.isDestroyed()) return;
  const merged = `${sessionObj.sessionLineBuffer || ''}${chunk}`;
  const parts = merged.split('\n');
  sessionObj.sessionLineBuffer = parts.pop() ?? '';

  // Process completed lines (those followed by \n)
  if (parts.length > 0) {
    const alreadySent = Number.isFinite(sessionObj.partialSentLength)
      ? sessionObj.partialSentLength
      : 0;
    let output = '';

    for (let i = 0; i < parts.length; i++) {
      const line = parts[i];
    if (shouldDropTerminalSessionLine(line, sessionObj)) {
        // If partial data for this line was already displayed, erase it
        if (i === 0 && alreadySent > 0) {
          output += '\x1b[2K\r';
        }
        continue;
      }
      if (i === 0 && alreadySent > 0) {
        // First line: content was already sent as partial deltas, only send unsent tail + \n
        const unsent = line.slice(Math.min(alreadySent, line.length));
        output += `${unsent}\n`;
      } else {
        output += `${line}\n`;
      }
    }

    if (output) {
      appendTerminalSessionBuffer(sessionObj, output);
      emitTerminalSessionEvent(sessionObj, 'terminal-session-data', {
        data: output,
        source
      });
    }

    // Reset partial tracking since we completed lines
    sessionObj.partialSentLength = 0;
  }

  // Send partial delta for the remaining incomplete line
  // Suppress if it looks like a stty resize command being echoed
  const partialText = sessionObj.sessionLineBuffer || '';
  const previousPartialLength = Number.isFinite(sessionObj.partialSentLength)
    ? sessionObj.partialSentLength
    : 0;
  const safePreviousLength = Math.min(previousPartialLength, partialText.length);
  const partialDelta = partialText.slice(safePreviousLength);
  if (partialDelta) {
    // Suppress partial output while stty resize is being echoed
    const suppressUntil = sessionObj.suppressPartialsUntil || 0;
    if (suppressUntil && Date.now() < suppressUntil) {
      sessionObj.partialSentLength = partialText.length;
      return;
    }
    appendTerminalSessionBuffer(sessionObj, partialDelta);
    emitTerminalSessionEvent(sessionObj, 'terminal-session-data', {
      data: partialDelta,
      source
    });
  }
  sessionObj.partialSentLength = partialText.length;
}

function terminateTerminalProcess(sessionObj) {
  const child = sessionObj?.process;
  const pid = Number(child?.pid);
  if (!child || !Number.isFinite(pid) || pid <= 0) return;

  if (IS_WINDOWS) {
    try {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      if (killer && typeof killer.unref === 'function') killer.unref();
    } catch {}
    try {
      child.kill('SIGKILL');
    } catch {}
    return;
  }

  const canKillGroup = Boolean(sessionObj.processGroup);
  try {
    if (canKillGroup) {
      process.kill(-pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {}

  const hardKillTimer = setTimeout(() => {
    try {
      if (canKillGroup) {
        process.kill(-pid, 'SIGKILL');
      } else {
        child.kill('SIGKILL');
      }
    } catch {}
  }, 800);
  if (typeof hardKillTimer.unref === 'function') hardKillTimer.unref();
}

function applyConfiguredCwdIfNeeded(sessionObj) {
  if (!sessionObj?.needsConfiguredCwd) return false;
  if (!sessionObj.configuredCwd) {
    sessionObj.needsConfiguredCwd = false;
    return false;
  }
  const script = `cd "${escapeBashDoubleQuoted(sessionObj.configuredCwd)}" >/dev/null 2>&1 || echo "Warning: could not cd into ${escapeBashDoubleQuoted(sessionObj.configuredCwd)}"\n`;
  try {
    sessionObj.process.stdin.write(script, 'utf8');
    sessionObj.needsConfiguredCwd = false;
    sessionObj.currentCwd = sessionObj.configuredCwd;
    return true;
  } catch {
    return false;
  }
}

function flushTerminalChunk(sessionObj, pending, rawChunk, source = 'stdout') {
  const chunk = stripAnsi(rawChunk);
  if (!chunk) return;
  const merged = `${pending.lineBuffer || ''}${chunk}`;
  const parts = merged.split('\n');
  pending.lineBuffer = parts.pop() ?? '';

  let filteredChunk = '';
  for (const line of parts) {
    const fullLine = `${line}\n`;
    if (shouldDropTerminalLine(pending, line)) continue;
    filteredChunk += fullLine;
  }

  if (!filteredChunk) return;
  pending.accumulated += filteredChunk;
  emitTerminalEvent(pending.webContents, 'terminal-stream-delta', {
    mochiId: sessionObj.mochiId,
    delta: filteredChunk,
    accumulated: pending.accumulated,
    source
  });
}

function completeTerminalPending(sessionObj, pending, exitCode, resolvedCwd = '') {
  if (sessionObj.pending !== pending) return;
  sessionObj.pending = null;
  if (pending.lineBuffer) {
    if (!shouldDropTerminalLine(pending, pending.lineBuffer)) {
      pending.accumulated += pending.lineBuffer;
    }
    pending.lineBuffer = '';
  }
  const content = sanitizeTerminalOutput(pending.accumulated, pending);
  emitTerminalEvent(pending.webContents, 'terminal-stream-done', {
    mochiId: sessionObj.mochiId,
    exitCode,
    content
  });
  if (resolvedCwd) {
    sessionObj.currentCwd = resolvedCwd;
  }
  pending.resolve({ ok: true, content, exitCode, cwd: sessionObj.currentCwd || resolvedCwd || '' });
}

function failTerminalPending(sessionObj, errorMessage) {
  const pending = sessionObj?.pending;
  if (!pending) return;
  sessionObj.pending = null;
  emitTerminalEvent(pending.webContents, 'terminal-stream-error', {
    mochiId: sessionObj.mochiId,
    error: errorMessage
  });
  pending.reject(new Error(errorMessage));
}

function onTerminalStdout(sessionObj, data) {
  if (data) {
    emitTerminalSessionStream(sessionObj, String(data || ''), 'stdout');
  }
  const pending = sessionObj.pending;
  if (!pending || !data) return;
  pending.stdoutBuffer += data;
  const keepCharsForMarkers = Math.max(
    TERMINAL_STREAM_TAIL_KEEP,
    pending.marker.length + pending.startMarker.length + 64
  );

  if (!pending.started) {
    const startPattern = new RegExp(`${escapeRegex(pending.startMarker)}\\r?\\n`);
    const startMatch = startPattern.exec(pending.stdoutBuffer);
    if (!startMatch) {
      if (pending.stdoutBuffer.length > keepCharsForMarkers) {
        pending.stdoutBuffer = pending.stdoutBuffer.slice(-keepCharsForMarkers);
      }
      return;
    }
    pending.started = true;
    pending.stdoutBuffer = pending.stdoutBuffer.slice(startMatch.index + startMatch[0].length);
  }

  const markerPattern = new RegExp(`${escapeRegex(pending.marker)}(\\d+)\\|([^\\r\\n]*)\\r?\\n`);
  const match = markerPattern.exec(pending.stdoutBuffer);

  if (!match) {
    const keepChars = Math.max(TERMINAL_STREAM_TAIL_KEEP, pending.marker.length + 64);
    if (pending.stdoutBuffer.length > keepChars) {
      const flushUntil = pending.stdoutBuffer.length - keepChars;
      const flushChunk = pending.stdoutBuffer.slice(0, flushUntil);
      pending.stdoutBuffer = pending.stdoutBuffer.slice(flushUntil);
      flushTerminalChunk(sessionObj, pending, flushChunk, 'stdout');
    }
    return;
  }

  const beforeMarker = pending.stdoutBuffer.slice(0, match.index);
  flushTerminalChunk(sessionObj, pending, beforeMarker, 'stdout');

  const exitCode = Number.parseInt(match[1], 10);
  const resolvedCwd = normalizeTerminalCwd(match[2] || '');
  pending.stdoutBuffer = pending.stdoutBuffer.slice(match.index + match[0].length);
  completeTerminalPending(sessionObj, pending, Number.isFinite(exitCode) ? exitCode : 0, resolvedCwd);
}

function onTerminalStderr(sessionObj, data) {
  if (data) {
    emitTerminalSessionStream(sessionObj, String(data || ''), 'stderr');
  }
  const pending = sessionObj.pending;
  if (!pending || !data) return;
  if (!pending.started) return;
  flushTerminalChunk(sessionObj, pending, data, 'stderr');
}

function createTerminalSession(mochiId, settings = {}) {
  const distro = normalizeTerminalDistro(settings.terminalDistro);
  const configuredCwd = normalizeTerminalCwd(settings.terminalCwd);
  const spawnSpec = buildInteractiveTerminalSessionSpawnSpec(distro, configuredCwd);

  const spawnOptions = {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: !IS_WINDOWS,
    windowsHide: true,
    env: {
      ...process.env,
      TERM: process.env.TERM || 'xterm-256color',
      COLORTERM: process.env.COLORTERM || 'truecolor',
      TERM_PROGRAM: process.env.TERM_PROGRAM || 'MochiDesktop',
      TERM_PROGRAM_VERSION: process.env.TERM_PROGRAM_VERSION || '0.1.0',
      COLUMNS: '80',
      LINES: '24'
    }
  };
  if (spawnSpec.cwd) {
    spawnOptions.cwd = spawnSpec.cwd;
  }

  const child = spawn(spawnSpec.command, spawnSpec.args, spawnOptions);

  const sessionObj = {
    mochiId,
    distro,
    configuredCwd,
    needsConfiguredCwd: false,
    currentCwd: configuredCwd || '',
    sessionCols: 0,
    sessionRows: 0,
    sessionWebContents: null,
    sessionBuffer: '',
    sessionLineBuffer: '',
    partialSentLength: 0,
    process: child,
    processGroup: Boolean(spawnOptions.detached),
    pending: null,
    closing: false,
    createdAt: Date.now(),
    pendingSttyCommands: []
  };

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (data) => onTerminalStdout(sessionObj, String(data || '')));
  child.stderr.on('data', (data) => onTerminalStderr(sessionObj, String(data || '')));
  child.on('error', (error) => {
    const message = error?.message ? `TERMINAL_ERROR:${error.message}` : 'TERMINAL_ERROR';
    emitTerminalSessionEvent(sessionObj, 'terminal-session-state', {
      state: 'error',
      error: message
    });
    emitTerminalSessionEvent(sessionObj, 'terminal-session-exit', {
      code: null,
      signal: 'ERROR',
      error: message
    });
    failTerminalPending(sessionObj, message);
    terminalSessions.delete(mochiId);
  });
  child.on('exit', (code, signal) => {
    terminalSessions.delete(mochiId);
    flushTerminalSessionLineBuffer(sessionObj);
    emitTerminalSessionEvent(sessionObj, 'terminal-session-exit', {
      code: Number.isFinite(code) ? code : null,
      signal: signal || ''
    });
    emitTerminalSessionEvent(sessionObj, 'terminal-session-state', {
      state: sessionObj.closing ? 'closed' : 'exited',
      code: Number.isFinite(code) ? code : null,
      signal: signal || ''
    });
    if (sessionObj.pending) {
      const message = sessionObj.closing
        ? 'TERMINAL_SESSION_CLOSED'
        : `TERMINAL_SESSION_EXIT:${code ?? ''}${signal ? `:${signal}` : ''}`;
      failTerminalPending(sessionObj, message);
    }
  });

  terminalSessions.set(mochiId, sessionObj);
  return sessionObj;
}

function closeTerminalSession(mochiId, reason = 'TERMINAL_SESSION_CLOSED') {
  const sessionObj = terminalSessions.get(mochiId);
  if (!sessionObj) return false;
  terminalSessions.delete(mochiId);
  sessionObj.closing = true;
  emitTerminalSessionEvent(sessionObj, 'terminal-session-state', {
    state: 'closing',
    reason
  });
  if (sessionObj.pending) {
    failTerminalPending(sessionObj, reason);
  }
  flushTerminalSessionLineBuffer(sessionObj);
  terminateTerminalProcess(sessionObj);
  return true;
}

function closeAllTerminalSessions() {
  for (const mochiId of terminalSessions.keys()) {
    closeTerminalSession(mochiId, 'TERMINAL_SESSION_CLOSED');
  }
}

function getOrCreateTerminalSession(mochiId, settings = {}) {
  const desiredDistro = normalizeTerminalDistro(settings.terminalDistro);
  const desiredCwd = normalizeTerminalCwd(settings.terminalCwd);
  let sessionObj = terminalSessions.get(mochiId);
  if (sessionObj && sessionObj.distro !== desiredDistro) {
    closeTerminalSession(mochiId, 'TERMINAL_SESSION_REPLACED');
    sessionObj = null;
  }
  if (!sessionObj) {
    sessionObj = createTerminalSession(mochiId, {
      terminalDistro: desiredDistro,
      terminalCwd: desiredCwd
    });
    return sessionObj;
  }

  if (desiredCwd !== sessionObj.configuredCwd) {
    sessionObj.configuredCwd = desiredCwd;
    sessionObj.needsConfiguredCwd = Boolean(desiredCwd);
  }
  return sessionObj;
}

function attachTerminalSession(webContents, mochiId, settings = {}) {
  const sessionObj = getOrCreateTerminalSession(mochiId, settings);
  sessionObj.sessionWebContents = webContents || null;
  // Only apply cd for re-attached sessions (not freshly created ones where bootstrap handles it)
  if (!sessionObj.pending && sessionObj.needsConfiguredCwd) {
    applyConfiguredCwdIfNeeded(sessionObj);
  }
  emitTerminalSessionEvent(sessionObj, 'terminal-session-state', {
    state: 'running',
    distro: sessionObj.distro,
    cwd: sessionObj.currentCwd || sessionObj.configuredCwd || '',
    cols: Number.isFinite(sessionObj.sessionCols) ? sessionObj.sessionCols : 0,
    rows: Number.isFinite(sessionObj.sessionRows) ? sessionObj.sessionRows : 0
  });
  return {
    ok: true,
    distro: sessionObj.distro,
    cwd: sessionObj.currentCwd || sessionObj.configuredCwd || '',
    replayData: sessionObj.sessionBuffer || ''
  };
}

function writeTerminalSessionInput(mochiId, rawData) {
  const sessionObj = terminalSessions.get(mochiId);
  if (!sessionObj) {
    return { ok: false, error: 'TERMINAL_SESSION_NOT_STARTED' };
  }
  const data = String(rawData || '');
  if (!data) {
    return { ok: true };
  }
  try {
    sessionObj.process.stdin.write(data, 'utf8');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ? `TERMINAL_WRITE_ERROR:${error.message}` : 'TERMINAL_WRITE_ERROR'
    };
  }
}

function runTerminalSessionLine(mochiId, lineText) {
  const line = String(lineText || '');
  return writeTerminalSessionInput(mochiId, `${line}\n`);
}

function resizeTerminalSession(mochiId, cols, rows) {
  const sessionObj = terminalSessions.get(mochiId);
  if (!sessionObj) {
    return { ok: false, error: 'TERMINAL_SESSION_NOT_STARTED' };
  }
  const parsedCols = Number.parseInt(`${cols}`, 10);
  const parsedRows = Number.parseInt(`${rows}`, 10);
  const safeCols = Number.isFinite(parsedCols) ? Math.max(20, Math.min(500, parsedCols)) : 80;
  const safeRows = Number.isFinite(parsedRows) ? Math.max(6, Math.min(240, parsedRows)) : 24;
  sessionObj.sessionCols = safeCols;
  sessionObj.sessionRows = safeRows;

  const sendStty = () => {
    // Suppress partial output while the stty command is being echoed by the PTY
    sessionObj.suppressPartialsUntil = Date.now() + 500;
    const sttyCommand = `stty cols ${safeCols} rows ${safeRows} 2>/dev/null`;
    try {
      sessionObj.process.stdin.write(`${sttyCommand}\n`, 'utf8');
      queuePendingSttyCommand(sessionObj, sttyCommand);
    } catch {}
    try {
      sessionObj.process.kill('SIGWINCH');
    } catch {}
  };

  // Delay stty for newly created sessions so the shell has time to initialize
  const age = Date.now() - (sessionObj.createdAt || 0);
  if (age < 1000) {
    // Suppress partials during the entire initialization period
    sessionObj.suppressPartialsUntil = Date.now() + 1000 - age + 500;
    setTimeout(sendStty, 1000 - age);
  } else {
    sendStty();
  }
  return { ok: true, cols: safeCols, rows: safeRows };
}

function findCommonPrefix(values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  let prefix = String(values[0] || '');
  for (let i = 1; i < values.length; i += 1) {
    const current = String(values[i] || '');
    let j = 0;
    const max = Math.min(prefix.length, current.length);
    while (j < max && prefix[j] === current[j]) j += 1;
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  return prefix;
}

function resolveTerminalCommandCompatibility(commandText) {
  const command = String(commandText || '').replace(/\r\n?/g, '\n').trim();
  if (!command || command.includes('\n')) {
    return { command };
  }

  const match = /^([^\s]+)(?:\s+([\s\S]*))?$/.exec(command);
  if (!match) {
    return { command };
  }

  const executable = match[1];
  const tail = String(match[2] || '').trim();
  const base = path.basename(executable || '').toLowerCase();
  if (!base) {
    return { command };
  }

  if (base === 'codex') {
    if (!tail) {
      return {
        error: 'codex is interactive. In Mochi terminal, use: codex exec "<prompt>"'
      };
    }
    if (/^(--help|-h|--version|-V)\b/.test(tail)) {
      return { command };
    }
    const firstArg = tail.split(/\s+/, 1)[0].toLowerCase();
    if (TERMINAL_CODEX_SAFE_SUBCOMMANDS.has(firstArg)) {
      return { command };
    }
    if (firstArg.startsWith('-')) {
      return {
        error: 'Interactive codex flags are not supported in chat mode. Use: codex exec "<prompt>"'
      };
    }
    return { command: `codex exec ${shellQuoteSingle(tail)}` };
  }

  if (base === 'claude') {
    if (!tail) {
      return {
        error: 'claude is interactive. In Mochi terminal, use: claude -p "<prompt>"'
      };
    }
    if (/^(--help|-h|--version|-v)\b/.test(tail)) {
      return { command };
    }
    if (/(^|\s)(-p|--print)(\s|$)/.test(tail)) {
      return { command };
    }
    const firstArg = tail.split(/\s+/, 1)[0].toLowerCase();
    if (TERMINAL_CLAUDE_SAFE_SUBCOMMANDS.has(firstArg)) {
      return { command };
    }
    if (firstArg.startsWith('-')) {
      return {
        error: 'Interactive claude flags are not supported in chat mode. Use: claude -p "<prompt>"'
      };
    }
    return { command: `claude -p ${shellQuoteSingle(tail)}` };
  }

  return { command };
}

async function getTerminalAutocomplete(mochiId, fragment, settings = {}) {
  const query = String(fragment || '');
  if (!query) {
    return { ok: true, completion: '', candidates: [] };
  }

  const sessionObj = getOrCreateTerminalSession(mochiId, settings);
  const cwd = normalizeTerminalCwd(sessionObj.currentCwd || sessionObj.configuredCwd || settings.terminalCwd);
  const distro = normalizeTerminalDistro(settings.terminalDistro || sessionObj.distro);
  const cwdPrefix = cwd
    ? `cd "${escapeBashDoubleQuoted(cwd)}" >/dev/null 2>&1 || true\n`
    : '';
  const script = `${cwdPrefix}fragment="${escapeBashDoubleQuoted(query)}"\ncompgen -c -- "$fragment" 2>/dev/null\ncompgen -f -- "$fragment" 2>/dev/null\n`;
  const spawnSpec = buildTerminalScriptSpawnSpec(script, distro);

  const raw = await new Promise((resolve) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
        COLORTERM: process.env.COLORTERM || 'truecolor',
        TERM_PROGRAM: process.env.TERM_PROGRAM || 'MochiDesktop',
        TERM_PROGRAM_VERSION: process.env.TERM_PROGRAM_VERSION || '0.1.0'
      }
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, error: 'TERMINAL_AUTOCOMPLETE_TIMEOUT', stdout, stderr });
    }, 3500);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      finish({ ok: false, error: error?.message ? `TERMINAL_AUTOCOMPLETE_ERROR:${error.message}` : 'TERMINAL_AUTOCOMPLETE_ERROR', stdout, stderr });
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stdout.trim()) {
        finish({ ok: false, error: `TERMINAL_AUTOCOMPLETE_EXIT:${code}`, stdout, stderr });
        return;
      }
      finish({ ok: true, stdout, stderr });
    });
  });

  if (!raw.ok) {
    return { ok: false, error: raw.error || 'TERMINAL_AUTOCOMPLETE_FAILED', completion: '', candidates: [] };
  }

  const candidates = Array.from(new Set(
    String(raw.stdout || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && line.startsWith(query))
  )).sort((a, b) => a.localeCompare(b));

  if (candidates.length === 0) {
    return { ok: true, completion: query, candidates: [] };
  }

  const completion = candidates.length === 1
    ? candidates[0]
    : (findCommonPrefix(candidates) || query);

  return {
    ok: true,
    completion,
    candidates: candidates.slice(0, 80),
    exact: candidates.length === 1
  };
}

async function executeTerminalCommand(webContents, mochiId, commandText, settings = {}) {
  const commandInput = String(commandText || '').replace(/\r\n?/g, '\n').trim();
  if (!commandInput) {
    return { ok: false, error: 'Empty command.' };
  }
  const compatibility = resolveTerminalCommandCompatibility(commandInput);
  if (compatibility.error) {
    return { ok: false, error: compatibility.error };
  }
  const command = String(compatibility.command || '').trim();
  if (!command) {
    return { ok: false, error: 'Empty command.' };
  }

  const sessionObj = getOrCreateTerminalSession(mochiId, {
    terminalDistro: settings.terminalDistro,
    terminalCwd: settings.terminalCwd
  });

  if (sessionObj.pending) {
    return { ok: false, error: 'TERMINAL_BUSY' };
  }

  const markerSeed = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const startMarker = `__MOCHI_START_${markerSeed}__`;
  const marker = `__MOCHI_DONE_${markerSeed}__`;
  const commandTrimmed = command.trim();

  return new Promise((resolve, reject) => {
    sessionObj.pending = {
      startMarker,
      marker,
      command,
      commandTrimmed,
      webContents,
      resolve,
      reject,
      accumulated: '',
      stdoutBuffer: '',
      lineBuffer: '',
      started: false
    };

    const applyConfiguredCwd = sessionObj.needsConfiguredCwd && Boolean(sessionObj.configuredCwd);
    const cwdPrefix = applyConfiguredCwd
      ? `cd "${escapeBashDoubleQuoted(sessionObj.configuredCwd)}" >/dev/null 2>&1 || echo "Warning: could not cd into ${escapeBashDoubleQuoted(sessionObj.configuredCwd)}"\n`
      : '';
    const startLine = `printf "${startMarker}\\n"\n`;
    const markerLine = `__mochi_exit="$?"\nprintf "\\n${marker}%s|%s\\n" "$__mochi_exit" "$(pwd)"\n`;
    const script = `${cwdPrefix}${startLine}${command}\n${markerLine}`;
    if (applyConfiguredCwd) {
      sessionObj.needsConfiguredCwd = false;
    }

    try {
      sessionObj.process.stdin.write(script, 'utf8');
    } catch (error) {
      const message = error?.message ? `TERMINAL_WRITE_ERROR:${error.message}` : 'TERMINAL_WRITE_ERROR';
      failTerminalPending(sessionObj, message);
    }
  }).catch((error) => ({ ok: false, error: error?.message || 'TERMINAL_ERROR' }));
}

function resolveOllamaUrl(rawUrl) {
  const fallback = 'http://127.0.0.1:11434';
  const input = (rawUrl || fallback).trim();
  const withProtocol = /^https?:\/\//i.test(input) ? input : `http://${input}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:') {
      throw new Error(`OLLAMA_HTTP_ONLY:${parsed.origin || input}`);
    }
    return parsed.origin;
  } catch (err) {
    if (err?.message?.startsWith('OLLAMA_HTTP_ONLY:')) {
      throw err;
    }
    return fallback;
  }
}

async function callAiApi(provider, model, apiKey, messages, ollamaUrl) {
  let url;
  let headers;
  let body;
  let resolvedOllamaUrl = '';

  if (provider === 'ollama') {
    resolvedOllamaUrl = resolveOllamaUrl(ollamaUrl);
    const base = resolvedOllamaUrl.replace(/\/$/, '');
    url = `${base}/api/chat`;
    headers = { 'Content-Type': 'application/json' };
    body = {
      model: model || 'gemma3:1b',
      messages,
      stream: false
    };
  } else {
    if (!apiKey) {
      throw new Error('No API key set! Open settings and add your OpenRouter API key.');
    }
    url = 'https://openrouter.ai/api/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://mochi.dev',
      'X-Title': 'Mochi Desktop'
    };
    body = {
      model,
      messages,
      max_tokens: 256,
      temperature: 0.8
    };
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (provider === 'ollama') {
      throw new Error(`OLLAMA_CONNECT:${resolvedOllamaUrl || resolveOllamaUrl(ollamaUrl)}`);
    }
    throw new Error('Network error - check your connection and try again.');
  }

  if (response.status === 401) {
    throw new Error('Invalid API key. Please check your key in settings.');
  }
  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 402) {
      throw new Error('NO_CREDITS');
    }
    if (response.status === 429) {
      const errorCode = payload?.error?.code || payload?.error?.type;
      if (errorCode === 'insufficient_quota') {
        throw new Error('NO_CREDITS');
      }
      throw new Error('Rate limited - too many requests. Wait a moment and try again.');
    }

    const text = payload ? JSON.stringify(payload).slice(0, 160) : await response.text().catch(() => '');
    if (provider === 'ollama') {
      if (response.status === 403) {
        throw new Error(`OLLAMA_FORBIDDEN:${resolvedOllamaUrl || resolveOllamaUrl(ollamaUrl)}`);
      }
      if (response.status === 404 || text.toLowerCase().includes('not found') || text.toLowerCase().includes('does not exist')) {
        throw new Error(`MODEL_NOT_FOUND:${model}`);
      }
    }
    throw new Error(`API error (${response.status}): ${text || 'Unknown error'}`);
  }

  const data = await response.json();
  const content = provider === 'ollama'
    ? data?.message?.content
    : data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('NO_RESPONSE');
  }
  return content;
}

async function callOpenRouterStream(model, apiKey, messages, onDelta) {
  if (!apiKey) {
    throw new Error('No API key set! Open settings and add your OpenRouter API key.');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://mochi.dev',
        'X-Title': 'Mochi Desktop'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 256,
        temperature: 0.8,
        stream: true
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your key in settings.');
    }
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.status === 402) {
        throw new Error('NO_CREDITS');
      }
      if (response.status === 429) {
        const errorCode = payload?.error?.code || payload?.error?.type;
        if (errorCode === 'insufficient_quota') {
          throw new Error('NO_CREDITS');
        }
        throw new Error('Rate limited - too many requests. Wait a moment and try again.');
      }

      const text = payload ? JSON.stringify(payload).slice(0, 160) : await response.text().catch(() => '');
      throw new Error(`API error (${response.status}): ${text || 'Unknown error'}`);
    }

    if (!response.body) {
      throw new Error('Streaming not supported by the server.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') {
          continue;
        }
        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = payload?.choices?.[0]?.delta?.content
          || payload?.choices?.[0]?.message?.content
          || payload?.choices?.[0]?.text
          || '';
        if (delta) {
          fullText += delta;
          if (onDelta) onDelta(delta, fullText);
        }
      }
    }

    return fullText;
  } catch (err) {
    throw new Error(err?.message || 'Network error - check your connection and try again.');
  }
}

async function callOllamaStream(model, messages, ollamaUrl, onDelta) {
  const resolvedUrl = resolveOllamaUrl(ollamaUrl);
  const base = resolvedUrl.replace(/\/$/, '');
  const url = `${base}/api/chat`;
  const headers = { 'Content-Type': 'application/json' };
  const body = {
    model: model || 'gemma3:1b',
    messages,
    stream: true
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
  } catch (err) {
    throw new Error(`OLLAMA_CONNECT:${resolvedUrl}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (response.status === 403) {
      throw new Error(`OLLAMA_FORBIDDEN:${resolvedUrl}`);
    }
    if (response.status === 404 || text.toLowerCase().includes('not found') || text.toLowerCase().includes('does not exist')) {
      throw new Error(`MODEL_NOT_FOUND:${model}`);
    }
    throw new Error(`API error (${response.status}): ${text || 'Unknown error'}`);
  }

  if (!response.body) {
    throw new Error('Streaming not supported by the server.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let payload;
      try {
        payload = JSON.parse(line);
      } catch {
        continue;
      }
      if (payload?.done) continue;
      const delta = payload?.message?.content || payload?.response || '';
      if (delta) {
        fullText += delta;
        if (onDelta) onDelta(delta, fullText);
      }
    }
  }

  return fullText;
}

let openClawReqCounter = 0;

function nextOpenClawId(prefix = 'mochi') {
  openClawReqCounter = (openClawReqCounter + 1) % 1_000_000_000;
  return `${prefix}-${Date.now()}-${openClawReqCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOpenClawGatewayUrl(rawUrl) {
  const fallback = 'ws://127.0.0.1:18789';
  const input = String(rawUrl || fallback).trim();
  const withProtocol = /^[a-z]+:\/\//i.test(input) ? input : `ws://${input}`;

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`OPENCLAW_INVALID_URL:${input || fallback}`);
  }

  if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
  if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`OPENCLAW_INVALID_URL:${input || fallback}`);
  }

  return parsed.toString();
}

function extractOpenClawText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.content === 'string') return payload.content;
  if (typeof payload.text === 'string') return payload.text;
  if (payload.delta) {
    if (typeof payload.delta.content === 'string') return payload.delta.content;
    if (typeof payload.delta.text === 'string') return payload.delta.text;
  }
  if (payload.message) {
    const msg = payload.message;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content.map((c) => c?.text || c?.content || c?.value || '').join('');
    }
  }
  if (Array.isArray(payload.content)) {
    return payload.content.map((c) => c?.text || c?.content || c?.value || '').join('');
  }
  return '';
}

function mergeOpenClawStreamText(current, next) {
  if (!next) return current;
  if (!current) return next;
  if (next === current) return current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  if (next.includes(current)) return next;
  if (current.includes(next)) return current;
  const maxOverlap = Math.min(current.length, next.length);
  for (let i = maxOverlap; i > 0; i -= 1) {
    if (current.slice(-i) === next.slice(0, i)) {
      return current + next.slice(i);
    }
  }
  return current + next;
}

function getLastUserMessageText(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const lastUser = [...list].reverse().find((m) => m && m.role === 'user');
  return String(lastUser?.content || '').trim();
}

function buildOpenClawSessionKey(mochiId, agentName) {
  const raw = String(agentName || mochiId || 'main').toLowerCase();
  const safe = raw.replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 48) || 'main';
  return `agent:${safe}:main`;
}

function isOpenClawRetryableError(errorMessage) {
  return (
    errorMessage.startsWith('OPENCLAW_CONNECT:') ||
    errorMessage.startsWith('OPENCLAW_TIMEOUT:') ||
    errorMessage.startsWith('OPENCLAW_IDLE_TIMEOUT:') ||
    errorMessage.startsWith('OPENCLAW_CLOSED:') ||
    errorMessage.startsWith('OPENCLAW_INCOMPLETE_CLOSE:') ||
    errorMessage === 'OPENCLAW_EMPTY_RESPONSE'
  );
}

function getOpenClawFallbackWebContents(preferredWebContents) {
  if (preferredWebContents && !preferredWebContents.isDestroyed()) return preferredWebContents;
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow.webContents;
  if (settingsWindow && !settingsWindow.isDestroyed()) return settingsWindow.webContents;
  return null;
}

async function callOpenClawViaRenderer(webContents, normalizedUrl, authToken, messageText, sessionKey) {
  if (!webContents || webContents.isDestroyed()) {
    throw new Error('OPENCLAW_WEBSOCKET_UNAVAILABLE');
  }

  const payload = {
    normalizedUrl,
    authToken,
    messageText,
    sessionKey
  };

  const script = `
    (async () => {
      const payload = ${JSON.stringify(payload)};
      const wsUrl = String(payload.normalizedUrl || '');
      const token = String(payload.authToken || '');
      const message = String(payload.messageText || '');
      const sessionKey = String(payload.sessionKey || 'agent:main:main');
      const idleTimeoutMs = ${OPENCLAW_IDLE_TIMEOUT_MS};

      if (typeof WebSocket !== 'function') throw new Error('OPENCLAW_WEBSOCKET_UNAVAILABLE');
      if (!token) throw new Error('OPENCLAW_MISSING_TOKEN');
      if (!message) throw new Error('OPENCLAW_EMPTY_MESSAGE');

      let requestCounter = 0;
      const nextId = (prefix) => \`\${prefix}_\${Date.now()}_\${++requestCounter}\`;

      const extractText = (payload) => {
        if (!payload || typeof payload !== 'object') return '';
        if (typeof payload === 'string') return payload;
        if (typeof payload.content === 'string') return payload.content;
        if (typeof payload.text === 'string') return payload.text;
        if (payload.delta) {
          if (typeof payload.delta.content === 'string') return payload.delta.content;
          if (typeof payload.delta.text === 'string') return payload.delta.text;
        }
        if (payload.message) {
          const msg = payload.message;
          if (typeof msg.content === 'string') return msg.content;
          if (Array.isArray(msg.content)) {
            return msg.content.map((c) => c?.text || c?.content || c?.value || '').join('');
          }
        }
        if (Array.isArray(payload.content)) {
          return payload.content.map((c) => c?.text || c?.content || c?.value || '').join('');
        }
        return '';
      };

      const mergeText = (current, next) => {
        if (!next) return current;
        if (!current) return next;
        if (next === current) return current;
        if (next.startsWith(current)) return next;
        if (current.startsWith(next)) return current;
        if (next.includes(current)) return next;
        if (current.includes(next)) return current;
        const maxOverlap = Math.min(current.length, next.length);
        for (let i = maxOverlap; i > 0; i -= 1) {
          if (current.slice(-i) === next.slice(0, i)) {
            return current + next.slice(i);
          }
        }
        return current + next;
      };

      return await new Promise((resolve, reject) => {
        let ws;
        let settled = false;
        let authenticated = false;
        let chatRequestSent = false;
        let sawCompletion = false;
        let responseText = '';
        let idleTimer = null;

        const timeout = setTimeout(() => {
          fail(new Error(\`OPENCLAW_TIMEOUT:\${wsUrl}\`));
        }, 70000);

        const armIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            if (sawCompletion && responseText) {
              finish(responseText);
              return;
            }
            fail(new Error(\`OPENCLAW_IDLE_TIMEOUT:\${wsUrl}\`));
          }, idleTimeoutMs);
        };

        const touchActivity = () => {
          armIdleTimer();
        };

        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
          if (ws && ws.readyState === 1) ws.close(1000, 'done');
          resolve(result);
        };

        const fail = (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
          if (ws && ws.readyState === 1) ws.close(1011, 'error');
          reject(err);
        };

        const pushText = (nextText) => {
          if (!nextText) return;
          const merged = mergeText(responseText, nextText);
          if (merged === responseText) return;
          responseText = merged;
        };

        try {
          ws = new WebSocket(wsUrl);
        } catch {
          fail(new Error(\`OPENCLAW_CONNECT:\${wsUrl}\`));
          return;
        }

        ws.addEventListener('message', (event) => {
          touchActivity();
          let data;
          try {
            const raw = typeof event.data === 'string' ? event.data : '';
            if (!raw) return;
            data = JSON.parse(raw);
          } catch {
            return;
          }

          if (data.type === 'event' && data.event === 'connect.challenge') {
            const connectReq = {
              type: 'req',
              id: nextId('connect'),
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: { id: 'gateway-client', version: '1.0.0', platform: 'desktop', mode: 'backend' },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                auth: { token }
              }
            };
            ws.send(JSON.stringify(connectReq));
            return;
          }

          if (data.type === 'res' && !authenticated && data.ok === false) {
            const errMsg = data.error?.message || data.error?.code || 'Authentication failed';
            fail(new Error(\`OPENCLAW_AUTH_FAILED:\${errMsg}\`));
            return;
          }

          if (data.type === 'res' && !authenticated && (data.payload?.type === 'hello-ok' || data.ok === true)) {
            authenticated = true;
            if (!chatRequestSent) {
              chatRequestSent = true;
              const agentReq = {
                type: 'req',
                id: nextId('chat'),
                method: 'chat.send',
                params: {
                  sessionKey,
                  message,
                  idempotencyKey: nextId('idem')
                }
              };
              ws.send(JSON.stringify(agentReq));
            }
            return;
          }

          if (data.type === 'event') {
            const payload = data.payload || {};
            const text = extractText(payload);
            if (text) pushText(text);
            if (payload.state === 'error') {
              fail(new Error(\`OPENCLAW_ERROR:\${payload.errorMessage || 'Chat failed'}\`));
              return;
            }
            if (payload.state === 'final' || payload.status === 'completed' || payload.status === 'done' || payload.type === 'done' || payload.done === true) {
              sawCompletion = true;
              finish(responseText || text || '(no response)');
            }
            return;
          }

          if (data.type === 'res' && authenticated && data.ok === true) {
            if (data.payload?.runId) return;
            const text = extractText(data.payload);
            if (text) pushText(text);
            const status = data.payload?.status;
            if (status === 'completed' || status === 'done' || data.payload?.done) {
              sawCompletion = true;
              finish(responseText || text || '(no response)');
            }
            return;
          }

          if (data.type === 'res' && authenticated && data.ok === false) {
            const errMsg = data.error?.message || data.error?.code || 'Agent request failed';
            fail(new Error(\`OPENCLAW_ERROR:\${errMsg}\`));
          }
        });

        ws.addEventListener('error', () => {
          fail(new Error(\`OPENCLAW_CONNECT:\${wsUrl}\`));
        });

        ws.addEventListener('close', (event) => {
          if (settled) return;
          if (sawCompletion && responseText) {
            finish(responseText);
            return;
          }
          if (responseText) {
            fail(new Error(\`OPENCLAW_INCOMPLETE_CLOSE:\${event.code}\`));
            return;
          }
          if (event.code === 1000 || event.code === 1001) {
            fail(new Error('OPENCLAW_EMPTY_RESPONSE'));
            return;
          }
          fail(new Error(\`OPENCLAW_CLOSED:\${event.code}\`));
        });

        armIdleTimer();
      });
    })();
  `;

  try {
    return await webContents.executeJavaScript(script, true);
  } catch (error) {
    const message = error?.message ? String(error.message) : '';
    throw new Error(message || `OPENCLAW_CONNECT:${normalizedUrl}`);
  }
}

async function callOpenClaw(gatewayUrl, token, messages, options = {}) {
  const normalizedUrl = normalizeOpenClawGatewayUrl(gatewayUrl);
  const authToken = String(token || '').trim();
  if (!authToken) {
    throw new Error('OPENCLAW_MISSING_TOKEN');
  }

  const messageText = getLastUserMessageText(messages);
  if (!messageText) {
    throw new Error('OPENCLAW_EMPTY_MESSAGE');
  }

  const sessionKey = options.sessionKey || buildOpenClawSessionKey(options.mochiId, options.agentName);
  const onDelta = typeof options.onDelta === 'function' ? options.onDelta : null;

  return new Promise((resolve, reject) => {
    let ws;
    let settled = false;
    let authenticated = false;
    let chatRequestSent = false;
    let sawCompletion = false;
    let responseText = '';
    let emittedText = '';
    let flushTimer = null;
    let idleTimer = null;
    let heartbeatTimer = null;

    const timeout = setTimeout(() => {
      fail(new Error(`OPENCLAW_TIMEOUT:${normalizedUrl}`));
    }, 70000);

    function armIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (sawCompletion && responseText) {
          finish(responseText);
          return;
        }
        fail(new Error(`OPENCLAW_IDLE_TIMEOUT:${normalizedUrl}`));
      }, OPENCLAW_IDLE_TIMEOUT_MS);
    }

    function touchActivity() {
      armIdleTimer();
    }

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      flushDelta();
      if (ws && ws.readyState === 1) ws.close(1000, 'done');
      resolve(result);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (ws && ws.readyState === 1) ws.close(1011, 'error');
      reject(err);
    }

    function flushDelta() {
      if (!onDelta || !responseText || emittedText === responseText) return;
      const delta = responseText.startsWith(emittedText)
        ? responseText.slice(emittedText.length)
        : responseText;
      emittedText = responseText;
      if (delta) onDelta(delta, responseText);
    }

    function pushText(nextText) {
      if (!nextText) return;
      const previous = responseText;
      const merged = mergeOpenClawStreamText(previous, nextText);
      if (merged === previous) return;
      responseText = merged;
      if (onDelta) {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flushDelta();
        }, OPENCLAW_STREAM_FLUSH_MS);
      }
    }

    const WebSocketCtor = globalThis.WebSocket;
    if (typeof WebSocketCtor !== 'function') {
      clearTimeout(timeout);
      const fallbackWebContents = getOpenClawFallbackWebContents(options.webContents);
      if (!fallbackWebContents) {
        reject(new Error('OPENCLAW_WEBSOCKET_UNAVAILABLE'));
        return;
      }
      callOpenClawViaRenderer(
        fallbackWebContents,
        normalizedUrl,
        authToken,
        messageText,
        sessionKey
      ).then(resolve).catch(reject);
      return;
    }

    try {
      ws = new WebSocketCtor(normalizedUrl);
    } catch {
      clearTimeout(timeout);
      reject(new Error(`OPENCLAW_CONNECT:${normalizedUrl}`));
      return;
    }

    ws.addEventListener('open', () => {
      touchActivity();
      if (!heartbeatTimer && OPENCLAW_HEARTBEAT_INTERVAL_MS > 0) {
        heartbeatTimer = setInterval(() => {
          if (settled || !ws || ws.readyState !== 1) return;
          if (typeof ws.ping === 'function') {
            try {
              ws.ping();
            } catch {
              // Ignore ping failures and rely on normal reconnect flow.
            }
          }
        }, OPENCLAW_HEARTBEAT_INTERVAL_MS);
      }
    });

    ws.addEventListener('message', (event) => {
      touchActivity();
      let data;
      try {
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;
        data = JSON.parse(raw);
      } catch {
        return;
      }

      if (data.type === 'event' && data.event === 'connect.challenge') {
        const connectReq = {
          type: 'req',
          id: nextOpenClawId('connect'),
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: 'gateway-client', version: '1.0.0', platform: 'desktop', mode: 'backend' },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            auth: { token: authToken }
          }
        };
        ws.send(JSON.stringify(connectReq));
        return;
      }

      if (data.type === 'res' && !authenticated && data.ok === false) {
        const errMsg = data.error?.message || data.error?.code || 'Authentication failed';
        fail(new Error(`OPENCLAW_AUTH_FAILED:${errMsg}`));
        return;
      }

      if (data.type === 'res' && !authenticated && (data.payload?.type === 'hello-ok' || data.ok === true)) {
        authenticated = true;
        if (!chatRequestSent) {
          chatRequestSent = true;
          const agentReq = {
            type: 'req',
            id: nextOpenClawId('chat'),
            method: 'chat.send',
            params: {
              sessionKey,
              message: messageText,
              idempotencyKey: nextOpenClawId('idem')
            }
          };
          ws.send(JSON.stringify(agentReq));
        }
        return;
      }

      if (data.type === 'event') {
        const payload = data.payload || {};
        const text = extractOpenClawText(payload);
        if (text) pushText(text);
        if (payload.state === 'error') {
          fail(new Error(`OPENCLAW_ERROR:${payload.errorMessage || 'Chat failed'}`));
          return;
        }
        if (payload.state === 'final' || payload.status === 'completed' || payload.status === 'done' || payload.type === 'done' || payload.done === true) {
          sawCompletion = true;
          finish(responseText || text || '(no response)');
          return;
        }
      }

      if (data.type === 'res' && authenticated && data.ok === true) {
        if (data.payload?.runId) return;
        const text = extractOpenClawText(data.payload);
        if (text) pushText(text);
        const status = data.payload?.status;
        if (status === 'completed' || status === 'done' || data.payload?.done) {
          sawCompletion = true;
          finish(responseText || text || '(no response)');
        }
        return;
      }

      if (data.type === 'res' && authenticated && data.ok === false) {
        const errMsg = data.error?.message || data.error?.code || 'Agent request failed';
        fail(new Error(`OPENCLAW_ERROR:${errMsg}`));
      }
    });

    ws.addEventListener('error', () => {
      fail(new Error(`OPENCLAW_CONNECT:${normalizedUrl}`));
    });

    ws.addEventListener('close', (event) => {
      if (settled) return;
      if (sawCompletion && responseText) {
        finish(responseText);
        return;
      }
      if (responseText) {
        fail(new Error(`OPENCLAW_INCOMPLETE_CLOSE:${event.code}`));
        return;
      }
      if (event.code === 1000 || event.code === 1001) {
        fail(new Error('OPENCLAW_EMPTY_RESPONSE'));
        return;
      }
      fail(new Error(`OPENCLAW_CLOSED:${event.code}`));
    });

    armIdleTimer();
  });
}

async function callOpenClawWithRetry(gatewayUrl, token, messages, options = {}) {
  let lastError;
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await callOpenClaw(gatewayUrl, token, messages, options);
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || '');
      if (attempt === maxAttempts - 1 || !isOpenClawRetryableError(msg)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError || new Error('OPENCLAW_CONNECT:unknown');
}

async function transcribeWithWhisper(audioBuffer, provider, apiKey, lang) {
  if (!apiKey) {
    throw new Error('No STT API key set. Open settings and add your API key.');
  }

  let url;
  let model;
  if (provider === 'openai') {
    url = 'https://api.openai.com/v1/audio/transcriptions';
    model = 'whisper-1';
  } else {
    url = 'https://api.groq.com/openai/v1/audio/transcriptions';
    model = 'whisper-large-v3';
  }

  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('file', blob, 'recording.webm');
  formData.append('model', model);
  if (lang) formData.append('language', lang);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(30000)
    });
  } catch (err) {
    throw new Error('Network error — check your connection and try again.');
  }

  if (response.status === 401) {
    throw new Error('Invalid STT API key. Check your key in settings.');
  }
  if (response.status === 402 || response.status === 429) {
    throw new Error('STT rate limited or quota exceeded. Wait and try again.');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`STT API error (${response.status}): ${text.slice(0, 160) || 'Unknown error'}`);
  }

  const data = await response.json();
  return { text: data?.text || '' };
}

app.whenReady().then(() => {
  configureMediaPermissions();
  configureStartupSetting();
  createOverlayWindow();
  createTray();
  checkForUpdates(true);
  if (!updateCheckTimer) {
    updateCheckTimer = setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
  }
  if (!store.get('startMinimized')) {
    createSettingsWindow(); // Auto-open settings on startup
  }

  app.on('activate', () => {
    if (!overlayWindow) createOverlayWindow();
  });
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  closeAllTerminalSessions();
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
});

// IPC Handlers
ipcMain.handle('get-config', () => store.store);

ipcMain.handle('get-screen-info', () => {
  const display = screen.getPrimaryDisplay();
  return { bounds: display.bounds, workArea: display.workArea };
});

ipcMain.handle('get-cursor-screen-point', () => {
  return screen.getCursorScreenPoint();
});

ipcMain.handle('get-characters-dir', () => getCharactersDir());

ipcMain.handle('list-characters', () => {
  try {
    const dir = getCharactersDir();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (error) {
    return [];
  }
});

ipcMain.handle('get-personalities', () => {
  return Object.entries(PERSONALITIES).map(([key, value]) => ({
    key,
    label: value.label
  }));
});

function sanitizeFileName(name = '') {
  return String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

async function downloadReleaseAsset(payload = {}) {
  const { assetUrl, assetName, version } = payload;
  if (!assetUrl) {
    throw new Error('Missing asset URL');
  }
  if (currentDownloadTask) {
    throw new Error('Another download is already in progress');
  }
  const downloadsDir = (app.getPath && app.getPath('downloads')) || os.tmpdir();
  const fileLabel = sanitizeFileName(assetName || path.basename(assetUrl));
  const fileName = `${version ? `mochi-${version}-` : ''}${fileLabel}`.replace(/-+/g, '-');
  const destination = path.join(downloadsDir, fileName);
  try {
    fs.unlinkSync(destination);
  } catch {}

  sendOverlayUpdateEvent('update-download-start', { filePath: destination, version, assetName });

  return new Promise((resolve, reject) => {
    let resolved = false;
    const finalize = (error, filePath) => {
      if (resolved) return;
      resolved = true;
      currentDownloadTask = null;
      if (error) {
        sendOverlayUpdateEvent('update-download-error', { message: error.message || String(error) });
        reject(error);
        return;
      }
      sendOverlayUpdateEvent('update-download-complete', { filePath, version });
      resolve({ filePath });
    };

    const startRequest = (url, redirectCount = 0) => {
      if (redirectCount >= 6) {
        finalize(new Error('Too many redirects'));
        return;
      }
      const request = https.get(url, {
        headers: {
          'User-Agent': 'Mochi Desktop Updater'
        }
      }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request.destroy();
          startRequest(response.headers.location, redirectCount + 1);
          return;
        }
        if (response.statusCode !== 200) {
          finalize(new Error(`Download failed (${response.statusCode})`));
          return;
        }
        const totalBytes = Number(response.headers['content-length'] || 0);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destination);
        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
          sendOverlayUpdateEvent('update-download-progress', {
            downloadedBytes,
            totalBytes,
            percent
          });
        });
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (!IS_WINDOWS) {
                fs.chmodSync(destination, 0o755);
              }
            } catch {}
            lastDownloadedUpdatePath = destination;
            finalize(null, destination);
          });
        });
        fileStream.on('error', (err) => finalize(err));
      });
      request.on('error', (err) => finalize(err));
      currentDownloadTask = { request, filePath: destination };
    };

    startRequest(assetUrl);
  });
}

ipcMain.handle('update-download-asset', async (event, payload) => {
  try {
    const result = await downloadReleaseAsset(payload);
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    return { ok: false, error: error.message || 'DOWNLOAD_FAILED' };
  }
});

ipcMain.handle('update-install', async (event, { filePath }) => {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Missing file path');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error('Downloaded file not found');
  }
  sendOverlayUpdateEvent('update-install-start', { filePath });
  try {
    if (!IS_WINDOWS) {
      fs.chmodSync(filePath, 0o755);
    }
  } catch {}
  try {
    const opened = await shell.openPath(filePath);
    if (opened) {
      console.warn('Update installer opened with message:', opened);
    }
  } catch (err) {
    console.error('Failed to launch update file:', err);
  }
  setTimeout(() => app.quit(), 800);
  return { ok: true };
});

ipcMain.handle('get-conversation', (event, mochiId) => {
  return historyStore.get(`history.${mochiId}`, []);
});

ipcMain.on('save-conversation', (event, mochiId, messages) => {
  historyStore.set(`history.${mochiId}`, messages);
});

ipcMain.on('clear-conversation', (event, mochiId) => {
  historyStore.delete(`history.${mochiId}`);
});

ipcMain.on('update-config', (event, nextConfig) => {
  if (!nextConfig || typeof nextConfig !== 'object') return;

  const allowedKeys = [
    'enabled',
    'showMochis',
    'mochiCount',
    'popupTheme',
    'uiTextScale',
    'mochiLanguage',
    'openrouterApiKey',
    'openrouterModel',
    'openrouterModelResolved',
    'aiMode',
    'ollamaUrl',
    'ollamaModel',
    'openclawUrl',
    'openclawToken',
    'openclawGatewayUrl',
    'openclawGatewayToken',
    'openclawAgentName',
    'terminalDistro',
    'terminalCwd',
    'terminalNotifyOnFinish',
    'startAtLogin',
    'startMinimized'
  ];

  for (const key of allowedKeys) {
    if (key in nextConfig) {
      if (key === 'openclawAgentName') {
        store.set(key, normalizeOpenClawAgentName(nextConfig[key], defaultOpenClawAgentName(0)));
      } else if (key === 'terminalDistro') {
        store.set(key, normalizeTerminalDistro(nextConfig[key]));
      } else if (key === 'terminalCwd') {
        store.set(key, normalizeTerminalCwd(nextConfig[key]));
      } else if (key === 'terminalNotifyOnFinish') {
        store.set(key, normalizeTerminalNotifyOnFinish(nextConfig[key], true));
      } else {
        store.set(key, nextConfig[key]);
      }
    }
  }

  if (Array.isArray(nextConfig.mochis)) {
    const previousIds = new Set(getStoredMochis().map((item) => item.id));
    const normalized = normalizeMochiList(nextConfig.mochis);
    store.set('mochis', normalized);
    store.set('mochiCount', normalized.length);
    const nextIds = new Set(normalized.map((item) => item.id));
    for (const existingId of previousIds) {
      if (!nextIds.has(existingId)) {
        closeTerminalSession(existingId, 'TERMINAL_SESSION_REMOVED');
      }
    }
  }

  const mochiPattern = /^mochi(\d+)_/;
  for (const [key, value] of Object.entries(nextConfig)) {
    const match = key.match(mochiPattern);
    if (match) {
      const index = parseInt(match[1], 10);
      const prop = key.substring(match[0].length);
      const mochis = normalizeMochiList(store.get('mochis'));
      if (mochis[index - 1]) {
        if (prop === 'openclawAgentName') {
          mochis[index - 1][prop] = normalizeOpenClawAgentName(value, defaultOpenClawAgentName(index - 1));
        } else if (prop === 'terminalDistro') {
          mochis[index - 1][prop] = normalizeTerminalDistro(value);
        } else if (prop === 'terminalCwd') {
          mochis[index - 1][prop] = normalizeTerminalCwd(value);
        } else if (prop === 'terminalNotifyOnFinish') {
          mochis[index - 1][prop] = normalizeTerminalNotifyOnFinish(value, true);
        } else {
          mochis[index - 1][prop] = value;
        }
        if (prop === 'openrouterModel') {
          mochis[index - 1].openrouterModelResolved = value === 'random' ? '' : value;
        }
        store.set('mochis', mochis);
        store.set('mochiCount', mochis.length);
      }
    }
  }

  if ('startAtLogin' in nextConfig) {
    configureStartupSetting();
  }

  sendConfigUpdate();
  updateTrayMenu();
});

// AI streaming handler
ipcMain.handle('ai-chat-stream', async (event, { mochiId, messages, personality }) => {
  const safeMessages = Array.isArray(messages) ? messages : [];

  try {
    const settings = getAiSettingsFor(mochiId, personality);
    if (settings.chatMode === 'off') {
      return { ok: false, error: 'AI mode is off for this mochi.' };
    }
    if (settings.chatMode === 'terminal') {
      return { ok: false, error: 'TERMINAL_MODE_ACTIVE' };
    }
    const fullMessages = [
      { role: 'system', content: settings.systemPrompt },
      ...safeMessages
    ];

    // For Ollama, transform multimodal content arrays into Ollama's images format
    const provider = settings.provider || 'openrouter';
    const ollamaMessages = provider === 'ollama' ? fullMessages.map(msg => {
      if (!Array.isArray(msg.content)) return msg;
      let text = '';
      const images = [];
      for (const part of msg.content) {
        if (part.type === 'text') {
          text += part.text;
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const dataUrl = part.image_url.url;
          const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
          if (base64Match) images.push(base64Match[1]);
        }
      }
      return images.length > 0
        ? { role: msg.role, content: text || ' ', images }
        : { role: msg.role, content: text };
    }) : null;

    let content = '';

    if (settings.chatMode === 'agent') {
      content = await callOpenClawWithRetry(
        settings.openclawGatewayUrl,
        settings.openclawGatewayToken,
        fullMessages,
        {
          mochiId,
          agentName: settings.openclawAgentName,
          webContents: event.sender,
          onDelta: (delta, accumulated) => {
            event.sender.send('ai-stream-delta', { mochiId, delta, accumulated });
          }
        }
      );
    } else {
      const model = provider === 'ollama' ? (settings.ollamaModel || 'gemma3:1b') : settings.model;
      try {
        if (provider === 'ollama') {
          content = await callOllamaStream(model, ollamaMessages || fullMessages, settings.ollamaUrl, (delta, accumulated) => {
            event.sender.send('ai-stream-delta', { mochiId, delta, accumulated });
          });
        } else {
          content = await callOpenRouterStream(model, settings.apiKey, fullMessages, (delta, accumulated) => {
            event.sender.send('ai-stream-delta', { mochiId, delta, accumulated });
          });
        }
      } catch (streamErr) {
        content = await callAiApi(provider, model, settings.apiKey, provider === 'ollama' ? (ollamaMessages || fullMessages) : fullMessages, settings.ollamaUrl);
      }
    }

    if (!content) {
      return { ok: false, error: 'NO_RESPONSE' };
    }
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error?.message || 'Unknown error.' };
  }
});

ipcMain.handle('terminal-exec', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  const command = String(payload?.command || '').trim();
  if (!command) {
    return { ok: false, error: 'Empty command.' };
  }

  try {
    const settings = getAiSettingsFor(mochiId, 'cryptid');
    if (settings.chatMode !== 'terminal') {
      return { ok: false, error: 'TERMINAL_MODE_DISABLED' };
    }
    const result = await executeTerminalCommand(event.sender, mochiId, command, {
      terminalDistro: payload?.terminalDistro || settings.terminalDistro,
      terminalCwd: payload?.terminalCwd !== undefined ? payload.terminalCwd : settings.terminalCwd,
      terminalNotifyOnFinish: payload?.terminalNotifyOnFinish !== undefined
        ? payload.terminalNotifyOnFinish
        : settings.terminalNotifyOnFinish
    });
    return result;
  } catch (error) {
    return { ok: false, error: error?.message || 'TERMINAL_ERROR' };
  }
});

ipcMain.handle('terminal-close-session', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  const closed = closeTerminalSession(mochiId, 'TERMINAL_SESSION_CLOSED_BY_UI');
  return { ok: true, closed };
});

ipcMain.handle('terminal-session-start', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  try {
    const settings = getAiSettingsFor(mochiId, 'cryptid');
    if (settings.chatMode !== 'terminal') {
      return { ok: false, error: 'TERMINAL_MODE_DISABLED' };
    }
    return attachTerminalSession(event.sender, mochiId, {
      terminalDistro: payload?.terminalDistro || settings.terminalDistro,
      terminalCwd: payload?.terminalCwd !== undefined ? payload.terminalCwd : settings.terminalCwd
    });
  } catch (error) {
    return { ok: false, error: error?.message || 'TERMINAL_SESSION_START_ERROR' };
  }
});

ipcMain.handle('terminal-session-write', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  try {
    if (!terminalSessions.get(mochiId)) {
      const settings = getAiSettingsFor(mochiId, 'cryptid');
      if (settings.chatMode !== 'terminal') {
        return { ok: false, error: 'TERMINAL_MODE_DISABLED' };
      }
      attachTerminalSession(event.sender, mochiId, {
        terminalDistro: payload?.terminalDistro || settings.terminalDistro,
        terminalCwd: payload?.terminalCwd !== undefined ? payload.terminalCwd : settings.terminalCwd
      });
    }
    return writeTerminalSessionInput(mochiId, payload?.data || '');
  } catch (error) {
    return { ok: false, error: error?.message || 'TERMINAL_WRITE_ERROR' };
  }
});

ipcMain.handle('terminal-session-run-line', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  try {
    if (!terminalSessions.get(mochiId)) {
      const settings = getAiSettingsFor(mochiId, 'cryptid');
      if (settings.chatMode !== 'terminal') {
        return { ok: false, error: 'TERMINAL_MODE_DISABLED' };
      }
      attachTerminalSession(event.sender, mochiId, {
        terminalDistro: payload?.terminalDistro || settings.terminalDistro,
        terminalCwd: payload?.terminalCwd !== undefined ? payload.terminalCwd : settings.terminalCwd
      });
    }
    return runTerminalSessionLine(mochiId, payload?.line || '');
  } catch (error) {
    return { ok: false, error: error?.message || 'TERMINAL_WRITE_ERROR' };
  }
});

ipcMain.handle('terminal-session-resize', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  try {
    if (!terminalSessions.get(mochiId)) {
      return { ok: false, error: 'TERMINAL_SESSION_NOT_STARTED' };
    }
    return resizeTerminalSession(mochiId, payload?.cols, payload?.rows);
  } catch (error) {
    return { ok: false, error: error?.message || 'TERMINAL_RESIZE_ERROR' };
  }
});

ipcMain.handle('terminal-session-stop', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  const closed = closeTerminalSession(mochiId, 'TERMINAL_SESSION_STOPPED_BY_UI');
  return { ok: true, closed };
});

ipcMain.handle('terminal-autocomplete', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  const fragment = String(payload?.fragment || '');
  if (!fragment) {
    return { ok: true, completion: '', candidates: [] };
  }
  try {
    const settings = getAiSettingsFor(mochiId, 'cryptid');
    if (settings.chatMode !== 'terminal') {
      return { ok: false, error: 'TERMINAL_MODE_DISABLED', completion: fragment, candidates: [] };
    }
    return await getTerminalAutocomplete(mochiId, fragment, {
      terminalDistro: payload?.terminalDistro || settings.terminalDistro,
      terminalCwd: payload?.terminalCwd !== undefined ? payload.terminalCwd : settings.terminalCwd
    });
  } catch (error) {
    return { ok: false, error: error?.message || 'TERMINAL_AUTOCOMPLETE_FAILED', completion: fragment, candidates: [] };
  }
});

ipcMain.handle('test-openrouter', async (event, payload) => {
  const prompt = (payload && payload.prompt) ? String(payload.prompt) : 'Say hello.';
  const mochiId = payload?.mochiId || 'mochi-1';
  try {
    const settings = getAiSettingsFor(mochiId, 'cryptid');
    const content = await callAiApi(
      'openrouter',
      settings.model || 'google/gemini-2.0-flash-001',
      settings.apiKey,
      [{ role: 'user', content: prompt }],
      settings.ollamaUrl
    );
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error?.message || 'Network error.' };
  }
});

ipcMain.handle('test-ollama', async (event, payload) => {
  const prompt = (payload && payload.prompt) ? String(payload.prompt) : 'Say hello.';
  const mochiId = payload?.mochiId || 'mochi-1';
  try {
    const settings = getAiSettingsFor(mochiId, 'cryptid');
    const content = await callAiApi(
      'ollama',
      settings.ollamaModel || 'gemma3:1b',
      '',
      [{ role: 'user', content: prompt }],
      settings.ollamaUrl
    );
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error?.message || 'Network error.' };
  }
});

ipcMain.handle('test-openclaw', async (event, payload = {}) => {
  const prompt = payload?.prompt ? String(payload.prompt) : 'Say hello.';
  const mochiId = payload?.mochiId || 'mochi-1';
  try {
    const settings = getAiSettingsFor(mochiId, 'cryptid');
    const content = await callOpenClawWithRetry(
      settings.openclawGatewayUrl,
      settings.openclawGatewayToken,
      [
        { role: 'system', content: settings.systemPrompt },
        { role: 'user', content: prompt }
      ],
      { mochiId, agentName: settings.openclawAgentName, webContents: event.sender }
    );
    return { ok: true, content };
  } catch (error) {
    return { ok: false, error: error?.message || 'Network error.' };
  }
});

ipcMain.handle('transcribe-audio', async (event, { mochiId, audioData }) => {
  try {
    const config = getMochiConfig(mochiId || 'mochi-1');
    const provider = config.sttProvider || 'groq';
    const apiKey = (config.sttApiKey || '').trim();
    if (!apiKey) {
      return { ok: false, error: 'No STT API key set. Add your key in Settings.' };
    }
    if (!audioData || !(audioData instanceof ArrayBuffer || audioData.byteLength !== undefined)) {
      return { ok: false, error: 'No audio data received.' };
    }
    const storedLang = store.get('mochiLanguage') || 'auto';
    const lang = storedLang === 'es' ? 'es' : 'en';
    const result = await transcribeWithWhisper(audioData, provider, apiKey, lang);
    const transcript = (result?.text || '').trim();
    if (!transcript) {
      return { ok: false, error: 'No speech detected.' };
    }
    return { ok: true, transcript };
  } catch (error) {
    return { ok: false, error: error?.message || 'Transcription failed.' };
  }
});

ipcMain.handle('list-ollama-models', async (event, payload = {}) => {
  const mochiId = payload?.mochiId || 'mochi-1';
  const settings = getAiSettingsFor(mochiId, 'cryptid');
  let resolvedUrl = 'http://127.0.0.1:11434';

  try {
    resolvedUrl = resolveOllamaUrl(payload?.ollamaUrl || settings.ollamaUrl);
    const base = resolvedUrl.replace(/\/$/, '');
    const response = await fetch(`${base}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(`OLLAMA_FORBIDDEN:${resolvedUrl}`);
      }
      throw new Error(`OLLAMA_HTTP_${response.status}:${resolvedUrl}`);
    }

    const data = await response.json();
    const models = Array.isArray(data?.models)
      ? data.models.map((m) => m?.name).filter(Boolean)
      : [];

    return { ok: true, models, url: resolvedUrl };
  } catch (error) {
    const message = error?.message || '';
    if (message.startsWith('OLLAMA_HTTP_ONLY:')) {
      return { ok: false, error: message, models: [], url: resolvedUrl };
    }
    if (message.startsWith('OLLAMA_FORBIDDEN:')) {
      return { ok: false, error: message, models: [], url: resolvedUrl };
    }
    if (message.startsWith('OLLAMA_HTTP_')) {
      return { ok: false, error: message, models: [], url: resolvedUrl };
    }
    return { ok: false, error: `OLLAMA_CONNECT:${resolvedUrl}`, models: [], url: resolvedUrl };
  }
});

ipcMain.handle('tray-get-state', () => {
  return {
    mochis: getTrayMochis()
  };
});

ipcMain.handle('tray-action', (event, payload = {}) => {
  const { action, mochiId, all } = payload || {};
  const channel = action === 'dismiss' ? 'dismiss-mochi' : 'call-back-mochi';
  const data = all ? { all: true } : { mochiId };
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, data);
    return { ok: true };
  }
  return { ok: false, error: 'overlay-unavailable' };
});

ipcMain.handle('open-url-with-browser-choice', async (event, payload = {}) => {
  const targetUrl = parseSafeHttpUrl(payload?.url);
  if (!targetUrl) {
    return { ok: false, error: 'INVALID_URL' };
  }

  const locale = payload?.locale === 'es' ? 'es' : 'en';
  const context = String(payload?.context || 'external-link');
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  const parentWindow = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : null;
  const skipDialog = Boolean(payload?.skipDialog);
  const preferredBrowser = String(payload?.preferredBrowser || '').trim();

  if (skipDialog) {
    const skipChoice = preferredBrowser || getStoredBrowserChoice();
    const skipResult = await launchBrowserChoice(skipChoice, targetUrl, parentWindow);
    if (skipResult.success) {
      return { ok: true, browser: skipResult.browser };
    }
    await shell.openExternal(targetUrl);
    return { ok: true, browser: 'system', fallbackFrom: skipChoice };
  }

  const copy = getBrowserChoiceDialogText(locale, context);

  try {
    const selection = await dialog.showMessageBox(parentWindow || undefined, {
      type: 'question',
      title: copy.title,
      message: copy.message,
      detail: copy.detail,
      buttons: copy.buttons,
      defaultId: 0,
      cancelId: 6,
      noLink: true
    });

    const choice = BROWSER_CHOICES[selection.response] || 'cancel';
    if (choice === 'cancel') {
      return { ok: false, cancelled: true };
    }

    store.set('lastBrowserChoice', choice);
    const launchResult = await launchBrowserChoice(choice, targetUrl, parentWindow);
    if (launchResult.success) {
      return { ok: true, browser: launchResult.browser };
    }

    const isEs = locale === 'es';
    await dialog.showMessageBox(parentWindow || undefined, {
      type: 'warning',
      title: isEs ? 'Navegador no encontrado' : 'Browser not found',
      message: isEs
        ? 'No se encontró ese navegador en este sistema.'
        : 'That browser was not found on this system.',
      detail: isEs
        ? 'Se abrirá el enlace en tu navegador predeterminado.'
        : 'The link will be opened in your default browser.'
    });
    await shell.openExternal(targetUrl);
    return { ok: true, browser: 'system', fallbackFrom: choice };
  } catch (error) {
    return { ok: false, error: error?.message || 'OPEN_URL_FAILED' };
  }
});

ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('create-desktop-shortcut', async () => {
  if (!IS_WINDOWS) {
    return { ok: false, error: 'Desktop shortcuts are only supported on Windows' };
  }
  try {
    const desktopPath = app.getPath('desktop');
    const shortcutPath = path.join(desktopPath, 'Mochi Desktop.lnk');
    const iconPath = path.join(__dirname, 'build', 'icon.ico');
    const success = shell.writeShortcutLink(shortcutPath, {
      target: process.execPath,
      cwd: path.dirname(process.execPath),
      icon: fs.existsSync(iconPath) ? iconPath : process.execPath,
      iconIndex: 0,
      description: 'Mochi Desktop - AI Pet Companions'
    });
    return { ok: success };
  } catch (error) {
    return { ok: false, error: error?.message || 'SHORTCUT_FAILED' };
  }
});

// Handle mouse events toggle for click-through overlay
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});
