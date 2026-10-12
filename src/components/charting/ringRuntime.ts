import type { ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import type { RingSegment } from '../../utils/chartData';
import { createRingGroup, disposeRingGroup } from './ringScene';
export interface RingRuntime {
  update(segments: RingSegment[], selected: string | null, track: string): void;
  rotate(value: number): void;
  rotation(): number;
  pick(x: number, y: number, width: number, height: number): string | null;
  dispose(): void;
}
export function createRingRuntime(
  gl: ExpoWebGLRenderingContext,
  reduced: boolean,
  onFailure: () => void,
  rendererFactory: (options: THREE.WebGLRendererParameters) => THREE.WebGLRenderer = (options) => new THREE.WebGLRenderer(options)
): RingRuntime {
  const canvas = gl.canvas ?? {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    style: {},
    addEventListener() {},
    removeEventListener() {},
  };
  const renderer = rendererFactory({
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
  let signature = '';
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
    if (disposed || !group) return;
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
      const nextSignature = JSON.stringify([segments, track]);
      if (nextSignature !== signature) {
        if (group) {
          scene.remove(group);
          disposeRingGroup(group);
        }
        group = createRingGroup(segments, track);
        group.rotation.set(0.4, -0.14, rotation);
        scene.add(group);
        scene.background = new THREE.Color(track);
        signature = nextSignature;
      }
      selected = nextSelected;
      draw();
      animate();
    },
    rotate(value) {
      if (!group || disposed) return;
      rotation = Math.max(-1.1, Math.min(1.1, value));
      group.rotation.z = rotation;
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null;
          draw();
        });
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
