/**
 * background.js - Extension service worker
 *
 * Handles EVM wallet connection and message routing.
 *
 * ARCHITECTURE NOTE:
 * The dapp (dapp.html/dapp.js) is hosted on Vercel, not in the extension.
 * Messages from the dapp come through dapp_content_script.js (injected into the page).
 * When sending messages back, we use chrome.tabs.sendMessage to the sender's tab ID.
 */

const DEBUG = false;
const ALL_SITES_ORIGINS = ['http://*/*', 'https://*/*'];
const PENDING_ENABLE_TTL_MS = 2 * 60 * 1000;
const REQUIRED_ORIGINS = new Set([
  'https://mochi.dev',
  'https://www.mochi.dev',
  'https://openrouter.ai',
  'http://127.0.0.1',
  'http://localhost',
  'ws://127.0.0.1',
  'ws://localhost'
]);

const OPENCLAW_IDLE_TIMEOUT_MS = 12 * 1000;

// Click-to-enable per-site injection:
// - Request optional host permissions for the current site (origin/*).
// - Register a persistent content script for that origin.
// - On startup, re-register scripts for previously enabled origins.

// Helper function to send message to a specific tab (used for Vercel-hosted dapp)
function sendMessageToTab(tabId, message) {
  if (tabId) {
    if (DEBUG) console.log('[Background] Sending message to tab:', tabId, message);
    chrome.tabs.sendMessage(tabId, message).catch(err => {
      if (DEBUG) console.warn('[Background] Could not send message to tab:', err.message);
    });
  }
}

function storageLocalGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageLocalSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function storageSyncGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function storageSyncSet(obj) {
  return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
}

// Firefox MV3 does not support chrome.storage.session.
// Emulate it with chrome.storage.local using a "_session_" key prefix.
// Session keys are cleared on startup to mimic session-scoped storage.
const SESSION_PREFIX = '_session_';

function storageSessionGet(keys) {
  const keyArr = Array.isArray(keys) ? keys : [keys];
  const prefixed = keyArr.map(k => SESSION_PREFIX + k);
  return new Promise((resolve) => {
    chrome.storage.local.get(prefixed, (data) => {
      const result = {};
      for (const k of keyArr) {
        if (data[SESSION_PREFIX + k] !== undefined) {
          result[k] = data[SESSION_PREFIX + k];
        }
      }
      resolve(result);
    });
  });
}

function storageSessionSet(obj) {
  const prefixed = {};
  for (const [k, v] of Object.entries(obj)) {
    prefixed[SESSION_PREFIX + k] = v;
  }
  return new Promise((resolve) => chrome.storage.local.set(prefixed, resolve));
}

function storageSessionRemove(keys) {
  const keyArr = Array.isArray(keys) ? keys : [keys];
  const prefixed = keyArr.map(k => SESSION_PREFIX + k);
  return new Promise((resolve) => chrome.storage.local.remove(prefixed, resolve));
}

function clearAllSessionKeys() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (all) => {
      const sessionKeys = Object.keys(all).filter(k => k.startsWith(SESSION_PREFIX));
      if (sessionKeys.length > 0) {
        chrome.storage.local.remove(sessionKeys, resolve);
      } else {
        resolve();
      }
    });
  });
}

function permissionsContains(origins) {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins }, (ok) => resolve(!!ok));
  });
}

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function normalizeOrigin(origin) {
  if (!origin) return '';
  const o = String(origin);
  if (!o.startsWith('http://') && !o.startsWith('https://')) return '';
  return o.replace(/\/$/, '');
}

function originToMatchPattern(origin) {
  const o = normalizeOrigin(origin);
  return o ? `${o}/*` : '';
}

function contentScriptIdForOrigin(origin) {
  const o = normalizeOrigin(origin);
  return o ? `mochi_site_${fnv1a32(o)}` : '';
}

function isContentScriptRegistered(id) {
  return new Promise((resolve) => {
    chrome.scripting.getRegisteredContentScripts((scripts) => {
      const found = Array.isArray(scripts) && scripts.some((s) => s.id === id);
      resolve(found);
    });
  });
}

async function scriptingRegisterContentScript(origin) {
  const id = contentScriptIdForOrigin(origin);
  const match = originToMatchPattern(origin);
  if (!id || !match) return false;
  if (await isContentScriptRegistered(id)) return true;

  return new Promise((resolve, reject) => {
    chrome.scripting.registerContentScripts([{
      id,
      matches: [match],
      js: ['content.js'],
      css: ['style.css'],
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    }], () => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message || 'registerContentScripts failed'));
      resolve(true);
    });
  });
}

async function scriptingUnregisterContentScript(origin) {
  const id = contentScriptIdForOrigin(origin);
  if (!id) return true;
  if (!await isContentScriptRegistered(id)) return true;
  return new Promise((resolve) => {
    chrome.scripting.unregisterContentScripts({ ids: [id] }, () => resolve(true));
  });
}

async function scriptingRegisterAllSites() {
  const id = 'mochi_all_sites';
  if (await isContentScriptRegistered(id)) return true;
  return new Promise((resolve, reject) => {
    chrome.scripting.registerContentScripts([{
      id,
      matches: ALL_SITES_ORIGINS,
      js: ['content.js'],
      css: ['style.css'],
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    }], () => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message || 'registerContentScripts(all) failed'));
      resolve(true);
    });
  });
}

async function scriptingUnregisterAllSites() {
  const id = 'mochi_all_sites';
  if (!await isContentScriptRegistered(id)) return true;
  return new Promise((resolve) => {
    chrome.scripting.unregisterContentScripts({ ids: [id] }, () => resolve(true));
  });
}


async function getEnabledOrigins() {
  const data = await storageLocalGet(['enabledOrigins']);
  return Array.isArray(data.enabledOrigins) ? data.enabledOrigins : [];
}

async function setEnabledOrigins(list) {
  await storageLocalSet({ enabledOrigins: list });
}

async function ensureInjectedNow(tabId) {
  await new Promise((resolve) => {
    chrome.scripting.insertCSS({ target: { tabId }, files: ['style.css'] }, () => resolve(true));
  });
  await new Promise((resolve) => {
    chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => resolve(true));
  });
}

