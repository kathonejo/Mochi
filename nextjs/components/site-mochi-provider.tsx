"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type SiteMochiChatBubbleStyle,
  type SiteMochiChatFontSize,
  type SiteMochiChatThemePresetId,
  type SiteMochiChatWidthPreset,
  SITE_MOCHI_CHAT_DEFAULT_HEIGHT_PX,
  SITE_MOCHI_CHAT_THEMES,
} from "@/lib/site-mochi-chat-ui";
import { useWalletSession } from "@/components/wallet-provider";

export type SiteMochiProviderKind = "site" | "openrouter" | "ollama" | "openclaw" | "bitte";
export type SiteMochiOpenClawMode = "paired";
export type SiteMochiSoundInputProviderKind = "off" | "browser";
export type SiteMochiSoundOutputProviderKind = "off" | "browser" | "elevenlabs";
export type SiteMochiIconTheme = "fa6" | "hi2" | "io5" | "pi" | "tb";

export type SiteMochiCharacterOption = {
  key: string;
  label: string;
  iconUrl: string;
  spritesBaseUri?: string | null;
};

export type SiteMochiPersonalityOption = {
  key: string;
  label: string;
  prompt: string;
};

export type SiteMochiCatalog = {
  characters: SiteMochiCharacterOption[];
  personalities: SiteMochiPersonalityOption[];
  freeSiteMessageLimit: number;
};

export type SiteMochiConfig = {
  enabled: boolean;
  character: string;
  soulMd: string;
  iconTheme: SiteMochiIconTheme;
  webSearchToolEnabled: boolean;
  braveApiKey: string;
  sizePercent: number;
  provider: SiteMochiProviderKind;
  openrouterApiKey: string;
  openrouterModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  openclawMode: SiteMochiOpenClawMode;
  openclawGatewayUrl: string;
  openclawGatewayToken: string;
  openclawAgentName: string;
  openclawPairedSessionToken: string;
  openclawPairedSessionExpiresAt: string;
  openclawPairedAgentName: string;
  bitteApiKey: string;
  bitteAgentId: string;
  soundInputProvider: SiteMochiSoundInputProviderKind;
  soundInputAutoSend: boolean;
  soundOutputProvider: SiteMochiSoundOutputProviderKind;
  soundOutputAutoSpeak: boolean;
  soundOutputVolumePercent: number;
  soundOutputBrowserVoiceName: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  elevenlabsModelId: string;
  chatThemeColor: string;
  chatBgColor: string;
  chatFontSize: SiteMochiChatFontSize;
  chatWidth: SiteMochiChatWidthPreset;
  chatWidthPx: number | null;
  chatHeightPx: number | null;
  chatBubbleStyle: SiteMochiChatBubbleStyle;
  chatThemePreset: SiteMochiChatThemePresetId;
};

type SiteMochiContextValue = {
  config: SiteMochiConfig;
  updateConfig: (next: Partial<SiteMochiConfig>) => void;
  resetConfig: () => void;
  isConfigOpen: boolean;
  openConfig: () => void;
  closeConfig: () => void;
  toggleConfig: () => void;
  catalog: SiteMochiCatalog | null;
  catalogLoading: boolean;
  catalogError: string | null;
  reloadCatalog: () => Promise<void>;
  freeSiteMessagesUsed: number;
  incrementFreeSiteMessagesUsed: () => void;
  resetFreeSiteMessagesUsed: () => void;
  freeSiteMessagesRemaining: number | null;
  canUseCurrentProvider: boolean;
};

const SITE_MOCHI_CONFIG_STORAGE_KEY = "site-mochi-config-v1";
const SITE_MOCHI_CREDITS_STORAGE_KEY = "site-mochi-free-messages-used-v1";
const SITE_MOCHI_SOUL_STORAGE_KEY = "site-mochi-soul-v1";

const DEFAULT_FREE_SITE_MESSAGE_LIMIT = 4;
const DEFAULT_CHAT_THEME = SITE_MOCHI_CHAT_THEMES[0];

