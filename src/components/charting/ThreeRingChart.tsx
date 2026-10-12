import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AppState, Platform, View } from 'react-native';
import { useLock } from '../../security/lock';
import { useRequiredUpdate } from '../../updates/service';
import type { GLViewProps } from 'expo-gl';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { RingSegment } from '../../utils/chartData';
import { createRingRuntime, type RingRuntime } from './ringRuntime';
import { useChartActivity } from './useChartActivity';
import { FlatRing } from './AnimatedCharts';
import { useTheme } from '../ui';
export function ThreeRingChart({
  segments,
  selected = null,
  onSelect,
  center,
  height = 230,
}: {
  segments: RingSegment[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  center: ReactNode;
  height?: number;
}) {
  const c = useTheme(),
    active = useChartActivity(),
    reduced = useReducedMotion();
  const [GL, setGL] = useState<ComponentType<GLViewProps> | null>(null);
  const [failed, setFailed] = useState(false),
    [ready, setReady] = useState(false);
  const runtime = useRef<RingRuntime | null>(null),
    mounted = useRef(false);
  const activeRef = useRef(active);
  const latest = useRef({ segments, selected, track: c.card, onSelect });
  const width = useRef(230),
    dragged = useRef(false),
    origin = useRef({ x: 0, y: 0, rotation: 0 });
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    latest.current.onSelect = onSelect;
  }, [onSelect]);
  useEffect(() => {
    latest.current = { segments, selected, track: c.card, onSelect };
    runtime.current?.update(segments, selected, c.card);
    if (active) {
      scale.set(0.985);
      scale.set(withTiming(1, { duration: 320, reduceMotion: ReduceMotion.System }));
    }
    return () => cancelAnimation(scale);
    // Callback changes do not rebuild GL geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, selected, c.card, active, scale]);
  useEffect(() => {
    mounted.current = true;
    if (Platform.OS === 'web' || requireOptionalNativeModule('ExpoGL'))
      import('expo-gl')
        .then((module) => {
          if (mounted.current) setGL(() => module.GLView);
        })
        .catch(() => {
          if (mounted.current) setFailed(true);
        });
    return () => {
      mounted.current = false;
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    activeRef.current = active;
    return () => {
      activeRef.current = false;
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, [active]);
  const fail = () => {
    runtime.current?.dispose();
    runtime.current = null;
    if (mounted.current) {
      setFailed(true);
      setReady(false);
    }
  };
  return (
    <Animated.View
      style={[{ height, width: '100%', overflow: 'hidden', borderRadius: 18 }, style]}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width;
      }}
      onTouchStart={(event) => {
        dragged.current = false;
        origin.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
          rotation: runtime.current?.rotation() ?? 0,
        };
      }}
      onMoveShouldSetResponder={(event) => {
        const dx = Math.abs(event.nativeEvent.pageX - origin.current.x),
          dy = Math.abs(event.nativeEvent.pageY - origin.current.y);
        return dx > 8 && dx > dy * 1.4;
      }}
      onResponderGrant={() => {
        dragged.current = true;
      }}
      onResponderMove={(event) =>
        runtime.current?.rotate(
          origin.current.rotation + (event.nativeEvent.pageX - origin.current.x) * 0.005
        )
      }
      onTouchEnd={(event) => {
        if (dragged.current) return;
        const key = runtime.current?.pick(
          event.nativeEvent.locationX,
          event.nativeEvent.locationY,
          width.current,
          height
        );
        if (key) latest.current.onSelect?.(key);
      }}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: GL && !failed && active && ready ? 0 : 1,
        }}>
        <FlatRing segments={segments} size={height} />
      </View>
      {GL && !failed && active && (
        <GL
          style={{ position: 'absolute', inset: 0, opacity: ready ? 1 : 0 }}
          msaaSamples={2}
          onContextCreate={(gl) => {
            if (
              !mounted.current ||
              !activeRef.current ||
              AppState.currentState !== 'active' ||
              useLock.getState().locked ||
              useRequiredUpdate.getState().required
            )
              return;
            try {
              runtime.current?.dispose();
              runtime.current = createRingRuntime(gl, reduced, fail);
              const data = latest.current;
              runtime.current.update(data.segments, data.selected, data.track);
              setReady(true);
            } catch {
              fail();
            }
          }}
        />
      )}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 8,
        }}>
        <View style={{ maxWidth: 116, alignItems: 'center', gap: 5 }}>{center}</View>
      </View>
    </Animated.View>
  );
}
