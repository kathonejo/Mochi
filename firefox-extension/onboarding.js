const MODEL_OPTIONS = [
  { value: "random", label: "Random", labelEs: "Aleatorio" },
  { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
  { value: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek Chat v3" },
  { value: "mistralai/mistral-large-2411", label: "Mistral Large" }
];

const providerSelect = document.getElementById("provider-select");
const modeSelect = document.getElementById("mode-select");
const providerField = document.getElementById("provider-field");
const openrouterBlock = document.getElementById("openrouter-block");
const ollamaBlock = document.getElementById("ollama-block");
const agentBlock = document.getElementById("agent-block");
const openrouterKey = document.getElementById("openrouter-key");
const modelSelect = document.getElementById("model-select");
const ollamaUrl = document.getElementById("ollama-url");
const ollamaModelSelect = document.getElementById("ollama-model-select");
const ollamaRefreshBtn = document.getElementById("ollama-refresh");
const ollamaModelsStatus = document.getElementById("ollama-models-status");
const ollamaModel = document.getElementById("ollama-model");
const openclawUrl = document.getElementById("openclaw-url");
const openclawAgentName = document.getElementById("openclaw-agent-name");
const openclawToken = document.getElementById("openclaw-token");
const saveBtn = document.getElementById("save-btn");
const skipBtn = document.getElementById("skip-btn");
const langSelect = document.getElementById("lang-select");

let language = "en";
let ollamaDetectedModels = [];
const OPENCLAW_AGENT_NAME_MAX = 32;

function defaultOpenClawAgentName(indexOrId) {
  if (typeof indexOrId === "number") {
    return `chrome-mochi-${indexOrId + 1}`;
  }
  const match = String(indexOrId || "").match(/(\d+)/);
  const suffix = match ? match[1] : "1";
  return `chrome-mochi-${suffix}`;
}

function normalizeOpenClawAgentName(rawValue, fallback) {
  const fallbackName = String(fallback || "chrome-mochi-1").slice(0, OPENCLAW_AGENT_NAME_MAX);
  const normalized = String(rawValue || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, OPENCLAW_AGENT_NAME_MAX);
  return normalized || fallbackName;
}

function detectBrowserLanguage() {
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  const hasSpanish = languages.some((lang) => (lang || "").toLowerCase().startsWith("es"));
  return hasSpanish ? "es" : "en";
}

function t(en, es) {
  return language === "es" ? es : en;
}

function setLabels() {
  const langLabel = document.getElementById("lang-label");
  if (langLabel) langLabel.textContent = t("Language", "Idioma");
  document.getElementById("onboarding-title").textContent = t(
    "Welcome! Let's bring your first mochi to life.",
    "Bienvenido! Demos vida a tu primer mochi."
  );
  document.getElementById("onboarding-subtitle").textContent = t(
    "Configure the AI Brain and start chatting in seconds.",
    "Configura el Cerebro AI y empieza a chatear en segundos."
  );
  document.getElementById("brain-title").textContent = t("AI Brain Setup", "Configura el Cerebro AI");
  document.getElementById("mode-label").textContent = t("AI Brain", "Cerebro AI");
  if (modeSelect) {
    modeSelect.options[0].textContent = t("Standard (API key only)", "Standard (solo API key)");
    modeSelect.options[1].textContent = t("AI Agent", "AI Agent");
    modeSelect.options[2].textContent = t("Off", "Apagado");
  }
  document.getElementById("provider-label").textContent = t("Provider", "Proveedor");
  document.getElementById("api-key-label").textContent = t("OpenRouter API Key", "API Key OpenRouter");
  openrouterKey.placeholder = t("Paste your API key", "Pega tu API key");
  document.getElementById("model-label").textContent = t("Model", "Modelo");
  document.getElementById("openrouter-hint").textContent = "";
  const openrouterLink = document.getElementById("openrouter-link");
  if (openrouterLink) {
    openrouterLink.textContent = t(
      "Get an OpenRouter API key (free trial)",
      "Conseguí tu API key de OpenRouter (free trial)"
    );
  }
  document.getElementById("ollama-url-label").textContent = t("Ollama URL", "Ollama URL");
  ollamaUrl.placeholder = "http://127.0.0.1:11434";
  document.getElementById("ollama-model-list-label").textContent = t("Detected Models", "Modelos detectados");
  if (ollamaRefreshBtn) ollamaRefreshBtn.textContent = t("Refresh", "Actualizar");
  document.getElementById("ollama-model-label").textContent = t("Ollama Model", "Modelo Ollama");
  ollamaModel.placeholder = "gemma3:1b";
  document.getElementById("ollama-hint").textContent = t(
    "Use a local Ollama server to keep everything on-device.",
    "Usa un servidor Ollama local para mantener todo en tu dispositivo."
  );
  document.getElementById("openclaw-url-label").textContent = t("Gateway URL", "Gateway URL");
  document.getElementById("openclaw-agent-name-label").textContent = t("Agent Name", "Nombre del agente");
  document.getElementById("openclaw-token-label").textContent = t("Gateway Auth Token", "Token de auth del gateway");
  openclawUrl.placeholder = "ws://127.0.0.1:18789";
  if (openclawAgentName) openclawAgentName.placeholder = defaultOpenClawAgentName(0);
  openclawToken.placeholder = t("Enter gateway token", "Token del gateway");
  document.getElementById("openclaw-hint").textContent = t(
    "OpenClaw needs a WebSocket URL + gateway token. To get the token run: openclaw config get gateway.auth.token",
    "OpenClaw necesita un WebSocket + token del gateway. Para obtener el token ejecuta: openclaw config get gateway.auth.token"
  );
  document.getElementById("openclaw-agent-name-hint").textContent = t(
    "Agent name rules: letters, numbers, '-' and '_' only (max 32).",
    "Reglas del nombre: solo letras, números, '-' y '_' (máx 32)."
  );
  saveBtn.textContent = t("Save", "Guardar");
  skipBtn.textContent = t("Skip for now", "Omitir por ahora");
  document.getElementById("add-more-hint").textContent = t(
    "You can add more mochis later with the + button.",
    "Luego podés agregar más mochis con el botón +."
  );
}

function populateModels(selectedValue) {
  modelSelect.innerHTML = "";
  MODEL_OPTIONS.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = language === "es" && opt.labelEs ? opt.labelEs : opt.label;
    modelSelect.appendChild(option);
  });
  modelSelect.value = selectedValue || modelSelect.value || "random";
}

