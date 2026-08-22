import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import {
  listAvailableUpdates,
  selectAndApplyUpdate,
  resetSelection,
  getPersistedUpdateGroupId,
  restartApp,
  ManualUpdateInfo,
} from './index';

/** Colors UpdatePickerScreen renders with — pass a `theme` prop to match your app. */
export type UpdatePickerTheme = {
  backgroundColor?: string;
  textColor?: string;
  secondaryTextColor?: string;
  borderColor?: string;
  accentColor?: string;
  errorColor?: string;
  dangerColor?: string;
  overlayColor?: string;
  modalBackgroundColor?: string;
  buttonTextColor?: string;
};

const defaultTheme: Required<UpdatePickerTheme> = {
  backgroundColor: '#fff',
  textColor: '#000',
  secondaryTextColor: '#666',
  borderColor: '#ccc',
  accentColor: '#0a7',
  errorColor: 'red',
  dangerColor: '#c00',
  overlayColor: 'rgba(0, 0, 0, 0.5)',
  modalBackgroundColor: '#fff',
  buttonTextColor: '#fff',
};

/** Copy UpdatePickerScreen renders with — pass a `texts` prop to override any of it. */
export type UpdatePickerTexts = {
  emptyState?: string;
  resetLabel?: string;
  restartModalTitle?: string;
  restartModalMessage?: string;
  confirmButtonLabel?: string;
  manualRestartMessage?: string;
};

const defaultTexts: Required<UpdatePickerTexts> = {
  emptyState: 'No updates available',
  resetLabel: 'Reset to default version',
  restartModalTitle: 'The app will restart',
  restartModalMessage: 'Restart the app to apply your selection',
  confirmButtonLabel: 'Confirm',
  manualRestartMessage:
    'Your selection is saved. Please close the app completely and reopen it to apply it.',
};

export type UpdatePickerScreenProps = {
  theme?: UpdatePickerTheme;
  texts?: UpdatePickerTexts;
};

export function UpdatePickerScreen({ theme, texts }: UpdatePickerScreenProps = {}) {
  const t = { ...defaultTheme, ...theme };
  const s = { ...defaultTexts, ...texts };

  const [updates, setUpdates] = useState<ManualUpdateInfo[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Selecting/resetting only takes effect on the next full app launch, so
  // we ask the user to confirm a restart via a modal once it's set.
  const [pendingRestart, setPendingRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    Promise.all([listAvailableUpdates(), getPersistedUpdateGroupId()])
      .then(([list, groupId]) => {
        setUpdates(list);
        setCurrentGroupId(groupId);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(update: ManualUpdateInfo) {
    try {
      setApplying(update.easUpdateGroupId);
      setError(null);
      await selectAndApplyUpdate(update);
      setCurrentGroupId(update.easUpdateGroupId);
      setPendingRestart(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(null);
    }
  }

  async function handleReset() {
    try {
      setApplying('__reset__');
      setError(null);
      await resetSelection();
      setCurrentGroupId(null);
      setPendingRestart(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(null);
    }
  }

  async function handleConfirmRestart() {
    try {
      setRestarting(true);
      await restartApp();
    } catch (e: any) {
      // Updates.reloadAsync() legitimately fails right here: selecting/resetting
      // only sets an override + persists it (see selectAndApplyUpdate()/resetSelection()
      // docs) - nothing new has been fetched in *this* running session yet, so
      // expo-updates has nothing launchable to hand back and rejects with a native
      // "appContext"/"AppController" error that's misleading about the real cause.
      // The selection is already saved regardless; only a full close+reopen actually
      // applies it, so tell the user that instead of surfacing the raw native error.
      setError(s.manualRestartMessage);
    } finally {
      // In production restartApp() tears down this JS context via
      // Updates.reloadAsync(), so this never actually runs there. In
      // development it's a no-op (see restartApp()'s __DEV__ guard) and this
      // component keeps running — without resetting here the modal would be
      // stuck showing its spinner forever.
      setRestarting(false);
      setPendingRestart(false);
    }
  }

  if (loading) {
    return <ActivityIndicator style={styles.center} color={t.accentColor} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: t.backgroundColor }]}>
      {error ? <Text style={[styles.error, { color: t.errorColor }]}>{error}</Text> : null}
      <FlatList
        data={updates}
        keyExtractor={(item) => item.easUpdateGroupId}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { borderColor: t.borderColor }]}
            disabled={!!applying}
            onPress={() => handleSelect(item)}
          >
            <Text style={[styles.label, { color: t.textColor }]}>
              {item.label}
              {item.isDefault ? '  (Default)' : ''}
              {item.easUpdateGroupId === currentGroupId ? '  ✓' : ''}
            </Text>
            {item.message ? (
              <Text style={[styles.message, { color: t.secondaryTextColor }]}>
                {item.message}
              </Text>
            ) : null}
            {applying === item.easUpdateGroupId ? (
              <ActivityIndicator color={t.accentColor} />
            ) : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: t.secondaryTextColor }]}>
              {s.emptyState}
            </Text>
          </View>
        }
      />
      {currentGroupId ? (
        <TouchableOpacity style={styles.resetRow} disabled={!!applying} onPress={handleReset}>
          <Text style={[styles.resetLabel, { color: t.dangerColor }]}>{s.resetLabel}</Text>
          {applying === '__reset__' ? <ActivityIndicator color={t.accentColor} /> : null}
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={pendingRestart}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRestart(false)}
      >
        <View style={[styles.overlay, { backgroundColor: t.overlayColor }]}>
          <View style={[styles.modalCard, { backgroundColor: t.modalBackgroundColor }]}>
            <Text style={[styles.modalTitle, { color: t.textColor }]}>
              {s.restartModalTitle}
            </Text>
            <Text style={[styles.modalMessage, { color: t.secondaryTextColor }]}>
              {s.restartModalMessage}
            </Text>
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: t.accentColor }]}
              disabled={restarting}
              onPress={handleConfirmRestart}
            >
              {restarting ? (
                <ActivityIndicator color={t.buttonTextColor} />
              ) : (
                <Text style={[styles.confirmButtonLabel, { color: t.buttonTextColor }]}>
                  {s.confirmButtonLabel}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center' },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 16, fontWeight: '600' },
  message: { fontSize: 13, marginTop: 2 },
  error: { marginBottom: 8 },
  resetRow: { paddingVertical: 16, alignItems: 'center' },
  resetLabel: { fontSize: 14 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  modalMessage: { fontSize: 14, marginBottom: 16, textAlign: 'center' },
  confirmButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmButtonLabel: { fontSize: 15, fontWeight: '600' },
});
