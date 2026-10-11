import { useEffect, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, Check, CreditCard, IndianRupee, ShieldCheck } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { tokens, type palette } from '../design/tokens';

type ArtColors = typeof palette.light;
export type FinanceArtKind =
  | 'wallet'
  | 'coins'
  | 'receipt'
  | 'chart'
  | 'calendar'
  | 'shield'
  | 'card';

/** Reserve the extrusion in layout so depth never consumes the next section's gap. */
export function DepthSurface({
  children,
  style,
  faceStyle,
  edgeColor,
  radius = 20,
  depth = 4,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  edgeColor: string;
  radius?: number;
  depth?: number;
}) {
  return (
    <View style={[style, { paddingBottom: depth }]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          StyleSheet.absoluteFill,
          { top: depth, left: 1, right: 1, backgroundColor: edgeColor, borderRadius: radius },
        ]}
      />
      <View style={[depthStyles.face, { borderRadius: radius }, faceStyle]}>{children}</View>
    </View>
  );
}

export function DepthIcon({
  children,
  colors,
  size = 44,
}: {
  children: ReactNode;
  colors: ArtColors;
  size?: number;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size + 3 }}>
      <View
        style={{
          flex: 1,
          transform: [{ perspective: 400 }, { rotateX: '8deg' }, { rotateY: '-12deg' }],
        }}>
        <View
          style={[
            StyleSheet.absoluteFill,
            { top: 3, backgroundColor: colors.border, borderRadius: size * 0.3 },
          ]}
        />
        <LinearGradient
          colors={[colors.card, colors.soft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: size * 0.3,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
          {children}
        </LinearGradient>
      </View>
    </View>
  );
}

