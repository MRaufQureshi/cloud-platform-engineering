// Fleet board for the depot chapter: one row per vehicle with its battery (and the minimum
// it never goes below), departure time, what the rules decided this hour and why. Driven by
// the corrected fleet engine (src/sim/fleet.ts); the chapter feeds it the simulated hour.
import { FLEET, sampleFleet, simulateFleet, type FleetAction, type FleetResult } from '../sim/fleet.ts'

const BADGES: Record<FleetAction, { icon: string; label: string }> = {
  charge: { icon: '↑', label: 'Charging' },
  discharge: { icon: '↓', label: 'Lending' },
  hold: { icon: '—', label: 'Holding' },
  away: { icon: '→', label: 'On the road' },
}

const KIND_LABEL = { van: 'Van', truck: 'Truck', car: 'Car' } as const

export interface FleetBoard {
  /** Window hour, 18 (18:00) … 34 (10:00 next day). */
  setHour(h: number): void
  readonly result: FleetResult
}

export function createFleetBoard(root: HTMLElement): FleetBoard {
  const result = simulateFleet()
  root.innerHTML = `
    <div class="fleet-board">
      <div class="fleet-head">
        <p class="fleet-clock"><span data-f="clock">18:00</span><span class="fleet-tier" data-f="tier"><span class="tier-long" data-f="tierLong">Off-peak</span><span class="tier-short" data-f="tierShort" aria-hidden="true">Off</span></span></p>
        <dl class="fleet-totals">
          <div><dt>Charged</dt><dd><span data-f="charged">0</span> kWh</dd></div>
          <div><dt>Lent to the grid</dt><dd><span data-f="lent">0</span> kWh</dd></div>
        </dl>
        <ul class="fleet-legend" aria-hidden="true">
          <li><span class="dot dot-grid"></span>Charging</li>
          <li><span class="dot dot-energy"></span>Lending</li>
          <li><span class="fleet-legend-min"></span>Minimum</li>
        </ul>
      </div>
      <ol class="fleet-cards" aria-label="Depot vehicles">
        ${FLEET.map(
          (v, i) => `
          <li class="fleet-card" data-row="${i}">
            <p class="fleet-card-top"><span class="fleet-name">${v.name}</span><span class="fleet-leaves mono" title="Departure">↦ ${String(v.departHour).padStart(2, '0')}:00</span></p>
            <p class="fleet-kind">${KIND_LABEL[v.kind]} · ${v.capacityKwh} kWh · min ${Math.round(v.minSoc * 100)}%</p>
            <p class="fleet-batt">
              <span class="fleet-bar" style="--min:${v.minSoc}" aria-hidden="true"><span class="fleet-fill"></span><span class="fleet-min"></span></span>
              <span class="fleet-soc mono">0%</span>
            </p>
            <p class="fleet-now"><span class="fleet-badge"><span aria-hidden="true" class="fleet-icon"></span><span class="fleet-action"></span></span></p>
            <p class="fleet-reason"></p>
          </li>`,
        ).join('')}
      </ol>
    </div>`

  const q = (k: string) => root.querySelector(`[data-f="${k}"]`) as HTMLElement
  const clock = q('clock')
  const tier = q('tier')
  const tierLong = q('tierLong')
  const tierShort = q('tierShort')
  const charged = q('charged')
  const lent = q('lent')
  const rows = [...root.querySelectorAll<HTMLLIElement>('.fleet-card')].map((tr) => ({
    tr,
    fill: tr.querySelector('.fleet-fill') as HTMLElement,
    soc: tr.querySelector('.fleet-soc') as HTMLElement,
    icon: tr.querySelector('.fleet-icon') as HTMLElement,
    action: tr.querySelector('.fleet-action') as HTMLElement,
    reason: tr.querySelector('.fleet-reason') as HTMLElement,
    last: '' as string,
  }))

  let lastKey = ''
  const setHour = (h: number) => {
    const snap = sampleFleet(result, h)
    const key = `${snap.clock}|${snap.vehicles.map((v) => Math.round(v.soc * 200)).join(',')}`
    if (key === lastKey) return
    lastKey = key
    clock.textContent = snap.clock
    tierLong.textContent = snap.tier === 'critical' ? 'Grid at peak' : snap.tier === 'mid-peak' ? 'Mid-peak' : 'Off-peak'
    tierShort.textContent = snap.tier === 'critical' ? 'Peak' : snap.tier === 'mid-peak' ? 'Mid' : 'Off'
    tier.dataset.tier = snap.tier
    charged.textContent = String(Math.round(snap.chargedKwh))
    lent.textContent = String(Math.round(snap.lentKwh))
    snap.vehicles.forEach((v, i) => {
      const row = rows[i]
      row.fill.style.width = `${(v.soc * 100).toFixed(1)}%`
      row.soc.textContent = `${Math.round(v.soc * 100)}%`
      if (row.last !== v.action + v.reason) {
        row.last = v.action + v.reason
        row.tr.dataset.action = v.action
        row.icon.textContent = BADGES[v.action].icon
        row.action.textContent = BADGES[v.action].label
        const dep = result.departures[i]
        row.reason.textContent =
          v.action === 'away' && dep.at !== null ? `Left at ${String(dep.at % 24).padStart(2, '0')}:00 with ${Math.round(dep.soc * 100)}%` : v.reason
      }
    })
  }
  setHour(18)
  return { setHour, result }
}
