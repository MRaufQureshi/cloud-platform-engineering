// Vehicle-to-factory district, modelled on the case study in Bayer et al. (AMCIS 2023):
// a medium-sized manufacturer with rooftop PV, five flexible production loads and a car
// park of 20 EVs — 10 company cars that charge both ways and 10 private cars that only
// charge — on 20 chargers (11, 22 and 150 kW). Local origin = centre of the hall.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { palette } from '../core/palette.ts'
import type { Frame, Preview, SceneContext, SceneModule } from './types.ts'
import { createFleetCar, enableLampGlow } from './vehicleShape.ts'

export const preview: Preview = { camera: [95, 70, 120], target: [0, 4, 20], hour: 15 }

export type FleetMode = 'idle' | 'charging' | 'discharging'

export interface Factory extends SceneModule {
  setNight(t: number): void
  /** Production intensity 0–1 (glazing glow, machine hum). */
  setActivity(t: number): void
  /** Company (bidirectional) fleet state; private cars only ever charge. */
  setFleetMode(mode: FleetMode): void
  /** Power level 0–1 for each of the five flexible loads. */
  setFlexLoads(levels: number[]): void
  /** World-space anchors for labels/flows. */
  readonly anchors: { hall: THREE.Vector3; fleet: THREE.Vector3; pv: THREE.Vector3 }
}

const HALL_W = 80
const HALL_D = 46
const WALL_H = 10
const TEETH = 6
const TOOTH = HALL_W / TEETH
const TOOTH_H = 4.6

