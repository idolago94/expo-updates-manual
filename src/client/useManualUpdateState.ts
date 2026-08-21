import { useEffect, useState } from 'react';
import { getManualUpdateState, subscribeToManualUpdateState, ManualUpdateState } from './index';

/**
 * Tracks the progress of the automatic update flow `initManualUpdates()`
 * runs at startup — either re-applying a user's persisted selection, or
 * (when there is none) downloading and applying whichever update the
 * server marks as default for this project+environment.
 *
 * Use this to decide what to show while an update is being applied in the
 * background, e.g.:
 *
 * ```tsx
 * const { phase } = useManualUpdateState();
 * if (phase === 'downloading' || phase === 'restarting') {
 *   return <UpdatingOverlay />;
 * }
 * ```
 */
export function useManualUpdateState(): ManualUpdateState {
  const [state, setState] = useState<ManualUpdateState>(getManualUpdateState());

  useEffect(() => subscribeToManualUpdateState(setState), []);

  return state;
}
