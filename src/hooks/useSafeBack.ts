import { useCallback, useMemo } from 'react';
import { useFocusEffect, useNavigation, useRouter, type Href } from 'expo-router';
import { createBackAction } from '../utils/navigation';

export function useSafeBack(fallback: Href = '/(tabs)') {
  const router = useRouter();
  const navigation = useNavigation();
  const action = useMemo(
    () =>
      createBackAction(
        {
          canGoBack: () => navigation.canGoBack(),
          back: () => navigation.goBack(),
          replace: (destination: Href) => router.replace(destination),
        },
        fallback
      ),
    [navigation, router, fallback]
  );
  useFocusEffect(
    useCallback(() => {
      action.reset();
      return action.pause;
    }, [action])
  );
  return action.back;
}