export function create(_ctx: SceneContext): Factory {
  const root = new THREE.Group()
  root.name = 'factory'

  const cladding = new THREE.MeshStandardMaterial({ color: '#aeb5be', roughness: 0.6, metalness: 0.35 })
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.55, metalness: 0.5 })
  const concrete = new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.95 })
  const asphalt = new THREE.MeshStandardMaterial({ color: '#25282d', roughness: 0.95 })
  const glazing = new THREE.MeshPhysicalMaterial({ color: '#16202c', roughness: 0.1, metalness: 0.3, emissive: '#ffcf8f', emissiveIntensity: 0.02 })

  // Apron and car park
  const apron = new THREE.Mesh(new THREE.BoxGeometry(HALL_W + 50, 0.2, HALL_D + 80), concrete)
  apron.position.set(0, -0.1, 18)
  apron.receiveShadow = true
  root.add(apron)
  const lot = new THREE.Mesh(new THREE.BoxGeometry(72, 0.22, 26), asphalt)
  lot.position.set(0, -0.08, HALL_D / 2 + 22)
  lot.receiveShadow = true
  root.add(lot)

  // Hall body
  const body = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, WALL_H, HALL_D), cladding)
  body.position.y = WALL_H / 2
  body.castShadow = true
  body.receiveShadow = true
  root.add(body)
  {
    // vertical ribs on the long facade
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, WALL_H - 0.4, 0.25), darkMetal.clone(), 60) // own material: instanced and plain meshes need different programs
    const m = new THREE.Matrix4()
    for (let i = 0; i < 60; i++) {
      m.makeTranslation(-HALL_W / 2 + 0.7 + i * ((HALL_W - 1.4) / 59), WALL_H / 2, HALL_D / 2 + 0.1)
      ribs.setMatrixAt(i, m)
    }
    root.add(ribs)
  }

  // Sawtooth roof: sloped faces carry PV (south, +z), vertical faces glazed (north light)
  const toothGeo = (() => {
    const s = new THREE.Shape()
    s.moveTo(-TOOTH / 2, 0)
    s.lineTo(TOOTH / 2, 0)
    s.lineTo(TOOTH / 2, TOOTH_H)
    s.lineTo(-TOOTH / 2, 0)
    const g = new THREE.ExtrudeGeometry(s, { depth: HALL_D, bevelEnabled: false })
    g.translate(0, 0, -HALL_D / 2)
    return g
  })()
  const slope = Math.atan2(TOOTH_H, TOOTH)
  const slopeLen = Math.hypot(TOOTH, TOOTH_H)
  // One PV sheet per slope; a shader draws the module grid (1.1 m x 1.95 m modules).
  // polygonOffset pulls the sheets towards the camera so they never z-fight the roof face below them at long range.
  const pvSheetMat = new THREE.MeshPhysicalMaterial({ color: '#0c1830', roughness: 0.3, metalness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.12, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  pvSheetMat.defines = { USE_UV: '' }
  pvSheetMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec2 g = vUv * vec2(${(slopeLen - 1.2) / 1.15}, ${(HALL_D - 2) / 1.95});
        vec2 f = abs(fract(g) - 0.5);
        float density = max(max(fwidth(g.x), fwidth(g.y)), 1e-4);
        float line = 1.0 - smoothstep(0.44 - density, 0.48, max(f.x, f.y));
        // Once a module is only a few pixels wide the grid is above what the screen can resolve and swims
        // as the camera moves: fade it to its average tone (about 90 % of each module is lit).
        line = mix(0.9, line, 1.0 - smoothstep(0.05, 0.2, density));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.55, 0.62), line * 0.6);
      }`,
    )
  }
  const pvSheetGeo = new THREE.PlaneGeometry(slopeLen - 1.2, HALL_D - 2)
  for (let t = 0; t < TEETH; t++) {
    const x = -HALL_W / 2 + TOOTH / 2 + t * TOOTH
    const tooth = new THREE.Mesh(toothGeo, cladding)
    tooth.position.set(x, WALL_H, 0)
    tooth.castShadow = true
    root.add(tooth)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(HALL_D - 1, TOOTH_H - 0.6), glazing)
    glass.position.set(x + TOOTH / 2 + 0.02, WALL_H + TOOTH_H / 2, 0)
    glass.rotation.y = Math.PI / 2
    root.add(glass)
    const sheet = new THREE.Mesh(pvSheetGeo, pvSheetMat)
    sheet.rotateZ(slope)
    sheet.rotateX(-Math.PI / 2)
    sheet.position.set(x, WALL_H + TOOTH_H / 2 + 0.08, 0)
    sheet.receiveShadow = true
    root.add(sheet)
  }

  // Loading docks and an office block with a glass front
  for (let i = 0; i < 4; i++) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.6, 0.3), darkMetal)
    dock.position.set(-30 + i * 6.5, 2.3, HALL_D / 2 + 0.2)
    root.add(dock)
  }
  const office = new THREE.Mesh(new RoundedBoxGeometry(22, 8, 12, 2, 0.3), new THREE.MeshStandardMaterial({ color: '#d9d4cc', roughness: 0.8 }))
  office.position.set(HALL_W / 2 - 8, 4, HALL_D / 2 + 6)
  office.castShadow = true
  root.add(office)
  const officeGlass = new THREE.Mesh(new THREE.PlaneGeometry(20, 5.6), glazing)
  officeGlass.position.set(HALL_W / 2 - 8, 4.2, HALL_D / 2 + 12.02)
  root.add(officeGlass)
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 26, 16), new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.5 }))
  stack.position.set(-HALL_W / 2 + 6, 13, -HALL_D / 2 + 6)
  root.add(stack)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.peak).multiplyScalar(3) }))
  beacon.position.set(-HALL_W / 2 + 6, 26.3, -HALL_D / 2 + 6)
  root.add(beacon)

  // Five flexible loads in the yard (compressors / chillers / furnaces) with level bars
  const flexLevels = [0.6, 0.6, 0.6, 0.6, 0.6]
  const flexBars: THREE.Mesh[] = []
  const flexBarMats: THREE.MeshBasicMaterial[] = []
  for (let i = 0; i < 5; i++) {
    const unit = new THREE.Mesh(new RoundedBoxGeometry(6, 4.4, 5, 3, 0.5), darkMetal)
    unit.position.set(HALL_W / 2 + 9, 2.2, -HALL_D / 2 + 5 + i * 8.2)
    unit.castShadow = true
    root.add(unit)
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), new THREE.MeshBasicMaterial({ color: '#0f141c' }))
    track.position.set(unit.position.x + 3.05, 2.2, unit.position.z)
    root.add(track)
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.energy).multiplyScalar(2.6) })
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1, 0.34), mat)
    bar.position.set(unit.position.x + 3.1, 0.5, unit.position.z)
    root.add(bar)
    flexBars.push(bar)
    flexBarMats.push(mat)
  }

  // Car park: 20 bays in two rows. Even bays = company cars (bidirectional).
  // Two instanced meshes share one matrix per car: tinted paint, and fixed-colour glass, wheels and lamps.
  const fleetCar = createFleetCar()
  const cars = new THREE.InstancedMesh(fleetCar.paint, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0.12 }), 20)
  const carDetail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.3 })
  enableLampGlow(carDetail)
  const carParts = new THREE.InstancedMesh(fleetCar.detail, carDetail, 20)
  const chargerMat = new THREE.MeshStandardMaterial({ color: '#1d222a', roughness: 0.4, metalness: 0.4 })
  const haloGeo = new THREE.RingGeometry(1.9, 2.25, 48)
  const companyHalo = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.energy).multiplyScalar(2.4), transparent: true, opacity: 0.9, depthWrite: false })
  const privateHalo = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7a8494').multiplyScalar(1.4), transparent: true, opacity: 0.6, depthWrite: false })
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const tint = new THREE.Color()
  const paints = ['#e9ecef', '#9ea6b0', '#3a414b', '#2f4462', '#c9cdd3']
  for (let i = 0; i < 20; i++) {
    const row = i < 10 ? 0 : 1
    const col = i % 10
    const x = -30 + col * 6.6
    const z = HALL_D / 2 + 14 + row * 15
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), row === 0 ? Math.PI / 2 : -Math.PI / 2)
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1))
    cars.setMatrixAt(i, m)
    carParts.setMatrixAt(i, m)
    cars.setColorAt(i, tint.set(paints[(i * 7) % paints.length]))
    const fast = col >= 8 // 4 × 150 kW
    const charger = new THREE.Mesh(new RoundedBoxGeometry(fast ? 0.9 : 0.45, fast ? 2.4 : 1.5, fast ? 0.7 : 0.35, 2, 0.08), chargerMat)
    charger.position.set(x, fast ? 1.2 : 0.75, z + (row === 0 ? -3.4 : 3.4))
    root.add(charger)
    const halo = new THREE.Mesh(haloGeo, i % 2 === 0 ? companyHalo : privateHalo)
    halo.rotation.x = -Math.PI / 2
    halo.position.set(x, 0.08, z)
    root.add(halo)
  }
  cars.castShadow = true
  carParts.castShadow = true
  root.add(cars, carParts)

  // Lot markings
  {
    const lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 5.4), new THREE.MeshBasicMaterial({ color: '#cfd3d9' }), 22)
    for (let i = 0; i < 22; i++) {
      const row = i < 11 ? 0 : 1
      m.makeTranslation(-33.3 + (i % 11) * 6.6, 0.05, HALL_D / 2 + 14 + row * 15)
      lines.setMatrixAt(i, m)
    }
    root.add(lines)
  }

  let fleet: FleetMode = 'idle'
  const setFleetMode = (mode: FleetMode) => {
    fleet = mode
    // Teal: energy leaving the cars. Indigo: energy drawn from the grid. Amber is only ever the sun.
    companyHalo.color.set(mode === 'charging' ? palette.grid : palette.energy).multiplyScalar(2.4)
  }

  return {
    object: root,
    anchors: {
      hall: new THREE.Vector3(0, WALL_H + TOOTH_H + 4, 0),
      fleet: new THREE.Vector3(0, 3, HALL_D / 2 + 21),
      pv: new THREE.Vector3(0, WALL_H + TOOTH_H + 2, -6),
    },
    setNight(t) {
      glazing.emissiveIntensity = 0.02 + t * 0.95
    },
    setActivity(t) {
      glazing.emissive.set('#ffd9a0').lerp(new THREE.Color('#ffb066'), t)
    },
    setFleetMode,
    setFlexLoads(levels) {
      for (let i = 0; i < 5; i++) flexLevels[i] = THREE.MathUtils.clamp(levels[i] ?? 0, 0, 1)
    },
    update({ time, dt }: Frame) {
      const k = 1 - Math.exp(-dt * 5)
      for (let i = 0; i < 5; i++) {
        const bar = flexBars[i]
        const h = 0.1 + flexLevels[i] * 3.2
        bar.scale.y += (h - bar.scale.y) * k
        bar.position.y = 0.5 + bar.scale.y / 2
        // Reduced load (flexibility offered to the grid) is teal; raised load stays neutral.
        flexBarMats[i].color.set(flexLevels[i] < 0.45 ? palette.energy : flexLevels[i] > 0.75 ? '#f8fafc' : '#cbd5e1').multiplyScalar(2.4)
      }
      const pulse = fleet === 'idle' ? 0.6 : 0.75 + 0.25 * Math.sin(time * 4)
      companyHalo.opacity = pulse
      beacon.visible = Math.sin(time * 3) > 0
    },
  }
}

/** Playground: &night=1 &fleet=discharging &flex=0.2,0.9,0.5,0.1,0.7 */
export function configure(f: Factory, p: URLSearchParams): void {
  f.setNight(Number(p.get('night') ?? 0))
  const fleet = p.get('fleet')
  if (fleet === 'charging' || fleet === 'discharging' || fleet === 'idle') f.setFleetMode(fleet)
  if (p.has('flex')) f.setFlexLoads((p.get('flex') as string).split(',').map(Number))
}
