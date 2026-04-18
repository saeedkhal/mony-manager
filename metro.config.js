// Polyfill for Node 18 (Array.prototype.toReversed is ES2023 / Node 20+)
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return this.slice().reverse();
  };
}

const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const expoConstantsMain = path.join(__dirname, "node_modules", "expo-constants", "build", "Constants.js");

// Prefer hoisted package; extraNodeModules alone does not always win for imports from expo/src.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "expo-constants": path.resolve(__dirname, "node_modules/expo-constants"),
};

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "expo-constants" && fs.existsSync(expoConstantsMain)) {
    return { type: "sourceFile", filePath: expoConstantsMain };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
