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
    /* The key the game last ASKED for, kept apart from _music, which is what
     * is actually sounding. Turning music off in the settings used to leave
     * the score running into a gain of zero: measured, a muted game still
     * built ten nodes and five notes every two and a half seconds, forever,
     * plus a drone oscillator that never stopped. The player paid for music
     * they had switched off. With the request remembered separately, the
     * switch can stop the score outright and start the right zone's score
     * again when it goes back on. */
    wanted: null,
    /** Where the current voice is placed in the field, if anywhere. */
    voiceBus: null,
  };

  function now() { return Audio.ctx.currentTime; }

  /** True only when the clock is actually moving.
   *
   *  Everything below schedules against ctx.currentTime, and a suspended
   *  context - a hidden tab, a locked phone, an incoming call - freezes that
   *  clock without refusing the work. Measured: twelve level-up fanfares
   *  played while suspended built 96 nodes and queued 48 oscillators, every
   *  one of them stamped with the same instant, so they would have arrived as
   *  a single blast the moment the player came back. Asking whether the clock
   *  is running is the difference between a sound and an ambush. */
  function live() { return Audio.ctx && Audio.ctx.state === 'running'; }

  /** How loud the game's own chatter is allowed to be, against everything
   *  else. One number, in one place, and nothing can exceed it. */
  const CHATTER_LEVEL = 0.8;
  /** ...and how far under that it goes when something important speaks. */
  const CHATTER_DUCK = 0.45;

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

    /* CHATTER HAS ITS OWN BUS, AND A CEILING.
     *
     * Hits, kills, gems and casts are the game talking to itself, and late in
     * a run there are a lot of them: the old throttle allowed twenty-two hits,
     * sixteen kills and twenty casts a second, forever, every one at the same
     * gain. That is not feedback, it is a wall - and the sounds that actually
     * matter, a level, a boss horn, being hurt, had to fight it on equal
     * terms because everything shared one bus.
     *
     * Putting the chatter behind its own compressor and its own gain makes the
     * important sounds louder than it BY CONSTRUCTION rather than by luck. The
     * compressor is doing the job a compressor is for - the more of it there
     * is at once, the harder it is squashed - and the gain caps what share of
     * the mix it can ever have. Which is what makes it safe to be generous
     * with the density: it physically cannot take over. */
    this.chatter = this.ctx.createDynamicsCompressor();
    this.chatter.threshold.value = -30;
    this.chatter.knee.value = 18;
    this.chatter.ratio.value = 12;
    this.chatter.attack.value = 0.003;
    this.chatter.release.value = 0.14;
    this.chatterGain = this.ctx.createGain();
    /* Chatter sits a step back from everything else, permanently. This is the
       number that decides what share of the mix the game's own background
       noise is allowed to have, and having it in one place is the entire
       reason for the bus. */
    this.chatterGain.gain.value = CHATTER_LEVEL;
    this.chatter.connect(this.chatterGain);
    // The score sits behind a duck stage, so a boss horn or a level-up pushes
    // it down rather than talking over it.
    this.duck = this.ctx.createGain();
    this.duck.gain.value = 1;
    this.sfxGain.connect(this.master);
    this.chatterGain.connect(this.sfxGain);
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
    // A switch that only turns the volume down is not a switch.
    if (!s.music) this.stopMusic();
    else if (this.wanted && !this._music) this.startScore(this.wanted);
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
    /* Audio.pitch spreads repeats apart. Twenty identical bursts a second stack
       into one steady tone; the same twenty scattered across a band read as a
       texture, and the ear stops hearing them as a machine. It is set per play
       and widens with how much is happening. */
    const pq = Audio.pitch;
    osc.frequency.setValueAtTime(opts.freq * pq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(WS.max(20, opts.to * pq), t0 + (opts.slide || opts.decay));
    let last = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter; f.frequency.value = opts.cutoff || 1200;
      osc.connect(f); last = f;
    }
    last.connect(gain);
    gain.connect(opts.bus || Audio.voiceBus || Audio.sfxGain);
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
    const pq = Audio.pitch;
    f.frequency.setValueAtTime((opts.freq || 900) * pq, t0);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(WS.max(40, opts.to * pq), t0 + (opts.decay || 0.2));
    f.Q.value = opts.q === undefined ? 1.2 : opts.q;
    const gain = ctx.createGain();
    src.connect(f); f.connect(gain); gain.connect(opts.bus || Audio.voiceBus || Audio.sfxGain);
    env(gain, t0, opts.attack || 0.004, opts.decay || 0.2, opts.gain === undefined ? 0.25 : opts.gain);
    src.start(t0);
    src.stop(t0 + (opts.attack || 0.004) + (opts.decay || 0.2) + 0.05);
  }

  /* --------------------------------------------------------------- place -- */
  /* The whole battlefield is on screen at once - there is no camera to scroll
   * - so a sound's x IS its x on the player's monitor, and placing it in the
   * stereo field costs one node and needs no bookkeeping. In a game whose
   * entire threat model is "they come from every side", hearing which side is
   * information the player was previously not being given at all.
   *
   * SPREAD is the distance at which a sound reaches the edge of the field, and
   * LIMIT stops anything reaching one ear alone: a hard-panned mono voice is
   * unpleasant on headphones and reads as a fault rather than a direction. */
  const SPREAD = 420, LIMIT = 0.75;

  function placeAt(x, dest) {
    const ctx = Audio.ctx;
    const p = WS.Game && WS.Game.player;
    if (!ctx || !ctx.createStereoPanner || typeof x !== 'number' || !p) return null;
    const pan = WS.clamp((x - p.x) / SPREAD, -1, 1) * LIMIT;
    const node = ctx.createStereoPanner();
    node.pan.value = pan;
    node.connect(dest || Audio.sfxGain);
    return node;
  }

  /* ---------------------------------------------------------------- kits -- */
  // Voices are throttled: a level-ten Storm of Steel can land 40 hits a tick,
  // and 40 simultaneous oscillators is both inaudible mush and a CPU stall.
  const lastPlayed = Object.create(null);
  const THROTTLE = {
    hit: 0.045, crit: 0.07, gem: 0.06, cast: 0.05, enemyHit: 0.06,
    explode: 0.09, freeze: 0.2, coin: 0.08, hover: 0.045,
  };

  /* The kits that are the game talking to itself, rather than telling you
   * something. These go through the chatter bus and get the treatment below;
   * everything else - a level, a boss, being hurt - goes straight through. */
  const CHATTER = { hit: 1, crit: 1, enemyHit: 1, gem: 1, cast: 1, coin: 1 };

  /* Events that arrived while a kit was throttled. They used to be dropped,
   * which is the whole problem: forty hits landing in one tick sounded exactly
   * like two, so the player learned nothing from the difference. Counting them
   * turns a discarded event into information about the next voice. */
  const waiting = Object.create(null);
  const HEFT = 8;          // events in one gap that count as a full clump

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
    /* The sound of the cursor finding something. Deliberately almost nothing -
       a quarter the gain of a click and half its length - because it fires
       every time the mouse crosses a tile and anything louder becomes a
       machine gun. It is throttled harder than any combat voice for the same
       reason: sweeping a cursor across a roster is forty hovers a second. */
    hover() { tone({ type: 'sine', freq: 1180, decay: 0.028, gain: 0.014 }); },
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

  /** @param {string} kit  @param {number} [x] world x, to place it in the field. */
  Audio.pitch = 1;

  Audio.play = function (kit, x) {
    if (!live() || !WS.Save.settings.sound) return;
    const t = this.ctx.currentTime;
    const chatter = CHATTER[kit];
    const gap = THROTTLE[kit];
    /* LATELY, not ever.
     *
     * The backlog only grows while a kit is being throttled, but it did not
     * shrink on its own - so after clearing a room, walking away and coming
     * back, the very next single hit carried the weight of the two hundred
     * before it and landed like a hammer for no reason. A count of what has
     * been happening has to be a count of what has been happening RECENTLY;
     * a long enough silence means the backlog is about a moment that has
     * passed. */
    if (chatter && gap && waiting[kit]
        && t - (lastPlayed[kit] || 0) > gap * 3) {
      waiting[kit] = 0;
    }
    /* How much has been happening in this kit lately, 0 to 1. Everything below
       reads the run's density through this one number. */
    const heft = chatter ? WS.min(1, (waiting[kit] || 0) / HEFT) : 0;
    if (gap) {
      /* The gap WIDENS as it gets busy, and the voice gets heavier to match.
       * A fixed gap is a rate limit: it caps how often, never how loud, so a
       * crowded field is the same twenty-two ticks a second as a quiet one and
       * the player cannot hear the difference between killing three things and
       * three hundred. Spacing the clumps out and making each one bigger says
       * more with fewer voices - which is the whole trade. */
      if (lastPlayed[kit] && t - lastPlayed[kit] < gap * (1 + 0.9 * heft)) {
        if (chatter) waiting[kit] = (waiting[kit] || 0) + 1;   // remembered, not lost
        return;
      }
      lastPlayed[kit] = t;
    }
    const d = DUCK[kit];
    if (d && this.duck) {
      const [floor, hold] = d;
      /* Duck the CHATTER as well as the score. A boss horn arriving over a
         wall of hit ticks was previously fighting them at equal level, because
         ducking only ever applied to the music - and the music was never the
         thing drowning it. */
      const dip = (node, to, back) => {
        try {
          node.gain.cancelScheduledValues(t);
          node.gain.setValueAtTime(node.gain.value, t);
          node.gain.linearRampToValueAtTime(to, t + 0.06);
          node.gain.setValueAtTime(to, t + hold * 0.5);
          node.gain.linearRampToValueAtTime(back, t + hold);
        } catch (e) { /* scheduling raced a context change */ }
      };
      dip(this.duck, floor, 1);
      /* HARDER than the music, because the music was never the thing drowning
         it. Measured: a level-up over a full wall of hits, kills, casts and
         gems peaked seven per cent BELOW the wall - it was inaudible in the
         moment it exists for. */
      if (this.chatterGain) {
        dip(this.chatterGain, CHATTER_LEVEL * floor * CHATTER_DUCK, CHATTER_LEVEL);
      }
    }
    const fn = KITS[kit];
    if (!fn) return;
    // The kits take no arguments by design - they are recipes, not routers - so
    // the destination is handed to them through voiceBus, which every voice in
    // the kit picks up. Synchronous, so it cannot be seen by anything else.
    let dest = this.sfxGain;
    if (chatter) {
      waiting[kit] = 0;
      /* One voice, carrying what the ones it replaced would have said: louder
         and lower for a clump, light and bright for a single event. The player
         hears the difference between three kills and thirty without hearing
         thirty sounds. */
      const shape = this.ctx.createGain();
      shape.gain.value = 1 + 1.1 * heft;
      shape.connect(this.chatter);
      dest = shape;
      this.pitch = (1 - 0.26 * heft)
        * (1 + (Math.random() - 0.5) * (0.05 + 0.3 * heft));
      /* What the last chatter voice was shaped into. Exposed because it is the
         only way to measure from outside that a clump sounds different from a
         single event - the voice itself is gone by the time anything could
         look at it. */
      this.lastShape = { kit, heft, gain: shape.gain.value, pitch: this.pitch };
    }
    this.voiceBus = placeAt(x, dest) || dest;
    try { fn(); } catch (e) { /* audio graph exhausted */ }
    finally { this.voiceBus = null; this.pitch = 1; }
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

  /** What the game asks for. Whether it sounds is the settings' business. */
  Audio.playMusic = function (key) {
    if (!this.ctx) return;
    this.wanted = key;
    if (!WS.Save.settings.music) { this.stopMusic(); return; }
    this.startScore(key);
  };

  Audio.startScore = function (key) {
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

    const state = { key, bed, drone, step: 0, nextTime: ctx.currentTime + 0.1, timer: null,
      intensity: 0, want: 0 };

    state.timer = setInterval(() => {
      // A stopped clock schedules nothing: while the context is suspended the
      // pump would otherwise pile a second of the score onto a single instant.
      if (!live()) return;
      /* Ease toward the danger the game reports rather than snapping to it.
       *
       * The driver is sampled every frame off a crowd count that swings by
       * dozens between one wave and the next, and a score that tracked it
       * exactly would flutter. Danger also arrives faster than it leaves - a
       * boss walks on in a moment and the room takes a while to settle after
       * it dies - so the climb is twice the fall. */
      {
        const dt = 0.25;
        const gap = state.want - state.intensity;
        const rate = gap > 0 ? 0.9 : 0.45;
        state.intensity = WS.clamp(state.intensity + WS.clamp(gap, -rate * dt, rate * dt), 0, 1);
      }
      const beat = score.tempo / 2;
      /* Never try to make up lost time.
       *
       * This is a look-ahead scheduler on a 250ms interval, and an interval
       * that does not run - a GC pause, a background tab where the browser
       * clamps timers to a second or a minute, a laptop lid - leaves nextTime
       * behind the clock. The loop below would then honour every beat it
       * missed, each stamped with a moment already gone, and WebAudio starts a
       * note scheduled in the past immediately. Measured: a three-second stall
       * fired a note 1.42 seconds late, and a minute in a background tab would
       * empty seventy-odd notes into one chord. So when the score has fallen
       * behind, it picks up from HERE. A generative loop has no place it must
       * be; the only thing the player can hear is the clump. */
      if (state.nextTime < Audio.ctx.currentTime) {
        state.nextTime = Audio.ctx.currentTime + 0.05;
      }
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
        /* A pulse under the bed once things are actually bad. Intensity used
           to change three things - whether the arpeggio played on odd steps,
           its gain by a twentieth, and one interval in the chord - which is
           not enough to hear across a room. This is the one that is felt
           rather than heard, and it only exists above the halfway mark, so
           its arrival is itself the signal. */
        if (state.intensity > 0.5 && s % 2 === 0) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(semitone(score.root / 2, 0), t0);
          osc.frequency.exponentialRampToValueAtTime(semitone(score.root / 2, -5), t0 + beat);
          const peak = 0.05 + 0.10 * (state.intensity - 0.5) * 2;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(peak, t0 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + beat * 0.9);
          osc.connect(g); g.connect(bed);
          osc.start(t0); osc.stop(t0 + beat);
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

  /** 0..1 - how bad it is out there, from Game.danger.
   *
   *  Sets a TARGET; the pump eases toward it. Writing straight to intensity
   *  meant the score tracked a crowd count that swings by dozens between
   *  waves, which reads as flutter rather than as tension. */
  Audio.setIntensity = function (v) {
    if (this._music) this._music.want = WS.clamp(v, 0, 1);
  };

  /** What the score is actually playing at, after easing. For measurement. */
  Audio.intensity = function () { return this._music ? this._music.intensity : 0; };

  Audio.stopMusic = function () {
    const m = this._music;
    if (!m) return;
    clearInterval(m.timer);
    try {
      m.bed.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      m.drone.stop(this.ctx.currentTime + 1.2);
      // Let go of the bed once it has faded, so the graph does not keep a
      // silent branch per zone the player has visited.
      setTimeout(() => { try { m.bed.disconnect(); } catch (e) { /* gone */ } }, 1500);
    } catch (e) { /* already stopped */ }
    this._music = null;
  };

  /* ---------------------------------------------------------- attention -- */
  /** Called when the page is hidden or shown.
   *
   *  Hiding stops the clock outright rather than leaving a drone playing into
   *  a room the player has walked away from - and, with the guards above, it
   *  also means nothing is scheduled while they are gone, so coming back is
   *  silent until something actually happens. */
  Audio.setAttentive = function (attentive) {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      if (attentive) { if (ctx.state === 'suspended') ctx.resume(); }
      else if (ctx.state === 'running') ctx.suspend();
    } catch (e) { /* the context is closing */ }
  };

  WS.Audio = Audio;

})(window.WS);
