/**
 * npm sometimes leaves a broken nested copy at expo/node_modules/expo-constants
 * (package.json without build/). Metro then resolves there and fails. Remove it so
 * the hoisted root node_modules/expo-constants is used.
 */
const fs = require("fs");
const path = require("path");

const nested = path.join(__dirname, "..", "node_modules", "expo", "node_modules", "expo-constants");
try {
  fs.rmSync(nested, { recursive: true, force: true });
} catch {
  /* ignore */
}
