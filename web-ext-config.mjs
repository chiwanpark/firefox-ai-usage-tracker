export default {
  ignoreFiles: [
    "node_modules",
    "web-ext-artifacts",
    "web-ext-config.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "README.md",
  ],
  build: {
    overwriteDest: true,
  },
};
