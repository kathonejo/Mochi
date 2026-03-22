const MAX_MOCHIS = 5;

const CHARACTER_OPTIONS = [
  { id: 'mochi', labelEn: 'Mochi', labelEs: 'Mochi' },
  { id: 'kitten', labelEn: 'Kitten', labelEs: 'Gatito' },
  { id: 'ghost', labelEn: 'Ghost', labelEs: 'Fantasma' },
  { id: 'blob', labelEn: 'Blob', labelEs: 'Blob' },
  { id: 'penguin', labelEn: 'Penguin', labelEs: 'Pingüino' }
];

const PERSONALITY_OPTIONS = [
  { value: 'random', labelEn: 'Random', labelEs: 'Aleatoria' },
  { value: 'cryptid', labelEn: 'Cryptid', labelEs: 'Críptico' },
  { value: 'cozy', labelEn: 'Cozy', labelEs: 'Acogedor' },
  { value: 'chaotic', labelEn: 'Chaotic', labelEs: 'Caótico' },
  { value: 'philosopher', labelEn: 'Philosopher', labelEs: 'Filósofo' },
  { value: 'hype', labelEn: 'Hype Beast', labelEs: 'Entusiasta' },
  { value: 'noir', labelEn: 'Noir', labelEs: 'Noir' },
  { value: 'egg', labelEn: 'Egg', labelEs: 'Huevo' }
];

const CHAT_THEME_PRESETS = [
  { id: 'pastel', labelEn: 'Pastel', labelEs: 'Pastel', theme: '#3b1a77', bg: '#f0e8ff', bubble: 'glass' },
  { id: 'pink', labelEn: 'Pink', labelEs: 'Rosa', theme: '#7a124b', bg: '#ffd2ea', bubble: 'glass' },
  { id: 'kawaii', labelEn: 'Kawaii', labelEs: 'Kawaii', theme: '#5b1456', bg: '#ffd8f0', bubble: 'glass' },
  { id: 'mint', labelEn: 'Mint', labelEs: 'Menta', theme: '#0f5f54', bg: '#c7fff0', bubble: 'glass' },
  { id: 'ocean', labelEn: 'Ocean', labelEs: 'Océano', theme: '#103a7a', bg: '#cfe6ff', bubble: 'glass' },
  { id: 'neural', labelEn: 'Neural', labelEs: 'Neural', theme: '#86f0ff', bg: '#0b0d1f', bubble: 'dark' },
  { id: 'cyberpunk', labelEn: 'Cyberpunk', labelEs: 'Cyberpunk', theme: '#19d3ff', bg: '#0a0830', bubble: 'dark' },
  { id: 'noir-rose', labelEn: 'Noir Rose', labelEs: 'Noir Rosa', theme: '#ff5fbf', bg: '#0b0717', bubble: 'dark' },
  { id: 'midnight', labelEn: 'Midnight', labelEs: 'Medianoche', theme: '#7aa7ff', bg: '#0b1220', bubble: 'dark' },
  { id: 'ember', labelEn: 'Ember', labelEs: 'Brasas', theme: '#ff8b3d', bg: '#1a0c08', bubble: 'dark' }
];

const CHAT_THEME_OPTIONS = CHAT_THEME_PRESETS.map((preset) => ({
  value: preset.id,
  labelEn: preset.labelEn,
  labelEs: preset.labelEs
}));

const SIZE_OPTIONS = [
  { value: 'small', labelEn: 'Small', labelEs: 'Pequeño' },
  { value: 'medium', labelEn: 'Medium', labelEs: 'Mediano' },
  { value: 'big', labelEn: 'Large', labelEs: 'Grande' }
];

const TTS_VOICE_OPTIONS = [
  { value: 'random', labelEn: 'Random', labelEs: 'Aleatoria' },
  { value: 'warm', labelEn: 'Warm', labelEs: 'Cálida' },
  { value: 'bright', labelEn: 'Bright', labelEs: 'Brillante' },
  { value: 'deep', labelEn: 'Deep', labelEs: 'Grave' },
  { value: 'calm', labelEn: 'Calm', labelEs: 'Suave' },
  { value: 'energetic', labelEn: 'Energetic', labelEs: 'Enérgica' }
];

const CHAT_BUBBLE_STYLES = [
  { value: 'glass', labelEn: 'Glass', labelEs: 'Cristal' },
  { value: 'solid', labelEn: 'Solid', labelEs: 'Sólido' },
  { value: 'dark', labelEn: 'Dark', labelEs: 'Oscuro' }
];

const POPUP_THEME_OPTIONS = [
  { value: 'random', labelEn: 'Random', labelEs: 'Aleatorio' },
  { value: 'neural', labelEn: 'Neural', labelEs: 'Neural' },
  { value: 'pink', labelEn: 'Pink', labelEs: 'Rosa' },
  { value: 'kawaii', labelEn: 'Kawaii', labelEs: 'Kawaii' }
];

const LANGUAGE_OPTIONS = [
  { value: 'en', labelEn: 'English', labelEs: 'Inglés' },
  { value: 'es', labelEn: 'Spanish', labelEs: 'Español' }
];

const PROVIDER_HELP_LINKS = {
  openrouter: {
    href: 'https://openrouter.ai/settings/keys',
    labelEn: 'Get OpenRouter keys',
    labelEs: 'Conseguir keys de OpenRouter'
  },
  ollama: {
    href: 'https://ollama.com',
    labelEn: 'Download Ollama',
    labelEs: 'Descargar Ollama'
  },
  openclaw: {
    href: 'https://github.com/openclaw/openclaw',
    labelEn: 'Setup OpenClaw',
    labelEs: 'Configurar OpenClaw'
  }
};

let mochis = [];
let selectedMochiIndex = 0;
let currentConfig = {};
let uiLanguage = null;
let resolvedPopupTheme = 'neural';
let nftCharacters = [];
let nftCharacterIds = new Set();

const enabledToggle = document.getElementById('all-sites-toggle');
const enabledToggleRow = document.getElementById('all-sites-toggle-row');
const mochiSelector = document.getElementById('mochi-selector');
const mochiList = document.getElementById('mochi-list');
const mochiEmpty = document.getElementById('mochi-empty');
const addMochiBtn = document.getElementById('add-mochi-btn');
const statsEl = document.getElementById('popup-stats');

const aiModeSelect = document.getElementById('ai-mode-select');
const openRouterConfig = document.getElementById('openrouter-config');
const ollamaConfig = document.getElementById('ollama-config');
const openclawConfig = document.getElementById('openclaw-config');
const testConfig = document.getElementById('test-config');

const openRouterKey = document.getElementById('openrouter-key');
const openRouterModel = document.getElementById('openrouter-model');
const ollamaUrl = document.getElementById('ollama-url');
const ollamaModel = document.getElementById('ollama-model');
const openclawUrl = document.getElementById('openclaw-url');
const openclawToken = document.getElementById('openclaw-token');
const aiTestPrompt = document.getElementById('ai-test-prompt');
const aiTestBtn = document.getElementById('ai-test-btn');
const aiTestStatus = document.getElementById('ai-test-status');
const globalMochiToggle = document.getElementById('global-mochi-toggle');
const popupThemeSelect = document.getElementById('popup-theme-select');
const popupLanguageSelect = document.getElementById('popup-language-select');
const uiTextScaleSelect = document.getElementById('ui-text-scale-select');
const startOnStartupToggle = document.getElementById('start-on-startup-toggle');
const startMinimizedToggle = document.getElementById('start-minimized-toggle');
const createShortcutBtn = document.getElementById('create-shortcut-btn');
const createShortcutStatus = document.getElementById('create-shortcut-status');
const UI_TEXT_SCALE_OPTIONS = [0.85, 1, 1.15, 1.3, 1.45];

function detectBrowserLanguage() {
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  const hasSpanish = languages.some((lang) => (lang || '').toLowerCase().startsWith('es'));
  return hasSpanish ? 'es' : 'en';
}

function getUiLanguage() {
  if (uiLanguage === 'es' || uiLanguage === 'en') return uiLanguage;
  const fromConfig = currentConfig.mochiLanguage;
  if (fromConfig === 'es' || fromConfig === 'en') return fromConfig;
  return detectBrowserLanguage();
}

function isSpanishLocale() {
  return getUiLanguage() === 'es';
}

function t(en, es) {
  return isSpanishLocale() ? es : en;
}

function appendProviderHelpLink(container, providerId) {
  const linkConfig = PROVIDER_HELP_LINKS[providerId];
  if (!linkConfig) return;

  const hint = document.createElement('div');
  hint.className = 'helper-text full-width';

  const anchor = document.createElement('a');
  anchor.href = linkConfig.href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = isSpanishLocale() ? linkConfig.labelEs : linkConfig.labelEn;

  hint.appendChild(anchor);
  container.appendChild(hint);
}

