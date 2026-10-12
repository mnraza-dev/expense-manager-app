import { useEffect } from 'react';
import { create } from 'zustand';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useLock } from '../../security/lock';
import { useRequiredUpdate } from '../../updates/service';
const useForeground = create<{ active: boolean }>(() => ({
  active: AppState.currentState === 'active',
}));
let users = 0;
let listener: ReturnType<typeof AppState.addEventListener> | null = null;
export function useChartActivity() {
  const focused = useIsFocused();
  const foreground = useForeground((state) => state.active);
  const locked = useLock((state) => state.locked);
  const update = useRequiredUpdate((state) => state.required);
  useEffect(() => {
    if (users++ === 0) {
      useForeground.setState({ active: AppState.currentState === 'active' });
      listener = AppState.addEventListener('change', (state) =>
        useForeground.setState({ active: state === 'active' })
      );
    }
    return () => {
      if (--users === 0) {
        listener?.remove();
        listener = null;
      }
    };
  }, []);
  return focused && foreground && !locked && !update;
}