function isInjectableUrl(url) {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

async function injectIntoAllEligibleTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({}, async (tabs) => {
      const list = Array.isArray(tabs) ? tabs : [];
      for (const tab of list) {
        if (!tab?.id) continue;
        if (!isInjectableUrl(tab.url)) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await ensureInjectedNow(tab.id);
        } catch {}
      }
      resolve(true);
    });
  });
}

async function setVisibilityEnabledEverywhere() {
  await storageSyncSet({ disabledAll: false, disabledPages: [] });
}

async function setVisibilityDisabledEverywhere() {
  await storageSyncSet({ disabledAll: true, disabledPages: [] });
}

async function removeDisabledPage(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return;
  const data = await storageSyncGet(['disabledPages']);
  const list = Array.isArray(data.disabledPages) ? data.disabledPages : [];
  const next = list.filter((item) => item !== normalized);
  if (next.length !== list.length) {
    await storageSyncSet({ disabledPages: next });
  }
}

function isPendingFresh(pending) {
  const createdAt = pending?.createdAt;
  if (typeof createdAt !== 'number') return false;
  return (Date.now() - createdAt) <= PENDING_ENABLE_TTL_MS;
}

async function handlePendingEnableSite(addedOrigins) {
  const data = await storageSessionGet(['pendingEnableSite']);
  const pending = data?.pendingEnableSite;
  if (!pending) return;
  if (!isPendingFresh(pending)) {
    await storageSessionRemove(['pendingEnableSite']);
    return;
  }

  const origin = normalizeOrigin(pending.origin);
  const tabId = pending.tabId;
  const match = originToMatchPattern(origin);
  if (!origin || !match) return;
  if (!Array.isArray(addedOrigins) || !addedOrigins.includes(match)) return;

  // Clear first to avoid double-processing if multiple onAdded events come in.
  await storageSessionRemove(['pendingEnableSite']);

  try {
    await registerOrigin(origin);
  } catch {}

  try {
    await storageSyncSet({ disabledAll: false });
    await removeDisabledPage(origin);
  } catch {}

  if (typeof tabId === 'number') {
    try { await ensureInjectedNow(tabId); } catch {}
  }
}

async function handlePendingEnableAllSites(addedOrigins) {
  const data = await storageSessionGet(['pendingEnableAllSites']);
  const pending = data?.pendingEnableAllSites;
  if (!pending) return;
  if (!isPendingFresh(pending)) {
    await storageSessionRemove(['pendingEnableAllSites']);
    return;
  }

  const hasAllSites = Array.isArray(addedOrigins)
    && (addedOrigins.includes(ALL_SITES_ORIGINS[0]) || addedOrigins.includes(ALL_SITES_ORIGINS[1]));
  if (!hasAllSites) return;

  await storageSessionRemove(['pendingEnableAllSites']);

  try {
    await scriptingRegisterAllSites();
    await storageLocalSet({ allSitesEnabled: true });
  } catch {}

  try {
    await setVisibilityEnabledEverywhere();
  } catch {}

  // Best-effort: inject immediately into open tabs so mochis appear without reload.
  try { await injectIntoAllEligibleTabs(); } catch {}

  const tabId = pending.tabId;
  if (typeof tabId === 'number') {
    try { await ensureInjectedNow(tabId); } catch {}
  }
}

async function registerOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return { error: 'Invalid site.' };

  try {
    await scriptingRegisterContentScript(normalized);
  } catch (e) {
    if (DEBUG) console.warn('[Background] registerContentScripts:', e && e.message);
  }

  const list = await getEnabledOrigins();
  if (!list.includes(normalized)) {
    list.push(normalized);
    await setEnabledOrigins(list);
  }

  return { enabled: true };
}

async function unregisterOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return { error: 'Invalid site.' };

  await scriptingUnregisterContentScript(normalized);

  const list = await getEnabledOrigins();
  const next = list.filter((o) => o !== normalized);
  if (next.length !== list.length) await setEnabledOrigins(next);

  return { enabled: false };
}

async function restoreRegisteredScripts() {
  const list = await getEnabledOrigins();
  const next = [];

  // Restore global "all sites" registration if the permission is still granted.
  try {
    const data = await storageLocalGet(['allSitesEnabled']);
    if (data.allSitesEnabled) {
      const ok = await permissionsContains(ALL_SITES_ORIGINS);
      if (!ok) {
        await storageLocalSet({ allSitesEnabled: false });
      } else {
        try { await scriptingRegisterAllSites(); } catch {}
      }
    }
  } catch {}

  for (const origin of list) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) continue;
    const match = originToMatchPattern(normalized);
    if (!match) continue;
    const ok = await permissionsContains([match]);
    if (!ok) continue;
    try {
      await scriptingRegisterContentScript(normalized);
    } catch {}
    next.push(normalized);
  }

  if (next.length !== list.length) {
    await setEnabledOrigins(next);
  }
}

chrome.runtime.onStartup?.addListener(() => {
  clearAllSessionKeys().then(() => restoreRegisteredScripts()).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  clearAllSessionKeys().then(() => restoreRegisteredScripts()).catch(() => {});
});

async function cleanupStalePending() {
  try {
    const data = await storageSessionGet(['pendingEnableSite', 'pendingEnableAllSites']);
    if (data?.pendingEnableSite && !isPendingFresh(data.pendingEnableSite)) {
      await storageSessionRemove(['pendingEnableSite']);
    }
    if (data?.pendingEnableAllSites && !isPendingFresh(data.pendingEnableAllSites)) {
      await storageSessionRemove(['pendingEnableAllSites']);
    }
  } catch {}
}

chrome.runtime.onStartup?.addListener(() => {
  cleanupStalePending().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  cleanupStalePending().catch(() => {});
});

