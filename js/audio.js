// GRIDFORGE audio. Everything is synthesised with the Web Audio API — no
// asset files, so nothing to download and nothing to cache-bust.
"use strict";

const SFX = {
  ctx: null,
  master: null,
  amb: null,          // ambience gain, scaled by how busy the factory is
  hum: null,          // machine hum gain
  muted: false,
  started: false,
  _last: {},          // per-sound throttle stamps

  // Browsers only allow audio after a gesture, so this is called from the
  // first pointerdown rather than at load.
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.started = true;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.buildAmbience();
    this.resume();
  },

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  },

  /* ---------- ambience: a slow pad plus a hum that tracks the factory ---------- */

  buildAmbience() {
    const c = this.ctx;
    const pad = c.createGain();
    pad.gain.value = 0.055;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    lp.Q.value = 0.6;
    pad.connect(lp).connect(this.master);
    // two detuned voices a fifth apart, plus a slow wobble
    [55, 82.4].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = i ? 0.5 : 1;
      o.connect(g).connect(pad);
      o.start();
      const lfo = c.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + i * 0.03;
      const lg = c.createGain();
      lg.gain.value = 0.9 + i;
      lfo.connect(lg).connect(o.frequency);
      lfo.start();
    });
    this.amb = pad;

    // machine hum — filtered saw, gain driven by active machine count
    const hum = c.createGain();
    hum.gain.value = 0;
    const hlp = c.createBiquadFilter();
    hlp.type = "lowpass";
    hlp.frequency.value = 220;
    hum.connect(hlp).connect(this.master);
    const ho = c.createOscillator();
    ho.type = "sawtooth";
    ho.frequency.value = 41;
    ho.connect(hum);
    ho.start();
    const ho2 = c.createOscillator();
    ho2.type = "sawtooth";
    ho2.frequency.value = 61.7;
    const hg2 = c.createGain();
    hg2.gain.value = 0.4;
    ho2.connect(hg2).connect(hum);
    ho2.start();
    this.hum = hum;
  },

  // n = number of machines actually running
  setActivity(n) {
    if (!this.hum) return;
    const target = Math.min(0.05, 0.006 * Math.sqrt(n));
    this.hum.gain.setTargetAtTime(target, this.ctx.currentTime, 0.7);
  },

  /* ---------- primitives ---------- */

  tone(opts) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime;
    const {
      f = 440, f2 = null, dur = 0.12, type = "sine",
      gain = 0.2, attack = 0.005, delay = 0,
    } = opts;
    const o = c.createOscillator();
    o.type = type;
    const g = c.createGain();
    o.frequency.setValueAtTime(f, t + delay);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + delay + dur);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(gain, t + delay + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g).connect(this.master);
    o.start(t + delay);
    o.stop(t + delay + dur + 0.03);
  },

  noise(opts) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t = c.currentTime;
    const { dur = 0.15, gain = 0.15, cut = 1200, sweep = null, delay = 0 } = opts;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(cut, t + delay);
    if (sweep) bp.frequency.exponentialRampToValueAtTime(Math.max(1, sweep), t + delay + dur);
    bp.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t + delay);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t + delay);
  },

  throttle(key, ms) {
    const now = performance.now();
    if (this._last[key] && now - this._last[key] < ms) return false;
    this._last[key] = now;
    return true;
  },

  /* ---------- the kit ---------- */

  tap()    { this.tone({ f: 520, f2: 640, dur: 0.05, type: "square", gain: 0.06 }); },
  sheet()  { this.tone({ f: 300, f2: 460, dur: 0.11, type: "sine", gain: 0.1 }); },
  close()  { this.tone({ f: 420, f2: 260, dur: 0.09, type: "sine", gain: 0.08 }); },
  deny()   { this.tone({ f: 150, f2: 90, dur: 0.16, type: "square", gain: 0.09 }); },

  // pitch climbs with the mining streak, so the ramp is audible
  mine(ramp) {
    this.noise({ dur: 0.09, gain: 0.1 + 0.06 * ramp, cut: 900 + 1400 * ramp, sweep: 300 });
    this.tone({ f: 160 + 220 * ramp, f2: 90 + 120 * ramp, dur: 0.1, type: "triangle", gain: 0.1 + 0.07 * ramp });
  },

  place() {
    this.tone({ f: 220, f2: 130, dur: 0.13, type: "triangle", gain: 0.16 });
    this.noise({ dur: 0.07, gain: 0.09, cut: 700, sweep: 200 });
  },

  demolish() {
    this.noise({ dur: 0.22, gain: 0.14, cut: 1500, sweep: 140 });
    this.tone({ f: 180, f2: 60, dur: 0.2, type: "sawtooth", gain: 0.09 });
  },

  // a machine finishing a craft — quiet and rate-limited, this fires a lot
  craft() {
    if (!this.throttle("craft", 110)) return;
    this.tone({ f: 620, f2: 780, dur: 0.045, type: "square", gain: 0.025 });
  },

  research() {
    [0, 0.07, 0.14].forEach((d, i) =>
      this.tone({ f: 440 * Math.pow(1.26, i), dur: 0.16, type: "triangle", gain: 0.11, delay: d }));
  },

  perk() {
    [0, 0.09, 0.18, 0.27].forEach((d, i) =>
      this.tone({ f: 330 * Math.pow(1.335, i), dur: 0.5, type: "sine", gain: 0.13, delay: d }));
  },

  core() {
    this.noise({ dur: 0.7, gain: 0.3, cut: 2600, sweep: 90 });
    this.tone({ f: 130, f2: 34, dur: 0.75, type: "sine", gain: 0.3 });
    this.tone({ f: 300, f2: 70, dur: 0.4, type: "sawtooth", gain: 0.1, delay: 0.03 });
  },

  upgrade() {
    this.tone({ f: 300, f2: 900, dur: 0.22, type: "triangle", gain: 0.14 });
  },
};
