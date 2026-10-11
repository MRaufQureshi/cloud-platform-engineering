// A dark studio for image-based lighting: a near-black room with a few soft light panels.
// Gives paint and glass crisp, moody reflections that suit the dark site instead of the
// bright neutral room that RoomEnvironment produces.
import * as THREE from 'three'

export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene()
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshBasicMaterial({ color: '#0b111c', side: THREE.BackSide }),
  )
  room.position.y = 6
  scene.add(room)

  // Horizon band: a faint cool gradient so reflections read as an exterior at dusk.
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(19.5, 19.5, 3, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#2a3a55').multiplyScalar(1.2), side: THREE.BackSide }),
  )
  band.position.y = 1.2
  scene.add(band)

  const panel = (w: number, h: number, color: string, intensity: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    )
    m.position.set(...pos)
    m.lookAt(...look)
    scene.add(m)
  }
  panel(16, 6, '#ffffff', 2.6, [0, 15.5, 0], [0, 0, 0]) // overhead softbox
  panel(3, 12, '#fff3e4', 2.0, [-19, 7, 4], [0, 5, 0]) // warm key strip
  panel(3, 10, '#e8f1ff', 1.4, [19, 6, -6], [0, 5, 0]) // cool fill strip
  panel(10, 1.4, '#5eead4', 1.2, [0, 4, -19.5], [0, 4, 0]) // teal rim strip

  const pmrem = new THREE.PMREMGenerator(renderer)
  const tex = pmrem.fromScene(scene, 0.035).texture
  pmrem.dispose()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
  })
  return tex
}
