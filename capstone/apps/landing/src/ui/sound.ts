// Generative sound: an optional ambient bed and four short cues, synthesised live with
// WebAudio (no audio files). Off by default. Browsers only allow audio after a user gesture,
// so the AudioContext is created or resumed from the toggle's click; a stored 'on'
// preference shows the toggle 'armed' until that click.
//
// Gain staging: voices run hot (peaks around −10 dBFS) into a limiter at −10 dB, then a fixed
// trim sets the output. Measured offline (OfflineAudioContext, 48 kHz): the bed peaks near
// −21 dBFS (about −33 LUFS), single cues near −18 dBFS, and even every cue at once stays
// under −16.5 dBFS. createSoundEngine is exported so the levels can be re-checked that way.

import { onLangChange, t } from '../i18n/lang.ts'

export type SoundCue = 'reversal' | 'tick' | 'reveal' | 'surge'

export interface Sound {
  /** True while sound is switched on and playing. */
  readonly enabled: boolean
  /** Switching on must happen inside a user gesture (the toggle's click does this). */
  setEnabled(on: boolean): void
  /** Power moving through the scene, 0–8 kW: the flow hum's level and pitch follow it. */
  setFlow(kw: number): void
  /** 0 day … 1 night: crossfades the brighter day bed with the darker night bed. */
  setNight(t: number): void
  /** One-shot cue; rate-limited per kind and silent while sound is off. */
  cue(name: SoundCue): void
}

/** The synth graph without the page plumbing. Times are in the context's seconds. */
export interface SoundEngine {
  start(at: number): void
  /** Fade in (the bed blooms in over a few seconds) or out. */
  fade(on: boolean, at: number): void
  /** `glide` is a smoothing time constant in seconds; 0 jumps. */
  setFlow(kw: number, at: number, glide?: number): void
  setNight(t: number, at: number, glide?: number): void
  cue(name: SoundCue, at: number): void
}

const MAX_KW = 8
const STORE_KEY = 'sound-pref'
/** Minimum seconds between two cues of the same kind. */
const MIN_GAP: Record<SoundCue, number> = { tick: 0.07, reveal: 1.2, reversal: 1.6, surge: 2.5 }
/** Linear gains in the hot section, then the output trim (tuned with offline renders). */
const LVL = {
  droneOsc: 0.25,
  drone: 0.5,
  nightAir: 0.42,
  dayAir: 0.22,
  shimmer: 0.03,
  hum: 0.18,
  room: 0.5,
  reversal: 0.26,
  tick: 0.14,
  revealAir: 0.55,
  revealPad: 0.1,
  surge: 0.45,
  surgeSub: 0.25,
  trim: 0.19,
}

/** Partial amplitudes of the drone's reed tone. */
const REED = [1, 0.7, 0.5, 0.35, 0.22, 0.14, 0.08, 0.05]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const toward = (param: AudioParam, v: number, at: number, tau: number) => (tau > 0 ? param.setTargetAtTime(v, at, tau) : param.setValueAtTime(v, at))

