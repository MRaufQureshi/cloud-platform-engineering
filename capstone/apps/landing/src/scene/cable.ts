// Charging cable from the wallbox to the car's charge port: a sagging tube rebuilt when the
// ends move, with pulses that travel in the direction energy flows (amber from the sun,
// indigo from the grid, teal when the car powers the home). `setPlugged` animates the plug
// between the wallbox (0) and the port (1).
import * as THREE from 'three'
import { palette } from '../core/palette.ts'
import type { Frame, SceneContext, SceneModule } from './types.ts'

export type CableFlow = 'none' | 'to-car' | 'to-home'

export interface Cable extends SceneModule {
  setEnds(wallbox: THREE.Vector3, port: THREE.Vector3): void
  setPlugged(t: number): void
  setFlow(flow: CableFlow, color: keyof typeof palette): void
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDir;
  uniform float uOn;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    vec3 base = vec3(0.05, 0.06, 0.07) + rim * 0.12;
    float d = fract(vUv.x * 6.0 - uTime * 1.6 * uDir);
    float pulse = smoothstep(0.0, 0.08, d) * smoothstep(0.35, 0.1, d);
    vec3 col = base + uColor * pulse * uOn * 3.2 + uColor * uOn * 0.25;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function create(_ctx: SceneContext): Cable {
  const uniforms = {
    uTime: { value: 0 },
    uDir: { value: 1 },
    uOn: { value: 0 },
    uColor: { value: new THREE.Color(palette.energy) },
  }
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG })
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
  mesh.castShadow = true
  mesh.frustumCulled = false
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 16), new THREE.MeshStandardMaterial({ color: '#1b1f25', roughness: 0.4 }))
  const group = new THREE.Group()
  group.add(mesh, plug)

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  let plugged = 1
  let on = 0
  let target = 0

  const rebuild = () => {
    const end = a.clone().lerp(b, plugged)
    const dist = a.distanceTo(end)
    const sag = Math.min(0.55, 0.12 + dist * 0.3)
    const mid = a.clone().lerp(end, 0.5)
    mid.y = Math.min(a.y, end.y) - sag
    const p1 = a.clone().lerp(mid, 0.5)
    p1.y = a.y - sag * 0.75
    const p2 = mid.clone().lerp(end, 0.5)
    p2.y = end.y - sag * 0.7
    const curve = new THREE.CatmullRomCurve3([a.clone(), p1, mid, p2, end])
    mesh.geometry.dispose()
    mesh.geometry = new THREE.TubeGeometry(curve, 40, 0.022, 8, false)
    plug.position.copy(end)
    const tangent = curve.getTangent(1)
    plug.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
    group.visible = plugged > 0.02
  }

  // Callers pass damped values that creep towards their targets forever; changes below
  // 0.1 mm (or 1e-4 of the plug travel) are invisible, so they don't rebuild the tube.
  return {
    object: group,
    setEnds(wallbox, port) {
      if (a.distanceToSquared(wallbox) < 1e-8 && b.distanceToSquared(port) < 1e-8) return
      a.copy(wallbox)
      b.copy(port)
      rebuild()
    },
    setPlugged(t) {
      const v = THREE.MathUtils.clamp(t, 0, 1)
      // Still land exactly on 0 and 1.
      if (v === plugged || (Math.abs(v - plugged) < 1e-4 && v > 0 && v < 1)) return
      plugged = v
      rebuild()
    },
    setFlow(flow, color) {
      target = flow === 'none' ? 0 : 1
      uniforms.uDir.value = flow === 'to-home' ? -1 : 1
      uniforms.uColor.value.set(palette[color])
    },
    update({ time, dt }: Frame) {
      uniforms.uTime.value = time
      on += (target * Math.min(plugged * 1.2, 1) - on) * (1 - Math.exp(-dt * 5))
      uniforms.uOn.value = on
    },
  }
}