/** Small native illustrations. Financial figures and interactive controls remain separate. */
export function FinanceArt({
  kind,
  colors: c,
  size = 80,
  animated = false,
}: {
  kind: FinanceArtKind;
  colors: ArtColors;
  size?: number;
  animated?: boolean;
}) {
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
  );
  const drift = useSharedValue(0);
  useEffect(() => {
    if (!animated) return;
    const listener = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => listener.remove();
  }, [animated]);
  useEffect(() => {
    if (animated && focused && active && !reduced) {
      drift.set(
        withRepeat(
          withTiming(1, {
            duration: 2400,
            easing: Easing.inOut(Easing.sin),
            reduceMotion: ReduceMotion.System,
          }),
          -1,
          true
        )
      );
    } else {
      cancelAnimation(drift);
      drift.set(0);
    }
    return () => cancelAnimation(drift);
  }, [animated, focused, active, reduced, drift]);
  const float = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { translateY: -4 * drift.value },
      { rotateY: `${-12 + 5 * drift.value}deg` },
      { rotateX: '7deg' },
    ],
  }));
  const shadow = useAnimatedStyle(() => ({
    opacity: 0.1 - 0.03 * drift.value,
    transform: [{ scaleX: 1 - 0.08 * drift.value }],
  }));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 120, height: 120, transform: [{ scale: size / 120 }] }}>
        <Animated.View style={[depthStyles.objectShadow, { backgroundColor: c.text }, shadow]} />
        <Animated.View style={[{ width: 120, height: 108 }, float]}>
          {(kind === 'wallet' || kind === 'card') && (
            <>
              <View
                style={{
                  position: 'absolute',
                  top: 25,
                  left: 18,
                  width: 86,
                  height: 63,
                  borderRadius: 14,
                  backgroundColor: c.hero,
                  transform: [{ rotateZ: '-7deg' }],
                }}
              />
              <LinearGradient
                colors={['#D5E8D9', '#85B49B']}
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 25,
                  width: 79,
                  height: 53,
                  borderRadius: 10,
                  transform: [{ rotateZ: '8deg' }],
                  padding: 10,
                }}>
                <CreditCard color="#285B46" size={22} />
                <View
                  style={{
                    width: 38,
                    height: 3,
                    borderRadius: 2,
                    marginTop: 5,
                    backgroundColor: '#5E8D73',
                  }}
                />
              </LinearGradient>
              {kind === 'wallet' && (
                <>
                  <View
                    style={{
                      position: 'absolute',
                      top: 45,
                      left: 16,
                      width: 91,
                      height: 50,
                      borderRadius: 13,
                      backgroundColor: '#0B3026',
                    }}
                  />
                  <LinearGradient
                    colors={[c.heroEnd, c.hero]}
                    style={{
                      position: 'absolute',
                      top: 40,
                      left: 16,
                      width: 91,
                      height: 50,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: '#5C9179',
                    }}>
                    <View
                      style={{
                        position: 'absolute',
                        left: 9,
                        right: 9,
                        bottom: 8,
                        height: 1,
                        backgroundColor: '#5C9179',
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        right: -2,
                        top: 14,
                        width: 28,
                        height: 22,
                        borderRadius: 7,
                        backgroundColor: '#C7AE77',
                        borderBottomWidth: 3,
                        borderColor: '#8B7346',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <View
                        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F5E1B6' }}
                      />
                    </View>
                  </LinearGradient>
                </>
              )}
            </>
          )}
          {kind === 'coins' && (
            <>
              {[0, 1, 2].map((coin) => (
                <View
                  key={coin}
                  style={{
                    position: 'absolute',
                    left: 18 + coin * 14,
                    top: 53 - coin * 15,
                    width: 63,
                    height: 53,
                    transform: [{ rotateZ: '-10deg' }],
                  }}>
                  <View
                    style={{
                      position: 'absolute',
                      inset: 0,
                      top: 5,
                      borderRadius: 32,
                      backgroundColor: '#A3813F',
                    }}
                  />
                  <LinearGradient
                    colors={['#FAEAC0', '#D5B26C']}
                    style={{
                      height: 46,
                      borderRadius: 32,
                      borderWidth: 2,
                      borderColor: '#EAD196',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <IndianRupee size={24} color="#87652F" />
                  </LinearGradient>
                </View>
              ))}
            </>
          )}
          {(kind === 'receipt' || kind === 'chart') && (
            <View
              style={{
                position: 'absolute',
                left: 29,
                top: 15,
                width: 66,
                height: 82,
                transform: [{ rotateZ: '8deg' }],
              }}>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    top: 5,
                    left: 4,
                    right: -4,
                    bottom: -4,
                    backgroundColor: c.border,
                    borderRadius: 10,
                  },
                ]}
              />
              <LinearGradient
                colors={[c.card, c.soft]}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: 10,
                  gap: 7,
                }}>
                <View
                  style={{ width: 24, height: 4, borderRadius: 3, backgroundColor: c.accent }}
                />
                {kind === 'chart' ? (
                  <View
                    style={{ height: 36, flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
                    {[18, 30, 24].map((height, index) => (
                      <View
                        key={index}
                        style={{
                          width: 10,
                          height,
                          borderRadius: 3,
                          backgroundColor: c.accent,
                          borderRightWidth: 3,
                          borderColor: c.hero,
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <>
                    {[38, 30, 35].map((width) => (
                      <View
                        key={width}
                        style={{ width, height: 3, borderRadius: 2, backgroundColor: c.border }}
                      />
                    ))}
                    <Check size={17} color={c.accent} />
                  </>
                )}
              </LinearGradient>
            </View>
          )}
          {(kind === 'calendar' || kind === 'shield') && (
            <View
              style={{
                position: 'absolute',
                top: 23,
                left: 24,
                width: 74,
                height: 66,
                transform: [{ rotateZ: '-8deg' }],
              }}>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    top: 5,
                    left: 3,
                    right: -3,
                    bottom: -5,
                    backgroundColor: c.border,
                    borderRadius: 17,
                  },
                ]}
              />
              <LinearGradient
                colors={[c.card, c.soft]}
                style={{
                  flex: 1,
                  borderRadius: 17,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {kind === 'calendar' ? (
                  <CalendarDays size={40} color={c.accent} />
                ) : (
                  <ShieldCheck size={42} color={c.accent} />
                )}
              </LinearGradient>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const depthStyles = StyleSheet.create({
  face: {
    flexGrow: 1,
    shadowColor: '#092B23',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: tokens.elevation,
  },
  objectShadow: {
    position: 'absolute',
    left: 22,
    bottom: 10,
    width: 82,
    height: 11,
    borderRadius: 50,
  },
});
