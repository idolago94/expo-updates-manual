#!/usr/bin/env node
/**
 * Runs on `npm install` in the CONSUMING project:
 *  1. Verifies the installed expo / expo-updates versions support the
 *     runtime-override API this package relies on
 *     (Updates.setUpdateURLAndRequestHeadersOverride — SDK 52+ /
 *     expo-updates 0.27.0+). Fails the install loudly if not.
 *  2. Copies the manual-update GitHub Action workflow into
 *     .github/workflows/, if it isn't there yet.
 */
const fs = require('fs');
const path = require('path');

const MIN_EXPO_SDK_MAJOR = 52;
const MIN_EXPO_UPDATES_VERSION = [0, 27, 0];

// process.cwd() during npm install of a dependency is the consumer's
// project root (not node_modules/<this package>).
const projectRoot = process.cwd();

function readInstalledVersion(pkgName) {
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`, { paths: [projectRoot] });
    return require(pkgJsonPath).version;
  } catch {
    return null;
  }
}

function parseVersion(v) {
  return v.split('.').map((n) => parseInt(n, 10) || 0);
}

function isVersionAtLeast(installed, required) {
  const a = parseVersion(installed);
  for (let i = 0; i < required.length; i++) {
    if ((a[i] || 0) > required[i]) return true;
    if ((a[i] || 0) < required[i]) return false;
  }
  return true;
}

function checkVersions() {
  const expoVersion = readInstalledVersion('expo');
  const updatesVersion = readInstalledVersion('expo-updates');

  const problems = [];

  if (!expoVersion) {
    problems.push('Could not find an installed "expo" package — is this an Expo project?');
  } else {
    const major = parseVersion(expoVersion)[0];
    if (major < MIN_EXPO_SDK_MAJOR) {
      problems.push(
        `Installed Expo SDK is ${expoVersion}, but @lagoapps/expo-updates-manual requires SDK ${MIN_EXPO_SDK_MAJOR}+ ` +
          '(it relies on Updates.setUpdateURLAndRequestHeadersOverride, added in SDK 52).'
      );
    }
  }

  if (!updatesVersion) {
    problems.push('Could not find an installed "expo-updates" package.');
  } else if (!isVersionAtLeast(updatesVersion, MIN_EXPO_UPDATES_VERSION)) {
    problems.push(
      `Installed expo-updates is ${updatesVersion}, but ${MIN_EXPO_UPDATES_VERSION.join(
        '.'
      )}+ is required for the runtime update-URL-override API.`
    );
  }

  if (problems.length) {
    console.error('\n[expo-updates-manual] Incompatible environment:\n');
    problems.forEach((p) => console.error(`  - ${p}`));
    console.error(
      `\nUpgrade with: npx expo install expo@^${MIN_EXPO_SDK_MAJOR} expo-updates\n`
    );
    process.exit(1);
  }

  console.log(
    `[expo-updates-manual] Version check passed (expo ${expoVersion}, expo-updates ${updatesVersion}).`
  );
}

function installWorkflowTemplate() {
  const workflowsDir = path.join(projectRoot, '.github', 'workflows');
  const destPath = path.join(workflowsDir, 'manual-update.yml');
  const srcPath = path.join(__dirname, '..', 'templates', 'github-workflow', 'manual-update.yml');

  if (!fs.existsSync(srcPath)) return; // e.g. running inside this package's own repo

  if (fs.existsSync(destPath)) {
    console.log('[expo-updates-manual] .github/workflows/manual-update.yml already exists, skipping.');
    return;
  }

  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log('[expo-updates-manual] Added .github/workflows/manual-update.yml');
  console.log(
    '[expo-updates-manual] Remember to set repo secrets: EXPO_TOKEN, MANUAL_UPDATES_SERVER_URL, MANUAL_UPDATES_API_KEY'
  );
}

/**
 * Copies build-and-report.yml / submit-and-report.yml (and the script they
 * both run) into .eas/workflows/ — EAS Workflows, not GitHub Actions. These
 * run an EAS Build/Submit and report the resulting release link to the
 * manual-updates server. Skips any file that already exists, same policy as
 * the GitHub Action template above.
 */
function installEasWorkflowTemplates() {
  const srcDir = path.join(__dirname, '..', 'templates', 'eas-workflow');
  if (!fs.existsSync(srcDir)) return; // e.g. running inside this package's own repo

  const workflowsDir = path.join(projectRoot, '.eas', 'workflows');
  const scriptsDir = path.join(workflowsDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  const copyIfMissing = (srcPath, destPath) => {
    if (fs.existsSync(destPath)) {
      console.log(`[expo-updates-manual] ${path.relative(projectRoot, destPath)} already exists, skipping.`);
      return;
    }
    fs.copyFileSync(srcPath, destPath);
    console.log(`[expo-updates-manual] Added ${path.relative(projectRoot, destPath)}`);
  };

  copyIfMissing(path.join(srcDir, 'build-and-report.yml'), path.join(workflowsDir, 'build-and-report.yml'));
  copyIfMissing(path.join(srcDir, 'submit-and-report.yml'), path.join(workflowsDir, 'submit-and-report.yml'));
  copyIfMissing(
    path.join(srcDir, 'scripts', 'report-release.js'),
    path.join(scriptsDir, 'report-release.js')
  );
  console.log(
    '[expo-updates-manual] Remember to set MANUAL_UPDATES_SERVER_URL and MANUAL_UPDATES_API_KEY as EAS ' +
      'environment variables (`eas env:create`) under the "production" environment.'
  );
}

checkVersions(); // exits process on failure — nothing below runs if incompatible

try {
  installWorkflowTemplate();
} catch (err) {
  // Never fail the install over the workflow-copy step specifically.
  console.warn('[expo-updates-manual] Could not install GitHub Action template:', err.message);
}

try {
  installEasWorkflowTemplates();
} catch (err) {
  console.warn('[expo-updates-manual] Could not install EAS Workflow templates:', err.message);
}
