// Pipeline probe: a satin rounded box and an emissive ring (bloom check).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Preview, SceneContext, SceneModule } from './types.ts'

export const preview: Preview = { camera: [4, 3, 5], target: [0, 0.8, 0] }

export function create(_ctx: SceneContext): SceneModule {
  const group = new THREE.Group()
  const box = new THREE.Mesh(
    new RoundedBoxGeometry(1.6, 1.6, 1.6, 6, 0.25),
    new THREE.MeshPhysicalMaterial({ color: '#f2efe9', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
  )
  box.position.y = 0.8
  box.castShadow = true
  group.add(box)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.03, 16, 128),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#d7ff3a').multiplyScalar(3) }),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.05
  group.add(ring)
  return {
    object: group,
    update: ({ time }) => {
      box.rotation.y = time * 0.5
    },
  }
}