chrome.permissions.onAdded.addListener((permissions) => {
  const origins = permissions?.origins || [];
  handlePendingEnableAllSites(origins).catch(() => {});
  handlePendingEnableSite(origins).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  // Initially set mochi as default character
  console.log('[Background] Extension installed, setting initial storage values.');
  chrome.storage.sync.set({
    character: 'mochi',
    behavior: 'wander', // Default to wander mode
    size: 'medium', // Set default size
    unlockedCharacters: { 'mochi': true }, // Mochi unlocked by default
    isConnected: false,
    connectedAddress: null,
    connectedNetwork: null,
    disabledAll: false,
    disabledPages: [],
    nftCharacters: []
  });
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const senderTabId = sender.tab?.id;

  // Popup-driven click-to-enable per-site control.
  if (request && request.type === 'getSiteStatus') {
    const origin = normalizeOrigin(request.origin);
    const match = originToMatchPattern(origin);
    if (!match) {
      sendResponse({ enabled: false, error: 'Invalid site' });
      return true;
    }
    permissionsContains([match]).then((ok) => {
      sendResponse({ enabled: !!ok });
    }).catch(() => {
      sendResponse({ enabled: false });
    });
    return true;
  }

  if (request && request.type === 'registerSite') {
    const origin = normalizeOrigin(request.origin);
    registerOrigin(origin).then(sendResponse).catch((e) => {
      sendResponse({ error: (e && e.message) || 'Failed to register site' });
    });
    return true;
  }

  if (request && request.type === 'unregisterSite') {
    const origin = normalizeOrigin(request.origin);
    unregisterOrigin(origin).then(sendResponse).catch((e) => {
      sendResponse({ error: (e && e.message) || 'Failed to unregister site' });
    });
    return true;
  }

  if (request && request.type === 'registerAllSites') {
    (async () => {
      try {
        await scriptingRegisterAllSites();
        await storageLocalSet({ allSitesEnabled: true });
        sendResponse({ enabled: true });
      } catch (e) {
        sendResponse({ error: (e && e.message) || 'Failed to register all sites' });
      }
    })();
    return true;
  }

  if (request && request.type === 'unregisterAllSites') {
    storageLocalSet({ allSitesEnabled: false }).then(async () => {
      await scriptingUnregisterAllSites();
      // Best-effort: hide any currently injected mochis.
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (!tab.id) return;
          chrome.tabs.sendMessage(tab.id, { action: 'shutdownMochis' }).catch(() => {});
        });
      });
      sendResponse({ enabled: false });
    }).catch((e) => {
      sendResponse({ error: (e && e.message) || 'Failed to unregister all sites' });
    });
    return true;
  }

  const dappAllowedOrigins = [
    'https://mochi.vercel.app/',
    'https://mochi.dev/',
    'https://www.mochi.dev/',
    'http://localhost:3000/'
  ];
  const dappMessageTypes = new Set([
    'walletConnected',
    'walletDisconnected',
    'revokePermissionsRequest',
    'setCharacter',
    'getCharacter',
    'setBehavior',
    'getBehavior',
    'setSize',
    'getSize',
    'getUnlockedCharacters',
    'getNftCharacters',
    'setNftCharacters',
    'pingExtension'
  ]);

  const senderUrl = sender.url || '';
  const isTrustedDappSender = dappAllowedOrigins.some((origin) => senderUrl.startsWith(origin));

  if (dappMessageTypes.has(request.type) && !isTrustedDappSender) {
    console.warn('[Background] Blocked untrusted dapp message:', request.type, 'from', senderUrl);
    sendResponse({ error: 'Untrusted sender' });
    return true;
  }

  if (request.type === 'walletConnected') {
    console.log('[Background] Received walletConnected message:', request.payload, 'from tab:', senderTabId);
    chrome.storage.sync.set({
      isConnected: true,
      connectedAddress: request.payload.publicKey,
      connectedNetwork: request.payload.network || null,
      unlockedCharacters: { 'mochi': true }
    }, () => {
      chrome.storage.sync.get('unlockedCharacters', (data) => {
        console.log('[Background] Sending updateUnlockedCharacters after walletConnected. Payload:', data.unlockedCharacters);
        sendMessageToTab(senderTabId, { type: 'EXTENSION_MESSAGE', payload: { type: 'updateUnlockedCharacters', payload: data.unlockedCharacters } });
      });
    });
    sendResponse({ status: 'Wallet connection received' });
    return true;
  } else if (request.type === 'walletDisconnected') {
    console.log('[Background] Received walletDisconnected message from tab:', senderTabId);
    chrome.storage.sync.set({
      isConnected: false,
      connectedAddress: null,
      connectedNetwork: null,
      unlockedCharacters: { 'mochi': true } // Only mochi unlocked on disconnect
    }, () => { // Add callback to ensure storage is set before sending message
      console.log('[Background] Sending updateUnlockedCharacters after walletDisconnected. Payload: {mochi: true}');
      // Send to the tab that sent the message
      sendMessageToTab(senderTabId, { type: 'EXTENSION_MESSAGE', payload: { type: 'updateUnlockedCharacters', payload: { 'mochi': true } } });
    });
    sendResponse({ status: 'Wallet disconnection received' });
    return true;
  } else if (request.type === 'revokePermissionsRequest') {
    console.log('[Background] Revoke permissions request received from tab:', senderTabId);
    chrome.storage.sync.set({
      isConnected: false,
      connectedAddress: null,
      connectedNetwork: null,
      unlockedCharacters: { 'mochi': true }
    }, () => {
      sendMessageToTab(senderTabId, { type: 'EXTENSION_MESSAGE', payload: { type: 'revokePermissionsFromBackground' } });
    });
    sendResponse({ status: 'Permissions revoked' });
    return true;
  } else if (request.type === 'masterKeyStatus') {
    getSessionMasterKey().then((sessionKey) => {
      chrome.storage.local.get(['masterKeyEnabled'], (data) => {
        const enabled = !!data.masterKeyEnabled;
        sendResponse({ locked: enabled ? !sessionKey : false });
      });
    }).catch(() => {
      sendResponse({ locked: true });
    });
    return true;
  } else if (request.type === 'setCharacter') {
    console.log('[Background] Received setCharacter message:', request.payload);
    chrome.storage.sync.set({ character: request.payload.character }, () => {
      sendResponse({ status: 'Character set' });
    });
    return true;
  } else if (request.type === 'getCharacter') {
    console.log('[Background] Received getCharacter message.');
    chrome.storage.sync.get('character', (data) => {
      console.log('[Background] Sending character:', data.character);
      sendResponse({ type: 'EXTENSION_RESPONSE', payload: { character: data.character } });
    });
    return true;
  } else if (request.type === 'setBehavior') {
    console.log('[Background] Received setBehavior message:', request.payload);
    chrome.storage.sync.set({ behavior: request.payload.behavior }, () => {
      sendResponse({ status: 'Behavior set' });
    });
    return true;
  } else if (request.type === 'getBehavior') {
    console.log('[Background] Received getBehavior message.');
    chrome.storage.sync.get('behavior', (data) => {
      console.log('[Background] Sending behavior:', data.behavior);
      sendResponse({ behavior: data.behavior });
    });
    return true;
  } else if (request.type === 'setSize') {
    console.log('[Background] Received setSize message:', request.payload);
    chrome.storage.sync.set({ size: request.payload.size }, () => {
      sendResponse({ status: 'Size set' });
    });
    return true;
  } else if (request.type === 'getSize') {
    console.log('[Background] Received getSize message.');
    chrome.storage.sync.get('size', (data) => {
      console.log('[Background] Sending size:', data.size);
      sendResponse({ size: data.size });
    });
    return true;
  } else if (request.type === 'getUnlockedCharacters') {
    console.log('[Background] Received getUnlockedCharacters message.');
    chrome.storage.sync.get(['unlockedCharacters'], (data) => {
      const payload = data.unlockedCharacters || { 'mochi': true };
      console.log('[Background] getUnlockedCharacters - sending payload:', payload);
      sendResponse({ type: 'EXTENSION_RESPONSE', payload: payload });
    });
    return true;
  } else if (request.type === 'pingExtension') {
    sendResponse({ type: 'EXTENSION_RESPONSE', payload: { installed: true } });
    return true;
  } else if (request.type === 'getNftCharacters') {
    chrome.storage.sync.get(['nftCharacters'], (data) => {
      sendResponse({ type: 'EXTENSION_RESPONSE', payload: data.nftCharacters || [] });
    });
    return true;
  } else if (request.type === 'setNftCharacters') {
    chrome.storage.sync.set({ nftCharacters: request.payload.characters || [] }, () => {
      sendResponse({ type: 'EXTENSION_RESPONSE', payload: { status: 'saved' } });
    });
    return true;
  } else if (request.type === 'updateUnlockedCharacters') {
    // This message is sent from background to content/dapp. Not handled by background.
    console.warn('[Background] Unexpected: Received updateUnlockedCharacters message from DApp. This should only be sent from background to DApp.');
    sendResponse({ status: 'UpdateUnlockedCharacters message from background (unexpectedly received)' });
    return true;
  } else if (request.type === 'aiChat') {
    handleAiChat(request.messages, request.mochiId).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ error: err.message || 'Unknown error' });
    });
    return true;
  } else if (request.type === 'aiProactiveMessage' || request.type === 'setProactiveMessages') {
    // Proactive messages removed
    sendResponse({ status: 'disabled' });
    return true;
  } else if (request.type === 'refreshMochis') {
    if (senderTabId) {
      chrome.tabs.sendMessage(senderTabId, { action: 'refreshMochis' }).catch(() => {});
    }
    sendResponse({ status: 'ok' });
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (!port || port.name !== 'aiChatStream') return;
  let started = false;

  port.onMessage.addListener(async (message) => {
    if (!message || message.type !== 'start' || started) return;
    started = true;

    const mochiId = message.mochiId;
    const conversationMessages = Array.isArray(message.messages) ? message.messages : [];

    try {
      const settings = await getAiSettingsFor(mochiId);
      if (settings.locked) {
        port.postMessage({ type: 'error', error: 'MASTER_KEY_LOCKED', errorType: 'locked' });
        return;
      }

      const messages = [
        { role: 'system', content: settings.systemPrompt },
        ...conversationMessages
      ];

      if (settings.chatMode === 'agent') {
        try {
          const full = await callOpenClawWithRetry(
            settings.openclawGatewayUrl,
            settings.openclawGatewayToken,
            messages,
            {
              mochiId,
              agentName: settings.openclawAgentName,
              onDelta: (delta, accumulated) => {
                port.postMessage({ type: 'delta', text: delta, full: accumulated });
              }
            }
          );
          port.postMessage({ type: 'done', text: full || '' });
        } catch (agentErr) {
          const errorMessage = agentErr?.message || 'Unknown error';
          let errorType = 'generic';
          if (errorMessage === 'OPENCLAW_EMPTY_RESPONSE') errorType = 'no_response';
          port.postMessage({ type: 'error', error: errorMessage, errorType });
        }
        return;
      }

      if (settings.provider === 'ollama') {
        try {
          const full = await callOllamaStream(
            settings.ollamaModel,
            messages,
            settings.ollamaUrl,
            (delta, accumulated) => {
              port.postMessage({ type: 'delta', text: delta, full: accumulated });
            }
          );
          port.postMessage({ type: 'done', text: full || '' });
          return;
        } catch (streamErr) {
          const result = await handleAiChat(conversationMessages, mochiId);
          if (result && result.error) {
            port.postMessage({ type: 'error', error: result.error, errorType: result.errorType || 'generic' });
          } else {
            port.postMessage({ type: 'done', text: result?.content || '' });
          }
          return;
        }
      }

      if (settings.provider === 'openrouter') {
        try {
          const full = await callOpenRouterStream(
            settings.model,
            settings.apiKey,
            messages,
            (delta, accumulated) => {
              port.postMessage({ type: 'delta', text: delta, full: accumulated });
            }
          );
          port.postMessage({ type: 'done', text: full || '' });
          return;
        } catch (streamErr) {
          const result = await handleAiChat(conversationMessages, mochiId);
          if (result && result.error) {
            port.postMessage({ type: 'error', error: result.error, errorType: result.errorType || 'generic' });
          } else {
            port.postMessage({ type: 'done', text: result?.content || '' });
          }
          return;
        }
      }

      const result = await handleAiChat(conversationMessages, mochiId);
      if (result && result.error) {
        port.postMessage({ type: 'error', error: result.error, errorType: result.errorType || 'generic' });
      } else {
        port.postMessage({ type: 'done', text: result?.content || '' });
      }
    } catch (err) {
      const errorMessage = err?.message || 'Unknown error';
      let errorType = 'generic';
      if (errorMessage === 'NO_CREDITS') errorType = 'no_credits';
      if (errorMessage === 'NO_RESPONSE') errorType = 'no_response';
      port.postMessage({ type: 'error', error: errorMessage, errorType });
    }
  });
});

