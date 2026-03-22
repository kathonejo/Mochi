const fs = require("fs");
const path = require("path");

const NEXTJS_DIR = path.resolve(__dirname, "..");
const REPO_RUNTIME_CORE_DIR = path.resolve(NEXTJS_DIR, "..", "..", "runtime-core");
const VENDORED_RUNTIME_CORE_DIR = path.join(NEXTJS_DIR, "runtime-core");

function ensureDirectoryExists(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Missing ${label}: ${dir}`);
  }
}

function copyRuntimeCore() {
  if (fs.existsSync(VENDORED_RUNTIME_CORE_DIR) && fs.statSync(VENDORED_RUNTIME_CORE_DIR).isDirectory()) {
    console.log(`Runtime-core already vendored at ${VENDORED_RUNTIME_CORE_DIR}`);
    return;
  }
  ensureDirectoryExists(REPO_RUNTIME_CORE_DIR, "runtime-core source directory");
  fs.rmSync(VENDORED_RUNTIME_CORE_DIR, { recursive: true, force: true });
  fs.cpSync(REPO_RUNTIME_CORE_DIR, VENDORED_RUNTIME_CORE_DIR, { recursive: true });
  console.log(`Vendored runtime-core into ${VENDORED_RUNTIME_CORE_DIR}`);
}

copyRuntimeCore();
