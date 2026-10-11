// Contract between the scroll director and every 3D module.
import type * as THREE from 'three'
import type { Quality } from '../core/quality.ts'

export interface SceneContext {
  quality: Quality
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  envMap: THREE.Texture
}

export interface Frame {
  /** Seconds since start, and seconds since the previous frame. */
  time: number
  dt: number
}

export interface SceneModule {
  object: THREE.Object3D
  update?(frame: Frame): void
  dispose?(): void
}

/** Optional framing hint a module exports for the playground. */
export interface Preview {
  camera: [number, number, number]
  target: [number, number, number]
  /** Clock hour used by the playground lighting rig (default 15). */
  hour?: number
}
