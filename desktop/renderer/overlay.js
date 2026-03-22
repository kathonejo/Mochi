// ─── Shared runtime (loaded from mochi-shared.js) ──────────────────────────
const {
  SPRITE_SIZE, TICK_MS, MAX_MOCHIS,
  CALL_BACK_LINE_SPACING, CALL_BACK_LINE_MARGIN, CALL_BACK_RESET_DELAY,
  computeCallBackX, resetCallBackLineCounters, scheduleCallBackLineReset,
  PERSONALITY_TTS, PERSONALITY_SOUND_RATE,
  TTS_VOICE_PROFILES, TTS_PROFILE_MODIFIERS, TTS_PROFILE_POOL,
  MOCHI_PITCH_FACTORS,
  getMochiPitchFactor, pickRandomTtsProfile, pickRandomChatTheme,
  getVoicesAsync, pickVoiceByProfile,
  CHAT_THEMES,
  weightedRandom, clamp, hexToRgb,
  detectBrowserLanguage
} = window.MochiShared;
const UPDATE_PANEL_ID = 'mochi-update-panel';
const UPDATE_STYLE_ID = 'mochi-update-style';
const UPDATE_NOTES_LIMIT = 280;
let updatePanelElement = null;
let updateDownloadBtn = null;
let updateInstallBtn = null;
let updateCloseBtn = null;
let updateProgressFill = null;
let updateStatusLabel = null;
let currentUpdateInfo = null;
let currentDownloadedPath = '';
let updateDownloadInProgress = false;

