// Interactive savings simulator. Runs the household optimiser (src/sim/v2h.ts) for the
// visitor's inputs and shows, honestly split, what smart charging alone saves versus what
// vehicle-to-home adds — per year, plus the plan for one representative day.
//
// Cost control: the day chart redraws on every input (one DP solve), while the yearly figures
// (24 solves) wait for 150 ms of quiet and are memoised per input combination.
import { gsap } from 'gsap'
import { HOUSEHOLDS, householdLoad, MONTH_NAMES, PRICE_EUR_KWH, VEHICLES, type Season } from '../sim/model.ts'
import { planDay, planYear, type PlanInput, type HourFlow } from '../sim/v2h.ts'

interface Inputs {
  vehicle: string
  pvKwp: number
  household: string
  routine: 'commute' | 'parttime' | 'home'
  dailyKm: number
  season: Season
}

const ROUTINES = {
  commute: { label: 'Commute 8–17', depart: 8, back: 17 },
  parttime: { label: 'Part-time 8–13', depart: 8, back: 13 },
  // Mostly at home still makes a short trip, so the driving slider always counts.
  home: { label: 'Mostly at home (short trips)', depart: 10, back: 12 },
} as const

/** Wait this long after the last input before solving the 12 representative days. */
const YEAR_DEBOUNCE_MS = 150
/** …and this long more before a screen reader hears the final numbers, once. */
const STATUS_DELAY_MS = 250

interface YearSummary {
  smart: number
  v2h: number
  total: number
  months: number[]
}

const fmtEur = (v: number) => `€${Math.round(v).toLocaleString('en-GB')}`
const fmtCt = (v: number) => String(Math.round(v * 1000) / 10)

/** Footer number of a source (its place in `ol.sources`), so a citation can't drift from the list. */
function sourceNo(id: string, fallback: string): string {
  const li = document.getElementById(id)
  const list = li?.parentElement
  return li && list ? String([...list.children].indexOf(li) + 1) : fallback
}

