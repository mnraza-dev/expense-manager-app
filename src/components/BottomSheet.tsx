import { Modal, Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  ReduceMotion,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './ui';
import { tokens } from '../design/tokens';
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const c = useTheme();
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          entering={FadeIn.duration(tokens.motion.feedback).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(tokens.motion.feedback).reduceMotion(ReduceMotion.System)}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(tokens.motion.progress).reduceMotion(ReduceMotion.System)}
          exiting={SlideOutDown.duration(tokens.motion.feedback).reduceMotion(ReduceMotion.System)}
          style={{
            height: '90%',
            backgroundColor: c.bg,
            borderTopLeftRadius: tokens.radius.surface,
            borderTopRightRadius: tokens.radius.surface,
          }}>
          <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1 }}>
            {children}
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
