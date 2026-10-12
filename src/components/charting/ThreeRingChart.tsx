import { requireOptionalNativeModule } from 'expo';
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import type { ExpoWebGLRenderingContext, GLViewProps } from 'expo-gl';
import * as THREE from 'three';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { RingSegment } from '../../utils/chartData';
import { createRingGroup, disposeRingGroup } from './ringScene';
import { useChartActivity } from './useChartActivity';
import { FlatRing } from './AnimatedCharts';
import { useTheme } from '../ui';
interface RingRuntime {
  update(segments: RingSegment[], selected: string | null, track: string): void;
  rotate(value: number): void;
  rotation(): number;
  pick(x: number, y: number, width: number, height: number): string | null;
  dispose(): void;
}
function makeRuntime(
  gl: ExpoWebGLRenderingContext,
  reduced: boolean,
  onFailure: () => void
): RingRuntime {
  const canvas = gl.canvas ?? {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    style: {},
    addEventListener() {},
    removeEventListener() {},
  };
  const renderer = new THREE.WebGLRenderer({
    context: gl as unknown as WebGL2RenderingContext,
    canvas: canvas as HTMLCanvasElement,
    alpha: false,
    antialias: true,
    powerPreference: 'low-power',
  });
  // EXGL dimensions already include the device pixel density.
  renderer.setPixelRatio(1);
  renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.debug.onShaderError = () => {
    throw new Error('Chart shader unavailable.');
  };
  const scene = new THREE.Scene();
  const aspect = gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight);
  const camera = new THREE.OrthographicCamera(-1.65 * aspect, 1.65 * aspect, 1.65, -1.65, 0.1, 20);
  camera.position.set(0, 0, 5);
  const key = new THREE.DirectionalLight('#FFFFFF', 2.2);
  key.position.set(-2, 3, 5);
  const rim = new THREE.DirectionalLight('#BEEFE6', 0.9);
  rim.position.set(3, -1, 2);
  scene.add(key, rim, new THREE.AmbientLight('#FFFFFF', 1.2));
  let group: THREE.Group | null = null,
    selected: string | null = null;
  let frame: number | null = null,
    disposed = false,
    rotation = -0.12;
  const raycaster = new THREE.Raycaster();
  const draw = () => {
    if (disposed) return;
    try {
      renderer.render(scene, camera);
      gl.endFrameEXP();
    } catch {
      stop();
      onFailure();
    }
  };
  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const animate = () => {
    stop();
    if (!group) return;
    if (reduced) {
      group.children.forEach((object) => {
        object.position.z =
          object.userData.key === selected ? 0.17 : object.userData.key ? 0 : -0.1;
      });
      draw();
      return;
    }
    let start: number | null = null,
      last = -Infinity;
    const tick = (time: number) => {
      if (disposed || !group) return;
      start ??= time;
      const elapsed = time - start;
      if (time - last >= 32 || elapsed >= 420) {
        group.children.forEach((object) => {
          if (object.userData.key) {
            const target = object.userData.key === selected ? 0.17 : 0;
            object.position.z += (target - object.position.z) * 0.32;
          }
        });
        last = time;
        draw();
      }
      frame = elapsed < 420 && !disposed ? requestAnimationFrame(tick) : null;
    };
    frame = requestAnimationFrame(tick);
  };
  return {
    update(segments, nextSelected, track) {
      if (disposed) return;
      if (group) {
        scene.remove(group);
        disposeRingGroup(group);
      }
      group = createRingGroup(segments, track);
      group.rotation.set(0.4, -0.14, rotation);
      scene.add(group);
      scene.background = new THREE.Color(track);
      selected = nextSelected;
      draw();
      animate();
    },
    rotate(value) {
      if (!group || disposed) return;
      rotation = Math.max(-1.1, Math.min(1.1, value));
      group.rotation.z = rotation;
      draw();
    },
    rotation: () => rotation,
    pick(x, y, width, height) {
      if (!group || disposed) return null;
      raycaster.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
      return (
        raycaster.intersectObjects(group.children).find((hit) => hit.object.userData.key)?.object
          .userData.key ?? null
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      if (group) disposeRingGroup(group);
      scene.clear();
      renderer.dispose();
    },
  };
}
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
  const latest = useRef({ segments, selected, track: c.card, onSelect });
  const width = useRef(230),
    dragged = useRef(false),
    baseRotation = useRef(0);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => { latest.current.onSelect = onSelect; }, [onSelect]);
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
  useEffect(
    () => () => {
      runtime.current?.dispose();
      runtime.current = null;
    },
    [active]
  );
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderGrant: () => {
          dragged.current = true;
          baseRotation.current = runtime.current?.rotation() ?? 0;
        },
        onPanResponderMove: (_, gesture) =>
          runtime.current?.rotate(baseRotation.current + gesture.dx * 0.005),
      }),
    []
  );
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
      {...responder.panHandlers}
      onTouchStart={() => {
        dragged.current = false;
      }}
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
          style={{ position: 'absolute', inset: 0 }}
          msaaSamples={2}
          onContextCreate={(gl) => {
            if (!mounted.current) return;
            try {
              runtime.current?.dispose();
              runtime.current = makeRuntime(gl, reduced, fail);
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
