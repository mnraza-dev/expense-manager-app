import * as THREE from 'three';
import { ringArcs, type RingSegment } from '../../utils/chartData';
export function createRingGroup(segments: RingSegment[], trackColor: string) {
  const group = new THREE.Group();
  const track = new THREE.Mesh(
    new THREE.TorusGeometry(0.98, 0.2, 10, 72),
    new THREE.MeshPhongMaterial({ color: trackColor, shininess: 25 })
  );
  track.position.z = -0.1;
  group.add(track);
  for (const arc of ringArcs(segments)) {
    const gap = Math.min(0.045, (arc.end - arc.start) * 0.12);
    const start = arc.start + gap / 2,
      end = arc.end - gap / 2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1.2, start, end, false);
    shape.lineTo(0.75 * Math.cos(end), 0.75 * Math.sin(end));
    shape.absarc(0, 0, 0.75, end, start, true);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 36,
    });
    geometry.translate(0, 0, -0.11);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhongMaterial({ color: arc.color, shininess: 65, specular: '#C2E6DD' })
    );
    mesh.userData = { key: arc.key, fraction: arc.fraction };
    group.add(mesh);
  }
  return group;
}
export function disposeRingGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    }
  });
}