function refreshNftCharacterCatalog(rawNfts) {
  const mergedMap = new Map();
  const synced = Array.isArray(rawNfts) ? rawNfts : [];
  synced.forEach((item) => {
    if (item?.id) mergedMap.set(item.id, item);
  });
  nftCharacters = Array.from(mergedMap.values());
  nftCharacterIds = new Set(nftCharacters.map((item) => item.id).filter(Boolean));
}

function isNftCharacterId(value) {
  return nftCharacterIds.has(String(value || ''));
}

const IS_WINDOWS_PLATFORM = /win/i.test(`${navigator.platform || navigator.userAgent || ''}`);
const IS_MAC_PLATFORM = /mac/i.test(`${navigator.platform || navigator.userAgent || ''}`);
const DEFAULT_TERMINAL_PROFILE = IS_WINDOWS_PLATFORM ? 'Ubuntu' : '';
const TERMINAL_MODE_LABEL_EN = IS_WINDOWS_PLATFORM ? 'WSL Terminal' : (IS_MAC_PLATFORM ? 'Mac Terminal' : 'Terminal');
const TERMINAL_MODE_LABEL_ES = IS_WINDOWS_PLATFORM ? 'Terminal WSL' : (IS_MAC_PLATFORM ? 'Terminal Mac' : 'Terminal');
const TERMINAL_PROFILE_LABEL_EN = IS_WINDOWS_PLATFORM ? 'WSL Distro' : 'Shell';
const TERMINAL_PROFILE_LABEL_ES = IS_WINDOWS_PLATFORM ? 'Distro WSL' : 'Shell';
const TERMINAL_PROFILE_PLACEHOLDER = IS_WINDOWS_PLATFORM ? 'Ubuntu' : (IS_MAC_PLATFORM ? '/bin/zsh' : '/bin/bash');
const TERMINAL_HINT_EN = IS_WINDOWS_PLATFORM
  ? 'Chat messages are executed as shell commands in a persistent WSL session.'
  : 'Chat messages are executed as shell commands in a persistent local terminal session.';
const TERMINAL_HINT_ES = IS_WINDOWS_PLATFORM
  ? 'Los mensajes del chat se ejecutan como comandos de shell en una sesión WSL persistente.'
  : 'Los mensajes del chat se ejecutan como comandos de shell en una sesión local persistente.';

function normalizeTerminalProfile(rawValue) {
  const normalized = `${rawValue || ''}`.trim();
  if (IS_WINDOWS_PLATFORM) return normalized || DEFAULT_TERMINAL_PROFILE;
  if (!normalized) return '';
  if (/^ubuntu$/i.test(normalized) || /^wsl$/i.test(normalized)) return '';
  return normalized;
}

function getRandomTheme() {
  const themes = ['neural', 'pink', 'kawaii'];
  return themes[Math.floor(Math.random() * themes.length)];
}

function applyTheme(theme, forceRandomize = false) {
  const requested = String(theme || 'random');
  if (requested === 'random') {
    const canReuse = resolvedPopupTheme && resolvedPopupTheme !== 'random';
    resolvedPopupTheme = (!forceRandomize && canReuse) ? resolvedPopupTheme : getRandomTheme();
  } else {
    resolvedPopupTheme = requested;
  }
  document.body.dataset.theme = resolvedPopupTheme;
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

function applyUiTextScale(value) {
  const next = normalizeUiTextScale(value);
  document.documentElement.style.zoom = String(next);
  document.documentElement.style.transformOrigin = 'top left';
  if (uiTextScaleSelect) {
    uiTextScaleSelect.value = String(next);
  }
  return next;
}

function populateUiTextScaleSelect(value) {
  if (!uiTextScaleSelect) return;
  const selected = normalizeUiTextScale(value);
  uiTextScaleSelect.innerHTML = '';
  UI_TEXT_SCALE_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = String(opt);
    option.textContent = `${Math.round(opt * 100)}%`;
    if (opt === selected) option.selected = true;
    uiTextScaleSelect.appendChild(option);
  });
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

function populatePopupThemeSelect(value) {
  if (!popupThemeSelect) return;
  const selected = POPUP_THEME_OPTIONS.some((opt) => opt.value === value) ? value : 'random';
  popupThemeSelect.innerHTML = '';
  POPUP_THEME_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = t(opt.labelEn, opt.labelEs);
    if (opt.value === selected) option.selected = true;
    popupThemeSelect.appendChild(option);
  });
}

function populateLanguageSelect(value) {
  if (!popupLanguageSelect) return;
  const selected = value === 'es' || value === 'en' ? value : detectBrowserLanguage();
  popupLanguageSelect.innerHTML = '';
  LANGUAGE_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = t(opt.labelEn, opt.labelEs);
    if (opt.value === selected) option.selected = true;
    popupLanguageSelect.appendChild(option);
  });
}

function setPopupLabels() {
  const byId = (id) => document.getElementById(id);
  const setText = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };

  setText('popup-subtitle', t('Your AI mascot orchestrator', 'Tu orquestador de mascotas AI'));
  setText('shortcuts-title', t('Shortcuts', 'Atajos'));
  setText('shortcuts-hint', t('Click a mochi to open chat. Drag to reposition with gravity. Double-click to jump.', 'Haz clic en un mochi para abrir chat. Arrástralo para moverlo con gravedad. Doble clic para saltar.'));
  setText('global-mochi-label', t('Show all mochis', 'Mostrar todos los mochis'));
  setText('global-mochi-hint', t('Toggle to show or hide all mochis on screen', 'Activa o desactiva para mostrar u ocultar todos los mochis en pantalla'));
  setText('presence-title', t('Visibility', 'Visibilidad'));
  setText('label-enabled-all-sites', t('Enabled on desktop', 'Habilitado en escritorio'));
  setText('label-enabled-page', t('Enable on this app', 'Habilitar en esta app'));
  setText('startup-label', t('Start Mochi on system login', 'Iniciar Mochi al iniciar el sistema'));
  setText('startup-hint', t('Launch the desktop app automatically when you sign into Windows, macOS, or Linux.', 'Inicia la app automáticamente cuando ingresas a Windows, macOS o Linux.'));
  setText('mochi-section-title', t('Mochis', 'Mochis'));
  setText('mochi-limit-hint', t('Up to 5 mochis on screen', 'Hasta 5 mochis en pantalla'));
  setText('nft-section-title', t('NFT Mochis', 'Mochis NFT'));
  setText('nft-hint', t('NFT collection syncing is coming soon on desktop.', 'La sincronización de colección NFT llegará pronto en desktop.'));
  setText('link-nft-collection', t('Manage Collection', 'Gestionar colección'));
  setText('security-title', t('Security', 'Seguridad'));
  setText('security-hint', t('Desktop security controls are coming soon.', 'Los controles de seguridad para desktop llegarán pronto.'));
  setText('masterkey-label', t('Protect keys with master key', 'Proteger claves con llave maestra'));
  setText('autolock-label', t('Auto-lock', 'Auto-bloqueo'));
  setText('popup-theme-label', t('Popup Theme', 'Tema del popup'));
  setText('popup-theme-note', t('Applies instantly to desktop settings.', 'Se aplica al instante en la configuración de desktop.'));
  setText('popup-language-label', t('Language', 'Idioma'));
  setText('popup-language-note', t('Changes labels in settings and chat UI.', 'Cambia etiquetas en configuración y en la UI del chat.'));
  setText('ui-text-scale-label', t('UI Text Size', 'Tamaño de texto UI'));
  setText('ui-text-scale-note', t(
    'Ctrl/Cmd + or - to resize, Ctrl/Cmd + 0 to reset.',
    'Ctrl/Cmd + o - para cambiar tamaño, Ctrl/Cmd + 0 para reiniciar.'
  ));
  setText('link-feedback', t('Feedback', 'Feedback'));
  setText('link-privacy', t('Privacy', 'Privacidad'));

  if (addMochiBtn) addMochiBtn.setAttribute('aria-label', t('Add mochi', 'Agregar mochi'));
}

async function openExternalUrlWithBrowserChoice(url, context = 'external-link') {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return;

  if (window.mochiApi?.openUrlWithBrowserChoice) {
    try {
      await window.mochiApi.openUrlWithBrowserChoice({
        url: safeUrl,
        locale: getUiLanguage(),
        context
      });
      return;
    } catch {}
  }

  window.open(safeUrl, '_blank', 'noopener,noreferrer');
}

