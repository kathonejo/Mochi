// config.js for Mochi Extension
// Add any specific configuration logic here later if needed.
console.log("Config page loaded.");

const UI_TEXT_SCALE_KEY = 'uiTextScale';
const UI_TEXT_SCALE_OPTIONS = [0.85, 1, 1.15, 1.3, 1.45];

function normalizeUiTextScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  let nearest = UI_TEXT_SCALE_OPTIONS[0];
  let minDelta = Math.abs(numeric - nearest);
  for (const option of UI_TEXT_SCALE_OPTIONS) {
    const delta = Math.abs(numeric - option);
    if (delta < minDelta) {
      nearest = option;
      minDelta = delta;
    }
  }
  return nearest;
}

function applyUiTextScale(scale) {
  const next = normalizeUiTextScale(scale);
  document.documentElement.style.zoom = String(next);
  document.documentElement.style.transformOrigin = 'top left';
  return next;
}

function populateUiTextScaleSelect(selectEl, scale) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  UI_TEXT_SCALE_OPTIONS.forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = `${Math.round(value * 100)}%`;
    if (value === scale) option.selected = true;
    selectEl.appendChild(option);
  });
}

function getUiTextScaleShortcutAction(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') return 'increase';
  if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') return 'decrease';
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') return 'reset';
  return null;
}

function stepUiTextScale(current, direction) {
  const normalized = normalizeUiTextScale(current);
  const index = Math.max(0, UI_TEXT_SCALE_OPTIONS.indexOf(normalized));
  if (direction === 'reset') return 1;
  if (direction === 'increase') return UI_TEXT_SCALE_OPTIONS[Math.min(UI_TEXT_SCALE_OPTIONS.length - 1, index + 1)];
  if (direction === 'decrease') return UI_TEXT_SCALE_OPTIONS[Math.max(0, index - 1)];
  return normalized;
}

document.addEventListener('DOMContentLoaded', () => {
  let uiTextScale = 1;
  const goToDappButton = document.getElementById('go-to-dapp');
  const uiTextScaleSelect = document.getElementById('ui-text-scale-select');

  const setUiTextScale = (value, persist = true) => {
    uiTextScale = applyUiTextScale(value);
    populateUiTextScaleSelect(uiTextScaleSelect, uiTextScale);
    if (persist) {
      chrome.storage.local.set({ [UI_TEXT_SCALE_KEY]: uiTextScale });
    }
  };

  if (uiTextScaleSelect) {
    uiTextScaleSelect.addEventListener('change', () => {
      setUiTextScale(uiTextScaleSelect.value || 1, true);
    });
  }

  document.addEventListener('keydown', (event) => {
    const action = getUiTextScaleShortcutAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    setUiTextScale(stepUiTextScale(uiTextScale, action), true);
  }, true);

  chrome.storage.local.get([UI_TEXT_SCALE_KEY], (data) => {
    setUiTextScale(data?.[UI_TEXT_SCALE_KEY] ?? 1, false);
  });

  if (goToDappButton) {
    goToDappButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://mochi.vercel.app/my-profile' });
    });
  }
});