const DEFAULT_CONFIG: SiteMochiConfig = {
  enabled: true,
  character: "mochi",
  soulMd: `# soul.md

You are Mochi.

- Be concise, warm, and practical.
- Stay playful but not childish.
- Help with setup, downloads, and using the agent.
- Prefer clear answers over roleplay unless the user invites it.
`,
  iconTheme: "hi2",
  webSearchToolEnabled: false,
  braveApiKey: "",
  sizePercent: 100,
  provider: "site",
  openrouterApiKey: "",
  openrouterModel: "openai/gpt-4o-mini",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "gemma3:1b",
  openclawMode: "paired",
  openclawGatewayUrl: "ws://127.0.0.1:18789",
  openclawGatewayToken: "",
  openclawAgentName: "web-mochi-1",
  openclawPairedSessionToken: "",
  openclawPairedSessionExpiresAt: "",
  openclawPairedAgentName: "",
  bitteApiKey: "",
  bitteAgentId: "",
  soundInputProvider: "off",
  soundInputAutoSend: false,
  soundOutputProvider: "off",
  soundOutputAutoSpeak: false,
  soundOutputVolumePercent: 95,
  soundOutputBrowserVoiceName: "",
  elevenlabsApiKey: "",
  elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
  elevenlabsModelId: "eleven_flash_v2_5",
  chatThemeColor: DEFAULT_CHAT_THEME.theme,
  chatBgColor: DEFAULT_CHAT_THEME.bg,
  chatFontSize: "medium",
  chatWidth: "medium",
  chatWidthPx: null,
  chatHeightPx: SITE_MOCHI_CHAT_DEFAULT_HEIGHT_PX,
  chatBubbleStyle: DEFAULT_CHAT_THEME.bubble,
  chatThemePreset: DEFAULT_CHAT_THEME.id,
};

const SiteMochiContext = createContext<SiteMochiContextValue | undefined>(
  undefined,
);

function clampSizePercent(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : DEFAULT_CONFIG.sizePercent;
  if (!Number.isFinite(numeric)) return DEFAULT_CONFIG.sizePercent;
  return Math.max(60, Math.min(180, Math.round(numeric)));
}

function clampPercent(value: unknown, fallback: number, min = 0, max = 100): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : fallback;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clampOptionalPx(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeString(value: unknown, fallback = "", maxLength = 256): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function sanitizeFreeformText(value: unknown, fallback = "", maxLength = 4000): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength);
}

function getSoulStorageKey(publicKey?: string | null) {
  const suffix = typeof publicKey === "string" && publicKey.trim() ? publicKey.trim() : "guest";
  return `${SITE_MOCHI_SOUL_STORAGE_KEY}:${suffix}`;
}

