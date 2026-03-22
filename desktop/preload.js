const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('mochiApi', {
  // Clipboard (native Electron)
  clipboardReadText: () => clipboard.readText(),
  clipboardWriteText: (text) => clipboard.writeText(String(text || '')),

  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (payload) => ipcRenderer.send('update-config', payload),
  onConfigUpdated: (handler) => ipcRenderer.on('config-updated', (_, data) => handler(data)),

  // Screen info (bounds + workArea for taskbar detection)
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  getCursorScreenPoint: () => ipcRenderer.invoke('get-cursor-screen-point'),

  // Characters
  getCharactersDir: () => ipcRenderer.invoke('get-characters-dir'),
  listCharacters: () => ipcRenderer.invoke('list-characters'),

  // AI
  getPersonalities: () => ipcRenderer.invoke('get-personalities'),

  // Conversation history
  getConversation: (mochiId) => ipcRenderer.invoke('get-conversation', mochiId),
  saveConversation: (mochiId, messages) => ipcRenderer.send('save-conversation', mochiId, messages),
  clearConversation: (mochiId) => ipcRenderer.send('clear-conversation', mochiId),

  // AI streaming
  aiChatStream: (params) => ipcRenderer.invoke('ai-chat-stream', params),
  onAiStreamDelta: (handler) => ipcRenderer.on('ai-stream-delta', (_, data) => handler(data)),
  terminalExec: (params) => ipcRenderer.invoke('terminal-exec', params),
  terminalAutocomplete: (params) => ipcRenderer.invoke('terminal-autocomplete', params),
  terminalCloseSession: (params) => ipcRenderer.invoke('terminal-close-session', params),
  terminalSessionStart: (params) => ipcRenderer.invoke('terminal-session-start', params),
  terminalSessionWrite: (params) => ipcRenderer.invoke('terminal-session-write', params),
  terminalSessionRunLine: (params) => ipcRenderer.invoke('terminal-session-run-line', params),
  terminalSessionResize: (params) => ipcRenderer.invoke('terminal-session-resize', params),
  terminalSessionStop: (params) => ipcRenderer.invoke('terminal-session-stop', params),
  onTerminalStreamDelta: (handler) => ipcRenderer.on('terminal-stream-delta', (_, data) => handler(data)),
  onTerminalStreamDone: (handler) => ipcRenderer.on('terminal-stream-done', (_, data) => handler(data)),
  onTerminalStreamError: (handler) => ipcRenderer.on('terminal-stream-error', (_, data) => handler(data)),
  onTerminalSessionData: (handler) => ipcRenderer.on('terminal-session-data', (_, data) => handler(data)),
  onTerminalSessionExit: (handler) => ipcRenderer.on('terminal-session-exit', (_, data) => handler(data)),
  onTerminalSessionState: (handler) => ipcRenderer.on('terminal-session-state', (_, data) => handler(data)),

  // Speech-to-text (Whisper API)
  transcribeAudio: (params) => ipcRenderer.invoke('transcribe-audio', params),

  // Testing
  testOpenRouter: (payload) => ipcRenderer.invoke('test-openrouter', payload),
  testOllama: (payload) => ipcRenderer.invoke('test-ollama', payload),
  testOpenClaw: (payload) => ipcRenderer.invoke('test-openclaw', payload),
  listOllamaModels: (payload) => ipcRenderer.invoke('list-ollama-models', payload),

  // Settings
  openSettings: () => ipcRenderer.send('open-settings'),
  openUrlWithBrowserChoice: (payload) => ipcRenderer.invoke('open-url-with-browser-choice', payload),
  createDesktopShortcut: () => ipcRenderer.invoke('create-desktop-shortcut'),

  // Call back mochis from off-screen
  onCallBack: (handler) => ipcRenderer.on('call-back-mochi', (_, data) => handler(data)),

  // Dismiss mochis (send off-screen)
  onDismiss: (handler) => ipcRenderer.on('dismiss-mochi', (_, data) => handler(data)),

  // Mouse events control for click-through overlay
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),

  // Update notification helpers
  onUpdateAvailable: (handler) => ipcRenderer.on('update-available', (_, data) => handler(data)),
  onUpdateDownloadStart: (handler) => ipcRenderer.on('update-download-start', (_, data) => handler(data)),
  onUpdateDownloadProgress: (handler) => ipcRenderer.on('update-download-progress', (_, data) => handler(data)),
  onUpdateDownloadComplete: (handler) => ipcRenderer.on('update-download-complete', (_, data) => handler(data)),
  onUpdateDownloadError: (handler) => ipcRenderer.on('update-download-error', (_, data) => handler(data)),
  onUpdateInstallStart: (handler) => ipcRenderer.on('update-install-start', (_, data) => handler(data)),
  downloadUpdateAsset: (payload) => ipcRenderer.invoke('update-download-asset', payload),
  installDownloadedUpdate: (payload) => ipcRenderer.invoke('update-install', payload)
});
