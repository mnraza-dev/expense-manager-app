import { useEffect, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '../design/tokens';
export function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.duration(tokens.motion.reveal)
        .delay(delay)
        .reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(tokens.motion.feedback).reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({
  style,
  onPressIn,
  onPressOut,
  depth = false,
  ...props
}: PressableProps & { style?: StyleProp<ViewStyle>; depth?: boolean }) {
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({
    transform: depth
      ? [{ perspective: 700 }, { rotateX: `${(1 - scale.value) * 100}deg` }, { scale: scale.value }]
      : [{ scale: scale.value }],
  }));
  return (
    <AnimatedPressable
      {...props}
      style={[style, motion]}
      onPressIn={(event) => {
        scale.set(
          withTiming(0.975, { duration: tokens.motion.press, reduceMotion: ReduceMotion.System })
        );
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(
          withTiming(1, { duration: tokens.motion.press, reduceMotion: ReduceMotion.System })
        );
        onPressOut?.(event);
      }}
    />
  );
}

export function TabGlyph({
  children,
  focused,
  background,
}: {
  children: ReactNode;
  focused: boolean;
  background: string;
}) {
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    active.set(
      withTiming(focused ? 1 : 0, {
        duration: tokens.motion.feedback,
        reduceMotion: ReduceMotion.System,
      })
    );
  }, [active, focused]);
  const motion = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * active.value }, { scale: 1 + 0.06 * active.value }],
  }));
  const highlight = useAnimatedStyle(() => ({ opacity: active.value }));
  return (
    <Animated.View
      style={[{ width: 44, height: 30, alignItems: 'center', justifyContent: 'center' }, motion]}>
      <Animated.View
        style={[
          { position: 'absolute', inset: 0, backgroundColor: background, borderRadius: 12 },
          highlight,
        ]}
      />
      {children}
    </Animated.View>
  );
}