// Store API config in memory for restoration when adding new mochis
let globalApiConfig = {
  openrouterApiKey: '',
  openrouterModel: 'random',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'gemma3:1b',
  openclawUrl: 'ws://127.0.0.1:18789',
  openclawToken: '',
  openclawGatewayUrl: 'ws://127.0.0.1:18789',
  openclawGatewayToken: '',
  openclawAgentName: 'desktop-mochi-1',
  terminalDistro: DEFAULT_TERMINAL_PROFILE,
  terminalCwd: '',
  terminalNotifyOnFinish: true
};

const DEFAULT_OLLAMA_MODEL = 'gemma3:1b';
const OPENCLAW_AGENT_NAME_MAX = 32;
const ollamaModelCatalog = new Map(); // mochiId -> string[]
const ollamaModelStatus = new Map(); // mochiId -> status text
const ollamaModelLoading = new Set(); // mochiId currently refreshing

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

function normalizeMode(value) {
  if (value === 'off' || value === 'disabled' || value === 'decorative') return 'off';
  if (value === 'agent' || value === 'openclaw') return 'agent';
  if (value === 'terminal' || value === 'wsl' || value === 'shell') return 'terminal';
  return 'standard';
}

function normalizeMochiIds(list) {
  if (!Array.isArray(list)) return [];
  return list.map((mochi, index) => {
    const presetId = inferThemePreset(mochi || {});
    const preset = CHAT_THEME_PRESETS.find((theme) => theme.id === presetId) || CHAT_THEME_PRESETS[0];
    const chatThemeColor = mochi?.chatThemeColor || preset.theme;
    const chatBgColor = mochi?.chatBgColor || preset.bg;
    const chatBubbleStyle = mochi?.chatBubbleStyle || preset.bubble || 'glass';
    const id = `mochi-${index + 1}`;
    const character = mochi?.character || CHARACTER_OPTIONS[0]?.id || 'mochi';
    const inferredSource = isNftCharacterId(character) ? 'nft' : 'free';
    const characterSource = mochi?.characterSource === 'nft' || mochi?.characterSource === 'free'
      ? mochi.characterSource
      : inferredSource;
    return {
      ...mochi,
      id,
      character,
      characterSource,
      mode: normalizeMode(mochi?.mode),
      standardProvider: mochi?.standardProvider || 'openrouter',
      chatTheme: mochi?.chatTheme || preset.id,
      chatThemePreset: mochi?.chatThemePreset || presetId || 'custom',
      chatThemeColor,
      chatBgColor,
      chatBubbleStyle,
      chatFontSize: mochi?.chatFontSize || 'medium',
      chatWidth: mochi?.chatWidth || 'medium',
      chatWidthPx: typeof mochi?.chatWidthPx === 'number' ? mochi.chatWidthPx : null,
      chatHeightPx: typeof mochi?.chatHeightPx === 'number' ? mochi.chatHeightPx : 340,
      soundEnabled: mochi?.soundEnabled !== false,
      soundVolume: typeof mochi?.soundVolume === 'number' ? mochi.soundVolume : 0.7,
      ttsEnabled: mochi?.ttsEnabled === true,
      ttsVoiceProfile: mochi?.ttsVoiceProfile || pickRandomVoiceProfile(),
      ttsVoiceId: mochi?.ttsVoiceId || '',
      openMicEnabled: mochi?.openMicEnabled === true,
      sttProvider: mochi?.sttProvider || 'groq',
      sttApiKey: mochi?.sttApiKey || '',
      relayEnabled: mochi?.relayEnabled === true,
      terminalDistro: normalizeTerminalProfile(mochi?.terminalDistro),
      terminalCwd: `${mochi?.terminalCwd || ''}`.trim(),
      terminalNotifyOnFinish: mochi?.terminalNotifyOnFinish !== false,
      openclawAgentName: normalizeOpenClawAgentName(
        mochi?.openclawAgentName,
        defaultOpenClawAgentName(index)
      )
    };
  });
}

function pickRandomVoiceProfile() {
  const pool = TTS_VOICE_OPTIONS.filter((option) => option.value !== 'random');
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return selected?.value || 'random';
}

function inferThemePreset(mochi) {
  if (mochi.chatThemePreset === 'random') return 'random';
  if (mochi.chatThemePreset === 'custom') return 'custom';
  const themeColor = String(mochi.chatThemeColor || '').toLowerCase();
  const bgColor = String(mochi.chatBgColor || '').toLowerCase();
  const bubbleStyle = String(mochi.chatBubbleStyle || 'glass').toLowerCase();
  const match = CHAT_THEME_PRESETS.find((preset) => (
    preset.theme.toLowerCase() === themeColor
    && preset.bg.toLowerCase() === bgColor
    && preset.bubble.toLowerCase() === bubbleStyle
  ));
  return match?.id || mochi.chatTheme || 'custom';
}

function updateStats() {
  const status = currentConfig.enabled ? t('Active', 'Activo') : t('Inactive', 'Inactivo');
  const count = mochis.length;
  const ai = currentConfig.aiMode === 'off'
    ? t('No AI', 'Sin AI')
    : (currentConfig.aiMode || 'standard');
  statsEl.textContent = `${status} · ${count} mochi${count !== 1 ? 's' : ''} · ${ai}`;
}

function updateAIModeVisibility() {
  const mode = aiModeSelect?.value || 'off';
  if (openRouterConfig) openRouterConfig.style.display = mode === 'openrouter' ? 'block' : 'none';
  if (ollamaConfig) ollamaConfig.style.display = mode === 'ollama' ? 'block' : 'none';
  if (openclawConfig) openclawConfig.style.display = mode === 'openclaw' ? 'block' : 'none';
  if (testConfig) testConfig.style.display = mode !== 'off' ? 'block' : 'none';
}

function saveMochis() {
  mochis = normalizeMochiIds(mochis);

  // Save API config from first mochi if available
  if (mochis.length > 0) {
    const first = mochis[0];
    globalApiConfig = {
      openrouterApiKey: first.openrouterApiKey || '',
      openrouterModel: first.openrouterModel || 'random',
      ollamaUrl: first.ollamaUrl || 'http://127.0.0.1:11434',
      ollamaModel: first.ollamaModel || 'gemma3:1b',
      openclawUrl: first.openclawUrl || 'ws://127.0.0.1:18789',
      openclawToken: first.openclawToken || '',
      openclawGatewayUrl: first.openclawGatewayUrl || 'ws://127.0.0.1:18789',
      openclawGatewayToken: first.openclawGatewayToken || '',
      openclawAgentName: normalizeOpenClawAgentName(first.openclawAgentName, defaultOpenClawAgentName(first.id || 0)),
      terminalDistro: normalizeTerminalProfile(first.terminalDistro),
      terminalCwd: `${first.terminalCwd || ''}`.trim(),
      terminalNotifyOnFinish: first.terminalNotifyOnFinish !== false
    };
  }
  
  const config = {
    mochiCount: mochis.length,
    mochis: mochis
  };
  if (window.mochiApi) {
    window.mochiApi.updateConfig(config);
  }
}

function selectMochi(index) {
  selectedMochiIndex = index;
  renderMochiSelector();
  renderMochiCards();
}

function addMochi() {
  if (mochis.length >= MAX_MOCHIS) return;

  const newIndex = mochis.length;
  const firstMochi = mochis[0];
  
  // Use existing mochi config or fall back to globalApiConfig
  const configSource = firstMochi || globalApiConfig;
  
  const newMochi = {
    id: `mochi-${newIndex + 1}`,
    character: CHARACTER_OPTIONS[newIndex % CHARACTER_OPTIONS.length].id,
    characterSource: 'free',
    size: 'medium',
    personality: 'random',
    chatTheme: configSource?.chatTheme || 'pastel',
    chatThemePreset: configSource?.chatThemePreset || configSource?.chatTheme || 'pastel',
    chatThemeColor: configSource?.chatThemeColor || '#3b1a77',
    chatBgColor: configSource?.chatBgColor || '#f0e8ff',
    chatBubbleStyle: configSource?.chatBubbleStyle || 'glass',
    chatFontSize: configSource?.chatFontSize || 'medium',
    chatWidth: configSource?.chatWidth || 'medium',
    chatWidthPx: typeof configSource?.chatWidthPx === 'number' ? configSource.chatWidthPx : null,
    chatHeightPx: typeof configSource?.chatHeightPx === 'number' ? configSource.chatHeightPx : 340,
    soundEnabled: configSource?.soundEnabled !== false,
    soundVolume: typeof configSource?.soundVolume === 'number' ? configSource.soundVolume : 0.7,
    ttsEnabled: configSource?.ttsEnabled === true,
    ttsVoiceProfile: configSource?.ttsVoiceProfile || pickRandomVoiceProfile(),
    ttsVoiceId: configSource?.ttsVoiceId || '',
    openMicEnabled: configSource?.openMicEnabled === true,
    sttProvider: configSource?.sttProvider || 'groq',
    sttApiKey: configSource?.sttApiKey || '',
    relayEnabled: configSource?.relayEnabled === true,
    enabled: true,
    // Copy AI config from mochi-1 or use stored global config
    mode: normalizeMode(configSource?.mode),
    standardProvider: configSource?.standardProvider || 'openrouter',
    openrouterApiKey: configSource?.openrouterApiKey || globalApiConfig.openrouterApiKey,
    openrouterModel: configSource?.openrouterModel || globalApiConfig.openrouterModel,
    ollamaUrl: configSource?.ollamaUrl || globalApiConfig.ollamaUrl,
    ollamaModel: configSource?.ollamaModel || globalApiConfig.ollamaModel,
    openclawUrl: configSource?.openclawUrl || globalApiConfig.openclawUrl,
    openclawToken: configSource?.openclawToken || globalApiConfig.openclawToken,
    openclawGatewayUrl: configSource?.openclawGatewayUrl || globalApiConfig.openclawGatewayUrl,
    openclawGatewayToken: configSource?.openclawGatewayToken || globalApiConfig.openclawGatewayToken,
    openclawAgentName: normalizeOpenClawAgentName(
      configSource?.openclawAgentName || globalApiConfig.openclawAgentName,
      defaultOpenClawAgentName(newIndex)
    ),
    terminalDistro: normalizeTerminalProfile(configSource?.terminalDistro || globalApiConfig.terminalDistro),
    terminalCwd: `${configSource?.terminalCwd || globalApiConfig.terminalCwd || ''}`.trim(),
    terminalNotifyOnFinish: configSource?.terminalNotifyOnFinish !== false
  };

  mochis.push(newMochi);
  selectMochi(newIndex);
  saveMochis();
}