export function createSoundEngine(ctx: BaseAudioContext, destination: AudioNode = ctx.destination): SoundEngine {
  const rand = mulberry32(0x2dd4bf)
  const noise = pinkNoise(ctx, 4, rand)
  // A soft, reed-like tone (falling harmonics) so the low drone still reads on laptop and
  // phone speakers, which cannot reproduce a 55 Hz fundamental. Schroeder phases spread the
  // partials so the waveform's peaks stay low for its loudness.
  const phase = (n: number) => (Math.PI * n * (n - 1)) / REED.length
  const warm = ctx.createPeriodicWave(
    [0, ...REED.map((a, i) => a * Math.sin(phase(i + 1)))],
    [0, ...REED.map((a, i) => a * Math.cos(phase(i + 1)))],
  )
  const loops: AudioScheduledSourceNode[] = []

  const gain = (v: number) => new GainNode(ctx, { gain: v })
  // WebAudio reads Q in dB for low/high-pass (−3 ≈ Butterworth) and linearly for band-pass.
  const filter = (type: BiquadFilterType, frequency: number, Q = 0) => new BiquadFilterNode(ctx, { type, frequency, Q })
  const panner = (pan: number) => new StereoPannerNode(ctx, { pan })
  const osc = (frequency: number, type: OscillatorType = 'sine', detune = 0) => new OscillatorNode(ctx, { type, frequency, detune })
  const reed = (frequency: number, detune = 0) => new OscillatorNode(ctx, { periodicWave: warm, frequency, detune })
  // Always-on sine modulation added to a parameter (a gain, or a filter's detune in cents).
  const lfo = (rate: number, depth: number, param: AudioParam) => {
    const o = osc(rate)
    o.connect(gain(depth)).connect(param)
    loops.push(o)
  }
  // Gentle tanh soft-clip: linear for the bulk of the noise, rounding off only its rare
  // peaks, which would otherwise set the bed's peak level.
  const softClip = () => {
    const curve = new Float32Array(1025)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(4 * (i / 512 - 1)) / 4
    return new WaveShaperNode(ctx, { curve })
  }

  // Master: mix → high-pass (no sub-sonic rumble) → limiter → output trim and fades.
  const mix = gain(1)
  const out = gain(0)
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -10, knee: 3, ratio: 20, attack: 0.002, release: 0.22 })
  mix.connect(filter('highpass', 30, -3)).connect(limiter).connect(out).connect(destination)

  // A generated 2.4 s room shared by the bed and the cues.
  const room = gain(1)
  room.connect(new ConvolverNode(ctx, { buffer: impulse(ctx, 2.4, rand) })).connect(gain(LVL.room)).connect(mix)
  const send = (from: AudioNode, level: number) => {
    const g = gain(level)
    from.connect(g).connect(room)
    return g
  }

  // Continuous bed; it blooms in slowly when sound is switched on.
  const bed = gain(0)
  bed.connect(mix)
  send(bed, 0.2)

  // Drone: A1 and E2, an open fifth. Each note is a pair of voices detuned ±6 cents and
  // panned apart, so it beats slowly across the stereo field; tremolo and a drifting
  // low-pass make it breathe, and setNight darkens the filter.
  const droneLp = filter('lowpass', 420, 2)
  const drone = gain(LVL.drone)
  droneLp.connect(drone).connect(bed)
  lfo(0.047, 300, droneLp.detune)
  const notes = [
    { hz: 55, rate: 0.083, side: -1 },
    { hz: 82.41, rate: 0.061, side: 1 },
  ]
  for (const n of notes) {
    const breath = gain(0.5)
    lfo(n.rate, 0.12, breath.gain)
    breath.connect(droneLp)
    for (const d of [-1, 1]) {
      const o = reed(n.hz, d * 6)
      o.connect(gain(LVL.droneOsc)).connect(panner(d * n.side * 0.45)).connect(breath)
      loops.push(o)
    }
  }

  // Air: one looping pink-noise bed split into a dark night wind and a brighter day air.
  const air = new AudioBufferSourceNode(ctx, { buffer: noise, loop: true })
  loops.push(air)
  const nightAir = gain(0)
  const dayAir = gain(0)
  const nightBreath = gain(1)
  const dayBreath = gain(1)
  lfo(0.071, 0.22, nightBreath.gain)
  lfo(0.053, 0.25, dayBreath.gain)
  air.connect(filter('highpass', 140, -3)).connect(filter('lowpass', 700, -3)).connect(softClip()).connect(nightBreath).connect(nightAir).connect(bed)
  air.connect(filter('highpass', 1400, -3)).connect(filter('lowpass', 7000, -3)).connect(softClip()).connect(dayBreath).connect(dayAir).connect(bed)

  // Day shimmer: the drone's two notes three octaves up, swelling in and out in turn.
  const shimmer = gain(0)
  shimmer.connect(bed)
  send(shimmer, 0.6)
  const partials = [
    { hz: 440, rate: 0.037, pan: -0.5 },
    { hz: 659.26, rate: 0.029, pan: 0.5 },
  ]
  for (const p of partials) {
    const swell = gain(0.5)
    lfo(p.rate, 0.5, swell.gain)
    const o = osc(p.hz)
    o.connect(swell).connect(panner(p.pan)).connect(shimmer)
    loops.push(o)
  }

  // Flow hum: a detuned saw + triangle through a band-pass; setFlow drives its level, pitch
  // and brightness.
  const humBp = filter('bandpass', 400, 1.4)
  const hum = gain(0)
  humBp.connect(hum).connect(bed)
  lfo(0.13, 150, humBp.detune)
  const humOsc = [osc(110, 'sawtooth', 5), osc(110, 'triangle', -5)]
  for (const o of humOsc) {
    o.connect(humBp)
    loops.push(o)
  }

  // Cues have their own bus into the mix, so the slow bed fade never holds them back.
  const cues = gain(1)
  cues.connect(mix)
  const envelope = (peak: number, at: number, attack: number, releaseAt: number, release: number) => {
    const g = gain(0)
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(peak, at + attack)
    g.gain.setTargetAtTime(0, releaseAt, release)
    return g
  }
  const noiseVoice = () => new AudioBufferSourceNode(ctx, { buffer: noise, loop: true })
  // Stop a cue's sources at `end` (its envelopes have decayed by then), then unplug its
  // outputs so the finished voice can be collected.
  const finish = (end: number, sources: AudioScheduledSourceNode[], outputs: AudioNode[]) => {
    let left = sources.length
    for (const s of sources) {
      s.stop(end)
      s.onended = () => {
        if (--left === 0) for (const n of outputs) n.disconnect()
      }
    }
  }

  const voices: Record<SoundCue, (at: number) => void> = {
    // Energy changes direction: a soft tone glides down an octave, then up a twelfth,
    // drifting across the stereo field as it turns.
    reversal(at) {
      const env = envelope(LVL.reversal, at, 0.06, at + 1.15, 0.38)
      const lp = filter('lowpass', 1100)
      lp.frequency.setValueAtTime(1100, at)
      lp.frequency.exponentialRampToValueAtTime(2600, at + 1.1)
      const p = panner(0.3)
      p.pan.setValueAtTime(0.3, at)
      p.pan.linearRampToValueAtTime(-0.3, at + 1.1)
      env.connect(lp).connect(p).connect(cues)
      const layers = [
        { mul: 1, level: 1, detune: 0 },
        { mul: 2, level: 0.25, detune: 7 },
      ]
      const sources = layers.map((l) => {
        const o = reed(220 * l.mul, l.detune)
        o.frequency.setValueAtTime(220 * l.mul, at)
        o.frequency.exponentialRampToValueAtTime(110 * l.mul, at + 0.4)
        o.frequency.exponentialRampToValueAtTime(330 * l.mul, at + 1.1)
        o.connect(gain(l.level)).connect(env)
        o.start(at)
        return o
      })
      finish(at + 3.8, sources, [p, send(p, 0.5)])
    },
    // Hover: a tiny soft 'plip', a sine falling a fifth in 30 ms, varied a little each time.
    tick(at) {
      const hz = 2200 * (0.94 + rand() * 0.12)
      const o = osc(hz)
      o.frequency.setValueAtTime(hz, at)
      o.frequency.exponentialRampToValueAtTime(hz * 0.66, at + 0.03)
      const p = panner((rand() - 0.5) * 0.4)
      o.connect(envelope(LVL.tick, at, 0.002, at + 0.002, 0.012)).connect(p).connect(cues)
      o.start(at)
      finish(at + 0.1, [o], [p])
    },
    // Airy swell: band-passed noise opening up under a soft open chord (A3, E4, B4).
    reveal(at) {
      const bus = gain(1)
      const n = noiseVoice()
      const bp = filter('bandpass', 450, 0.8)
      bp.frequency.setValueAtTime(450, at)
      bp.frequency.exponentialRampToValueAtTime(2800, at + 1.5)
      bp.frequency.exponentialRampToValueAtTime(1500, at + 3.5)
      n.connect(bp).connect(envelope(LVL.revealAir, at, 1.2, at + 1.3, 0.5)).connect(bus)
      n.start(at, rand() * 3.5)
      const chord = [220, 329.63, 493.88].map((hz, i) => {
        const t = at + i * 0.09
        const o = osc(hz, 'sine', (rand() - 0.5) * 8)
        o.connect(envelope(LVL.revealPad, t, 0.9, at + 1.4, 0.6)).connect(panner((i - 1) * 0.4)).connect(bus)
        o.start(t)
        return o
      })
      bus.connect(cues)
      finish(at + 5.5, [n, ...chord], [bus, send(bus, 0.75)])
    },
    // Loader → hero: a rising whoosh (a noise band sweeping up) over a reed climbing an octave.
    surge(at) {
      const bus = gain(1)
      const n = noiseVoice()
      const bp = filter('bandpass', 160, 1.2)
      bp.frequency.setValueAtTime(160, at)
      bp.frequency.exponentialRampToValueAtTime(5200, at + 1.15)
      const env = gain(0)
      env.gain.setValueAtTime(0, at)
      env.gain.linearRampToValueAtTime(LVL.surge * 0.25, at + 0.6)
      env.gain.linearRampToValueAtTime(LVL.surge, at + 1.1)
      env.gain.setTargetAtTime(0, at + 1.12, 0.14)
      n.connect(bp).connect(env).connect(bus)
      n.start(at, rand() * 3.5)
      const sub = reed(55)
      sub.frequency.setValueAtTime(55, at)
      sub.frequency.exponentialRampToValueAtTime(110, at + 1.1)
      sub.connect(envelope(LVL.surgeSub, at, 1, at + 1.1, 0.2)).connect(bus)
      sub.start(at)
      bus.connect(cues)
      finish(at + 2.6, [n, sub], [bus, send(bus, 0.4)])
    },
  }

  let started = false
  return {
    start(at) {
      if (started) return
      started = true
      for (const s of loops) s.start(at)
    },
    fade(on, at) {
      out.gain.setTargetAtTime(on ? LVL.trim : 0, at, on ? 0.04 : 0.2)
      bed.gain.setTargetAtTime(on ? 1 : 0, at, on ? 0.9 : 0.2)
    },
    setFlow(kw, at, glide = 0.3) {
      const x = clamp(kw, 0, MAX_KW) / MAX_KW
      const hz = 110 * 2 ** ((7 / 12) * x) // A2 at a trickle, E3 at 8 kW
      for (const o of humOsc) toward(o.frequency, hz, at, glide)
      toward(humBp.frequency, hz * (3 + 2 * x), at, glide)
      toward(hum.gain, LVL.hum * (1 - Math.exp(-4 * x)), at, glide)
    },
    setNight(t, at, glide = 0.8) {
      const n = clamp(t, 0, 1)
      const day = Math.cos((n * Math.PI) / 2)
      toward(droneLp.frequency, 900 * (380 / 900) ** n, at, glide)
      toward(drone.gain, LVL.drone * (0.8 + 0.12 * n), at, glide)
      toward(nightAir.gain, LVL.nightAir * Math.sin((n * Math.PI) / 2), at, glide)
      toward(dayAir.gain, LVL.dayAir * day, at, glide)
      toward(shimmer.gain, LVL.shimmer * day * day, at, glide)
    },
    cue(name, at) {
      voices[name](at)
    },
  }
}