function setOllamaStatus(text, type) {
  if (!ollamaModelsStatus) return;
  ollamaModelsStatus.textContent = text || "";
  if (type === "error") {
    ollamaModelsStatus.style.color = "rgba(255, 134, 134, 0.9)";
  } else if (type === "ok") {
    ollamaModelsStatus.style.color = "rgba(134, 240, 180, 0.9)";
  } else {
    ollamaModelsStatus.style.color = "rgba(234, 242, 255, 0.6)";
  }
}

function normalizeOllamaUrl(rawUrl) {
  const fallback = "http://127.0.0.1:11434";
  const value = (rawUrl || fallback).trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return fallback;
    return `http://${parsed.host}`;
  } catch {
    return fallback;
  }
}

function populateOllamaModelSelect(selectedModel) {
  if (!ollamaModelSelect) return;
  ollamaModelSelect.innerHTML = "";

  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = t("Custom model", "Modelo personalizado");
  ollamaModelSelect.appendChild(customOption);

  const names = ollamaDetectedModels.map((item) => item?.name).filter(Boolean);
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    ollamaModelSelect.appendChild(option);
  });

  if (selectedModel && names.includes(selectedModel)) {
    ollamaModelSelect.value = selectedModel;
  } else {
    ollamaModelSelect.value = "custom";
  }
}

function syncOllamaModelSelection() {
  if (!ollamaModelSelect || !ollamaModel) return;
  if (ollamaModelSelect.value === "custom") {
    ollamaModel.focus();
    return;
  }
  ollamaModel.value = ollamaModelSelect.value;
}