export function initSimulator(reducedMotion: boolean): void {
  const root = document.getElementById('sim-root')
  if (!root) return
  const s: Inputs = { vehicle: 'sedan', pvKwp: 8, household: 'family', routine: 'parttime', dailyKm: 40, season: 'summer' }
  const agora = sourceNo('src-agora', '5')
  const eeg = sourceNo('src-eeg', '12')
  const tariffLo = fmtCt(Math.min(...PRICE_EUR_KWH))
  const tariffHi = fmtCt(Math.max(...PRICE_EUR_KWH))

  root.innerHTML = `
    <div class="sim">
      <form class="sim-controls" aria-label="Your situation" onsubmit="return false">
        <fieldset>
          <legend>Your car</legend>
          <div class="chips" role="radiogroup" aria-label="Car class">
            ${VEHICLES.map((v) => `<label class="chip"><input type="radio" name="vehicle" value="${v.id}" ${v.id === s.vehicle ? 'checked' : ''}/><span>${v.label}<small>${v.batteryKwh} kWh</small></span></label>`).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Your day</legend>
          <div class="chips" role="radiogroup" aria-label="Typical day">
            ${Object.entries(ROUTINES).map(([id, r]) => `<label class="chip"><input type="radio" name="routine" value="${id}" ${id === s.routine ? 'checked' : ''}/><span>${r.label}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="sim-sliders">
          <div class="slider">
            <span class="slider-top"><label for="sim-pv">Rooftop solar</label><output for="sim-pv" data-o="pv" aria-live="off">${s.pvKwp} kWp</output></span>
            <input id="sim-pv" type="range" name="pvKwp" min="0" max="16" step="1" value="${s.pvKwp}" aria-valuetext="${s.pvKwp} kWp" />
          </div>
          <div class="slider">
            <span class="slider-top"><label for="sim-km">Driving per day</label><output for="sim-km" data-o="km" aria-live="off">${s.dailyKm} km</output></span>
            <input id="sim-km" type="range" name="dailyKm" min="0" max="120" step="5" value="${s.dailyKm}" aria-valuetext="${s.dailyKm} km per day" />
          </div>
        </div>
        <fieldset>
          <legend>Your home</legend>
          <div class="chips" role="radiogroup" aria-label="Household">
            ${HOUSEHOLDS.map((h) => `<label class="chip"><input type="radio" name="household" value="${h.id}" ${h.id === s.household ? 'checked' : ''}/><span>${h.label}<small>${h.annualKwh.toLocaleString('en-GB')} kWh/yr</small></span></label>`).join('')}
          </div>
        </fieldset>
      </form>

      <div class="sim-results" data-o="results">
        <p class="sr-only" role="status" data-o="status"></p>
        <div class="sim-total">
          <p class="mono dim">Illustrative saving per year</p>
          <p class="sim-big"><span data-o="total">€0</span></p>
          <p class="sim-caveat">Illustrative simulation · sample tariff · before hardware costs</p>
          <div class="sim-split" role="img" data-o="splitLabel" aria-label="">
            <span class="sim-split-bar"><span class="seg seg-smart" data-o="segSmart"></span><span class="seg seg-v2h" data-o="segV2h"></span></span>
            <dl>
              <div><dt><span class="dot dot-grid"></span>Smart charging</dt><dd data-o="smart">€0</dd></div>
              <div><dt><span class="dot dot-energy"></span>Vehicle-to-home adds</dt><dd data-o="v2h">€0</dd></div>
            </dl>
          </div>
          <div class="sim-notes">
            <p>Vehicle-to-home is shown before the extra cost of bidirectional hardware, which often outweighs it<sup><a href="#src-agora">${agora}</a></sup>.</p>
            <p>Independent estimate for smart charging: about €50–200 a year (Agora Verkehrswende 2025).<sup><a href="#src-agora">${agora}</a></sup></p>
          </div>
        </div>
        <div class="sim-day">
          <div class="sim-day-head">
            <p class="mono dim">One day, planned</p>
            <div class="chips chips-sm" role="radiogroup" aria-label="Season">
              ${(['spring', 'summer', 'autumn', 'winter'] as Season[]).map((x) => `<label class="chip"><input type="radio" name="season" value="${x}" ${x === s.season ? 'checked' : ''}/><span>${x[0].toUpperCase() + x.slice(1)}</span></label>`).join('')}
            </div>
          </div>
          <svg class="sim-chart" data-o="chart" viewBox="0 0 480 180" preserveAspectRatio="none" role="img" aria-label=""></svg>
          <div class="sim-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
          <ul class="sim-legend">
            <li><span class="dot dot-solar"></span>Sun → car</li>
            <li><span class="dot dot-grid"></span>Grid → car</li>
            <li><span class="dot dot-energy"></span>Car → home</li>
            <li><span class="legend-line"></span>Price</li>
          </ul>
        </div>
        <div class="sim-months">
          <p class="mono dim">Month by month</p>
          <div class="sim-bars" data-o="months" role="img" aria-label=""></div>
        </div>
        <p class="footnote">
          Illustrative simulation, not an offer. It uses a sample dynamic tariff of ${tariffLo}–${tariffHi} ct/kWh, repeated unchanged on every day of the year, a feed-in
          tariff of 7.70 ct/kWh for new systems since August 2026<sup><a href="#src-eeg">${eeg}</a></sup>, a 7.4 kW bidirectional wallbox, a 3 ct/kWh battery-wear
          allowance and typical German solar yields. The baseline is a car that charges at full power as soon as it is plugged in. You need a compatible car, a
          compatible wallbox and a smart meter. Real results depend on your tariff, car and habits.
        </p>
      </div>
    </div>`

  const form = root.querySelector('form') as HTMLFormElement
  const o = (k: string) => root.querySelector(`[data-o="${k}"]`) as HTMLElement
  const results = o('results')
  const shown = { total: 0, smart: 0, v2h: 0 }

  const inputFor = (): Omit<PlanInput, 'season' | 'pv'> => {
    const v = VEHICLES.find((x) => x.id === s.vehicle) ?? VEHICLES[2]
    const r = ROUTINES[s.routine]
    const hh = HOUSEHOLDS.find((x) => x.id === s.household) ?? HOUSEHOLDS[1]
    return {
      batteryKwh: v.batteryKwh,
      pvKwp: s.pvKwp,
      departHour: r.depart,
      returnHour: r.back,
      tripKwh: s.dailyKm / v.kmPerKwh,
      targetSoc: 0.8,
      reserveSoc: 0.3,
      load: householdLoad(hh.annualKwh),
    }
  }

  const drawDay = (hours: HourFlow[]) => {
    const svg = o('chart')
    const W = 480
    const H = 180
    const bw = W / 24
    const maxKw = 7.5
    const y0 = H * 0.62
    let bars = ''
    hours.forEach((h, i) => {
      const x = i * bw + 2
      const up = (k: number) => (k / maxKw) * (y0 - 10)
      const solar = up(h.pvToCar)
      const grid = up(h.gridToCar)
      const out = ((h.carToHome / maxKw) * (H - y0 - 8)) * 3
      if (solar > 0.5) bars += `<rect x="${x}" y="${y0 - solar}" width="${bw - 4}" height="${solar}" rx="2" fill="#fbbf24"/>`
      if (grid > 0.5) bars += `<rect x="${x}" y="${y0 - solar - grid}" width="${bw - 4}" height="${grid}" rx="2" fill="#818cf8"/>`
      if (out > 0.5) bars += `<rect x="${x}" y="${y0}" width="${bw - 4}" height="${out}" rx="2" fill="#2dd4bf"/>`
      if (!h.home) bars += `<rect x="${i * bw}" y="0" width="${bw}" height="${H}" fill="rgba(255,255,255,0.025)"/>`
    })
    const prices = hours.map((h) => h.price)
    const pmax = Math.max(...prices)
    const pmin = Math.min(...prices)
    const line = prices.map((p, i) => `${(i + 0.5) * bw},${10 + (1 - (p - pmin) / (pmax - pmin)) * (y0 - 30)}`).join(' ')
    svg.innerHTML = `
      <line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="rgba(255,255,255,0.15)" stroke-width="1" vector-effect="non-scaling-stroke"/>
      ${bars}
      <polyline points="${line}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`
    const charged = hours.reduce((a, h) => a + h.pvToCar + h.gridToCar, 0)
    const solar = hours.reduce((a, h) => a + h.pvToCar, 0)
    const out = hours.reduce((a, h) => a + h.carToHome, 0)
    svg.setAttribute('aria-label', `One ${s.season} day: the car charges ${charged.toFixed(1)} kWh (${solar.toFixed(1)} kWh from the sun) and supplies ${out.toFixed(1)} kWh to the home.`)
  }

  const drawMonths = (vals: number[]) => {
    const max = Math.max(1, ...vals)
    const bars = o('months')
    bars.innerHTML = vals
      .map((v, i) => `<div class="sim-bar"><span style="--h:${Math.max(0.02, v / max)}"></span><small>${MONTH_NAMES[i][0]}</small></div>`)
      .join('')
    bars.setAttribute('aria-label', `Saving by month: ${vals.map((v, i) => `${MONTH_NAMES[i]} ${fmtEur(v)}`).join(', ')}.`)
  }

  const drawDayNow = () => drawDay(planDay({ ...inputFor(), season: s.season }).smart.hours)

  /** Twelve representative days, solved twice: with and without vehicle-to-home. */
  const solveYear = (base: ReturnType<typeof inputFor>): YearSummary => {
    const smartOnly = planYear({ ...base, allowV2H: false })
    const full = planYear(base)
    const v2h = Math.max(0, full.savings - smartOnly.savings)
    return { smart: smartOnly.savings, v2h, total: smartOnly.savings + v2h, months: full.months.map((m) => m.savings) }
  }

  const status = o('status')
  let statusTimer = 0
  const showYear = (y: YearSummary) => {
    drawMonths(y.months)
    const pctSmart = y.total > 0 ? (Math.max(0, y.smart) / y.total) * 100 : 50
    o('segSmart').style.width = `${pctSmart}%`
    o('segV2h').style.width = `${100 - pctSmart}%`
    o('splitLabel').setAttribute('aria-label', `Smart charging ${fmtEur(y.smart)} a year, vehicle-to-home adds ${fmtEur(y.v2h)}, before hardware costs.`)
    gsap.to(shown, {
      total: y.total,
      smart: y.smart,
      v2h: y.v2h,
      duration: reducedMotion ? 0 : 0.8,
      ease: 'power3.out',
      overwrite: true,
      onUpdate: () => {
        o('total').textContent = fmtEur(shown.total)
        o('smart').textContent = fmtEur(shown.smart)
        o('v2h').textContent = `+${fmtEur(shown.v2h)}`
      },
    })
    // One announcement with the final numbers, not one per animation frame or per slider step.
    clearTimeout(statusTimer)
    statusTimer = window.setTimeout(() => {
      status.textContent = `Illustrative saving ${fmtEur(y.total)} a year: smart charging ${fmtEur(y.smart)}, vehicle-to-home adds ${fmtEur(y.v2h)}, before hardware costs.`
    }, STATUS_DELAY_MS)
  }

  const yearCache = new Map<string, YearSummary>()
  let yearTimer = 0
  const update = (instant = false) => {
    drawDayNow()
    clearTimeout(yearTimer)
    const key = [s.vehicle, s.pvKwp, s.household, s.routine, s.dailyKm].join('|')
    const hit = yearCache.get(key)
    if (hit) {
      results.removeAttribute('data-stale')
      showYear(hit)
      return
    }
    results.setAttribute('data-stale', '') // the yearly numbers are catching up with the inputs
    const base = inputFor()
    yearTimer = window.setTimeout(() => {
      const y = solveYear(base)
      if (yearCache.size > 200) yearCache.clear()
      yearCache.set(key, y)
      results.removeAttribute('data-stale')
      showYear(y)
    }, instant ? 0 : YEAR_DEBOUNCE_MS)
  }

  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement
    if (t.name === 'pvKwp') {
      s.pvKwp = Number(t.value)
      o('pv').textContent = `${t.value} kWp`
      t.setAttribute('aria-valuetext', `${t.value} kWp`)
    } else if (t.name === 'dailyKm') {
      s.dailyKm = Number(t.value)
      o('km').textContent = `${t.value} km`
      t.setAttribute('aria-valuetext', `${t.value} km per day`)
    } else if (t.name in s) {
      ;(s as unknown as Record<string, string>)[t.name] = t.value
    }
    update()
  })
  root.querySelectorAll<HTMLInputElement>('input[name="season"]').forEach((r) =>
    r.addEventListener('change', () => {
      s.season = r.value as Season
      drawDayNow() // the season only changes the sample day, not the yearly figures
    }),
  )
  update(true)
}
