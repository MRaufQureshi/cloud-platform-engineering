// Interactive savings simulator. Runs the household optimiser (src/sim/v2h.ts) for the
// visitor's inputs and shows, honestly split, what smart charging alone saves versus what
// vehicle-to-home adds — per year, plus the plan for one representative day.
//
// Cost control: the day chart redraws on every input (one DP solve), while the yearly figures
// (24 solves) wait for 150 ms of quiet and are memoised per input combination.
import { gsap } from 'gsap'
import { HOUSEHOLDS, householdLoad, PRICE_EUR_KWH, VEHICLES, type Season } from '../sim/model.ts'
import { planDay, planYear, type PlanInput, type HourFlow } from '../sim/v2h.ts'
import { fmt, getLang, onLangChange, t } from '../i18n/lang.ts'
import type { StringKey } from '../i18n/strings.ts'

interface Inputs {
  vehicle: string
  pvKwp: number
  household: string
  routine: 'commute' | 'parttime' | 'home'
  dailyKm: number
  season: Season
}

const ROUTINES = {
  commute: { depart: 8, back: 17 },
  parttime: { depart: 8, back: 13 },
  // Mostly at home still makes a short trip, so the driving slider always counts.
  home: { depart: 10, back: 12 },
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

const fmtEur = (v: number) => fmt.eur(Math.round(v))
const fmtCt = (v: number) => fmt.num(Math.round(v * 1000) / 10, 0, 1)
/** "One summer day" reads with a lower-case season in English; German nouns keep their capital. */
const seasonInSentence = (x: Season) => (getLang() === 'en' ? t(`sim.season.${x}`).toLowerCase() : t(`sim.season.${x}`))

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
  const shown = { total: 0, smart: 0, v2h: 0 }
  const yearCache = new Map<string, YearSummary>()
  let statusTimer = 0
  let yearTimer = 0

  // The markup is built from the inputs and the language. A language change builds it again: the inputs
  // (and the solved years) are kept, so the visitor's settings and numbers stay as they were.
  const mount = () => {
    window.clearTimeout(statusTimer)
    window.clearTimeout(yearTimer)
    const tariffLo = fmtCt(Math.min(...PRICE_EUR_KWH))
    const tariffHi = fmtCt(Math.max(...PRICE_EUR_KWH))
    const label = (prefix: string, id: string) => t(`${prefix}.${id}` as StringKey)

    root.innerHTML = `
      <div class="sim">
        <form class="sim-controls" aria-label="${t('sim.form.aria')}" onsubmit="return false">
          <fieldset>
            <legend>${t('sim.car')}</legend>
            <div class="chips" role="radiogroup" aria-label="${t('sim.car.aria')}">
              ${VEHICLES.map((v) => `<label class="chip"><input type="radio" name="vehicle" value="${v.id}" ${v.id === s.vehicle ? 'checked' : ''}/><span>${label('sim.vehicle', v.id)}<small>${v.batteryKwh} kWh</small></span></label>`).join('')}
            </div>
          </fieldset>
          <fieldset>
            <legend>${t('sim.day')}</legend>
            <div class="chips" role="radiogroup" aria-label="${t('sim.day.aria')}">
              ${Object.keys(ROUTINES).map((id) => `<label class="chip"><input type="radio" name="routine" value="${id}" ${id === s.routine ? 'checked' : ''}/><span>${label('sim.routine', id)}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="sim-sliders">
            <div class="slider">
              <span class="slider-top"><label for="sim-pv">${t('sim.pv')}</label><output for="sim-pv" data-o="pv" aria-live="off">${s.pvKwp} kWp</output></span>
              <input id="sim-pv" type="range" name="pvKwp" min="0" max="16" step="1" value="${s.pvKwp}" aria-valuetext="${s.pvKwp} kWp" />
            </div>
            <div class="slider">
              <span class="slider-top"><label for="sim-km">${t('sim.km')}</label><output for="sim-km" data-o="km" aria-live="off">${s.dailyKm} km</output></span>
              <input id="sim-km" type="range" name="dailyKm" min="0" max="120" step="5" value="${s.dailyKm}" aria-valuetext="${t('sim.km.valuetext', { n: s.dailyKm })}" />
            </div>
          </div>
          <fieldset>
            <legend>${t('sim.home')}</legend>
            <div class="chips" role="radiogroup" aria-label="${t('sim.home.aria')}">
              ${HOUSEHOLDS.map((h) => `<label class="chip"><input type="radio" name="household" value="${h.id}" ${h.id === s.household ? 'checked' : ''}/><span>${label('sim.household', h.id)}<small>${t('sim.perYear', { n: fmt.num(h.annualKwh) })}</small></span></label>`).join('')}
            </div>
          </fieldset>
        </form>

        <div class="sim-results" data-o="results">
          <p class="sr-only" role="status" data-o="status"></p>
          <div class="sim-total">
            <p class="mono dim">${t('sim.total')}</p>
            <p class="sim-big"><span data-o="total">${fmtEur(shown.total)}</span></p>
            <p class="sim-caveat">${t('sim.caveat')}</p>
            <div class="sim-split" role="img" data-o="splitLabel" aria-label="">
              <span class="sim-split-bar"><span class="seg seg-smart" data-o="segSmart"></span><span class="seg seg-v2h" data-o="segV2h"></span></span>
              <dl>
                <div><dt><span class="dot dot-grid"></span>${t('sim.smart')}</dt><dd data-o="smart">${fmtEur(shown.smart)}</dd></div>
                <div><dt><span class="dot dot-energy"></span>${t('sim.v2hAdds')}</dt><dd data-o="v2h">+${fmtEur(shown.v2h)}</dd></div>
              </dl>
            </div>
            <div class="sim-notes">
              <p>${t('sim.note1', { agora })}</p>
              <p>${t('sim.note2', { agora })}</p>
            </div>
          </div>
          <div class="sim-day">
            <div class="sim-day-head">
              <p class="mono dim">${t('sim.oneDay')}</p>
              <div class="chips chips-sm" role="radiogroup" aria-label="${t('sim.season.aria')}">
                ${(['spring', 'summer', 'autumn', 'winter'] as Season[]).map((x) => `<label class="chip"><input type="radio" name="season" value="${x}" ${x === s.season ? 'checked' : ''}/><span>${label('sim.season', x)}</span></label>`).join('')}
              </div>
            </div>
            <svg class="sim-chart" data-o="chart" viewBox="0 0 480 180" preserveAspectRatio="none" role="img" aria-label=""></svg>
            <div class="sim-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
            <ul class="sim-legend">
              <li><span class="dot dot-solar"></span>${t('sim.legend.sun')}</li>
              <li><span class="dot dot-grid"></span>${t('sim.legend.grid')}</li>
              <li><span class="dot dot-energy"></span>${t('sim.legend.home')}</li>
              <li><span class="legend-line"></span>${t('sim.legend.price')}</li>
            </ul>
          </div>
          <div class="sim-months">
            <p class="mono dim">${t('sim.months')}</p>
            <div class="sim-bars" data-o="months" role="img" aria-label=""></div>
          </div>
          <p class="footnote">${t('sim.footnote', { lo: tariffLo, hi: tariffHi, eeg })}</p>
        </div>
      </div>`

    const form = root.querySelector('form') as HTMLFormElement
    const o = (k: string) => root.querySelector(`[data-o="${k}"]`) as HTMLElement
    const results = o('results')

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
      svg.setAttribute(
        'aria-label',
        t('sim.chart.aria', { season: seasonInSentence(s.season), charged: fmt.num(charged, 1), solar: fmt.num(solar, 1), out: fmt.num(out, 1) }),
      )
    }

    const drawMonths = (vals: number[]) => {
      const max = Math.max(1, ...vals)
      const bars = o('months')
      const name = (i: number) => t(`month.${i}` as StringKey)
      bars.innerHTML = vals
        .map((v, i) => `<div class="sim-bar"><span style="--h:${Math.max(0.02, v / max)}"></span><small>${name(i)[0]}</small></div>`)
        .join('')
      bars.setAttribute('aria-label', t('sim.months.aria', { list: vals.map((v, i) => `${name(i)} ${fmtEur(v)}`).join(', ') }))
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
    const paintNumbers = () => {
      o('total').textContent = fmtEur(shown.total)
      o('smart').textContent = fmtEur(shown.smart)
      o('v2h').textContent = `+${fmtEur(shown.v2h)}`
    }
    const showYear = (y: YearSummary) => {
      drawMonths(y.months)
      const pctSmart = y.total > 0 ? (Math.max(0, y.smart) / y.total) * 100 : 50
      o('segSmart').style.width = `${pctSmart}%`
      o('segV2h').style.width = `${100 - pctSmart}%`
      o('splitLabel').setAttribute('aria-label', t('sim.split.aria', { smart: fmtEur(y.smart), v2h: fmtEur(y.v2h) }))
      gsap.to(shown, {
        total: y.total,
        smart: y.smart,
        v2h: y.v2h,
        duration: reducedMotion ? 0 : 0.8,
        ease: 'power3.out',
        overwrite: true,
        onUpdate: paintNumbers,
      })
      // One announcement with the final numbers, not one per animation frame or per slider step.
      clearTimeout(statusTimer)
      statusTimer = window.setTimeout(() => {
        status.textContent = t('sim.status', { total: fmtEur(y.total), smart: fmtEur(y.smart), v2h: fmtEur(y.v2h) })
      }, STATUS_DELAY_MS)
    }

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
      const target = e.target as HTMLInputElement
      if (target.name === 'pvKwp') {
        s.pvKwp = Number(target.value)
        o('pv').textContent = `${target.value} kWp`
        target.setAttribute('aria-valuetext', `${target.value} kWp`)
      } else if (target.name === 'dailyKm') {
        s.dailyKm = Number(target.value)
        o('km').textContent = `${target.value} km`
        target.setAttribute('aria-valuetext', t('sim.km.valuetext', { n: target.value }))
      } else if (target.name in s) {
        ;(s as unknown as Record<string, string>)[target.name] = target.value
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

  mount()
  onLangChange(mount)
}
