(async () => {
  const callAllBtn = document.getElementById('call-all');
  const dismissAllBtn = document.getElementById('dismiss-all');
  const listEl = document.getElementById('mochi-list');
  const settingsBtn = document.getElementById('open-settings');

  if (!window.mochiTrayApi || !listEl) return;

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.mochiTrayApi.openSettings();
      window.close();
    });
  }

  const state = await window.mochiTrayApi.getState();
  const mochis = Array.isArray(state?.mochis) ? state.mochis : [];

  const hasEntries = mochis.length > 0;
  callAllBtn.disabled = !hasEntries;
  dismissAllBtn.disabled = !hasEntries;

  const createIcon = (character) => {
    const image = document.createElement('img');
    image.className = 'mochi-sprite';
    const safeName = String(character || 'mochi').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'mochi';
    image.src = `characters/${safeName}/stand-neutral.png`;
    image.onerror = () => {
      image.onerror = null;
      image.src = 'characters/mochi/stand-neutral.png';
    };
    return image;
  };

  const createTypeLabel = (type) => {
    const span = document.createElement('span');
    span.className = 'mochi-type';
    span.textContent = type;
    return span;
  };

  const createRow = (entry) => {
    const row = document.createElement('div');
    row.className = 'tray-mochi-row';

    const icon = createIcon(entry.character);
    const meta = document.createElement('div');
    meta.className = 'mochi-meta';
    const label = document.createElement('div');
    label.className = 'mochi-label';
    label.textContent = entry.label || `#${entry.index + 1}`;
    const typeLabel = createTypeLabel(entry.source || 'Standard');
    meta.appendChild(label);
    meta.appendChild(typeLabel);

    const actions = document.createElement('div');
    actions.className = 'mochi-actions';
    const callBtn = document.createElement('button');
    callBtn.className = 'call';
    callBtn.type = 'button';
    callBtn.textContent = 'Call';
    callBtn.addEventListener('click', () => {
      window.mochiTrayApi.call({ mochiId: entry.id }).finally(() => window.close());
    });
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'dismiss';
    dismissBtn.type = 'button';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', () => {
      window.mochiTrayApi.dismiss({ mochiId: entry.id }).finally(() => window.close());
    });
    actions.appendChild(callBtn);
    actions.appendChild(dismissBtn);

    row.appendChild(icon);
    row.appendChild(meta);
    row.appendChild(actions);
    listEl.appendChild(row);
  };

  if (!hasEntries) {
    const emptyState = document.createElement('div');
    emptyState.textContent = 'No mochis configured yet.';
    emptyState.style.opacity = '0.7';
    listEl.appendChild(emptyState);
  } else {
    mochis.forEach(createRow);
  }

  callAllBtn.addEventListener('click', () => {
    window.mochiTrayApi.call({ all: true }).finally(() => window.close());
  });
  dismissAllBtn.addEventListener('click', () => {
    window.mochiTrayApi.dismiss({ all: true }).finally(() => window.close());
  });

  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('.tray-menu')) {
      window.close();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      window.close();
    }
  });
})();
