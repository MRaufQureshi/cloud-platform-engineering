// Dev-only harness: renders one scene module in isolation for visual checks.
// /playground.html?m=<module>&hour=21&cam=x,y,z&target=x,y,z&spin=1&q=high
import * as THREE from 'three'
import { detectQuality } from './core/quality.ts'
import { World } from './core/world.ts'
import type { Preview, SceneContext, SceneModule } from './scene/types.ts'

type ModuleExports = {
  create: (ctx: SceneContext) => SceneModule | Promise<SceneModule>
  preview?: Preview
  /** Optional: apply URL parameters to the created module (playground only). */
  configure?: (mod: never, params: URLSearchParams) => void
  /** Modules that bring their own sky and lights skip the studio rig. */
  ownsLighting?: boolean
}

const modules = import.meta.glob<ModuleExports>('./scene/*.ts')
const params = new URLSearchParams(location.search)
const name = params.get('m') ?? '_probe'
const hud = document.getElementById('hud') as HTMLElement
const vec = (s: string | null): [number, number, number] | null => {
  if (!s) return null
  const p = s.split(',').map(Number)
  return p.length === 3 && p.every(Number.isFinite) ? [p[0], p[1], p[2]] : null
}

function addStudioRig(world: World, quality: ReturnType<typeof detectQuality>, hour: number, params: URLSearchParams) {
  // look=dark: product shot on the DESIGN.md background with a teal rim light.
  const look = params.get('look') ?? 'day'
  const night = hour < 6 || hour > 20
  const dark = look === 'dark'
  world.scene.background = new THREE.Color(dark ? '#080C16' : night ? '#0d1220' : '#c3ccd6')
  world.scene.environmentIntensity = dark ? 0.35 : night ? 0.15 : 0.55
  const hemi = new THREE.HemisphereLight(night || dark ? '#33416b' : '#ffffff', night || dark ? '#05070c' : '#9c8f7c', dark ? 0.35 : night ? 0.25 : 0.6)
  world.scene.add(hemi)
  if (dark) {
    const rim = new THREE.DirectionalLight('#5EEAD4', 1.2)
    rim.position.set(-10, 6, -12)
    world.scene.add(rim)
  }
  const sun = new THREE.DirectionalLight(night ? '#8fa6ff' : '#fff1dc', dark ? 2.0 : night ? 0.35 : 1.7)
  sun.position.set(12, 18, 8)
  sun.castShadow = quality.shadows
  sun.shadow.mapSize.setScalar(quality.shadowMapSize)
  sun.shadow.camera.left = -20
  sun.shadow.camera.right = 20
  sun.shadow.camera.top = 20
  sun.shadow.camera.bottom = -20
  sun.shadow.bias = -0.0004
  world.scene.add(sun)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.18 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  world.scene.add(ground)
}

async function main() {
  const quality = detectQuality()
  const world = new World(document.getElementById('gl') as HTMLCanvasElement, quality)
  const loader = modules[`./scene/${name}.ts`]
  if (!loader) throw new Error(`No scene module "${name}". Available: ${Object.keys(modules).join(', ')}`)
  const mod = await loader()
  const preview: Preview = mod.preview ?? { camera: [8, 5, 10], target: [0, 1, 0] }
  const hour = Number(params.get('hour') ?? preview.hour ?? 15)

  const ctx: SceneContext = { quality, renderer: world.renderer, scene: world.scene, camera: world.camera, envMap: world.envMap }
  if (!mod.ownsLighting) addStudioRig(world, quality, hour, params)

  const scene = await mod.create(ctx)
  world.scene.add(scene.object)
  mod.configure?.(scene as never, params)

  const cam = vec(params.get('cam')) ?? preview.camera
  const target = new THREE.Vector3(...(vec(params.get('target')) ?? preview.target))
  world.camera.position.set(...cam)
  world.camera.lookAt(target)
  const spin = params.has('spin')
  const radius = Math.hypot(cam[0] - target.x, cam[2] - target.z)
  const base = Math.atan2(cam[0] - target.x, cam[2] - target.z)

  world.onTick((time, dt) => {
    scene.update?.({ time, dt })
    if (spin) {
      const a = base + time * 0.4
      world.camera.position.set(target.x + Math.sin(a) * radius, cam[1], target.z + Math.cos(a) * radius)
      world.camera.lookAt(target)
    }
  })
  world.start()
  hud.textContent = `${name} · tier ${quality.tier} · hour ${hour}`
  // Let a few frames render (shader compile, shadows) before screenshots.
  let frames = 0
  world.onTick(() => {
    if (++frames === 20) (window as unknown as { __ready: boolean }).__ready = true
  })
}

main().catch((err) => {
  hud.textContent = String(err)
  console.error(err)
  ;(window as unknown as { __ready: boolean }).__ready = true
})
