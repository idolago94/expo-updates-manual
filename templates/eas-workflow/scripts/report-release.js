#!/usr/bin/env node
/**
 * Run by .eas/workflows/build-and-report.yml and submit-and-report.yml
 * right after their `type: build` / `type: submit` job finishes. Builds the
 * expo.dev build details link for that job and POSTs it, together with a
 * few build details, to the manual-updates server so the admin screen can
 * show a "last release" link per project+environment.
 *
 * Reads everything it needs from env vars set by the calling workflow step
 * (see the two workflow YAML files) plus app.json in the current checkout.
 *
 * Required env vars:
 *   MANUAL_UPDATES_SERVER_URL, MANUAL_UPDATES_API_KEY
 *   TYPE ("build" or "submit"), ENVIRONMENT, BUILD_ID
 * Optional env vars:
 *   PLATFORM, PROFILE, APP_VERSION, APP_BUILD_VERSION
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

function fail(message) {
  console.error(`[report-release] ${message}`);
  process.exit(1);
}

function readAppConfig() {
  // app.json is the common case; app.config.json is also plain JSON. A JS/TS
  // dynamic config (app.config.js/ts) isn't handled here — same limitation
  // as the existing manual-update.yml GitHub Action, which also assumes
  // app.json exists.
  const path = fs.existsSync('./app.json') ? './app.json' : './app.config.json';
  if (!fs.existsSync(path)) {
    fail('Could not find app.json or app.config.json in the current directory.');
  }
  return JSON.parse(fs.readFileSync(path, 'utf8')).expo || {};
}

function resolveAccountName(expoConfig) {
  if (expoConfig.owner) return expoConfig.owner;
  try {
    const out = execFileSync('eas', ['whoami', '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    if (parsed.username) return parsed.username;
  } catch (err) {
    console.warn('[report-release] `eas whoami --json` failed:', err.message);
  }
  fail(
    'Could not resolve the EAS account name — set "expo.owner" in app.json, or make sure `eas whoami` works.'
  );
}

function main() {
  const {
    MANUAL_UPDATES_SERVER_URL: serverUrl,
    MANUAL_UPDATES_API_KEY: apiKey,
    TYPE: type,
    ENVIRONMENT: environment,
    BUILD_ID: buildId,
    PLATFORM: platform,
    PROFILE: profile,
    APP_VERSION: appVersion,
    APP_BUILD_VERSION: appBuildVersion,
  } = process.env;

  if (!serverUrl) fail('MANUAL_UPDATES_SERVER_URL is not set.');
  if (!apiKey) fail('MANUAL_UPDATES_API_KEY is not set.');
  if (type !== 'build' && type !== 'submit') fail(`TYPE must be "build" or "submit", got "${type}".`);
  if (!environment) fail('ENVIRONMENT is not set.');
  if (!buildId) fail('BUILD_ID is not set — the build/get-build job did not produce one.');

  const expoConfig = readAppConfig();
  const projectId = expoConfig.extra && expoConfig.extra.manualUpdates && expoConfig.extra.manualUpdates.projectId;
  if (!projectId) {
    fail(
      'app.json is missing expo.extra.manualUpdates.projectId — configure the expo-updates-manual plugin first.'
    );
  }
  if (!expoConfig.slug) fail('app.json is missing expo.slug.');

  const accountName = resolveAccountName(expoConfig);
  // Same URL shape eas-cli itself uses for a build's dashboard page. A
  // submission's own details page is linked from this same build page, so
  // it doubles as the link for `type: submit` reports too.
  const link = `https://expo.dev/accounts/${encodeURIComponent(accountName)}/projects/${encodeURIComponent(
    expoConfig.slug
  )}/builds/${encodeURIComponent(buildId)}`;

  const body = JSON.stringify({
    environment,
    link,
    type,
    platform: platform || null,
    profile: profile || null,
    buildId,
    appVersion: appVersion || null,
    buildVersion: appBuildVersion || null,
    createdAt: new Date().toISOString(),
  });

  fetch(`${serverUrl}/api/projects/${encodeURIComponent(projectId)}/releases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body,
  }).then(async (res) => {
    if (!res.ok) {
      console.error(await res.text());
      process.exit(1);
    }
    console.log(`[report-release] Reported ${type} release for ${environment}: ${link}`);
  }).catch((err) => {
    fail(`Request to manual-updates server failed: ${err.message}`);
  });
}

main();
