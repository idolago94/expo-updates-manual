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
  getPersistedBranch,
  ManualUpdateInfo,
} from './index';

export function UpdatePickerScreen() {
  const [updates, setUpdates] = useState<ManualUpdateInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listAvailableUpdates(), getPersistedBranch()])
      .then(([list, branch]) => {
        setUpdates(list);
        setCurrentBranch(branch);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(branch: string) {
    try {
      setApplying(branch);
      setError(null);
      await selectAndApplyUpdate(branch);
      // App reloads on success; code below rarely runs.
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
      <FlatList
        data={updates}
        keyExtractor={(item) => item.branch}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            disabled={!!applying}
            onPress={() => handleSelect(item.branch)}
          >
            <Text style={styles.label}>
              {item.label}
              {item.branch === currentBranch ? '  ✓' : ''}
            </Text>
            {item.message ? <Text style={styles.message}>{item.message}</Text> : null}
            {applying === item.branch ? <ActivityIndicator /> : null}
          </TouchableOpacity>
        )}
      />
      {currentBranch ? (
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
  resetRow: { paddingVertical: 16, alignItems: 'center' },
  resetLabel: { color: '#c00', fontSize: 14 },
});