function removeMochi(index) {
  // Allow removing all mochis, but keep API config in memory

  mochis.splice(index, 1);
  mochis = normalizeMochiIds(mochis);
  if (selectedMochiIndex >= mochis.length) {
    selectedMochiIndex = mochis.length - 1;
  }
  selectMochi(selectedMochiIndex);
  saveMochis();
}

function updateMochiConfig(index, updates) {
  if (mochis[index]) {
    mochis[index] = { ...mochis[index], ...updates };
    saveMochis();
    renderMochiCards();
  }
}

function renderMochiSelector() {
  mochiSelector.innerHTML = '';
  mochis.forEach((mochi, index) => {
    const btn = document.createElement('button');
    btn.className = `mochi-selector-btn${index === selectedMochiIndex ? ' active' : ''}`;
    btn.textContent = index + 1;
    btn.addEventListener('click', () => selectMochi(index));
    mochiSelector.appendChild(btn);
  });

  if (addMochiBtn) addMochiBtn.disabled = mochis.length >= MAX_MOCHIS;
}

function renderSelectField(field, labelText, options, value, { disabled = false, className = '' } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `ai-field${className ? ` ${className}` : ''}${disabled ? ' is-disabled' : ''}`;
  if (labelText) {
    const label = document.createElement('label');
    label.className = 'ai-label';
    label.textContent = labelText;
    wrapper.appendChild(label);
  }
  const select = document.createElement('select');
  select.className = 'ai-select';
  select.dataset.field = field;
  select.disabled = disabled;
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = isSpanishLocale()
      ? (opt.labelEs || opt.labelEn || opt.label || opt.value)
      : (opt.labelEn || opt.labelEs || opt.label || opt.value);
    if (opt.disabled) option.disabled = true;
    select.appendChild(option);
  });
  select.value = value ?? (options[0]?.value || '');
  wrapper.appendChild(select);
  return wrapper;
}

function renderCharacterField(mochi) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-field character-field full-width';

  const label = document.createElement('label');
  label.className = 'ai-label';
  label.textContent = t('Character', 'Personaje');

  const toggleRow = document.createElement('div');
  toggleRow.className = 'character-source-toggle';

  const isNft = isNftCharacterId(mochi.character);
  const source = mochi.characterSource || (isNft ? 'nft' : 'free');

  const freeBtn = document.createElement('button');
  freeBtn.type = 'button';
  freeBtn.className = 'character-source-btn';
  freeBtn.dataset.action = 'character-source';
  freeBtn.dataset.source = 'free';
  freeBtn.textContent = t('Free', 'Free');
  if (source === 'free') freeBtn.classList.add('active');

  const nftBtn = document.createElement('button');
  nftBtn.type = 'button';
  nftBtn.className = 'character-source-btn';
  nftBtn.dataset.action = 'character-source';
  nftBtn.dataset.source = 'nft';
  nftBtn.textContent = t('NFT', 'NFT');
  if (source === 'nft') nftBtn.classList.add('active');

  toggleRow.appendChild(freeBtn);
  toggleRow.appendChild(nftBtn);

  const freeOptions = CHARACTER_OPTIONS.map((opt) => ({
    value: opt.id,
    labelEn: opt.labelEn,
    labelEs: opt.labelEs
  }));
  const freeFallback = freeOptions[0]?.value || 'mochi';
  const freeSelect = renderSelectField(
    'character',
    '',
    freeOptions,
    source === 'free' && !isNft ? mochi.character : freeFallback
  );
  const freeSelectEl = freeSelect.querySelector('select');
  if (freeSelectEl) freeSelectEl.dataset.source = 'free';
  freeSelect.classList.add('character-select');
  if (source === 'nft') freeSelect.classList.add('hidden');

  const nftOptions = nftCharacters
    .filter((nft) => nft?.id)
    .map((nft) => {
      const isBuiltinEgg = String(nft.id || '').toLowerCase() === 'egg';
      const label = isBuiltinEgg
        ? t('Egg', 'Huevo')
        : (nft.name || nft.id || 'NFT');
      return {
        value: nft.id,
        labelEn: label,
        labelEs: label
      };
    });
  if (nftOptions.length === 0) {
    nftOptions.push({
      value: '',
      labelEn: t('No NFT characters', 'Sin personajes NFT'),
      labelEs: t('No NFT characters', 'Sin personajes NFT'),
      disabled: true
    });
  }
  const nftSelect = renderSelectField(
    'character',
    '',
    nftOptions,
    source === 'nft' && isNft ? mochi.character : (nftOptions[0]?.value || '')
  );
  const nftSelectEl = nftSelect.querySelector('select');
  if (nftSelectEl) nftSelectEl.dataset.source = 'nft';
  nftSelect.classList.add('character-select');
  if (source !== 'nft') nftSelect.classList.add('hidden');

  const ctaInline = document.createElement('a');
  ctaInline.href = 'https://www.mochi.dev/auction';
  ctaInline.target = '_blank';
  ctaInline.rel = 'noopener noreferrer';
  ctaInline.className = 'mochi-nft-cta inline';
  ctaInline.textContent = t('Get a Mochi NFT', 'Conseguí un Mochi NFT');

  wrapper.appendChild(label);
  wrapper.appendChild(toggleRow);
  wrapper.appendChild(freeSelect);
  wrapper.appendChild(nftSelect);
  wrapper.appendChild(ctaInline);
  return wrapper;
}

function renderToggleField(field, labelText, value, { disabled = false, className = '' } = {}) {
  const wrapper = document.createElement('label');
  wrapper.className = `toggle-row${className ? ` ${className}` : ''}${disabled ? ' is-disabled' : ''}`;
  const label = document.createElement('span');
  label.className = 'toggle-label';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'toggle-checkbox';
  input.dataset.field = field;
  input.checked = !!value;
  input.disabled = disabled;
  const slider = document.createElement('span');
  slider.className = 'toggle-slider';
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  wrapper.appendChild(slider);
  return wrapper;
}

function renderRangeField(field, labelText, value, { disabled = false, className = '' } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `ai-field${className ? ` ${className}` : ''}${disabled ? ' is-disabled' : ''}`;
  const label = document.createElement('label');
  label.className = 'ai-label';
  label.textContent = labelText;
  const row = document.createElement('div');
  row.className = 'range-row';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = value ?? 0.7;
  input.dataset.field = field;
  input.className = 'ai-range';
  input.disabled = disabled;
  row.appendChild(input);
  wrapper.appendChild(label);
  wrapper.appendChild(row);
  return wrapper;
}

function renderInputField(field, labelText, value, type, placeholder, { disabled = false, className = '' } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `ai-field${className ? ` ${className}` : ''}${disabled ? ' is-disabled' : ''}`;
  const label = document.createElement('label');
  label.className = 'ai-label';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.className = 'ai-input';
  input.value = value || '';
  input.placeholder = placeholder || '';
  input.dataset.field = field;
  input.disabled = disabled;
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function setOllamaSelectOptions(selectEl, modelNames, currentModel) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = t('Custom model', 'Modelo personalizado');
  selectEl.appendChild(customOption);

  modelNames.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    selectEl.appendChild(option);
  });

  const selected = (currentModel || '').trim();
  selectEl.value = selected && modelNames.includes(selected) ? selected : 'custom';
}