// ---------- Page plumbing: one Sound per page, any number of toggles ----------

type Mode = 'off' | 'armed' | 'on'

interface Controller extends Sound {
  readonly mode: Mode
  readonly supported: boolean
}

let instance: Controller | null = null
const toggles = new Set<HTMLButtonElement>()
onLangChange(() => toggles.forEach(paint)) // the name and tooltip are words

/** The page's sound. Safe to call more than once: later calls return the same instance. */
export function initSound(): Sound {
  if (instance) return instance
  const supported = typeof AudioContext === 'function'
  let mode: Mode = supported && readPref() === 'on' ? 'armed' : 'off'
  let ctx: AudioContext | null = null
  let engine: SoundEngine | null = null
  let flow = 0
  let night = 1
  let sent = { flow: -1, night: -1 }
  let generation = 0
  let timer = 0
  let lastFlush = 0
  const lastCue: Partial<Record<SoundCue, number>> = {}

  const setMode = (m: Mode) => {
    mode = m
    toggles.forEach(paint)
  }

  // Create or resume the context. Runs inside the click that switched sound on (or on
  // returning to the tab); if the browser still refuses, fall back to 'armed'.
  const wake = (greet: boolean) => {
    if (!ctx || !engine) {
      try {
        ctx = new AudioContext()
      } catch {
        setMode('off')
        return
      }
      engine = createSoundEngine(ctx)
      engine.start(ctx.currentTime)
    }
    const c = ctx
    const gen = ++generation
    const t = c.currentTime
    engine.setFlow(flow, t, 0.05)
    engine.setNight(night, t, 0.05)
    sent = { flow, night }
    engine.fade(true, t)
    if (greet && t - (lastCue.surge ?? -Infinity) >= MIN_GAP.surge) {
      lastCue.surge = t
      engine.cue('surge', t + 0.05)
    }
    void Promise.race([c.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 1000))]).then(() => {
      if (gen === generation && mode === 'on' && c.state !== 'running') setMode('armed')
    })
  }

  // Fade out, then suspend so a silent page costs no audio-thread time.
  const rest = () => {
    if (!ctx || !engine) return
    const c = ctx
    const gen = ++generation
    engine.fade(false, c.currentTime)
    setTimeout(() => {
      if (gen === generation) c.suspend().catch(() => undefined)
    }, 1500)
  }

  // setFlow/setNight may arrive every frame; pass changes to the audio thread ~16 times a second.
  const flush = () => {
    timer = 0
    lastFlush = performance.now()
    if (mode !== 'on' || !ctx || !engine) return
    const t = ctx.currentTime
    if (Math.abs(flow - sent.flow) > 0.02) engine.setFlow((sent.flow = flow), t)
    if (Math.abs(night - sent.night) > 0.004) engine.setNight((sent.night = night), t)
  }
  const queue = () => {
    if (timer || mode !== 'on') return
    const wait = 60 - (performance.now() - lastFlush)
    if (wait <= 0) flush()
    else timer = window.setTimeout(flush, wait)
  }

  document.addEventListener('visibilitychange', () => {
    if (mode !== 'on' || !ctx) return
    if (document.hidden) rest()
    else wake(false)
  })

  instance = {
    supported,
    get mode() {
      return mode
    },
    get enabled() {
      return mode === 'on'
    },
    setEnabled(on) {
      if (!supported) return
      if (on) {
        if (mode === 'on') return
        setMode('on')
        writePref('on')
        wake(true)
      } else if (mode !== 'off') {
        const playing = mode === 'on'
        setMode('off')
        writePref('off')
        if (playing) rest()
      }
    },
    setFlow(kw) {
      flow = clamp(Number.isFinite(kw) ? Math.abs(kw) : 0, 0, MAX_KW)
      queue()
    },
    setNight(t) {
      night = clamp(Number.isFinite(t) ? t : 1, 0, 1)
      queue()
    },
    cue(name) {
      if (mode !== 'on' || !ctx || !engine || ctx.state !== 'running' || document.hidden) return
      const t = ctx.currentTime
      if (t - (lastCue[name] ?? -Infinity) < MIN_GAP[name]) return
      lastCue[name] = t
      engine.cue(name, t + 0.02)
    },
  }
  return instance
}

