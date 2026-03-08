const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// On web, resolve utils/db to db.web.js so we never load expo-sqlite (avoids WASM worker error)
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && /utils[/\\]db$/.test(moduleName)) {
    const webModule = moduleName.replace(/db$/, "db.web");
    return context.resolveRequest(context, webModule, platform);
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
