// Fleet board for the depot chapter: one row per vehicle with its battery (and the minimum
// it never goes below), departure time, what the rules decided this hour and why. Driven by
// the corrected fleet engine (src/sim/fleet.ts); the chapter feeds it the simulated hour.
import { FLEET, sampleFleet, simulateFleet, type FleetAction, type FleetResult } from '../sim/fleet.ts'
import { fmt, onLangChange, t } from '../i18n/lang.ts'
import type { StringKey } from '../i18n/strings.ts'

const ICONS: Record<FleetAction, string> = { charge: '↑', discharge: '↓', hold: '—', away: '→' }

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
        <p class="fleet-clock"><span data-f="clock">18:00</span><span class="fleet-tier" data-f="tier"><span class="tier-long" data-f="tierLong"></span><span class="tier-short" data-f="tierShort" aria-hidden="true"></span></span></p>
        <dl class="fleet-totals">
          <div><dt data-t="fleet.charged">${t('fleet.charged')}</dt><dd><span data-f="charged">0</span> kWh</dd></div>
          <div><dt data-t="fleet.lent">${t('fleet.lent')}</dt><dd><span data-f="lent">0</span> kWh</dd></div>
        </dl>
        <ul class="fleet-legend" aria-hidden="true">
          <li><span class="dot dot-grid"></span><span data-t="fleet.legend.charging">${t('fleet.legend.charging')}</span></li>
          <li><span class="dot dot-energy"></span><span data-t="fleet.legend.lending">${t('fleet.legend.lending')}</span></li>
          <li><span class="fleet-legend-min"></span><span data-t="fleet.legend.min">${t('fleet.legend.min')}</span></li>
        </ul>
      </div>
      <ol class="fleet-cards" aria-label="${t('fleet.list.aria')}" data-t-attr="aria-label:fleet.list.aria">
        ${FLEET.map(
          (v, i) => `
          <li class="fleet-card" data-row="${i}">
            <p class="fleet-card-top"><span class="fleet-name" data-t="fleet.name.${v.id}">${t(`fleet.name.${v.id}` as StringKey)}</span><span class="fleet-leaves mono" title="${t('fleet.departure')}" data-t-attr="title:fleet.departure">↦ ${String(v.departHour).padStart(2, '0')}:00</span></p>
            <p class="fleet-kind"></p>
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
    kind: tr.querySelector('.fleet-kind') as HTMLElement,
    icon: tr.querySelector('.fleet-icon') as HTMLElement,
    action: tr.querySelector('.fleet-action') as HTMLElement,
    reason: tr.querySelector('.fleet-reason') as HTMLElement,
    last: '' as string,
  }))

  // The vehicle line (class · capacity · minimum) only changes with the language.
  const paintKinds = () =>
    FLEET.forEach((v, i) => {
      rows[i].kind.textContent = t('fleet.kindLine', {
        kind: t(`fleet.kind.${v.kind}`),
        capacity: v.capacityKwh,
        min: fmt.pct(Math.round(v.minSoc * 100)),
      })
    })
  paintKinds()

  let lastKey = ''
  let lastHour = 18
  const setHour = (h: number) => {
    lastHour = h
    const snap = sampleFleet(result, h)
    const key = `${snap.clock}|${snap.vehicles.map((v) => Math.round(v.soc * 200)).join(',')}`
    if (key === lastKey) return
    lastKey = key
    clock.textContent = snap.clock
    tierLong.textContent = t(`fleet.tier.${snap.tier}`)
    tierShort.textContent = t(`fleet.tierShort.${snap.tier}`)
    tier.dataset.tier = snap.tier
    charged.textContent = fmt.num(Math.round(snap.chargedKwh))
    lent.textContent = fmt.num(Math.round(snap.lentKwh))
    snap.vehicles.forEach((v, i) => {
      const row = rows[i]
      row.fill.style.width = `${(v.soc * 100).toFixed(1)}%`
      row.soc.textContent = fmt.pct(Math.round(v.soc * 100))
      if (row.last !== v.action + v.reason) {
        row.last = v.action + v.reason
        row.tr.dataset.action = v.action
        row.icon.textContent = ICONS[v.action]
        row.action.textContent = t(`fleet.action.${v.action}`)
        const dep = result.departures[i]
        row.reason.textContent =
          v.action === 'away' && dep.at !== null
            ? t('fleet.leftAt', { clock: `${String(dep.at % 24).padStart(2, '0')}:00`, pct: fmt.pct(Math.round(dep.soc * 100)) })
            : t(`fleet.reason.${v.reasonKey}`, v.reasonArgs)
      }
    })
  }
  // Everything shown is written again in the new language.
  onLangChange(() => {
    paintKinds()
    lastKey = ''
    for (const row of rows) row.last = ''
    setHour(lastHour)
  })
  setHour(18)
  return { setHour, result }
}