function getOllamaStatus(mochiId) {
  return ollamaModelStatus.get(mochiId) || t('Refresh to fetch local Ollama models.', 'Pulsa actualizar para cargar modelos locales de Ollama.');
}

async function refreshOllamaModelsForMochi(index) {
  const mochi = mochis[index];
  if (!mochi || !window.mochiApi?.listOllamaModels) return;

  const mochiId = mochi.id;
  ollamaModelLoading.add(mochiId);
  ollamaModelStatus.set(mochiId, t('Loading models...', 'Cargando modelos...'));
  renderMochiCards();

  try {
    const result = await window.mochiApi.listOllamaModels({
      mochiId,
      ollamaUrl: mochi.ollamaUrl || 'http://127.0.0.1:11434'
    });

    if (result?.ok) {
      const names = Array.isArray(result.models) ? result.models : [];
      ollamaModelCatalog.set(mochiId, names);
      ollamaModelStatus.set(
        mochiId,
        names.length > 0
          ? t(`Found ${names.length} local model${names.length > 1 ? 's' : ''}.`, `Se encontraron ${names.length} modelos locales.`)
          : t('Connected, but no models were found.', 'Conectado, pero no se encontraron modelos.')
      );
    } else {
      ollamaModelCatalog.set(mochiId, []);
      const error = String(result?.error || '');
      const url = result?.url || mochi.ollamaUrl || 'http://127.0.0.1:11434';
      if (error.startsWith('OLLAMA_HTTP_ONLY:')) {
        ollamaModelStatus.set(mochiId, t('Invalid Ollama URL protocol. Use HTTP, for example: http://127.0.0.1:11434', 'Protocolo de URL de Ollama inválido. Usa HTTP, por ejemplo: http://127.0.0.1:11434'));
      } else if (error.startsWith('OLLAMA_FORBIDDEN:')) {
        ollamaModelStatus.set(mochiId, t(`Ollama rejected this request (403) at ${url}.`, `Ollama rechazó esta solicitud (403) en ${url}.`));
      } else if (error.startsWith('OLLAMA_HTTP_')) {
        ollamaModelStatus.set(mochiId, t(`Ollama returned an HTTP error at ${url}.`, `Ollama devolvió un error HTTP en ${url}.`));
      } else {
        ollamaModelStatus.set(mochiId, t(`Could not reach Ollama at ${url}.`, `No se pudo conectar a Ollama en ${url}.`));
      }
    }
  } catch {
    ollamaModelCatalog.set(mochiId, []);
    ollamaModelStatus.set(mochiId, t('Could not fetch Ollama models.', 'No se pudieron obtener los modelos de Ollama.'));
  } finally {
    ollamaModelLoading.delete(mochiId);
    renderMochiCards();
  }
}