function ensureUpdateStyles() {
  if (document.getElementById(UPDATE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = UPDATE_STYLE_ID;
  style.textContent = `
    #${UPDATE_PANEL_ID} {
      position: fixed;
      top: 20px;
      right: 20px;
      width: min(360px, calc(100% - 32px));
      background: rgba(6, 6, 12, 0.96);
      border: 1px solid rgba(112, 112, 196, 0.45);
      border-radius: 18px;
      padding: 16px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
      color: #f5f5ff;
      z-index: 9999;
      pointer-events: auto;
      font-family: 'Inter', system-ui, sans-serif;
    }
    #${UPDATE_PANEL_ID} .update-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 0.95rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: #a3d9ff;
    }
    #${UPDATE_PANEL_ID} .update-close-btn {
      background: none;
      border: none;
      color: inherit;
      font-size: 1rem;
      cursor: pointer;
      padding: 0;
    }
    #${UPDATE_PANEL_ID} strong {
      display: block;
      font-size: 1rem;
      margin-bottom: 4px;
    }
    #${UPDATE_PANEL_ID} .update-notes {
      margin: 0;
      font-size: 0.85rem;
      color: #d6d8ec;
      max-height: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${UPDATE_PANEL_ID} .update-meta {
      margin-top: 6px;
      font-size: 0.78rem;
      color: #9fb5ff;
    }
    #${UPDATE_PANEL_ID} .update-actions {
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #${UPDATE_PANEL_ID} button {
      flex: 1;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 0.85rem;
      border: none;
      cursor: pointer;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    #${UPDATE_PANEL_ID} button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #${UPDATE_PANEL_ID} .update-download-btn {
      background: #6a76ff;
      color: #fff;
      font-weight: 600;
    }
    #${UPDATE_PANEL_ID} .update-install-btn {
      background: transparent;
      color: #f5f5ff;
      border: 1px solid rgba(255, 255, 255, 0.35);
      display: none;
    }
    #${UPDATE_PANEL_ID} .update-progress {
      margin-top: 12px;
      height: 6px;
      width: 100%;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
    }
    #${UPDATE_PANEL_ID} .update-progress-fill {
      height: 100%;
      width: 0;
      background: linear-gradient(90deg, #6a76ff, #3cf3ff);
      transition: width 0.2s ease;
    }
    #${UPDATE_PANEL_ID} .update-status {
      margin-top: 8px;
      font-size: 0.78rem;
      color: #b3d8ff;
    }
    #${UPDATE_PANEL_ID} .update-status.update-status-alert {
      color: #ffa6b8;
    }
    #${UPDATE_PANEL_ID} .update-status.update-status-success {
      color: #b1ffcd;
    }
    #${UPDATE_PANEL_ID} a {
      color: #8bd5ff;
      text-decoration: none;
      font-size: 0.8rem;
      display: inline-block;
      margin-top: 4px;
    }
  `;
  document.head.appendChild(style);
}

function formatReleaseNotes(notes = '') {
  const cleaned = (notes || '').trim().replace(/\\r/g, '').split('\\n')[0];
  if (!cleaned) return '';
  if (cleaned.length <= UPDATE_NOTES_LIMIT) return cleaned;
  return `${cleaned.slice(0, UPDATE_NOTES_LIMIT)}…`;
}

function resetUpdatePanel() {
  if (updatePanelElement) {
    updatePanelElement.remove();
    updatePanelElement = null;
  }
  updateDownloadBtn = null;
  updateInstallBtn = null;
  updateCloseBtn = null;
  updateProgressFill = null;
  updateStatusLabel = null;
  currentDownloadedPath = '';
  updateDownloadInProgress = false;
}

function updateStatusText(text = '', tone = 'muted') {
  if (!updateStatusLabel) return;
  updateStatusLabel.textContent = text;
  updateStatusLabel.className = `update-status update-status-${tone}`;
}

function updateProgressBar(percent = 0) {
  if (!updateProgressFill) return;
  updateProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function showUpdatePanel(info) {
  if (!info) return;
  resetUpdatePanel();
  ensureUpdateStyles();
  currentUpdateInfo = info;
  const notes = formatReleaseNotes(info.releaseNotes);
  updatePanelElement = document.createElement('div');
  updatePanelElement.id = UPDATE_PANEL_ID;
  updatePanelElement.innerHTML = `
    <div class="update-header">
      <span>${t('Update available', 'Actualización disponible')}</span>
      <button class="update-close-btn" title="${t('Close', 'Cerrar')}">×</button>
    </div>
    <strong>${info.releaseName || `v${info.version}`}</strong>
    <p class="update-notes">${notes || t('A new release is ready.', 'Una nueva versión está lista.')}</p>
    <div class="update-meta">Version ${info.version} · ${info.assetName || ''}</div>
    <a href="${info.releaseUrl || '#'}" target="_blank" rel="noreferrer">${t('View release on GitHub', 'Ver versión en GitHub')}</a>
    <div class="update-actions">
      <button class="update-download-btn">${t('Download update', 'Descargar actualización')}</button>
      <button class="update-install-btn">${t('Launch update', 'Ejecutar actualización')}</button>
    </div>
    <div class="update-progress">
      <div class="update-progress-fill"></div>
    </div>
    <div class="update-status">${t('Ready to download', 'Listo para descargar')}</div>
  `;
  updateDownloadBtn = updatePanelElement.querySelector('.update-download-btn');
  updateInstallBtn = updatePanelElement.querySelector('.update-install-btn');
  updateCloseBtn = updatePanelElement.querySelector('.update-close-btn');
  updateProgressFill = updatePanelElement.querySelector('.update-progress-fill');
  updateStatusLabel = updatePanelElement.querySelector('.update-status');
  updateInstallBtn.style.display = 'none';
  updateDownloadBtn.addEventListener('click', () => handleDownloadButton());
  updateInstallBtn.addEventListener('click', () => handleInstallButton());
  updateCloseBtn.addEventListener('click', () => {
    resetUpdatePanel();
  });
  document.body.appendChild(updatePanelElement);
}

function handleDownloadButton() {
  if (!currentUpdateInfo || updateDownloadInProgress) return;
  updateDownloadInProgress = true;
  updateDownloadBtn.disabled = true;
  updateStatusText(t('Downloading update…', 'Descargando actualización…'));
  updateProgressBar(0);
  window.mochiApi.downloadUpdateAsset({
    assetUrl: currentUpdateInfo.assetUrl,
    assetName: currentUpdateInfo.assetName,
    version: currentUpdateInfo.version
  }).catch(() => {
    updateStatusText(t('Download failed. Try again.', 'Descarga fallida. Intentá de nuevo.'), 'alert');
    updateDownloadBtn.disabled = false;
    updateDownloadInProgress = false;
  });
}

function handleInstallButton() {
  if (!currentDownloadedPath) return;
  updateInstallBtn.disabled = true;
  updateStatusText(t('Launching update…', 'Iniciando actualización…'));
  window.mochiApi.installDownloadedUpdate({ filePath: currentDownloadedPath }).catch(() => {
    updateStatusText(t('Failed to launch update.', 'No se pudo iniciar la actualización.'), 'alert');
    updateInstallBtn.disabled = false;
  });
}

function handleUpdateAvailable(info) {
  showUpdatePanel(info);
}

function handleDownloadStart(payload) {
  if (!updatePanelElement) return;
  updateProgressBar(0);
  updateStatusText(t('Preparing download…', 'Preparando descarga…'));
}

function handleDownloadProgress(payload) {
  if (!updatePanelElement || !payload) return;
  const percent = Number.isFinite(payload.percent) ? payload.percent : 0;
  updateProgressBar(percent);
  updateStatusText(t('Downloading update…', 'Descargando actualización…') + ` ${percent}%`);
}

function handleDownloadComplete(payload) {
  if (!updatePanelElement || !payload) return;
  updateDownloadInProgress = false;
  updateStatusText(t('Download ready. You can install the update.', 'Descarga lista. Podés instalar la actualización.'), 'success');
  if (updateInstallBtn) {
    updateInstallBtn.style.display = 'inline-flex';
    updateInstallBtn.disabled = false;
  }
  currentDownloadedPath = payload.filePath;
}

function handleDownloadError(payload) {
  if (!updatePanelElement) return;
  updateDownloadInProgress = false;
  updateDownloadBtn.disabled = false;
  updateStatusText(payload?.message || t('Download failed.', 'La descarga falló.'), 'alert');
}

function handleInstallStart(payload) {
  if (!updatePanelElement) return;
  updateStatusText(t('Update launched. Quitting now…', 'Actualización iniciada. Cerrando…'), 'success');
}

function setupUpdateListeners() {
  if (!window.mochiApi) return;
  if (typeof window.mochiApi.onUpdateAvailable === 'function') {
    window.mochiApi.onUpdateAvailable(handleUpdateAvailable);
  }
  if (typeof window.mochiApi.onUpdateDownloadStart === 'function') {
    window.mochiApi.onUpdateDownloadStart(handleDownloadStart);
  }
  if (typeof window.mochiApi.onUpdateDownloadProgress === 'function') {
    window.mochiApi.onUpdateDownloadProgress(handleDownloadProgress);
  }
  if (typeof window.mochiApi.onUpdateDownloadComplete === 'function') {
    window.mochiApi.onUpdateDownloadComplete(handleDownloadComplete);
  }
  if (typeof window.mochiApi.onUpdateDownloadError === 'function') {
    window.mochiApi.onUpdateDownloadError(handleDownloadError);
  }
  if (typeof window.mochiApi.onUpdateInstallStart === 'function') {
    window.mochiApi.onUpdateInstallStart(handleInstallStart);
  }
}

// Work area bottom in screen coords (set from main process via IPC).
// When the taskbar/panel sits at the bottom of the screen the overlay window
// covers the full display.bounds height, but the panel is drawn on top of it.
// Using workArea keeps mochis walking ON the panel surface instead of behind it.
let screenWorkAreaBottom = null;
const DRAG_THRESHOLD_PX = 4;
const CHAT_EDGE_MARGIN_PX = 8;
const CHAT_VERTICAL_GAP_PX = 10;
const CHAT_RESIZE_HIT_PX = 8;
const MAC_GROUND_OFFSET_PX = 14;

const SPRITE_SCALES = {
  small: 0.75,
  medium: 1,
  big: 1.5
};

const ANIMATION_FRAMES = {
  idle: ['stand-neutral.png'],
  walking: ['walk-step-left.png', 'stand-neutral.png', 'walk-step-right.png', 'stand-neutral.png'],
  running: ['walk-step-left.png', 'stand-neutral.png', 'walk-step-right.png', 'stand-neutral.png'],
  jumping: ['jump.png'],
  falling: ['fall.png'],
  landing: ['bounce-squish.png', 'bounce-recover.png'],
  dragging: ['dragged-tilt-right-light.png'],
  draggingHeavy: ['dragged-tilt-right-heavy.png'],
  resisting: ['resist-frame-1.png', 'resist-frame-2.png'],
  sitting: ['sit.png'],
  sittingLookUp: ['sit-look-up.png'],
  sittingEdge: ['sit-edge-legs-down.png'],
  danglingLegs: ['sit-edge-dangle-frame-1.png', 'sit-edge-dangle-frame-2.png'],
  crawling: ['crawl-crouch.png'],
  lyingDown: ['sprawl-lying.png'],
  grabbingWall: ['grab-wall.png'],
  climbingWall: ['climb-wall-frame-1.png', 'climb-wall-frame-2.png'],
  grabbingCeiling: ['grab-ceiling.png'],
  climbingCeiling: ['climb-ceiling-frame-1.png', 'climb-ceiling-frame-2.png'],
  headSpin: ['spin-head-frame-1.png', 'spin-head-frame-2.png', 'spin-head-frame-3.png', 'spin-head-frame-4.png', 'spin-head-frame-5.png', 'spin-head-frame-6.png'],
  sittingPc: ['sit-pc-edge-legs-down.png'],
  sittingPcDangle: ['sit-pc-edge-dangle-frame-1.png', 'sit-pc-edge-dangle-frame-2.png'],
  walkingOff: ['walk-step-left.png', 'stand-neutral.png', 'walk-step-right.png', 'stand-neutral.png'],
  walkingOn: ['walk-step-left.png', 'stand-neutral.png', 'walk-step-right.png', 'stand-neutral.png']
};

const MOCHI_STATES = {
  IDLE: 'idle',
  WALKING: 'walking',
  RUNNING: 'running',
  JUMPING: 'jumping',
  FALLING: 'falling',
  LANDING: 'landing',
  DRAGGING: 'dragging',
  DRAGGING_HEAVY: 'draggingHeavy',
  RESISTING: 'resisting',
  SITTING: 'sitting',
  SITTING_LOOK_UP: 'sittingLookUp',
  SITTING_EDGE: 'sittingEdge',
  DANGLING_LEGS: 'danglingLegs',
  CRAWLING: 'crawling',
  LYING_DOWN: 'lyingDown',
  GRABBING_WALL: 'grabbingWall',
  CLIMBING_WALL: 'climbingWall',
  GRABBING_CEILING: 'grabbingCeiling',
  CLIMBING_CEILING: 'climbingCeiling',
  HEAD_SPIN: 'headSpin',
  SITTING_PC: 'sittingPc',
  SITTING_PC_DANGLE: 'sittingPcDangle',
  WALKING_OFF: 'walkingOff',
  WALKING_ON: 'walkingOn'
};

const PHYSICS = {
  gravity: 0.5,
  fallTerminalVelocity: 12,
  walkSpeed: 1.2,
  runSpeed: 3.0,
  crawlSpeed: 0.4,
  climbSpeed: -1.5,
  jumpForce: -12
};

const CHAT_THEME_PRESETS = CHAT_THEMES;
const FONT_SIZE_MAP = { small: '11px', medium: '13px', large: '15px' };
const CHAT_WIDTH_MAP = { small: 220, medium: 280, large: 360 };
const DEFAULT_CHAT_HEIGHT = 340;
const TERMINAL_CHAT_WIDTH_MULTIPLIER = 1.5;
const TERMINAL_CHAT_HEIGHT_MULTIPLIER = 2;
const CHAT_MIN_WIDTH = 180;
const CHAT_MIN_HEIGHT = 150;
const CHAT_MAX_WIDTH = 9999;
const CHAT_MAX_HEIGHT = 560;

const SOUND_ASSET_PATHS = {
  success: 'assets/mochi-success.wav',
  error: 'assets/mochi-error.wav'
};

const TERMINAL_ATTENTION_PATTERNS = [
  /press\s+enter\s+to\s+continue/i,
  /would\s+you\s+like\s+to/i,
  /\b(y\/n|yes\/no)\b/i,
  /\bconfirm\b/i,
  /\bcontinue\?/i,
  /\bselect\s+an\s+option\b/i,
  /\bwaiting\s+for\s+input\b/i,
  /\bwhat\s+would\s+you\s+like\b/i,
  /\bapprove\b/i
];

function stripTerminalControlText(raw) {
  return String(raw || '')
    .replace(/\u001b\[[0-9;?=><!]*[A-Za-z]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

let sharedAudioCtx = null;
const sharedSoundBuffers = { success: null, error: null };
let sharedSoundBuffersLoaded = false;
let sharedSoundBuffersLoading = null;

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getSpeechRecognitionLang() {
  return isSpanishLocale() ? 'es-ES' : 'en-US';
}

function getSharedAudioContext() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContextCtor();
  }
  return sharedAudioCtx;
}

async function loadAudioBufferFromUrl(url) {
  if (!url) return null;
  const ctx = getSharedAudioContext();
  if (!ctx) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}

function getSoundAssetUrl(kind) {
  const filePath = SOUND_ASSET_PATHS[kind];
  if (!filePath) return '';
  try {
    return new URL(filePath, window.location.href).toString();
  } catch {
    return '';
  }
}

async function ensureSharedSoundBuffersLoaded() {
  if (sharedSoundBuffersLoaded) return;
  if (sharedSoundBuffersLoading) {
    await sharedSoundBuffersLoading;
    return;
  }
  sharedSoundBuffersLoading = (async () => {
    for (const kind of ['success', 'error']) {
      if (sharedSoundBuffers[kind]) continue;
      const url = getSoundAssetUrl(kind);
      sharedSoundBuffers[kind] = await loadAudioBufferFromUrl(url);
    }
    sharedSoundBuffersLoaded = true;
    sharedSoundBuffersLoading = null;
  })();
  await sharedSoundBuffersLoading;
}

const CHARACTERS = [
  { id: 'mochi', label: 'Mochi' },
  { id: 'bunny', label: 'Bunny' },
  { id: 'kitten', label: 'Kitten' },
  { id: 'egg', label: 'Egg' },
  { id: 'ghost', label: 'Ghost' },
  { id: 'blob', label: 'Blob' },
  { id: 'lobster', label: 'Lobster' },
  { id: 'mushroom', label: 'Mushroom' },
  { id: 'penguin', label: 'Penguin' }
];

let mochis = [];
let globalConfig = {};
let uiLanguage = null;
let activeMicMochiId = null;
const UI_TEXT_SCALE_OPTIONS = [0.85, 1, 1.15, 1.3, 1.45];

function syncUiLanguageFromConfig(config = globalConfig) {
  const fromConfig = config && (config.mochiLanguage === 'es' || config.mochiLanguage === 'en')
    ? config.mochiLanguage
    : null;
  uiLanguage = fromConfig || detectBrowserLanguage();
}

function getUiLanguage() {
  if (uiLanguage === 'es' || uiLanguage === 'en') return uiLanguage;
  syncUiLanguageFromConfig(globalConfig);
  return uiLanguage;
}

function isSpanishLocale() {
  return getUiLanguage() === 'es';
}

function t(en, es) {
  return isSpanishLocale() ? es : en;
}

function normalizeUiTextScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  let nearest = UI_TEXT_SCALE_OPTIONS[0];
  let minDelta = Math.abs(numeric - nearest);
  UI_TEXT_SCALE_OPTIONS.forEach((option) => {
    const delta = Math.abs(numeric - option);
    if (delta < minDelta) {
      nearest = option;
      minDelta = delta;
    }
  });
  return nearest;
}

function getGlobalUiTextScale() {
  return normalizeUiTextScale(globalConfig?.uiTextScale);
}

function getUiTextScaleShortcutAction(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 'increase';
  if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') return 'decrease';
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') return 'reset';
  return null;
}

function stepUiTextScale(current, action) {
  const normalized = normalizeUiTextScale(current);
  const index = Math.max(0, UI_TEXT_SCALE_OPTIONS.indexOf(normalized));
  if (action === 'reset') return 1;
  if (action === 'increase') return UI_TEXT_SCALE_OPTIONS[Math.min(UI_TEXT_SCALE_OPTIONS.length - 1, index + 1)];
  if (action === 'decrease') return UI_TEXT_SCALE_OPTIONS[Math.max(0, index - 1)];
  return normalized;
}

const IS_WINDOWS_PLATFORM = /win/i.test(`${navigator.platform || navigator.userAgent || ''}`);
const IS_MAC_PLATFORM = /mac/i.test(`${navigator.platform || navigator.userAgent || ''}`);
const IS_LINUX_PLATFORM = /linux/i.test(`${navigator.platform || navigator.userAgent || ''}`);
const DEFAULT_TERMINAL_PROFILE = IS_WINDOWS_PLATFORM ? 'Ubuntu' : '';
const CURSOR_POLL_INTERVAL_MS = 120;

function normalizeTerminalProfile(rawValue) {
  const normalized = `${rawValue || ''}`.trim();
  if (IS_WINDOWS_PLATFORM) return normalized || DEFAULT_TERMINAL_PROFILE;
  if (!normalized) return '';
  if (/^ubuntu$/i.test(normalized) || /^wsl$/i.test(normalized)) return '';
  return normalized;
}

class Mochi {
  constructor(id, config = {}) {
    this.id = id;
    const randomTheme = pickRandomChatTheme();
    this.config = {
      character: config.character || 'mochi',
      size: config.size || 'medium',
      enabled: config.enabled !== false,
      personality: config.personality || 'cryptid',
      chatTheme: config.chatTheme || randomTheme.id,
      chatThemeColor: config.chatThemeColor || randomTheme.theme,
      chatBgColor: config.chatBgColor || randomTheme.bg,
      chatBubbleStyle: config.chatBubbleStyle || randomTheme.bubble || 'glass',
      chatThemePreset: config.chatThemePreset || randomTheme.id,
      chatFontSize: config.chatFontSize || 'medium',
      chatWidth: config.chatWidth || 'medium',
      chatWidthPx: typeof config.chatWidthPx === 'number' ? config.chatWidthPx : null,
      chatHeightPx: typeof config.chatHeightPx === 'number' ? config.chatHeightPx : null,
      ttsEnabled: config.ttsEnabled === true,
      ttsVoiceProfile: config.ttsVoiceProfile || pickRandomTtsProfile(),
      ttsVoiceId: config.ttsVoiceId || '',
      openMicEnabled: config.openMicEnabled === true,
      relayEnabled: config.relayEnabled === true,
      soundEnabled: config.soundEnabled !== false,
      soundVolume: typeof config.soundVolume === 'number' ? config.soundVolume : 0.7,
      terminalDistro: normalizeTerminalProfile(config.terminalDistro),
      terminalCwd: config.terminalCwd || '',
      terminalNotifyOnFinish: config.terminalNotifyOnFinish !== false,
      ...config
    };
    this.config.terminalDistro = normalizeTerminalProfile(this.config.terminalDistro);

    this.state = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      direction: 1,
      currentState: MOCHI_STATES.FALLING,
      onGround: false,
      onWall: false,
      onCeiling: false,
      animFrame: 0,
      animTimer: 0,
      jumpCooldown: 0,
      wanderTarget: 0,
      wanderUntil: 0,
      behaviorTimer: 0,
      behaviorDuration: 0,
      lastMouseMove: 0,
      dragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      lastDragX: 0,
      lastDragY: 0,
      lastDragTime: 0,
      dragMoved: false,
      dragSpeed: 0,
      pointerDown: false,
      pressStartX: 0,
      pressStartY: 0,
      chatPoseUntil: 0,
      suppressClickUntil: 0,
      offScreen: false,
      offScreenEdge: 0,
      climbSide: 0
    };
    this.contextMenuOpen = false;
    this.contextMenuElement = null;
    this.boundContextMenuCloseListener = null;

    this.offScreenSince = 0;
    this.chatOpen = false;
    this.messages = [];
    this.unreadNotificationCount = 0;
    this.pendingAssistantIndex = null;
    this.pendingStreamText = '';
    this.pendingStreamHadDelta = false;
    this.markdownCopyTextMap = new WeakMap();
    this.elements = {};
    this.chatClickTimeout = null;
    this.recognition = null;
    this.mediaRecorder = null;
    this.mediaRecorderChunks = [];
    this.isListening = false;
    this.isTranscribing = false;
    this.micDraftText = '';
    this.micAutoSendTimer = null;
    this.micAutoSendInterval = null;
    this.micAutoSendSeconds = 0;
    this.micSessionAutoRestart = false;
    this.micSessionContinuous = false;
    this.micRestartTimer = null;
    this.micPermissionStream = null;
    this.micPermissionRequest = null;
    this.silenceDetectionInterval = null;
    this.lastSpeechTime = 0;
    this.micNetworkErrorCount = 0;
    this.micNetworkWarningShown = false;
    this.ttsQueue = [];
    this.ttsSpeaking = false;
    this.relayGuard = false;
    this.resizeState = null;
    this.lastAssistantText = '';
    this.terminalCommandHistory = [];
    this.terminalHistoryCursor = null;
    this.terminalHistoryDraft = '';
    this.terminalAutocompleteToken = 0;
    this.terminalAutocompleteState = null;
    this.terminalView = null;
    this.terminalSessionReady = false;
    this.terminalSessionStarting = null;
    this.terminalStatusError = false;
    this.terminalLastStatus = '';
    this.terminalLastClosedNotice = 0;
    this.terminalFitTimer = null;
    this.terminalLastSize = { cols: 0, rows: 0 };
    this.terminalIdleNotifyTimer = null;
    this.terminalOutputActive = false;
    this.terminalLastAttentionAt = 0;
    this.terminalLastPromptAttentionAt = 0;
    this.closedChatNoticeUntil = 0;
    this.closedChatNoticeTimer = null;
    this._notificationBubbleTimer = null;
    this.boundRelayHandler = (event) => this.onRelayEvent(event);
    this.boundStopMicHandler = (event) => this.onStopMicEvent(event);

    this.init();
  }

  init() {
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const size = SPRITE_SIZE * scale;

    this.state.x = Math.random() * (window.innerWidth - size);
    this.state.y = -size;
    this.state.wanderTarget = this.state.x;

    this.createElements();
    this.loadConversation();
    this.setupEventListeners();

    console.log(`Mochi ${this.id} created with character "${this.config.character}" at (${this.state.x.toFixed(0)}, ${this.state.y.toFixed(0)})`);
  }

  async loadConversation() {
    if (!window.mochiApi?.getConversation) return;
    try {
      const history = await window.mochiApi.getConversation(this.id);
      if (Array.isArray(history)) {
        this.messages = history.filter((item) => item && typeof item === 'object');
        this.renderMessages();
      }
    } catch {}
  }

  saveConversation() {
    if (!window.mochiApi?.saveConversation) return;
    window.mochiApi.saveConversation(this.id, this.messages.slice(-80));
  }

  getCharacterPath() {
    const char = this.config.character || 'mochi';
    return `characters/${char}/`;
  }

  createElements() {
    let container = document.getElementById('mochi-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mochi-container';
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
      `;
      document.body.appendChild(container);
    }

    const scale = SPRITE_SCALES[this.config.size] || 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'mochi-wrapper';
    const isEnabled = this.config.enabled !== false;
    wrapper.style.cssText = `
      position: absolute;
      left: ${this.state.x}px;
      top: ${this.state.y}px;
      pointer-events: auto;
      cursor: pointer !important;
      z-index: 1000;
      display: ${isEnabled ? 'flex' : 'none'};
      align-items: flex-end;
    `;

    const sprite = document.createElement('img');
    sprite.className = 'mochi-sprite';
    sprite.alt = this.id;
    sprite.style.cssText = `
      width: ${SPRITE_SIZE * scale}px;
      height: ${SPRITE_SIZE * scale}px;
      image-rendering: pixelated;
      transform-origin: bottom center;
      display: block;
    `;

    const charPath = this.getCharacterPath();
    sprite.src = charPath + 'stand-neutral.png';

    const overheadTyping = document.createElement('div');
    overheadTyping.className = 'mochi-overhead-typing';
    overheadTyping.appendChild(this.createTypingDotsElement());

    const notificationBadge = document.createElement('div');
    notificationBadge.className = 'mochi-notification-badge';
    notificationBadge.textContent = '1';

    const notificationBubble = document.createElement('div');
    notificationBubble.className = 'mochi-notification-bubble';

    wrapper.appendChild(overheadTyping);
    wrapper.appendChild(notificationBadge);
    wrapper.appendChild(notificationBubble);
    wrapper.appendChild(sprite);
    container.appendChild(wrapper);

    this.elements = { wrapper, sprite, container, overheadTyping, notificationBadge, notificationBubble };
    this.createChatBubble();
  }

  createChatBubble() {
    const chat = document.createElement('div');
    chat.className = 'mochi-chat-bubble chat-style-glass';
    chat.style.position = 'absolute';

    const header = document.createElement('div');
    header.className = 'mochi-chat-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'mochi-chat-title-wrap';
    const chatName = document.createElement('span');
    chatName.className = 'mochi-chat-name';
    chatName.textContent = 'Mochi';
    const chatMeta = document.createElement('span');
    chatMeta.className = 'mochi-chat-meta';
    chatMeta.textContent = 'OpenRouter';
    titleWrap.appendChild(chatName);
    titleWrap.appendChild(chatMeta);

    const headerButtons = document.createElement('div');
    headerButtons.className = 'mochi-chat-header-btns';

    const ttsBtn = document.createElement('button');
    ttsBtn.type = 'button';
    ttsBtn.className = 'mochi-chat-voice-quick';
    ttsBtn.textContent = '🔇';
    ttsBtn.title = t('Enable voice', 'Activar voz');

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'mochi-chat-settings-toggle';
    settingsBtn.textContent = '⚙️';
    settingsBtn.title = t('Controls', 'Controles');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mochi-chat-close';
    closeBtn.textContent = '×';
    closeBtn.title = t('Close', 'Cerrar');

    headerButtons.appendChild(ttsBtn);
    headerButtons.appendChild(settingsBtn);
    headerButtons.appendChild(closeBtn);
    header.appendChild(titleWrap);
    header.appendChild(headerButtons);

    const controlsPanel = document.createElement('div');
    controlsPanel.className = 'mochi-chat-controls-panel';

    const makeControlRow = (label, control) => {
      const row = document.createElement('div');
      row.className = 'mochi-chat-control-row';
      const rowLabel = document.createElement('span');
      rowLabel.className = 'mochi-chat-control-label';
      rowLabel.textContent = label;
      row.appendChild(rowLabel);
      row.appendChild(control);
      return { row, rowLabel };
    };

    const openMicToggleBtn = document.createElement('button');
    openMicToggleBtn.type = 'button';
    openMicToggleBtn.className = 'mochi-chat-openmic-toggle';
    openMicToggleBtn.textContent = '🎙️';
    openMicToggleBtn.title = t('Enable open mic', 'Activar micrófono abierto');
    const openMicRowParts = makeControlRow(t('Open mic', 'Micrófono abierto'), openMicToggleBtn);
    const openMicRow = openMicRowParts.row;
    const openMicLabel = openMicRowParts.rowLabel;
    openMicRow.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('button')) return;
      openMicToggleBtn.click();
    });
    controlsPanel.appendChild(openMicRow);

    const relayToggleBtn = document.createElement('button');
    relayToggleBtn.type = 'button';
    relayToggleBtn.className = 'mochi-chat-relay-toggle';
    relayToggleBtn.textContent = '🔁';
    relayToggleBtn.title = t('Talk to other mochis: off', 'Hablar con otros mochis: apagado');
    const relayRowParts = makeControlRow(t('Talk to other mochis', 'Hablar con otros mochis'), relayToggleBtn);
    const relayRow = relayRowParts.row;
    const relayLabel = relayRowParts.rowLabel;
    relayRow.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('button')) return;
      relayToggleBtn.click();
    });
    controlsPanel.appendChild(relayRow);

    const themeToggleBtn = document.createElement('button');
    themeToggleBtn.type = 'button';
    themeToggleBtn.className = 'mochi-chat-theme-toggle';
    themeToggleBtn.textContent = '🎨';
    themeToggleBtn.title = t('Chat theme', 'Tema de chat');
    const themeRowParts = makeControlRow(t('Theme', 'Tema'), themeToggleBtn);
    const themeRow = themeRowParts.row;
    const themeLabel = themeRowParts.rowLabel;
    themeRow.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('button')) return;
      themeToggleBtn.click();
    });
    controlsPanel.appendChild(themeRow);

    const fontSizeSelect = document.createElement('select');
    fontSizeSelect.className = 'mochi-chat-font-select';
    [
      { value: 'small', label: t('Small', 'Pequeño') },
      { value: 'medium', label: t('Medium', 'Medio') },
      { value: 'large', label: t('Large', 'Grande') }
    ].forEach((option) => {
      const optionEl = document.createElement('option');
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      fontSizeSelect.appendChild(optionEl);
    });
    const fontRowParts = makeControlRow(t('Text size', 'Tamaño de texto'), fontSizeSelect);
    const fontRow = fontRowParts.row;
    const fontLabel = fontRowParts.rowLabel;
    fontRow.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('select')) return;
      fontSizeSelect.focus();
    });
    controlsPanel.appendChild(fontRow);

    const uiTextScaleSelect = document.createElement('select');
    uiTextScaleSelect.className = 'mochi-chat-font-select';
    UI_TEXT_SCALE_OPTIONS.forEach((value) => {
      const optionEl = document.createElement('option');
      optionEl.value = String(value);
      optionEl.textContent = `${Math.round(value * 100)}%`;
      uiTextScaleSelect.appendChild(optionEl);
    });
    const uiTextScaleRowParts = makeControlRow(t('UI text', 'Texto UI'), uiTextScaleSelect);
    const uiTextScaleRow = uiTextScaleRowParts.row;
    const uiTextScaleLabel = uiTextScaleRowParts.rowLabel;
    uiTextScaleRow.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('select')) return;
      uiTextScaleSelect.focus();
    });
    controlsPanel.appendChild(uiTextScaleRow);

    const themePanel = document.createElement('div');
    themePanel.className = 'mochi-chat-theme-panel';

    const themeHeader = document.createElement('div');
    themeHeader.className = 'mochi-chat-theme-header';
    const themeHeaderLabel = document.createElement('span');
    themeHeaderLabel.className = 'mochi-chat-theme-header-label';
    themeHeaderLabel.textContent = t('Chat theme', 'Tema de chat');
    const themeCloseBtn = document.createElement('button');
    themeCloseBtn.type = 'button';
    themeCloseBtn.className = 'mochi-chat-theme-close';
    themeCloseBtn.textContent = '×';
    themeHeader.appendChild(themeHeaderLabel);
    themeHeader.appendChild(themeCloseBtn);
    themePanel.appendChild(themeHeader);

    const presetSection = document.createElement('div');
    presetSection.className = 'mochi-chat-theme-section';
    const presetLabel = document.createElement('span');
    presetLabel.className = 'mochi-chat-theme-label';
    presetLabel.textContent = t('Themes', 'Temas');
    const presetRow = document.createElement('div');
    presetRow.className = 'mochi-theme-presets';
    presetSection.appendChild(presetLabel);
    presetSection.appendChild(presetRow);
    themePanel.appendChild(presetSection);

    const themeButtons = new Map();
    const themeButtonMeta = new Map();
    const createThemeChip = (id, labelEn, labelEs, colors = null) => {
      const label = isSpanishLocale() ? (labelEs || labelEn) : (labelEn || labelEs);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mochi-theme-circle';
      btn.dataset.themeId = id;
      btn.title = label;
      btn.setAttribute('aria-label', label);

      const outer = document.createElement('span');
      outer.className = 'mochi-theme-circle-outer';
      const inner = document.createElement('span');
      inner.className = 'mochi-theme-circle-inner';
      if (colors && colors.theme && colors.bg) {
        outer.style.background = colors.bg;
        inner.style.background = colors.theme;
      } else {
        outer.classList.add('custom');
        inner.classList.add('custom');
      }
      if (id === 'custom') {
        inner.textContent = '🎨';
        inner.classList.add('emoji');
      }
      if (id === 'random') {
        inner.textContent = '🎲';
        inner.classList.add('emoji');
      }
      outer.appendChild(inner);
      btn.appendChild(outer);
      presetRow.appendChild(btn);
      themeButtons.set(id, btn);
      themeButtonMeta.set(id, { labelEn: labelEn || labelEs || id, labelEs: labelEs || labelEn || id });
      return btn;
    };

    createThemeChip('custom', '🎨 Custom', '🎨 Personalizado');
    createThemeChip('random', '🎲 Random', '🎲 Aleatorio', { theme: '#111827', bg: '#f8fafc' });
    CHAT_THEME_PRESETS.forEach((theme) => {
      createThemeChip(
        theme.id,
        theme.labelEn || theme.label || theme.id,
        theme.labelEs || theme.labelEn || theme.label || theme.id,
        { theme: theme.theme, bg: theme.bg }
      );
    });

    const customSection = document.createElement('div');
    customSection.className = 'mochi-chat-theme-section mochi-chat-theme-custom';
    const customLabel = document.createElement('span');
    customLabel.className = 'mochi-chat-theme-label';
    customLabel.textContent = t('Colors', 'Colores');
    const customRow = document.createElement('div');
    customRow.className = 'mochi-theme-color-row';
    const themeColorInput = document.createElement('input');
    themeColorInput.type = 'color';
    themeColorInput.className = 'mochi-chat-theme-color';
    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.className = 'mochi-chat-theme-bg';
    customRow.appendChild(themeColorInput);
    customRow.appendChild(bgColorInput);
    customSection.appendChild(customLabel);
    customSection.appendChild(customRow);
    themePanel.appendChild(customSection);

    const messagesArea = document.createElement('div');
    messagesArea.className = 'mochi-chat-messages';

    const terminalPane = document.createElement('div');
    terminalPane.className = 'mochi-chat-terminal-pane';
    const terminalStatus = document.createElement('div');
    terminalStatus.className = 'mochi-chat-terminal-status';
    terminalStatus.textContent = t('Terminal disconnected', 'Terminal desconectado');
    const terminalViewport = document.createElement('div');
    terminalViewport.className = 'mochi-chat-terminal-viewport';
    terminalPane.appendChild(terminalStatus);
    terminalPane.appendChild(terminalViewport);

    const inputArea = document.createElement('div');
    inputArea.className = 'mochi-chat-input-area';
    const input = document.createElement('textarea');
    input.className = 'mochi-chat-input';
    input.rows = 1;
    input.placeholder = t('Say something...', 'Di algo...');
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'mochi-chat-send';
    sendBtn.setAttribute('aria-label', t('Send', 'Enviar'));
    sendBtn.textContent = '▶';
    const micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.className = 'mochi-chat-mic';
    micBtn.setAttribute('aria-label', t('Push to talk', 'Presiona para hablar'));
    micBtn.textContent = '🎙';
    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);
    inputArea.appendChild(micBtn);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'mochi-chat-resize-handle';

    chat.appendChild(header);
    chat.appendChild(controlsPanel);
    chat.appendChild(themePanel);
    chat.appendChild(messagesArea);
    chat.appendChild(terminalPane);
    chat.appendChild(inputArea);
    chat.appendChild(resizeHandle);
    document.body.appendChild(chat);

    this.elements.chat = chat;
    this.elements.messagesArea = messagesArea;
    this.elements.input = input;
    this.elements.sendBtn = sendBtn;
    this.elements.closeBtn = closeBtn;
    this.elements.chatName = chatName;
    this.elements.chatTitle = chatMeta;
    this.elements.settingsBtn = settingsBtn;
    this.elements.ttsBtn = ttsBtn;
    this.elements.micBtn = micBtn;
    this.elements.openMicToggleBtn = openMicToggleBtn;
    this.elements.relayToggleBtn = relayToggleBtn;
    this.elements.openMicLabel = openMicLabel;
    this.elements.relayLabel = relayLabel;
    this.elements.themeToggleBtn = themeToggleBtn;
    this.elements.themeLabel = themeLabel;
    this.elements.fontSizeLabel = fontLabel;
    this.elements.uiTextScaleLabel = uiTextScaleLabel;
    this.elements.themeHeaderLabel = themeHeaderLabel;
    this.elements.themePresetLabel = presetLabel;
    this.elements.themeCustomLabel = customLabel;
    this.elements.controlsPanel = controlsPanel;
    this.elements.settingsPanel = controlsPanel;
    this.elements.themePanel = themePanel;
    this.elements.resizeHandle = resizeHandle;
    this.elements.themeColorInput = themeColorInput;
    this.elements.bgColorInput = bgColorInput;
    this.elements.fontSizeSelect = fontSizeSelect;
    this.elements.uiTextScaleSelect = uiTextScaleSelect;
    this.elements.themeButtons = themeButtons;
    this.elements.themeButtonMeta = themeButtonMeta;
    this.elements.themeCustomSection = customSection;
    this.elements.chatInputArea = inputArea;
    this.elements.terminalPane = terminalPane;
    this.elements.terminalStatus = terminalStatus;
    this.elements.terminalViewport = terminalViewport;

    this.normalizeChatThemeConfig(true);
    this.syncSettingsInputs();
    this.applyChatTheme();
    this.updateChatHeader();
    this.applyLocalizedText();
    this.syncChatControlButtons();

    const shouldFocusOnChatClick = (target) => {
      if (!target || !target.closest) return true;
      if (target.closest('.mochi-chat-messages')) return false;
      if (target.closest('.mochi-chat-msg')) return false;
      if (target.closest('a')) return false;
      if (target.closest('input, textarea, select')) return false;
      if (target.closest('button')) return false;
      if (target.closest('.mochi-chat-terminal-pane')) return false;
      return true;
    };

    const closePanels = () => {
      this.toggleSettingsPanel(false);
      this.toggleThemePanel(false);
    };

    this.elements.closeBtn.addEventListener('click', () => this.toggleChat());
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    this.elements.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.sendMessage();
        return;
      }
      if (event.key === 'Enter' && event.shiftKey) {
        // Allow newline insertion, then auto-resize
        setTimeout(() => this.autoResizeChatInput(), 0);
        return;
      }
      if (!this.isTerminalMode()) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.navigateTerminalHistory(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.navigateTerminalHistory(1);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        this.handleTerminalAutocomplete(event.shiftKey ? -1 : 1);
      }
    });

    this.elements.input.addEventListener('input', () => {
      if (this.isTerminalMode() && this.terminalHistoryCursor !== null) {
        this.terminalHistoryCursor = null;
      }
      this.resetTerminalAutocompleteState();
      this.autoResizeChatInput();
    });

    this.elements.input.addEventListener('paste', (event) => {
      if (this.isTerminalMode()) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          const reader = new FileReader();
          reader.onload = () => {
            this.pendingImage = reader.result;
            this.renderPendingImagePreview();
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    });

    settingsBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleSettingsPanel();
    });

    ttsBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleTts();
    });

    micBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleVoiceInput();
    });

    openMicToggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setOpenMicEnabled(!(this.config.openMicEnabled === true));
    });

    relayToggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setRelayEnabled(!(this.config.relayEnabled === true));
    });

    themeToggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleThemePanel();
    });

    themeCloseBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleThemePanel(false);
    });

    fontSizeSelect.addEventListener('change', () => {
      this.config.chatFontSize = fontSizeSelect.value || 'medium';
      this.applyChatTheme();
      this.persistConfig();
    });

    uiTextScaleSelect.addEventListener('change', () => {
      this.setGlobalUiTextScale(uiTextScaleSelect.value || 1, true);
    });

    themeColorInput.addEventListener('input', () => {
      this.setCustomThemeColors(themeColorInput.value, bgColorInput.value);
    });

    bgColorInput.addEventListener('input', () => {
      this.setCustomThemeColors(themeColorInput.value, bgColorInput.value);
    });

    themeButtons.forEach((button, themeId) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (themeId === 'custom') {
          this.setCustomThemeColors(themeColorInput.value, bgColorInput.value);
          return;
        }
        this.applyThemePresetSelection(themeId);
      });
    });

    resizeHandle.addEventListener('mousedown', (event) => this.onResizeStart(event, 'se'));
    messagesArea.addEventListener('click', closePanels);
    terminalPane.addEventListener('click', closePanels);
    inputArea.addEventListener('click', closePanels);

    chat.addEventListener('click', (event) => {
      this.bringToFront();
      if (shouldFocusOnChatClick(event.target)) {
        this.focusInput();
      }
    });

    chat.addEventListener('mousedown', (event) => {
      if (this.tryStartResizeFromEdge(event)) return;
      event.stopPropagation();
      if (window.mochiApi?.setIgnoreMouseEvents) {
        isMouseOverInteractive = true;
        window.mochiApi.setIgnoreMouseEvents(false);
      }
    });

    chat.addEventListener('mousemove', (event) => this.onChatResizeHover(event));
    chat.addEventListener('mouseleave', () => this.onChatResizeLeave());
    chat.addEventListener('keydown', (event) => this.handleUiTextScaleShortcut(event), true);

    messagesArea.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      this.bringToFront();
    });

    terminalPane.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      this.bringToFront();
      this.focusTerminal();
    });

    this.elements.input.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      this.focusInput();
    });

    this.elements.input.addEventListener('focus', () => {
      this.bringToFront();
      if (window.mochiApi?.setIgnoreMouseEvents) {
        isMouseOverInteractive = true;
        window.mochiApi.setIgnoreMouseEvents(false);
      }
    });

    document.addEventListener('mochi-relay', this.boundRelayHandler);
    document.addEventListener('mochi-stop-mic', this.boundStopMicHandler);

    const TerminalPaneCtor = window.MochiTerminalPane;
    if (TerminalPaneCtor && terminalViewport) {
      this.terminalView = new TerminalPaneCtor(terminalViewport, {
        onData: (data) => this.sendTerminalInput(data),
        onResize: ({ cols, rows }) => this.handleTerminalViewportResize(cols, rows)
      });
    }
    this.syncTerminalModeUi();
  }

  normalizeChatThemeConfig(forceDefaults = false) {
    const explicitPreset = CHAT_THEME_PRESETS.find((theme) => theme.id === this.config.chatTheme);
    const presetId = this.config.chatThemePreset
      || (explicitPreset ? explicitPreset.id : 'custom');

    if (presetId === 'random' && !forceDefaults) {
      if (!this.config.chatThemeColor || !this.config.chatBgColor) {
        const randomTheme = pickRandomChatTheme();
        this.config.chatThemeColor = randomTheme.theme;
        this.config.chatBgColor = randomTheme.bg;
        this.config.chatBubbleStyle = randomTheme.bubble || 'glass';
      }
      return;
    }

    if (presetId !== 'custom') {
      const preset = CHAT_THEME_PRESETS.find((theme) => theme.id === presetId) || CHAT_THEME_PRESETS[0];
      if (preset && (forceDefaults || !this.config.chatThemeColor || !this.config.chatBgColor)) {
        this.config.chatThemeColor = preset.theme;
        this.config.chatBgColor = preset.bg;
      }
      if (preset && (forceDefaults || !this.config.chatBubbleStyle)) {
        this.config.chatBubbleStyle = preset.bubble || 'glass';
      }
      this.config.chatTheme = preset?.id || this.config.chatTheme || 'pastel';
    }

    if (!this.config.chatThemeColor) this.config.chatThemeColor = '#3b1a77';
    if (!this.config.chatBgColor) this.config.chatBgColor = '#f0e8ff';
    if (!this.config.chatBubbleStyle) this.config.chatBubbleStyle = 'glass';
    if (!this.config.chatFontSize) this.config.chatFontSize = 'medium';
    if (!this.config.chatWidth) this.config.chatWidth = 'medium';
    if (!this.config.chatThemePreset) this.config.chatThemePreset = presetId || 'custom';
    const numericWidth = Number(this.config.chatWidthPx);
    this.config.chatWidthPx = Number.isFinite(numericWidth) ? numericWidth : null;
    const numericHeight = Number(this.config.chatHeightPx);
    this.config.chatHeightPx = Number.isFinite(numericHeight) ? numericHeight : null;
  }

  syncSettingsInputs() {
    const {
      themeColorInput,
      bgColorInput,
      fontSizeSelect,
      voiceProfileSelect,
      themeButtons,
      themeCustomSection
    } = this.elements;

    const themeColor = this.normalizeColor(this.config.chatThemeColor, '#3b1a77');
    const bgColor = this.normalizeColor(this.config.chatBgColor, '#f0e8ff');
    const bubbleStyle = this.config.chatBubbleStyle || 'glass';

    if (themeColorInput) {
      themeColorInput.value = themeColor;
    }
    if (bgColorInput) {
      bgColorInput.value = bgColor;
    }
    if (fontSizeSelect) {
      fontSizeSelect.value = this.config.chatFontSize || 'medium';
    }
    if (this.elements.uiTextScaleSelect) {
      this.elements.uiTextScaleSelect.value = String(getGlobalUiTextScale());
    }
    if (voiceProfileSelect) {
      voiceProfileSelect.value = this.config.ttsVoiceProfile || 'random';
    }

    let selectedThemeId = 'custom';
    if (this.config.chatThemePreset === 'random') {
      selectedThemeId = 'random';
    } else {
      const matchedPreset = CHAT_THEME_PRESETS.find((theme) => (
        String(theme.theme).toLowerCase() === themeColor.toLowerCase()
        && String(theme.bg).toLowerCase() === bgColor.toLowerCase()
        && String(theme.bubble || 'glass').toLowerCase() === String(bubbleStyle).toLowerCase()
      ));
      selectedThemeId = matchedPreset ? matchedPreset.id : 'custom';
    }

    if (themeButtons && typeof themeButtons.forEach === 'function') {
      themeButtons.forEach((button, themeId) => {
        button.classList.toggle('active', themeId === selectedThemeId);
      });
    }
    if (themeCustomSection) {
      themeCustomSection.style.display = selectedThemeId === 'custom' ? '' : 'none';
    }
  }

  applyLocalizedText() {
    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.title = t('Controls', 'Controles');
    }
    if (this.elements.closeBtn) {
      this.elements.closeBtn.title = t('Close', 'Cerrar');
    }
    if (this.elements.openMicLabel) {
      this.elements.openMicLabel.textContent = t('Open mic', 'Micrófono abierto');
    }
    if (this.elements.relayLabel) {
      this.elements.relayLabel.textContent = t('Talk to other mochis', 'Hablar con otros mochis');
    }
    if (this.elements.themeLabel) {
      this.elements.themeLabel.textContent = t('Theme', 'Tema');
    }
    if (this.elements.fontSizeLabel) {
      this.elements.fontSizeLabel.textContent = t('Text size', 'Tamaño de texto');
    }
    if (this.elements.uiTextScaleLabel) {
      this.elements.uiTextScaleLabel.textContent = t('UI text', 'Texto UI');
    }
    if (this.elements.themeHeaderLabel) {
      this.elements.themeHeaderLabel.textContent = t('Chat theme', 'Tema de chat');
    }
    if (this.elements.themePresetLabel) {
      this.elements.themePresetLabel.textContent = t('Themes', 'Temas');
    }
    if (this.elements.themeCustomLabel) {
      this.elements.themeCustomLabel.textContent = t('Colors', 'Colores');
    }
    if (this.elements.input) {
      this.elements.input.placeholder = t('Say something...', 'Di algo...');
    }
    if (this.elements.sendBtn) {
      this.elements.sendBtn.setAttribute('aria-label', t('Send', 'Enviar'));
    }
    if (this.elements.micBtn) {
      this.elements.micBtn.setAttribute('aria-label', t('Push to talk', 'Presiona para hablar'));
    }
    if (this.elements.fontSizeSelect) {
      const options = [
        t('Small', 'Pequeño'),
        t('Medium', 'Medio'),
        t('Large', 'Grande')
      ];
      Array.from(this.elements.fontSizeSelect.options).forEach((option, index) => {
        if (options[index]) option.textContent = options[index];
      });
    }
    if (this.elements.themeButtons && this.elements.themeButtonMeta) {
      this.elements.themeButtons.forEach((button, themeId) => {
        const meta = this.elements.themeButtonMeta.get(themeId);
        if (!meta) return;
        const label = t(meta.labelEn, meta.labelEs);
        button.title = label;
        button.setAttribute('aria-label', label);
      });
    }
    if (this.elements.messagesArea) {
      this.elements.messagesArea.querySelectorAll('.mochi-chat-code-copy').forEach((btn) => {
        const text = String(btn.textContent || '').trim();
        if (text === 'Copied' || text === 'Copiado' || text === 'Failed' || text === 'Error') return;
        btn.textContent = t('Copy', 'Copiar');
      });
    }
    if (this.elements.terminalStatus && !this.terminalStatusError) {
      if (!this.isTerminalMode()) {
        this.setTerminalStatus(t('Terminal disconnected', 'Terminal desconectado'));
      } else if (this.terminalSessionReady) {
        this.setTerminalStatus(t('Terminal connected', 'Terminal conectado'));
      } else {
        this.setTerminalStatus(t('Connecting terminal...', 'Conectando terminal...'));
      }
    }
    // MediaRecorder doesn't need lang updates — Whisper handles language server-side
  }

  syncChatControlButtons() {
    if (this.elements.ttsBtn) {
      const active = this.config.ttsEnabled === true;
      this.elements.ttsBtn.textContent = active ? '🔊' : '🔇';
      this.elements.ttsBtn.classList.toggle('active', active);
      this.elements.ttsBtn.title = active
        ? t('Mute voice', 'Silenciar voz')
        : t('Enable voice', 'Activar voz');
    }

    if (this.elements.micBtn) {
      this.elements.micBtn.classList.toggle('active', this.isListening || this.isTranscribing);
      this.elements.micBtn.classList.toggle('listening', this.isListening);
      this.elements.micBtn.classList.toggle('transcribing', this.isTranscribing);
      if (this.isTranscribing) {
        this.elements.micBtn.textContent = '⏳';
        this.elements.micBtn.title = t('Transcribing...', 'Transcribiendo...');
      } else {
        this.elements.micBtn.title = this.isListening
          ? t('Stop listening', 'Detener escucha')
          : t('Push to talk', 'Presiona para hablar');
        if (!this.isListening) {
          this.elements.micBtn.textContent = '🎙';
        }
      }
    }

    if (this.elements.openMicToggleBtn) {
      const active = this.config.openMicEnabled === true;
      this.elements.openMicToggleBtn.classList.toggle('active', active);
      this.elements.openMicToggleBtn.textContent = '🎙️';
      this.elements.openMicToggleBtn.title = active
        ? t('Disable open mic', 'Desactivar micrófono abierto')
        : t('Enable open mic', 'Activar micrófono abierto');
    }

    if (this.elements.relayToggleBtn) {
      const active = this.config.relayEnabled === true;
      this.elements.relayToggleBtn.classList.toggle('active', active);
      this.elements.relayToggleBtn.textContent = '🔁';
      this.elements.relayToggleBtn.title = active
        ? t('Talk to other mochis: on', 'Hablar con otros mochis: activado')
        : t('Talk to other mochis: off', 'Hablar con otros mochis: apagado');
    }

    if (this.elements.themeToggleBtn) {
      this.elements.themeToggleBtn.textContent = '🎨';
      this.elements.themeToggleBtn.title = t('Chat theme', 'Tema de chat');
    }

    if (this.elements.chatInputArea) {
      this.elements.chatInputArea.classList.toggle('listening', this.isListening);
    }
  }

  normalizeColor(value, fallback) {
    const candidate = `${value || ''}`.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
      return candidate.toLowerCase();
    }
    return fallback;
  }

  toggleSettingsPanel(forceState) {
    if (!this.elements.controlsPanel) return;
    const show = typeof forceState === 'boolean'
      ? forceState
      : !this.elements.controlsPanel.classList.contains('open');
    this.elements.controlsPanel.classList.toggle('open', show);
    if (show) {
      this.toggleThemePanel(false);
      this.applyLocalizedText();
      this.syncSettingsInputs();
    }
  }

  toggleThemePanel(forceState) {
    if (!this.elements.themePanel) return;
    const show = typeof forceState === 'boolean'
      ? forceState
      : !this.elements.themePanel.classList.contains('open');
    this.elements.themePanel.classList.toggle('open', show);
    if (show) {
      this.toggleSettingsPanel(false);
      this.applyLocalizedText();
      this.syncSettingsInputs();
    }
  }

  applyThemePresetSelection(presetId) {
    if (!presetId) return;
    if (presetId === 'random') {
      const randomTheme = pickRandomChatTheme();
      this.config.chatThemePreset = 'random';
      this.config.chatTheme = randomTheme.id;
      this.config.chatThemeColor = randomTheme.theme;
      this.config.chatBgColor = randomTheme.bg;
      this.config.chatBubbleStyle = randomTheme.bubble || 'glass';
    } else if (presetId === 'custom') {
      this.config.chatThemePreset = 'custom';
    } else {
      const preset = CHAT_THEME_PRESETS.find((theme) => theme.id === presetId);
      if (!preset) return;
      this.config.chatThemePreset = preset.id;
      this.config.chatTheme = preset.id;
      this.config.chatThemeColor = preset.theme;
      this.config.chatBgColor = preset.bg;
      this.config.chatBubbleStyle = preset.bubble || 'glass';
    }
    this.applyChatTheme();
    this.persistConfig();
    this.syncSettingsInputs();
  }

  setCustomThemeColors(themeColor, bgColor) {
    this.config.chatThemePreset = 'custom';
    this.config.chatTheme = 'custom';
    this.config.chatThemeColor = this.normalizeColor(themeColor, '#3b1a77');
    this.config.chatBgColor = this.normalizeColor(bgColor, '#f0e8ff');
    this.applyChatTheme();
    this.persistConfig();
    this.syncSettingsInputs();
  }

  cycleThemePreset() {
    const options = ['pastel', 'pink', 'kawaii', 'mint', 'ocean', 'neural', 'cyberpunk', 'noir-rose', 'midnight', 'ember'];
    const current = this.config.chatTheme || 'pastel';
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    this.applyThemePresetSelection(next);
  }

  persistConfig() {
    persistMochiConfig(this.id, this.config);
  }

  toggleTts() {
    this.config.ttsEnabled = !(this.config.ttsEnabled === true);
    if (!this.config.ttsEnabled) {
      this.stopTts();
    } else if (!this.config.ttsVoiceProfile) {
      this.config.ttsVoiceProfile = pickRandomTtsProfile();
    }
    this.syncChatControlButtons();
    this.persistConfig();
  }

  async resolveTtsVoice() {
    const voices = await getVoicesAsync();
    if (!voices.length) return null;

    if (this.config.ttsVoiceId) {
      const byId = voices.find((voice) => voice.name === this.config.ttsVoiceId);
      if (byId) return byId;
    }

    const langPrefix = isSpanishLocale() ? 'es' : 'en';
    const profile = this.config.ttsVoiceProfile || 'random';
    const picked = pickVoiceByProfile(profile, voices, langPrefix);
    if (picked && picked.name && picked.name !== this.config.ttsVoiceId) {
      this.config.ttsVoiceId = picked.name;
      this.persistConfig();
    }
    return picked;
  }

  enqueueSpeech(text, onEndCallback = null) {
    const content = `${text || ''}`.trim();
    if (!content) {
      if (typeof onEndCallback === 'function') onEndCallback();
      return;
    }
    if (this.config.ttsEnabled !== true || !window.speechSynthesis) {
      if (typeof onEndCallback === 'function') onEndCallback();
      return;
    }
    this.ttsQueue.push({ text: content, onEndCallback });
    if (!this.ttsSpeaking) {
      this.speakNextInQueue();
    }
  }

  async speakNextInQueue() {
    if (this.ttsSpeaking) return;
    const next = this.ttsQueue.shift();
    if (!next) return;
    if (!window.speechSynthesis) {
      if (typeof next.onEndCallback === 'function') next.onEndCallback();
      return;
    }

    this.ttsSpeaking = true;
    try {
      const utterance = new SpeechSynthesisUtterance(next.text);
      const base = PERSONALITY_TTS[this.config.personality] || { pitch: 1.0, rate: 1.0 };
      const mod = TTS_PROFILE_MODIFIERS[this.config.ttsVoiceProfile || 'random'] || { pitchOffset: 0, rateOffset: 0 };
      utterance.pitch = clamp(base.pitch + mod.pitchOffset, 0.1, 2.0) * getMochiPitchFactor(this.id);
      utterance.rate = clamp(base.rate + mod.rateOffset, 0.1, 3.0);
      const voice = await this.resolveTtsVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        this.ttsSpeaking = false;
        if (typeof next.onEndCallback === 'function') next.onEndCallback();
        this.speakNextInQueue();
      };
      utterance.onerror = () => {
        this.ttsSpeaking = false;
        if (typeof next.onEndCallback === 'function') next.onEndCallback();
        this.speakNextInQueue();
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      this.ttsSpeaking = false;
      if (typeof next.onEndCallback === 'function') next.onEndCallback();
      this.speakNextInQueue();
    }
  }

  stopTts() {
    this.ttsQueue = [];
    this.ttsSpeaking = false;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  setOpenMicEnabled(enabled) {
    this.config.openMicEnabled = enabled === true;
    if (!this.config.openMicEnabled) {
      this.stopVoiceInput();
      this.cancelMicAutoSend();
    } else if (this.chatOpen) {
      this.startVoiceInput({ continuous: true, allowAutoRestart: true });
    }
    this.syncChatControlButtons();
    this.persistConfig();
  }

  setRelayEnabled(enabled) {
    this.config.relayEnabled = enabled === true;
    this.syncChatControlButtons();
    this.persistConfig();
  }

  async ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.pushSystemMessage(t(
        'Microphone capture is not available in this build.',
        'La captura de micrófono no está disponible en esta versión.'
      ));
      return false;
    }
    if (this.micPermissionStream) return true;
    if (this.micPermissionRequest) return this.micPermissionRequest;

    this.micPermissionRequest = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.micPermissionStream = stream;
        return true;
      } catch (error) {
        const code = `${error?.name || error?.message || ''}`.toLowerCase();
        if (code.includes('notallowed') || code.includes('permission') || code.includes('security')) {
          this.pushSystemMessage(t(
            'Microphone access denied. Enable microphone permissions.',
            'Permiso de micrófono denegado. Habilita los permisos del micrófono.'
          ));
        } else if (code.includes('notfound') || code.includes('overconstrained') || code.includes('audio')) {
          this.pushSystemMessage(t(
            'No microphone detected. Connect a microphone and try again.',
            'No se detectó micrófono. Conecta un micrófono e inténtalo de nuevo.'
          ));
        }
        return false;
      } finally {
        this.micPermissionRequest = null;
      }
    })();

    return this.micPermissionRequest;
  }

  releaseMicrophonePermissionStream() {
    if (!this.micPermissionStream) return;
    try {
      this.micPermissionStream.getTracks().forEach((track) => track.stop());
    } catch {}
    this.micPermissionStream = null;
  }

  toggleVoiceInput() {
    if (this.isTranscribing) return;
    if (this.isListening) {
      this.stopAndTranscribe();
      return;
    }
    this.startVoiceInput({ continuous: false, allowAutoRestart: false });
  }

  async startVoiceInput({ continuous = true, allowAutoRestart = false } = {}) {
    const hasMicrophone = await this.ensureMicrophonePermission();
    if (!hasMicrophone) return;

    if (activeMicMochiId && activeMicMochiId !== this.id) {
      document.dispatchEvent(new CustomEvent('mochi-stop-mic', {
        detail: { except: this.id }
      }));
    }

    this.stopMediaRecorder();
    this.stopTts();
    this.cancelMicAutoSend();
    this.micSessionAutoRestart = allowAutoRestart === true;
    this.micSessionContinuous = continuous === true;
    this.clearMicRestartTimer();
    this.micDraftText = '';

    const stream = this.micPermissionStream;
    if (!stream) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      this.pushSystemMessage(t(
        'Audio recording is not supported in this build.',
        'La grabación de audio no es compatible con esta versión.'
      ));
      return;
    }

    this.mediaRecorderChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.mediaRecorderChunks.push(e.data);
    };
    recorder.onstop = () => {};

    try {
      recorder.start(250);
      this.mediaRecorder = recorder;
      this.isListening = true;
      activeMicMochiId = this.id;

      if (this.micSessionContinuous) {
        this.startSilenceDetection(stream);
      }
    } catch {
      this.mediaRecorder = null;
      this.isListening = false;
      if (activeMicMochiId === this.id) activeMicMochiId = null;
      if (!this.config.openMicEnabled) this.releaseMicrophonePermissionStream();
    }
    this.syncChatControlButtons();
  }

  startSilenceDetection(stream) {
    this.stopSilenceDetection();
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      this.lastSpeechTime = Date.now();
      const SILENCE_THRESHOLD = 15;
      const SILENCE_DURATION_MS = 2000;

      this.silenceDetectionInterval = setInterval(() => {
        if (!this.isListening || !this.mediaRecorder) {
          this.stopSilenceDetection();
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;

        if (average > SILENCE_THRESHOLD) {
          this.lastSpeechTime = Date.now();
        } else if (Date.now() - this.lastSpeechTime > SILENCE_DURATION_MS && this.mediaRecorderChunks.length > 0) {
          this.stopSilenceDetection();
          this.stopAndTranscribe();
        }
      }, 100);

      this._silenceAudioCtx = audioCtx;
    } catch {
      // Silence detection not critical — user can manually stop
    }
  }

  stopSilenceDetection() {
    if (this.silenceDetectionInterval) {
      clearInterval(this.silenceDetectionInterval);
      this.silenceDetectionInterval = null;
    }
    if (this._silenceAudioCtx) {
      try { this._silenceAudioCtx.close(); } catch {}
      this._silenceAudioCtx = null;
    }
  }

  stopMediaRecorder() {
    this.stopSilenceDetection();
    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
  }

  async stopAndTranscribe() {
    if (this.isTranscribing) return;
    this.cancelMicAutoSend();
    this.stopSilenceDetection();

    const recorder = this.mediaRecorder;
    this.mediaRecorder = null;
    this.isListening = false;
    if (activeMicMochiId === this.id) activeMicMochiId = null;

    if (!recorder || recorder.state === 'inactive') {
      this.syncChatControlButtons();
      if (this.canAutoRestartOpenMic()) this.queueOpenMicRestart(400);
      return;
    }

    this.isTranscribing = true;
    this.syncChatControlButtons();

    const chunks = this.mediaRecorderChunks;
    this.mediaRecorderChunks = [];

    await new Promise((resolve) => {
      recorder.onstop = resolve;
      try { recorder.stop(); } catch { resolve(); }
    });

    if (chunks.length === 0) {
      this.isTranscribing = false;
      this.syncChatControlButtons();
      if (this.canAutoRestartOpenMic()) this.queueOpenMicRestart(400);
      return;
    }

    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    let arrayBuffer;
    try {
      arrayBuffer = await blob.arrayBuffer();
    } catch {
      this.isTranscribing = false;
      this.syncChatControlButtons();
      return;
    }

    try {
      const result = await window.mochiApi.transcribeAudio({
        mochiId: this.id,
        audioData: arrayBuffer
      });

      this.isTranscribing = false;

      if (result?.ok && result.transcript) {
        const existing = (this.elements.input?.value || '').trim();
        const combined = existing ? `${existing} ${result.transcript}` : result.transcript;
        if (this.elements.input) {
          this.elements.input.value = combined;
          const end = this.elements.input.value.length;
          this.elements.input.setSelectionRange(end, end);
          this.elements.input.scrollLeft = this.elements.input.scrollWidth;
        }
        this.micDraftText = combined;
        this.scheduleMicAutoSend();
      } else if (result?.error) {
        const errMsg = result.error;
        if (errMsg !== 'No speech detected.') {
          this.pushSystemMessage(errMsg);
        }
        if (this.canAutoRestartOpenMic()) this.queueOpenMicRestart(500);
      }
    } catch {
      this.isTranscribing = false;
    }

    this.syncChatControlButtons();

    if (this.config.openMicEnabled === true && this.micSessionAutoRestart && !this.isListening) {
      this.queueOpenMicRestart(500);
    } else if (!this.config.openMicEnabled || !this.micSessionAutoRestart) {
      this.releaseMicrophonePermissionStream();
    }
  }

  stopVoiceInput(disableAutoRestart = true) {
    if (disableAutoRestart) {
      this.micSessionAutoRestart = false;
    }
    this.micSessionContinuous = false;
    this.clearMicRestartTimer();
    this.stopMediaRecorder();

    if (activeMicMochiId === this.id) {
      activeMicMochiId = null;
    }
    if (disableAutoRestart || this.config.openMicEnabled !== true) {
      this.releaseMicrophonePermissionStream();
    }
    this.isListening = false;
    this.isTranscribing = false;
    this.syncChatControlButtons();
  }

  onStopMicEvent(event) {
    const exceptId = event?.detail?.except;
    if (exceptId && exceptId === this.id) return;
    if (!this.isListening) return;
    this.stopVoiceInput();
    this.cancelMicAutoSend();
  }

  canAutoRestartOpenMic() {
    return this.chatOpen
      && this.config.openMicEnabled === true
      && this.micSessionAutoRestart
      && !this.isListening
      && !this.isTranscribing
      && this.pendingAssistantIndex === null;
  }

  queueOpenMicRestart(delayMs = 350) {
    this.clearMicRestartTimer();
    this.micRestartTimer = setTimeout(() => {
      this.micRestartTimer = null;
      if (!this.canAutoRestartOpenMic()) return;
      this.startVoiceInput({ continuous: true, allowAutoRestart: true });
    }, delayMs);
  }

  clearMicRestartTimer() {
    if (!this.micRestartTimer) return;
    clearTimeout(this.micRestartTimer);
    this.micRestartTimer = null;
  }

  scheduleMicAutoSend() {
    this.cancelMicAutoSend();
    this.micAutoSendSeconds = 3;
    this.updateMicCountdownUi();

    this.micAutoSendInterval = setInterval(() => {
      this.micAutoSendSeconds = Math.max(0, this.micAutoSendSeconds - 1);
      this.updateMicCountdownUi();
    }, 1000);

    this.micAutoSendTimer = setTimeout(() => {
      this.cancelMicAutoSend();
      if (!this.elements.input) return;
      const text = this.elements.input.value.trim();
      this.micDraftText = '';
      if (text) {
        this.sendMessage();
      }
    }, 3000);
  }

  updateMicCountdownUi() {
    if (!this.elements.micBtn || !this.isListening) return;
    this.elements.micBtn.textContent = this.micAutoSendSeconds > 0 ? `🎙${this.micAutoSendSeconds}` : '🎙';
  }

  cancelMicAutoSend({ keepDraft = false } = {}) {
    if (this.micAutoSendTimer) {
      clearTimeout(this.micAutoSendTimer);
      this.micAutoSendTimer = null;
    }
    if (this.micAutoSendInterval) {
      clearInterval(this.micAutoSendInterval);
      this.micAutoSendInterval = null;
    }
    this.micAutoSendSeconds = 0;
    if (!keepDraft) {
      this.micDraftText = '';
    }
    if (this.elements.micBtn && this.isListening) {
      this.elements.micBtn.textContent = '🎙';
    }
  }

  onRelayEvent(event) {
    const detail = event?.detail || {};
    if (detail.fromId === this.id) return;
    if (this.config.relayEnabled !== true) return;
    if (this.isTerminalMode()) return;
    const text = `${detail.text || ''}`.trim();
    if (!text) return;
    const relayPrompt = isSpanishLocale()
      ? `Mochi ${detail.fromId || 'aliado'} dice: ${text}`
      : `Mochi ${detail.fromId || 'ally'} says: ${text}`;
    this.sendPrompt(relayPrompt, { suppressRelay: true });
  }

  dispatchRelay(text) {
    const cleanText = `${text || ''}`.trim();
    if (!cleanText) return;
    document.dispatchEvent(new CustomEvent('mochi-relay', {
      detail: { fromId: this.id, text: cleanText }
    }));
  }

  getResizeModeFromPoint(clientX, clientY) {
    if (!this.elements.chat) return null;
    const rect = this.elements.chat.getBoundingClientRect();
    if (
      clientX < rect.left
      || clientX > rect.right
      || clientY < rect.top
      || clientY > rect.bottom
    ) {
      return null;
    }

    const hit = CHAT_RESIZE_HIT_PX;
    const nearLeft = (clientX - rect.left) <= hit;
    const nearRight = (rect.right - clientX) <= hit;
    const nearTop = (clientY - rect.top) <= hit;
    const nearBottom = (rect.bottom - clientY) <= hit;

    const vertical = nearTop ? 'n' : (nearBottom ? 's' : '');
    const horizontal = nearLeft ? 'w' : (nearRight ? 'e' : '');
    const mode = `${vertical}${horizontal}`;
    return mode || null;
  }

  getResizeCursor(mode) {
    return {
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      nw: 'nwse-resize',
      se: 'nwse-resize'
    }[mode] || '';
  }

  tryStartResizeFromEdge(event) {
    const mode = this.getResizeModeFromPoint(event.clientX, event.clientY);
    if (!mode) return false;
    this.onResizeStart(event, mode);
    return true;
  }

  onChatResizeHover(event) {
    if (!this.chatOpen || !this.elements.chat) return;
    if (this.resizeState) return;
    const mode = this.getResizeModeFromPoint(event.clientX, event.clientY);
    this.elements.chat.style.cursor = mode ? this.getResizeCursor(mode) : '';
  }

  onChatResizeLeave() {
    if (!this.elements.chat) return;
    if (this.resizeState) return;
    this.elements.chat.style.cursor = '';
  }

  onResizeStart(event, mode = 'se') {
    if (!this.elements.chat || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = this.elements.chat.getBoundingClientRect();
    const activeMode = mode || 'se';
    this.resizeState = {
      mode: activeMode,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };

    const cursor = this.getResizeCursor(activeMode);
    if (cursor) {
      this.elements.chat.style.cursor = cursor;
      document.body.style.cursor = cursor;
    }

    const moveHandler = (moveEvent) => this.onResizeMove(moveEvent);
    const upHandler = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      this.onResizeEnd();
    };

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  onResizeMove(event) {
    if (!this.resizeState || !this.elements.chat) return;
    const dx = event.clientX - this.resizeState.startX;
    const dy = event.clientY - this.resizeState.startY;
    const mode = this.resizeState.mode || 'se';
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const minWidth = Math.min(CHAT_MIN_WIDTH, Math.max(120, viewportWidth - (CHAT_EDGE_MARGIN_PX * 2)));
    const minHeight = Math.min(CHAT_MIN_HEIGHT, Math.max(120, viewportHeight - (CHAT_EDGE_MARGIN_PX * 2)));
    const maxWidth = Math.max(minWidth, viewportWidth - (CHAT_EDGE_MARGIN_PX * 2));
    const maxHeight = Math.max(minHeight, Math.min(CHAT_MAX_HEIGHT, viewportHeight - (CHAT_EDGE_MARGIN_PX * 2)));

    let width = this.resizeState.width;
    let height = this.resizeState.height;
    let left = this.resizeState.left;
    let top = this.resizeState.top;

    if (mode.includes('e')) {
      width = clamp(this.resizeState.width + dx, minWidth, maxWidth);
    }
    if (mode.includes('s')) {
      height = clamp(this.resizeState.height + dy, minHeight, maxHeight);
    }
    if (mode.includes('w')) {
      width = clamp(this.resizeState.width - dx, minWidth, maxWidth);
      left = this.resizeState.left + (this.resizeState.width - width);
    }
    if (mode.includes('n')) {
      height = clamp(this.resizeState.height - dy, minHeight, maxHeight);
      top = this.resizeState.top + (this.resizeState.height - height);
    }

    left = clamp(left, CHAT_EDGE_MARGIN_PX, Math.max(CHAT_EDGE_MARGIN_PX, viewportWidth - width - CHAT_EDGE_MARGIN_PX));
    top = clamp(top, CHAT_EDGE_MARGIN_PX, Math.max(CHAT_EDGE_MARGIN_PX, viewportHeight - height - CHAT_EDGE_MARGIN_PX));

    this.config.chatWidthPx = Math.round(width);
    this.config.chatHeightPx = Math.round(height);
    this.elements.chat.style.setProperty('--chat-width', `${Math.round(width)}px`);
    this.elements.chat.style.setProperty('--chat-height', `${Math.round(height)}px`);
    this.elements.chat.style.left = `${Math.round(left)}px`;
    this.elements.chat.style.top = `${Math.round(top)}px`;
    if (this.supportsInteractiveTerminalMode()) {
      this.scheduleTerminalFit(0);
    }
  }

  onResizeEnd() {
    this.resizeState = null;
    if (this.elements.chat) {
      this.elements.chat.style.cursor = '';
    }
    document.body.style.cursor = '';
    if (this.supportsInteractiveTerminalMode()) {
      this.scheduleTerminalFit(0);
    }
    this.persistConfig();
  }

  playLegacyNotificationTone(kind = 'success') {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const volume = clamp(Number(this.config.soundVolume || 0.7), 0.05, 1);
      osc.type = 'sine';
      osc.frequency.value = kind === 'error' ? 320 : 640;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(volume * 0.07, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.23);
    } catch {}
  }

  async playNotificationSoundAsync(kind = 'success') {
    const ctx = getSharedAudioContext();
    if (!ctx) {
      this.playLegacyNotificationTone(kind);
      return;
    }
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      await ensureSharedSoundBuffersLoaded();
      const buffer = sharedSoundBuffers[kind];
      if (!buffer) {
        this.playLegacyNotificationTone(kind);
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const personalityRate = PERSONALITY_SOUND_RATE[this.config.personality] || 1.0;
      source.playbackRate.value = clamp(personalityRate * getMochiPitchFactor(this.id), 0.6, 1.6);
      const gain = ctx.createGain();
      gain.gain.value = clamp(Number(this.config.soundVolume || 0.7), 0, 1);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } catch {
      this.playLegacyNotificationTone(kind);
    }
  }

  playNotificationSound(kind = 'success') {
    if (this.config.soundEnabled === false) return;
    this.playNotificationSoundAsync(kind).catch(() => {});
  }

  pushSystemMessage(text) {
    this.messages.push({ role: 'assistant', content: `${t('Warning', 'Aviso')}: ${text}` });
    this.renderMessages();
    this.saveConversation();
    this.playNotificationSound('error');
  }

  getMochiNumber() {
    const match = `${this.id}`.match(/(\d+)$/);
    if (match) return Number(match[1]);
    const index = mochis.indexOf(this);
    return index >= 0 ? index + 1 : 1;
  }

  getOpenClawAgentName() {
    const mochiNumber = this.getMochiNumber();
    const fallback = `desktop-mochi-${mochiNumber}`;
    const perMochiKey = `mochi${mochiNumber}_openclawAgentName`;
    const rawName = this.config.openclawAgentName
      || globalConfig[perMochiKey]
      || globalConfig.openclawAgentName
      || fallback;
    const normalized = `${rawName || ''}`.trim();
    return normalized || fallback;
  }

  getTerminalDistroName() {
    const mochiNumber = this.getMochiNumber();
    const perMochiKey = `mochi${mochiNumber}_terminalDistro`;
    const rawValue = this.config.terminalDistro
      || globalConfig[perMochiKey]
      || globalConfig.terminalDistro
      || DEFAULT_TERMINAL_PROFILE;
    const normalized = normalizeTerminalProfile(rawValue);
    if (normalized) return normalized;
    if (this.isMacPlatform()) return 'default shell';
    if (IS_WINDOWS_PLATFORM) return 'Ubuntu';
    return 'default shell';
  }

  getActiveMode() {
    const mode = this.config.mode || globalConfig.aiMode || 'standard';
    if (mode === 'terminal' || mode === 'wsl' || mode === 'shell') return 'terminal';
    if (mode === 'agent' || mode === 'openclaw') return 'agent';
    if (mode === 'off' || mode === 'disabled' || mode === 'decorative') return 'off';
    return mode;
  }

  isTerminalMode() {
    return this.getActiveMode() === 'terminal';
  }

  resetTerminalHistoryCursor() {
    this.terminalHistoryCursor = null;
    this.terminalHistoryDraft = '';
  }

  resetTerminalAutocompleteState() {
    this.terminalAutocompleteState = null;
    this.terminalAutocompleteToken += 1;
  }

  pushTerminalCommandToHistory(commandText) {
    const command = String(commandText || '').trim();
    if (!command) return;
    const last = this.terminalCommandHistory[this.terminalCommandHistory.length - 1];
    if (last !== command) {
      this.terminalCommandHistory.push(command);
      if (this.terminalCommandHistory.length > 120) {
        this.terminalCommandHistory.splice(0, this.terminalCommandHistory.length - 120);
      }
    }
    this.resetTerminalHistoryCursor();
  }

  navigateTerminalHistory(direction) {
    if (!this.isTerminalMode()) return;
    if (!this.elements.input) return;
    if (!Array.isArray(this.terminalCommandHistory) || this.terminalCommandHistory.length === 0) return;

    const input = this.elements.input;
    if (this.terminalHistoryCursor === null) {
      this.terminalHistoryDraft = input.value;
    }

    if (direction < 0) {
      if (this.terminalHistoryCursor === null) {
        this.terminalHistoryCursor = this.terminalCommandHistory.length - 1;
      } else {
        this.terminalHistoryCursor = Math.max(0, this.terminalHistoryCursor - 1);
      }
    } else if (direction > 0) {
      if (this.terminalHistoryCursor === null) return;
      if (this.terminalHistoryCursor >= this.terminalCommandHistory.length - 1) {
        this.terminalHistoryCursor = null;
      } else {
        this.terminalHistoryCursor += 1;
      }
    } else {
      return;
    }

    input.value = this.terminalHistoryCursor === null
      ? this.terminalHistoryDraft
      : this.terminalCommandHistory[this.terminalHistoryCursor];
    const end = input.value.length;
    input.setSelectionRange(end, end);
    input.scrollLeft = input.scrollWidth;
    this.resetTerminalAutocompleteState();
  }

  applyTerminalAutocompleteReplacement({
    input,
    beforeCursor,
    afterCursor,
    tokenStart,
    quotePrefix,
    completion,
    exact
  }) {
    const nextCompletion = String(completion || '').trim();
    if (!nextCompletion) return false;
    let replacement = `${quotePrefix || ''}${nextCompletion}`;
    const shouldAppendSpace = Boolean(exact) && !replacement.endsWith('/');
    if (shouldAppendSpace && !/^\s/.test(afterCursor)) {
      replacement += ' ';
    }
    if (replacement === beforeCursor.slice(tokenStart) && !shouldAppendSpace) {
      return false;
    }

    const nextValue = `${beforeCursor.slice(0, tokenStart)}${replacement}${afterCursor}`;
    input.value = nextValue;
    const nextCaret = (beforeCursor.slice(0, tokenStart) + replacement).length;
    input.setSelectionRange(nextCaret, nextCaret);
    input.scrollLeft = input.scrollWidth;
    return true;
  }

  tryCycleTerminalAutocomplete({
    input,
    beforeCursor,
    afterCursor,
    tokenStart,
    fragment,
    quotePrefix,
    direction
  }) {
    const state = this.terminalAutocompleteState;
    if (!state || !Array.isArray(state.candidates) || state.candidates.length < 2) {
      return false;
    }
    const basePrefix = beforeCursor.slice(0, tokenStart);
    if (state.basePrefix !== basePrefix) return false;
    if (state.afterCursor !== afterCursor) return false;
    if (state.quotePrefix !== quotePrefix) return false;
    if (fragment !== state.query && !state.candidates.includes(fragment)) return false;

    const count = state.candidates.length;
    let activeIndex = Number.isInteger(state.activeIndex) ? state.activeIndex : -1;
    const currentIndex = state.candidates.indexOf(fragment);
    if (currentIndex >= 0) {
      activeIndex = currentIndex;
    }

    let nextIndex = 0;
    if (activeIndex >= 0 && activeIndex < count) {
      nextIndex = (activeIndex + direction + count) % count;
    } else if (direction < 0) {
      nextIndex = count - 1;
    }

    const nextCompletion = String(state.candidates[nextIndex] || '').trim();
    if (!nextCompletion) return false;
    const applied = this.applyTerminalAutocompleteReplacement({
      input,
      beforeCursor,
      afterCursor,
      tokenStart,
      quotePrefix,
      completion: nextCompletion,
      exact: false
    });
    if (!applied) return false;
    state.activeIndex = nextIndex;
    return true;
  }

  async handleTerminalAutocomplete(direction = 1) {
    if (!this.isTerminalMode()) return;
    if (!this.elements.input || !window.mochiApi?.terminalAutocomplete) return;

    const cycleDirection = direction < 0 ? -1 : 1;
    const input = this.elements.input;
    const rawValue = input.value || '';
    const cursor = typeof input.selectionStart === 'number' ? input.selectionStart : rawValue.length;
    const beforeCursor = rawValue.slice(0, cursor);
    const afterCursor = rawValue.slice(cursor);

    let tokenStart = beforeCursor.length;
    while (tokenStart > 0 && !/\s/.test(beforeCursor[tokenStart - 1])) {
      tokenStart -= 1;
    }
    const fragmentRaw = beforeCursor.slice(tokenStart);
    if (!fragmentRaw) return;

    let quotePrefix = '';
    let fragment = fragmentRaw;
    if (
      (fragment.startsWith('"') || fragment.startsWith("'"))
      && !fragment.slice(1).includes(fragment[0])
    ) {
      quotePrefix = fragment[0];
      fragment = fragment.slice(1);
    }
    if (!fragment) return;

    if (this.tryCycleTerminalAutocomplete({
      input,
      beforeCursor,
      afterCursor,
      tokenStart,
      fragment,
      quotePrefix,
      direction: cycleDirection
    })) {
      return;
    }

    const requestToken = ++this.terminalAutocompleteToken;
    let result;
    try {
      result = await window.mochiApi.terminalAutocomplete({
        mochiId: this.id,
        fragment,
        terminalDistro: normalizeTerminalProfile(this.config.terminalDistro),
        terminalCwd: this.config.terminalCwd || ''
      });
    } catch {
      return;
    }
    if (requestToken !== this.terminalAutocompleteToken) return;
    if (!result?.ok) {
      this.terminalAutocompleteState = null;
      return;
    }

    const candidates = Array.isArray(result.candidates) ? result.candidates : [];
    const basePrefix = beforeCursor.slice(0, tokenStart);
    if (candidates.length > 1) {
      this.terminalAutocompleteState = {
        basePrefix,
        afterCursor,
        quotePrefix,
        query: fragment,
        candidates,
        activeIndex: -1
      };
    } else {
      this.terminalAutocompleteState = null;
    }

    let completion = String(result.completion || '').trim();
    if (!completion && candidates.length === 1) {
      completion = String(candidates[0] || '').trim();
    }
    if (!completion) {
      return;
    }
    if (completion === fragment && !result.exact) {
      return;
    }

    const applied = this.applyTerminalAutocompleteReplacement({
      input,
      beforeCursor,
      afterCursor,
      tokenStart,
      quotePrefix,
      completion,
      exact: Boolean(result.exact)
    });
    if (!applied) return;

    if (this.terminalAutocompleteState && this.terminalAutocompleteState.candidates.length > 1) {
      const index = this.terminalAutocompleteState.candidates.indexOf(completion);
      if (index >= 0) {
        this.terminalAutocompleteState.activeIndex = index;
      }
    }
  }

  supportsInteractiveTerminalMode() {
    return this.isTerminalMode()
      && Boolean(this.terminalView)
      && Boolean(window.mochiApi?.terminalSessionStart)
      && Boolean(window.mochiApi?.terminalSessionWrite)
      && Boolean(window.mochiApi?.terminalSessionResize)
      && Boolean(window.mochiApi?.terminalSessionStop);
  }

  setTerminalStatus(text, { error = false } = {}) {
    const next = `${text || ''}`.trim();
    if (!this.elements.terminalStatus || !next) return;
    if (this.terminalLastStatus === next && this.terminalStatusError === error) return;
    this.terminalLastStatus = next;
    this.terminalStatusError = error;
    this.elements.terminalStatus.textContent = next;
    this.elements.terminalStatus.classList.toggle('error', error);
  }

  syncTerminalModeUi() {
    if (!this.elements.chat) return;
    const interactive = this.supportsInteractiveTerminalMode();
    this.elements.chat.classList.toggle('terminal-mode', interactive);
    if (this.elements.messagesArea) {
      this.elements.messagesArea.style.display = interactive ? 'none' : '';
    }
    if (this.elements.chatInputArea) {
      this.elements.chatInputArea.style.display = interactive ? 'none' : '';
    }
    if (this.elements.terminalPane) {
      this.elements.terminalPane.style.display = interactive ? 'flex' : 'none';
    }

    if (!this.isTerminalMode()) {
      this.setTerminalStatus(t('Terminal disconnected', 'Terminal desconectado'));
      return;
    }

    if (!interactive) {
      this.setTerminalStatus(
        t('Interactive terminal unavailable', 'Terminal interactivo no disponible'),
        { error: true }
      );
      return;
    }

    if (this.terminalSessionReady) {
      this.setTerminalStatus(t('Terminal connected', 'Terminal conectado'));
    } else {
      this.setTerminalStatus(t('Connecting terminal...', 'Conectando terminal...'));
    }
    this.scheduleTerminalFit(30);
    if (this.chatOpen) {
      this.ensureTerminalSession().catch(() => {});
    }
  }

  scheduleTerminalFit(delayMs = 0) {
    if (!this.terminalView) return;
    if (this.terminalFitTimer) {
      clearTimeout(this.terminalFitTimer);
      this.terminalFitTimer = null;
    }
    this.terminalFitTimer = setTimeout(() => {
      this.terminalFitTimer = null;
      if (!this.terminalView) return;
      this.terminalView.fit();
    }, Math.max(0, delayMs));
  }

  focusTerminal() {
    if (!this.supportsInteractiveTerminalMode() || !this.chatOpen) return;
    if (window.mochiApi?.setIgnoreMouseEvents) {
      isMouseOverInteractive = true;
      window.mochiApi.setIgnoreMouseEvents(false);
    }
    window.focus();
    requestAnimationFrame(() => {
      this.terminalView?.focus();
    });
  }

  async ensureTerminalSession() {
    if (!this.supportsInteractiveTerminalMode()) return false;
    if (this.terminalSessionReady) {
      this.scheduleTerminalFit(0);
      return true;
    }
    if (this.terminalSessionStarting) {
      return this.terminalSessionStarting;
    }

    this.setTerminalStatus(t('Connecting terminal...', 'Conectando terminal...'));
    this.terminalSessionStarting = (async () => {
      let result;
      try {
        result = await window.mochiApi.terminalSessionStart({
          mochiId: this.id,
          terminalDistro: normalizeTerminalProfile(this.config.terminalDistro),
          terminalCwd: this.config.terminalCwd || ''
        });
      } catch {
        result = { ok: false, error: 'TERMINAL_SESSION_START_ERROR' };
      }

      if (!result?.ok) {
        const errorText = `${result?.error || 'TERMINAL_SESSION_START_ERROR'}`;
        this.setTerminalStatus(`Error: ${errorText}`, { error: true });
        if (this.terminalView) {
          this.terminalView.write(`\n[Error: ${errorText}]\n`);
        }
        this.terminalSessionReady = false;
        return false;
      }

      this.terminalSessionReady = true;
      this.setTerminalStatus(t('Terminal connected', 'Terminal conectado'));
      if (result.replayData && this.terminalView) {
        this.terminalView.write(result.replayData);
      }
      this.scheduleTerminalFit(0);
      return true;
    })().finally(() => {
      this.terminalSessionStarting = null;
    });

    return this.terminalSessionStarting;
  }

  async sendTerminalInput(data) {
    const payload = String(data || '');
    if (!payload) return;
    this.terminalOutputActive = true;
    this.clearTerminalIdleNotifyTimer();
    const ready = await this.ensureTerminalSession();
    if (!ready) return;
    let result;
    try {
      result = await window.mochiApi.terminalSessionWrite({
        mochiId: this.id,
        data: payload,
        terminalDistro: normalizeTerminalProfile(this.config.terminalDistro),
        terminalCwd: this.config.terminalCwd || ''
      });
    } catch {
      result = { ok: false, error: 'TERMINAL_WRITE_ERROR' };
    }
    if (!result?.ok) {
      this.setTerminalStatus(`Error: ${result?.error || 'TERMINAL_WRITE_ERROR'}`, { error: true });
    }
  }

  async sendTerminalLine(lineText) {
    const line = String(lineText || '');
    if (!line.trim()) return;
    this.pushTerminalCommandToHistory(line);
    this.terminalOutputActive = true;
    this.clearTerminalIdleNotifyTimer();
    const ready = await this.ensureTerminalSession();
    if (!ready) return;
    let result;
    try {
      result = await window.mochiApi.terminalSessionRunLine({
        mochiId: this.id,
        line,
        terminalDistro: normalizeTerminalProfile(this.config.terminalDistro),
        terminalCwd: this.config.terminalCwd || ''
      });
    } catch {
      result = { ok: false, error: 'TERMINAL_WRITE_ERROR' };
    }
    if (!result?.ok) {
      this.setTerminalStatus(`Error: ${result?.error || 'TERMINAL_WRITE_ERROR'}`, { error: true });
      if (this.terminalView) {
        this.terminalView.write(`\n[Error: ${result?.error || 'TERMINAL_WRITE_ERROR'}]\n`);
      }
    }
  }

  async handleTerminalViewportResize(cols, rows) {
    if (!this.supportsInteractiveTerminalMode()) return;
    const parsedCols = Number.parseInt(`${cols}`, 10);
    const parsedRows = Number.parseInt(`${rows}`, 10);
    if (!Number.isFinite(parsedCols) || !Number.isFinite(parsedRows)) return;
    if (parsedCols === this.terminalLastSize.cols && parsedRows === this.terminalLastSize.rows) return;
    this.terminalLastSize = { cols: parsedCols, rows: parsedRows };
    if (!this.terminalSessionReady || !window.mochiApi?.terminalSessionResize) return;
    try {
      await window.mochiApi.terminalSessionResize({
        mochiId: this.id,
        cols: parsedCols,
        rows: parsedRows
      });
    } catch {}
  }

  handleTerminalSessionData(payload) {
    if (!payload || payload.mochiId !== this.id) return;
    if (!this.terminalView) return;
    const chunk = String(payload.data || '');
    if (!chunk) return;
    this.terminalView.write(chunk);
    this.handleTerminalAttentionSignals(chunk);
    if (!this.chatOpen) {
      const now = Date.now();
      if (now - this.terminalLastClosedNotice >= 1300) {
        this.terminalLastClosedNotice = now;
        this.notifyClosedChatActivity(2400, { recall: false });
      }
    }
  }

  handleTerminalSessionExit(payload) {
    if (!payload || payload.mochiId !== this.id) return;
    this.terminalSessionReady = false;
    this.clearTerminalAttentionState();
    const parsed = Number.parseInt(`${payload.code}`, 10);
    const hasCode = Number.isFinite(parsed);
    const isError = hasCode ? parsed !== 0 : false;
    const status = hasCode
      ? t(`Terminal exited (code ${parsed})`, `Terminal finalizó (código ${parsed})`)
      : t('Terminal exited', 'Terminal finalizó');
    this.setTerminalStatus(status, { error: isError });
    if (this.terminalView) {
      this.terminalView.write(`\n[${status}]\n`);
    }
    if (this.config.terminalNotifyOnFinish !== false) {
      this.playNotificationSound(isError ? 'error' : 'success');
    }
    if (!this.chatOpen) {
      this.showNotificationBubble('🥷❗', isError ? 4400 : 3200);
      this.notifyClosedChatActivity(isError ? 3600 : 2400);
    }
  }

  handleTerminalSessionState(payload) {
    if (!payload || payload.mochiId !== this.id) return;
    const state = String(payload.state || '').toLowerCase();
    if (state === 'running') {
      this.terminalSessionReady = true;
      this.setTerminalStatus(t('Terminal connected', 'Terminal conectado'));
      this.scheduleTerminalFit(0);
      return;
    }
    if (state === 'closing') {
      this.clearTerminalAttentionState();
      this.setTerminalStatus(t('Terminal closing...', 'Cerrando terminal...'));
      return;
    }
    if (state === 'closed') {
      this.terminalSessionReady = false;
      this.clearTerminalAttentionState();
      this.setTerminalStatus(t('Terminal disconnected', 'Terminal desconectado'));
      return;
    }
    if (state === 'error') {
      this.terminalSessionReady = false;
      this.clearTerminalAttentionState();
      const errorText = payload.error ? `Error: ${payload.error}` : t('Terminal error', 'Error de terminal');
      this.setTerminalStatus(errorText, { error: true });
      if (this.terminalView) {
        this.terminalView.write(`\n[${errorText}]\n`);
      }
    }
  }

  stopTerminalSession(reason = 'TERMINAL_SESSION_STOPPED_BY_UI') {
    this.terminalSessionReady = false;
    this.terminalSessionStarting = null;
    this.clearTerminalAttentionState();
    this.setTerminalStatus(t('Terminal disconnected', 'Terminal desconectado'));
    if (window.mochiApi?.terminalSessionStop) {
      window.mochiApi.terminalSessionStop({ mochiId: this.id, reason }).catch(() => {});
    } else if (window.mochiApi?.terminalCloseSession) {
      window.mochiApi.terminalCloseSession({ mochiId: this.id }).catch(() => {});
    }
  }

  clearTerminalIdleNotifyTimer() {
    if (!this.terminalIdleNotifyTimer) return;
    clearTimeout(this.terminalIdleNotifyTimer);
    this.terminalIdleNotifyTimer = null;
  }

  clearTerminalAttentionState() {
    this.clearTerminalIdleNotifyTimer();
    this.terminalOutputActive = false;
    this.terminalLastPromptAttentionAt = 0;
  }

  maybeNotifyTerminalAttention({ kind = 'success', durationMs = 3200, cooldownMs = 2400 } = {}) {
    const now = Date.now();
    if (now - this.terminalLastAttentionAt < cooldownMs) return;
    this.terminalLastAttentionAt = now;
    if (this.config.terminalNotifyOnFinish !== false) {
      this.playNotificationSound(kind);
    }
    if (!this.chatOpen) {
      this.showNotificationBubble('🥷❗', durationMs + 800, { recall: false });
      this.notifyClosedChatActivity(durationMs, { recall: false });
    }
  }

  scheduleTerminalIdleAttention() {
    this.clearTerminalIdleNotifyTimer();
    this.terminalIdleNotifyTimer = setTimeout(() => {
      this.terminalIdleNotifyTimer = null;
      if (!this.terminalSessionReady) return;
      if (!this.terminalOutputActive) return;
      this.terminalOutputActive = false;
      this.maybeNotifyTerminalAttention({
        kind: 'success',
        durationMs: 3000,
        cooldownMs: 4200
      });
    }, 1500);
  }

  chunkLooksLikeTerminalPrompt(chunk) {
    const plain = stripTerminalControlText(chunk).replace(/\r/g, '\n');
    if (!plain.trim()) return false;
    const tail = plain.split('\n').slice(-6).join('\n');
    return TERMINAL_ATTENTION_PATTERNS.some((regex) => regex.test(tail));
  }

  handleTerminalAttentionSignals(chunk) {
    const raw = String(chunk || '');
    if (!raw) return;

    const plain = stripTerminalControlText(raw);
    if (/\S/.test(plain)) {
      this.terminalOutputActive = true;
      this.scheduleTerminalIdleAttention();
    }

    if (raw.includes('\x07')) {
      this.maybeNotifyTerminalAttention({
        kind: 'success',
        durationMs: 3200,
        cooldownMs: 1200
      });
    }

    if (this.chunkLooksLikeTerminalPrompt(raw)) {
      const now = Date.now();
      if (now - this.terminalLastPromptAttentionAt >= 1800) {
        this.terminalLastPromptAttentionAt = now;
        this.terminalOutputActive = false;
        this.clearTerminalIdleNotifyTimer();
        this.maybeNotifyTerminalAttention({
          kind: 'success',
          durationMs: 3800,
          cooldownMs: 1800
        });
      }
    }
  }

  notifyClosedChatActivity(durationMs = 3400, { recall = true } = {}) {
    if (this.state.offScreen && recall) {
      this.callBack();
    }
    if (this.chatOpen) return;
    this.closedChatNoticeUntil = Date.now() + Math.max(800, durationMs);
    if (this.closedChatNoticeTimer) {
      clearTimeout(this.closedChatNoticeTimer);
      this.closedChatNoticeTimer = null;
    }
    this.syncTypingIndicators();
    this.closedChatNoticeTimer = setTimeout(() => {
      this.closedChatNoticeTimer = null;
      this.closedChatNoticeUntil = 0;
      this.syncTypingIndicators();
    }, Math.max(900, durationMs + 50));
  }

  showNotificationBubble(text, durationMs = 4000, { recall = true } = {}) {
    if (this.state.offScreen && recall) this.callBack();
    if (!this.elements.notificationBubble) return;
    this.elements.notificationBubble.textContent = text;
    this.elements.notificationBubble.classList.add('visible');
    if (this._notificationBubbleTimer) clearTimeout(this._notificationBubbleTimer);
    this._notificationBubbleTimer = setTimeout(() => {
      this._notificationBubbleTimer = null;
      if (this.elements.notificationBubble) {
        this.elements.notificationBubble.classList.remove('visible');
      }
    }, durationMs);
  }

  clearClosedChatActivityNotice() {
    this.closedChatNoticeUntil = 0;
    if (this.closedChatNoticeTimer) {
      clearTimeout(this.closedChatNoticeTimer);
      this.closedChatNoticeTimer = null;
    }
  }

  getAiBrainLabel() {
    const mode = this.getActiveMode();
    if (mode === 'off') return t('AI Off', 'AI apagada');
    if (mode === 'agent') return `OpenClaw · ${this.getOpenClawAgentName()}`;
    if (mode === 'terminal') {
      if (this.isMacPlatform()) return `Mac Terminal · ${this.getTerminalDistroName()}`;
      if (IS_WINDOWS_PLATFORM) return `WSL Terminal · ${this.getTerminalDistroName()}`;
      return `Terminal · ${this.getTerminalDistroName()}`;
    }

    const provider = this.config.standardProvider || 'openrouter';
    if (provider === 'openrouter') {
      let model = this.config.openrouterModel || globalConfig.openrouterModel || 'google/gemini-2.0-flash-001';
      if (model === 'random') {
        model = this.config.openrouterModelResolved
          || globalConfig.openrouterModelResolved
          || 'google/gemini-2.0-flash-001';
      }
      return `OpenRouter · ${model}`;
    }
    if (provider === 'ollama') {
      const model = this.config.ollamaModel || globalConfig.ollamaModel || 'gemma3:1b';
      return `Ollama · ${model}`;
    }
    if (provider === 'openclaw') return `OpenClaw · ${this.getOpenClawAgentName()}`;

    return provider;
  }

  updateChatHeader() {
    if (this.elements.chatName) {
      this.elements.chatName.textContent = `Mochi #${this.getMochiNumber()}`;
    }
    if (this.elements.chatTitle) {
      this.elements.chatTitle.textContent = this.getAiBrainLabel();
    }
  }

  focusInput() {
    if (this.supportsInteractiveTerminalMode()) {
      this.focusTerminal();
      return;
    }
    if (!this.elements.input) return;
    if (window.mochiApi?.setIgnoreMouseEvents) {
      isMouseOverInteractive = true;
      window.mochiApi.setIgnoreMouseEvents(false);
    }
    window.focus();
    requestAnimationFrame(() => {
      this.elements.input.focus();
      const length = this.elements.input.value.length;
      this.elements.input.setSelectionRange(length, length);
    });
  }

  setupEventListeners() {
    this.elements.wrapper.addEventListener('mousedown', (e) => this.onPointerDown(e));
    this.elements.wrapper.addEventListener('dblclick', (e) => {
      e.preventDefault();
      // Double-click dismisses the mochi and cancels the chat toggle.
      this.state.suppressClickUntil = Date.now() + 420;
      if (this.chatClickTimeout) {
        clearTimeout(this.chatClickTimeout);
        this.chatClickTimeout = null;
      }
      this.dismiss();
    });
    this.elements.wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });
  }

  showContextMenu(x, y) {
    this.clearContextMenu();
    // Remove any stray context menu element (older instances from other mochis)
    const existing = document.getElementById('mochi-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'mochi-context-menu';
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:999999;background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:4px 0;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:sans-serif;font-size:13px;`;
    this.contextMenuElement = menu;
    this.contextMenuOpen = true;

    const items = this.state.offScreen
      ? [{ label: 'Call Back', action: () => this.callBack() }]
      : [{ label: 'Dismiss', action: () => this.dismiss() }];

    items.forEach(({ label, action }) => {
      const item = document.createElement('div');
      item.textContent = label;
      item.style.cssText = 'padding:6px 16px;color:#e0e0e0;cursor:pointer;';
      item.addEventListener('mouseenter', () => { item.style.background = '#2a2a4a'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearContextMenu();
        action();
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        this.clearContextMenu();
      }
    };
    this.boundContextMenuCloseListener = closeMenu;
    setTimeout(() => {
      if (this.contextMenuElement !== menu) return;
      document.addEventListener('mousedown', closeMenu, true);
    }, 0);
  }

  clearContextMenu() {
    if (this.contextMenuElement) {
      this.contextMenuElement.remove();
      this.contextMenuElement = null;
    }
    if (this.boundContextMenuCloseListener) {
      document.removeEventListener('mousedown', this.boundContextMenuCloseListener, true);
      this.boundContextMenuCloseListener = null;
    }
    this.contextMenuOpen = false;
  }

  onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    const rect = this.elements.wrapper.getBoundingClientRect();
    this.state.pointerDown = true;
    this.state.dragging = false;
    this.state.dragMoved = false;
    this.state.dragSpeed = 0;
    this.state.pressStartX = e.clientX;
    this.state.pressStartY = e.clientY;
    this.state.dragOffsetX = e.clientX - rect.left;
    this.state.dragOffsetY = e.clientY - rect.top;
    this.state.lastDragX = e.clientX;
    this.state.lastDragY = e.clientY;
    this.state.lastDragTime = Date.now();

    const moveHandler = (evt) => this.onPointerMove(evt);
    const upHandler = (evt) => this.onPointerUp(evt, moveHandler, upHandler);
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  isMacPlatform() {
    return /mac/i.test(`${navigator.platform || ''}`);
  }

  getGroundOffsetPx() {
    return this.isMacPlatform() ? MAC_GROUND_OFFSET_PX : 0;
  }

  getGroundY() {
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const size = SPRITE_SIZE * scale;
    // Use the work area bottom when available (Linux: puts mochis on top of the
    // taskbar/panel instead of behind it; falls back to window.innerHeight on Mac/Windows).
    const bottom = screenWorkAreaBottom !== null ? screenWorkAreaBottom : window.innerHeight;
    return Math.max(0, bottom - size - this.getGroundOffsetPx());
  }

  onPointerMove(e) {
    if (!this.state.pointerDown) return;

    const movedX = Math.abs(e.clientX - this.state.pressStartX);
    const movedY = Math.abs(e.clientY - this.state.pressStartY);
    const exceedsThreshold = movedX > DRAG_THRESHOLD_PX || movedY > DRAG_THRESHOLD_PX;

    if (!this.state.dragging) {
      if (!exceedsThreshold) return;
      this.state.dragging = true;
      this.state.dragMoved = true;
      this.state.vx = 0;
      this.state.vy = 0;
      this.state.currentState = MOCHI_STATES.RESISTING;
      this.state.animFrame = 0;
      this.state.behaviorTimer = 0;
      this.state.onGround = false;
    }

    const scale = SPRITE_SCALES[this.config.size] || 1;
    const size = SPRITE_SIZE * scale;
    const maxX = Math.max(0, window.innerWidth - size);
    const maxY = this.getGroundY();

    const targetX = e.clientX - this.state.dragOffsetX;
    const targetY = e.clientY - this.state.dragOffsetY;

    const nextX = Math.max(0, Math.min(targetX, maxX));
    const nextY = Math.max(0, Math.min(targetY, maxY));

    const now = Date.now();
    const dt = Math.max(1, now - this.state.lastDragTime);
    const dx = nextX - this.state.x;
    const dy = nextY - this.state.y;

    this.state.vx = (dx / dt) * 16;
    this.state.vy = (dy / dt) * 16;

    const speed = Math.sqrt(dx * dx + dy * dy) / dt;
    this.state.dragSpeed = speed;

    this.state.dragMoved = this.state.dragMoved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
    if (Math.abs(dx) > 1) {
      this.state.direction = dx > 0 ? 1 : -1;
    }

    // Switch between drag states based on speed
    if (this.state.dragMoved) {
      this.state.currentState = speed > 3 ? MOCHI_STATES.DRAGGING_HEAVY : MOCHI_STATES.DRAGGING;
    }

    this.state.x = nextX;
    this.state.y = nextY;
    this.state.lastDragX = e.clientX;
    this.state.lastDragY = e.clientY;
    this.state.lastDragTime = now;
    this.updateVisuals();
  }

  onPointerUp(e, moveHandler, upHandler) {
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);
    this.state.pointerDown = false;

    if (!this.state.dragging) {
      if (Date.now() < this.state.suppressClickUntil) {
        return;
      }
      this.chatClickTimeout = setTimeout(() => {
        this.toggleChat();
        this.chatClickTimeout = null;
      }, 300);
      return;
    }

    const groundY = this.getGroundY();

    this.state.dragging = false;

    if (this.state.y >= groundY) {
      this.state.y = groundY;
      this.state.vy = 0;
      this.state.onGround = true;
      if (Math.abs(this.state.vx) > 0.5) {
        this.state.currentState = MOCHI_STATES.WALKING;
      } else {
        this.state.currentState = MOCHI_STATES.IDLE;
        this.state.wanderUntil = 0;
      }
    } else {
      this.state.onGround = false;
      this.state.currentState = MOCHI_STATES.FALLING;
    }
  }

  toggleChat() {
    if (this.chatOpen) {
      this.closeChat();
    } else {
      this.openChat();
    }
  }

  openChat() {
    this.elements.chat.classList.add('visible');
    this.chatOpen = true;
    this.clearUnreadNotifications();
    this.clearClosedChatActivityNotice();
    this.updateChatHeader();
    this.positionChatBubble();
    this.bringToFront();
    this.applyChatTheme();
    this.syncTerminalModeUi();
    if (this.supportsInteractiveTerminalMode()) {
      this.ensureTerminalSession().catch(() => {});
      this.scheduleTerminalFit(60);
      this.syncTypingIndicators();
      this.focusTerminal();
      setTimeout(() => {
        this.scheduleTerminalFit(0);
        this.focusTerminal();
      }, 120);
      return;
    }

    this.renderMessages();
    this.syncTypingIndicators();
    this.focusInput();
    // Retry once to guarantee cursor appears even on slow focus transitions.
    setTimeout(() => this.focusInput(), 120);
    if (this.config.openMicEnabled === true && !this.isListening) {
      setTimeout(() => {
        if (!this.chatOpen || this.isListening || this.config.openMicEnabled !== true) return;
        this.startVoiceInput({ continuous: true, allowAutoRestart: true });
      }, 260);
    }
  }

  closeChat() {
    this.elements.chat.classList.remove('visible');
    this.chatOpen = false;
    this.toggleSettingsPanel(false);
    this.toggleThemePanel(false);
    this.cancelMicAutoSend();
    this.stopVoiceInput();
    this.state.chatPoseUntil = 0;
    const S = MOCHI_STATES;
    if ([S.SITTING, S.SITTING_LOOK_UP, S.DANGLING_LEGS, S.HEAD_SPIN, S.SITTING_PC, S.SITTING_PC_DANGLE].includes(this.state.currentState)) {
      this.state.currentState = this.state.onGround ? S.IDLE : S.FALLING;
      this.state.animFrame = 0;
      this.state.animTimer = 0;
      this.state.wanderUntil = 0;
    }
    this.syncTypingIndicators();
  }

  bringToFront() {
    // Bring this mochi's chat to highest z-index
    mochis.forEach(s => {
      if (s.elements.chat) {
        s.elements.chat.style.zIndex = s === this ? '3000' : '2000';
        s.elements.chat.classList.toggle('chat-front', s === this);
      }
    });
  }

  getChatDimensions() {
    if (!this.elements.chat) return { width: 280, height: 340 };
    const computed = window.getComputedStyle(this.elements.chat);
    const width = this.elements.chat.offsetWidth || parseFloat(computed.width) || parseFloat(computed.getPropertyValue('--chat-width')) || 280;
    const height = this.elements.chat.offsetHeight || parseFloat(computed.height) || parseFloat(computed.getPropertyValue('--chat-height')) || 340;
    return { width, height };
  }

  positionChatBubble() {
    if (!this.elements.chat || !this.elements.wrapper) return;

    const rect = this.elements.wrapper.getBoundingClientRect();
    const { width: chatWidth, height: chatHeight } = this.getChatDimensions();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let chatLeft = rect.left + ((rect.width - chatWidth) / 2);
    chatLeft = Math.max(CHAT_EDGE_MARGIN_PX, Math.min(chatLeft, viewportWidth - chatWidth - CHAT_EDGE_MARGIN_PX));

    const preferredAboveTop = rect.top - chatHeight - CHAT_VERTICAL_GAP_PX;
    const fallbackBelowTop = rect.bottom + CHAT_VERTICAL_GAP_PX;
    const canShowAbove = preferredAboveTop >= CHAT_EDGE_MARGIN_PX;
    const canShowBelow = fallbackBelowTop + chatHeight <= viewportHeight - CHAT_EDGE_MARGIN_PX;

    let chatTop = canShowAbove ? preferredAboveTop : fallbackBelowTop;
    if (!canShowAbove && !canShowBelow) {
      chatTop = preferredAboveTop;
    }
    chatTop = Math.max(CHAT_EDGE_MARGIN_PX, Math.min(chatTop, viewportHeight - chatHeight - CHAT_EDGE_MARGIN_PX));

    this.elements.chat.style.left = `${chatLeft}px`;
    this.elements.chat.style.top = `${chatTop}px`;
  }

  autoResizeChatInput() {
    const input = this.elements.input;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
  }

  renderPendingImagePreview() {
    this.clearPendingImagePreview();
    if (!this.pendingImage || !this.elements.chatInputArea) return;

    const preview = document.createElement('div');
    preview.className = 'mochi-chat-image-preview';

    const img = document.createElement('img');
    img.src = this.pendingImage;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'mochi-chat-image-preview-remove';
    removeBtn.textContent = '\u00D7';
    removeBtn.addEventListener('click', () => this.clearPendingImage());

    preview.appendChild(img);
    preview.appendChild(removeBtn);
    this.elements.chatInputArea.insertBefore(preview, this.elements.chatInputArea.firstChild);
    this.elements.imagePreview = preview;
  }

  clearPendingImagePreview() {
    if (this.elements.imagePreview) {
      this.elements.imagePreview.remove();
      this.elements.imagePreview = null;
    }
  }

  clearPendingImage() {
    this.pendingImage = null;
    this.clearPendingImagePreview();
  }

  async sendMessage() {
    if (!this.elements.input) return;
    const text = this.elements.input.value.trim();
    const hasImage = !!this.pendingImage;
    if (!text && !hasImage) return;
    this.elements.input.value = '';
    this.elements.input.style.height = '';
    this.micDraftText = '';
    this.resetTerminalAutocompleteState();
    if (this.supportsInteractiveTerminalMode()) {
      this.clearPendingImage();
      await this.sendTerminalLine(text);
      return;
    }
    const image = this.pendingImage;
    this.clearPendingImage();
    await this.sendPrompt(text, { image });
  }

  async sendPrompt(text, { suppressRelay = false, image = null } = {}) {
    const prompt = `${text || ''}`.trim();
    if (!prompt && !image) return;
    if (this.supportsInteractiveTerminalMode()) {
      await this.sendTerminalLine(prompt);
      return;
    }
    if (this.pendingAssistantIndex !== null) return;
    const isTerminalMode = this.isTerminalMode();
    if (isTerminalMode) {
      this.pushTerminalCommandToHistory(prompt);
    }

    if (image) {
      const contentParts = [
        { type: 'image_url', image_url: { url: image } }
      ];
      if (prompt) contentParts.push({ type: 'text', text: prompt });
      this.messages.push({ role: 'user', content: contentParts });
    } else {
      this.messages.push({ role: 'user', content: prompt });
    }
    const requestMessages = this.messages.slice();
    const assistantIndex = this.messages.push({ role: 'assistant', content: '' }) - 1;
    this.pendingAssistantIndex = assistantIndex;
    this.pendingStreamText = '';
    this.pendingStreamHadDelta = false;
    this.renderMessages();
    this.saveConversation();

    const fallbackResponses = isSpanishLocale()
      ? [
          'Hola, soy tu compañero mochi.',
          'Eso suena interesante. Cuéntame más.',
          'Te escucho.',
          'Estoy aquí para alegrarte el día.'
        ]
      : [
          "Hello! I'm your mochi companion!",
          "That's interesting! Tell me more.",
          'I am listening.',
          "I'm here to brighten your day!"
        ];

    let finalText = '';
    let errored = false;

    if (window.mochiApi) {
      try {
        let result;
        if (isTerminalMode) {
          if (!window.mochiApi.terminalExec) {
            throw new Error('TERMINAL_API_UNAVAILABLE');
          }
          result = await window.mochiApi.terminalExec({
            mochiId: this.id,
            command: prompt,
            terminalDistro: normalizeTerminalProfile(this.config.terminalDistro),
            terminalCwd: this.config.terminalCwd || '',
            terminalNotifyOnFinish: this.config.terminalNotifyOnFinish !== false
          });
        } else {
          result = await window.mochiApi.aiChatStream({
            mochiId: this.id,
            messages: requestMessages,
            personality: this.config.personality || 'cryptid'
          });
        }

        if (this.pendingAssistantIndex !== assistantIndex) {
          return;
        }

        if (result.ok) {
          if (isTerminalMode) {
            const streamed = String(this.pendingStreamText || '').replace(/\r/g, '');
            const rawText = String(result.content || streamed || '').replace(/\r/g, '').trimEnd();
            const parsedExit = Number.parseInt(`${result.exitCode}`, 10);
            const exitCode = Number.isFinite(parsedExit) ? parsedExit : 0;
            if (exitCode !== 0) {
              errored = true;
              finalText = rawText ? `${rawText}\n\n[exit code: ${exitCode}]` : `[exit code: ${exitCode}]`;
            } else {
              finalText = rawText || t('(Command finished with no output)', '(El comando terminó sin salida)');
            }
          } else {
            finalText = (result.content || this.pendingStreamText || '').trim();
          }

          if (!finalText) {
            finalText = 'Error: NO_RESPONSE';
            errored = true;
          }
          this.messages[assistantIndex] = { role: 'assistant', content: finalText };
        } else {
          errored = true;
          const errorText = `${result.error || t('Unknown error', 'Error desconocido')}`;
          if (isTerminalMode && errorText === 'TERMINAL_BUSY') {
            finalText = t('Error: Terminal is busy running another command.', 'Error: el terminal está ocupado ejecutando otro comando.');
          } else {
            finalText = `Error: ${errorText}`;
          }
          this.messages[assistantIndex] = { role: 'assistant', content: finalText };
        }
      } catch {
        if (this.pendingAssistantIndex === assistantIndex) {
          errored = true;
          finalText = isTerminalMode
            ? t('Error: Terminal service unavailable', 'Error: servicio de terminal no disponible')
            : t('AI service unavailable', 'Servicio de AI no disponible');
          this.messages[assistantIndex] = { role: 'assistant', content: finalText };
        }
      }
    } else {
      finalText = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      this.messages[assistantIndex] = { role: 'assistant', content: finalText };
    }

    const shouldAnimateFallbackTyping = (
      !isTerminalMode
      &&
      !errored
      && finalText
      && !finalText.startsWith('Error:')
      && this.pendingAssistantIndex === assistantIndex
      && !this.pendingStreamHadDelta
    );

    if (shouldAnimateFallbackTyping) {
      this.messages[assistantIndex] = { role: 'assistant', content: '' };
      this.pendingStreamText = '';
      await this.animateAssistantReveal(assistantIndex, finalText);
    }

    if (this.pendingAssistantIndex === assistantIndex) {
      this.messages[assistantIndex] = { role: 'assistant', content: finalText };
      this.pendingStreamText = finalText;
    }

    this.pendingAssistantIndex = null;
    this.pendingStreamText = '';
    this.pendingStreamHadDelta = false;
    this.renderMessages();
    this.saveConversation();

    if (!errored && finalText && !finalText.startsWith('Error:')) {
      this.lastAssistantText = finalText;
      this.playNotificationSound('success');
      if (!this.chatOpen) {
        this.incrementUnreadNotifications(1);
        this.notifyClosedChatActivity();
      }
      if (!isTerminalMode && this.config.ttsEnabled === true) {
        const openMicAfter = this.config.openMicEnabled === true;
        this.enqueueSpeech(finalText, openMicAfter ? () => {
          if (!this.chatOpen || this.isListening || !this.config.openMicEnabled) return;
          this.startVoiceInput({ continuous: true, allowAutoRestart: true });
        } : null);
      } else if (!isTerminalMode && this.config.openMicEnabled === true && this.chatOpen && !this.isListening) {
        setTimeout(() => {
          if (!this.chatOpen || this.isListening || !this.config.openMicEnabled) return;
          this.startVoiceInput({ continuous: true, allowAutoRestart: true });
        }, 280);
      }
      if (!isTerminalMode && !suppressRelay && this.config.relayEnabled === true) {
        this.dispatchRelay(finalText);
      }
    } else if (errored) {
      this.playNotificationSound('error');
      if (!this.chatOpen) {
        this.notifyClosedChatActivity(3800);
      }
    }
  }

  applyStreamDelta(delta, accumulated) {
    if (this.pendingAssistantIndex === null) return;
    const index = this.pendingAssistantIndex;
    if (!this.messages[index] || this.messages[index].role !== 'assistant') return;
    const nextText = accumulated || `${this.pendingStreamText}${delta || ''}`;
    if (!nextText) return;
    this.pendingStreamHadDelta = true;
    this.pendingStreamText = nextText;
    this.messages[index] = { role: 'assistant', content: nextText };
    this.renderMessages();
  }

  async animateAssistantReveal(assistantIndex, finalText) {
    const text = `${finalText || ''}`;
    if (!text) return;

    const length = text.length;
    const minChunk = length > 260 ? 8 : (length > 140 ? 5 : 2);
    const maxChunk = length > 260 ? 14 : (length > 140 ? 9 : 5);
    const delayMs = length > 260 ? 10 : (length > 140 ? 14 : 20);

    let cursor = 0;
    while (cursor < text.length) {
      if (this.pendingAssistantIndex !== assistantIndex) return;
      const remaining = text.length - cursor;
      const chunk = Math.min(
        remaining,
        minChunk + Math.floor(Math.random() * (maxChunk - minChunk + 1))
      );
      cursor += chunk;
      const partial = text.slice(0, cursor);
      this.pendingStreamText = partial;
      this.messages[assistantIndex] = { role: 'assistant', content: partial };
      this.renderMessages();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  async copyTextToClipboard(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      if (window.mochiApi?.clipboardWriteText) {
        window.mochiApi.clipboardWriteText(value);
        return true;
      }
    } catch (err) {}
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (err) {}
    try {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.focus();
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      return Boolean(copied);
    } catch (err) {
      return false;
    }
  }

  appendInlineMarkdown(target, rawText) {
    const text = String(rawText || '');
    let i = 0;
    while (i < text.length) {
      if (text[i] === '`') {
        const end = text.indexOf('`', i + 1);
        if (end > i + 1) {
          const codeEl = document.createElement('code');
          codeEl.className = 'mochi-chat-inline-code';
          codeEl.textContent = text.slice(i + 1, end);
          target.appendChild(codeEl);
          i = end + 1;
          continue;
        }
      }
      if (text.startsWith('**', i) || text.startsWith('__', i)) {
        const marker = text.slice(i, i + 2);
        const end = text.indexOf(marker, i + 2);
        if (end > i + 2) {
          const strongEl = document.createElement('strong');
          this.appendInlineMarkdown(strongEl, text.slice(i + 2, end));
          target.appendChild(strongEl);
          i = end + 2;
          continue;
        }
      }

      let next = text.length;
      const codeIndex = text.indexOf('`', i);
      const starIndex = text.indexOf('**', i);
      const underscoreIndex = text.indexOf('__', i);
      if (codeIndex !== -1) next = Math.min(next, codeIndex);
      if (starIndex !== -1) next = Math.min(next, starIndex);
      if (underscoreIndex !== -1) next = Math.min(next, underscoreIndex);

      if (next === i) {
        target.appendChild(document.createTextNode(text[i]));
        i += 1;
        continue;
      }

      target.appendChild(document.createTextNode(text.slice(i, next)));
      i = next;
    }
  }

  appendMarkdownPlainText(container, rawText) {
    const normalized = String(rawText || '').replace(/\r\n?/g, '\n');
    const paragraphs = normalized.split(/\n{2,}/);
    paragraphs.forEach((paragraph) => {
      if (!paragraph) return;
      const paragraphEl = document.createElement('div');
      paragraphEl.className = 'mochi-chat-md-paragraph';
      const lines = paragraph.split('\n');
      lines.forEach((line, index) => {
        this.appendInlineMarkdown(paragraphEl, line);
        if (index < lines.length - 1) {
          paragraphEl.appendChild(document.createElement('br'));
        }
      });
      container.appendChild(paragraphEl);
    });
  }

  bindMarkdownCopyButtons(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.mochi-chat-code-copy').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const codeText = this.markdownCopyTextMap.get(btn) || '';
        const copied = await this.copyTextToClipboard(codeText);
        btn.textContent = copied ? t('Copied', 'Copiado') : t('Failed', 'Error');
        setTimeout(() => {
          btn.textContent = t('Copy', 'Copiar');
        }, 1200);
      });
    });
  }

  buildMarkdownFragment(content) {
    const fragment = document.createDocumentFragment();
    const normalized = String(content || '').replace(/\r\n?/g, '\n');
    const codeBlockRegex = /```([^\n`]*)\n?([\s\S]*?)```/g;
    let cursor = 0;
    let match;

    while ((match = codeBlockRegex.exec(normalized)) !== null) {
      const before = normalized.slice(cursor, match.index);
      this.appendMarkdownPlainText(fragment, before);

      const rawLang = (match[1] || '').trim();
      const codeText = (match[2] || '').replace(/\n$/, '');
      const blockEl = document.createElement('div');
      blockEl.className = 'mochi-chat-code-block';

      const headerEl = document.createElement('div');
      headerEl.className = 'mochi-chat-code-header';

      const langEl = document.createElement('span');
      langEl.className = 'mochi-chat-code-lang';
      langEl.textContent = rawLang || t('code', 'código');

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'mochi-chat-code-copy';
      copyBtn.textContent = t('Copy', 'Copiar');
      this.markdownCopyTextMap.set(copyBtn, codeText);

      const preEl = document.createElement('pre');
      preEl.className = 'mochi-chat-code-pre';
      const codeEl = document.createElement('code');
      codeEl.className = 'mochi-chat-code';
      codeEl.textContent = codeText;
      preEl.appendChild(codeEl);

      headerEl.appendChild(langEl);
      headerEl.appendChild(copyBtn);
      blockEl.appendChild(headerEl);
      blockEl.appendChild(preEl);
      fragment.appendChild(blockEl);
      cursor = codeBlockRegex.lastIndex;
    }

    this.appendMarkdownPlainText(fragment, normalized.slice(cursor));
    return fragment;
  }

  renderMarkdownIntoMessage(msgEl, content) {
    if (!msgEl) return;
    msgEl.innerHTML = '';
    msgEl.appendChild(this.buildMarkdownFragment(content));
    this.bindMarkdownCopyButtons(msgEl);
  }

  isAssistantPending() {
    return this.pendingAssistantIndex !== null;
  }

  isAssistantWaitingForFirstToken() {
    if (this.pendingAssistantIndex === null) return false;
    const message = this.messages[this.pendingAssistantIndex];
    const content = `${message?.content || ''}`.trim();
    return content.length === 0;
  }

  createTypingDotsElement() {
    const dots = document.createElement('span');
    dots.className = 'mochi-typing-dots';
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'mochi-typing-dot';
      dot.style.animationDelay = `${i * 0.16}s`;
      dots.appendChild(dot);
    }
    return dots;
  }

  syncTypingIndicators() {
    if (this.elements.overheadTyping) {
      const showNotice = !this.chatOpen && this.closedChatNoticeUntil > Date.now();
      const showOverhead = (this.isAssistantPending() && !this.chatOpen) || showNotice;
      this.elements.overheadTyping.classList.toggle('visible', showOverhead);
    }
    this.syncNotificationBadge();
  }

  syncNotificationBadge() {
    if (!this.elements.notificationBadge) return;
    const count = Math.max(0, Number(this.unreadNotificationCount) || 0);
    const show = !this.chatOpen && count > 0;
    if (show) {
      this.elements.notificationBadge.textContent = count > 9 ? '9+' : `${count}`;
    }
    this.elements.notificationBadge.classList.toggle('visible', show);
  }

  incrementUnreadNotifications(amount = 1) {
    const safeAmount = Math.max(1, Number(amount) || 1);
    this.unreadNotificationCount = Math.max(0, this.unreadNotificationCount + safeAmount);
    this.syncNotificationBadge();
  }

  clearUnreadNotifications() {
    this.unreadNotificationCount = 0;
    this.syncNotificationBadge();
  }

  renderMessages() {
    this.elements.messagesArea.innerHTML = '';
    this.messages.forEach((msg, msgIndex) => {
      const isPendingEmptyAssistant = msgIndex === this.pendingAssistantIndex
        && msg.role === 'assistant'
        && `${msg?.content || ''}`.trim().length === 0;
      if (isPendingEmptyAssistant) return;

      const msgEl = document.createElement('div');
      msgEl.className = `mochi-chat-msg ${msg.role === 'user' ? 'user' : 'ai'}`;
      if (msg.role === 'assistant') {
        this.renderMarkdownIntoMessage(msgEl, msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'image_url' && part.image_url?.url) {
            const img = document.createElement('img');
            img.src = part.image_url.url;
            img.className = 'mochi-chat-msg-image';
            msgEl.appendChild(img);
          } else if (part.type === 'text' && part.text) {
            const span = document.createElement('span');
            span.textContent = part.text;
            msgEl.appendChild(span);
          }
        }
      } else {
        msgEl.textContent = msg.content;
      }
      this.elements.messagesArea.appendChild(msgEl);
    });

    if (this.isAssistantWaitingForFirstToken()) {
      const typingEl = document.createElement('div');
      typingEl.className = 'mochi-chat-msg ai mochi-chat-typing';
      typingEl.appendChild(this.createTypingDotsElement());
      this.elements.messagesArea.appendChild(typingEl);
    }

    this.elements.messagesArea.scrollTop = this.elements.messagesArea.scrollHeight;
    this.syncTypingIndicators();
  }

  jump() {
    if (this.state.onGround && this.state.jumpCooldown <= 0) {
      this.state.vy = PHYSICS.jumpForce;
      this.state.vx = this.state.direction * (PHYSICS.walkSpeed * 2.4);
      this.state.onGround = false;
      this.state.currentState = MOCHI_STATES.JUMPING;
      this.state.jumpCooldown = 30;
      console.log(`Mochi ${this.id} jumped!`);
    }
  }

  detectCollisionCandidate() {
    if (!this.state.onGround) return null;
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const width = SPRITE_SIZE * scale;
    const tolX = width * 0.9;
    const tolY = width * 0.45;
    const direction = this.state.direction || (this.state.vx >= 0 ? 1 : -1) || 1;
    return mochis.find((other) => {
      if (other === this || other.state.offScreen) return false;
      const dx = other.state.x - this.state.x;
      if (dx * direction <= 0) return false;
      if (Math.abs(dx) > tolX) return false;
      if (Math.abs(other.state.y - this.state.y) > tolY) return false;
      if ([MOCHI_STATES.JUMPING, MOCHI_STATES.FALLING, MOCHI_STATES.WALKING_OFF, MOCHI_STATES.WALKING_ON].includes(other.state.currentState)) return false;
      return true;
    }) || null;
  }

  jumpIfBlocked() {
    if (this.state.jumpCooldown > 0) return false;
    const target = this.detectCollisionCandidate();
    if (!target) return false;
    if (Math.random() < 0.5) {
      // Jump over
      const dx = target.state.x - this.state.x;
      this.state.direction = Math.sign(dx) || this.state.direction || 1;
      this.jump();
    } else {
      // Bump: reverse direction
      this.bumpReverse();
    }
    return true;
  }

  bumpReverse() {
    this.state.direction = -(this.state.direction || 1);
    this.state.vx = 0;
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const maxX = window.innerWidth - SPRITE_SIZE * scale;
    const dist = 80 + Math.random() * 150;
    this.state.wanderTarget = Math.max(0, Math.min(maxX,
      this.state.x + this.state.direction * dist));
    this.state.wanderUntil = Date.now() + 2000 + Math.random() * 3000;
    this.state.jumpCooldown = 30;
  }

  updateChatBehavior() {
    const S = MOCHI_STATES;
    const st = this.state;
    st.vx = 0;
    st.vy = 0;

    // Terminal mode: force sitting-with-PC animation cycle
    if (this.isTerminalMode()) {
      if (![S.SITTING_PC, S.SITTING_PC_DANGLE].includes(st.currentState)) {
        st.currentState = S.SITTING_PC;
        st.animFrame = 0;
        st.animTimer = 0;
        st.chatPoseUntil = 0;
      }

      const now = Date.now();
      if (st.chatPoseUntil > now) return;

      let nextState, duration;
      if (st.currentState === S.SITTING_PC) {
        nextState = S.SITTING_PC_DANGLE;
        duration = 1200 + Math.random() * 1600;
      } else {
        nextState = S.SITTING_PC;
        duration = 1500 + Math.random() * 2200;
      }

      st.currentState = nextState;
      st.animFrame = 0;
      st.animTimer = 0;
      st.chatPoseUntil = now + duration;
      return;
    }

    if (![S.SITTING, S.SITTING_LOOK_UP, S.DANGLING_LEGS, S.HEAD_SPIN, S.SITTING_PC, S.SITTING_PC_DANGLE].includes(st.currentState)) {
      st.currentState = S.SITTING;
      st.animFrame = 0;
      st.animTimer = 0;
      st.chatPoseUntil = 0;
    }

    const now = Date.now();
    if (st.chatPoseUntil > now) return;

    const roll = Math.random();
    let nextState = S.SITTING;
    let duration = 1500 + Math.random() * 2200;

    if (roll < 0.18) {
      nextState = S.HEAD_SPIN;
      duration = 800 + Math.random() * 900;
    } else if (roll < 0.48) {
      nextState = S.SITTING_LOOK_UP;
      duration = 900 + Math.random() * 1300;
    } else if (roll < 0.72) {
      nextState = S.DANGLING_LEGS;
      duration = 1100 + Math.random() * 1400;
    } else if (roll < 0.85) {
      nextState = S.SITTING_PC;
      duration = 1200 + Math.random() * 1600;
    }

    st.currentState = nextState;
    st.animFrame = 0;
    st.animTimer = 0;
    st.chatPoseUntil = now + duration;
  }

  hideOffScreen() {
    this.state.offScreen = true;
    this.offScreenSince = Date.now();
    this.state.vx = 0;
    if (this.chatOpen) this.closeChat();
    if (this.elements.wrapper) {
      this.elements.wrapper.style.display = 'none';
    }
  }

  callBack() {
    if (!this.state.offScreen) return;
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const size = SPRITE_SIZE * scale;
    const edge = this.state.offScreenEdge || -1;
    const entryX = edge === -1 ? -size * 2 : window.innerWidth + size * 2;
    const targetX = computeCallBackX(edge, size);
    const maxX = Math.max(0, window.innerWidth - size);
    const clampedTarget = Math.max(0, Math.min(maxX, targetX));

    this.state.x = entryX;
    this.state.y = this.getGroundY();
    this.state.onGround = true;
    this.state.offScreen = false;
    this.offScreenSince = 0;
    this.state.direction = edge === -1 ? 1 : -1;
    this.state.vx = 0;
    this.state.wanderTarget = clampedTarget;
    this.state.wanderUntil = Date.now() + 4000 + Math.random() * 2000;
    this.setBehavior(MOCHI_STATES.WALKING_ON, 400);
    if (this.elements.wrapper) {
      this.elements.wrapper.style.display = 'flex';
    }
  }

  isOffScreen() {
    return this.state.offScreen;
  }

  dismiss() {
    if (this.state.offScreen) return;
    if (this.chatOpen) this.closeChat();
    const S = MOCHI_STATES;
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const size = SPRITE_SIZE * scale;
    const maxX = window.innerWidth - size;
    const st = this.state;
    // Walk toward nearest edge
    const edge = st.x < maxX / 2 ? -1 : 1;
    st.offScreenEdge = edge;
    st.direction = edge;
    st.wanderTarget = edge === -1 ? -size * 2 : maxX + size * 3;
    st.wanderUntil = Date.now() + 15000;
    this.setBehavior(S.WALKING_OFF, 600);
  }

  update() {
    if (!this.config.enabled) return;
    if (this.state.offScreen) return;
    if (this.contextMenuOpen) {
      this.holdPositionForContextMenu();
      return;
    }

    if (this.state.pointerDown && !this.state.dragging) {
      this.updateVisuals();
      return;
    }

    if (this.chatOpen && !this.state.dragging && this.state.onGround) {
      this.updateChatBehavior();
      this.updateAnimation();
      this.updateVisuals();
      return;
    }

    if (!this.state.dragging) {
      this.updatePhysics();
      this.updateBehavior();
      this.updateAnimation();
    } else {
      this.updateSprite();
    }
    this.updateVisuals();
  }

  holdPositionForContextMenu() {
    const S = MOCHI_STATES;
    this.state.vx = 0;
    this.state.vy = 0;
    if (this.state.onGround && this.state.currentState !== S.IDLE) {
      this.state.currentState = S.IDLE;
      this.state.animFrame = 0;
      this.state.animTimer = 0;
    }
    this.updateAnimation();
    this.updateVisuals();
  }

  updatePhysics() {
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const size = SPRITE_SIZE * scale;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const st = this.state;
    const S = MOCHI_STATES;

    // States that defy gravity (attached to surfaces)
    const attachedStates = [S.CLIMBING_WALL, S.CLIMBING_CEILING, S.GRABBING_WALL, S.GRABBING_CEILING];
    // Edge-sitting states also defy gravity when on the ceiling
    const edgeSitStates = [S.SITTING_EDGE, S.DANGLING_LEGS, S.SITTING_PC, S.SITTING_PC_DANGLE];
    const isAttached = attachedStates.includes(st.currentState) || (st.onCeiling && edgeSitStates.includes(st.currentState));

    // Apply gravity when not on ground and not attached to a surface
    if (!st.onGround && !isAttached) {
      st.vy = Math.min(st.vy + PHYSICS.gravity, PHYSICS.fallTerminalVelocity);
      if (st.currentState === S.JUMPING && st.vy > 0) {
        st.currentState = S.FALLING;
      }
    }

    // Wall climbing: move upward
    if (st.currentState === S.CLIMBING_WALL) {
      st.vy = PHYSICS.climbSpeed;
      st.vx = 0;
    }

    // Ceiling climbing: move sideways
    if (st.currentState === S.CLIMBING_CEILING) {
      st.vx = st.direction * PHYSICS.walkSpeed;
      st.vy = 0;
    }

    st.x += st.vx;
    st.y += st.vy;

    // Ground collision
    const groundY = this.getGroundY();
    if (st.y >= groundY) {
      st.y = groundY;
      st.vy = 0;
      st.onGround = true;

      if (st.currentState === S.JUMPING || st.currentState === S.FALLING) {
        st.currentState = S.LANDING;
        st.animFrame = 0;
      }
    } else {
      st.onGround = false;
    }

    // Ceiling collision
    if (st.y <= 0) {
      st.y = 0;
      st.vy = 0;
      st.onCeiling = true;
      // Transition from climbing wall to grabbing ceiling
      if (st.currentState === S.CLIMBING_WALL) {
        st.currentState = S.GRABBING_CEILING;
        st.behaviorTimer = 0;
        st.behaviorDuration = 40 + Math.random() * 60;
      }
    } else {
      st.onCeiling = false;
    }

    // Wall collisions (skip when walking off/on screen)
    const isWalkingOffOn = st.currentState === S.WALKING_OFF || st.currentState === S.WALKING_ON;
    if (!isWalkingOffOn) {
      if (st.x <= 0) {
        st.x = 0;
        if (!isAttached) {
          st.vx = Math.abs(st.vx);
          st.direction = 1;
        }
        st.onWall = true;
      } else if (st.x >= screenWidth - size) {
        st.x = screenWidth - size;
        if (!isAttached) {
          st.vx = -Math.abs(st.vx);
          st.direction = -1;
        }
        st.onWall = true;
      } else {
        st.onWall = false;
      }
    } else {
      st.onWall = false;
    }

    if (st.jumpCooldown > 0) st.jumpCooldown--;

    // Friction for walking/running
    if (st.currentState === S.WALKING || st.currentState === S.RUNNING) {
      st.vx *= 0.92;
    }
  }

  setBehavior(state, duration) {
    this.state.currentState = state;
    this.state.behaviorTimer = 0;
    this.state.behaviorDuration = duration || (60 + Math.random() * 120);
    this.state.animFrame = 0;
    this.state.animTimer = 0;
  }

  updateBehavior() {
    const scale = SPRITE_SCALES[this.config.size] || 1;
    const size = SPRITE_SIZE * scale;
    const maxX = Math.max(0, window.innerWidth - size);
    const now = Date.now();
    const st = this.state;
    const S = MOCHI_STATES;

    st.behaviorTimer++;

    // --- Floor behaviors (idle/walking/running) ---
    if (st.currentState === S.IDLE || st.currentState === S.WALKING || st.currentState === S.RUNNING) {
      // Wandering
      if (now > st.wanderUntil) {
        st.wanderTarget = Math.random() * maxX;
        st.wanderUntil = now + 2000 + Math.random() * 4000;
      }

      const dx = st.wanderTarget - st.x;
      if (Math.abs(dx) > 5) {
        const speed = st.currentState === S.RUNNING ? PHYSICS.runSpeed : PHYSICS.walkSpeed;
        st.vx = Math.sign(dx) * speed;
        st.direction = Math.sign(dx);
        if (this.jumpIfBlocked()) {
          return;
        }
        if (st.currentState !== S.RUNNING) st.currentState = S.WALKING;
      } else {
        st.vx = 0;
        if (st.currentState === S.WALKING || st.currentState === S.RUNNING) {
          st.currentState = S.IDLE;
        }
      }

      // Direct wall grab when walking into screen edges (like chrome extension)
      if (st.onWall && st.onGround && (st.currentState === S.WALKING || st.currentState === S.RUNNING)) {
        if (Math.random() < 0.55) {
          this.setBehavior(S.GRABBING_WALL, 30 + Math.random() * 40);
          st.climbSide = st.x <= 0 ? -1 : 1;
          st.vx = 0;
          return;
        }
      }

      // Weighted random action selection (mochi-ee style)
      if (Math.random() < 0.012) {
        const choices = [];

        // Floor actions
        if (st.onGround) {
          choices.push({ weight: 100, action: 'walk' });
          choices.push({ weight: 50, action: 'run' });
          choices.push({ weight: 100, action: 'sit' });
          choices.push({ weight: 30, action: 'crawl' });
          if (st.jumpCooldown <= 0) {
            choices.push({ weight: 50, action: 'jump' });
          }
        }

        // Wall actions (at screen edges)
        if (st.onWall && st.onGround) {
          choices.push({ weight: 80, action: 'grabWall' });
        }

        // Edge sitting (near screen edge on ground)
        if (st.onGround && (st.x <= 5 || st.x >= maxX - 5)) {
          choices.push({ weight: 60, action: 'sitEdge' });
        }

        // Walk off-screen (only when chat is closed)
        if (st.onGround && !this.chatOpen) {
          choices.push({ weight: 8, action: 'walkOff' });
        }

        if (choices.length > 0) {
          const action = weightedRandom(choices);
          switch (action) {
            case 'walk':
              st.wanderTarget = Math.random() * maxX;
              st.wanderUntil = now + 3000 + Math.random() * 4000;
              break;
            case 'run':
              st.currentState = S.RUNNING;
              st.wanderTarget = Math.random() * maxX;
              st.wanderUntil = now + 1500 + Math.random() * 2000;
              break;
            case 'jump':
              this.jump();
              break;
            case 'sit':
              this.setBehavior(S.SITTING, 80 + Math.random() * 120);
              break;
            case 'crawl':
              this.setBehavior(S.CRAWLING, 60 + Math.random() * 80);
              st.wanderTarget = Math.random() * maxX;
              break;
            case 'grabWall':
              this.setBehavior(S.GRABBING_WALL, 30 + Math.random() * 40);
              st.climbSide = st.x <= 0 ? -1 : 1;
              st.vx = 0;
              break;
            case 'sitEdge':
              this.setBehavior(S.SITTING_EDGE, 80 + Math.random() * 100);
              break;
            case 'walkOff': {
              const edge = Math.random() < 0.5 ? -1 : 1;
              st.offScreenEdge = edge;
              st.direction = edge;
              st.wanderTarget = edge === -1 ? -size * 2 : maxX + size * 3;
              st.wanderUntil = now + 15000;
              this.setBehavior(S.WALKING_OFF, 600);
              break;
            }
          }
        }
      }
    }

    // --- Crawling along floor ---
    if (st.currentState === S.CRAWLING) {
      const dx = st.wanderTarget - st.x;
      if (Math.abs(dx) > 5) {
        st.vx = Math.sign(dx) * PHYSICS.crawlSpeed;
        st.direction = Math.sign(dx);
      } else {
        st.vx = 0;
      }
      if (st.behaviorTimer >= st.behaviorDuration) {
        // After crawling, either lie down or stand up
        const next = Math.random() < 0.4 ? S.LYING_DOWN : S.IDLE;
        this.setBehavior(next, next === S.LYING_DOWN ? 80 + Math.random() * 100 : 0);
        st.wanderUntil = 0;
      }
    }

    // --- Lying down ---
    if (st.currentState === S.LYING_DOWN) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        // Get up: sit first or stand
        const next = Math.random() < 0.5 ? S.SITTING : S.IDLE;
        this.setBehavior(next, next === S.SITTING ? 60 + Math.random() * 80 : 0);
        st.wanderUntil = 0;
      }
    }

    // --- Sitting behaviors ---
    if (st.currentState === S.SITTING) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        // After sitting, maybe look up, spin head, or stand
        const choices = [
          { weight: 35, action: S.IDLE },
          { weight: 25, action: S.SITTING_LOOK_UP },
          { weight: 15, action: S.HEAD_SPIN },
          { weight: 15, action: S.LYING_DOWN },
          { weight: 10, action: S.SITTING_PC }
        ];
        const next = weightedRandom(choices);
        this.setBehavior(next, 60 + Math.random() * 80);
        if (next === S.IDLE) st.wanderUntil = 0;
      }
    }

    if (st.currentState === S.SITTING_LOOK_UP) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        const next = Math.random() < 0.3 ? S.HEAD_SPIN : S.IDLE;
        this.setBehavior(next, next === S.HEAD_SPIN ? 48 : 0);
        st.wanderUntil = 0;
      }
    }

    // --- Edge sitting → dangling legs / sitting with PC ---
    if (st.currentState === S.SITTING_EDGE) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        const roll = Math.random();
        let next;
        if (roll < 0.4) {
          next = S.DANGLING_LEGS;
          this.setBehavior(next, 80 + Math.random() * 100);
        } else if (roll < 0.7) {
          next = S.SITTING_PC;
          this.setBehavior(next, 100 + Math.random() * 120);
        } else {
          // Fall off if on ceiling, otherwise go idle
          if (!st.onGround) {
            st.currentState = S.FALLING;
            st.vx = 0;
          } else {
            next = S.IDLE;
            this.setBehavior(next, 0);
            st.wanderUntil = 0;
          }
        }
      }
    }

    if (st.currentState === S.DANGLING_LEGS) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        if (!st.onGround) {
          st.currentState = S.FALLING;
          st.vx = 0;
        } else {
          st.currentState = S.IDLE;
          st.wanderUntil = 0;
        }
      }
    }

    // --- Sitting with PC → dangle or idle/fall ---
    if (st.currentState === S.SITTING_PC) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        if (Math.random() < 0.6) {
          this.setBehavior(S.SITTING_PC_DANGLE, 80 + Math.random() * 100);
        } else if (!st.onGround) {
          st.currentState = S.FALLING;
          st.vx = 0;
        } else {
          this.setBehavior(S.IDLE, 0);
          st.wanderUntil = 0;
        }
      }
    }

    if (st.currentState === S.SITTING_PC_DANGLE) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        if (!st.onGround) {
          st.currentState = S.FALLING;
          st.vx = 0;
        } else {
          st.currentState = S.IDLE;
          st.wanderUntil = 0;
        }
      }
    }

    // --- Head spin (timed animation) ---
    if (st.currentState === S.HEAD_SPIN) {
      st.vx = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        st.currentState = S.IDLE;
        st.wanderUntil = 0;
      }
    }

    // --- Wall grab → climb transition ---
    if (st.currentState === S.GRABBING_WALL) {
      st.vx = 0;
      st.vy = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        // Start climbing or let go (70% climb)
        if (Math.random() < 0.7) {
          this.setBehavior(S.CLIMBING_WALL, 400 + Math.random() * 600);
        } else {
          st.currentState = S.FALLING;
        }
      }
    }

    // --- Wall climbing ---
    if (st.currentState === S.CLIMBING_WALL) {
      // Random chance to fall off after some time
      if (st.behaviorTimer > 60 && Math.random() < 0.01) {
        st.currentState = S.FALLING;
        st.vy = 0;
        st.vx = 0;
      } else if (st.behaviorTimer >= st.behaviorDuration || !st.onWall) {
        if (st.onCeiling) {
          this.setBehavior(S.GRABBING_CEILING, 30 + Math.random() * 40);
        } else {
          st.currentState = S.FALLING;
          st.vy = 0;
        }
      }
    }

    // --- Ceiling grab → climb transition ---
    if (st.currentState === S.GRABBING_CEILING) {
      st.vx = 0;
      st.vy = 0;
      if (st.behaviorTimer >= st.behaviorDuration) {
        if (Math.random() < 0.7) {
          this.setBehavior(S.CLIMBING_CEILING, 200 + Math.random() * 300);
        } else {
          st.currentState = S.FALLING;
        }
      }
    }

    // --- Ceiling climbing ---
    if (st.currentState === S.CLIMBING_CEILING) {
      // Random chance to sit on edge or fall
      if (st.behaviorTimer > 75 && Math.random() < 0.01) {
        this.setBehavior(S.SITTING_EDGE, 80 + Math.random() * 100);
      } else if (st.behaviorTimer > 75 && Math.random() < 0.015) {
        st.currentState = S.FALLING;
        st.vx = 0;
      } else if (st.behaviorTimer >= st.behaviorDuration) {
        st.currentState = S.FALLING;
        st.vx = 0;
      }
    }

    // --- Walking off-screen ---
    if (st.currentState === S.WALKING_OFF) {
      const dx = st.wanderTarget - st.x;
      if (Math.abs(dx) > 5) {
        st.vx = Math.sign(dx) * PHYSICS.walkSpeed;
        st.direction = Math.sign(dx);
      } else {
        this.hideOffScreen();
      }
    }

    // --- Walking on-screen ---
    if (st.currentState === S.WALKING_ON) {
      const dx = st.wanderTarget - st.x;
      if (Math.abs(dx) > 5) {
        st.vx = Math.sign(dx) * PHYSICS.walkSpeed;
        st.direction = Math.sign(dx);
      } else {
        st.vx = 0;
        this.setBehavior(S.IDLE, 0);
        st.wanderUntil = 0;
      }
    }
  }

  updateAnimation() {
    const S = MOCHI_STATES;
    const frames = ANIMATION_FRAMES[this.state.currentState] || ANIMATION_FRAMES.idle;
    this.state.animTimer++;

    // Frame durations tuned per state (inspired by mochi-ee action durations)
    const durations = {
      [S.IDLE]: 10,
      [S.WALKING]: 8,
      [S.RUNNING]: 4,
      [S.CRAWLING]: 12,
      [S.CLIMBING_WALL]: 12,
      [S.CLIMBING_CEILING]: 12,
      [S.GRABBING_WALL]: 20,
      [S.GRABBING_CEILING]: 20,
      [S.HEAD_SPIN]: 5,
      [S.LANDING]: 8,
      [S.DANGLING_LEGS]: 15,
      [S.RESISTING]: 8,
      [S.SITTING]: 10,
      [S.SITTING_LOOK_UP]: 10,
      [S.SITTING_EDGE]: 10,
      [S.LYING_DOWN]: 10,
      [S.SITTING_PC]: 10,
      [S.SITTING_PC_DANGLE]: 15,
      [S.WALKING_OFF]: 8,
      [S.WALKING_ON]: 8
    };
    const frameDuration = durations[this.state.currentState] || 10;

    if (this.state.animTimer >= frameDuration) {
      this.state.animTimer = 0;

      if (this.state.currentState === S.LANDING) {
        this.state.animFrame++;
        if (this.state.animFrame >= 2) {
          this.state.currentState = S.IDLE;
          this.state.animFrame = 0;
          this.state.wanderUntil = 0;
        }
      } else if (this.state.currentState === S.RESISTING) {
        // Play resist animation then switch to drag
        this.state.animFrame++;
        if (this.state.animFrame >= 2) {
          if (this.state.dragging) {
            this.state.currentState = S.DRAGGING;
          } else {
            this.state.currentState = this.state.onGround ? S.IDLE : S.FALLING;
            this.state.wanderUntil = 0;
          }
          this.state.animFrame = 0;
        }
      } else {
        this.state.animFrame = (this.state.animFrame + 1) % frames.length;
      }

      this.updateSprite();
    }
  }

  updateSprite() {
    const S = MOCHI_STATES;
    const charPath = this.getCharacterPath();

    if (this.state.dragging) {
      let dragFrame;
      if (this.state.currentState === S.RESISTING) {
        const frames = ANIMATION_FRAMES.resisting;
        dragFrame = frames[this.state.animFrame % frames.length];
      } else if (this.state.currentState === S.DRAGGING_HEAVY) {
        dragFrame = this.state.direction >= 0 ? 'dragged-tilt-right-heavy.png' : 'dragged-tilt-left-heavy.png';
      } else {
        dragFrame = this.state.direction >= 0 ? 'dragged-tilt-right-light.png' : 'dragged-tilt-left-light.png';
      }
      this.elements.sprite.src = charPath + dragFrame;
      return;
    }

    const frames = ANIMATION_FRAMES[this.state.currentState] || ANIMATION_FRAMES.idle;
    const frameFile = frames[this.state.animFrame % frames.length];
    if (frameFile) {
      this.elements.sprite.src = charPath + frameFile;
    }
  }

  updateVisuals() {
    if (!this.elements.wrapper) return;

    this.elements.wrapper.style.left = `${this.state.x}px`;
    this.elements.wrapper.style.top = `${this.state.y}px`;

    const S = MOCHI_STATES;
    const st = this.state;
    const isWallClimbing = st.currentState === S.CLIMBING_WALL || st.currentState === S.GRABBING_WALL;
    const isCeilingState = st.currentState === S.CLIMBING_CEILING || st.currentState === S.GRABBING_CEILING
      || (st.onCeiling && (st.currentState === S.SITTING_EDGE || st.currentState === S.DANGLING_LEGS
        || st.currentState === S.SITTING_PC || st.currentState === S.SITTING_PC_DANGLE));

    if (isWallClimbing) {
      if (st.climbSide === -1) {
        this.elements.sprite.style.transform = 'rotate(90deg)';
      } else {
        this.elements.sprite.style.transform = 'rotate(-90deg) scaleX(-1)';
      }
    } else if (isCeilingState) {
      const flipX = st.direction >= 0 ? ' scaleX(-1)' : '';
      this.elements.sprite.style.transform = `scaleY(-1)${flipX}`;
    } else {
      this.elements.sprite.style.transform = `scaleX(${-st.direction})`;
    }

    this.elements.wrapper.style.cursor = this.state.dragging ? 'grabbing' : 'pointer';

    if (this.chatOpen) this.positionChatBubble();
  }

  hasOpenRouterCredential(cfg = this.config) {
    return Boolean((cfg?.openrouterApiKey || '').trim());
  }

  hasOpenClawCredential(cfg = this.config) {
    return Boolean((cfg?.openclawGatewayToken || '').trim());
  }

  hasAnyApiCredential(cfg = this.config) {
    return this.hasOpenRouterCredential(cfg) || this.hasOpenClawCredential(cfg);
  }

  announceReadyAfterApiKeyLoad() {
    if (this.config.enabled === false) return;
    const message = t(
      'All set! I have your API key and I am ready to chat with you.',
      '¡Listo! Ya tengo tu API key y estoy listo para conversar contigo.'
    );
    if (!this.chatOpen) {
      this.openChat();
    }
    this.messages.push({ role: 'assistant', content: message });
    this.lastAssistantText = message;
    this.renderMessages();
    this.saveConversation();
    this.playNotificationSound('success');
  }

  setConfig(newConfig) {
    const prevOpenMic = this.config.openMicEnabled === true;
    const prevTtsEnabled = this.config.ttsEnabled === true;
    const prevMode = this.getActiveMode();
    const prevHadApiCredential = this.hasAnyApiCredential(this.config);
    this.config = { ...this.config, ...newConfig };
    this.config.terminalDistro = normalizeTerminalProfile(this.config.terminalDistro);
    const nextHasApiCredential = this.hasAnyApiCredential(this.config);
    const nextMode = this.getActiveMode();
    this.normalizeChatThemeConfig();
    const scale = SPRITE_SCALES[this.config.size] || 1;
    this.elements.sprite.style.width = `${SPRITE_SIZE * scale}px`;
    this.elements.sprite.style.height = `${SPRITE_SIZE * scale}px`;
    if (this.elements.wrapper) {
      this.elements.wrapper.style.display = this.config.enabled !== false ? 'flex' : 'none';
    }
    if (this.config.enabled === false && this.chatOpen) {
      this.closeChat();
    }

    if (prevTtsEnabled && this.config.ttsEnabled !== true) {
      this.stopTts();
    }
    if (prevOpenMic && this.config.openMicEnabled !== true) {
      this.stopVoiceInput();
      this.cancelMicAutoSend();
    }
    if (!prevOpenMic && this.config.openMicEnabled === true && this.chatOpen && !this.isListening) {
      this.startVoiceInput({ continuous: true, allowAutoRestart: true });
    }
    if (prevMode === 'terminal' && nextMode !== 'terminal') {
      this.stopTerminalSession('TERMINAL_SESSION_REPLACED_BY_MODE');
    }

    this.updateChatHeader();
    this.applyChatTheme();
    this.syncSettingsInputs();
    this.applyLocalizedText();
    this.syncChatControlButtons();
    this.syncTerminalModeUi();
    if (!prevHadApiCredential && nextHasApiCredential) {
      this.announceReadyAfterApiKeyLoad();
    }
  }

  onLanguageChanged() {
    this.applyLocalizedText();
    this.syncSettingsInputs();
    this.syncChatControlButtons();
    this.syncTerminalModeUi();
    if (this.chatOpen && !this.supportsInteractiveTerminalMode()) {
      this.renderMessages();
    }
  }

  applyChatTheme() {
    if (!this.elements.chat) return;
    this.normalizeChatThemeConfig();
    const bubbleStyle = this.config.chatBubbleStyle || 'glass';
    const themeColor = this.normalizeColor(this.config.chatThemeColor, '#3b1a77');
    const bgColor = this.normalizeColor(this.config.chatBgColor, '#f0e8ff');
    const isTerminalMode = this.isTerminalMode();
    const explicitWidthPx =
      this.config.chatWidthPx != null && Number.isFinite(Number(this.config.chatWidthPx))
        ? Number(this.config.chatWidthPx)
        : null;
    const explicitHeightPx =
      this.config.chatHeightPx != null && Number.isFinite(Number(this.config.chatHeightPx))
        ? Number(this.config.chatHeightPx)
        : null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxChatWidth = Math.max(CHAT_MIN_WIDTH, viewportWidth - (CHAT_EDGE_MARGIN_PX * 2));
    const maxChatHeight = Math.max(CHAT_MIN_HEIGHT, viewportHeight - (CHAT_EDGE_MARGIN_PX * 2));
    const terminalWidthSetting = Math.round(viewportWidth / 2);
    const widthMapSetting = CHAT_WIDTH_MAP[this.config.chatWidth || 'medium'] || CHAT_WIDTH_MAP.medium;
    const widthSetting = isTerminalMode
      ? Math.max(CHAT_MIN_WIDTH, Math.min(maxChatWidth, terminalWidthSetting))
      : widthMapSetting;
    const baseWidth = explicitWidthPx ?? widthSetting;
    const baseHeight = explicitHeightPx ?? DEFAULT_CHAT_HEIGHT;
    const applyTerminalWidthMultiplier = false;
    const applyTerminalHeightMultiplier = isTerminalMode && explicitHeightPx === null;
    const targetWidth = applyTerminalWidthMultiplier
      ? Math.round(baseWidth * TERMINAL_CHAT_WIDTH_MULTIPLIER)
      : baseWidth;
    const targetHeight = applyTerminalHeightMultiplier
      ? Math.round(baseHeight * TERMINAL_CHAT_HEIGHT_MULTIPLIER)
      : baseHeight;
    const widthPx = clamp(
      targetWidth,
      CHAT_MIN_WIDTH,
      maxChatWidth
    );
    const heightPx = clamp(
      targetHeight,
      CHAT_MIN_HEIGHT,
      Math.max(CHAT_MAX_HEIGHT, maxChatHeight)
    );
    const fontSize = FONT_SIZE_MAP[this.config.chatFontSize || 'medium'] || FONT_SIZE_MAP.medium;

    this.elements.chat.classList.remove('chat-style-glass', 'chat-style-solid', 'chat-style-dark');
    this.elements.chat.classList.add(`chat-style-${bubbleStyle}`);
    this.elements.chat.style.setProperty('--chat-theme', themeColor);
    this.elements.chat.style.setProperty('--chat-bg', bgColor);
    this.elements.chat.style.setProperty('--chat-font-size', fontSize);
    this.elements.chat.style.setProperty('--chat-width', `${Math.round(widthPx)}px`);
    this.elements.chat.style.setProperty('--chat-height', `${Math.round(heightPx)}px`);
    if (this.elements.wrapper) {
      this.elements.wrapper.style.setProperty('--chat-theme', themeColor);
      this.elements.wrapper.style.setProperty('--chat-bg', bgColor);
    }

    const rgb = hexToRgb(themeColor);
    if (rgb) {
      this.elements.chat.style.setProperty('--chat-theme-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }
    this.applyUiTextScale();
    this.syncNotificationBadge();
    this.updateChatHeader();
    if (this.supportsInteractiveTerminalMode()) {
      this.scheduleTerminalFit(0);
    }
  }

  applyUiTextScale() {
    if (!this.elements.chat) return;
    const scale = getGlobalUiTextScale();
    this.elements.chat.style.zoom = String(scale);
    this.elements.chat.style.transformOrigin = 'top left';
    if (this.elements.uiTextScaleSelect) {
      this.elements.uiTextScaleSelect.value = String(scale);
    }
  }

  setGlobalUiTextScale(nextScale, persist = true) {
    const scale = normalizeUiTextScale(nextScale);
    globalConfig = { ...globalConfig, uiTextScale: scale };
    mochis.forEach((mochi) => mochi.applyUiTextScale());
    if (persist && window.mochiApi?.updateConfig) {
      window.mochiApi.updateConfig({ uiTextScale: scale });
    }
  }

  handleUiTextScaleShortcut(event) {
    const action = getUiTextScaleShortcutAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.setGlobalUiTextScale(stepUiTextScale(getGlobalUiTextScale(), action), true);
  }

  remove() {
    document.removeEventListener('mochi-relay', this.boundRelayHandler);
    document.removeEventListener('mochi-stop-mic', this.boundStopMicHandler);
    this.clearClosedChatActivityNotice();
    this.clearMicRestartTimer();
    if (this.terminalFitTimer) {
      clearTimeout(this.terminalFitTimer);
      this.terminalFitTimer = null;
    }
    this.cancelMicAutoSend();
    this.stopVoiceInput();
    this.stopTts();
    this.stopTerminalSession('TERMINAL_SESSION_REMOVED');
    if (this.terminalView && typeof this.terminalView.dispose === 'function') {
      this.terminalView.dispose();
      this.terminalView = null;
    }
    if (this.elements.wrapper) this.elements.wrapper.remove();
    if (this.elements.chat) this.elements.chat.remove();
  }
}

function toPersistedMochiConfig(mochi, index) {
  const cfg = mochi.config || {};
  return {
    id: `mochi-${index + 1}`,
    character: cfg.character || 'mochi',
    size: cfg.size || 'medium',
    personality: cfg.personality || 'cryptid',
    chatTheme: cfg.chatTheme || 'pastel',
    chatThemeColor: cfg.chatThemeColor || '#3b1a77',
    chatBgColor: cfg.chatBgColor || '#f0e8ff',
    chatBubbleStyle: cfg.chatBubbleStyle || 'glass',
    chatThemePreset: cfg.chatThemePreset || 'custom',
    chatFontSize: cfg.chatFontSize || 'medium',
    chatWidth: cfg.chatWidth || 'medium',
    chatWidthPx: typeof cfg.chatWidthPx === 'number' ? cfg.chatWidthPx : null,
    chatHeightPx: typeof cfg.chatHeightPx === 'number' ? cfg.chatHeightPx : DEFAULT_CHAT_HEIGHT,
    ttsEnabled: cfg.ttsEnabled === true,
    ttsVoiceProfile: cfg.ttsVoiceProfile || 'random',
    ttsVoiceId: cfg.ttsVoiceId || '',
    openMicEnabled: cfg.openMicEnabled === true,
    sttProvider: cfg.sttProvider || 'groq',
    sttApiKey: cfg.sttApiKey || '',
    relayEnabled: cfg.relayEnabled === true,
    soundEnabled: cfg.soundEnabled !== false,
    soundVolume: typeof cfg.soundVolume === 'number' ? cfg.soundVolume : 0.7,
    enabled: cfg.enabled !== false,
    mode: cfg.mode || 'standard',
    standardProvider: cfg.standardProvider || 'openrouter',
    openrouterApiKey: cfg.openrouterApiKey || '',
    openrouterModel: cfg.openrouterModel || 'random',
    openrouterModelResolved: cfg.openrouterModelResolved || '',
    ollamaUrl: cfg.ollamaUrl || 'http://127.0.0.1:11434',
    ollamaModel: cfg.ollamaModel || 'gemma3:1b',
    openclawGatewayUrl: cfg.openclawGatewayUrl || 'ws://127.0.0.1:18789',
    openclawGatewayToken: cfg.openclawGatewayToken || '',
    openclawAgentName: cfg.openclawAgentName || `desktop-mochi-${index + 1}`,
    terminalDistro: normalizeTerminalProfile(cfg.terminalDistro),
    terminalCwd: cfg.terminalCwd || '',
    terminalNotifyOnFinish: cfg.terminalNotifyOnFinish !== false
  };
}

function persistMochiConfig(mochiId, nextConfig) {
  const target = mochis.find((item) => item.id === mochiId);
  if (target && nextConfig && typeof nextConfig === 'object') {
    target.config = { ...target.config, ...nextConfig };
  }
  if (!window.mochiApi?.updateConfig) return;
  const list = mochis.map((item, index) => toPersistedMochiConfig(item, index));
  window.mochiApi.updateConfig({
    mochiCount: list.length,
    mochis: list
  });
}

function createMochi(id, config = {}) {
  const mochi = new Mochi(id, config);
  mochis.push(mochi);
  return mochi;
}

function removeMochi(mochi) {
  mochi.remove();
  const index = mochis.indexOf(mochi);
  if (index > -1) mochis.splice(index, 1);
}

function getConfigForIndex(index) {
  const list = Array.isArray(globalConfig.mochis) ? globalConfig.mochis : [];
  if (list[index]) {
    return { ...list[index] };
  }
  return {
    character: globalConfig[`mochi${index + 1}_character`] || CHARACTERS[index % CHARACTERS.length].id,
    size: globalConfig[`mochi${index + 1}_size`] || 'medium',
    personality: globalConfig[`mochi${index + 1}_personality`] || 'cryptid',
    chatTheme: globalConfig[`mochi${index + 1}_chatTheme`] || 'pastel',
    chatThemeColor: globalConfig[`mochi${index + 1}_chatThemeColor`] || '#3b1a77',
    chatBgColor: globalConfig[`mochi${index + 1}_chatBgColor`] || '#f0e8ff',
    chatBubbleStyle: globalConfig[`mochi${index + 1}_chatBubbleStyle`] || 'glass',
    chatThemePreset: globalConfig[`mochi${index + 1}_chatThemePreset`] || 'pastel',
    chatFontSize: globalConfig[`mochi${index + 1}_chatFontSize`] || 'medium',
    chatWidth: globalConfig[`mochi${index + 1}_chatWidth`] || 'medium',
    chatWidthPx: globalConfig[`mochi${index + 1}_chatWidthPx`] || null,
    chatHeightPx: globalConfig[`mochi${index + 1}_chatHeightPx`] || DEFAULT_CHAT_HEIGHT,
    ttsEnabled: globalConfig[`mochi${index + 1}_ttsEnabled`] === true,
    ttsVoiceProfile: globalConfig[`mochi${index + 1}_ttsVoiceProfile`] || pickRandomTtsProfile(),
    ttsVoiceId: globalConfig[`mochi${index + 1}_ttsVoiceId`] || '',
    openMicEnabled: globalConfig[`mochi${index + 1}_openMicEnabled`] === true,
    sttProvider: globalConfig[`mochi${index + 1}_sttProvider`] || 'groq',
    sttApiKey: globalConfig[`mochi${index + 1}_sttApiKey`] || '',
    relayEnabled: globalConfig[`mochi${index + 1}_relayEnabled`] === true,
    soundEnabled: globalConfig[`mochi${index + 1}_soundEnabled`] !== false,
    soundVolume: typeof globalConfig[`mochi${index + 1}_soundVolume`] === 'number'
      ? globalConfig[`mochi${index + 1}_soundVolume`]
      : 0.7,
    mode: globalConfig[`mochi${index + 1}_mode`] || globalConfig.aiMode || 'standard',
    standardProvider: globalConfig[`mochi${index + 1}_standardProvider`] || 'openrouter',
    openrouterModel: globalConfig[`mochi${index + 1}_openrouterModel`] || globalConfig.openrouterModel || 'google/gemini-2.0-flash-001',
    openrouterModelResolved: globalConfig[`mochi${index + 1}_openrouterModelResolved`] || globalConfig.openrouterModelResolved || '',
    ollamaModel: globalConfig[`mochi${index + 1}_ollamaModel`] || globalConfig.ollamaModel || 'gemma3:1b',
    ollamaUrl: globalConfig[`mochi${index + 1}_ollamaUrl`] || globalConfig.ollamaUrl || 'http://127.0.0.1:11434',
    openclawGatewayUrl: globalConfig[`mochi${index + 1}_openclawGatewayUrl`]
      || globalConfig.openclawGatewayUrl
      || globalConfig.openclawUrl
      || 'ws://127.0.0.1:18789',
    openclawGatewayToken: globalConfig[`mochi${index + 1}_openclawGatewayToken`]
      || globalConfig.openclawGatewayToken
      || globalConfig.openclawToken
      || '',
    openclawAgentName: globalConfig[`mochi${index + 1}_openclawAgentName`]
      || globalConfig.openclawAgentName
      || `desktop-mochi-${index + 1}`,
    terminalDistro: normalizeTerminalProfile(globalConfig[`mochi${index + 1}_terminalDistro`]
      || globalConfig.terminalDistro
      || DEFAULT_TERMINAL_PROFILE),
    terminalCwd: globalConfig[`mochi${index + 1}_terminalCwd`]
      || globalConfig.terminalCwd
      || '',
    terminalNotifyOnFinish: globalConfig[`mochi${index + 1}_terminalNotifyOnFinish`] !== undefined
      ? globalConfig[`mochi${index + 1}_terminalNotifyOnFinish`] !== false
      : (globalConfig.terminalNotifyOnFinish !== false),
    enabled: globalConfig.enabled !== false
  };
}

function updateMochiCount(count) {
  const targetCount = Math.max(0, Math.min(count, MAX_MOCHIS));

  while (mochis.length < targetCount) {
    const id = `mochi-${mochis.length + 1}`;
    const config = getConfigForIndex(mochis.length);
    createMochi(id, config);
  }

  while (mochis.length > targetCount) {
    removeMochi(mochis[mochis.length - 1]);
  }

  console.log(`Mochi count updated: ${mochis.length}`);
}

function applyMochiList(list) {
  if (!Array.isArray(list)) return;
  updateMochiCount(list.length);
  mochis.forEach((mochi, index) => {
    const nextConfig = list[index];
    if (!nextConfig) return;
    const prevChar = mochi.config.character;
    mochi.setConfig(nextConfig);
    if (nextConfig.character && nextConfig.character !== prevChar) {
      mochi.config.character = nextConfig.character;
      mochi.updateSprite();
    }
    if (nextConfig.enabled !== undefined) {
      mochi.config.enabled = nextConfig.enabled;
    }
    if (mochi.elements.wrapper) {
      mochi.elements.wrapper.style.display = mochi.config.enabled !== false ? 'flex' : 'none';
    }
    if (mochi.config.enabled === false && mochi.chatOpen) {
      mochi.closeChat();
    }
  });
}

function startAnimationLoop() {
  function loop() {
    mochis.forEach(mochi => mochi.update());
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// Mouse tracking for click-through overlay
let isMouseOverInteractive = false;
let lastMouseX = window.innerWidth / 2;
let lastMouseY = window.innerHeight / 2;
let mouseMoveListener = null;
let cursorPollTimer = null;

function handleDocumentMouseMoveEvent(e) {
  updateMouseCapture(e.clientX, e.clientY);
}

function startCursorPolling() {
  if (cursorPollTimer) return;
  const poll = async () => {
    try {
      if (!window.mochiApi?.getCursorScreenPoint) return;
      const point = await window.mochiApi.getCursorScreenPoint();
      if (
        point
        && Number.isFinite(point.x)
        && Number.isFinite(point.y)
      ) {
        const offsetX = Number.isFinite(window.screenX) ? window.screenX : 0;
        const offsetY = Number.isFinite(window.screenY) ? window.screenY : 0;
        updateMouseCapture(point.x - offsetX, point.y - offsetY);
      }
    } catch {}
    cursorPollTimer = setTimeout(poll, CURSOR_POLL_INTERVAL_MS);
  };
  poll();
}

function startMouseCaptureTracking() {
  if (IS_LINUX_PLATFORM) {
    startCursorPolling();
    return;
  }
  if (mouseMoveListener) return;
  mouseMoveListener = handleDocumentMouseMoveEvent;
  document.addEventListener('mousemove', mouseMoveListener, { passive: true });
}

startMouseCaptureTracking();

function hasOpenChats() {
  return mochis.some((mochi) => mochi.chatOpen);
}

function closeAllChats() {
  let closedAny = false;
  mochis.forEach((mochi) => {
    if (mochi.chatOpen) {
      mochi.closeChat();
      closedAny = true;
    }
  });
  return closedAny;
}

function checkMouseOverMochi(x, y) {
  // Check if mouse is over any mochi or chat bubble
  for (const mochi of mochis) {
    if (!mochi.elements.wrapper) continue;
    
    const rect = mochi.elements.wrapper.getBoundingClientRect();
    const isOverMochi = x >= rect.left && x <= rect.right && 
                          y >= rect.top && y <= rect.bottom;
    
    if (mochi.chatOpen && mochi.elements.chat) {
      const chatRect = mochi.elements.chat.getBoundingClientRect();
      const isOverChat = x >= chatRect.left && x <= chatRect.right && 
                         y >= chatRect.top && y <= chatRect.bottom;
      if (isOverChat) return true;
    }
    
    if (isOverMochi) return true;
  }
  return false;
}

function updateMouseCapture(x, y) {
  if (!window.mochiApi?.setIgnoreMouseEvents) return;
  
  lastMouseX = x;
  lastMouseY = y;
  const shouldCapture = checkMouseOverMochi(x, y) || hasOpenChats();
  
  if (shouldCapture !== isMouseOverInteractive) {
    isMouseOverInteractive = shouldCapture;
    // When shouldCapture is true, we DON'T ignore mouse events
    // When shouldCapture is false, we DO ignore mouse events (click-through)
    window.mochiApi.setIgnoreMouseEvents(!shouldCapture);
  }
}

async function init() {
  console.log('Initializing Mochi Desktop...');
  syncUiLanguageFromConfig(globalConfig);

  let container = document.getElementById('mochi-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'mochi-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    `;
    document.body.appendChild(container);
  }

  // Always create at least one mochi immediately
  let mochiCreated = false;
  
  try {
    if (window.mochiApi) {
      setupUpdateListeners();
      // Fetch screen geometry so mochis walk on top of the taskbar/panel (Linux).
      if (window.mochiApi.getScreenInfo) {
        try {
          const screenInfo = await window.mochiApi.getScreenInfo();
          if (screenInfo && screenInfo.workArea) {
            screenWorkAreaBottom = screenInfo.workArea.y + screenInfo.workArea.height;
          }
        } catch (_e) { /* non-fatal */ }
      }

      console.log('Loading config from API...');
      globalConfig = await window.mochiApi.getConfig() || {};
      syncUiLanguageFromConfig(globalConfig);
      console.log('Config loaded:', globalConfig);

      const list = Array.isArray(globalConfig.mochis) ? globalConfig.mochis : [];
      const mochiCount = globalConfig.mochiCount || list.length || 1;
      const enabled = globalConfig.enabled !== false;

      if (enabled) {
        const showMochis = globalConfig.showMochis !== false;
        for (let i = 0; i < mochiCount; i++) {
          const id = `mochi-${i + 1}`;
          const config = list[i] || getConfigForIndex(i);
          config.enabled = showMochis;
          createMochi(id, config);
          mochiCreated = true;
        }
      }

      window.mochiApi.onConfigUpdated((next) => {
        const previousLanguage = getUiLanguage();
        globalConfig = { ...globalConfig, ...next };
        syncUiLanguageFromConfig(globalConfig);
        const languageChanged = previousLanguage !== getUiLanguage();
        console.log('Config updated:', globalConfig);

        if (next.mochis) {
          applyMochiList(next.mochis);
        } else if (next.mochiCount !== undefined) {
          updateMochiCount(next.mochiCount);
        }

        if (next.enabled !== undefined) {
          mochis.forEach(s => s.config.enabled = next.enabled);
        }

        if (next.showMochis !== undefined) {
          const show = next.showMochis;
          mochis.forEach(s => {
            s.config.enabled = show;
            if (s.elements.wrapper) {
              s.elements.wrapper.style.display = show ? 'flex' : 'none';
            }
            if (s.elements.chat && !show) {
              s.closeChat();
            }
          });
        }

        if (next.uiTextScale !== undefined) {
          mochis.forEach((mochi) => mochi.applyUiTextScale());
        }

        mochis.forEach((mochi, index) => {
          if (next[`mochi${index + 1}_character`] !== undefined) {
            mochi.config.character = next[`mochi${index + 1}_character`];
            mochi.updateSprite();
          }
          if (next[`mochi${index + 1}_size`] !== undefined) {
            mochi.setConfig({ size: next[`mochi${index + 1}_size`] });
          }
          if (next[`mochi${index + 1}_personality`] !== undefined) {
            mochi.setConfig({ personality: next[`mochi${index + 1}_personality`] });
          }
          if (next[`mochi${index + 1}_chatTheme`] !== undefined) {
            mochi.setConfig({ chatTheme: next[`mochi${index + 1}_chatTheme`] });
          }
          if (next[`mochi${index + 1}_chatThemePreset`] !== undefined) {
            mochi.setConfig({ chatThemePreset: next[`mochi${index + 1}_chatThemePreset`] });
          }
          if (next[`mochi${index + 1}_chatThemeColor`] !== undefined) {
            mochi.setConfig({ chatThemeColor: next[`mochi${index + 1}_chatThemeColor`] });
          }
          if (next[`mochi${index + 1}_chatBgColor`] !== undefined) {
            mochi.setConfig({ chatBgColor: next[`mochi${index + 1}_chatBgColor`] });
          }
          if (next[`mochi${index + 1}_chatBubbleStyle`] !== undefined) {
            mochi.setConfig({ chatBubbleStyle: next[`mochi${index + 1}_chatBubbleStyle`] });
          }
          if (next[`mochi${index + 1}_chatFontSize`] !== undefined) {
            mochi.setConfig({ chatFontSize: next[`mochi${index + 1}_chatFontSize`] });
          }
          if (next[`mochi${index + 1}_chatWidth`] !== undefined) {
            mochi.setConfig({ chatWidth: next[`mochi${index + 1}_chatWidth`] });
          }
          if (next[`mochi${index + 1}_chatWidthPx`] !== undefined) {
            mochi.setConfig({ chatWidthPx: next[`mochi${index + 1}_chatWidthPx`] });
          }
          if (next[`mochi${index + 1}_chatHeightPx`] !== undefined) {
            mochi.setConfig({ chatHeightPx: next[`mochi${index + 1}_chatHeightPx`] });
          }
          if (next[`mochi${index + 1}_ttsEnabled`] !== undefined) {
            mochi.setConfig({ ttsEnabled: next[`mochi${index + 1}_ttsEnabled`] });
          }
          if (next[`mochi${index + 1}_ttsVoiceProfile`] !== undefined) {
            mochi.setConfig({ ttsVoiceProfile: next[`mochi${index + 1}_ttsVoiceProfile`] });
          }
          if (next[`mochi${index + 1}_ttsVoiceId`] !== undefined) {
            mochi.setConfig({ ttsVoiceId: next[`mochi${index + 1}_ttsVoiceId`] });
          }
          if (next[`mochi${index + 1}_openMicEnabled`] !== undefined) {
            mochi.setConfig({ openMicEnabled: next[`mochi${index + 1}_openMicEnabled`] });
          }
          if (next[`mochi${index + 1}_sttProvider`] !== undefined) {
            mochi.setConfig({ sttProvider: next[`mochi${index + 1}_sttProvider`] });
          }
          if (next[`mochi${index + 1}_sttApiKey`] !== undefined) {
            mochi.setConfig({ sttApiKey: next[`mochi${index + 1}_sttApiKey`] });
          }
          if (next[`mochi${index + 1}_relayEnabled`] !== undefined) {
            mochi.setConfig({ relayEnabled: next[`mochi${index + 1}_relayEnabled`] });
          }
          if (next[`mochi${index + 1}_soundEnabled`] !== undefined) {
            mochi.setConfig({ soundEnabled: next[`mochi${index + 1}_soundEnabled`] });
          }
          if (next[`mochi${index + 1}_soundVolume`] !== undefined) {
            mochi.setConfig({ soundVolume: next[`mochi${index + 1}_soundVolume`] });
          }
          if (next[`mochi${index + 1}_mode`] !== undefined) {
            mochi.setConfig({ mode: next[`mochi${index + 1}_mode`] });
          }
          if (next[`mochi${index + 1}_standardProvider`] !== undefined) {
            mochi.setConfig({ standardProvider: next[`mochi${index + 1}_standardProvider`] });
          }
          if (next[`mochi${index + 1}_openrouterModel`] !== undefined) {
            mochi.setConfig({ openrouterModel: next[`mochi${index + 1}_openrouterModel`] });
          }
          if (next[`mochi${index + 1}_openrouterModelResolved`] !== undefined) {
            mochi.setConfig({ openrouterModelResolved: next[`mochi${index + 1}_openrouterModelResolved`] });
          }
          if (next[`mochi${index + 1}_ollamaUrl`] !== undefined) {
            mochi.setConfig({ ollamaUrl: next[`mochi${index + 1}_ollamaUrl`] });
          }
          if (next[`mochi${index + 1}_ollamaModel`] !== undefined) {
            mochi.setConfig({ ollamaModel: next[`mochi${index + 1}_ollamaModel`] });
          }
          if (next[`mochi${index + 1}_openclawGatewayUrl`] !== undefined) {
            mochi.setConfig({ openclawGatewayUrl: next[`mochi${index + 1}_openclawGatewayUrl`] });
          }
          if (next[`mochi${index + 1}_openclawGatewayToken`] !== undefined) {
            mochi.setConfig({ openclawGatewayToken: next[`mochi${index + 1}_openclawGatewayToken`] });
          }
          if (next[`mochi${index + 1}_openclawAgentName`] !== undefined) {
            mochi.setConfig({ openclawAgentName: next[`mochi${index + 1}_openclawAgentName`] });
          }
          if (next[`mochi${index + 1}_terminalDistro`] !== undefined) {
            mochi.setConfig({ terminalDistro: next[`mochi${index + 1}_terminalDistro`] });
          }
          if (next[`mochi${index + 1}_terminalCwd`] !== undefined) {
            mochi.setConfig({ terminalCwd: next[`mochi${index + 1}_terminalCwd`] });
          }
          if (next[`mochi${index + 1}_terminalNotifyOnFinish`] !== undefined) {
            mochi.setConfig({ terminalNotifyOnFinish: next[`mochi${index + 1}_terminalNotifyOnFinish`] });
          }
        });

        if (
          next.aiMode !== undefined
          || next.openrouterModel !== undefined
          || next.openrouterModelResolved !== undefined
          || next.ollamaModel !== undefined
          || next.openclawGatewayUrl !== undefined
          || next.openclawAgentName !== undefined
          || next.terminalDistro !== undefined
          || next.terminalCwd !== undefined
        ) {
          mochis.forEach((mochi) => mochi.updateChatHeader());
        }

        if (languageChanged) {
          mochis.forEach((mochi) => mochi.onLanguageChanged());
        }
      });

      if (window.mochiApi.onAiStreamDelta) {
        window.mochiApi.onAiStreamDelta((payload) => {
          if (!payload || !payload.mochiId) return;
          const target = mochis.find((s) => s.id === payload.mochiId);
          if (!target) return;
          target.applyStreamDelta(payload.delta || '', payload.accumulated || '');
        });
      }

      if (window.mochiApi.onTerminalStreamDelta) {
        window.mochiApi.onTerminalStreamDelta((payload) => {
          if (!payload || !payload.mochiId) return;
          const target = mochis.find((s) => s.id === payload.mochiId);
          if (!target) return;
          target.applyStreamDelta(payload.delta || '', payload.accumulated || '');
        });
      }

      if (window.mochiApi.onTerminalStreamError) {
        window.mochiApi.onTerminalStreamError((payload) => {
          if (!payload || !payload.mochiId) return;
          const target = mochis.find((s) => s.id === payload.mochiId);
          if (!target || target.pendingAssistantIndex === null) return;
          const errorText = `Error: ${payload.error || 'TERMINAL_ERROR'}`;
          target.messages[target.pendingAssistantIndex] = { role: 'assistant', content: errorText };
          target.pendingStreamText = errorText;
          target.pendingStreamHadDelta = true;
          target.renderMessages();
        });
      }

      if (window.mochiApi.onTerminalSessionData) {
        window.mochiApi.onTerminalSessionData((payload) => {
          if (!payload || !payload.mochiId) return;
          const target = mochis.find((s) => s.id === payload.mochiId);
          if (!target) return;
          target.handleTerminalSessionData(payload);
        });
      }

      if (window.mochiApi.onTerminalSessionExit) {
        window.mochiApi.onTerminalSessionExit((payload) => {
          if (!payload || !payload.mochiId) return;
          const target = mochis.find((s) => s.id === payload.mochiId);
          if (!target) return;
          target.handleTerminalSessionExit(payload);
        });
      }

      if (window.mochiApi.onTerminalSessionState) {
        window.mochiApi.onTerminalSessionState((payload) => {
          if (!payload || !payload.mochiId) return;
          const target = mochis.find((s) => s.id === payload.mochiId);
          if (!target) return;
          target.handleTerminalSessionState(payload);
        });
      }

      if (window.mochiApi.onCallBack) {
        window.mochiApi.onCallBack((payload) => {
          if (!payload) return;
          if (payload.all) {
            mochis.forEach((s) => { if (s.isOffScreen()) s.callBack(); });
          } else if (payload.mochiId) {
            const target = mochis.find((s) => s.id === payload.mochiId);
            if (target && target.isOffScreen()) target.callBack();
          }
        });
      }

      if (window.mochiApi.onDismiss) {
        window.mochiApi.onDismiss((payload) => {
          if (!payload) return;
          if (payload.all) {
            mochis.forEach((s) => { if (!s.isOffScreen()) s.dismiss(); });
          } else if (payload.mochiId) {
            const target = mochis.find((s) => s.id === payload.mochiId);
            if (target && !target.isOffScreen()) target.dismiss();
          }
        });
      }
    } else {
      console.log('No API available, creating default mochi...');
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

    // Create default mochi if none were created
    if (!mochiCreated) {
      console.log('Creating default mochi...');
      createMochi('mochi-1', { 
        character: 'mochi', 
        enabled: true, 
        personality: 'random', 
        chatTheme: 'pastel',
        chatThemePreset: 'pastel',
        chatThemeColor: '#3b1a77',
        chatBgColor: '#f0e8ff',
        chatBubbleStyle: 'glass',
        chatFontSize: 'medium',
        chatWidth: 'medium',
        chatHeightPx: 340,
        soundEnabled: true,
        soundVolume: 0.7,
        ttsEnabled: false,
        ttsVoiceProfile: 'random',
        openMicEnabled: false,
        sttProvider: 'groq',
        sttApiKey: '',
        relayEnabled: false,
        mode: 'standard',
        standardProvider: 'openrouter',
        openrouterModel: 'random',
        terminalDistro: DEFAULT_TERMINAL_PROFILE,
        terminalCwd: '',
        terminalNotifyOnFinish: true
      });
    }

  startAnimationLoop();
  console.log('Mochi Desktop initialized with', mochis.length, 'mochi(s)');

  // Global click handler to close all chats when clicking outside
  document.addEventListener('mousedown', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (checkMouseOverMochi(e.clientX, e.clientY)) {
      return;
    }

    if (!hasOpenChats()) return;

    closeAllChats();

    // Best-effort passthrough: switch back to click-through immediately.
    if (window.mochiApi?.setIgnoreMouseEvents) {
      isMouseOverInteractive = false;
      window.mochiApi.setIgnoreMouseEvents(true);
      setTimeout(() => updateMouseCapture(lastMouseX, lastMouseY), 0);
    }
  });

  window.addEventListener('blur', () => {
    if (!hasOpenChats()) return;
    closeAllChats();
    if (window.mochiApi?.setIgnoreMouseEvents) {
      isMouseOverInteractive = false;
      window.mochiApi.setIgnoreMouseEvents(true);
    }
  });

  window.addEventListener('resize', () => {
    mochis.forEach((mochi) => {
      if (!mochi.chatOpen) return;
      mochi.positionChatBubble();
      mochi.scheduleTerminalFit(0);
    });
  });
}

init();
