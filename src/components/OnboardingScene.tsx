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
      { translateY: -10 * float.value - 7 * tap.value },
      { rotateY: `${-14 + 7 * float.value + 8 * tap.value}deg` },
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
              <>
                <Animated.View style={[scene.budgetBoard, receipt]}>
                  <View style={scene.boardDepth} />
                  <LinearGradient colors={[c.card, c.soft]} style={scene.boardFace}>
                    <View
                      style={{ width: 72, height: 7, borderRadius: 4, backgroundColor: c.accent }}
                    />
                    <View
                      style={{
                        width: 116,
                        height: 4,
                        marginTop: 9,
                        borderRadius: 3,
                        backgroundColor: c.border,
                      }}
                    />
                    <View style={scene.barGroup}>
                      {[44, 76, 58, 92].map((height, index) => (
                        <View
                          key={height}
                          style={{ height, width: 27, borderRadius: 7, overflow: 'hidden' }}>
                          <LinearGradient
                            colors={index === 3 ? ['#E9D39E', '#A38B54'] : ['#92CAB0', '#316B53']}
                            style={{ flex: 1 }}
                          />
                          <View
                            style={{
                              position: 'absolute',
                              width: 5,
                              right: 0,
                              top: 0,
                              bottom: 0,
                              backgroundColor: 'rgba(0,0,0,0.12)',
                            }}
                          />
                        </View>
                      ))}
                    </View>
                    <View style={{ height: 1, backgroundColor: c.border }} />
                    <View
                      style={{
                        height: 7,
                        width: 145,
                        borderRadius: 4,
                        backgroundColor: c.border,
                        marginTop: 15,
                      }}>
                      <Animated.View
                        style={[
                          { width: 145, height: 7, borderRadius: 4, backgroundColor: c.accent },
                          progress,
                        ]}
                      />
                    </View>
                  </LinearGradient>
                </Animated.View>
                <Animated.View
                  style={[
                    scene.receiptSlip,
                    { backgroundColor: c.card, borderColor: c.border },
                    satellite,
                  ]}>
                  <View
                    style={{
                      width: 27,
                      height: 4,
                      borderRadius: 3,
                      backgroundColor: c.accent,
                      marginBottom: 8,
                    }}
                  />
                  {[43, 54, 37].map((w) => (
                    <View
                      key={w}
                      style={{
                        width: w,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: c.border,
                        marginVertical: 4,
                      }}
                    />
                  ))}
                  <Check size={18} color={c.accent} style={{ marginTop: 8 }} />
                </Animated.View>
              </>
            )}
            {page === 0 && (
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
            )}
            {page === 2 && (
              <Animated.View style={[scene.vault, wallet]}>
                <View style={scene.vaultDepth} />
                <LinearGradient
                  colors={['#588F78', '#173D32']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={scene.vaultBody}>
                  <View style={scene.vaultDoor}>
                    <View style={[scene.hinge, { top: 23 }]} />
                    <View style={[scene.hinge, { bottom: 23 }]} />
                    <View style={scene.dial}>
                      <View style={scene.dialInner}>
                        <LockKeyhole size={32} color="#F2E4C3" />
                      </View>
                    </View>
                    <View style={scene.statusLight} />
                  </View>
                </LinearGradient>
                <View style={scene.vaultFeet} />
              </Animated.View>
            )}
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
  budgetBoard: { position: 'absolute', width: 198, height: 206, left: 55, top: 29 },
  boardDepth: {
    position: 'absolute',
    width: 198,
    height: 200,
    left: 6,
    top: 6,
    backgroundColor: '#477561',
    borderRadius: 21,
  },
  boardFace: {
    width: 198,
    height: 200,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#88B09A',
  },
  barGroup: {
    height: 99,
    flexDirection: 'row',
    gap: 13,
    alignItems: 'flex-end',
    marginTop: 10,
    paddingBottom: 3,
  },
  receiptSlip: {
    position: 'absolute',
    left: 14,
    top: 143,
    width: 81,
    height: 104,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  vault: { position: 'absolute', width: 197, height: 177, left: 58, top: 69 },
  vaultDepth: {
    position: 'absolute',
    width: 195,
    height: 160,
    borderRadius: 24,
    backgroundColor: '#102D26',
    top: 10,
    left: 9,
  },
  vaultBody: {
    width: 195,
    height: 160,
    borderRadius: 23,
    padding: 13,
    borderWidth: 1,
    borderColor: '#91B9A2',
  },
  vaultDoor: {
    flex: 1,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#9ABEAA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#285A48',
  },
  hinge: {
    position: 'absolute',
    left: -8,
    width: 15,
    height: 24,
    borderRadius: 5,
    backgroundColor: '#C5DCCD',
    borderWidth: 1,
    borderColor: '#83A28C',
  },
  dial: {
    width: 73,
    height: 73,
    borderRadius: 38,
    borderWidth: 6,
    borderColor: '#CBB681',
    backgroundColor: '#EBDAAF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialInner: {
    width: 52,
    height: 52,
    borderRadius: 27,
    backgroundColor: '#416E58',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#8DAD93',
  },
  statusLight: {
    position: 'absolute',
    right: 12,
    top: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B1E6B8',
  },
  vaultFeet: {
    position: 'absolute',
    bottom: 8,
    left: 20,
    right: 9,
    height: 10,
    borderRadius: 4,
    backgroundColor: '#0F2B23',
  },
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