function renderMochiCards() {
  refreshNftCharacterCatalog(currentConfig?.nftCharacters);
  mochiList.innerHTML = '';
  if (mochiEmpty) {
    mochiEmpty.style.display = mochis.length === 0 ? 'block' : 'none';
    if (mochis.length === 0) {
      mochiEmpty.textContent = t(
        'No mochis active. Press the + button to add one.',
        'No hay mochis activos. Pulsa el botón + para agregar uno.'
      );
    }
  }

  mochis.forEach((mochi, index) => {
    const card = document.createElement('div');
    card.className = `mochi-card${index !== selectedMochiIndex ? ' hidden' : ''}`;
    card.dataset.index = String(index);

    const header = document.createElement('div');
    header.className = 'mochi-card-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'mochi-card-title';
    title.textContent = `Mochi ${index + 1}`;
    const idText = document.createElement('div');
    idText.className = 'mochi-card-id';
    idText.textContent = mochi.id;
    titleWrap.appendChild(title);
    titleWrap.appendChild(idText);

    const headerActions = document.createElement('div');
    headerActions.className = 'mochi-card-actions';
    const activeToggle = renderToggleField('enabled', '', mochi.enabled !== false, { className: 'mini-toggle header-active-toggle' });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'control-btn remove-btn';
    removeBtn.textContent = '❌';
    removeBtn.dataset.action = 'remove';
    removeBtn.disabled = mochis.length <= 1;
    headerActions.appendChild(activeToggle);
    headerActions.appendChild(removeBtn);

    header.appendChild(titleWrap);
    header.appendChild(headerActions);

    const preview = document.createElement('div');
    preview.className = 'mochi-preview';
    const previewSprite = document.createElement('div');
    previewSprite.className = 'mochi-preview-sprite';
    previewSprite.style.width = '56px';
    previewSprite.style.height = '56px';
    previewSprite.style.backgroundImage = `url(characters/${mochi.character || 'mochi'}/stand-neutral.png)`;
    preview.appendChild(previewSprite);

    const grid = document.createElement('div');
    grid.className = 'mochi-grid';

    grid.appendChild(renderCharacterField(mochi));
    grid.appendChild(renderSelectField('personality', t('Personality', 'Personalidad'), PERSONALITY_OPTIONS, mochi.personality || 'cryptid'));
    grid.appendChild(renderSelectField('size', t('Size', 'Tamaño'), SIZE_OPTIONS, mochi.size || 'medium'));
    grid.appendChild(renderToggleField('soundEnabled', t('Notifications', 'Notificaciones'), mochi.soundEnabled !== false));
    grid.appendChild(renderRangeField('soundVolume', t('Volume', 'Volumen'), mochi.soundVolume ?? 0.7));
    grid.appendChild(renderToggleField('ttsEnabled', t('Read Aloud', 'Leer en voz alta'), !!mochi.ttsEnabled));
    grid.appendChild(renderSelectField('ttsVoiceProfile', t('Voice', 'Voz'), TTS_VOICE_OPTIONS, mochi.ttsVoiceProfile || 'random'));
    grid.appendChild(renderToggleField('openMicEnabled', t('Open Mic', 'Micrófono abierto'), !!mochi.openMicEnabled));

    const sttProvider = mochi.sttProvider || 'groq';
    grid.appendChild(renderSelectField('sttProvider', t('Voice Input (STT)', 'Entrada de voz (STT)'), [
      { value: 'groq', labelEn: 'Groq (free tier)', labelEs: 'Groq (gratis)' },
      { value: 'openai', labelEn: 'OpenAI', labelEs: 'OpenAI' }
    ], sttProvider));
    grid.appendChild(renderInputField('sttApiKey', t('STT API Key', 'API Key STT'), mochi.sttApiKey || '', 'password', t('Paste your API key', 'Pega tu API key')));
    const sttHint = document.createElement('div');
    sttHint.className = 'helper-text full-width';
    sttHint.innerHTML = sttProvider === 'openai'
      ? t('Get a key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>', 'Obtén una key en <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>')
      : t('Get a free key at <a href="https://console.groq.com/keys" target="_blank">console.groq.com</a>', 'Obtén una key gratis en <a href="https://console.groq.com/keys" target="_blank">console.groq.com</a>');
    grid.appendChild(sttHint);

    grid.appendChild(renderToggleField('relayEnabled', t('Talk to other mochis', 'Hablar con otros mochis'), !!mochi.relayEnabled, { className: 'full-width' }));

    const mode = normalizeMode(mochi.mode);
    const provider = mochi.standardProvider || 'openrouter';

    const aiBrain = renderSelectField('mode', t('AI Brain', 'Cerebro AI'), [
      { value: 'standard', labelEn: 'Standard (API key only)', labelEs: 'Standard (solo API key)' },
      { value: 'agent', labelEn: 'AI Agent', labelEs: 'AI Agent' },
      { value: 'terminal', labelEn: TERMINAL_MODE_LABEL_EN, labelEs: TERMINAL_MODE_LABEL_ES },
      { value: 'off', labelEn: 'Off', labelEs: 'Apagado' }
    ], mode, { className: 'full-width ai-core-field' });

    const aiCorePanel = document.createElement('div');
    aiCorePanel.className = 'ai-core-panel';
    aiCorePanel.appendChild(aiBrain);

    if (mode === 'standard') {
      aiCorePanel.appendChild(renderSelectField('standardProvider', t('Provider', 'Proveedor'), [
        { value: 'openrouter', labelEn: 'OpenRouter', labelEs: 'OpenRouter' },
        { value: 'ollama', labelEn: 'Ollama', labelEs: 'Ollama' }
      ], provider, { className: 'ai-core-field' }));

      if (provider === 'openrouter') {
        aiCorePanel.appendChild(renderInputField('openrouterApiKey', 'API Key', mochi.openrouterApiKey, 'password', t('Paste your OpenRouter API key', 'Pega tu API key de OpenRouter'), { className: 'ai-core-field' }));
        aiCorePanel.appendChild(renderSelectField('openrouterModel', t('Model', 'Modelo'), [
          { value: 'random', labelEn: 'Random', labelEs: 'Aleatorio' },
          { value: 'google/gemini-2.0-flash-001', labelEn: 'Gemini 2.0 Flash', labelEs: 'Gemini 2.0 Flash' },
          { value: 'anthropic/claude-sonnet-4', labelEn: 'Claude Sonnet 4', labelEs: 'Claude Sonnet 4' },
          { value: 'meta-llama/llama-4-maverick', labelEn: 'Llama 4 Maverick', labelEs: 'Llama 4 Maverick' }
        ], mochi.openrouterModel || 'random', { className: 'ai-core-field' }));
      } else if (provider === 'ollama') {
        aiCorePanel.appendChild(renderInputField('ollamaUrl', 'Ollama URL', mochi.ollamaUrl || 'http://127.0.0.1:11434', 'text', 'http://127.0.0.1:11434', { className: 'ai-core-field' }));
        aiCorePanel.appendChild(renderInputField('ollamaModel', t('Model', 'Modelo'), mochi.ollamaModel || DEFAULT_OLLAMA_MODEL, 'text', DEFAULT_OLLAMA_MODEL, { className: 'ai-core-field' }));

        const detectedField = document.createElement('div');
        detectedField.className = 'ai-field ai-core-field';

        const detectedLabel = document.createElement('label');
        detectedLabel.className = 'ai-label';
        detectedLabel.textContent = t('Detected models', 'Modelos detectados');

        const detectedRow = document.createElement('div');
        detectedRow.className = 'ollama-model-row';

        const select = document.createElement('select');
        select.className = 'ai-select';
        select.dataset.field = 'ollamaModelSelect';
        select.dataset.mochiId = mochi.id;
        select.id = `select-ollamaModel-${mochi.id}`;
        const modelNames = ollamaModelCatalog.get(mochi.id) || [];
        setOllamaSelectOptions(select, modelNames, mochi.ollamaModel || DEFAULT_OLLAMA_MODEL);
        if (ollamaModelLoading.has(mochi.id)) {
          select.disabled = true;
        }

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'control-btn mini-btn';
        refreshBtn.dataset.action = 'refresh-ollama-models';
        refreshBtn.dataset.mochiId = mochi.id;
        refreshBtn.textContent = ollamaModelLoading.has(mochi.id) ? t('Loading...', 'Cargando...') : t('Refresh', 'Actualizar');
        refreshBtn.disabled = ollamaModelLoading.has(mochi.id);

        detectedRow.appendChild(select);
        detectedRow.appendChild(refreshBtn);
        detectedField.appendChild(detectedLabel);
        detectedField.appendChild(detectedRow);

        const hint = document.createElement('div');
        hint.className = 'helper-text';
        hint.textContent = getOllamaStatus(mochi.id);
        detectedField.appendChild(hint);

        aiCorePanel.appendChild(detectedField);
      }
      appendProviderHelpLink(aiCorePanel, provider);
    } else if (mode === 'agent') {
      aiCorePanel.appendChild(renderInputField('openclawGatewayUrl', t('Gateway URL', 'URL del Gateway'), mochi.openclawGatewayUrl || 'ws://127.0.0.1:18789', 'text', 'ws://127.0.0.1:18789', { className: 'ai-core-field' }));
      aiCorePanel.appendChild(
        renderInputField(
          'openclawAgentName',
          t('Agent Name', 'Nombre del agente'),
          mochi.openclawAgentName || defaultOpenClawAgentName(index),
          'text',
          defaultOpenClawAgentName(index),
          { className: 'ai-core-field' }
        )
      );
      aiCorePanel.appendChild(renderInputField('openclawGatewayToken', t('Gateway Auth Token', 'Token de Auth del Gateway'), mochi.openclawGatewayToken, 'password', t('Enter gateway auth token', 'Ingresa el token de auth del gateway'), { className: 'ai-core-field' }));
      const openclawTokenHint = document.createElement('div');
      openclawTokenHint.className = 'helper-text';
      openclawTokenHint.textContent = t(
        'To get the token run: openclaw config get gateway.auth.token',
        'Para obtener el token ejecuta: openclaw config get gateway.auth.token'
      );
      aiCorePanel.appendChild(openclawTokenHint);
      const openclawNameHint = document.createElement('div');
      openclawNameHint.className = 'helper-text';
      openclawNameHint.textContent = t(
        "Agent name rules: letters, numbers, '-' and '_' only (max 32).",
        "Reglas del nombre del agente: solo letras, números, '-' y '_' (máx 32)."
      );
      aiCorePanel.appendChild(openclawNameHint);
      appendProviderHelpLink(aiCorePanel, 'openclaw');
    } else if (mode === 'terminal') {
      aiCorePanel.appendChild(
        renderInputField(
          'terminalDistro',
          t(TERMINAL_PROFILE_LABEL_EN, TERMINAL_PROFILE_LABEL_ES),
          normalizeTerminalProfile(mochi.terminalDistro),
          'text',
          TERMINAL_PROFILE_PLACEHOLDER,
          { className: 'ai-core-field' }
        )
      );
      aiCorePanel.appendChild(
        renderInputField(
          'terminalCwd',
          t('Working directory', 'Directorio de trabajo'),
          mochi.terminalCwd || '',
          'text',
          '/home/username',
          { className: 'ai-core-field' }
        )
      );
      aiCorePanel.appendChild(
        renderToggleField(
          'terminalNotifyOnFinish',
          t('Notify when task finishes', 'Notificar al terminar tarea'),
          mochi.terminalNotifyOnFinish !== false,
          { className: 'full-width ai-core-field' }
        )
      );
      const terminalHint = document.createElement('div');
      terminalHint.className = 'helper-text';
      terminalHint.textContent = t(
        TERMINAL_HINT_EN,
        TERMINAL_HINT_ES
      );
      aiCorePanel.appendChild(terminalHint);
    }
    // mode === 'off' shows nothing extra

    const chatStyleBlock = document.createElement('div');
    chatStyleBlock.className = 'mochi-chat-style-section';

    const chatStyleHeader = document.createElement('div');
    chatStyleHeader.className = 'chat-style-toggle open';
    chatStyleHeader.textContent = t('Chat Style', 'Estilo de chat');

    const chatStyleGrid = document.createElement('div');
    chatStyleGrid.className = 'chat-style-grid open';

    chatStyleGrid.appendChild(renderSelectField('chatThemePreset', t('Chat Theme', 'Tema de chat'), [
      { value: 'custom', labelEn: 'Custom', labelEs: 'Personalizado' },
      { value: 'random', labelEn: 'Random', labelEs: 'Aleatorio' },
      ...CHAT_THEME_OPTIONS
    ], inferThemePreset(mochi)));
    chatStyleGrid.appendChild(renderInputField('chatThemeColor', t('Theme Color', 'Color del tema'), mochi.chatThemeColor || '#3b1a77', 'color', '#3b1a77'));
    chatStyleGrid.appendChild(renderInputField('chatBgColor', t('Background', 'Fondo'), mochi.chatBgColor || '#f0e8ff', 'color', '#f0e8ff'));
    chatStyleGrid.appendChild(renderSelectField('chatBubbleStyle', t('Bubble Style', 'Estilo de burbuja'), CHAT_BUBBLE_STYLES, mochi.chatBubbleStyle || 'glass'));
    chatStyleGrid.appendChild(renderSelectField('chatFontSize', t('Font Size', 'Tamaño de texto'), [
      { value: 'small', labelEn: 'Small', labelEs: 'Pequeño' },
      { value: 'medium', labelEn: 'Medium', labelEs: 'Mediano' },
      { value: 'large', labelEn: 'Large', labelEs: 'Grande' }
    ], mochi.chatFontSize || 'medium'));
    chatStyleGrid.appendChild(renderSelectField('chatWidth', t('Chat Width', 'Ancho del chat'), [
      { value: 'small', labelEn: 'Narrow', labelEs: 'Angosto' },
      { value: 'medium', labelEn: 'Medium', labelEs: 'Mediano' },
      { value: 'large', labelEn: 'Wide', labelEs: 'Ancho' }
    ], mochi.chatWidth || 'medium'));

    chatStyleBlock.appendChild(chatStyleHeader);
    chatStyleBlock.appendChild(chatStyleGrid);

    card.appendChild(header);
    card.appendChild(preview);
    card.appendChild(grid);
    card.appendChild(aiCorePanel);
    card.appendChild(chatStyleBlock);
    mochiList.appendChild(card);
  });
}