function sanitizeIsoDateString(value: unknown): string {
  const raw = sanitizeString(value, "", 64);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString();
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  const raw = sanitizeString(value, fallback, 16);
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

function sanitizeChatFontSize(value: unknown): SiteMochiChatFontSize {
  return value === "small" || value === "medium" || value === "large"
    ? value
    : DEFAULT_CONFIG.chatFontSize;
}

function sanitizeChatWidth(value: unknown): SiteMochiChatWidthPreset {
  return value === "small" || value === "medium" || value === "large"
    ? value
    : DEFAULT_CONFIG.chatWidth;
}

function sanitizeChatBubbleStyle(value: unknown): SiteMochiChatBubbleStyle {
  return value === "glass" || value === "solid" || value === "dark"
    ? value
    : DEFAULT_CONFIG.chatBubbleStyle;
}

function sanitizeChatThemePreset(value: unknown): SiteMochiChatThemePresetId {
  const raw = sanitizeString(value, DEFAULT_CONFIG.chatThemePreset, 32);
  if (raw === "custom" || raw === "random") return raw;
  if (SITE_MOCHI_CHAT_THEMES.some((theme) => theme.id === raw)) {
    return raw as SiteMochiChatThemePresetId;
  }
  return DEFAULT_CONFIG.chatThemePreset;
}

function sanitizeIconTheme(value: unknown): SiteMochiIconTheme {
  return value === "fa6" ||
    value === "hi2" ||
    value === "io5" ||
    value === "pi" ||
    value === "tb"
    ? value
    : DEFAULT_CONFIG.iconTheme;
}

function looksLikeUntouchedProviderConfig(raw: Partial<SiteMochiConfig>): boolean {
  const providerValue = raw.provider;
  if (providerValue && providerValue !== "openrouter") return false;

  const openrouterApiKey = sanitizeString(raw.openrouterApiKey, "", 600);
  const openrouterModel =
    sanitizeString(raw.openrouterModel, DEFAULT_CONFIG.openrouterModel, 120) ||
    DEFAULT_CONFIG.openrouterModel;
  const ollamaUrl =
    sanitizeString(raw.ollamaUrl, DEFAULT_CONFIG.ollamaUrl, 300) || DEFAULT_CONFIG.ollamaUrl;
  const ollamaModel =
    sanitizeString(raw.ollamaModel, DEFAULT_CONFIG.ollamaModel, 120) || DEFAULT_CONFIG.ollamaModel;
  const webSearchToolEnabled = sanitizeBoolean(
    raw.webSearchToolEnabled,
    DEFAULT_CONFIG.webSearchToolEnabled,
  );
  const braveApiKey = sanitizeString(raw.braveApiKey, "", 600);
  const openclawMode: SiteMochiOpenClawMode = "paired";
  const openclawGatewayUrl =
    sanitizeString(raw.openclawGatewayUrl, DEFAULT_CONFIG.openclawGatewayUrl, 300) ||
    DEFAULT_CONFIG.openclawGatewayUrl;
  const openclawGatewayToken = sanitizeString(raw.openclawGatewayToken, "", 600);
  const openclawAgentName =
    sanitizeString(raw.openclawAgentName, DEFAULT_CONFIG.openclawAgentName, 32) ||
    DEFAULT_CONFIG.openclawAgentName;
  const openclawPairedSessionToken = sanitizeString(raw.openclawPairedSessionToken, "", 1200);
  const openclawPairedSessionExpiresAt = sanitizeIsoDateString(raw.openclawPairedSessionExpiresAt);
  const openclawPairedAgentName = sanitizeString(raw.openclawPairedAgentName, "", 64);

  return Boolean(
    !openrouterApiKey &&
      openrouterModel === DEFAULT_CONFIG.openrouterModel &&
      ollamaUrl === DEFAULT_CONFIG.ollamaUrl &&
      ollamaModel === DEFAULT_CONFIG.ollamaModel &&
      webSearchToolEnabled === DEFAULT_CONFIG.webSearchToolEnabled &&
      !braveApiKey &&
      openclawGatewayUrl === DEFAULT_CONFIG.openclawGatewayUrl &&
      !openclawGatewayToken &&
      openclawAgentName === DEFAULT_CONFIG.openclawAgentName &&
      openclawMode === DEFAULT_CONFIG.openclawMode &&
      !openclawPairedSessionToken &&
      !openclawPairedSessionExpiresAt &&
      !openclawPairedAgentName,
  );
}

function looksLikeAutoEnabledSoundDefaults(raw: Partial<SiteMochiConfig>): boolean {
  const soundInputProvider =
    raw.soundInputProvider === "browser" || raw.soundInputProvider === "off"
      ? raw.soundInputProvider
      : undefined;
  const soundOutputProvider =
    raw.soundOutputProvider === "browser" ||
    raw.soundOutputProvider === "elevenlabs" ||
    raw.soundOutputProvider === "off"
      ? raw.soundOutputProvider
      : undefined;
  const soundInputAutoSend = sanitizeBoolean(raw.soundInputAutoSend, DEFAULT_CONFIG.soundInputAutoSend);
  const soundOutputAutoSpeak = sanitizeBoolean(
    raw.soundOutputAutoSpeak,
    DEFAULT_CONFIG.soundOutputAutoSpeak,
  );
  const soundOutputVolumePercent = clampPercent(
    raw.soundOutputVolumePercent,
    DEFAULT_CONFIG.soundOutputVolumePercent,
    0,
    100,
  );
  const elevenlabsApiKey = sanitizeString(raw.elevenlabsApiKey, "", 600);
  const elevenlabsVoiceId =
    sanitizeString(raw.elevenlabsVoiceId, DEFAULT_CONFIG.elevenlabsVoiceId, 120) ||
    DEFAULT_CONFIG.elevenlabsVoiceId;
  const elevenlabsModelId =
    sanitizeString(raw.elevenlabsModelId, DEFAULT_CONFIG.elevenlabsModelId, 120) ||
    DEFAULT_CONFIG.elevenlabsModelId;

  return Boolean(
    soundInputProvider === "browser" &&
      soundInputAutoSend === true &&
      soundOutputProvider === "browser" &&
      soundOutputAutoSpeak === true &&
      soundOutputVolumePercent === 95 &&
      !sanitizeString(raw.soundOutputBrowserVoiceName, "", 160) &&
      !elevenlabsApiKey &&
      elevenlabsVoiceId === "EXAVITQu4vr4xnSDxMaL" &&
      elevenlabsModelId === "eleven_flash_v2_5",
  );
}

function sanitizeConfig(input: unknown): SiteMochiConfig {
  if (!input || typeof input !== "object") return DEFAULT_CONFIG;
  const raw = input as Partial<SiteMochiConfig>;
  const parsedProvider: SiteMochiProviderKind =
    raw.provider === "openrouter" || raw.provider === "site"
      ? raw.provider
      : DEFAULT_CONFIG.provider;
  const provider: SiteMochiProviderKind = parsedProvider;
  const openclawMode: SiteMochiOpenClawMode = "paired";
  const soundInputProvider: SiteMochiSoundInputProviderKind =
    raw.soundInputProvider === "browser" || raw.soundInputProvider === "off"
      ? raw.soundInputProvider
      : DEFAULT_CONFIG.soundInputProvider;
  const soundOutputProvider: SiteMochiSoundOutputProviderKind =
    raw.soundOutputProvider === "browser" ||
    raw.soundOutputProvider === "elevenlabs" ||
    raw.soundOutputProvider === "off"
      ? raw.soundOutputProvider
      : DEFAULT_CONFIG.soundOutputProvider;
  const soundOutputAutoSpeak = soundOutputProvider !== "off";

  return {
    enabled: true,
    character: sanitizeString(raw.character, DEFAULT_CONFIG.character, 64) || DEFAULT_CONFIG.character,
    soulMd: sanitizeFreeformText(raw.soulMd, DEFAULT_CONFIG.soulMd, 4000),
    iconTheme: sanitizeIconTheme(raw.iconTheme),
    webSearchToolEnabled: sanitizeBoolean(
      raw.webSearchToolEnabled,
      DEFAULT_CONFIG.webSearchToolEnabled,
    ),
    braveApiKey: sanitizeString(raw.braveApiKey, "", 600),
    sizePercent: clampSizePercent(raw.sizePercent),
    provider,
    openrouterApiKey: sanitizeString(raw.openrouterApiKey, "", 600),
    openrouterModel:
      sanitizeString(raw.openrouterModel, DEFAULT_CONFIG.openrouterModel, 120) ||
      DEFAULT_CONFIG.openrouterModel,
    ollamaUrl:
      sanitizeString(raw.ollamaUrl, DEFAULT_CONFIG.ollamaUrl, 300) || DEFAULT_CONFIG.ollamaUrl,
    ollamaModel:
      sanitizeString(raw.ollamaModel, DEFAULT_CONFIG.ollamaModel, 120) || DEFAULT_CONFIG.ollamaModel,
    openclawMode,
    openclawGatewayUrl:
      sanitizeString(raw.openclawGatewayUrl, DEFAULT_CONFIG.openclawGatewayUrl, 300) ||
      DEFAULT_CONFIG.openclawGatewayUrl,
    openclawGatewayToken: sanitizeString(raw.openclawGatewayToken, "", 600),
    openclawAgentName:
      sanitizeString(raw.openclawAgentName, DEFAULT_CONFIG.openclawAgentName, 32) ||
      DEFAULT_CONFIG.openclawAgentName,
    openclawPairedSessionToken: sanitizeString(raw.openclawPairedSessionToken, "", 1200),
    openclawPairedSessionExpiresAt: sanitizeIsoDateString(raw.openclawPairedSessionExpiresAt),
    openclawPairedAgentName: sanitizeString(raw.openclawPairedAgentName, "", 64),
    bitteApiKey: sanitizeString(raw.bitteApiKey, "", 600),
    bitteAgentId: sanitizeString(raw.bitteAgentId, "", 300),
    soundInputProvider,
    soundInputAutoSend: sanitizeBoolean(raw.soundInputAutoSend, DEFAULT_CONFIG.soundInputAutoSend),
    soundOutputProvider,
    soundOutputAutoSpeak,
    soundOutputVolumePercent: clampPercent(
      raw.soundOutputVolumePercent,
      DEFAULT_CONFIG.soundOutputVolumePercent,
      0,
      100,
    ),
    soundOutputBrowserVoiceName: sanitizeString(raw.soundOutputBrowserVoiceName, "", 160),
    elevenlabsApiKey: sanitizeString(raw.elevenlabsApiKey, "", 600),
    elevenlabsVoiceId:
      sanitizeString(raw.elevenlabsVoiceId, DEFAULT_CONFIG.elevenlabsVoiceId, 120) ||
      DEFAULT_CONFIG.elevenlabsVoiceId,
    elevenlabsModelId:
      sanitizeString(raw.elevenlabsModelId, DEFAULT_CONFIG.elevenlabsModelId, 120) ||
      DEFAULT_CONFIG.elevenlabsModelId,
    chatThemeColor: sanitizeHexColor(raw.chatThemeColor, DEFAULT_CONFIG.chatThemeColor),
    chatBgColor: sanitizeHexColor(raw.chatBgColor, DEFAULT_CONFIG.chatBgColor),
    chatFontSize: sanitizeChatFontSize(raw.chatFontSize),
    chatWidth: sanitizeChatWidth(raw.chatWidth),
    chatWidthPx: clampOptionalPx(raw.chatWidthPx, 220, 720),
    chatHeightPx:
      clampOptionalPx(raw.chatHeightPx, 160, 720) ?? SITE_MOCHI_CHAT_DEFAULT_HEIGHT_PX,
    chatBubbleStyle: sanitizeChatBubbleStyle(raw.chatBubbleStyle),
    chatThemePreset: sanitizeChatThemePreset(raw.chatThemePreset),
  };
}

function canUseProvider(config: SiteMochiConfig, freeSiteMessagesRemaining: number | null): boolean {
  if (config.provider === "site") {
    return freeSiteMessagesRemaining === null || freeSiteMessagesRemaining > 0;
  }
  if (config.provider === "openrouter") {
    return Boolean(config.openrouterApiKey.trim());
  }
  return false;
}

function readInitialStoredConfig(): SiteMochiConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;

  try {
    const rawConfig = window.localStorage.getItem(SITE_MOCHI_CONFIG_STORAGE_KEY);
    if (!rawConfig) return DEFAULT_CONFIG;

    const parsed = JSON.parse(rawConfig);
    const sanitized = sanitizeConfig(parsed);
    const shouldMigrateLegacyUntouchedProvider =
      sanitized.provider === "openrouter" &&
      parsed &&
      typeof parsed === "object" &&
      looksLikeUntouchedProviderConfig(parsed as Partial<SiteMochiConfig>);
    const shouldMigrateAutoEnabledSoundDefaults =
      parsed &&
      typeof parsed === "object" &&
      looksLikeAutoEnabledSoundDefaults(parsed as Partial<SiteMochiConfig>);
    const migratedConfig = shouldMigrateLegacyUntouchedProvider
      ? { ...sanitized, provider: "site" as const }
      : sanitized;

    return shouldMigrateAutoEnabledSoundDefaults
      ? {
          ...migratedConfig,
          soundInputProvider: "off",
          soundInputAutoSend: false,
          soundOutputProvider: "off",
          soundOutputAutoSpeak: false,
        }
      : migratedConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function readInitialStoredCredits(): number {
  if (typeof window === "undefined") return 0;

  try {
    const rawCredits = window.localStorage.getItem(SITE_MOCHI_CREDITS_STORAGE_KEY);
    const parsed = Number(rawCredits);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

export function SiteMochiProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWalletSession();
  const [config, setConfig] = useState<SiteMochiConfig>(() => readInitialStoredConfig());
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [catalog, setCatalog] = useState<SiteMochiCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [freeSiteMessagesUsed, setFreeSiteMessagesUsed] = useState(() => readInitialStoredCredits());
  const hasHydratedConfigRef = useRef(false);
  const hydratedSoulStorageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    hasHydratedConfigRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedConfigRef.current) return;
    localStorage.setItem(SITE_MOCHI_CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    if (!hasHydratedConfigRef.current) return;

    try {
      const soulStorageKey = getSoulStorageKey(publicKey);
      if (hydratedSoulStorageKeyRef.current === soulStorageKey) return;
      hydratedSoulStorageKeyRef.current = soulStorageKey;

      const savedSoul = localStorage.getItem(soulStorageKey);
      if (savedSoul !== null) {
        const normalizedSoul = sanitizeFreeformText(savedSoul, DEFAULT_CONFIG.soulMd, 4000);
        setConfig((prev) => (prev.soulMd === normalizedSoul ? prev : { ...prev, soulMd: normalizedSoul }));
        return;
      }
    } catch {
      // Ignore storage failures.
    }
  }, [publicKey]);

  useEffect(() => {
    if (!hasHydratedConfigRef.current) return;

    try {
      localStorage.setItem(getSoulStorageKey(publicKey), config.soulMd);
    } catch {
      // Ignore storage failures.
    }
  }, [config.soulMd, publicKey]);

  useEffect(() => {
    localStorage.setItem(SITE_MOCHI_CREDITS_STORAGE_KEY, String(freeSiteMessagesUsed));
  }, [freeSiteMessagesUsed]);

  async function reloadCatalog() {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const query = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : "";
      const response = await fetch(`/api/site-mochi/catalog${query}`, { cache: "no-store" });
      const json = (await response.json()) as Partial<SiteMochiCatalog> & { error?: string };
      if (!response.ok || !json || !Array.isArray(json.characters) || !Array.isArray(json.personalities)) {
        throw new Error(json?.error || "Failed to load site mochi catalog.");
      }
      const nextCatalog: SiteMochiCatalog = {
        characters: json.characters as SiteMochiCharacterOption[],
        personalities: json.personalities as SiteMochiPersonalityOption[],
        freeSiteMessageLimit:
          typeof json.freeSiteMessageLimit === "number"
            ? json.freeSiteMessageLimit
            : DEFAULT_FREE_SITE_MESSAGE_LIMIT,
      };
      setCatalog(nextCatalog);

      setConfig((prev) => {
        const hasCharacter = nextCatalog.characters.some((entry) => entry.key === prev.character);
        if (hasCharacter) return prev;
        return {
          ...prev,
          character: hasCharacter ? prev.character : nextCatalog.characters[0]?.key || DEFAULT_CONFIG.character,
        };
      });
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Failed to load catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    reloadCatalog().catch(() => undefined);
  }, [publicKey]);

  const freeSiteMessagesRemaining = useMemo(() => {
    const limit = catalog?.freeSiteMessageLimit ?? DEFAULT_FREE_SITE_MESSAGE_LIMIT;
    return Math.max(0, limit - freeSiteMessagesUsed);
  }, [catalog?.freeSiteMessageLimit, freeSiteMessagesUsed]);

  const value = useMemo<SiteMochiContextValue>(
    () => ({
      config,
      updateConfig: (next) => {
        setConfig((prev) => sanitizeConfig({ ...prev, ...next, enabled: true }));
      },
      resetConfig: () => setConfig(DEFAULT_CONFIG),
      isConfigOpen,
      openConfig: () => setIsConfigOpen(true),
      closeConfig: () => setIsConfigOpen(false),
      toggleConfig: () => setIsConfigOpen((prev) => !prev),
      catalog,
      catalogLoading,
      catalogError,
      reloadCatalog,
      freeSiteMessagesUsed,
      incrementFreeSiteMessagesUsed: () => setFreeSiteMessagesUsed((prev) => prev + 1),
      resetFreeSiteMessagesUsed: () => setFreeSiteMessagesUsed(0),
      freeSiteMessagesRemaining,
      canUseCurrentProvider: canUseProvider(config, freeSiteMessagesRemaining),
    }),
    [
      catalog,
      catalogError,
      catalogLoading,
      config,
      freeSiteMessagesRemaining,
      freeSiteMessagesUsed,
      isConfigOpen,
    ],
  );

  return (
    <SiteMochiContext.Provider value={value}>
      {children}
    </SiteMochiContext.Provider>
  );
}

export function useSiteMochi() {
  const context = useContext(SiteMochiContext);
  if (!context) {
    throw new Error("useSiteMochi must be used within a SiteMochiProvider");
  }
  return context;
}
