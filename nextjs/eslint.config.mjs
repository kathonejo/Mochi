import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const pnpmDir = path.join(configDir, "node_modules", ".pnpm");

function resolvePnpmEntry(prefix, relativeEntry) {
  const match = fs
    .readdirSync(pnpmDir)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .reverse()[0];

  if (!match) {
    throw new Error(`Unable to resolve ${prefix} from ${pnpmDir}`);
  }

  return pathToFileURL(path.join(pnpmDir, match, "node_modules", relativeEntry)).href;
}

const { default: nextVitals } = await import(
  resolvePnpmEntry("eslint-config-next@16.1.6_", "eslint-config-next/dist/core-web-vitals.js")
);
const { default: nextTs } = await import(
  resolvePnpmEntry("eslint-config-next@16.1.6_", "eslint-config-next/dist/typescript.js")
);

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