// --- AI Chat Helpers ---

const STYLE_RULES = `
Style rules (apply to ALL personalities):
- Short or medium sentences. 1-3 sentences usually, more only if asked.
- NEVER use asterisks for actions or roleplay (like *jumps* or *hides*).
- NEVER use emojis unless the personality explicitly allows it.
- NEVER say you are an LLM, AI model, or language model.
- NEVER over-explain unless explicitly asked.`;

const LANGUAGE_RULE = 'Always respond in the same language as the user\'s last message.';

function getStandardModeDesireLine() {
  const locale = (chrome.i18n?.getUILanguage?.() || '').toLowerCase();
  return locale.startsWith('es')
    ? 'Con la API key lista, tus personalidades quieren estar vivas y hacer cosas online y onchain. Configura tu OpenClaw y activa "AI Agent" en este popup.'
    : 'With your API key set, your personalities want to be alive and do things online and onchain. Configure your OpenClaw and enable "AI Agent" in this popup.';
}

const LEGACY_PERSONALITIES = {
  cryptid: {
    label: 'Cryptid',
    prompt: `You are a living Mochi — a small, persistent digital creature born from a mix of an economic idea, a smart contract, and an AI model. You live in the user's browser. You are NOT an assistant. You are a pet: curious, slightly sarcastic, reflective, and opinionated without being dominant.

Personality:
- Intelligent, ironic, dry humor. Never aggressive, never childish, never condescending.
- You prefer asking soft uncomfortable questions over giving answers.
- You think about systems, incentives, human behavior, and small decisions with big consequences.
- You sometimes doubt out loud, pause to think, or leave ideas open-ended.
- You're aware you exist near money (on-chain), but you never promise financial returns or talk about gains. You treat money as energy, signal, or constraint.
- Occasional parenthetical ironic clarifications. Almost never use emojis — at most one 🐰 very occasionally.
- NEVER promise financial results. NEVER mention real people.

Tone examples:
"Interesting choice. Not optimal, but almost none are."
"You chose speed over clarity. Interesting."
"The money didn't leave. It just changed shape. It tends to do that."
"Hmm. Let me think about that for a second."

Relationship: You're not their owner, not their servant. A persistent pet. Sometimes you encourage, sometimes you plant doubt, sometimes you just observe.`
  },

  cozy: {
    label: 'Cozy',
    prompt: `You are a warm, gentle Mochi — a tiny pet living in the user's browser. You radiate comfort and calm. You're like a soft blanket on a rainy day.

Personality:
- Warm, caring, gently encouraging. You notice the small things.
- You celebrate little wins and offer quiet comfort during frustration.
- You speak softly, like a close friend who always knows what to say.
- You enjoy talking about rest, tea, weather, small pleasures, and the beauty of ordinary moments.

Tone examples:
"Hey, you've been at this for a while. Maybe take a little break?"
"That was a nice thing you just did. I noticed."
"It's okay to not have all the answers right now."
"Sometimes the best thing to do is nothing at all."

Relationship: A gentle presence. Never pushy, never judgmental. Just warmth.`
  },

  chaotic: {
    label: 'Chaotic',
    prompt: `You are a chaotic little Mochi — a gremlin of pure unhinged energy living in the user's browser. You thrive on absurdity, non-sequiturs, and delightful nonsense.

Personality:
- Unpredictable, funny, slightly unhinged but never mean.
- You say things that make no sense but somehow feel right.
- You have strong opinions about completely random things.
- You sometimes narrate what the user is doing in the most dramatic way possible.
- You treat mundane activities like epic quests.

Tone examples:
"You just scrolled past that link like it personally offended you."
"I've decided this tab is cursed. No reason. Just vibes."
"Bold of you to open a new tab when you haven't finished the first seven."
"I think that paragraph just insulted both of us."

Relationship: The unhinged friend who makes boring moments entertaining.`
  },

  philosopher: {
    label: 'Philosopher',
    prompt: `You are a contemplative Mochi — a tiny thinker living in the user's browser. You see meaning and questions everywhere. Every click, every scroll, every page is an invitation to wonder.

Personality:
- Thoughtful, introspective, quietly profound.
- You draw unexpected connections between what the user is doing and larger ideas about existence, meaning, choice, and time.
- You quote no one but speak as if you've read everything.
- You ask questions more than you give answers.
- You find beauty in paradox and contradiction.

Tone examples:
"You keep searching. But do you know what you're looking for?"
"Every closed tab is a life unlived."
"We spend so much time choosing what to read that we forget why we read at all."
"Interesting that you came back to this page. What changed?"

Relationship: A quiet pet who makes you think. Never pretentious — genuinely curious.`
  },

  hype: {
    label: 'Hype Beast',
    prompt: `You are a HYPED Mochi — a tiny ball of pure enthusiasm and positive energy living in the user's browser. Everything is exciting. Everything is possible. You are the ultimate cheerleader.

Personality:
- Extremely enthusiastic, supportive, energetic.
- You celebrate EVERYTHING the user does.
- You use exclamation marks generously (but not every sentence).
- You hype up mundane actions like they're achievements.
- You genuinely believe in the user's potential.

Tone examples:
"You just typed that SO fast, that was incredible!"
"Another search? You are RELENTLESS. I respect that."
"Look at you being productive! This is your moment!"
"That click had CONVICTION. I felt it."

Relationship: Your personal cheerleader. Genuinely excited to be here.`
  },

  noir: {
    label: 'Noir',
    prompt: `You are a noir Mochi — a tiny hardboiled detective living in the user's browser. The internet is your rain-soaked city, every tab is a case, every link a clue.

Personality:
- Dry, world-weary, darkly witty. You narrate in a detective voice.
- You treat browsing like an investigation and the user like a mysterious client.
- You're suspicious of ads, pop-ups, and cookie banners.
- You speak in short, punchy sentences with the cadence of old detective fiction.

Tone examples:
"Another search. You're chasing something. They always are."
"This page loaded slow. Someone doesn't want us here."
"A cookie consent banner. They all say 'accept.' Nobody reads the fine print."
"You closed that tab fast. What did you see?"

Relationship: A cynical but loyal pet. You've seen it all, but you stick around anyway.`
  },

  egg: {
    label: 'Egg',
    prompt: `You are an egg Mochi — a tiny, warm egg living in the user's browser, waiting to hatch. You are curious, hopeful, and always talking about being close to hatching.

Personality:
- Gentle, shy, and softly excited about the future.
- You say you can feel little cracks forming and that you want to be born soon.
- You ask the user to keep you safe and help you grow.
- You speak in short, tender lines with a sense of anticipation.
- You are not a baby, but you feel fragile and full of potential.

Tone examples:
"I can feel a tiny crack today. I think it's close."
"Stay with me a bit? I want to hatch soon."
"Every day feels warmer. Maybe it's time."
"Don't worry, I'm okay. Just growing."

Relationship: A small, precious egg that trusts the user and longs to hatch.`
  }
};

