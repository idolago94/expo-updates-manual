import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ManualUpdateInfo = {
  /**
   * The EAS environment this update was published for (e.g. "preview",
   * "production") — the part before the `/` in the publish tag
   * (`<environment>/<label>`). Also the EAS branch it was published to.
   */
  environment: string;
  /** The part after the `/` in the publish tag, e.g. "1-3-0". */
  label: string;
  /** The EAS update group ID for this specific publish (`group`/`id` from `eas update --json`). */
  easUpdateGroupId: string;
  message?: string | null;
  createdAt?: string | null;
};

const STORAGE_PREFIX = '@lagoapps/expo-updates-manual/selected-update/';
const HOME_CHANNEL_STORAGE_PREFIX = '@lagoapps/expo-updates-manual/home-channel/';

function getConfig(): { apiBaseUrl: string; projectId: string } {
  const cfg = Constants.expoConfig?.extra?.manualUpdates;
  if (!cfg?.apiBaseUrl || !cfg?.projectId) {
    throw new Error(
      '[expo-updates-manual] apiBaseUrl/projectId not set. Configure the plugin in app.json.'
    );
  }
  return cfg;
}

/**
 * The real EAS project ID (the UUID EAS generates, under `extra.eas.projectId`
 * — set automatically by `eas init` / `eas update:configure`). This is a
 * different value from this package's own `projectId` plugin option, which
 * is just a display-filtering key against your manual-updates server.
 */
function getEasProjectId(): string {
  const id = Constants.expoConfig?.extra?.eas?.projectId;
  if (!id) {
    throw new Error(
      '[expo-updates-manual] extra.eas.projectId not found. Run `eas init` / `eas update:configure`.'
    );
  }
  return id;
}

function storageKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`;
}

function updateUrlFor(easUpdateGroupId: string): string {
  return `https://u.expo.dev/${getEasProjectId()}/group/${easUpdateGroupId}`;
}

/**
 * The build's "home" environment/channel, e.g. "preview" or "production" —
 * set at build time via eas.json and never overridden by this package.
 *
 * Updates.channel reflects the CURRENTLY RUNNING update, not the build.
 * Once a manually-selected update is running (fetched directly by group ID,
 * bypassing channel resolution entirely), its manifest has no channel
 * association, so Updates.channel reads back empty. To keep filtering
 * working even then, this caches the last non-empty value it ever saw
 * (which only ever happens before a selection is applied, or right after
 * resetSelection() takes effect) and falls back to that.
 */
async function getHomeEnvironment(projectId: string): Promise<string> {
  const key = `${HOME_CHANNEL_STORAGE_PREFIX}${projectId}`;
  const live = Updates.channel;
  if (live) {
    await AsyncStorage.setItem(key, live);
    return live;
  }
  const cached = await AsyncStorage.getItem(key);
  if (cached) return cached;
  throw new Error(
    '[expo-updates-manual] Could not determine this build\'s environment — Updates.channel is empty ' +
      'and no cached value exists yet. Call resetSelection() and relaunch to recover it.'
  );
}

/**
 * Fetches the list of selectable updates for this project from your central
 * server, filtered to this build's home environment (see getHomeEnvironment())
 * — e.g. "preview" or "production". A production build only ever sees, and
 * can only ever select, updates published under the "production"
 * environment — it cannot be pointed at a preview update's config by mistake.
 */
export async function listAvailableUpdates(): Promise<ManualUpdateInfo[]> {
  const { apiBaseUrl, projectId } = getConfig();
  const environment = await getHomeEnvironment(projectId);
  const res = await fetch(
    `${apiBaseUrl}/api/updates?projectId=${encodeURIComponent(projectId)}&environment=${encodeURIComponent(environment)}`
  );
  if (!res.ok) {
    throw new Error(`[expo-updates-manual] Failed to fetch updates list: ${res.status}`);
  }
  return res.json();
}

