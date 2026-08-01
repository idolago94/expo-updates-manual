const { createRunOncePlugin } = require('@expo/config-plugins');

const pkg = require('../package.json');

/**
 * Usage in app.json / app.config.js:
 *
 * "plugins": [
 *   ["@lagoapps/expo-updates-manual", {
 *     "apiBaseUrl": "https://manual-updates-server.vercel.app",
 *     "projectId": "family-app"
 *   }]
 * ]
 *
 * - apiBaseUrl: the central manual-updates server (one server, shared across all your projects)
 * - projectId: identifies THIS project on that server, so the picker only shows its updates
 *
 * This plugin:
 * 1. Sets `updates.checkAutomatically` to "NEVER" — expo-updates never silently
 *    checks/applies updates on its own; this package controls that explicitly.
 * 2. Stores apiBaseUrl + projectId under `extra.manualUpdates` so client code
 *    can read them at runtime via Constants.expoConfig.extra.
 */
function withManualUpdates(config, options = {}) {
  const { apiBaseUrl, projectId } = options;

  if (!apiBaseUrl) {
    throw new Error(
      '[expo-updates-manual] Missing required plugin option "apiBaseUrl".'
    );
  }
  if (!projectId) {
    throw new Error(
      '[expo-updates-manual] Missing required plugin option "projectId".'
    );
  }

  config.updates = {
    ...config.updates,
    checkAutomatically: 'NEVER',
  };

  config.extra = {
    ...config.extra,
    manualUpdates: {
      apiBaseUrl,
      projectId,
    },
  };

  return config;
}

module.exports = createRunOncePlugin(withManualUpdates, pkg.name, pkg.version);
