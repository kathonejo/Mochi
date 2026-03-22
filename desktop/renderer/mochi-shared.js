// mochi-shared.js — Shared runtime for Mochi
// Canonical source lives in runtime-core/; sync to all targets via: npm run sync-runtime-core
//
// IMPORTANT: No console.log calls — this file runs inside browser extension content scripts.
// All functions must be pure or self-contained with private state.

(function (global) {
    'use strict';

    // ─── Core constants ───────────────────────────────────────────────────────
    var SPRITE_SIZE  = 128;
    var TICK_MS      = 40;
    var MAX_MOCHIS = 5;

    // ─── CallBack-line positioning ────────────────────────────────────────────
    // Determines where each mochi lands when recalled from off-screen.
    // State is page-scoped (shared across all mochis on the same page).
    var CALL_BACK_LINE_SPACING    = 150;
    var CALL_BACK_LINE_MARGIN     = 22;
    var CALL_BACK_RESET_DELAY     = 1200;

    var _callBackLineCount        = { left: 0, right: 0 };
    var _callBackLineResetTimer   = null;

    function resetCallBackLineCounters() {
        _callBackLineCount.left  = 0;
        _callBackLineCount.right = 0;
        _callBackLineResetTimer  = null;
    }

    function scheduleCallBackLineReset() {
        if (_callBackLineResetTimer) clearTimeout(_callBackLineResetTimer);
        _callBackLineResetTimer = setTimeout(resetCallBackLineCounters, CALL_BACK_RESET_DELAY);
    }

    function computeCallBackX(edge, size) {
        var safeEdge   = edge === -1 ? -1 : 1;
        var sideKey    = safeEdge === -1 ? 'left' : 'right';
        var slot       = Math.min(_callBackLineCount[sideKey], MAX_MOCHIS - 1);
        _callBackLineCount[sideKey] = Math.min(_callBackLineCount[sideKey] + 1, MAX_MOCHIS);
        scheduleCallBackLineReset();
        var spacing     = Math.max(CALL_BACK_LINE_SPACING, size * 1.1);
        var screenWidth = Math.max(window.innerWidth, size + CALL_BACK_LINE_MARGIN * 2);
        var leftBase    = CALL_BACK_LINE_MARGIN;
        var rightBase   = Math.max(screenWidth - size - CALL_BACK_LINE_MARGIN, CALL_BACK_LINE_MARGIN);
        if (safeEdge === -1) {
            return Math.min(leftBase + slot * spacing, window.innerWidth - size - CALL_BACK_LINE_MARGIN);
        }
        return Math.max(rightBase - slot * spacing, CALL_BACK_LINE_MARGIN);
    }

    // ─── TTS / Voice personality ──────────────────────────────────────────────
    var PERSONALITY_TTS = {
        cryptid:     { pitch: 0.9,  rate: 1.0  },
        cozy:        { pitch: 1.1,  rate: 0.85 },
        chaotic:     { pitch: 1.4,  rate: 1.4  },
        philosopher: { pitch: 0.7,  rate: 0.8  },
        hype:        { pitch: 1.3,  rate: 1.3  },
        noir:        { pitch: 0.6,  rate: 0.9  },
        egg:         { pitch: 1.15, rate: 0.95 }
    };

    // Playback-rate multiplier for synthesized / WAV sounds (per personality)
    var PERSONALITY_SOUND_RATE = {
        cryptid: 1.0, cozy: 0.85, chaotic: 1.35,
        philosopher: 0.75, hype: 1.25, noir: 0.7, egg: 0.95
    };

    var TTS_VOICE_PROFILES = {
        random:    [],
        warm:      ['female', 'maria', 'samantha', 'sofia', 'lucia', 'lucía'],
        bright:    ['google', 'zira', 'susan', 'catherine', 'linda'],
        deep:      ['male', 'daniel', 'alex', 'jorge', 'diego', 'miguel'],
        calm:      ['serena', 'paulina', 'audrey', 'amelie'],
        energetic: ['fred', 'mark', 'david', 'juan']
    };

    var TTS_PROFILE_MODIFIERS = {
        random:    { pitchOffset: 0,     rateOffset: 0    },
        warm:      { pitchOffset: 0.15,  rateOffset: -0.1 },
        bright:    { pitchOffset: 0.3,   rateOffset: 0.1  },
        deep:      { pitchOffset: -0.35, rateOffset: -0.1 },
        calm:      { pitchOffset: -0.1,  rateOffset: -0.2 },
        energetic: { pitchOffset: 0.2,   rateOffset: 0.25 }
    };

    var TTS_PROFILE_POOL = Object.keys(TTS_VOICE_PROFILES).filter(function (k) { return k !== 'random'; });

    var MOCHI_PITCH_FACTORS = [0.85, 0.93, 1.0, 1.08, 1.18];

    function getMochiPitchFactor(mochiId) {
        var idx = parseInt((String(mochiId).match(/(\d+)/) || [null, '1'])[1], 10) - 1;
        return MOCHI_PITCH_FACTORS[idx % MOCHI_PITCH_FACTORS.length];
    }

    function pickRandomTtsProfile() {
        if (!TTS_PROFILE_POOL.length) return 'random';
        return TTS_PROFILE_POOL[Math.floor(Math.random() * TTS_PROFILE_POOL.length)];
    }

    function getVoicesAsync() {
        return new Promise(function (resolve) {
            var synth = window.speechSynthesis;
            if (!synth) return resolve([]);
            var voices = synth.getVoices();
            if (voices && voices.length) return resolve(voices);
            var handler = function () {
                voices = synth.getVoices();
                resolve(voices || []);
                if (synth.removeEventListener) synth.removeEventListener('voiceschanged', handler);
            };
            if (synth.addEventListener) synth.addEventListener('voiceschanged', handler);
            setTimeout(function () { resolve(synth.getVoices() || []); }, 650);
        });
    }

    function pickVoiceByProfile(profile, voices, langPrefix) {
        var filtered = voices.filter(function (v) {
            return (v.lang || '').toLowerCase().startsWith(langPrefix);
        });
        var pool = filtered.length ? filtered : voices;
        if (!pool.length) return null;
        if (profile === 'random') return pool[Math.floor(Math.random() * pool.length)];
        var keywords = TTS_VOICE_PROFILES[profile] || [];
        if (!keywords.length) return pool[0];
        var found = pool.find(function (voice) {
            var name = (voice.name || '').toLowerCase();
            return keywords.some(function (kw) { return name.includes(kw); });
        });
        return found || pool[0];
    }

    // ─── Chat themes ──────────────────────────────────────────────────────────
    var CHAT_THEMES = [
        { id: 'pastel',    labelEn: 'Pastel',    labelEs: 'Pastel',     theme: '#3b1a77', bg: '#f0e8ff', bubble: 'glass' },
        { id: 'pink',      labelEn: 'Pink',      labelEs: 'Rosa',       theme: '#7a124b', bg: '#ffd2ea', bubble: 'glass' },
        { id: 'kawaii',    labelEn: 'Kawaii',    labelEs: 'Kawaii',     theme: '#5b1456', bg: '#ffd8f0', bubble: 'glass' },
        { id: 'mint',      labelEn: 'Mint',      labelEs: 'Menta',      theme: '#0f5f54', bg: '#c7fff0', bubble: 'glass' },
        { id: 'ocean',     labelEn: 'Ocean',     labelEs: 'Océano',     theme: '#103a7a', bg: '#cfe6ff', bubble: 'glass' },
        { id: 'neural',    labelEn: 'Neural',    labelEs: 'Neural',     theme: '#86f0ff', bg: '#0b0d1f', bubble: 'dark'  },
        { id: 'cyberpunk', labelEn: 'Cyberpunk', labelEs: 'Cyberpunk',  theme: '#19d3ff', bg: '#0a0830', bubble: 'dark'  },
        { id: 'noir-rose', labelEn: 'Noir Rose', labelEs: 'Noir Rosa',  theme: '#ff5fbf', bg: '#0b0717', bubble: 'dark'  },
        { id: 'midnight',  labelEn: 'Midnight',  labelEs: 'Medianoche', theme: '#7aa7ff', bg: '#0b1220', bubble: 'dark'  },
        { id: 'ember',     labelEn: 'Ember',     labelEs: 'Brasas',     theme: '#ff8b3d', bg: '#1a0c08', bubble: 'dark'  }
    ];

    function pickRandomChatTheme() {
        return CHAT_THEMES[Math.floor(Math.random() * CHAT_THEMES.length)];
    }

    // ─── Utility math / color ─────────────────────────────────────────────────
    function weightedRandom(choices) {
        var total = choices.reduce(function (sum, c) { return sum + c.weight; }, 0);
        var r = Math.random() * total;
        for (var i = 0; i < choices.length; i++) {
            r -= choices[i].weight;
            if (r <= 0) return choices[i].action;
        }
        return choices[choices.length - 1].action;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function hexToRgb(hex) {
        if (!hex) return null;
        var cleaned = hex.replace('#', '');
        if (cleaned.length !== 6) return null;
        var num = parseInt(cleaned, 16);
        if (Number.isNaN(num)) return null;
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    // ─── Language detection ───────────────────────────────────────────────────
    function detectBrowserLanguage() {
        var languages = Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages
            : [navigator.language];
        var hasSpanish = languages.some(function (lang) {
            return (lang || '').toLowerCase().startsWith('es');
        });
        return hasSpanish ? 'es' : 'en';
    }

    // ─── Config defaults (browser / extension runtime) ────────────────────────
    var CHARACTER_KEYS   = ['mochi', 'bunny', 'kitten', 'ghost', 'blob', 'lobster', 'mushroom', 'penguin'];
    var PERSONALITY_KEYS = ['cryptid', 'cozy', 'chaotic', 'philosopher', 'hype', 'noir', 'egg'];
    var MODEL_KEYS = [
        'google/gemini-2.0-flash-001', 'moonshotai/kimi-k2.5', 'anthropic/claude-sonnet-4',
        'meta-llama/llama-4-maverick', 'deepseek/deepseek-chat-v3-0324', 'mistralai/mistral-large-2411'
    ];
    var MODEL_KEYS_ENABLED = MODEL_KEYS.filter(function (m) { return m !== 'moonshotai/kimi-k2.5'; });
    var SIZE_KEYS          = ['small', 'medium', 'big'];
    var THEME_COLOR_POOL   = [
        '#2a1f4e', '#1e3a5f', '#4a2040', '#0f4c3a', '#5c2d0e',
        '#3b1260', '#0e3d6b', '#6b1d3a', '#2e4a12', '#4c1a6b'
    ];

    // ─── Sprite / animation data (browser runtime) ────────────────────────────
    var SPRITES = {
        'stand-neutral':              'stand-neutral.png',
        'walk-step-left':             'walk-step-left.png',
        'walk-step-right':            'walk-step-right.png',
        'fall':                       'fall.png',
        'bounce-squish':              'bounce-squish.png',
        'bounce-recover':             'bounce-recover.png',
        'sit':                        'sit.png',
        'sit-look-up':                'sit-look-up.png',
        'sprawl-lying':               'sprawl-lying.png',
        'crawl-crouch':               'crawl-crouch.png',
        'jump':                       'jump.png',
        'dragged-tilt-left':          'dragged-tilt-left-light.png',
        'dragged-tilt-right':         'dragged-tilt-right-light.png',
        'dragged-tilt-left-heavy':    'dragged-tilt-left-heavy.png',
        'dragged-tilt-right-heavy':   'dragged-tilt-right-heavy.png',
        'resist-frame-1':             'resist-frame-1.png',
        'resist-frame-2':             'resist-frame-2.png',
        'grab-wall':                  'grab-wall.png',
        'climb-wall-frame-1':         'climb-wall-frame-1.png',
        'climb-wall-frame-2':         'climb-wall-frame-2.png',
        'grab-ceiling':               'grab-ceiling.png',
        'climb-ceiling-frame-1':      'climb-ceiling-frame-1.png',
        'climb-ceiling-frame-2':      'climb-ceiling-frame-2.png',
        'sit-edge-legs-up':           'sit-edge-legs-up.png',
        'sit-edge-legs-down':         'sit-edge-legs-down.png',
        'sit-edge-dangle-frame-1':    'sit-edge-dangle-frame-1.png',
        'sit-edge-dangle-frame-2':    'sit-edge-dangle-frame-2.png',
        'spin-head-frame-1':          'spin-head-frame-1.png',
        'spin-head-frame-2':          'spin-head-frame-2.png',
        'spin-head-frame-3':          'spin-head-frame-3.png',
        'spin-head-frame-4':          'spin-head-frame-4.png',
        'spin-head-frame-5':          'spin-head-frame-5.png',
        'spin-head-frame-6':          'spin-head-frame-6.png',
        'sit-pc-edge-legs-down':      'sit-pc-edge-legs-down.png',
        'sit-pc-edge-dangle-frame-1': 'sit-pc-edge-dangle-frame-1.png',
        'sit-pc-edge-dangle-frame-2': 'sit-pc-edge-dangle-frame-2.png'
    };

    var ANIMATIONS_FULL = {
        idle:            [{ sprite: 'stand-neutral', duration: 1 }],
        walking:         [
            { sprite: 'stand-neutral',   duration: 6 },
            { sprite: 'walk-step-left',  duration: 6 },
            { sprite: 'stand-neutral',   duration: 6 },
            { sprite: 'walk-step-right', duration: 6 }
        ],
        crawling:        [
            { sprite: 'crawl-crouch', duration: 8 },
            { sprite: 'sprawl-lying', duration: 8 }
        ],
        falling:         [{ sprite: 'fall',          duration: 1 }],
        jumping:         [{ sprite: 'jump',           duration: 1 }],
        landing:         [
            { sprite: 'bounce-squish',  duration: 4 },
            { sprite: 'bounce-recover', duration: 4 }
        ],
        sitting:         [{ sprite: 'sit',          duration: 1 }],
        sittingLookUp:   [{ sprite: 'sit-look-up',  duration: 1 }],
        sprawled:        [{ sprite: 'sprawl-lying',  duration: 1 }],
        climbingWall:    [
            { sprite: 'grab-wall',          duration: 16 },
            { sprite: 'climb-wall-frame-1', duration: 4  },
            { sprite: 'grab-wall',          duration: 4  },
            { sprite: 'climb-wall-frame-2', duration: 4  }
        ],
        climbingCeiling: [
            { sprite: 'grab-ceiling',           duration: 16 },
            { sprite: 'climb-ceiling-frame-1',  duration: 4  },
            { sprite: 'grab-ceiling',           duration: 4  },
            { sprite: 'climb-ceiling-frame-2',  duration: 4  }
        ],
        sittingEdge: [
            { sprite: 'sit-edge-legs-up',        duration: 10 },
            { sprite: 'sit-edge-legs-down',       duration: 20 },
            { sprite: 'sit-edge-dangle-frame-1',  duration: 15 },
            { sprite: 'sit-edge-legs-down',       duration: 20 },
            { sprite: 'sit-edge-dangle-frame-2',  duration: 15 }
        ],
        headSpin: [
            { sprite: 'sit-look-up',      duration: 5 },
            { sprite: 'spin-head-frame-1', duration: 5 },
            { sprite: 'spin-head-frame-4', duration: 5 },
            { sprite: 'spin-head-frame-2', duration: 5 },
            { sprite: 'spin-head-frame-5', duration: 5 },
            { sprite: 'spin-head-frame-3', duration: 5 },
            { sprite: 'spin-head-frame-6', duration: 5 },
            { sprite: 'sit',              duration: 5 }
        ],
        sittingPc: [
            { sprite: 'sit-pc-edge-legs-down', duration: 10 }
        ],
        sittingPcDangle: [
            { sprite: 'sit-pc-edge-dangle-frame-1', duration: 15 },
            { sprite: 'sit-pc-edge-dangle-frame-2', duration: 15 }
        ]
    };

    var ANIMATIONS_SIMPLE = {
        idle:            [{ sprite: 'stand-neutral',      duration: 1 }],
        walking:         [
            { sprite: 'stand-neutral',   duration: 8 },
            { sprite: 'walk-step-left',  duration: 8 },
            { sprite: 'stand-neutral',   duration: 8 },
            { sprite: 'walk-step-right', duration: 8 }
        ],
        crawling:        [{ sprite: 'sprawl-lying',       duration: 1 }],
        falling:         [{ sprite: 'fall',               duration: 1 }],
        jumping:         [{ sprite: 'jump',               duration: 1 }],
        landing:         [{ sprite: 'bounce-recover',     duration: 6 }],
        sitting:         [{ sprite: 'sit',                duration: 1 }],
        sittingLookUp:   [{ sprite: 'sit',                duration: 1 }],
        sprawled:        [{ sprite: 'sprawl-lying',       duration: 1 }],
        climbingWall:    [{ sprite: 'grab-wall',          duration: 1 }],
        climbingCeiling: [{ sprite: 'grab-ceiling',       duration: 1 }],
        sittingEdge:     [{ sprite: 'sit-edge-legs-down', duration: 1 }],
        headSpin:        [{ sprite: 'sit',                duration: 1 }],
        sittingPc:       [{ sprite: 'sit-pc-edge-legs-down',      duration: 1 }],
        sittingPcDangle: [
            { sprite: 'sit-pc-edge-dangle-frame-1', duration: 1 },
            { sprite: 'sit-pc-edge-dangle-frame-2', duration: 1 }
        ]
    };

    // ─── OpenClaw agent naming ────────────────────────────────────────────────
    var OPENCLAW_AGENT_NAME_MAX = 32;

    function defaultOpenClawAgentName(indexOrId) {
        if (typeof indexOrId === 'number') return 'chrome-mochi-' + (indexOrId + 1);
        var match  = String(indexOrId || '').match(/(\d+)/);
        var suffix = match ? match[1] : '1';
        return 'chrome-mochi-' + suffix;
    }

    function normalizeOpenClawAgentName(rawValue, fallback) {
        var fallbackName = String(fallback || 'chrome-mochi-1').slice(0, OPENCLAW_AGENT_NAME_MAX);
        var normalized   = String(rawValue || '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .replace(/-+/g, '-')
            .replace(/_+/g, '_')
            .replace(/^[-_]+|[-_]+$/g, '')
            .slice(0, OPENCLAW_AGENT_NAME_MAX);
        return normalized || fallbackName;
    }

    // ─── Mode / URL normalization ─────────────────────────────────────────────
    function normalizeMode(modeValue) {
        if (modeValue === 'disabled' || modeValue === 'off' || modeValue === 'decorative') return 'off';
        if (modeValue === 'agent') return 'agent';
        return 'standard';
    }

    function normalizePageUrl(url) {
        try { return new URL(url).origin; } catch (_) { return null; }
    }

    function isDisabledForCurrentPage(disabledAll, disabledPages) {
        if (disabledAll) return true;
        var pageKey  = normalizePageUrl(window.location.href);
        if (!pageKey) return false;
        var pageList = Array.isArray(disabledPages) ? disabledPages : [];
        return pageList.includes(pageKey);
    }

    // ─── i18n helpers (parameterized by locale) ───────────────────────────────
    // Call as getNoApiKeyMessage(isSpanishLocale()) in each runtime.
    function getNoApiKeyMessage(isSpanish) {
        return isSpanish
            ? 'Para hablar, necesito una API key de OpenRouter (tiene free trial). Créala y pégala en la configuración de la extensión.'
            : 'To talk, I need an OpenRouter API key (free trial available). Create it and paste it in the extension settings.';
    }

    function getNoCreditsMessage(isSpanish) {
        return isSpanish
            ? 'No puedo hablar sin créditos. Necesito que cargues créditos en tu cuenta para seguir vivo.'
            : 'I cannot speak without credits. Please add credits to your account so I can stay alive.';
    }

    function getNoResponseMessage(isSpanish) {
        return isSpanish
            ? 'No pude recibir respuesta. Puede ser falta de créditos o conexión. Si puedes, revisa tu saldo.'
            : 'I could not get a response. It may be a lack of credits or a connection issue. Please check your balance.';
    }

    function getLockedMessage(isSpanish) {
        return isSpanish
            ? 'Estoy bloqueado. Abre la extensión y desbloquea la contraseña para poder hablar.'
            : 'I am locked. Open the extension and unlock the password to chat.';
    }

    // ─── Default mochi config factory ──────────────────────────────────────
    function getDefaultMochi(index) {
        var randomChar         = CHARACTER_KEYS[Math.floor(Math.random() * CHARACTER_KEYS.length)];
        var randomPersonality  = PERSONALITY_KEYS[Math.floor(Math.random() * PERSONALITY_KEYS.length)];
        var randomModel        = MODEL_KEYS_ENABLED[Math.floor(Math.random() * MODEL_KEYS_ENABLED.length)];
        var randomVoiceProfile = pickRandomTtsProfile();
        var randomSize         = SIZE_KEYS[Math.floor(Math.random() * SIZE_KEYS.length)];
        var randomThemeColor   = THEME_COLOR_POOL[Math.floor(Math.random() * THEME_COLOR_POOL.length)];
        var preset             = pickRandomChatTheme();
        return {
            id:                      'mochi-' + (index + 1),
            character:               randomChar,
            size:                    randomSize,
            mode:                    'standard',
            standardProvider:        'openrouter',
            openrouterApiKey:        '',
            openrouterModel:         'random',
            openrouterModelResolved: randomModel,
            ollamaUrl:               'http://127.0.0.1:11434',
            ollamaModel:             'gemma3:1b',
            openclawGatewayUrl:      'ws://127.0.0.1:18789',
            openclawGatewayToken:    '',
            openclawAgentName:       defaultOpenClawAgentName(index),
            personality:             randomPersonality,
            enabled:                 true,
            chatThemeColor:          preset ? preset.theme  : randomThemeColor,
            chatBgColor:             preset ? preset.bg     : '#ffffff',
            chatFontSize:            'medium',
            chatWidth:               'medium',
            chatHeightPx:            320,
            chatBubbleStyle:         preset ? preset.bubble : 'glass',
            chatThemePreset:         'random',
            ttsEnabled:              false,
            ttsVoiceProfile:         randomVoiceProfile,
            ttsVoiceId:              '',
            openMicEnabled:          false,
            relayEnabled:            false,
            animationQuality:        'full'
        };
    }

    // ─── Audio synthesis (pure — callers supply their AudioContext) ───────────
    var MOCHI_NOTE_FREQ = [523.25, 659.25, 783.99, 880.00, 1046.50]; // C5 E5 G5 A5 C6

    // Returns a Float32Array of PCM samples for a flute-like note.
    function synthesizeFluteNote(sampleRate, freq, duration) {
        var len         = Math.ceil(sampleRate * duration);
        var data        = new Float32Array(len);
        var attack      = 0.045;
        var release     = 0.15;
        var releaseStart = duration - release;
        for (var i = 0; i < len; i++) {
            var t = i / sampleRate;
            var env;
            if (t < attack)            env = t / attack;
            else if (t < releaseStart) env = 1.0;
            else                       env = Math.max(0, (duration - t) / release);
            var vibrato = Math.sin(2 * Math.PI * 5.2 * t) * 2.5;
            var f = freq + vibrato;
            data[i] = (
                Math.sin(2 * Math.PI * f * t)     * 0.55 +
                Math.sin(2 * Math.PI * f * 2 * t) * 0.22 +
                Math.sin(2 * Math.PI * f * 3 * t) * 0.07
            ) * env;
        }
        return data;
    }

    // Builds success + error AudioBuffers for a mochi slot.
    // getAudioContextFn must return an AudioContext (or null).
    function synthesizeMochiSounds(mochiId, getAudioContextFn) {
        var ctx = getAudioContextFn();
        if (!ctx) return { success: null, error: null };
        var sr      = ctx.sampleRate;
        var idx     = parseInt((String(mochiId).match(/(\d+)/) || [null, '1'])[1], 10) - 1;
        var baseFreq = MOCHI_NOTE_FREQ[idx % MOCHI_NOTE_FREQ.length];

        var successSamples = synthesizeFluteNote(sr, baseFreq, 0.38);
        var successBuf     = ctx.createBuffer(1, successSamples.length, sr);
        successBuf.getChannelData(0).set(successSamples);

        var errorFreq2 = baseFreq * 0.69;
        var note1      = synthesizeFluteNote(sr, baseFreq,   0.2);
        var gapLen     = Math.ceil(sr * 0.06);
        var note2      = synthesizeFluteNote(sr, errorFreq2, 0.28);
        var errorBuf   = ctx.createBuffer(1, note1.length + gapLen + note2.length, sr);
        var errorData  = errorBuf.getChannelData(0);
        errorData.set(note1, 0);
        errorData.set(note2, note1.length + gapLen);
        return { success: successBuf, error: errorBuf };
    }

    // ─── Export ───────────────────────────────────────────────────────────────
    global.MochiShared = {
        // Core
        SPRITE_SIZE:  SPRITE_SIZE,
        TICK_MS:      TICK_MS,
        MAX_MOCHIS: MAX_MOCHIS,

        // CallBack-line positioning
        CALL_BACK_LINE_SPACING:  CALL_BACK_LINE_SPACING,
        CALL_BACK_LINE_MARGIN:   CALL_BACK_LINE_MARGIN,
        CALL_BACK_RESET_DELAY:   CALL_BACK_RESET_DELAY,
        computeCallBackX:        computeCallBackX,
        resetCallBackLineCounters: resetCallBackLineCounters,
        scheduleCallBackLineReset: scheduleCallBackLineReset,

        // TTS / voice
        PERSONALITY_TTS:        PERSONALITY_TTS,
        PERSONALITY_SOUND_RATE: PERSONALITY_SOUND_RATE,
        TTS_VOICE_PROFILES:     TTS_VOICE_PROFILES,
        TTS_PROFILE_MODIFIERS:  TTS_PROFILE_MODIFIERS,
        TTS_PROFILE_POOL:       TTS_PROFILE_POOL,
        MOCHI_PITCH_FACTORS:  MOCHI_PITCH_FACTORS,
        getMochiPitchFactor:  getMochiPitchFactor,
        pickRandomTtsProfile:   pickRandomTtsProfile,
        getVoicesAsync:         getVoicesAsync,
        pickVoiceByProfile:     pickVoiceByProfile,

        // Chat themes
        CHAT_THEMES:       CHAT_THEMES,
        pickRandomChatTheme: pickRandomChatTheme,

        // Utility
        weightedRandom:      weightedRandom,
        clamp:               clamp,
        hexToRgb:            hexToRgb,
        detectBrowserLanguage: detectBrowserLanguage,

        // Config defaults (browser / extension runtime)
        CHARACTER_KEYS:    CHARACTER_KEYS,
        PERSONALITY_KEYS:  PERSONALITY_KEYS,
        MODEL_KEYS:        MODEL_KEYS,
        MODEL_KEYS_ENABLED: MODEL_KEYS_ENABLED,
        SIZE_KEYS:         SIZE_KEYS,
        THEME_COLOR_POOL:  THEME_COLOR_POOL,

        // Sprite / animation data
        SPRITES:           SPRITES,
        ANIMATIONS_FULL:   ANIMATIONS_FULL,
        ANIMATIONS_SIMPLE: ANIMATIONS_SIMPLE,

        // OpenClaw naming
        OPENCLAW_AGENT_NAME_MAX:     OPENCLAW_AGENT_NAME_MAX,
        defaultOpenClawAgentName:    defaultOpenClawAgentName,
        normalizeOpenClawAgentName:  normalizeOpenClawAgentName,

        // Mode / URL helpers
        normalizeMode:               normalizeMode,
        normalizePageUrl:            normalizePageUrl,
        isDisabledForCurrentPage:    isDisabledForCurrentPage,

        // i18n (pass isSpanishLocale() result as argument)
        getNoApiKeyMessage:   getNoApiKeyMessage,
        getNoCreditsMessage:  getNoCreditsMessage,
        getNoResponseMessage: getNoResponseMessage,
        getLockedMessage:     getLockedMessage,

        // Config factory
        getDefaultMochi: getDefaultMochi,

        // Audio synthesis
        MOCHI_NOTE_FREQ:       MOCHI_NOTE_FREQ,
        synthesizeFluteNote:     synthesizeFluteNote,
        synthesizeMochiSounds: synthesizeMochiSounds
    };

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