/** The top-bar toggle. Its click is the user gesture that lets audio start. */
export function createSoundToggle(): HTMLButtonElement {
  const sound = initSound()
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'sound-toggle'
  btn.dataset.magnetic = '6'
  btn.innerHTML =
    '<svg class="sound-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor"/></svg>' +
    '<span class="sound-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'
  btn.addEventListener('click', () => sound.setEnabled(!sound.enabled))
  toggles.add(btn)
  paint(btn)
  return btn
}

/** Soft ticks when the mouse enters interactive elements (cue('tick') is rate-limited). */
export function bindHoverTicks(sound: Sound, selector = 'a, button, [role="button"], summary, .chip'): () => void {
  const over = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const el = (e.target as Element | null)?.closest(selector)
    if (el && el !== (e.relatedTarget as Element | null)?.closest(selector)) sound.cue('tick')
  }
  document.addEventListener('pointerover', over)
  return () => document.removeEventListener('pointerover', over)
}

function paint(btn: HTMLButtonElement): void {
  const mode = instance?.mode ?? 'off'
  const on = mode === 'on'
  btn.hidden = !instance?.supported
  btn.dataset.state = mode
  btn.setAttribute('aria-pressed', String(on))
  // The name stays constant; aria-pressed carries the state (ARIA APG toggle button).
  btn.setAttribute('aria-label', t('sound.label'))
  btn.dataset.tip = t(on ? 'sound.on' : mode === 'armed' ? 'sound.armed' : 'sound.off')
}