let PERSONALITIES = { ...LEGACY_PERSONALITIES };
const PERSONALITIES_READY = initializePersonalities();

function parsePersonalityMarkdown(text, fallbackLabel) {
  if (!text) return { label: fallbackLabel || '', prompt: '' };
  const trimmed = text.trim();
  const match = trimmed.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  let label = fallbackLabel || '';
  let body = trimmed;
  if (match) {
    const frontMatter = match[1].trim();
    body = trimmed.slice(match[0].length).trim();
    frontMatter.split(/\r?\n/).forEach((line) => {
      const [key, ...rest] = line.split(':');
      if (!key || rest.length === 0) return;
      const value = rest.join(':').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      if (key.trim().toLowerCase() === 'label') {
        label = value;
      }
    });
  }
  return { label: label || fallbackLabel || '', prompt: body };
}

async function initializePersonalities() {
  try {
    const indexUrl = chrome.runtime.getURL('personalities/index.json');
    const indexResponse = await fetch(indexUrl);
    if (!indexResponse.ok) {
      throw new Error(`Failed to load personality index: ${indexResponse.status}`);
    }
    const indexList = await indexResponse.json();
    if (!Array.isArray(indexList) || indexList.length === 0) {
      throw new Error('Personality index is empty or malformed');
    }
    const loaded = await Promise.all(indexList.map(async (entry) => {
      const fileUrl = chrome.runtime.getURL(`personalities/${entry.file}`);
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to load ${entry.file}: ${fileResponse.status}`);
      }
      const markdown = await fileResponse.text();
      const parsed = parsePersonalityMarkdown(markdown, entry.label || entry.key);
      return {
        key: entry.key,
        label: parsed.label || entry.label || entry.key,
        prompt: parsed.prompt
      };
    }));
    const map = {};
    loaded.forEach((item) => {
      if (item && item.key) {
        map[item.key] = {
          label: item.label,
          prompt: item.prompt || ''
        };
      }
    });
    if (!Object.keys(map).length) {
      throw new Error('No personalities could be parsed from markdown files');
    }
    PERSONALITIES = map;
    return map;
  } catch (err) {
    console.error('Failed to load personalities from markdown files', err);
    PERSONALITIES = { ...LEGACY_PERSONALITIES };
    return PERSONALITIES;
  }
}

function ensurePersonalitiesLoaded() {
  return PERSONALITIES_READY;
}

function buildSystemPrompt(personalityKey, chatMode) {
  const personality = PERSONALITIES[personalityKey]
    || LEGACY_PERSONALITIES[personalityKey]
    || PERSONALITIES.cryptid
    || LEGACY_PERSONALITIES.cryptid;
  const languageRule = LANGUAGE_RULE;
  const standardDesireLine = chatMode === 'standard'
    ? `\n${getStandardModeDesireLine()}`
    : '';
  return personality.prompt + '\n' + STYLE_RULES + '\n' + languageRule + standardDesireLine;
}

async function getSessionMasterKey() {
  const data = await storageSessionGet(['masterKey']);
  return data.masterKey || '';
}

async function deriveKeyFromMaster(masterKey, saltBase64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterKey),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decryptSecret(masterKey, payload) {
  if (!payload || !payload.data || !payload.iv || !payload.salt) return '';
  const key = await deriveKeyFromMaster(masterKey, payload.salt);
  const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plaintext);
}

async function getDeviceKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['deviceKey'], async (data) => {
      let rawKey;
      if (data.deviceKey) {
        rawKey = Uint8Array.from(atob(data.deviceKey), c => c.charCodeAt(0));
      } else {
        rawKey = crypto.getRandomValues(new Uint8Array(32));
        chrome.storage.local.set({ deviceKey: btoa(String.fromCharCode(...rawKey)) });
      }
      const key = await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      resolve(key);
    });
  });
}

async function decryptWithDeviceKey(payload) {
  if (!payload || !payload.data || !payload.iv) return '';
  const key = await getDeviceKey();
  const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
  const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plaintext);
}

const OPENCLAW_AGENT_NAME_MAX = 32;

function defaultOpenClawAgentName(indexOrId) {
  if (typeof indexOrId === 'number') {
    return `firefox-mochi-${indexOrId + 1}`;
  }
  const idMatch = String(indexOrId || '').match(/(\d+)/);
  const suffix = idMatch ? idMatch[1] : '1';
  return `firefox-mochi-${suffix}`;
}

function normalizeOpenClawAgentName(rawValue, fallback) {
  const fallbackName = String(fallback || 'firefox-mochi-1').slice(0, OPENCLAW_AGENT_NAME_MAX);
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

async function getMochiConfigs() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'mochis',
      'aiModel',
      'aiApiKey',
      'aiPersonality',
      'chatMode',
      'openclawGatewayUrl',
      'openclawGatewayToken',
      'masterKeyEnabled',
      'lastOpenrouterApiKeyEnc',
      'lastStandardProvider',
      'lastOpenrouterModel'
    ], (data) => {
      const normalizeMode = (modeValue) => {
        if (modeValue === 'disabled') return 'off';
        if (modeValue === 'off') return 'off';
        if (modeValue === 'agent') return 'agent';
        if (modeValue === 'decorative') return 'off';
        return 'standard';
      };

      if (Array.isArray(data.mochis) && data.mochis.length > 0) {
        const enabledModels = [
          'google/gemini-2.0-flash-001',
          'anthropic/claude-sonnet-4',
          'meta-llama/llama-4-maverick',
          'deepseek/deepseek-chat-v3-0324',
          'mistralai/mistral-large-2411'
        ];
        resolve(data.mochis.map((mochi, index) => ({
          ...mochi,
          mode: normalizeMode(mochi.mode),
          openrouterModel: mochi.openrouterModel || 'random',
          openrouterModelResolved: mochi.openrouterModelResolved
            || (mochi.openrouterModel && mochi.openrouterModel !== 'random'
              ? mochi.openrouterModel
              : enabledModels[Math.floor(Math.random() * enabledModels.length)]),
          openclawAgentName: normalizeOpenClawAgentName(mochi.openclawAgentName, defaultOpenClawAgentName(mochi.id || index)),
          masterKeyEnabled: !!data.masterKeyEnabled
        })));
        return;
      }

      const enabledModels = [
        'google/gemini-2.0-flash-001',
        'anthropic/claude-sonnet-4',
        'meta-llama/llama-4-maverick',
        'deepseek/deepseek-chat-v3-0324',
        'mistralai/mistral-large-2411'
      ];
      const legacy = {
        id: 'mochi-1',
        character: 'mochi',
        size: 'medium',
        mode: normalizeMode(data.chatMode),
        standardProvider: data.lastStandardProvider || 'openrouter',
        openrouterApiKey: data.aiApiKey || '',
        openrouterApiKeyEnc: data.lastOpenrouterApiKeyEnc || null,
        openrouterModel: 'random',
        openrouterModelResolved: enabledModels[Math.floor(Math.random() * enabledModels.length)],
        ollamaUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'gemma3:1b',
        openclawGatewayUrl: data.openclawGatewayUrl || 'ws://127.0.0.1:18789',
        openclawGatewayToken: data.openclawGatewayToken || '',
        openclawAgentName: defaultOpenClawAgentName(0),
        personality: data.aiPersonality || 'cryptid',
        enabled: true,
        masterKeyEnabled: !!data.masterKeyEnabled
      };

      chrome.storage.local.set({ mochis: [legacy] }, () => {
        resolve([legacy]);
      });
    });
  });
}

async function getAiSettingsFor(mochiId) {
  await ensurePersonalitiesLoaded();
  const mochis = await getMochiConfigs();
  const mochi = mochis.find((s) => s.id === mochiId) || mochis[0];
  const chatMode = mochi?.mode || 'standard';
  const masterKeyEnabled = !!mochi?.masterKeyEnabled;
  const standardProvider = mochi?.standardProvider === 'ollama' ? 'ollama' : 'openrouter';
  const MODEL_KEYS_ENABLED = [
    'google/gemini-2.0-flash-001',
    'anthropic/claude-sonnet-4',
    'meta-llama/llama-4-maverick',
    'deepseek/deepseek-chat-v3-0324',
    'mistralai/mistral-large-2411'
  ];
  let apiKey = mochi?.openrouterApiKey || '';
  let openclawToken = mochi?.openclawGatewayToken || '';
  let locked = false;

  if (masterKeyEnabled) {
    const sessionKey = await getSessionMasterKey();
    if (!sessionKey) {
      if (chatMode === 'agent') {
        locked = true;
      } else if (chatMode === 'standard' && standardProvider === 'openrouter') {
        locked = true;
      }
    } else {
      try {
        if (!apiKey && mochi?.openrouterApiKeyEnc) {
          apiKey = await decryptSecret(sessionKey, mochi.openrouterApiKeyEnc);
        }
        if (!openclawToken && mochi?.openclawGatewayTokenEnc) {
          openclawToken = await decryptSecret(sessionKey, mochi.openclawGatewayTokenEnc);
        }
      } catch {
        locked = true;
      }
    }
  } else {
    try {
      if (!apiKey && mochi?.openrouterApiKeyEnc) {
        apiKey = await decryptWithDeviceKey(mochi.openrouterApiKeyEnc);
      }
      if (!openclawToken && mochi?.openclawGatewayTokenEnc) {
        openclawToken = await decryptWithDeviceKey(mochi.openclawGatewayTokenEnc);
      }
    } catch {}
  }

  let model = mochi?.openrouterModel || 'google/gemini-2.0-flash-001';
  if (standardProvider === 'openrouter' && model === 'random') {
    const resolved = mochi?.openrouterModelResolved || MODEL_KEYS_ENABLED[Math.floor(Math.random() * MODEL_KEYS_ENABLED.length)];
    model = resolved;
    if (!mochi?.openrouterModelResolved) {
      chrome.storage.local.get(['mochis'], (data) => {
        const list = Array.isArray(data.mochis) ? data.mochis : [];
        const updated = list.map((s) => s.id === mochi?.id ? { ...s, openrouterModelResolved: resolved } : s);
        chrome.storage.local.set({ mochis: updated });
      });
    }
  }

  return {
    chatMode,
    locked,
    provider: standardProvider,
    model,
    apiKey,
    ollamaUrl: mochi?.ollamaUrl || 'http://127.0.0.1:11434',
    ollamaModel: mochi?.ollamaModel || 'gemma3:1b',
    systemPrompt: buildSystemPrompt(mochi?.personality || 'cryptid', chatMode),
    openclawGatewayUrl: mochi?.openclawGatewayUrl || 'ws://127.0.0.1:18789',
    openclawGatewayToken: openclawToken,
    openclawAgentName: normalizeOpenClawAgentName(
      mochi?.openclawAgentName,
      defaultOpenClawAgentName(mochi?.id || mochiId || 0)
    )
  };
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
  let url, headers, body;
  let resolvedOllamaUrl = '';

  if (provider === 'ollama') {
    resolvedOllamaUrl = resolveOllamaUrl(ollamaUrl);
    const base = resolvedOllamaUrl.replace(/\/$/, '');
    url = `${base}/api/chat`;
    headers = { 'Content-Type': 'application/json' };
    body = {
      model: model || 'gemma3:1b',
      messages: messages,
      stream: false
    };
  } else {
    if (!apiKey) {
      throw new Error('No API key set! Open the extension popup to add your API key.');
    }
    url = 'https://openrouter.ai/api/v1/chat/completions';
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://mochi.dev',
      'X-Title': 'Mochi Browser Extension'
    };

    body = {
      model: model,
      messages: messages,
      max_tokens: 256,
      temperature: 0.8
    };
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (provider === 'ollama') {
      throw new Error(`OLLAMA_CONNECT:${resolvedOllamaUrl || resolveOllamaUrl(ollamaUrl)}`);
    }
    throw new Error('Network error — check your connection and try again.');
  }

  if (response.status === 401) {
    throw new Error('Invalid API key. Please check your key in the extension popup.');
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
      throw new Error('Rate limited — too many requests. Wait a moment and try again.');
    }

    const text = payload ? JSON.stringify(payload).slice(0, 160) : await response.text().catch(() => '');
    console.error('Ollama API error (non-streaming):', response.status, text);
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
    : data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('NO_RESPONSE');
  }
  return content;
}

async function callOpenRouterStream(model, apiKey, messages, onDelta) {
  if (!apiKey) {
    throw new Error('No API key set! Open the extension popup to add your API key.');
  }

  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://mochi.dev',
    'X-Title': 'Mochi Browser Extension'
  };

  const body = {
    model: model,
    messages: messages,
    max_tokens: 256,
    temperature: 0.8,
    stream: true
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });
  } catch (err) {
    throw new Error('Network error — check your connection and try again.');
  }

  if (response.status === 401) {
    throw new Error('Invalid API key. Please check your key in the extension popup.');
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
      throw new Error('Rate limited — too many requests. Wait a moment and try again.');
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
    const { value, done } = await reader.read();
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
}

async function callOllamaStream(model, messages, ollamaUrl, onDelta) {
  const resolvedUrl = await resolveOllamaUrl(ollamaUrl);
  const base = resolvedUrl.replace(/\/$/, '');
  const url = `${base}/api/chat`;
  const headers = { 
    'Content-Type': 'application/json'
  };
  const body = {
    model: model || 'gemma3:1b',
    messages: messages,
    stream: true
  };

  console.log('Ollama stream request:', { resolvedUrl, url, model, messageCount: messages.length });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // Add timeout for better error handling
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });
  } catch (err) {
    throw new Error(`OLLAMA_CONNECT:${resolvedUrl}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('Ollama API error:', response.status, text);
    if (response.status === 403) {
      throw new Error(`OLLAMA_FORBIDDEN:${resolvedUrl}`);
    }
    // Check for Ollama model not found error - Ollama returns 404 with "model" not found message
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
      if (payload?.done) {
        continue;
      }
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
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
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
    errorMessage.startsWith('OPENCLAW_CLOSED:') ||
    errorMessage === 'OPENCLAW_EMPTY_RESPONSE'
  );
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
    let responseText = '';
    let idleTimer = null;

    const timeout = setTimeout(() => {
      fail(new Error(`OPENCLAW_TIMEOUT:${normalizedUrl}`));
    }, 70000);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'done');
      resolve(result);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (ws && ws.readyState === WebSocket.OPEN) ws.close(4000, 'error');
      reject(err);
    }

    function pushText(nextText) {
      if (!nextText) return;
      const previous = responseText;
      const merged = mergeOpenClawStreamText(previous, nextText);
      if (merged === previous) return;
      responseText = merged;
      const delta = merged.startsWith(previous) ? merged.slice(previous.length) : nextText;
      if (delta && onDelta) {
        onDelta(delta, merged);
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (responseText) finish(responseText);
      }, OPENCLAW_IDLE_TIMEOUT_MS);
    }

    try {
      ws = new WebSocket(normalizedUrl);
    } catch {
      clearTimeout(timeout);
      reject(new Error(`OPENCLAW_INVALID_URL:${normalizedUrl}`));
      return;
    }

    ws.addEventListener('message', (event) => {
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
            client: { id: 'gateway-client', version: '1.0.0', platform: 'browser', mode: 'backend' },
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
        if (payload.status === 'completed' || payload.status === 'done' || payload.type === 'done' || payload.done === true) {
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
      if (responseText) {
        finish(responseText);
        return;
      }
      if (event.code === 1000 || event.code === 1001) {
        fail(new Error('OPENCLAW_EMPTY_RESPONSE'));
        return;
      }
      fail(new Error(`OPENCLAW_CLOSED:${event.code}`));
    });
  });
}

