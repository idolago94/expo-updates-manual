import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ManualUpdateInfo = {
  branch: string;
  label: string;
  message?: string | null;
  createdAt?: string | null;
};

const STORAGE_PREFIX = '@lagoapps/expo-updates-manual/selected-branch/';

function getConfig(): { apiBaseUrl: string; projectId: string } {
  const cfg = Constants.expoConfig?.extra?.manualUpdates;
  if (!cfg?.apiBaseUrl || !cfg?.projectId) {
    throw new Error(
      '[expo-updates-manual] apiBaseUrl/projectId not set. Configure the plugin in app.json.'
    );
  }
  return cfg;
}

function storageKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`;
}

/** Fetches the list of selectable updates for this project from your central server. */
export async function listAvailableUpdates(): Promise<ManualUpdateInfo[]> {
  const { apiBaseUrl, projectId } = getConfig();
  const res = await fetch(`${apiBaseUrl}/api/updates?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) {
    throw new Error(`[expo-updates-manual] Failed to fetch updates list: ${res.status}`);
  }
  return res.json();
}

/**
 * Points the app at the chosen branch, downloads its latest compatible
 * update, reloads the app to run it, and persists the choice so it
 * survives app restarts (until resetSelection() is called).
 *
 * NOTE: setUpdateRequestHeadersOverride is a newer expo-updates API
 * (SDK 54 / expo-updates 0.29.0+). Verify against your installed version.
 */
export async function selectAndApplyUpdate(branch: string): Promise<void> {
  const { projectId } = getConfig();

  if (__DEV__) {
    console.warn('[expo-updates-manual] No-op in development mode.');
    return;
  }

  // Remember what was running before, so a failed attempt can revert
  // cleanly instead of leaving the runtime header pointed at a branch
  // that turned out not to exist / not to apply to this build.
  const previousBranch = await AsyncStorage.getItem(storageKey(projectId));

  await Updates.setUpdateRequestHeadersOverride({ 'expo-channel-name': branch });

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      throw new Error(
        `[expo-updates-manual] No update available on branch "${branch}". ` +
          'It may not exist for this app, or its runtime version may not match this build.'
      );
    }

    await Updates.fetchUpdateAsync();
    await AsyncStorage.setItem(storageKey(projectId), branch);
    await Updates.reloadAsync();
  } catch (err) {
    // Roll back the runtime override so the app isn't left mid-session
    // pointed at a branch that doesn't resolve to anything. The native
    // API only accepts string header values (or `null` for the whole
    // argument to clear all overrides) — a header value of `null` isn't
    // valid and throws.
    await Updates.setUpdateRequestHeadersOverride(
      previousBranch ? { 'expo-channel-name': previousBranch } : null
    );
    throw err;
  }
}

/**
 * Call once, early at app startup (e.g. top of App.tsx, before rendering
 * anything that depends on the update being current). Re-applies a
 * previously persisted branch selection so it survives a cold start,
 * and — if a newer update was published on that same branch since last
 * time — silently fetches and applies it too.
 *
 * Safe to call every launch: it's a no-op if nothing was ever selected.
 */
export async function initManualUpdates(): Promise<void> {
  if (__DEV__) return;

  const { projectId } = getConfig();
  const savedBranch = await AsyncStorage.getItem(storageKey(projectId));
  if (!savedBranch) return;

  await Updates.setUpdateRequestHeadersOverride({ 'expo-channel-name': savedBranch });

  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        await Updates.reloadAsync();
      }
    }
  } catch (e) {
    // Offline or server unreachable at launch — keep running the
    // currently embedded/cached update, try again next launch.
    console.warn('[expo-updates-manual] initManualUpdates check failed:', e);
  }
}

/** Clears the persisted selection and reverts to the build's default channel. */
export async function resetSelection(): Promise<void> {
  const { projectId } = getConfig();
  await AsyncStorage.removeItem(storageKey(projectId));
  // Passing null for the whole argument un-sets all header overrides.
  // A header *value* of null isn't valid and throws — the native side
  // requires a `[String: String]?` (a map of string to string, or no map
  // at all), not a map containing a null value.
  await Updates.setUpdateRequestHeadersOverride(null);
  await Updates.reloadAsync();
}

/** Info about the update currently running, for display in your UI. */
export function getCurrentUpdateInfo() {
  return {
    updateId: Updates.updateId,
    channel: Updates.channel,
    createdAt: Updates.createdAt,
  };
}

export async function getPersistedBranch(): Promise<string | null> {
  const { projectId } = getConfig();
  return AsyncStorage.getItem(storageKey(projectId));
}
