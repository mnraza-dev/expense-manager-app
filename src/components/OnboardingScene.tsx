import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Cloud, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { MotionPressable } from './Motion';
import { useTheme } from './ui';

/** Perspective artwork, built from native layers; no financial values or GL context. */
export function OnboardingScene({ page }: { page: number }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const float = useSharedValue(0),
    reveal = useSharedValue(0),
    tap = useSharedValue(0);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const config = {
      duration: 2200,
      easing: Easing.inOut(Easing.sin),
      reduceMotion: ReduceMotion.System,
    };
    if (active && !reduced) float.set(withRepeat(withTiming(1, config), -1, true));
    else {
      cancelAnimation(float);
      float.set(0);
    }
    reveal.set(withTiming(1, { duration: 500, reduceMotion: ReduceMotion.System }));
    return () => {
      cancelAnimation(float);
      cancelAnimation(reveal);
      cancelAnimation(tap);
    };
  }, [active, reduced, float, reveal, tap]);
  const wallet = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { perspective: 900 },
      { translateY: -8 * float.value + (1 - reveal.value) * 20 },
      { rotateX: `${12 - 4 * float.value}deg` },
      { rotateY: `${-12 + 7 * float.value + tap.value * 8}deg` },
      { rotateZ: '-5deg' },
    ],
  }));
  const card = useAnimatedStyle(() => ({
    transform: [
      { translateY: -20 * reveal.value - 7 * float.value - 18 * tap.value },
      { rotateZ: `${-8 - 3 * float.value}deg` },
    ],
  }));
  const satellite = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: 7 * float.value }, { rotateZ: `${4 - 5 * float.value}deg` }],
  }));
  const receipt = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { perspective: 800 },
      { translateY: -10 * float.value },
      { rotateY: `${-14 + 7 * float.value}deg` },
      { rotateZ: '8deg' },
    ],
  }));
  const shadow = useAnimatedStyle(() => ({
    opacity: 0.1 + 0.08 * (1 - float.value),
    transform: [{ scaleX: 1 - 0.12 * float.value }],
  }));
  const progress = useAnimatedStyle(() => ({
    transform: [{ scaleX: 0.4 + 0.5 * reveal.value - 0.12 * float.value }],
  }));
  const interact = () => {
    tap.set(
      withSequence(
        withTiming(1, { duration: 180, reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 450, reduceMotion: ReduceMotion.System })
      )
    );
  };
  const scale = Math.min(1, Math.max(0.55, (width - 56) / 320));
  return (
    <View style={{ height: 270 * scale, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 320, height: 270, transform: [{ scale }] }}>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={
            page === 0
              ? 'Animate wallet illustration'
              : page === 1
                ? 'Animate budget illustration'
                : 'Animate privacy illustration'
          }
          onPress={interact}
          style={{ width: 320, height: 270 }}>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={StyleSheet.absoluteFill}>
            <View style={[scene.halo, { backgroundColor: c.soft }]} />
            <Animated.View style={[scene.shadow, { backgroundColor: c.text }, shadow]} />
            {page === 1 && (
              <Animated.View
                style={[
                  scene.receipt,
                  { backgroundColor: c.card, borderColor: c.border },
                  receipt,
                ]}>
                <View
                  style={{
                    width: 36,
                    height: 5,
                    backgroundColor: c.accent,
                    borderRadius: 3,
                    marginBottom: 12,
                  }}
                />
                {[64, 86, 52].map((w) => (
                  <View
                    key={w}
                    style={{
                      height: 5,
                      width: w,
                      backgroundColor: c.border,
                      borderRadius: 3,
                      marginVertical: 5,
                    }}
                  />
                ))}
                <View
                  style={{
                    marginTop: 14,
                    height: 9,
                    width: 88,
                    borderRadius: 5,
                    backgroundColor: c.soft,
                    overflow: 'hidden',
                  }}>
                  <Animated.View
                    style={[
                      { height: 9, width: 88, borderRadius: 5, backgroundColor: c.accent },
                      progress,
                    ]}
                  />
                </View>
                <Check size={18} color={c.accent} style={{ marginTop: 12 }} />
              </Animated.View>
            )}
            <Animated.View style={[scene.walletAssembly, wallet]}>
              <View style={[scene.walletBack, { backgroundColor: '#102F28' }]} />
              <Animated.View style={[scene.bankCard, card]}>
                <LinearGradient colors={['#B8DAC7', '#72A98C']} style={scene.cardFill}>
                  <View style={scene.chip} />
                  <View style={scene.cardLine} />
                  <View style={[scene.cardLine, { width: 48, opacity: 0.35 }]} />
                </LinearGradient>
              </Animated.View>
              <View style={[scene.secondCard, { backgroundColor: '#E4CE9F' }]} />
              <LinearGradient
                colors={[c.heroEnd, c.hero]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.7, y: 1 }}
                style={scene.walletFront}>
                <View style={scene.stitch} />
                <View style={scene.brand}>
                  <View style={scene.brandStem} />
                  <View style={scene.brandLoop} />
                </View>
                <View style={scene.seam} />
              </LinearGradient>
              <LinearGradient colors={['#4C8068', '#214F40']} style={scene.clasp}>
                <View style={scene.rivet} />
              </LinearGradient>
              <View style={scene.bottomEdge} />
            </Animated.View>
            <Animated.View
              style={[scene.badge, { backgroundColor: c.card, borderColor: c.border }, satellite]}>
              {page === 2 ? (
                <ShieldCheck size={32} color={c.accent} />
              ) : page === 1 ? (
                <Check size={32} color={c.accent} />
              ) : (
                <Sparkles size={30} color={c.accent} />
              )}
            </Animated.View>
            {page === 2 && (
              <Animated.View
                style={[scene.cloud, { backgroundColor: c.card, borderColor: c.border }, receipt]}>
                <Cloud size={32} color={c.muted} />
                <View
                  style={{
                    position: 'absolute',
                    bottom: -9,
                    right: -7,
                    backgroundColor: c.soft,
                    padding: 7,
                    borderRadius: 12,
                  }}>
                  <LockKeyhole size={18} color={c.accent} />
                </View>
              </Animated.View>
            )}
          </View>
        </MotionPressable>
      </View>
    </View>
  );
}
const scene = StyleSheet.create({
  halo: { position: 'absolute', width: 238, height: 238, borderRadius: 119, left: 41, top: 7 },
  shadow: { position: 'absolute', width: 190, height: 20, borderRadius: 100, left: 67, bottom: 18 },
  walletAssembly: { position: 'absolute', width: 218, height: 164, left: 47, top: 67 },
  walletBack: { position: 'absolute', top: 0, left: 3, width: 207, height: 143, borderRadius: 23 },
  bankCard: {
    position: 'absolute',
    top: -8,
    left: 21,
    width: 155,
    height: 101,
    borderRadius: 13,
    overflow: 'hidden',
  },
  cardFill: { flex: 1, padding: 15, gap: 8 },
  chip: {
    width: 26,
    height: 20,
    backgroundColor: '#E7D8AE',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#C4AF76',
  },
  cardLine: { width: 70, height: 4, borderRadius: 2, backgroundColor: '#315F49', opacity: 0.6 },
  secondCard: {
    position: 'absolute',
    width: 142,
    height: 86,
    top: 0,
    left: 51,
    borderRadius: 12,
    transform: [{ rotateZ: '9deg' }],
  },
  walletFront: {
    position: 'absolute',
    width: 209,
    height: 136,
    top: 18,
    left: 0,
    borderRadius: 22,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#71A58B',
  },
  stitch: {
    position: 'absolute',
    inset: 8,
    borderRadius: 15,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(206,230,213,0.3)',
  },
  seam: {
    position: 'absolute',
    top: 22,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: 'rgba(220,244,232,0.16)',
  },
  brand: { position: 'absolute', left: 30, top: 48, width: 32, height: 42, opacity: 0.75 },
  brandStem: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 6,
    height: 37,
    borderRadius: 3,
    backgroundColor: '#D1E8D8',
  },
  brandLoop: {
    position: 'absolute',
    left: 1,
    top: 0,
    width: 25,
    height: 24,
    borderWidth: 6,
    borderRadius: 12,
    borderColor: '#D1E8D8',
  },
  clasp: {
    position: 'absolute',
    width: 67,
    height: 46,
    top: 67,
    right: -1,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#67977F',
  },
  rivet: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#D1BB83',
    borderWidth: 2,
    borderColor: '#EADBAA',
    marginLeft: 17,
    marginTop: 15,
  },
  bottomEdge: {
    position: 'absolute',
    height: 6,
    width: 174,
    bottom: 4,
    left: 18,
    borderRadius: 3,
    backgroundColor: '#102F28',
  },
  badge: {
    position: 'absolute',
    top: 142,
    right: 17,
    width: 66,
    height: 66,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receipt: {
    position: 'absolute',
    top: 8,
    right: 12,
    width: 114,
    height: 151,
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
  },
  cloud: {
    position: 'absolute',
    top: 18,
    right: 34,
    width: 79,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
