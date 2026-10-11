// Composition probe: house + parked car under the day/night rig.
import * as THREE from 'three'
import type { Preview, SceneContext, SceneModule } from './types.ts'
import { create as createHouse, type House } from './house.ts'
import { create as createCar, type Car } from './car.ts'
import { create as createSky, type Sky } from './sky.ts'
import { create as createFlows, type Flows, type FlowId } from './flows.ts'

export const preview: Preview = { camera: [17, 7.5, 21], target: [2.5, 2.2, 1.5], hour: 15 }
export const ownsLighting = true

interface Home extends SceneModule {
  house: House
  car: Car
  sky: Sky
  flows: Flows
}

export function create(ctx: SceneContext): Home {
  const group = new THREE.Group()
  const sky = createSky(ctx)
  const house = createHouse(ctx)
  const car = createCar(ctx)
  const flows = createFlows(ctx)
  group.add(sky.object, house.object, flows.object)
  house.parking.add(car.object)
  sky.setShadowFocus(new THREE.Vector3(1, 0, 2), 16)
  return {
    object: group,
    house,
    car,
    sky,
    flows,
    update(f) {
      sky.update?.(f)
      house.update?.(f)
      car.update?.(f)
      flows.update?.(f)
    },
  }
}

export function configure(m: Home, p: URLSearchParams): void {
  const hour = Number(p.get('hour') ?? preview.hour)
  m.sky.setHour(hour)
  const night = 1 - m.sky.daylight
  m.house.setNight(night)
  m.house.setSolar(m.sky.daylight)
  m.car.setLights(night)
  if (p.has('mode')) m.car.setMode(p.get('mode') as 'charging')
  for (const part of (p.get('flows') ?? '').split(',').filter(Boolean)) {
    const [id, kw] = part.split(':')
    m.flows.setFlow(id as FlowId, Number(kw))
  }
}
