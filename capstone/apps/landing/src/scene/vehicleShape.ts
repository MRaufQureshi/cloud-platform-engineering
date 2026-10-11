// One car profile for the whole site. The hero car (scene/car.ts) extrudes it with deep bevels;
// instanced fleets (scene/factory.ts) use `createFleetCar`, a low-poly build of the same silhouette:
// sloped bonnet and tail, a tapered glass cabin with body-coloured roof and pillars, four wheels
// in real arches and light bars at both ends.
// Units are metres; +X is forward, the car sits on y = 0 and is centred on x and z.
import * as THREE from 'three'
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'

export const WIDTH = 1.92
export const WHEEL_X = 1.45
export const WHEEL_R = 0.37
export const TIRE_W = 0.26
export const ARCH_R = 0.445
export const SILL = 0.33

export function bodyShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(2.18, SILL)
  s.bezierCurveTo(2.32, SILL + 0.02, 2.37, 0.5, 2.31, 0.62) // nose
  s.bezierCurveTo(2.1, 0.78, 1.62, 0.9, 1.2, 0.935) // short bonnet up to the cowl
  s.lineTo(-1.75, 1.04) // rising beltline
  s.bezierCurveTo(-2.15, 1.06, -2.35, 0.93, -2.34, 0.7) // tail
  s.bezierCurveTo(-2.34, 0.48, -2.27, SILL + 0.02, -2.14, SILL) // rear face
  s.lineTo(-WHEEL_X - ARCH_R, SILL)
  s.absarc(-WHEEL_X, SILL, ARCH_R, Math.PI, 0, true)
  s.lineTo(WHEEL_X - ARCH_R, SILL)
  s.absarc(WHEEL_X, SILL, ARCH_R, Math.PI, 0, true)
  s.lineTo(2.18, SILL)
  return s
}

export function canopyShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(1.24, 0.88)
  s.bezierCurveTo(0.86, 1.11, 0.56, 1.41, 0.12, 1.48) // raked windscreen
  s.bezierCurveTo(-0.35, 1.53, -0.85, 1.5, -1.25, 1.4) // roof
  s.bezierCurveTo(-1.6, 1.29, -1.95, 1.13, -2.16, 1.02) // fastback glass
  s.lineTo(1.24, 0.88)
  return s
}

// ---- low-poly fleet car ------------------------------------------------------------------

export interface FleetCarGeometry {
  /** Body, roof and pillars. No colour attribute: tint it per instance with `setColorAt`. */
  paint: THREE.BufferGeometry
  /** Glass, wheels and lamps with fixed vertex colours. `aGlow` > 0 marks lamps (see `enableLampGlow`). */
  detail: THREE.BufferGeometry
}

const FLEET_SCALE = 0.97

/** Extruded profile with a small rounded edge and smooth shading across gentle angles. */
function solid(shape: THREE.Shape, width: number, round: number, inset: number): THREE.BufferGeometry {
  const depth = width - 2 * round
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: round,
    bevelSize: inset,
    bevelOffset: -inset,
    bevelSegments: 2,
    curveSegments: 10,
  })
  g.translate(0, 0, -depth / 2)
  return toCreasedNormals(g, Math.PI / 4)
}

/** A box rotated about z (so it can follow a window edge) and moved into place. */
function bar(w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  g.rotateZ(rotZ)
  g.translate(x, y, z)
  return g
}

/** A cylinder whose axis lies along z, centred at (x, y, z). */
function wheelPart(radius: number, length: number, x: number, y: number, z: number, segments = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments).toNonIndexed()
  g.rotateX(Math.PI / 2)
  g.translate(x, y, z)
  return g
}

function dye(g: THREE.BufferGeometry, color: string, glow = 0): THREE.BufferGeometry {
  const n = g.attributes.position.count
  const c = new THREE.Color(color)
  const col = new Float32Array(n * 3)
  const gl = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    c.toArray(col, i * 3)
    gl[i] = glow
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1))
  return g
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) p.deleteAttribute('uv')
  const g = mergeGeometries(parts) as THREE.BufferGeometry
  g.scale(FLEET_SCALE, FLEET_SCALE, FLEET_SCALE)
  g.computeBoundingSphere()
  return g
}

/** Low-poly (~3 k triangles) car for InstancedMesh fleets, sharing the hero car's silhouette. */
export function createFleetCar(): FleetCarGeometry {
  // Paint: body, a roof lid just wider than the glass, and the A, B and C pillars on both sides.
  const body = solid(bodyShape(), WIDTH, 0.12, 0.07)
  const roof = new THREE.Shape()
  roof.moveTo(0.12, 1.492)
  roof.bezierCurveTo(-0.35, 1.542, -0.85, 1.512, -1.25, 1.412)
  roof.lineTo(-1.25, 1.35)
  roof.bezierCurveTo(-0.85, 1.45, -0.35, 1.48, 0.12, 1.43)
  roof.closePath()
  const paint: THREE.BufferGeometry[] = [body, solid(roof, 1.58, 0.04, 0.02)]
  for (const side of [-1, 1]) {
    const z = side * 0.795
    paint.push(bar(1.27, 0.06, 0.07, 0.68, 1.18, z, Math.atan2(0.6, -1.12))) // A: windscreen edge
    paint.push(bar(0.07, 0.53, 0.06, -0.2, 1.245, z)) // B
    paint.push(bar(0.99, 0.06, 0.07, -1.705, 1.21, z, Math.atan2(-0.38, -0.91))) // C: fastback edge
  }

  // Detail: tinted glass cabin, dark wheel wells, tyres with silver discs, light bars.
  const detail: THREE.BufferGeometry[] = [dye(solid(canopyShape(), 1.56, 0.1, 0.06), '#0e1520')]
  const half = new THREE.Shape()
  half.absarc(0, 0, ARCH_R - 0.015, 0, Math.PI, false)
  half.closePath()
  for (const x of [-WHEEL_X, WHEEL_X]) {
    const well = new THREE.ExtrudeGeometry(half, { depth: 1.5, bevelEnabled: false, curveSegments: 12 })
    well.translate(x, SILL, -0.75)
    detail.push(dye(toCreasedNormals(well, Math.PI / 4), '#07090c'))
    for (const side of [-1, 1]) {
      const zc = side * (WIDTH / 2 - TIRE_W / 2 - 0.005)
      detail.push(dye(wheelPart(WHEEL_R, TIRE_W, x, WHEEL_R, zc), '#14171b'))
      detail.push(dye(wheelPart(0.235, 0.03, x, WHEEL_R, side * (WIDTH / 2 + 0.003)), '#aab1ba'))
    }
  }
  detail.push(dye(bar(0.05, 0.05, 1.3, 2.3, 0.66, 0), '#e8f4ff', 1.4)) // head light bar
  detail.push(dye(bar(0.05, 0.06, 1.34, -2.335, 0.8, 0), '#ff3b5c', 1.3)) // tail light bar

  return { paint: merge(paint), detail: merge(detail) }
}

/**
 * Lets a vertex-coloured MeshStandardMaterial shine where `aGlow` > 0: the vertex colour is added
 * as emissive light, scaled by aGlow. Keep the product below the bloom threshold (about 2.4) unless
 * the part really is a light that should bloom.
 */
export function enableLampGlow(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGlow = aGlow;')
    shader.fragmentShader = 'varying float vGlow;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * vGlow;')
  }
}
