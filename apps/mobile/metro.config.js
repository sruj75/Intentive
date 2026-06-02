// Metro config — monorepo/pnpm aware (CommonJS).
// Watches the workspace root and resolves from both the app's and the root's
// node_modules so pnpm's symlinked deps bundle correctly.
const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const originDir = path.dirname(context.originModulePath);
    const withoutJs = moduleName.slice(0, -".js".length);

    for (const extension of [".ts", ".tsx"]) {
      const candidateModuleName = `${withoutJs}${extension}`;
      const candidatePath = path.resolve(originDir, candidateModuleName);
      if (fs.existsSync(candidatePath)) {
        return context.resolveRequest(context, candidateModuleName, platform);
      }
    }
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