async function refreshOllamaModels(showStatus) {
  if (!ollamaUrl || !ollamaModelSelect || !ollamaRefreshBtn) return;

  const normalizedUrl = normalizeOllamaUrl(ollamaUrl.value);
  ollamaUrl.value = normalizedUrl;
  const currentModel = (ollamaModel?.value || "").trim() || "gemma3:1b";
  let timeoutId = null;

  ollamaRefreshBtn.disabled = true;
  ollamaModelSelect.disabled = true;
  if (showStatus) {
    setOllamaStatus(t("Checking Ollama...", "Verificando Ollama..."), "muted");
  }

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${normalizedUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }

    const payload = await response.json();
    ollamaDetectedModels = Array.isArray(payload?.models) ? payload.models : [];
    populateOllamaModelSelect(currentModel);

    if (showStatus) {
      const count = ollamaDetectedModels.length;
      setOllamaStatus(
        count > 0
          ? t(`Found ${count} local models.`, `Se encontraron ${count} modelos locales.`)
          : t("Connected, but no models were found.", "Conectado, pero no se encontraron modelos."),
        "ok"
      );
    }
  } catch {
    ollamaDetectedModels = [];
    populateOllamaModelSelect(currentModel);
    if (showStatus) {
      setOllamaStatus(
        t(
          `Could not reach Ollama at ${normalizedUrl}. Keep a custom model or check your server URL.`,
          `No se pudo conectar a Ollama en ${normalizedUrl}. Usa un modelo personalizado o revisa la URL del servidor.`
        ),
        "error"
      );
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    ollamaRefreshBtn.disabled = false;
    ollamaModelSelect.disabled = false;
  }
}

function toggleProvider() {
  const provider = providerSelect.value || "openrouter";
  openrouterBlock.classList.toggle("hidden", provider !== "openrouter");
  ollamaBlock.classList.toggle("hidden", provider !== "ollama");
}

function toggleMode() {
  const mode = modeSelect?.value || "standard";
  const isStandard = mode === "standard";
  const isAgent = mode === "agent";
  if (providerField) providerField.classList.toggle("hidden", !isStandard);
  if (agentBlock) agentBlock.classList.toggle("hidden", !isAgent);
  if (!isStandard) {
    openrouterBlock.classList.add("hidden");
    ollamaBlock.classList.add("hidden");
    return;
  }
  toggleProvider();
}

function getDefaultMochi(index) {
  return {
    id: `mochi-${index + 1}`,
    character: "mochi",
    size: "medium",
    mode: "standard",
    standardProvider: "openrouter",
    openrouterApiKey: "",
    openrouterModel: "random",
    ollamaUrl: "http://127.0.0.1:11434",
    ollamaModel: "gemma3:1b",
    openclawGatewayUrl: "ws://127.0.0.1:18789",
    openclawGatewayToken: "",
    openclawAgentName: defaultOpenClawAgentName(index),
    personality: "cryptid",
    enabled: true,
    chatThemeColor: "#2a1f4e",
    chatBgColor: "#ffffff",
    chatFontSize: "medium",
    chatWidth: "medium",
    chatBubbleStyle: "glass",
    ttsEnabled: false,
    ttsWhenClosed: false,
    ttsVoiceProfile: "random",
    ttsVoiceId: "",
    openMicEnabled: false,
    relayEnabled: false,
    animationQuality: "full"
  };
}

function loadExistingConfig() {
  chrome.storage.local.get(["mochis"], (data) => {
    const list = Array.isArray(data.mochis) ? data.mochis : [];
    const first = list[0];
    if (!first) {
      if (openclawAgentName) openclawAgentName.value = defaultOpenClawAgentName(0);
      populateOllamaModelSelect(ollamaModel.value || "gemma3:1b");
      refreshOllamaModels(false);
      return;
    }
    if (first.mode && modeSelect) modeSelect.value = first.mode;
    if (first.standardProvider) providerSelect.value = first.standardProvider;
    if (first.openrouterApiKey) openrouterKey.value = first.openrouterApiKey;
    if (first.openrouterModel) {
      modelSelect.value = first.openrouterModel;
    } else {
      modelSelect.value = "random";
    }
    if (first.ollamaUrl) ollamaUrl.value = first.ollamaUrl;
    if (first.ollamaModel) ollamaModel.value = first.ollamaModel;
    if (first.openclawGatewayUrl) openclawUrl.value = first.openclawGatewayUrl;
    if (openclawAgentName) {
      openclawAgentName.value = normalizeOpenClawAgentName(
        first.openclawAgentName,
        defaultOpenClawAgentName(first.id || 0)
      );
    }
    if (first.openclawGatewayToken) openclawToken.value = first.openclawGatewayToken;
    populateOllamaModelSelect(ollamaModel.value || "gemma3:1b");
    toggleMode();
    refreshOllamaModels(false);
  });
}

