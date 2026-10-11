/** One return action per focus cycle, including saves completing after a screen was left. */
export function createBackAction<T>(
  router: { canGoBack: () => boolean; back: () => void; replace: (destination: T) => void },
  fallback: T
) {
  let blocked = false;
  return {
    back: () => {
      if (blocked) return;
      blocked = true;
      try {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      } catch (error) {
        blocked = false;
        throw error;
      }
    },
    reset: () => {
      blocked = false;
    },
    pause: () => {
      blocked = true;
    },
  };
}
