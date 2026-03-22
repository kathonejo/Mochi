const { spawn } = require('child_process');
const path = require('path');

const DEFAULT_TERMINAL_DISTRO = 'Ubuntu';
const TERMINAL_STREAM_TAIL_KEEP = 256;
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
  return normalized || DEFAULT_TERMINAL_DISTRO;
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

function createTerminalService({ emitEvent } = {}) {
  const terminalSessions = new Map();
  const sendEvent = typeof emitEvent === 'function'
    ? emitEvent
    : () => {};

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
    sendEvent(pending.webContents, 'terminal-stream-delta', {
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
    sendEvent(pending.webContents, 'terminal-stream-done', {
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
    sendEvent(pending.webContents, 'terminal-stream-error', {
      mochiId: sessionObj.mochiId,
      error: errorMessage
    });
    pending.reject(new Error(errorMessage));
  }

  function onTerminalStdout(sessionObj, data) {
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
    const pending = sessionObj.pending;
    if (!pending || !data) return;
    if (!pending.started) return;
    flushTerminalChunk(sessionObj, pending, data, 'stderr');
  }

  function createTerminalSession(mochiId, settings = {}) {
    const distro = normalizeTerminalDistro(settings.terminalDistro);
    const configuredCwd = normalizeTerminalCwd(settings.terminalCwd);
    const isWindows = process.platform === 'win32';
    const shellBootstrap = 'if command -v script >/dev/null 2>&1; then exec script -qf /dev/null -c "bash -il"; fi; exec bash -il';
    const command = isWindows ? 'wsl.exe' : 'bash';
    const args = isWindows
      ? [...(distro ? ['-d', distro] : []), '--', 'bash', '-lc', shellBootstrap]
      : ['-lc', shellBootstrap];

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
        COLORTERM: process.env.COLORTERM || 'truecolor',
        TERM_PROGRAM: process.env.TERM_PROGRAM || 'MochiDesktop',
        TERM_PROGRAM_VERSION: process.env.TERM_PROGRAM_VERSION || '0.1.0'
      }
    });

    const sessionObj = {
      mochiId,
      distro,
      configuredCwd,
      needsConfiguredCwd: Boolean(configuredCwd),
      currentCwd: '',
      process: child,
      pending: null,
      closing: false
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => onTerminalStdout(sessionObj, String(data || '')));
    child.stderr.on('data', (data) => onTerminalStderr(sessionObj, String(data || '')));
    child.on('error', (error) => {
      const message = error?.message ? `TERMINAL_ERROR:${error.message}` : 'TERMINAL_ERROR';
      failTerminalPending(sessionObj, message);
      terminalSessions.delete(mochiId);
    });
    child.on('exit', (code, signal) => {
      terminalSessions.delete(mochiId);
      if (!sessionObj.pending) return;
      const message = sessionObj.closing
        ? 'TERMINAL_SESSION_CLOSED'
        : `TERMINAL_SESSION_EXIT:${code ?? ''}${signal ? `:${signal}` : ''}`;
      failTerminalPending(sessionObj, message);
    });

    terminalSessions.set(mochiId, sessionObj);
    return sessionObj;
  }

  function closeSession(mochiId, reason = 'TERMINAL_SESSION_CLOSED') {
    const sessionObj = terminalSessions.get(mochiId);
    if (!sessionObj) return false;
    terminalSessions.delete(mochiId);
    sessionObj.closing = true;
    if (sessionObj.pending) {
      failTerminalPending(sessionObj, reason);
    }
    try {
      if (!sessionObj.process.killed) {
        sessionObj.process.kill();
      }
    } catch {}
    return true;
  }

  function closeAllSessions() {
    for (const mochiId of terminalSessions.keys()) {
      closeSession(mochiId, 'TERMINAL_SESSION_CLOSED');
    }
  }

  function getOrCreateSession(mochiId, settings = {}) {
    const desiredDistro = normalizeTerminalDistro(settings.terminalDistro);
    const desiredCwd = normalizeTerminalCwd(settings.terminalCwd);
    let sessionObj = terminalSessions.get(mochiId);
    if (sessionObj && sessionObj.distro !== desiredDistro) {
      closeSession(mochiId, 'TERMINAL_SESSION_REPLACED');
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

  async function autocomplete(mochiId, fragment, settings = {}) {
    const query = String(fragment || '');
    if (!query) {
      return { ok: true, completion: '', candidates: [] };
    }

    const sessionObj = getOrCreateSession(mochiId, settings);
    const cwd = normalizeTerminalCwd(sessionObj.currentCwd || sessionObj.configuredCwd || settings.terminalCwd);
    const distro = normalizeTerminalDistro(settings.terminalDistro || sessionObj.distro);
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'wsl.exe' : 'bash';
    const cwdPrefix = cwd
      ? `cd "${escapeBashDoubleQuoted(cwd)}" >/dev/null 2>&1 || true\n`
      : '';
    const script = `${cwdPrefix}fragment="${escapeBashDoubleQuoted(query)}"\ncompgen -c -- "$fragment" 2>/dev/null\ncompgen -f -- "$fragment" 2>/dev/null\n`;
    const args = isWindows
      ? [...(distro ? ['-d', distro] : []), '--', 'bash', '-lc', script]
      : ['-lc', script];

    const raw = await new Promise((resolve) => {
      const child = spawn(command, args, {
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

  async function executeCommand(webContents, mochiId, commandText, settings = {}) {
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

    const sessionObj = getOrCreateSession(mochiId, {
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

  return {
    executeCommand,
    autocomplete,
    closeSession,
    closeAllSessions
  };
}

module.exports = {
  createTerminalService,
  normalizeTerminalDistro,
  normalizeTerminalCwd,
  normalizeTerminalNotifyOnFinish
};
