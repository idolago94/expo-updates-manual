import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {
  listAvailableUpdates,
  selectAndApplyUpdate,
  resetSelection,
  getPersistedUpdateGroupId,
  ManualUpdateInfo,
} from './index';

export function UpdatePickerScreen() {
  const [updates, setUpdates] = useState<ManualUpdateInfo[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Selecting/resetting only takes effect on the next full app launch —
  // there's no automatic in-app reload to wait for, so we tell the user
  // to close and reopen the app themselves once it's set.
  const [pendingRestart, setPendingRestart] = useState(false);

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

  if (loading) {
    return <ActivityIndicator style={styles.center} />;
  }

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {pendingRestart ? (
        <Text style={styles.restartNotice}>סגור ופתח מחדש את האפליקציה כדי להחיל את הבחירה</Text>
      ) : null}
      <FlatList
        data={updates}
        keyExtractor={(item) => item.easUpdateGroupId}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            disabled={!!applying}
            onPress={() => handleSelect(item)}
          >
            <Text style={styles.label}>
              {item.label}
              {item.isDefault ? '  (Default)' : ''}
              {item.easUpdateGroupId === currentGroupId ? '  ✓' : ''}
            </Text>
            {item.message ? <Text style={styles.message}>{item.message}</Text> : null}
            {applying === item.easUpdateGroupId ? <ActivityIndicator /> : null}
          </TouchableOpacity>
        )}
      />
      {currentGroupId ? (
        <TouchableOpacity style={styles.resetRow} disabled={!!applying} onPress={handleReset}>
          <Text style={styles.resetLabel}>איפוס לגרסת ברירת המחדל</Text>
          {applying === '__reset__' ? <ActivityIndicator /> : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center' },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  label: { fontSize: 16, fontWeight: '600' },
  message: { fontSize: 13, color: '#666', marginTop: 2 },
  error: { color: 'red', marginBottom: 8 },
  restartNotice: { color: '#0a7', marginBottom: 8, fontWeight: '600' },
  resetRow: { paddingVertical: 16, alignItems: 'center' },
  resetLabel: { color: '#c00', fontSize: 14 },
});
