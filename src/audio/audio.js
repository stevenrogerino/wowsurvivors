/* Sound. Everything is synthesised at play time through WebAudio - no audio
 * files ship with the game. Effects are short FM/noise hits; the score is a
 * per-zone generative loop (a drone, a slow chord bed, and an arpeggio whose
 * density follows how dangerous the run has become). */
'use strict';
(function (WS) {

  const Audio = {
    ctx: null,
    sfxGain: null,
    musicGain: null,
    ready: false,
    _music: null,
  };

  function now() { return Audio.ctx.currentTime; }

  /** Created on the first user gesture - browsers block audio before that. */
  Audio.init = function () {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    // A limiter across everything: a level-eight Storm of Steel can put forty
    // voices in flight, and without this the mix simply clips.
    this.master = this.ctx.createDynamicsCompressor();
    this.master.threshold.value = -14;
    this.master.knee.value = 24;
    this.master.ratio.value = 8;
    this.master.attack.value = 0.004;
    this.master.release.value = 0.18;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    // The score sits behind a duck stage, so a boss horn or a level-up pushes
    // it down rather than talking over it.
    this.duck = this.ctx.createGain();
    this.duck.gain.value = 1;
    this.sfxGain.connect(this.master);
    this.musicGain.connect(this.duck);
    this.duck.connect(this.master);
    this.applySettings();
    this.ready = true;
  };

  Audio.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.applySettings = function () {
    if (!this.ctx) return;
    const s = WS.Save.settings;
    this.sfxGain.gain.value = s.sound ? s.effectsVolume * 0.6 : 0;
    this.musicGain.gain.value = s.music ? s.musicVolume * 0.35 : 0;
  };

  /* ------------------------------------------------------------ primitives */
  function env(node, t0, attack, decay, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(WS.max(0.0001, peak), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(opts) {
    const ctx = Audio.ctx;
    if (!ctx) return;
    const t0 = now() + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(WS.max(20, opts.to), t0 + (opts.slide || opts.decay));
    let last = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter; f.frequency.value = opts.cutoff || 1200;
      osc.connect(f); last = f;
    }
    last.connect(gain);
    gain.connect(opts.bus || Audio.sfxGain);
    env(gain, t0, opts.attack || 0.005, opts.decay || 0.15, opts.gain === undefined ? 0.3 : opts.gain);
    osc.start(t0);
    osc.stop(t0 + (opts.attack || 0.005) + (opts.decay || 0.15) + 0.05);
  }

  let noiseBuffer = null;
  function noise(opts) {
    const ctx = Audio.ctx;
    if (!ctx) return;
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = now() + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 900, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(WS.max(40, opts.to), t0 + (opts.decay || 0.2));
    f.Q.value = opts.q === undefined ? 1.2 : opts.q;
    const gain = ctx.createGain();
    src.connect(f); f.connect(gain); gain.connect(opts.bus || Audio.sfxGain);
    env(gain, t0, opts.attack || 0.004, opts.decay || 0.2, opts.gain === undefined ? 0.25 : opts.gain);
    src.start(t0);
    src.stop(t0 + (opts.attack || 0.004) + (opts.decay || 0.2) + 0.05);
  }

  /* ---------------------------------------------------------------- kits -- */
  // Voices are throttled: a level-ten Storm of Steel can land 40 hits a tick,
  // and 40 simultaneous oscillators is both inaudible mush and a CPU stall.
  const lastPlayed = Object.create(null);
  const THROTTLE = {
    hit: 0.045, crit: 0.07, gem: 0.06, cast: 0.05, enemyHit: 0.06,
    explode: 0.09, freeze: 0.2, coin: 0.08,
  };

  const KITS = {
    cast() { tone({ type: 'triangle', freq: 520, to: 780, decay: 0.10, gain: 0.10 }); },
    hit() { noise({ freq: 1500, to: 500, decay: 0.07, gain: 0.10, q: 0.8 }); },
    crit() {
      noise({ freq: 2400, to: 700, decay: 0.11, gain: 0.16, q: 0.9 });
      tone({ type: 'square', freq: 880, to: 1600, decay: 0.09, gain: 0.07 });
    },
    enemyHit() { noise({ freq: 700, to: 220, decay: 0.10, gain: 0.13, filter: 'lowpass', q: 0.6 }); },
    playerHurt() {
      tone({ type: 'sawtooth', freq: 220, to: 90, decay: 0.28, gain: 0.22, filter: 'lowpass', cutoff: 900 });
      noise({ freq: 400, to: 120, decay: 0.22, gain: 0.16, filter: 'lowpass' });
    },
    gem() { tone({ type: 'sine', freq: 1180, to: 1560, decay: 0.09, gain: 0.07 }); },
    coin() {
      tone({ type: 'square', freq: 1400, decay: 0.05, gain: 0.06 });
      tone({ type: 'square', freq: 2100, decay: 0.07, gain: 0.05, delay: 0.05 });
    },
    potion() {
      tone({ type: 'sine', freq: 400, to: 900, decay: 0.25, gain: 0.14 });
      tone({ type: 'sine', freq: 600, to: 1350, decay: 0.3, gain: 0.09, delay: 0.05 });
    },
    chest() {
      for (let i = 0; i < 5; i++) {
        tone({ type: 'square', freq: 900 + i * 240, decay: 0.10, gain: 0.05, delay: i * 0.045 });
      }
    },
    level() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone({ type: 'triangle', freq: f, decay: 0.45, gain: 0.13, delay: i * 0.07 }));
    },
    evolve() {
      const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => tone({ type: 'sawtooth', freq: f, decay: 0.5, gain: 0.09, delay: i * 0.06, filter: 'lowpass', cutoff: 2600 }));
      noise({ freq: 3000, to: 400, decay: 0.7, gain: 0.10 });
    },
    boss() {
      tone({ type: 'sawtooth', freq: 82, to: 55, decay: 1.6, gain: 0.28, filter: 'lowpass', cutoff: 500 });
      tone({ type: 'sawtooth', freq: 123, to: 82, decay: 1.4, gain: 0.18, filter: 'lowpass', cutoff: 700, delay: 0.1 });
      noise({ freq: 200, to: 70, decay: 1.2, gain: 0.12, filter: 'lowpass' });
    },
    explode() {
      noise({ freq: 900, to: 60, decay: 0.55, gain: 0.32, filter: 'lowpass', q: 0.5 });
      tone({ type: 'sine', freq: 120, to: 40, decay: 0.5, gain: 0.20 });
    },
    freeze() {
      tone({ type: 'sine', freq: 1800, to: 300, decay: 0.8, gain: 0.14 });
      noise({ freq: 4000, to: 900, decay: 0.7, gain: 0.10 });
    },
    death() {
      tone({ type: 'sawtooth', freq: 200, to: 40, decay: 1.8, gain: 0.3, filter: 'lowpass', cutoff: 600 });
      noise({ freq: 300, to: 50, decay: 1.6, gain: 0.16, filter: 'lowpass' });
    },
    victory() {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      notes.forEach((f, i) => tone({ type: 'triangle', freq: f, decay: 0.7, gain: 0.14, delay: i * 0.12 }));
    },
    ui() { tone({ type: 'square', freq: 660, decay: 0.05, gain: 0.05 }); },
    select() { tone({ type: 'square', freq: 880, to: 1200, decay: 0.09, gain: 0.06 }); },
    warn() {
      tone({ type: 'square', freq: 330, decay: 0.2, gain: 0.12 });
      tone({ type: 'square', freq: 330, decay: 0.2, gain: 0.12, delay: 0.24 });
    },
  };

  // How far each kit pushes the score down, and for how long.
  const DUCK = {
    boss: [0.28, 1.6], evolve: [0.4, 1.1], level: [0.4, 0.9],
    victory: [0.3, 1.8], death: [0.25, 1.8], explode: [0.55, 0.5], warn: [0.5, 0.7],
  };

  Audio.play = function (kit) {
    if (!this.ctx || !WS.Save.settings.sound) return;
    const t = this.ctx.currentTime;
    const gap = THROTTLE[kit];
    if (gap) {
      if (lastPlayed[kit] && t - lastPlayed[kit] < gap) return;
      lastPlayed[kit] = t;
    }
    const d = DUCK[kit];
    if (d && this.duck) {
      const [floor, hold] = d;
      try {
        this.duck.gain.cancelScheduledValues(t);
        this.duck.gain.setValueAtTime(this.duck.gain.value, t);
        this.duck.gain.linearRampToValueAtTime(floor, t + 0.06);
        this.duck.gain.setValueAtTime(floor, t + hold * 0.5);
        this.duck.gain.linearRampToValueAtTime(1, t + hold);
      } catch (e) { /* scheduling raced a context change */ }
    }
    const fn = KITS[kit];
    if (fn) { try { fn(); } catch (e) { /* audio graph exhausted */ } }
  };

  /* --------------------------------------------------------------- music -- */
  // Each zone gets a mode and a root. The loop schedules one bar ahead on a
  // rAF-driven pump so it never drifts and costs nothing when muted.
  const SCORES = {
    forest: { root: 146.83, scale: [0, 2, 4, 7, 9], wave: 'triangle', tempo: 1.6 },   // D major pentatonic
    plains: { root: 130.81, scale: [0, 2, 3, 7, 9], wave: 'triangle', tempo: 1.5 },   // C dorian-ish
    cursed: { root: 110.00, scale: [0, 1, 3, 7, 8], wave: 'sine', tempo: 1.9 },       // A phrygian
    savannah: { root: 123.47, scale: [0, 2, 5, 7, 10], wave: 'sawtooth', tempo: 1.4 },
    glacier: { root: 98.00, scale: [0, 3, 5, 7, 10], wave: 'sine', tempo: 2.0 },      // G minor
    eclipse: { root: 87.31, scale: [0, 1, 4, 6, 8], wave: 'sawtooth', tempo: 1.3 },   // F altered
    menu: { root: 130.81, scale: [0, 3, 5, 7, 10], wave: 'triangle', tempo: 2.2 },
  };

  function semitone(root, n) { return root * Math.pow(2, n / 12); }

  Audio.playMusic = function (key) {
    if (!this.ctx) return;
    if (this._music && this._music.key === key) return;
    this.stopMusic();
    const score = SCORES[key] || SCORES.menu;
    const ctx = this.ctx;

    const bed = ctx.createGain();
    bed.gain.value = 0.5;
    bed.connect(this.musicGain);

    // A continuous drone under everything - the "obsidian" of the score.
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass'; droneFilter.frequency.value = 420;
    drone.type = 'sawtooth';
    drone.frequency.value = score.root / 2;
    droneGain.gain.value = 0.12;
    drone.connect(droneFilter); droneFilter.connect(droneGain); droneGain.connect(bed);
    drone.start();

    const state = { key, bed, drone, step: 0, nextTime: ctx.currentTime + 0.1, timer: null, intensity: 0 };

    state.timer = setInterval(() => {
      if (!Audio.ctx || Audio.ctx.state === 'closed') return;
      const beat = score.tempo / 2;
      while (state.nextTime < Audio.ctx.currentTime + 1.0) {
        const t0 = state.nextTime;
        const s = state.step;
        const deg = score.scale[(s * 3) % score.scale.length];
        const oct = ((s / 4) | 0) % 2 ? 12 : 0;
        // Arpeggio - denser as the run gets hairier.
        if (s % 2 === 0 || state.intensity > 0.5) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = score.wave;
          osc.frequency.value = semitone(score.root * 2, deg + oct);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.07 + state.intensity * 0.05, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + beat * 1.6);
          osc.connect(g); g.connect(bed);
          osc.start(t0); osc.stop(t0 + beat * 1.7);
        }
        // Chord bed every four steps.
        if (s % 4 === 0) {
          for (const iv of [0, 7, state.intensity > 0.6 ? 10 : 12]) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = semitone(score.root, deg + iv);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.3);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + beat * 4);
            osc.connect(g); g.connect(bed);
            osc.start(t0); osc.stop(t0 + beat * 4.2);
          }
        }
        state.nextTime += beat;
        state.step++;
      }
    }, 250);

    this._music = state;
  };

  /** 0..1 - drives arpeggio density and chord colour as danger climbs. */
  Audio.setIntensity = function (v) {
    if (this._music) this._music.intensity = WS.clamp(v, 0, 1);
  };

  Audio.stopMusic = function () {
    const m = this._music;
    if (!m) return;
    clearInterval(m.timer);
    try {
      m.bed.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      m.drone.stop(this.ctx.currentTime + 1.2);
    } catch (e) { /* already stopped */ }
    this._music = null;
  };

  WS.Audio = Audio;

})(window.WS);