function applyConfig(next) {
  const previousLanguage = getUiLanguage();
  const previousPopupTheme = currentConfig.popupTheme || 'random';
  currentConfig = { ...currentConfig, ...next };
  refreshNftCharacterCatalog(currentConfig?.nftCharacters);
  if (next.mochiLanguage !== undefined) {
    uiLanguage = next.mochiLanguage === 'es' ? 'es' : (next.mochiLanguage === 'en' ? 'en' : detectBrowserLanguage());
  } else if (!uiLanguage) {
    uiLanguage = currentConfig.mochiLanguage === 'es' || currentConfig.mochiLanguage === 'en'
      ? currentConfig.mochiLanguage
      : detectBrowserLanguage();
  }
  const languageChanged = previousLanguage !== getUiLanguage();

  const popupTheme = currentConfig.popupTheme || 'random';
  const popupThemeChanged = popupTheme !== previousPopupTheme;
  applyTheme(popupTheme, popupThemeChanged);
  populatePopupThemeSelect(popupTheme);
  populateLanguageSelect(getUiLanguage());
  const uiTextScale = currentConfig.uiTextScale ?? 1;
  populateUiTextScaleSelect(uiTextScale);
  currentConfig.uiTextScale = applyUiTextScale(uiTextScale);
  setPopupLabels();

  if (next.enabled !== undefined && enabledToggle) {
    enabledToggle.checked = !!next.enabled;
    enabledToggleRow?.classList.toggle('active', !!next.enabled);
  }

  if (next.mochis) {
    mochis = normalizeMochiIds(next.mochis);
    if (selectedMochiIndex >= mochis.length) {
      selectedMochiIndex = Math.max(0, mochis.length - 1);
    }
    renderMochiSelector();
    renderMochiCards();
  }

  if (next.mochiCount !== undefined && !next.mochis) {
    while (mochis.length < next.mochiCount) addMochi();
    while (mochis.length > next.mochiCount) removeMochi(mochis.length - 1);
  }

  if (next.aiMode !== undefined && aiModeSelect) {
    aiModeSelect.value = next.aiMode;
  }

  if (next.openrouterApiKey !== undefined && openRouterKey) {
    openRouterKey.value = next.openrouterApiKey || '';
  }

  if (next.openrouterModel !== undefined && openRouterModel) {
    openRouterModel.value = next.openrouterModel || 'google/gemini-2.0-flash-001';
  }

  if (next.ollamaUrl !== undefined && ollamaUrl) {
    ollamaUrl.value = next.ollamaUrl || 'http://127.0.0.1:11434';
  }

  if (next.ollamaModel !== undefined && ollamaModel) {
    ollamaModel.value = next.ollamaModel || 'gemma3:1b';
  }

  if (next.openclawUrl !== undefined && openclawUrl) {
    openclawUrl.value = next.openclawUrl || 'ws://127.0.0.1:18789';
  }

  if (next.openclawToken !== undefined && openclawToken) {
    openclawToken.value = next.openclawToken || '';
  }

  if (next.showMochis !== undefined && globalMochiToggle) {
    globalMochiToggle.checked = !!next.showMochis;
  }

  if (next.startAtLogin !== undefined && startOnStartupToggle) {
    startOnStartupToggle.checked = !!next.startAtLogin;
  }

  if (next.startMinimized !== undefined && startMinimizedToggle) {
    startMinimizedToggle.checked = !!next.startMinimized;
  }

  if (languageChanged && !next.mochis) {
    renderMochiSelector();
    renderMochiCards();
  }

  updateStats();
  updateAIModeVisibility();
}

