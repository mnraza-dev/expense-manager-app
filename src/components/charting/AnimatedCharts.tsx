import { useEffect, useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Path, Circle } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient as SurfaceGradient } from 'expo-linear-gradient';
import { useTheme } from '../ui';
import { DepthSurface } from '../Depth';
import { money } from '../../utils/finance';
import { tokens } from '../../design/tokens';
import { useChartActivity } from './useChartActivity';
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export function ChartSurface({
  title,
  subtitle,
  amount,
  children,
  badge,
}: {
  title: string;
  subtitle?: string;
  amount?: number;
  children: React.ReactNode;
  badge?: string;
}) {
  const c = useTheme();
  return (
    <DepthSurface edgeColor={c.border} faceStyle={{ backgroundColor: c.card, overflow: 'hidden' }}>
      <SurfaceGradient
        colors={[c.soft, c.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.7 }}
        style={{ padding: 18, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{title}</Text>
            {subtitle && (
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{subtitle}</Text>
            )}
          </View>
          {badge && (
            <View
              style={{
                paddingVertical: 6,
                paddingHorizontal: 9,
                borderRadius: 10,
                backgroundColor: c.card,
              }}>
              <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{badge}</Text>
            </View>
          )}
        </View>
        {amount !== undefined && <AnimatedAmount amount={amount} size={30} />}
        {children}
      </SurfaceGradient>
    </DepthSurface>
  );
}
export function AnimatedAmount({
  amount,
  color,
  size = 20,
}: {
  amount: number;
  color?: string;
  size?: number;
}) {
  const c = useTheme(),
    active = useChartActivity();
  const motion = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      cancelAnimation(motion);
      return;
    }
    motion.set(0);
    motion.set(
      withTiming(1, { duration: tokens.motion.progress, reduceMotion: ReduceMotion.System })
    );
    return () => cancelAnimation(motion);
  }, [amount, active, motion]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.7 + motion.value * 0.3,
    transform: [{ translateY: (1 - motion.value) * 4 }],
  }));
  return (
    <Animated.View style={style}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        style={{
          color: color ?? c.text,
          fontSize: size,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        }}>
        {money(amount)}
      </Text>
    </Animated.View>
  );
}
export function AnimatedColumn({
  x,
  y,
  zero,
  width,
  fill,
}: {
  x: number;
  y: number;
  zero: number;
  width: number;
  fill: string;
}) {
  const active = useChartActivity(),
    target = useSharedValue(zero);
  useEffect(() => {
    target.set(
      active
        ? withTiming(y, {
            duration: 480,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          })
        : y
    );
    return () => cancelAnimation(target);
  }, [active, y, target]);
  const props = useAnimatedProps(() => ({
    y: Math.min(target.value, zero),
    height: Math.max(0, Math.abs(zero - target.value)),
  }));
  return (
    <AnimatedRect
      x={x}
      width={width}
      rx={Math.min(5, width / 2)}
      fill={fill}
      animatedProps={props}
    />
  );
}
export function AnimatedLine({
  path,
  color,
  length = 3000,
  area,
  gradient,
}: {
  path: string;
  color: string;
  length?: number;
  area?: string;
  gradient?: string;
}) {
  const active = useChartActivity(),
    reveal = useSharedValue(1);
  useEffect(() => {
    if (active) {
      reveal.set(0);
      reveal.set(
        withTiming(1, {
          duration: 650,
          easing: Easing.out(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        })
      );
    } else cancelAnimation(reveal);
    return () => cancelAnimation(reveal);
  }, [active, path, reveal]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - reveal.value) }));
  const areaProps = useAnimatedProps(() => ({ opacity: reveal.value * 0.2 }));
  return (
    <>
      {area && <AnimatedPath d={area} fill={gradient ?? color} animatedProps={areaProps} />}
      <AnimatedPath
        d={path}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={[length, length]}
        animatedProps={props}
      />
    </>
  );
}
export function AnimatedTrack({
  fraction,
  color,
  height = 7,
}: {
  fraction: number;
  color: string;
  height?: number;
}) {
  const c = useTheme(),
    active = useChartActivity(),
    progress = useSharedValue(0);
  const safe = Math.max(0, Math.min(1, fraction));
  useEffect(() => {
    progress.set(
      active
        ? withTiming(safe, {
            duration: 440,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          })
        : safe
    );
    return () => cancelAnimation(progress);
  }, [active, safe, progress]);
  const style = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height, overflow: 'hidden', backgroundColor: c.border }}>
      <Animated.View style={[{ height, backgroundColor: color, borderRadius: height }, style]} />
    </View>
  );
}
export function FlatRing({
  segments,
  size = 230,
}: {
  segments: { value: number; color: string }[];
  size?: number;
}) {
  const c = useTheme(),
    id = useId().replace(/:/g, '');
  const total = segments.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const radius = 76,
    circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <Svg width="100%" height={size} viewBox="0 0 230 230" accessibilityElementsHidden>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.soft} />
          <Stop offset="1" stopColor={c.border} />
        </LinearGradient>
      </Defs>
      <Circle cx={115} cy={119} r={radius} fill="none" stroke={`url(#${id})`} strokeWidth={31} />
      {segments.map((row, index) => {
        const length = total ? (Math.max(0, row.value) / total) * circumference : 0;
        const start = offset;
        offset += length;
        return length > 0 ? (
          <RingArc
            key={index}
            radius={radius}
            color={row.color}
            length={length}
            circumference={circumference}
            offset={start}
          />
        ) : null;
      })}
    </Svg>
  );
}
function RingArc({
  radius,
  color,
  length,
  circumference,
  offset,
}: {
  radius: number;
  color: string;
  length: number;
  circumference: number;
  offset: number;
}) {
  const active = useChartActivity(),
    value = useSharedValue(0);
  useEffect(() => {
    value.set(
      active ? withTiming(length, { duration: 550, reduceMotion: ReduceMotion.System }) : length
    );
    return () => cancelAnimation(value);
  }, [active, length, value]);
  const props = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0, value.value - Math.min(5, value.value * 0.1)), circumference],
  }));
  return (
    <AnimatedCircle
      cx={115}
      cy={119}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={27}
      strokeDashoffset={-offset}
      rotation={-90}
      origin="115,119"
      animatedProps={props}
    />
  );
}