function saveConfig() {
  const provider = providerSelect.value || "openrouter";
  const mode = modeSelect?.value || "standard";
  chrome.storage.local.get(["mochis", "noMochis"], (data) => {
    let list = Array.isArray(data.mochis) ? data.mochis : [];
    if (list.length === 0) {
      list = [getDefaultMochi(0)];
    }
    const first = list[0];
    first.mode = mode;
    first.standardProvider = provider;
    if (mode === "standard") {
      if (provider === "openrouter") {
        first.openrouterApiKey = openrouterKey.value || "";
        first.openrouterModel = modelSelect.value || "random";
      } else {
        first.ollamaUrl = ollamaUrl.value || "http://127.0.0.1:11434";
        first.ollamaModel = ollamaModel.value || "gemma3:1b";
      }
    } else if (mode === "agent") {
      first.openclawGatewayUrl = openclawUrl.value || "ws://127.0.0.1:18789";
      first.openclawGatewayToken = openclawToken.value || "";
      first.openclawAgentName = normalizeOpenClawAgentName(
        openclawAgentName?.value,
        defaultOpenClawAgentName(first.id || 0)
      );
    }
    chrome.storage.local.set({ mochis: list, noMochis: false }, () => {
      window.location.href = chrome.runtime.getURL("onboarding-success.html");
    });
  });
}

function skipOnboarding() {
  window.location.href = chrome.runtime.getURL("onboarding-success.html");
}

function initOnboardingLanguage() {
  chrome.storage.local.get(["mochiLanguage"], (data) => {
    if (data.mochiLanguage === "es" || data.mochiLanguage === "en") {
      language = data.mochiLanguage;
    } else {
      language = detectBrowserLanguage();
      chrome.storage.local.set({ mochiLanguage: language });
    }
    if (langSelect) langSelect.value = language;
    setLabels();
    populateModels("random");
    populateOllamaModelSelect(ollamaModel.value || "gemma3:1b");
    toggleMode();
    loadExistingConfig();
  });
}

initOnboardingLanguage();

providerSelect.addEventListener("change", () => {
  toggleProvider();
  toggleMode();
  if ((providerSelect.value || "openrouter") === "ollama") {
    refreshOllamaModels(false);
  }
});
if (modeSelect) {
  modeSelect.addEventListener("change", () => {
    toggleMode();
    if ((modeSelect.value || "standard") === "standard" && (providerSelect.value || "openrouter") === "ollama") {
      refreshOllamaModels(false);
    }
  });
}
saveBtn.addEventListener("click", saveConfig);
skipBtn.addEventListener("click", skipOnboarding);
if (ollamaRefreshBtn) {
  ollamaRefreshBtn.addEventListener("click", () => {
    refreshOllamaModels(true);
  });
}
if (ollamaModelSelect) {
  ollamaModelSelect.addEventListener("change", syncOllamaModelSelection);
}
if (ollamaModel) {
  ollamaModel.addEventListener("input", () => {
    if (!ollamaModelSelect) return;
    const current = (ollamaModel.value || "").trim();
    const isKnown = ollamaDetectedModels.some((model) => model?.name === current);
    if (!isKnown) ollamaModelSelect.value = "custom";
  });
}
if (ollamaUrl) {
  ollamaUrl.addEventListener("blur", () => {
    if ((providerSelect.value || "openrouter") === "ollama") {
      refreshOllamaModels(false);
    }
  });
}
if (langSelect) {
  langSelect.addEventListener("change", () => {
    const value = langSelect.value === "es" ? "es" : "en";
    language = value;
    chrome.storage.local.set({ mochiLanguage: value });
    setLabels();
    populateModels(modelSelect.value || "random");
    populateOllamaModelSelect(ollamaModel.value || "gemma3:1b");
  });
}
if (openclawAgentName) {
  openclawAgentName.addEventListener("blur", () => {
    openclawAgentName.value = normalizeOpenClawAgentName(
      openclawAgentName.value,
      defaultOpenClawAgentName(0)
    );
  });
}
