(function exposeMochiTerminalPane() {
  const DEFAULT_MAX_LINES = 4000;
  const LINK_MATCHER = /https?:\/\/[^\s'"]+/i;

  function isFunction(value) {
    return typeof value === 'function';
  }

  function normalizeText(raw) {
    return String(raw || '').replace(/\r\n/g, '\n');
  }

  class MochiTerminalPane {
    constructor(container, options = {}) {
      this.container = container;
      this.options = options || {};
      this.maxLines = Number.isFinite(this.options.maxLines)
        ? Math.max(300, this.options.maxLines)
        : DEFAULT_MAX_LINES;

      this.term = null;
      this.fitAddon = null;
      this.resizeObserver = null;
      this.fallbackPre = null;
      this.boundKeyDown = (event) => this.onKeyDown(event);
      this.boundPaste = (event) => this.onPaste(event);
      this.boundMouseDown = () => this.focus();
      this.boundContextMenu = (event) => this.onContextMenu(event);
      this.contextMenuEl = null;
      this.linkMatcherId = null;

      this.container.innerHTML = '';
      this.container.tabIndex = 0;
      this.container.addEventListener('keydown', this.boundKeyDown);
      this.container.addEventListener('paste', this.boundPaste);
      this.container.addEventListener('mousedown', this.boundMouseDown);
      this.container.addEventListener('contextmenu', this.boundContextMenu);

      if (window.Terminal) {
        this.mountXterm();
      } else {
        this.mountFallback();
      }

      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(() => this.fit());
        this.resizeObserver.observe(this.container);
      }
    }

    mountXterm() {
      const term = new window.Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.34,
        scrollback: this.maxLines,
        allowTransparency: true,
        convertEol: false,
        macOptionIsMeta: true,
        theme: {
          background: '#090f18',
          foreground: '#ebf1ff',
          cursor: '#8cc8ff',
          cursorAccent: '#090f18',
          selectionBackground: 'rgba(120, 170, 255, 0.28)',
          black: '#1b2534',
          red: '#ff5f56',
          green: '#27c93f',
          yellow: '#f2cc60',
          blue: '#4aa9ff',
          magenta: '#c792ea',
          cyan: '#4fd8c7',
          white: '#d6deeb',
          brightBlack: '#63718d',
          brightRed: '#ff8b8b',
          brightGreen: '#5ef0a0',
          brightYellow: '#ffe38b',
          brightBlue: '#7acbff',
          brightMagenta: '#e0b8ff',
          brightCyan: '#8ef5e7',
          brightWhite: '#f3f7ff'
        }
      });

      if (window.FitAddon && window.FitAddon.FitAddon) {
        this.fitAddon = new window.FitAddon.FitAddon();
        term.loadAddon(this.fitAddon);
      }

      term.open(this.container);
      if (typeof term.registerLinkMatcher === 'function') {
        this.linkMatcherId = term.registerLinkMatcher(
          LINK_MATCHER,
          (event, uri) => {
            if (!event || !(event.ctrlKey || event.metaKey)) return false;
            event.preventDefault();
            event.stopPropagation();
            this.openTerminalLink(uri);
            return false;
          },
          { matchIndex: 0, priority: 0 }
        );
      }

      // Handle copy/paste shortcuts inside xterm (xterm captures keys before DOM)
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown') return true;
        const key = event.key;

        // Ctrl+Shift+C or Ctrl+C with selection: copy
        if (event.ctrlKey && (key === 'C' || key === 'c')) {
          const selected = this.getSelectedText();
          if (selected) {
            event.preventDefault();
            this.copyText(selected);
            return false;
          }
          // Ctrl+C without selection: send interrupt (let xterm handle it)
          if (!event.shiftKey) return true;
          return false;
        }

        // Ctrl+Shift+V or Ctrl+V: paste
        if (event.ctrlKey && (key === 'V' || key === 'v')) {
          event.preventDefault();
          this.pasteTextFromClipboard();
          return false;
        }

        return true;
      });

      term.onData((data) => {
        if (isFunction(this.options.onData)) {
          this.options.onData(data);
        }
      });

      term.onResize((size) => {
        if (isFunction(this.options.onResize)) {
          this.options.onResize({ cols: size.cols, rows: size.rows });
        }
      });

      this.term = term;
      this.fit();
    }

    mountFallback() {
      const pre = document.createElement('pre');
      pre.className = 'mochi-chat-terminal-output';
      pre.textContent = '';
      this.container.appendChild(pre);
      this.fallbackPre = pre;
      if (isFunction(this.options.onResize)) {
        this.options.onResize({ cols: 80, rows: 24 });
      }
    }

    dispose() {
      this.container.removeEventListener('keydown', this.boundKeyDown);
      this.container.removeEventListener('paste', this.boundPaste);
      this.container.removeEventListener('mousedown', this.boundMouseDown);
      this.container.removeEventListener('contextmenu', this.boundContextMenu);
      this.dismissContextMenu();
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.term) {
        if (this.linkMatcherId !== null) {
          try {
            this.term.deregisterLinkMatcher(this.linkMatcherId);
          } catch {}
          this.linkMatcherId = null;
        }
        this.term.dispose();
        this.term = null;
      }
      this.fitAddon = null;
      this.fallbackPre = null;
    }

    focus() {
      if (this.term) {
        this.term.focus();
        return;
      }
      try {
        this.container.focus();
      } catch {}
    }

    clear() {
      if (this.term) {
        this.term.reset();
        this.fit();
        return;
      }
      if (this.fallbackPre) {
        this.fallbackPre.textContent = '';
      }
    }

    write(rawChunk) {
      const text = String(rawChunk || '');
      if (!text) return;
      if (this.term) {
        this.term.write(text);
        return;
      }
      if (!this.fallbackPre) return;
      this.fallbackPre.textContent += text;
      this.container.scrollTop = this.container.scrollHeight;
    }

    fit() {
      if (this.fitAddon && this.term) {
        try {
          this.fitAddon.fit();
        } catch {}
      }
      if (this.term && isFunction(this.options.onResize)) {
        this.options.onResize({ cols: this.term.cols, rows: this.term.rows });
      }
    }

    getSelectedText() {
      if (this.term) {
        return String(this.term.getSelection() || '');
      }
      const selection = window.getSelection ? window.getSelection() : null;
      const text = String(selection?.toString?.() || '');
      return text;
    }

    async copyText(text) {
      const value = String(text || '');
      if (!value) return;
      try {
        if (window.mochiApi?.clipboardWriteText) {
          window.mochiApi.clipboardWriteText(value);
          return;
        }
      } catch {}
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return;
        }
      } catch {}
      try {
        document.execCommand('copy');
      } catch {}
    }

    pasteTextFromClipboard() {
      if (!this.term && !isFunction(this.options.onData)) return;
      try {
        let text = '';
        if (window.mochiApi?.clipboardReadText) {
          text = window.mochiApi.clipboardReadText();
        } else if (navigator.clipboard?.readText) {
          // Fallback (may not work on Windows Electron)
          navigator.clipboard.readText().then((t) => {
            const normalized = normalizeText(t);
            if (!normalized) return;
            if (this.term) { this.term.paste(normalized); return; }
            if (isFunction(this.options.onData)) this.options.onData(normalized);
          }).catch(() => {});
          return;
        }
        const normalized = normalizeText(text);
        if (!normalized) return;
        if (this.term) {
          this.term.paste(normalized);
          return;
        }
        if (isFunction(this.options.onData)) this.options.onData(normalized);
      } catch {}
    }

    openTerminalLink(uri) {
      const url = String(uri || '').trim();
      if (!url) return;
      const payload = {
        url,
        context: 'terminal-link',
        skipDialog: true
      };
      if (window.mochiApi?.openUrlWithBrowserChoice) {
        window.mochiApi.openUrlWithBrowserChoice(payload).catch(() => {
          window.open(url, '_blank', 'noopener,noreferrer');
        });
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    onContextMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      this.dismissContextMenu();

      const selected = this.getSelectedText();
      const menu = document.createElement('div');
      menu.className = 'mochi-terminal-context-menu';
      menu.style.cssText = `
        position: fixed; z-index: 99999;
        left: ${event.clientX}px; top: ${event.clientY}px;
        background: #1b2534; border: 1px solid #2a3a4e; border-radius: 6px;
        padding: 4px 0; min-width: 140px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; color: #ebf1ff;
      `;

      const items = [
        { label: 'Copy', shortcut: 'Ctrl+C', enabled: Boolean(selected), action: () => this.copyText(selected) },
        { label: 'Paste', shortcut: 'Ctrl+V', enabled: true, action: () => this.pasteTextFromClipboard() },
        { label: 'Select All', shortcut: '', enabled: true, action: () => { if (this.term) this.term.selectAll(); } }
      ];

      for (const item of items) {
        const row = document.createElement('div');
        row.style.cssText = `
          padding: 6px 16px; cursor: ${item.enabled ? 'pointer' : 'default'};
          display: flex; justify-content: space-between; align-items: center;
          opacity: ${item.enabled ? '1' : '0.4'};
        `;
        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        row.appendChild(labelSpan);
        if (item.shortcut) {
          const shortcutSpan = document.createElement('span');
          shortcutSpan.textContent = item.shortcut;
          shortcutSpan.style.cssText = 'margin-left: 24px; opacity: 0.5; font-size: 11px;';
          row.appendChild(shortcutSpan);
        }
        if (item.enabled) {
          row.addEventListener('mouseenter', () => { row.style.background = '#2a3a4e'; });
          row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dismissContextMenu();
            item.action();
          });
        }
        menu.appendChild(row);
      }

      document.body.appendChild(menu);
      this.contextMenuEl = menu;

      // Adjust position if menu overflows viewport
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

      const dismissHandler = (e) => {
        if (menu.contains(e.target)) return;
        this.dismissContextMenu();
      };
      setTimeout(() => {
        document.addEventListener('mousedown', dismissHandler, { once: true });
        document.addEventListener('contextmenu', dismissHandler, { once: true });
      }, 0);
      menu._dismissHandler = dismissHandler;
    }

    dismissContextMenu() {
      if (this.contextMenuEl) {
        try { this.contextMenuEl.remove(); } catch {}
        this.contextMenuEl = null;
      }
    }

    onPaste(event) {
      const text = event?.clipboardData?.getData('text/plain');
      if (!text) return;
      const normalized = normalizeText(text);
      event.preventDefault();
      if (this.term) {
        this.term.paste(normalized);
        return;
      }
      if (isFunction(this.options.onData)) {
        this.options.onData(normalized);
      }
    }

    onKeyDown(event) {
      const key = event.key;
      const selected = this.getSelectedText();
      const isCopyKey = key === 'C' || key === 'c';
      const isPasteKey = key === 'V' || key === 'v';

      if (event.ctrlKey && event.shiftKey && isCopyKey) {
        if (selected) {
          event.preventDefault();
          event.stopPropagation();
          this.copyText(selected);
        }
        return;
      }

      if (event.ctrlKey && event.shiftKey && isPasteKey) {
        event.preventDefault();
        event.stopPropagation();
        this.pasteTextFromClipboard();
        return;
      }

      if (event.ctrlKey && !event.altKey && isPasteKey) {
        event.preventDefault();
        event.stopPropagation();
        this.pasteTextFromClipboard();
        return;
      }

      if (event.ctrlKey && !event.altKey && (key === 'C' || key === 'c') && selected) {
        event.preventDefault();
        event.stopPropagation();
        this.copyText(selected);
      }
    }
  }

  window.MochiTerminalPane = MochiTerminalPane;
})();