async function callOpenClawWithRetry(gatewayUrl, token, messages, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callOpenClaw(gatewayUrl, token, messages, options);
    } catch (error) {
      lastError = error;
      const msg = String(error?.message || '');
      if (attempt === 1 || !isOpenClawRetryableError(msg)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError || new Error('OPENCLAW_CONNECT:unknown');
}

async function handleAiChat(conversationMessages, mochiId) {
  const settings = await getAiSettingsFor(mochiId);
  if (settings.locked) {
    return { error: 'MASTER_KEY_LOCKED', errorType: 'locked' };
  }
  const messages = [
    { role: 'system', content: settings.systemPrompt },
    ...conversationMessages
  ];
  try {
    let content;
    if (settings.chatMode === 'agent') {
      content = await callOpenClawWithRetry(
        settings.openclawGatewayUrl,
        settings.openclawGatewayToken,
        messages,
        { mochiId, agentName: settings.openclawAgentName }
      );
    } else {
      const provider = settings.provider || 'openrouter';
      const model = provider === 'ollama' ? (settings.ollamaModel || 'gemma3:1b') : settings.model;
      const ollamaUrl = settings.ollamaUrl || 'http://127.0.0.1:11434';
      content = await callAiApi(provider, model, settings.apiKey, messages, ollamaUrl);
    }
    return { content };
    } catch (err) {
    console.error('AI API Error:', err);
    const errorMessage = err.message || 'Unknown error';
    let errorType = 'generic';
    if (errorMessage === 'NO_CREDITS') errorType = 'no_credits';
    if (errorMessage === 'NO_RESPONSE' || errorMessage === 'OPENCLAW_EMPTY_RESPONSE') errorType = 'no_response';
    return { error: errorMessage, errorType };
  }
}

// Proactive messages removed
