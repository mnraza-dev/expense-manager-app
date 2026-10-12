import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type TextInput,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
type ScrollHandle = Pick<ScrollView, 'scrollResponderScrollNativeHandleToKeyboard'>;
const InputFocus = createContext<(input: TextInput | null) => void>(() => {});
export const useKeyboardInputFocus = () => useContext(InputFocus);
export function KeyboardRegion({
  children,
  style,
  offset,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  offset?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset ?? insets.top}>
      {children}
    </KeyboardAvoidingView>
  );
}
export function KeyboardFocusProvider({
  children,
  getScrollHandle,
}: {
  children: ReactNode;
  getScrollHandle: () => ScrollHandle | null | undefined;
}) {
  const focused = useRef<TextInput | null>(null),
    frame = useRef<number | null>(null);
  const reveal = useCallback(
    (input: TextInput | null) => {
      focused.current = input;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (!input?.isFocused()) return;
        getScrollHandle()?.scrollResponderScrollNativeHandleToKeyboard(input, 24, true);
      });
    },
    [getScrollHandle]
  );
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => reveal(focused.current));
    return () => {
      shown.remove();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [reveal]);
  return <InputFocus.Provider value={reveal}>{children}</InputFocus.Provider>;
}
export function KeyboardScrollView({ children, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const getScrollHandle = useCallback(() => scroll.current, []);
  return (
    <KeyboardFocusProvider getScrollHandle={getScrollHandle}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        {...props}>
        {children}
      </ScrollView>
    </KeyboardFocusProvider>
  );
}