function readPref(): string | null {
  try {
    return localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}

function writePref(v: 'on' | 'off'): void {
  try {
    localStorage.setItem(STORE_KEY, v)
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

// ---------- Generated buffers ----------

/** Small seeded PRNG, so the noise and the room are the same on every visit. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Looping stereo pink-ish noise (Paul Kellet's filter), RMS-normalised, seamless at the loop point. */
function pinkNoise(ctx: BaseAudioContext, seconds: number, rand: () => number): AudioBuffer {
  const len = Math.floor(seconds * ctx.sampleRate)
  const blend = 2048
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const raw = new Float32Array(len + blend)
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let b3 = 0
    let b4 = 0
    let b5 = 0
    let b6 = 0
    for (let i = 0; i < raw.length; i++) {
      const w = rand() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
      b6 = w * 0.115926
    }
    // The first samples cross-fade (equal power) with the samples that follow the end, so
    // the last sample flows straight into the first.
    const d = buf.getChannelData(c)
    let sum = 0
    for (let i = 0; i < len; i++) {
      const k = i / blend
      d[i] = i < blend ? raw[i] * Math.sqrt(k) + raw[len + i] * Math.sqrt(1 - k) : raw[i]
      sum += d[i] * d[i]
    }
    const norm = 0.2 / Math.sqrt(sum / len)
    for (let i = 0; i < len; i++) d[i] *= norm
  }
  return buf
}

/** A room impulse: decorrelated stereo noise after a short pre-delay, decaying to −60 dB
 *  over `seconds` and darkening as it goes. */
function impulse(ctx: BaseAudioContext, seconds: number, rand: () => number): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(seconds * rate)
  const pre = Math.floor(0.012 * rate)
  const buf = ctx.createBuffer(2, len, rate)
  const decay = Math.exp(-6.9 / (len - pre))
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    let a = 1
    let lp = 0
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre)
      lp += (rand() * 2 - 1 - lp) * (0.9 - 0.75 * t)
      d[i] = lp * a * Math.min(1, (i - pre) / (0.004 * rate))
      a *= decay
    }
  }
  return buf
}
