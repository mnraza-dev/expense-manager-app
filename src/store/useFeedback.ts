import { create } from 'zustand';
let timer: ReturnType<typeof setTimeout> | undefined;
export const useFeedback = create<{ message: string | null }>(() => ({ message: null }));
export function notify(message: string) {
  if (timer) clearTimeout(timer);
  useFeedback.setState({ message });
  timer = setTimeout(() => {
    useFeedback.setState({ message: null });
    timer = undefined;
  }, 2400);
}
