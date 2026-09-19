import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packagesDir = fileURLToPath(new URL("./packages", import.meta.url));

const packageNames = ["core", "dom", "form-data", "js2form", "jquery", "react"];

// Cross-package test imports (used by semantics-spy and contract tests)
// resolve to TypeScript sources instead of built output. Vite then compiles
// the ESM bindings into spyable module records; published builds and the
// package "exports" maps are unaffected.
const packageAliases = packageNames.map((packageName) => ({
  find: new RegExp(`^@form2js/${packageName}$`),
  replacement: `${packagesDir}/${packageName}/src/index.ts`
}));

export default defineConfig({
  resolve: {
    alias: packageAliases
  }
});