function registerHandlers() {
  if (enabledToggle) {
    enabledToggle.addEventListener('change', () => {
      const enabled = enabledToggle.checked;
      enabledToggleRow?.classList.toggle('active', enabled);
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ enabled });
      }
      updateStats();
    });
  }

  // Global mochi visibility toggle
  if (globalMochiToggle) {
    globalMochiToggle.addEventListener('change', () => {
      const showMochis = globalMochiToggle.checked;
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ showMochis });
      }
      // Update visibility of all mochis
      mochis.forEach(s => {
        s.enabled = showMochis;
      });
    });
  }

  if (startOnStartupToggle) {
    startOnStartupToggle.addEventListener('change', () => {
      const startAtLogin = startOnStartupToggle.checked;
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ startAtLogin });
      }
    });
  }

  if (startMinimizedToggle) {
    startMinimizedToggle.addEventListener('change', () => {
      const startMinimized = startMinimizedToggle.checked;
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ startMinimized });
      }
    });
  }

  // Show "Create Desktop Shortcut" button only on Windows
  if (createShortcutBtn && navigator.platform && navigator.platform.startsWith('Win')) {
    createShortcutBtn.style.display = '';
    createShortcutBtn.addEventListener('click', async () => {
      createShortcutBtn.disabled = true;
      createShortcutBtn.textContent = 'Creating...';
      if (createShortcutStatus) {
        createShortcutStatus.style.display = 'none';
      }
      try {
        const result = await window.mochiApi.createDesktopShortcut();
        if (result?.ok) {
          createShortcutBtn.textContent = 'Create Desktop Shortcut';
          createShortcutBtn.disabled = false;
          if (createShortcutStatus) {
            createShortcutStatus.textContent = 'Shortcut created on your desktop!';
            createShortcutStatus.style.display = '';
          }
        } else {
          createShortcutBtn.textContent = 'Create Desktop Shortcut';
          createShortcutBtn.disabled = false;
          if (createShortcutStatus) {
            createShortcutStatus.textContent = result?.error || 'Failed to create shortcut';
            createShortcutStatus.style.display = '';
          }
        }
      } catch (err) {
        createShortcutBtn.textContent = 'Create Desktop Shortcut';
        createShortcutBtn.disabled = false;
        if (createShortcutStatus) {
          createShortcutStatus.textContent = 'Failed to create shortcut';
          createShortcutStatus.style.display = '';
        }
      }
    });
  }

  if (popupThemeSelect) {
    popupThemeSelect.addEventListener('change', () => {
      const value = popupThemeSelect.value || 'random';
      currentConfig.popupTheme = value;
      applyTheme(value, true);
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ popupTheme: value });
      }
    });
  }

  if (popupLanguageSelect) {
    popupLanguageSelect.addEventListener('change', () => {
      const value = popupLanguageSelect.value === 'es' ? 'es' : 'en';
      uiLanguage = value;
      currentConfig.mochiLanguage = value;
      populatePopupThemeSelect(currentConfig.popupTheme || 'random');
      populateLanguageSelect(value);
      setPopupLabels();
      renderMochiSelector();
      renderMochiCards();
      updateStats();
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ mochiLanguage: value });
      }
    });
  }

  if (uiTextScaleSelect) {
    uiTextScaleSelect.addEventListener('change', () => {
      const uiTextScale = applyUiTextScale(uiTextScaleSelect.value || 1);
      currentConfig.uiTextScale = uiTextScale;
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ uiTextScale });
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    const action = getUiTextScaleShortcutAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const nextScale = applyUiTextScale(stepUiTextScale(currentConfig.uiTextScale ?? 1, action));
    currentConfig.uiTextScale = nextScale;
    if (window.mochiApi) {
      window.mochiApi.updateConfig({ uiTextScale: nextScale });
    }
  }, true);

  if (addMochiBtn) addMochiBtn.addEventListener('click', addMochi);

  if (mochiList) {
    mochiList.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const nftCtaLink = target.closest('a.mochi-nft-cta');
      if (nftCtaLink) {
        event.preventDefault();
        event.stopPropagation();
        await openExternalUrlWithBrowserChoice(nftCtaLink.href, 'nft-auction');
        return;
      }

      const sourceBtn = target.closest('[data-action="character-source"]');
      if (sourceBtn) {
        const card = sourceBtn.closest('.mochi-card');
        if (!card) return;
        const index = Number(card.dataset.index);
        if (Number.isNaN(index)) return;
        const source = sourceBtn.dataset.source;
        if (source === 'free') {
          const nextFree = CHARACTER_OPTIONS[0]?.id || 'mochi';
          updateMochiConfig(index, { characterSource: 'free', character: nextFree });
        } else if (source === 'nft') {
          const patch = { characterSource: 'nft' };
          const nextNft = nftCharacters[0]?.id;
          if (nextNft) patch.character = nextNft;
          updateMochiConfig(index, patch);
        }
        return;
      }

      const refreshBtn = target.closest('[data-action="refresh-ollama-models"]');
      if (refreshBtn) {
        const card = refreshBtn.closest('.mochi-card');
        if (!card) return;
        const index = Number(card.dataset.index);
        if (!Number.isNaN(index)) {
          refreshOllamaModelsForMochi(index);
        }
        return;
      }

      const removeBtn = target.closest('[data-action="remove"]');
      if (removeBtn) {
        const card = removeBtn.closest('.mochi-card');
        if (!card) return;
        const index = Number(card.dataset.index);
        if (!Number.isNaN(index)) removeMochi(index);
      }
    });

    mochiList.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target || target.disabled) return;
      const field = target.dataset.field;
      if (!field) return;
      const card = target.closest('.mochi-card');
      if (!card) return;
      const index = Number(card.dataset.index);
      if (Number.isNaN(index)) return;

      if (field === 'ollamaModelSelect') {
        const selected = target.value;
        if (selected && selected !== 'custom') {
          updateMochiConfig(index, { ollamaModel: selected });
        } else {
          const input = card.querySelector('input[data-field="ollamaModel"]');
          if (input) input.focus();
        }
        return;
      }

      let value;
      if (target.type === 'checkbox') {
        value = target.checked;
      } else if (target.type === 'range') {
        value = parseFloat(target.value);
      } else {
        value = target.value;
      }

      if (field === 'openclawAgentName') {
        value = normalizeOpenClawAgentName(value, defaultOpenClawAgentName(index));
        target.value = value;
      }
      if (field === 'terminalDistro') {
        value = normalizeTerminalProfile(value);
        target.value = value;
      }
      if (field === 'terminalCwd') {
        value = `${value || ''}`.trim();
        target.value = value;
      }

      if (field === 'chatThemePreset') {
        if (value === 'custom') {
          updateMochiConfig(index, { chatThemePreset: 'custom' });
        } else if (value === 'random') {
          const preset = CHAT_THEME_PRESETS[Math.floor(Math.random() * CHAT_THEME_PRESETS.length)];
          updateMochiConfig(index, {
            chatThemePreset: 'random',
            chatTheme: preset.id,
            chatThemeColor: preset.theme,
            chatBgColor: preset.bg,
            chatBubbleStyle: preset.bubble
          });
        } else {
          const preset = CHAT_THEME_PRESETS.find((item) => item.id === value);
          if (preset) {
            updateMochiConfig(index, {
              chatThemePreset: preset.id,
              chatTheme: preset.id,
              chatThemeColor: preset.theme,
              chatBgColor: preset.bg,
              chatBubbleStyle: preset.bubble
            });
          }
        }
        return;
      }

      const patch = { [field]: value };
      if (field === 'character') {
        const source = target.dataset.source;
        patch.characterSource = source === 'nft' || isNftCharacterId(value) ? 'nft' : 'free';
      }
      if (field === 'chatThemeColor' || field === 'chatBgColor' || field === 'chatBubbleStyle') {
        patch.chatThemePreset = 'custom';
      }
      if (field === 'chatWidth') {
        patch.chatWidthPx = null;
      }
      if (field === 'ttsVoiceProfile') {
        patch.ttsVoiceId = '';
      }
      if (field === 'ttsEnabled' && value === true && !mochis[index]?.ttsVoiceProfile) {
        patch.ttsVoiceProfile = pickRandomVoiceProfile();
      }

      updateMochiConfig(index, patch);

      if (field === 'ollamaUrl') {
        const mochi = mochis[index];
        if (mochi?.id) {
          ollamaModelCatalog.delete(mochi.id);
          ollamaModelStatus.set(mochi.id, t('Refresh to fetch local Ollama models.', 'Pulsa actualizar para cargar modelos locales de Ollama.'));
        }
      }
    });
  }

  if (aiModeSelect) {
    aiModeSelect.addEventListener('change', () => {
      const mode = aiModeSelect.value;
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ aiMode: mode });
      }
      updateAIModeVisibility();
      updateStats();
    });
  }

  if (openRouterKey) {
    openRouterKey.addEventListener('change', () => {
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ openrouterApiKey: openRouterKey.value.trim() });
      }
    });
  }

  if (openRouterModel) {
    openRouterModel.addEventListener('change', () => {
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ openrouterModel: openRouterModel.value });
      }
    });
  }

  if (ollamaUrl) {
    ollamaUrl.addEventListener('change', () => {
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ ollamaUrl: ollamaUrl.value.trim() });
      }
    });
  }

  if (ollamaModel) {
    ollamaModel.addEventListener('change', () => {
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ ollamaModel: ollamaModel.value.trim() });
      }
    });
  }

  if (openclawUrl) {
    openclawUrl.addEventListener('change', () => {
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ openclawUrl: openclawUrl.value.trim() });
      }
    });
  }

  if (openclawToken) {
    openclawToken.addEventListener('change', () => {
      if (window.mochiApi) {
        window.mochiApi.updateConfig({ openclawToken: openclawToken.value.trim() });
      }
    });
  }

  if (aiTestBtn) {
    aiTestBtn.addEventListener('click', async () => {
      if (!window.mochiApi) return;
      const mode = aiModeSelect?.value || 'openrouter';
      aiTestStatus.textContent = t('Testing...', 'Probando...');
      let result;
      if (mode === 'openrouter') {
        result = await window.mochiApi.testOpenRouter({ prompt: aiTestPrompt.value || 'Say hello' });
      } else if (mode === 'ollama') {
        result = await window.mochiApi.testOllama({ prompt: aiTestPrompt.value || 'Say hello' });
      } else if (mode === 'openclaw') {
        result = await window.mochiApi.testOpenClaw({ prompt: aiTestPrompt.value || 'Say hello' });
      }
      if (result?.ok) {
        aiTestStatus.textContent = t('Connection OK.', 'Conexión OK.');
      } else {
        aiTestStatus.textContent = `${t('Error', 'Error')}: ${result?.error || t('Unknown', 'Desconocido')}`;
      }
    });
  }
}

async function init() {
  if (window.mochiApi) {
    const cfg = await window.mochiApi.getConfig();
    applyConfig(cfg);
    
    // Initialize globalApiConfig from loaded mochis
    if (mochis.length > 0) {
      const first = mochis[0];
      globalApiConfig = {
        openrouterApiKey: first.openrouterApiKey || '',
        openrouterModel: first.openrouterModel || 'random',
        ollamaUrl: first.ollamaUrl || 'http://127.0.0.1:11434',
        ollamaModel: first.ollamaModel || 'gemma3:1b',
        openclawUrl: first.openclawUrl || 'ws://127.0.0.1:18789',
        openclawToken: first.openclawToken || '',
        openclawGatewayUrl: first.openclawGatewayUrl || 'ws://127.0.0.1:18789',
        openclawGatewayToken: first.openclawGatewayToken || '',
        openclawAgentName: normalizeOpenClawAgentName(first.openclawAgentName, defaultOpenClawAgentName(first.id || 0)),
        terminalDistro: normalizeTerminalProfile(first.terminalDistro),
        terminalCwd: `${first.terminalCwd || ''}`.trim(),
        terminalNotifyOnFinish: first.terminalNotifyOnFinish !== false
      };
    }
  } else {
    currentConfig = {
      ...currentConfig,
      enabled: true,
      aiMode: 'standard',
      popupTheme: 'random',
      uiTextScale: 1,
      mochiLanguage: detectBrowserLanguage()
    };
    mochis = [{
      id: 'mochi-1',
      character: 'mochi',
      characterSource: 'free',
      size: 'medium',
      personality: 'random',
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
      ttsVoiceProfile: pickRandomVoiceProfile(),
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
      ollamaUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'gemma3:1b',
      openclawUrl: 'ws://127.0.0.1:18789',
      openclawToken: '',
      openclawGatewayUrl: 'ws://127.0.0.1:18789',
      openclawGatewayToken: '',
      openclawAgentName: defaultOpenClawAgentName(0),
      terminalDistro: DEFAULT_TERMINAL_PROFILE,
      terminalCwd: '',
      terminalNotifyOnFinish: true
    }];
    renderMochiSelector();
    renderMochiCards();
  }

  if (!uiLanguage) {
    uiLanguage = currentConfig.mochiLanguage === 'es' || currentConfig.mochiLanguage === 'en'
      ? currentConfig.mochiLanguage
      : detectBrowserLanguage();
  }
  applyTheme(currentConfig.popupTheme || 'random', true);
  populatePopupThemeSelect(currentConfig.popupTheme || 'random');
  populateLanguageSelect(getUiLanguage());
  populateUiTextScaleSelect(currentConfig.uiTextScale ?? 1);
  currentConfig.uiTextScale = applyUiTextScale(currentConfig.uiTextScale ?? 1);
  setPopupLabels();

  registerHandlers();

  if (window.mochiApi) {
    window.mochiApi.onConfigUpdated((next) => {
      applyConfig(next);
    });
  }

  updateStats();
  updateAIModeVisibility();
}

init();