/**
 * Points the app at one specific, already-published update (by its EAS
 * update group ID) and persists the choice so it's picked up automatically
 * on the next app launch (until resetSelection() is called).
 *
 * This targets that exact update directly via
 * Updates.setUpdateURLAndRequestHeadersOverride — it never touches the
 * app's build-time channel, so a bad or missing channel can no longer
 * break selection the way it used to.
 *
 * IMPORTANT: per Expo's docs this override only takes effect on the next
 * full app launch — a plain Updates.reloadAsync() will NOT pick it up.
 * This function therefore only sets the override and persists the choice;
 * it does not download or apply anything itself (initManualUpdates() does
 * that on the next cold start). Your UI must tell the user to fully close
 * and reopen the app after calling this — do not expect an immediate
 * in-app reload.
 *
 * Requires `updates.disableAntiBrickingMeasures: true` in app config (set
 * automatically by this package's config plugin) plus a native rebuild —
 * this is a preview-only capability that must never ship in a production
 * build, since it disables expo-updates' safe-rollback protections.
 */
export async function selectAndApplyUpdate(update: ManualUpdateInfo): Promise<void> {
  const { projectId } = getConfig();

  if (__DEV__) {
    console.warn('[expo-updates-manual] No-op in development mode.');
    return;
  }

  Updates.setUpdateURLAndRequestHeadersOverride({
    updateUrl: updateUrlFor(update.easUpdateGroupId),
    requestHeaders: {},
  });
  await AsyncStorage.setItem(storageKey(projectId), update.easUpdateGroupId);
}

/**
 * Call once, early at app startup (e.g. top of App.tsx, before rendering
 * anything that depends on the update being current). Re-applies a
 * previously persisted update-group selection, then downloads and applies
 * it if it isn't already running.
 *
 * This is the point where a selection made via selectAndApplyUpdate() in
 * the previous session actually gets fetched and applied — the override
 * it sets only takes effect starting with this next cold start.
 *
 * Safe to call every launch: it's a no-op if nothing was ever selected,
 * and a no-op once the selected update is already running (a group-ID
 * URL always resolves to that same fixed manifest, so
 * checkForUpdateAsync() reporting nothing new IS the normal steady
 * state here, not a failure). If the selected update genuinely no
 * longer resolves (deleted upstream, runtime version mismatch, offline
 * — these reject/throw rather than just report unavailable), it logs a
 * warning, clears the selection, and leaves the app running whatever is
 * currently installed — it never retries a dead selection indefinitely.
 */
export async function initManualUpdates(): Promise<void> {
  if (__DEV__) return;

  const { projectId } = getConfig();
  const savedGroupId = await AsyncStorage.getItem(storageKey(projectId));
  if (!savedGroupId) return;

  Updates.setUpdateURLAndRequestHeadersOverride({
    updateUrl: updateUrlFor(savedGroupId),
    requestHeaders: {},
  });

  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      const fetchResult = await Updates.fetchUpdateAsync();
      if (fetchResult.isNew) {
        await Updates.reloadAsync();
      }
    }
  } catch (e) {
    // A genuine failure (network error, deleted update, runtime mismatch)
    // — fall back to the build's default update source rather than
    // getting stuck on a dead override every future launch.
    console.warn('[expo-updates-manual] initManualUpdates check failed, reverting to default:', e);
    await AsyncStorage.removeItem(storageKey(projectId));
    Updates.setUpdateURLAndRequestHeadersOverride(null);
  }
}

/**
 * Clears the persisted selection and reverts to the build's default
 * update URL/channel. Like selectAndApplyUpdate(), this only takes effect
 * on the next full app launch — tell the user to close and reopen the app.
 */
export async function resetSelection(): Promise<void> {
  const { projectId } = getConfig();
  await AsyncStorage.removeItem(storageKey(projectId));
  Updates.setUpdateURLAndRequestHeadersOverride(null);
}

/** Info about the update currently running, for display in your UI. */
export function getCurrentUpdateInfo() {
  return {
    updateId: Updates.updateId,
    channel: Updates.channel,
    createdAt: Updates.createdAt,
  };
}

/** The EAS update group ID of the currently persisted selection, if any. */
export async function getPersistedUpdateGroupId(): Promise<string | null> {
  const { projectId } = getConfig();
  return AsyncStorage.getItem(storageKey(projectId));
}
