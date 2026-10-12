import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './ui';
import { tokens } from '../design/tokens';
import { KeyboardRegion } from './KeyboardLayout';
import { Keyboard } from 'react-native';
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: (dismiss: () => void) => React.ReactNode;
}) {
  const c = useTheme();
  const progress = useSharedValue(0);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    progress.set(
      withTiming(1, { duration: tokens.motion.progress, reduceMotion: ReduceMotion.System })
    );
  }, [progress]);
  const sheet = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 28 }],
  }));
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    Keyboard.dismiss();
    progress.set(
      withTiming(
        0,
        { duration: tokens.motion.feedback, reduceMotion: ReduceMotion.System },
        (finished) => {
          if (finished) runOnJS(onClose)();
        }
      )
    );
  };
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={dismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <KeyboardRegion offset={0} style={{ justifyContent: 'flex-end' }}>
        <Animated.View
          style={[
            { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
            backdrop,
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
            onPress={dismiss}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          style={[
            {
              height: '90%',
              backgroundColor: c.bg,
              borderTopLeftRadius: tokens.radius.surface,
              borderTopRightRadius: tokens.radius.surface,
            },
            sheet,
          ]}>
          <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>
            {children(dismiss)}
          </SafeAreaView>
        </Animated.View>
        </KeyboardRegion>
      </View>
    </Modal>
  );
}
