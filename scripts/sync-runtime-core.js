const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const CORE_DIR = path.join(ROOT_DIR, 'runtime-core');

const CORE_PERSONALITIES_DIR = path.join(CORE_DIR, 'personalities');
const CORE_CHARACTERS_DIR = path.join(CORE_DIR, 'characters');
const CORE_ASSETS_DIR = path.join(CORE_DIR, 'assets');
const CORE_SHARED_JS = path.join(CORE_DIR, 'mochi-shared.js');

const SHARED_JS_TARGETS = [
  path.join(ROOT_DIR, 'chrome-extension', 'mochi-shared.js'),
  path.join(ROOT_DIR, 'firefox-extension', 'mochi-shared.js'),
  path.join(ROOT_DIR, 'desktop', 'renderer', 'mochi-shared.js')
];

const PERSONALITY_TARGET_DIRS = [
  path.join(ROOT_DIR, 'chrome-extension', 'personalities'),
  path.join(ROOT_DIR, 'firefox-extension', 'personalities'),
  path.join(ROOT_DIR, 'desktop', 'renderer', 'personalities')
];

const CHARACTER_TARGET_DIRS = [
  path.join(ROOT_DIR, 'chrome-extension', 'characters'),
  path.join(ROOT_DIR, 'firefox-extension', 'characters'),
  path.join(ROOT_DIR, 'desktop', 'renderer', 'characters')
];

const ASSET_TARGET_DIRS = [
  path.join(ROOT_DIR, 'chrome-extension', 'assets'),
  path.join(ROOT_DIR, 'firefox-extension', 'assets'),
  path.join(ROOT_DIR, 'desktop', 'renderer', 'assets')
];

function ensureDirectoryExists(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Missing ${label} directory: ${dir}`);
  }
}

function parseFrontMatter(text) {
  if (!text || !text.startsWith('---')) return { label: '' };
  const match = text.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!match) return { label: '' };
  const frontMatter = match[1].trim();
  const data = { label: '' };
  frontMatter.split(/\r?\n/).forEach((line) => {
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) return;
    const value = rest.join(':').trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    if (key.trim().toLowerCase() === 'label') {
      data.label = value;
    }
  });
  return data;
}

function collectPersonalityFiles(sourceDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const key = path.basename(entry.name, '.md');
      const file = entry.name;
      const fullPath = path.join(sourceDir, entry.name);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { label } = parseFrontMatter(content);
      return {
        key,
        file,
        label: label || key,
        content
      };
    });
  if (!entries.length) {
    throw new Error('No markdown personalities found in ' + sourceDir);
  }
  return entries;
}

function writeIndex(dir, entries) {
  const indexPath = path.join(dir, 'index.json');
  const payload = entries.map(({ key, file, label }) => ({ key, file, label }));
  fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function removeDirectoryWithRetries(targetDir) {
  if (!fs.existsSync(targetDir)) return;
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== 'ENOTEMPTY' && error?.code !== 'EBUSY') {
        throw error;
      }
    }
  }
  if (lastError) {
    throw lastError;
  }
}

function replaceDirectory(sourceDir, targetDir) {
  removeDirectoryWithRetries(targetDir);
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function syncDirectories(sourceDir, targets) {
  targets.forEach((targetDir) => replaceDirectory(sourceDir, targetDir));
}

function syncSharedJs() {
  if (!fs.existsSync(CORE_SHARED_JS)) {
    throw new Error(`Missing shared JS: ${CORE_SHARED_JS}`);
  }
  const src = fs.readFileSync(CORE_SHARED_JS);
  SHARED_JS_TARGETS.forEach((dest) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, src);
  });
}

function syncRuntimeCore() {
  ensureDirectoryExists(CORE_DIR, 'runtime core');
  ensureDirectoryExists(CORE_PERSONALITIES_DIR, 'core personalities');
  ensureDirectoryExists(CORE_CHARACTERS_DIR, 'core characters');
  ensureDirectoryExists(CORE_ASSETS_DIR, 'core assets');

  const personalities = collectPersonalityFiles(CORE_PERSONALITIES_DIR);
  writeIndex(CORE_PERSONALITIES_DIR, personalities);

  syncSharedJs();
  syncDirectories(CORE_CHARACTERS_DIR, CHARACTER_TARGET_DIRS);
  syncDirectories(CORE_ASSETS_DIR, ASSET_TARGET_DIRS);
  syncDirectories(CORE_PERSONALITIES_DIR, PERSONALITY_TARGET_DIRS);
  PERSONALITY_TARGET_DIRS.forEach((dir) => writeIndex(dir, personalities));

  return {
    personalityCount: personalities.length,
    characterTargets: CHARACTER_TARGET_DIRS.length,
    assetTargets: ASSET_TARGET_DIRS.length,
    personalityTargets: PERSONALITY_TARGET_DIRS.length,
    sharedJsTargets: SHARED_JS_TARGETS.length
  };
}

function main() {
  const result = syncRuntimeCore();
  console.log(
    `Synced runtime core: ${result.personalityCount} personalities -> ` +
    `${result.personalityTargets} personality targets, ` +
    `${result.characterTargets} character targets, ${result.assetTargets} asset targets, ` +
    `mochi-shared.js -> ${result.sharedJsTargets} targets`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  syncRuntimeCore
};
