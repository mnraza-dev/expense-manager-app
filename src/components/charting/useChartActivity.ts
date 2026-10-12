import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useLock } from '../../security/lock';
import { useRequiredUpdate } from '../../updates/service';
export function useChartActivity() {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const locked = useLock((state) => state.locked);
  const update = useRequiredUpdate((state) => state.required);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active')
    );
    return () => listener.remove();
  }, []);
  return focused && foreground && !locked && !update;
}
