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
  /** One buffer of white noise, shared by every voice that needs any. */
  function noiseBuf() {
    const ctx = Audio.ctx;
    if (!noiseBuffer && ctx) {
      /* ELEVEN SECONDS, not 1.2.
       *
       * This buffer is both every noise-based sound effect in the game AND
       * the looping weather bed under every zone, and at 1.2s the bed's
       * envelope autocorrelated at 0.90 against itself one loop later, with
       * harmonics at 2.4, 3.6 and 4.8. That is a texture that repeats fifty
       * times a minute, which is exactly what a grainy hum IS - the filter
       * drifting over the top of it never touched the period underneath.
       *
       * 11.3 is deliberately not a round number and not a multiple of any
       * bar length in SCORES, so nothing in the music lines up with it. */
      noiseBuffer = ctx.createBuffer(1, WS.floor(ctx.sampleRate * 11.3), ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function noise(opts) {
    const ctx = Audio.ctx;
    if (!ctx) return;
    noiseBuf();
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
    /* START SOMEWHERE ELSE IN IT, every time.
     *
     * src.start(t0) with no offset reads from sample zero, so every hit,
     * every crit and every explosion in the game was playing the IDENTICAL
     * waveform - the same 200ms of the same noise, over and over, hundreds of
     * times a minute. The envelope and the filter varied; the grain did not,
     * and the grain is what the ear locks onto. One argument fixes it and it
     * costs nothing. */
    src.start(t0, Math.random() * (noiseBuffer.duration - 1));
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
    /* `warn` is the only one of these that also DUCKS - it pulls the whole mix
       to half for seven tenths of a second, because a charge committing is
       worth hearing over everything else. That is true of one charge and a
       lie about several: two elites and a boss committing inside a second
       would duck the mix three times over and each one would sound like the
       last one stuttering. A second warning inside a third of a second tells
       the player nothing the first did not. */
    warn: 0.34,
  };

  /* The kits that are the game talking to itself, rather than telling you
   * something. These go through the chatter bus and get the treatment below;
   * everything else - a level, a boss, being hurt - goes straight through. */
  const CHATTER = { hit: 1, crit: 1, enemyHit: 1, gem: 1, cast: 1, coin: 1 };

  /** How far a kit's pitch is allowed to wander, each time it plays.
   *
   *  Pitch jitter existed, but only on the chatter kits and only as a
   *  function of how CROWDED the field was: `(Math.random() - 0.5) * (0.05 +
   *  0.3 * heft)`. At heft zero - one hit, one kill, one gem, which is most
   *  of a run - that is a total spread of five per cent, or about four fifths
   *  of a semitone across the whole range. Inaudible. And every kit outside
   *  the chatter set got nothing at all: an explosion may fire eleven times a
   *  second through its throttle and every one of those eleven was the
   *  identical waveform at the identical pitch.
   *
   *  A repeated sound is not annoying because it is loud or because it is
   *  often. It is annoying because it is IDENTICAL - the ear stops hearing an
   *  event and starts hearing a mechanism. So every kit that fires more than
   *  once in a while gets a real spread here, widest on the ones made of
   *  noise (where the number is a filter cutoff and moving it reads as a
   *  different impact, not a different note) and narrowest on the ones made
   *  of tuned tones.
   *
   *  The kits NOT listed are fixed on purpose. level, evolve, victory, boss
   *  and death are melodies - short ones, but melodies - and a melody whose
   *  pitch moves between plays is a melody that is out of tune. Those are
   *  also the kits a player hears a handful of times a run rather than a
   *  hundred, so they have no repetition problem to solve. */
  const VARY = {
    // noise-led: the number is a cutoff, so this is impact weight, not key
    hit: 0.15, enemyHit: 0.17, crit: 0.12, explode: 0.22, freeze: 0.14,
    playerHurt: 0.13,
    // tone-led: kept inside a semitone or so, because these are pitched
    cast: 0.08, gem: 0.10, coin: 0.06, potion: 0.11, chest: 0.09,
    // interface: barely there, but a click that is bit-identical forty times
    // in a row is the most machine-like sound in the game
    ui: 0.03, hover: 0.045, select: 0.035, warn: 0.04,
  };

  /** One draw of a value inside +/- `amt` of itself. Articulation, not pitch:
   *  how long an impact rings and how tight its filter is vary from blow to
   *  blow in anything real, and varying them INDEPENDENTLY of the pitch is
   *  what stops a jittered sound reading as one sound on a slider. */
  function vary(v, amt) { return v * (1 + (Math.random() - 0.5) * 2 * amt); }

  /* Events that arrived while a kit was throttled. They used to be dropped,
   * which is the whole problem: forty hits landing in one tick sounded exactly
   * like two, so the player learned nothing from the difference. Counting them
   * turns a discarded event into information about the next voice. */
  const waiting = Object.create(null);
  const HEFT = 8;          // events in one gap that count as a full clump

  /* The clump above solves a BURST: forty hits in one tick reads as one heavy
   * voice instead of forty identical ones. It says nothing about a SIEGE -
   * ten straight minutes of a Storm of Steel build against a packed field
   * throttles to the same clumped voice, at the same rate, at the same gain,
   * for the whole ten minutes, because heft only ever measures the last
   * instant. A sound stops being information and starts being a machine
   * hum well before ten minutes; it is the SAME sound, however heavy each
   * one is shaped, and a hum does not announce itself by getting louder.
   *
   * So a second, much slower clock: how long a kit has gone WITHOUT the
   * break that already resets its backlog above - the same "lately, not
   * ever" signal, read on a longer fuse. FATIGUE_GRACE is how long that is
   * allowed to run before anything gives, because a fifteen-second push
   * against a wave is not what needs relieving. Past it, the gap between
   * voices widens further and each voice sits a little lower, both easing
   * back toward the quiet a burst already gets on release - not silence,
   * and not a lower ceiling on how loud a real clump may read, just a
   * longer fight costing a bit less to listen to than its first few seconds
   * did.
   *
   * FATIGUE_GAP has a ceiling of its own: the widening it adds stacks with
   * heft's, and if the combined gap ever reached the "lately, not ever"
   * reset's OWN threshold, the mechanism would trip itself - the widened
   * silence between voices would look like the break that is supposed to
   * mean the siege ended. Measured hammering one kit for forty straight
   * seconds with no real gap in the calls: at 0.8 the reset fired anyway,
   * every fifteen-odd seconds, and fatigue sawed between 0 and 0.4 instead
   * of climbing. Worst case is heft at its own ceiling and fatigue at 1,
   * which widens the gap by 1.9 x (1 + FATIGUE_GAP); at 0.45 that tops out
   * at 2.76x against the reset's 3x, with headroom to spare. */
  const sustainStart = Object.create(null);
  const lastGap = Object.create(null);    // the widened gap actually used, last fire
  const FATIGUE_GRACE = 5;      // seconds at full clump before fatigue starts
  const FATIGUE_WINDOW = 25;    // seconds more to reach full fatigue
  const FATIGUE_GAP = 0.45;     // the gap widens by up to this much more
  const FATIGUE_GAIN = 0.22;    // and the voice gives back up to this much gain

  const KITS = {
    /* The five kits below carry most of a run between them, so they are also
       the five where articulation moves per play and not just pitch. How long
       an impact rings and how tight its filter is vary from blow to blow in
       anything real; holding them fixed while sliding the pitch is what makes
       a jittered sound read as ONE sound on a slider rather than as a series
       of separate events. */
    cast() { tone({ type: 'triangle', freq: 520, to: 780, decay: vary(0.10, 0.25), gain: 0.10 }); },
    hit() { noise({ freq: 1500, to: vary(500, 0.25), decay: vary(0.07, 0.30), gain: 0.10, q: vary(0.8, 0.35) }); },
    crit() {
      noise({ freq: 2400, to: vary(700, 0.22), decay: vary(0.11, 0.25), gain: 0.16, q: vary(0.9, 0.30) });
      tone({ type: 'square', freq: 880, to: 1600, decay: vary(0.09, 0.20), gain: 0.07 });
    },
    enemyHit() { noise({ freq: 700, to: vary(220, 0.30), decay: vary(0.10, 0.30), gain: 0.13, filter: 'lowpass', q: vary(0.6, 0.35) }); },
    playerHurt() {
      tone({ type: 'sawtooth', freq: 220, to: vary(90, 0.22), decay: vary(0.28, 0.22), gain: 0.22, filter: 'lowpass', cutoff: vary(900, 0.25) });
      noise({ freq: 400, to: 120, decay: vary(0.22, 0.25), gain: 0.16, filter: 'lowpass' });
    },
    gem() { tone({ type: 'sine', freq: 1180, to: vary(1560, 0.16), decay: vary(0.09, 0.28), gain: 0.07 }); },
    coin() {
      tone({ type: 'square', freq: 1400, decay: 0.05, gain: 0.06 });
      tone({ type: 'square', freq: 2100, decay: 0.07, gain: 0.05, delay: 0.05 });
    },
    potion() {
      /* The swell is the sound, so the swell is what moves: where it arrives
         and how long it takes, not just what key it starts in. Pitch alone on
         two sine sweeps measured 2.4 against a floor of 1.6 and drew 1.5 once
         - too close to "identical" to call it varied. */
      tone({ type: 'sine', freq: 400, to: vary(900, 0.18), decay: vary(0.25, 0.28), gain: 0.14 });
      tone({ type: 'sine', freq: 600, to: vary(1350, 0.18), decay: vary(0.3, 0.28), gain: 0.09, delay: vary(0.05, 0.4) });
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
      noise({ freq: 900, to: 60, decay: vary(0.55, 0.22), gain: 0.32, filter: 'lowpass', q: vary(0.5, 0.3) });
      tone({ type: 'sine', freq: 120, to: 40, decay: vary(0.5, 0.20), gain: 0.20 });
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
    /* The threshold itself has to be AT LEAST as wide as the gap fatigue was
       using, not the bare unwidened one - fatigue widens the true spacing
       between voices well past the base gap on purpose, and comparing that
       widened spacing against a fixed 3x of the NARROW gap means the siege's
       own throttling eventually looks like the silence that is supposed to
       mean it ended. Measured hammering one kit with no real gap in the
       calls at all: fatigue climbed for fifteen-odd seconds and then reset
       itself, every time, once its own widening crossed the fixed line. */
    const resetAt = WS.max(gap, lastGap[kit] || 0) * 3;
    if (chatter && gap && (waiting[kit] || sustainStart[kit])
        && t - (lastPlayed[kit] || 0) > resetAt) {
      waiting[kit] = 0;
      sustainStart[kit] = null;   // the streak broke; fatigue breaks with it
    }
    /* How much has been happening in this kit lately, 0 to 1. Everything below
       reads the run's density through this one number. */
    const heft = chatter ? WS.min(1, (waiting[kit] || 0) / HEFT) : 0;
    /* And how long this kit has gone WITHOUT the break that resets it above -
     * see FATIGUE above.
     *
     * This used to be gated on heft alone: fatigue only ran while heft sat at
     * its ceiling. But heft is `waiting[kit] / HEFT`, and waiting is zeroed
     * the instant a voice actually fires - so heft is a sawtooth, 0 again for
     * every call right after each voice and only climbing back toward 1 as
     * the next backlog builds. Gating on it meant fatigue was wiped by the
     * very voices it was supposed to be building from: hammering `hit` for
     * forty seconds measured fatigue at 0 the entire time. The signal that
     * actually means "this is a siege, not a lull" is the one already right
     * above - no break wide enough to be a break - so fatigue rides the same
     * clock the backlog does, and only that reset above can stop it. */
    let fatigue = 0;
    if (chatter && gap) {
      if (!sustainStart[kit]) sustainStart[kit] = t;
      fatigue = WS.clamp((t - sustainStart[kit] - FATIGUE_GRACE) / FATIGUE_WINDOW, 0, 1);
    }
    if (gap) {
      /* The gap WIDENS as it gets busy, and the voice gets heavier to match.
       * A fixed gap is a rate limit: it caps how often, never how loud, so a
       * crowded field is the same twenty-two ticks a second as a quiet one and
       * the player cannot hear the difference between killing three things and
       * three hundred. Spacing the clumps out and making each one bigger says
       * more with fewer voices - which is the whole trade. Fatigue widens it
       * FURTHER, on top of that, once the siege has run long enough to earn it. */
      const widened = gap * (1 + 0.9 * heft) * (1 + FATIGUE_GAP * fatigue);
      if (lastPlayed[kit] && t - lastPlayed[kit] < widened) {
        if (chatter) waiting[kit] = (waiting[kit] || 0) + 1;   // remembered, not lost
        return;
      }
      lastPlayed[kit] = t;
      lastGap[kit] = widened;
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
    /* The wander belongs to every kit, the clump's downward pull only to the
       chatter set. A clump is a heavier version of the same event and nothing
       outside that set has one - but identical is identical whether or not
       the voice happens to be routed through a ducking bus, and an explosion
       firing eleven times a second through its own throttle was the most
       mechanical sound in the game for exactly that reason. */
    const spread = VARY[kit] || 0;
    let dest = this.sfxGain;
    if (chatter) {
      waiting[kit] = 0;
      /* One voice, carrying what the ones it replaced would have said: louder
         and lower for a clump, light and bright for a single event. The player
         hears the difference between three kills and thirty without hearing
         thirty sounds. */
      const shape = this.ctx.createGain();
      shape.gain.value = (1 + 1.1 * heft) * (1 - FATIGUE_GAIN * fatigue);
      shape.connect(this.chatter);
      dest = shape;
      this.pitch = (1 - 0.26 * heft)
        * (1 + (Math.random() - 0.5) * (2 * spread + 0.3 * heft));
      /* What the last chatter voice was shaped into. Exposed because it is the
         only way to measure from outside that a clump sounds different from a
         single event - the voice itself is gone by the time anything could
         look at it. */
      this.lastShape = { kit, heft, fatigue, gain: shape.gain.value, pitch: this.pitch };
    } else if (spread) {
      this.pitch = 1 + (Math.random() - 0.5) * 2 * spread;
    }
    this.voiceBus = placeAt(x, dest) || dest;
    try { fn(); } catch (e) { /* audio graph exhausted */ }
    finally { this.voiceBus = null; this.pitch = 1; }
  };

  /* --------------------------------------------------------------- music -- */
  /* Every battlefield used to be the same piece transposed.
   *
   * One drone, one arpeggio, one chord bed, and a zone changed nothing but the
   * root note, the scale and the tempo. Measured off the music bus as a mean
   * spectral difference, two different battlefields came out 3dB apart - and
   * The Dustreach and the MAIN MENU came out 0.35dB apart, which is to say
   * that the busiest ground in the game sounded like the screen you pick it
   * from. A transposition is not a different place.
   *
   * So a score now names its instruments as well as its key. The parts that
   * actually separate one place from another, in the order they matter:
   *
   *   perc   Rhythm, and nothing else came close. There was none at all
   *          before. A pattern of steps and a kit to strike them with is what
   *          makes Ambergrass walk and Mourneholt toll.
   *   air    A filtered noise bed - wind, insects, the sound of a room. It
   *          plays under everything forever and it is most of why a place
   *          sounds like somewhere rather than like a chord. `drift` is how
   *          far its colour wanders and `gust` how far its LEVEL does - a
   *          bed that never lets up is a hiss whatever is in it.
   *   pad    What the chord bed is made of, and how bright.
   *   leadCut How many harmonics the melody keeps, as a multiple of the
   *          note. Six by default.
   *          IT IS ALSO A ZONE'S VOICE, which one flat value forgot. Three
   *          scores lead on a sawtooth, and filtering all three to six
   *          harmonics made all three duller IN THE SAME WAY - the Dustreach
   *          and Ambergrass fell to 2.5dB apart and Mourneholt and the
   *          Eclipse to 2.54, under the floor that keeps two battlefields
   *          from sounding like one. The rasp was carrying more of what
   *          separated them than anything else in the top of the mix. So the
   *          Dustreach, whose whole character is a sawing wind, keeps
   *          thirteen and Ambergrass, whose top end is insects, keeps three.
   *          Mourneholt leads on a SINE - no harmonics, nothing to filter,
   *          brightness fixed - so the Eclipse's sawtooth is the only axis
   *          those two can be told apart on, and darkening it to four put
   *          them 1.87dB apart. It keeps ten.
   *   prog   Where the harmony GOES. Four centres, a bar each, given as
   *          indices into the zone's own scale.
   *
   * The menu keeps no percussion on purpose. It is the one screen that is not
   * a place, and stillness is what separates it from the six that are. */
  /** PHRASES: the shape the melody takes for a while, then changes.
   *
   *  The arpeggio walked `scale[(step * 3) % scale.length]` with the octave
   *  flipping every eight steps. On a five-note scale that is a cycle of five
   *  crossed with a cycle of eight - a FIXED forty-step melody, identical
   *  every time round, repeating every thirty-two seconds for as long as the
   *  player stays on the map. No rests, no phrasing, no variation of any
   *  kind. It is the reason a zone stops being a place and becomes a loop.
   *
   *  A phrase changes four things: which degree of the scale the step lands
   *  on, how often the octave flips, how much of the bar is SILENT, and where
   *  in the scale the line starts. Rests matter most of the four - a line
   *  that never stops has no shape, and the ear cannot find a phrase in a
   *  continuous stream.
   *
   *  `shift` ROTATES THE SCALE INDEX. It used to add semitones to the degree,
   *  which is not "transposed within the scale" however the comment read: on
   *  Mourneholt's [0, 1, 3, 7, 8] a shift of 2 plays 2, 3, 5, 9, 10, which is
   *  a different mode of a different key. Measured, that cost the two darkest
   *  zones a decibel of what separates them - Mourneholt and the Eclipse fell
   *  from 4.0dB apart to 2.9, under the floor that exists to stop two
   *  battlefields sounding like one, and pinning the phrases back to the
   *  original line restored it exactly. Rotating the index instead cannot
   *  leave the key, because the key is the only thing it can choose from.
   *
   *  `step` is taken modulo a five-note scale, so 5 is 0: that phrase played
   *  one note sixteen times. Steps run 1 to 4.
   *
   *  The zone's identity is untouched: same root, same scale, same wave, same
   *  tempo, same drone, same weather. What changes is what is PLAYED on them,
   *  which is the difference between a place with music in it and a place
   *  with a loop in it.
   */
  const PHRASES = [
    { step: 3, oct: 8, rest: 0.00, shift: 0 },     // the original line
    { step: 2, oct: 6, rest: 0.20, shift: 0 },
    { step: 4, oct: 12, rest: 0.12, shift: 1 },
    { step: 1, oct: 4, rest: 0.28, shift: 0 },
    { step: 3, oct: 16, rest: 0.34, shift: 3 },    // sparse and low
    { step: 4, oct: 8, rest: 0.14, shift: 2 },
    { step: 2, oct: 10, rest: 0.40, shift: 0 },    // nearly a rest bar
  ];
  /** How many steps a phrase lasts before another is chosen. Sixteen is one
   *  bar of the perc pattern, so a change lands with the downbeat. */
  const PHRASE_LEN = 16;

  /** What a zone falls back to if it names no progression of its own: four
   *  bars that leave home, go somewhere, and come back. */
  const PROG = [0, 3, 4, 2];

  /** How many bars a progression holds before another is chosen. Four times
   *  PHRASE_BARS, so the harmony under a zone changes shape on a slower clock
   *  than the melody riding on it - the melody finds a new idea every bar,
   *  the ground under it every four.
   *
   *  A zone's `prog` was a single fixed loop: four bars, in that order,
   *  forever, for as long as the player stood on the battlefield. The phrase
   *  table already solved this for the melody and never touched what the
   *  melody was accompanied BY - a session spent entirely on one map still
   *  heard the same four-chord cycle a few hundred times over, which is the
   *  same problem PHRASES exists to fix, one layer down.
   *
   *  Built by ROTATING THE SCALE INDEX, the same fix PHRASES' `shift` uses
   *  and for the same reason: a progression is a sequence of indices into
   *  the zone's own scale, and rotating the index cannot leave the key,
   *  because the key is the only thing it can choose from. Adding an
   *  interval instead would risk exactly the bug `shift` used to have -
   *  landing on a different mode of a different key rather than a variation
   *  in the one the zone was written in. */
  const PROG_LEN = PHRASE_LEN * 4;   // four phrase-cycles: the slower clock
  function progsFor(score) {
    const base = score.prog || PROG;
    const n = score.scale.length;
    const rotate = (by) => base.map((i) => ((i + by) % n + n) % n);
    return [base, rotate(2), rotate(-2), rotate(1)];
  }

  /** The chord under the bar, built out of the zone's OWN scale.
   *
   *  The bed used to be `[0, 7, intensity > 0.6 ? 10 : 12]` stacked on
   *  whatever degree the arpeggio had just landed on. Root, fifth, octave -
   *  the same interval stack every time, sliding in parallel under the
   *  melody. That is not a harmony, it is a thickener: nothing ever leaves
   *  home, nothing ever comes back, and a zone is one chord for as long as
   *  the player stands in it. Put a phrase table over a piece with no
   *  harmonic movement and all you have is a more varied way of saying the
   *  same thing.
   *
   *  Stacking every other degree of the scale instead means the chord cannot
   *  leave the key - it is made of the key - and on the pentatonic scales
   *  these zones use it lands on the quartal voicings the drones already
   *  imply, rather than on the triads a seven-note scale would give. The
   *  wrap adds an octave so the chord opens upward instead of folding back
   *  under itself.
   *
   *  Danger adds a fourth voice rather than swapping the third, so the chord
   *  gets DENSER as the run gets worse instead of merely different. */
  function chordOn(scale, i, tense) {
    const n = scale.length;
    const out = [];
    for (let k = 0; k < (tense ? 4 : 3); k++) {
      const j = i + k * 2;
      out.push(scale[j % n] + 12 * WS.floor(j / n));
    }
    return out;
  }

  const SCORES = {
    // Thornhollow: wet woodland. Knocks on wood, leaves, a warm major.
    forest: {
      root: 146.83, scale: [0, 2, 4, 7, 9], wave: 'triangle', tempo: 1.6,
      leadCut: 8,
      pad: 'sine', padCut: 1800,
      perc: [0, 3, 5, 8, 11, 13], kit: 'tick',
      prog: [0, 3, 1, 0],
      air: { cut: 1600, q: 0.7, gain: 0.034, drift: 0.35, gust: 0.55 },
      drone: { gain: 0.085, oct: 2, cut: 520 },
    },
    // The Dustreach: dry, wide, hot. A rattle and a sawing wind.
    plains: {
      root: 130.81, scale: [0, 2, 3, 7, 9], wave: 'sawtooth', tempo: 1.5,
      leadCut: 13,
      pad: 'triangle', padCut: 900,
      perc: [0, 3, 6, 9, 12], kit: 'shake',
      prog: [0, 4, 2, 3],
      air: { cut: 2400, q: 1.1, gain: 0.030, drift: 0.45, gust: 0.75, type: 'bandpass' },
      drone: { gain: 0.100, oct: 2, cut: 620, wave: 'square' },
    },
    // Mourneholt: a graveyard. A bell, a long moan, a flattened second.
    cursed: {
      root: 110.00, scale: [0, 1, 3, 7, 8], wave: 'sine', tempo: 1.9,
      pad: 'sine', padCut: 430,
      /* The bell is the whole zone, and at one toll per fifteen seconds it
         was not in the mix at all: measured in bands, Mourneholt and the MENU
         came out 1.6dB apart on average, the same failure the Dustreach had.
         A graveyard bell that tolls four times a bar is still a graveyard. */
      perc: [0, 4, 8, 12], kit: 'bell', percGain: 2.4,
      prog: [0, 1, 0, 4],
      air: { cut: 520, q: 2.6, gain: 0.050, drift: 0.16, gust: 0.45 },
      /* Heavier than the rest, since the drone went from a held tone to one
         that breathes: a sub-bass under a graveyard is this zone's ground
         (and it is 27Hz, felt more than heard), and it is what keeps
         Mourneholt from sounding like the menu. */
      drone: { gain: 0.215, oct: 4, cut: 240 },
    },
    // Ambergrass: it walks. Drums on the off-beat and a field full of insects.
    savannah: {
      root: 123.47, scale: [0, 2, 5, 7, 10], wave: 'sawtooth', tempo: 1.4,
      leadCut: 3,
      pad: 'triangle', padCut: 1500,
      perc: [0, 3, 6, 8, 11, 14], kit: 'skin',
      prog: [0, 2, 3, 1],
      air: { cut: 4800, q: 2.8, gain: 0.020, drift: 0.60, gust: 0.70, type: 'bandpass' },
      drone: { gain: 0.105, oct: 2, cut: 700 },
    },
    /* The Rimewaste: almost nothing, very far apart, very bright.
       Its weather was a HIGHPASS at 5600Hz, the only one in the game, which
       on white noise passes everything from there to Nyquist - about
       seventeen kilohertz of undifferentiated treble at a fixed level. That
       is not what cold sounds like, it is what a tape machine sounds like,
       and no amount of de-periodising the buffer underneath was ever going
       to change it: the loop got fixed and the hiss was still a hiss.
       A bandpass has a top as well as a bottom, so what comes out is air
       moving rather than the whole top of the spectrum at once. Measured as
       the share of the bed's energy above 5kHz: the highpass read 0.474, a
       wide band at 2600 read 0.382, and this reads 0.282 - against 0.093 for
       Thornhollow's lowpass, which is earth rather than air. Narrower still
       sounded like a different zone; the Rimewaste is supposed to be the
       bright one.
       And it GUSTS, which matters more here than anywhere else. The other
       reason this zone hisses is that there is nothing else in it - two
       percussion strokes a bar, the thinnest drone in the game, a sparse
       line - so its weather plays alone and uninterrupted for minutes at a
       time. At 0.92 the bed drops to under a tenth of itself and swells
       back, which means the wind actually stops. Nothing else does that. */
    glacier: {
      root: 98.00, scale: [0, 3, 5, 7, 10], wave: 'sine', tempo: 2.0,
      leadCut: 11,
      pad: 'sine', padCut: 2600,
      perc: [0, 8], kit: 'bell',
      prog: [0, 0, 3, 4],
      air: { cut: 1500, q: 2.0, gain: 0.030, drift: 0.55, gust: 0.92, type: 'bandpass' },
      drone: { gain: 0.055, oct: 2, cut: 900, wave: 'triangle' },
    },
    /* The Eclipse: wrong. Struck stone on an odd count, an altered scale, and
       a room that RINGS rather than rumbles.
       Its weather was a 230Hz lowpass, which is very nearly Mourneholt's -
       two narrow low beds at almost the same level under two sawtooth drones
       four octaves down behind two ~220Hz lowpasses. Measured, the two were
       the closest pair in the game and the phrase table pushed them from 4.0
       to 3.4dB apart. A resonant band is the one thing a graveyard is not, so
       this went to a bandpass at 300Hz - but Q4.5 was chosen by comparing it
       to Q6.0 ("Q6.0 separated them further and whistled"), which asks
       whether one whistles MORE than the other and never whether either one
       whistles at all. Measured properly - the average spectrum over many
       windows, which is what separates a real resonance from a single
       frame's noise - Q4.5 stands 13.6dB proud of its own neighbourhood. The
       other seven zones, resonant or not, sit at 1.1 to 2.0dB. That is not a
       pipe with air moving through it, it is a sustained pitch under the
       whole zone, forever, which is what a listener means by "a buzz that
       will not stop." Q1.2 still reads as more coloured than a plain band -
       4.7dB, more than double the other zones' ceiling - so the room still
       rings; it no longer hums a note while it does it. */
    eclipse: {
      root: 87.31, scale: [0, 1, 4, 6, 8], wave: 'sawtooth', tempo: 1.3,
      leadCut: 10,
      pad: 'sawtooth', padCut: 1250,
      perc: [0, 5, 7, 12], kit: 'stone',
      prog: [0, 3, 2, 3],
      air: { cut: 300, q: 1.2, gain: 0.060, drift: 0.12, gust: 0.40, type: 'bandpass' },
      /* An octave UP on Mourneholt, and a square rather than a saw. These
         two were the closest pair in the game before any of this and they
         stayed closest through four separate fixes - because their ground
         was the same ground: two sawtooth drones four octaves down at 0.170
         and 0.185 behind lowpasses at 240 and 215. Nothing above a drone can
         separate two zones that share one. Mourneholt keeps the sub-bass,
         which is what a grave is; the Eclipse sits an octave above it on odd
         harmonics, which is what a wrong room is. */
      drone: { gain: 0.170, oct: 2, cut: 300, wave: 'square' },
    },
    // Not a place. No rhythm, no weather - just a room with a fire in it.
    menu: {
      root: 130.81, scale: [0, 3, 5, 7, 10], wave: 'triangle', tempo: 2.2,
      prog: [0, 3, 0, 1],
      pad: 'triangle', padCut: 2200,
      perc: null, kit: null,
      air: { cut: 1050, q: 0.5, gain: 0.022, drift: 0.12, gust: 0.62 },
      drone: { gain: 0.070, oct: 2, cut: 560, wave: 'triangle' },
    },
    /* The prologue's own piece. It is not the menu loop, which is what it used
       to borrow: this one is slower than anything in the game, has no rhythm
       at all, and sits low enough to leave the whole top of the mix free for
       the cues the cinematic fires over it. */
    vigil: {
      root: 116.54, scale: [0, 3, 7, 10, 12], wave: 'sine', tempo: 3.0,
      prog: [0, 2, 0, 4],
      pad: 'sine', padCut: 560,
      perc: null, kit: null,
      air: { cut: 340, q: 0.8, gain: 0.040, drift: 0.15, gust: 0.55 },
      quiet: 0.66,
      drone: { gain: 0.130, oct: 2, cut: 300 },
    },
  };

  function semitone(root, n) { return root * Math.pow(2, n / 12); }

  /* ------------------------------------------------- scheduled primitives --
   * The effect primitives above play NOW, off Audio.ctx.currentTime, and the
   * score is a look-ahead scheduler that must place a voice at a stated time.
   * Same shapes, explicit t0. */
  function mTone(bed, t0, o) {
    const ctx = Audio.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + (o.slide || o.decay));
    if (o.detune) osc.detune.value = o.detune;
    let last = osc;
    if (o.cut) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.cut;
      osc.connect(f); last = f;
    }
    last.connect(g); g.connect(bed);
    const a = o.attack || 0.02;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.gain), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + o.decay);
    osc.start(t0); osc.stop(t0 + a + o.decay + 0.05);
  }

  function mNoise(bed, t0, o) {
    const ctx = Audio.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + o.decay);
    f.Q.value = o.q === undefined ? 1.2 : o.q;
    const g = ctx.createGain();
    src.connect(f); f.connect(g); g.connect(bed);
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.gain), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + o.decay);
    src.start(t0); src.stop(t0 + a + o.decay + 0.05);
  }

  /* The kits a rhythm is struck with. One per zone, and they are the loudest
   * single difference between two battlefields. */
  const KIT = {
    tick(bed, t0, v) {
      mNoise(bed, t0, { freq: 2600, to: 1200, decay: 0.05, gain: 0.055 * v, q: 2.4 });
    },
    shake(bed, t0, v) {
      mNoise(bed, t0, { freq: 5400, to: 3200, decay: 0.14, gain: 0.030 * v,
        filter: 'highpass', q: 0.6 });
    },
    skin(bed, t0, v) {
      mNoise(bed, t0, { freq: 420, to: 130, decay: 0.14, gain: 0.045 * v,
        filter: 'lowpass', q: 0.6 });
      mTone(bed, t0, { wave: 'sine', freq: 112, to: 62, decay: 0.17,
        gain: 0.070 * v, attack: 0.004 });
    },
    bell(bed, t0, v) {
      mTone(bed, t0, { wave: 'square', freq: 1244.5, decay: 1.10, gain: 0.020 * v,
        cut: 2400, attack: 0.004 });
      mTone(bed, t0, { wave: 'square', freq: 1864.7, decay: 0.80, gain: 0.010 * v,
        cut: 3000, attack: 0.004, detune: 9 });
    },
    stone(bed, t0, v) {
      mNoise(bed, t0, { freq: 940, to: 250, decay: 0.10, gain: 0.060 * v, q: 1.1 });
    },
  };

  /* THE DRONE WAS THE CONSTANT NOISE. "There is a sound on the second map
   * that never stops" was reported more than once, and two fixes went after
   * the weather and the lead. Measured one layer at a time
   * (tools/ambient-probe.js), the drone was the loudest thing in every score -
   * on the Dustreach 14dB above the music it sat under - and its quietest
   * half-second was exactly its loudest: one pitch, one level, from the first
   * second of a run to the thirtieth minute. On the Dustreach it is a square
   * wave, which is to say a buzz.
   *
   * So it is a bass part now. It moves to the root of the chord on every bar
   * (folded to the nearest octave, so it walks rather than leaps), and it
   * breathes with the bar - in on the downbeat, down to a murmur by the end -
   * at a lower level overall. The zone keeps its own ground: every drone
   * keeps its wave, register and filter, which is what check-score's
   * "places" rule depends on. */
  const DRONE_LEVEL = 0.62;
  const DRONE_LOW = 0.3;
  function droneBar(state, t0, bar) {
    const sc = state.score.scale;
    const prog = state.prog;
    const centre = prog[(((state.step / PHRASE_LEN) | 0) % prog.length + prog.length) % prog.length];
    let iv = sc[centre % sc.length];
    if (iv > 6) iv -= 12;
    state.drone.frequency.setTargetAtTime(semitone(state.droneFreq, iv), t0, 0.12);
    const g = state.droneGain.gain;
    g.setTargetAtTime(state.droneLevel, t0, bar * 0.06);
    g.setTargetAtTime(state.droneLevel * DRONE_LOW, t0 + bar * 0.4, bar * 0.2);
  }

  /** The weather. A noise bed under the whole zone, drifting so it never sits
   *  still enough to be heard as a hiss. */
  /** The weather's layers, as [playback rate, level]. Named rather than
   *  written inline because a harness that wants to know whether the bed
   *  repeats has to render the REAL pair; one that hardcodes its own copy is
   *  measuring itself. */
  /* LEVELS THAT SUM TO ONE LAYER'S WORTH. Two independent noise sources add
   * in power, not in amplitude, so a naive [1, 0.72] is sqrt(1 + 0.72^2) =
   * 1.23 times the bed there was before the split - 1.8dB of extra weather in
   * every zone, which is not a change anybody asked for and not one the ear
   * would read as depth. Both levels are divided by that, so splitting the
   * weather in two changes what it is made of and nothing about how loud it
   * is. */
  const AIR_LAYERS = [[1, 0.81], [0.79, 0.58]];

  function airBed(score, bed) {
    const a = score.air;
    const ctx = Audio.ctx;
    if (!a || !ctx) return null;
    noiseBuf();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const f = ctx.createBiquadFilter();
    f.type = a.type || 'lowpass';
    f.frequency.value = a.cut;
    f.Q.value = a.q === undefined ? 0.7 : a.q;
    f.connect(g);
    g.connect(bed);
    /* TWO LAYERS AT IRRATIONAL RATES.
     *
     * One looping buffer repeats on its own length, however long that length
     * is - it just repeats more slowly. Two copies of the same buffer played
     * at 1.0 and 0.79 of speed have periods of 11.3s and 14.3s, and the
     * composite only comes back into phase after about three minutes, by
     * which point the filter has moved several times and the player has moved
     * zone. The second layer sits a little quieter so it reads as depth in
     * the same weather rather than as a second wind. */
    const layers = [];
    for (const [rate, level] of AIR_LAYERS) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      src.playbackRate.value = rate;
      const lg = ctx.createGain();
      lg.gain.value = level;
      src.connect(lg); lg.connect(f);
      src.start(Math.random() * 5);
      layers.push(src);
    }
    g.gain.setTargetAtTime(a.gain, ctx.currentTime, 1.6);
    return { src: layers[0], layers, gain: g, filter: f, spec: a };
  }

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
    const carriedBoss = this._music && this._music.boss;
    this.stopMusic();
    const score = SCORES[key] || SCORES.menu;
    const ctx = this.ctx;

    const bed = ctx.createGain();
    bed.gain.value = 0.5 * (score.quiet || 1);
    bed.connect(this.musicGain);

    /* A continuous drone under everything - the "obsidian" of the score.
     *
     * Per zone, because it was not. Measured in eight log bands, every one of
     * the seven scores came out within a decibel of every other below 550Hz -
     * one drone at one gain through one filter, transposed. The entire bottom
     * half of the mix was the same everywhere, and a place with no weight of
     * its own is a place you hear as a melody rather than as ground. So
     * Mourneholt sits an octave lower and heavier than Thornhollow, and the
     * Rimewaste is thin because cold is thin. */
    const dr = score.drone || {};
    const drone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass'; droneFilter.frequency.value = dr.cut || 420;
    drone.type = dr.wave || 'sawtooth';
    drone.frequency.value = score.root / (dr.oct || 2);
    droneGain.gain.value = 0.0001;
    drone.connect(droneFilter); droneFilter.connect(droneGain); droneGain.connect(bed);
    drone.start();

    /* The zone's melodic parts hang off their own gain rather than the bed.
     *
     * A boss used to be a layer ADDED to the score, and measured that way it
     * changed the mix by 1.6dB - against 10 to 15dB between two different
     * battlefields. Adding low energy underneath low energy barely moves a
     * spectrum, because decibels are a ratio: the arrival of the biggest
     * event in a run was quieter than walking across a map.
     *
     * A fight score does not sit on top of the exploring score, it TAKES OVER
     * from it. With the arpeggio, the chord bed and the zone's rhythm on one
     * bus, the boss layer can push them down as it comes up. The drone and
     * the weather stay on the bed underneath: the place does not go anywhere.
     *
     * Honest note on what actually fixed the measurement, since it was not
     * this. Deleting the duck and re-running the guard still passed - it is
     * worth about a quarter of a decibel. What made a boss audible was giving
     * its layer somewhere to BE: the horn was behind a 620Hz lowpass, which
     * is a sine with extra steps, in the same bottom octave the zone drone
     * already owned. Opening it up and adding the off-beat rattle put the
     * layer where the zone is quietest. The duck stays because it is right -
     * the fight should own the mix - but it is not the reason the number
     * moved, and check-score asserts it directly rather than hoping it shows
     * up in an average. */
    const zone = ctx.createGain();
    zone.gain.value = 1;
    zone.connect(bed);

    const progSet = progsFor(score);
    const state = { key, score, bed, zone, drone, droneGain,
      droneFreq: score.root / (dr.oct || 2),
      droneLevel: (dr.gain === undefined ? 0.12 : dr.gain) * DRONE_LEVEL,
      step: 0, phrase: PHRASES[0],
      progSet, prog: progSet[0],
      nextTime: ctx.currentTime + 0.1,
      timer: null, intensity: 0, want: 0, air: airBed(score, bed), boss: null,
      bossGain: null, bossDrone: null };

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
      /* A boss shortens the bar. Everything else about the zone stays where it
         was, which is the point - it is the same place, going faster. */
      const beat = score.tempo / 2 * (state.bossGain ? 0.78 : 1);
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
        /* Pick the next phrase on the bar line. Never the one just played, so
           a change is always a change - drawing at random from seven means
           one time in seven the score "changes" to what it was already
           doing, and that is the one case the player would notice as a
           stutter in the pattern rather than as a new idea. */
        if (s % PHRASE_LEN === 0) {
          let next = state.phrase;
          for (let tries = 0; tries < 6 && next === state.phrase; tries++) {
            next = PHRASES[WS.floor(WS.random() * PHRASES.length)];
          }
          state.phrase = next;
        }
        /* And the progression underneath it, on its own slower bar line - see
           progsFor. Same "never the one just played" rule as the phrase, for
           the same reason: one time in four picking the loop already playing
           would read as the harmony stuttering rather than turning a corner. */
        if (s % PROG_LEN === 0) {
          let next = state.prog;
          for (let tries = 0; tries < 4 && next === state.prog; tries++) {
            next = state.progSet[WS.floor(WS.random() * state.progSet.length)];
          }
          state.prog = next;
        }
        const ph = state.phrase || PHRASES[0];
        const sc = score.scale;
        if (s % PHRASE_LEN === 0) droneBar(state, t0, beat * PHRASE_LEN);
        const deg = sc[(((s * ph.step + (ph.shift || 0)) % sc.length)
          + sc.length) % sc.length];
        const oct = ((s / (ph.oct / 4)) | 0) % 2 ? 12 : 0;
        /* Arpeggio - denser as the run gets hairier, and with holes in it.
           A rest is skipped rather than quietened: a note at low gain is
           still a note, and what makes a phrase is the silence between the
           notes it does play. Danger fills the holes back in, so the line
           tightening up IS the warning. */
        const rests = WS.random() < (ph.rest || 0) * (1 - state.intensity * 0.7);
        if ((s % 2 === 0 || state.intensity > 0.5) && !rests) {
          /* THROUGH A FILTER, and for most of this game's life it was not.
           *
           * mTone only filters when it is handed a cut, and this call - the
           * loudest and most continuous voice in the score - was the one
           * call in the file that handed it none. Every other voice passes
           * one: the chord bed has padCut, the drone has its own, all nine
           * boss voices name theirs. So in the three zones whose lead is a
           * sawtooth, the melody was a RAW sawtooth, harmonics running
           * unattenuated to Nyquist, with a decay of 1.6 beats so the notes
           * overlap and never stop. That is a hiss that happens to be
           * pitched, and it is why the Dustreach measured a quarter of its
           * energy above 5kHz WITH THE WEATHER BED SILENCED - the control
           * that found this was aimed at the wind and cleared it.
           *
           * The cutoff tracks the note rather than sitting at a fixed
           * frequency, because a fixed one makes low notes buzz and high
           * notes dull. Six harmonics is still audibly a sawtooth - the
           * character of a saw lives in its first few - and it puts the last
           * of the energy below 4kHz for every note any zone plays. */
          const f = semitone(score.root * 2, deg + oct);
          mTone(zone, t0, { wave: score.wave, freq: f,
            cut: WS.max(900, f * (score.leadCut || 6)),
            gain: 0.07 + state.intensity * 0.05, attack: 0.02, decay: beat * 1.6 });
        }
        /* A pulse under the bed once things are actually bad. Intensity used
           to change three things - whether the arpeggio played on odd steps,
           its gain by a twentieth, and one interval in the chord - which is
           not enough to hear across a room. This is the one that is felt
           rather than heard, and it only exists above the halfway mark, so
           its arrival is itself the signal. */
        if (state.intensity > 0.5 && s % 2 === 0) {
          mTone(zone, t0, { wave: 'sine', freq: semitone(score.root / 2, 0),
            to: semitone(score.root / 2, -5), slide: beat,
            gain: 0.05 + 0.10 * (state.intensity - 0.5) * 2, attack: 0.03, decay: beat * 0.9 });
        }
        /* Chord bed every four steps, on the bar's centre rather than on
           whatever note the arpeggio just played. The centre changes once a
           bar, in step with the phrase, so the two changes land together and
           the player hears one new idea rather than two. */
        if (s % 4 === 0) {
          const prog = state.prog;
          const centre = prog[(((s / PHRASE_LEN) | 0) % prog.length + prog.length) % prog.length];
          for (const iv of chordOn(sc, centre, state.intensity > 0.6)) {
            mTone(zone, t0, { wave: score.pad || 'sine', cut: score.padCut,
              freq: semitone(score.root, iv),
              gain: 0.05, attack: 0.3, decay: beat * 4 });
          }
        }
        /* The rhythm. A sixteen-step bar with a handful of steps struck, which
           is the whole reason two battlefields no longer sound like one
           battlefield in two keys. It gets louder with the danger but never
           silent, because a pulse that stops is a pulse the player notices
           stopping. */
        if (score.perc && KIT[score.kit]) {
          const b = s % 16;
          const weight = (score.percGain || 1) * (0.75 + state.intensity * 0.5);
          if (score.perc.indexOf(b) >= 0) {
            /* The pattern is the zone - it is the single thing that stopped
               two battlefields being one battlefield in two keys - so it is
               played, not generated. But played EXACTLY, every bar, forever,
               it is also a metronome, and a metronome is the most repetitive
               object in any piece of music. A stroke off the downbeat is
               dropped now and then and every stroke lands at a slightly
               different weight, which is the difference between a pattern
               being kept and a pattern being clocked.

               The downbeat never drops. It is what the player is counting
               from, and a bar that can start on silence is a bar with no
               edge on it. */
            if (b === 0 || WS.random() > 0.11) {
              KIT[score.kit](zone, t0,
                (b === 0 ? 1.25 : vary(1, 0.16)) * weight);
            }
          } else if (b % 2 === 1 && score.perc.length >= 4 && WS.random() < 0.09) {
            /* And a ghost between the strokes, at a third the weight. Only
               where there is a pattern dense enough to have a between: the
               Rimewaste strikes twice a bar on purpose and filling its gaps
               would be writing a different zone rather than loosening one. */
            KIT[score.kit](zone, t0, 0.34 * weight);
          }
        }
        /* The weather moves. Holding a noise bed at one cutoff forever is how
           a wind becomes a hiss; retargeting it every other bar is enough to
           keep the ear hearing a place instead of a filter. */
        if (state.air && s % 8 === 0) {
          const a = state.air.spec;
          const swing = 1 + (WS.random() * 2 - 1) * a.drift;
          state.air.filter.frequency.setTargetAtTime(a.cut * swing, t0, 2.2);
          /* AND IT BREATHES. The cutoff moved; the level never did, and a
             weather bed held at one level forever is the difference between
             wind and a hiss however you filter it. The Rimewaste is the case
             that showed it - a highpass at 5600Hz on noise held at a constant
             0.026 is a grain, and the only thing that stops the ear filing it
             as equipment noise is that it swells and recedes like something
             moving past. Slower than the filter, so the two never breathe
             together and the pair of them never find a period.

             THE ZONE SAYS HOW MUCH, and this went wrong twice before it
             said so. A flat 0.28 everywhere put a two-decibel random swing
             on the top four bands of every score including the two stillest,
             and Mourneholt and the Eclipse - the closest pair in the game -
             fell from 4.0dB apart to 2.9, under the floor that exists to
             stop two battlefields sounding like one. Tying it to the zone's
             cutoff drift instead fixed that and broke something worse: the
             Rimewaste, whose whole complaint was that its wind never lets
             up, has a drift of 0.22 and so got the SMALLEST swell in the
             game. Half a metric is not a design. `gust` is its own number
             now, and falls back to the drift-derived one only for the zones
             that have no opinion. */
          /* EVERY zone names one. The drift-derived fallback below is what
             the six zones that did not name one were getting, and it came to
             0.06 for the Eclipse and the menu and 0.08 for Mourneholt: a bed
             that swings by six per cent does not swing. Measured over
             forty-two seconds, the quietest half-second of those zones sat
             at 0.74 to 0.80 of the loudest - which is to say the weather
             never let up anywhere, in any zone, at all. */
          const gust = a.gust === undefined ? a.drift * 0.5 : a.gust;
          const breath = 1 + (WS.random() * 2 - 1) * gust;
          state.air.gain.gain.setTargetAtTime(a.gain * WS.max(0.02, breath), t0, 3.1);
        }
        if (state.bossGain) bossVoices(state, t0, s, beat);
        state.nextTime += beat;
        state.step++;
      }
    }, 250);

    this._music = state;
    // A zone change during a boss fight keeps the boss fight.
    if (carriedBoss) this.setBoss(carriedBoss);
  };

  /* ----------------------------------------------------------- boss music --
   * A boss arriving used to change the score by 0.79dB of mean spectral
   * difference - measured, and against roughly 3dB between two different
   * battlefields. So the biggest event in a run was a quarter as audible as
   * walking from one map to another, which is to say boss fights had no music.
   *
   * This is a LAYER, not a different piece, and that is deliberate. Swapping
   * scores means a cut, or a crossfade long enough to miss the arrival; a
   * layer rides on top of the zone that is already playing, comes up over two
   * seconds, and leaves over three when the thing is dead. The zone never
   * stops, because the player never left it.
   *
   * Three parts: a drone a fifth below the root that is felt rather than
   * heard, a kick on every step, and a horn every second bar. The horn is the
   * one that carries - three detuned sawtooths with a slow attack through a
   * low filter, which is as close to brass as an oscillator gets. */
  const BOSS_IN = 0.7, BOSS_OUT = 1.1;   // setTargetAtTime constants, not durations
  /* How far the zone's own melody gets out of the way while a boss is up.
     Not to nothing: the place is still the place, and a score that cut to
     silence and back would announce the boss twice, once at each end. */
  const BOSS_DUCK = 0.34;

  function bossVoices(state, t0, s, beat) {
    const g = state.bossGain;
    const score = state.score;
    const dread = state.boss === 'death';
    const bar = s % 16;
    /* The layer's drone breathes on the bar like the zone's does, rather
       than holding one sub-bass level for the length of the fight. */
    if (bar === 0 && state.bossDroneGain) {
      const dg = state.bossDroneGain.gain, len = beat * 16;
      dg.setTargetAtTime(0.20, t0, len * 0.05);
      dg.setTargetAtTime(0.09, t0 + len * 0.45, len * 0.2);
    }
    /* The tread. A boss gallops - every step, so the fight has a pulse the
       zone does not. Death does not hurry: half the rate and twice the
       weight, which is the difference between being chased and being
       arrived at. */
    if (!dread) {
      mTone(g, t0, { wave: 'sine', freq: 104, to: 48, decay: beat * 0.62,
        gain: 0.17, attack: 0.005 });
      mNoise(g, t0, { freq: 300, to: 90, decay: 0.11, gain: 0.055,
        filter: 'lowpass', q: 0.6 });
    } else if (s % 2 === 0) {
      mTone(g, t0, { wave: 'sine', freq: 76, to: 34, decay: beat * 1.35,
        gain: 0.30, attack: 0.008 });
      mNoise(g, t0, { freq: 220, to: 60, decay: 0.34, gain: 0.085,
        filter: 'lowpass', q: 0.5 });
    }
    /* The horn, every second bar, answered a bar later a fourth higher.
     *
     * Open enough to be heard. Behind a 620Hz lowpass this was three
     * sawtooths with all of their harmonics removed, which is a sine with
     * extra steps - and it landed in the same bottom octave the zone drone
     * already owned, so it added level without adding anything to hear. */
    if (bar === 0 || bar === 8) {
      const up = bar === 8 ? (dread ? 6 : 5) : 0;
      for (const d of [-8, 0, 8]) {
        mTone(g, t0, { wave: 'sawtooth', freq: semitone(score.root, up), detune: d,
          cut: 2400, gain: 0.070, attack: 0.30, decay: 2.2 });
        // The octave above, which is the part that carries across a room.
        mTone(g, t0 + 0.05, { wave: 'sawtooth', freq: semitone(score.root * 2, up),
          detune: d * 2, cut: 3400, gain: 0.032, attack: 0.38, decay: 1.9 });
      }
    }
    /* A rattle on the off-beats: the top of the mix, where the zone has
       least. Not for Death - the last boss in the game is not busy, and
       taking the rattle away is half of why it sounds inevitable rather
       than fast. */
    if (s % 2 === 1 && !dread) {
      mNoise(g, t0, { freq: 6200, to: 3400, decay: 0.09, gain: 0.030,
        filter: 'highpass', q: 0.7 });
    }
    // And the wrong note in the middle of the bar - a flattened second over
    // the root, or a tritone if the thing on the field is Death itself.
    if (bar === 6 || bar === 14) {
      mTone(g, t0, { wave: 'triangle', freq: semitone(score.root * 2, dread ? 6 : 1),
        cut: 2600, gain: 0.050, attack: 0.06, decay: beat * 1.4 });
    }
    /* And what Death has that none of the others do: a high pair held across
       the bar, detuned against itself so it beats.
     *
     * It was written at a twentieth of the gain and once a bar, and measured
     * that way Death and an ordinary boss came out 0.2dB apart - a variation
     * nobody could hear is not a variation. Held twice a bar and loud enough
     * to sit over the horn, it is the one sound in the game that never
     * resolves. */
    if (dread && (bar === 0 || bar === 8)) {
      for (const d of [-26, 26]) {
        mTone(g, t0, { wave: 'triangle', freq: semitone(score.root * 4, 6), detune: d,
          cut: 5200, gain: 0.085, attack: 0.9, decay: 5.0 });
      }
      mTone(g, t0 + 0.2, { wave: 'sawtooth', freq: semitone(score.root * 2, 6),
        cut: 3000, gain: 0.045, attack: 1.2, decay: 4.4 });
    }
  }

  /** Called by the game when a boss lands and when the field is clear again.
   *
   *  @param {?string} kind  'boss', 'death' for the last one, or null. */
  Audio.setBoss = function (kind) {
    const m = this._music;
    const ctx = this.ctx;
    if (!m || !ctx) return;
    const want = kind || null;
    if (m.boss === want) return;
    m.boss = want;
    if (want) {
      if (!m.bossGain) {
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        g.connect(m.bed);
        const d = ctx.createOscillator();
        const dg = ctx.createGain();
        const df = ctx.createBiquadFilter();
        df.type = 'lowpass'; df.frequency.value = 200;
        d.type = 'sawtooth';
        d.frequency.value = semitone(m.score.root / 4, 7);
        dg.gain.value = 0.20;
        d.connect(df); df.connect(dg); dg.connect(g);
        d.start();
        m.bossGain = g; m.bossDrone = d; m.bossDroneGain = dg;
      }
      m.bossGain.gain.setTargetAtTime(1, ctx.currentTime, BOSS_IN);
      if (m.zone) m.zone.gain.setTargetAtTime(BOSS_DUCK, ctx.currentTime, BOSS_IN);
      /* The layer's own drone slides to a tritone for Death and back to the
         fifth for anything else, so a boss becoming Death - which is what the
         end of a run is - is heard as the ground going wrong under it rather
         than as a new sound starting. */
      if (m.bossDrone) {
        m.bossDrone.frequency.setTargetAtTime(
          semitone(m.score.root / 4, want === 'death' ? 6 : 7), ctx.currentTime, 1.4);
      }
    } else if (m.bossGain) {
      if (m.zone) m.zone.gain.setTargetAtTime(1, ctx.currentTime, BOSS_OUT);
      const g = m.bossGain, d = m.bossDrone;
      m.bossGain = null; m.bossDrone = null; m.bossDroneGain = null;
      try {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, BOSS_OUT);
        d.stop(ctx.currentTime + BOSS_OUT * 5);
      } catch (e) { /* already stopped */ }
      // Let go of the layer once it is silent, so a run through five bosses
      // does not leave five muted branches hanging off the bed.
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } },
        BOSS_OUT * 5000 + 400);
    }
  };

  /** What the score is fighting, if anything. For measurement. */
  Audio.boss = function () { return this._music ? this._music.boss : null; };

  /* ------------------------------------------------------------- cinema --
   * The prologue used to play the menu loop and nothing else: no wind, no
   * ember, no horn, nothing marking the moment the light comes up. A cue is a
   * one-shot scored ON THE MUSIC BUS rather than through the effect kits,
   * because these are the score of the cinematic - they must not be throttled
   * against combat chatter, ducked by a level-up, or placed in the stereo
   * field, all of which the effect path would do to them.
   *
   * Which also means the music setting governs them, exactly as it already
   * governed the only sound a cinematic previously had. */
  function chord(bus, t, root, ivs, o) {
    for (const iv of ivs) {
      mTone(bus, t, { wave: o.wave || 'sine', freq: semitone(root, iv),
        cut: o.cut, gain: o.gain, attack: o.attack, decay: o.decay,
        detune: o.detune ? (WS.random() * 2 - 1) * o.detune : 0 });
    }
  }

  const CUES = {
    /* --- the prologue ---------------------------------------------------- */
    // The dark, coming up out of the ground.
    'pro:night': { at: 0.10, play(b, t) {
      chord(b, t, 58.27, [0, 7], { wave: 'sine', gain: 0.13, attack: 2.2, decay: 5.0 });
      mNoise(b, t + 0.6, { freq: 280, to: 140, decay: 4.2, gain: 0.055,
        filter: 'lowpass', q: 0.5, attack: 1.8 });
    } },
    // What holds it back is ember: a stone struck, and the warmth after it.
    'pro:ember': { at: 0.16, play(b, t) {
      mTone(b, t, { wave: 'square', freq: 1108.7, cut: 2600, gain: 0.075,
        attack: 0.004, decay: 1.9 });
      mTone(b, t + 0.02, { wave: 'square', freq: 1661, cut: 3200, gain: 0.030,
        attack: 0.004, decay: 1.3, detune: 7 });
      chord(b, t + 0.10, 116.54, [0, 4, 7], { wave: 'triangle', cut: 900,
        gain: 0.055, attack: 1.1, decay: 3.4 });
    } },
    // Break the stone, take the light out of it. Something rising.
    'pro:draw': { at: 0.24, play(b, t) {
      for (let i = 0; i < 6; i++) {
        mTone(b, t + i * 0.11, { wave: 'triangle', freq: semitone(233.08, [0, 3, 7, 10, 12, 15][i]),
          gain: 0.050, attack: 0.03, decay: 1.5 });
      }
      mNoise(b, t, { freq: 900, to: 5200, decay: 1.5, gain: 0.030,
        filter: 'bandpass', q: 0.8, attack: 0.9 });
    } },
    // They can smell a light from a long way off.
    'pro:horde': { at: 0.72, play(b, t) {
      for (const d of [-14, -5, 6, 15]) {
        mTone(b, t, { wave: 'sawtooth', freq: semitone(58.27, 0), detune: d,
          cut: 340, gain: 0.075, attack: 1.7, decay: 3.6 });
      }
      mNoise(b, t + 0.3, { freq: 150, to: 420, decay: 3.0, gain: 0.070,
        filter: 'lowpass', q: 0.7, attack: 1.5 });
    } },
    // Someone out on the ridge, working a machine: a slow ratchet and a drip.
    'pro:thief': { at: 0.12, play(b, t) {
      for (let i = 0; i < 6; i++) {
        mNoise(b, t + i * 0.33, { freq: 1900, to: 900, decay: 0.07, gain: 0.050,
          filter: 'bandpass', q: 2.2 });
      }
      mTone(b, t + 0.2, { wave: 'triangle', freq: 311.1, cut: 1200, gain: 0.045,
        attack: 0.6, decay: 2.8 });
      chord(b, t + 0.4, 77.78, [0, 6], { wave: 'sawtooth', cut: 380, gain: 0.050,
        attack: 1.2, decay: 3.4 });
    } },
    // The Pale: wind, a glassy high cluster, and the ground dropping a tritone.
    'pro:pale': { at: 0.08, play(b, t) {
      mNoise(b, t, { freq: 2600, to: 900, decay: 5.2, gain: 0.050,
        filter: 'bandpass', q: 1.4, attack: 2.0 });
      chord(b, t + 0.5, 1244.5, [0, 1, 6], { wave: 'sine', gain: 0.022,
        attack: 1.6, decay: 4.2 });
      mTone(b, t + 1.2, { wave: 'sawtooth', freq: 58.27, to: 41.2, slide: 3.0,
        cut: 260, gain: 0.12, attack: 1.4, decay: 4.4 });
    } },
    // You will not kill your way out of this. Three strikes, and standing.
    'pro:stand': { at: 0.86, play(b, t) {
      for (let i = 0; i < 3; i++) {
        mTone(b, t + i * 0.42, { wave: 'sine', freq: 96, to: 54, decay: 0.42,
          gain: 0.19, attack: 0.005 });
        mNoise(b, t + i * 0.42, { freq: 380, to: 120, decay: 0.30, gain: 0.070,
          filter: 'lowpass', q: 0.6 });
      }
      chord(b, t + 1.3, 116.54, [0, 7, 12], { wave: 'sawtooth', cut: 700,
        gain: 0.055, attack: 0.9, decay: 3.2 });
    } },
    /* Hold until the light comes back.
     *
     * The longest cue in the game, and deliberately: the light coming up is
     * the best thing in the prologue and the note back on version two was
     * that it must be SLOW. Seven seconds of one chord opening, the filter
     * climbing the whole way, a fifth arriving late and the octave later
     * still. Nothing is struck.
     *
     * Traced second by second off the music bus it climbs -100, -84, -68,
     * -60 and crests at -59 around five seconds in, which is the end of the
     * dawn scene and the start of the title - the swell arrives exactly where
     * the picture does. At the gains it was first written with it crested 11dB
     * BELOW the title card that follows it, so the payoff of the whole piece
     * was the quietest thing in it. */
    'pro:dawn': { at: 0.20, play(b, t) {
      const ctx = Audio.ctx;
      const swell = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.linearRampToValueAtTime(3200, t + 6.4);
      swell.gain.value = 1;
      lp.connect(swell); swell.connect(b);
      chord(lp, t, 116.54, [0, 7], { wave: 'sawtooth', gain: 0.135, attack: 3.4,
        decay: 4.6, detune: 6 });
      chord(lp, t + 1.6, 233.08, [4, 12], { wave: 'triangle', gain: 0.100,
        attack: 2.6, decay: 4.0 });
      chord(lp, t + 3.4, 466.16, [7, 16], { wave: 'sine', gain: 0.072,
        attack: 2.2, decay: 3.6 });
      mNoise(b, t + 0.4, { freq: 400, to: 6000, decay: 5.4, gain: 0.058,
        filter: 'bandpass', q: 0.5, attack: 3.0 });
    } },
    // The title. Everything at once, and then the room.
    'pro:title': { at: 0.06, play(b, t) {
      chord(b, t, 116.54, [0, 7, 12, 16, 19], { wave: 'triangle', cut: 2400,
        gain: 0.062, attack: 0.5, decay: 5.2 });
      mTone(b, t + 0.06, { wave: 'square', freq: 1864.7, cut: 3400, gain: 0.028,
        attack: 0.004, decay: 3.4 });
      mTone(b, t, { wave: 'sine', freq: 58.27, decay: 4.0, gain: 0.14, attack: 0.02 });
    } },

    /* --- and the other end of it ----------------------------------------- */
    'vic:last': { at: 0.90, play(b, t) {
      for (const d of [-11, 0, 11]) {
        mTone(b, t, { wave: 'sawtooth', freq: 61.74, detune: d, cut: 380,
          gain: 0.085, attack: 0.9, decay: 3.2 });
      }
    } },
    // The night runs out of dark. This one BREAKS.
    'vic:break': { at: 0.45, play(b, t) {
      mNoise(b, t, { freq: 6000, to: 900, decay: 2.4, gain: 0.085,
        filter: 'bandpass', q: 0.4, attack: 0.01 });
      chord(b, t + 0.05, 123.47, [0, 7, 12], { wave: 'sawtooth', cut: 1800,
        gain: 0.070, attack: 0.06, decay: 3.6 });
      mTone(b, t, { wave: 'sine', freq: 82, to: 41, decay: 2.2, gain: 0.20, attack: 0.005 });
    } },
    'vic:burn': { at: 0.28, play(b, t) {
      chord(b, t, 123.47, [0, 4, 7, 11], { wave: 'triangle', cut: 1600,
        gain: 0.050, attack: 1.2, decay: 4.2 });
    } },
    // Their name. A struck bell and gold under it.
    'vic:named': { at: 0.14, play(b, t) {
      mTone(b, t, { wave: 'square', freq: 1567.98, cut: 3000, gain: 0.055,
        attack: 0.004, decay: 3.0 });
      mTone(b, t + 0.03, { wave: 'square', freq: 2349.3, cut: 3600, gain: 0.022,
        attack: 0.004, decay: 2.2, detune: 8 });
      chord(b, t + 0.12, 195.998, [0, 4, 7, 12], { wave: 'sine', gain: 0.048,
        attack: 0.8, decay: 4.4 });
    } },
    // Morning. Nothing left to fight.
    'vic:day': { at: 0.04, play(b, t) {
      chord(b, t, 130.81, [0, 7, 12], { wave: 'sine', gain: 0.055, attack: 2.0, decay: 5.2 });
      chord(b, t + 1.1, 261.63, [4, 7], { wave: 'triangle', cut: 2600,
        gain: 0.036, attack: 1.8, decay: 4.4 });
      mNoise(b, t + 0.5, { freq: 700, to: 4200, decay: 4.6, gain: 0.022,
        filter: 'bandpass', q: 0.5, attack: 2.4 });
    } },
  };

  /** Fire a cinematic cue by name, e.g. 'pro:dawn'. Unknown names do nothing,
   *  which is what lets a script gain a beat without the score knowing yet. */
  Audio.cue = function (name) {
    const c = CUES[name];
    if (!c) return false;
    // The score follows the story even when the cue itself cannot sound.
    if (c.at !== undefined) this.setIntensity(c.at);
    if (!live() || !WS.Save.settings.music) return false;
    const bus = this.ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.musicGain);
    try { c.play(bus, this.ctx.currentTime); } catch (e) { /* graph exhausted */ }
    /* Cues are one-shots and nothing refers to them again, so the bus is let
       go once the longest voice in the table has certainly finished. */
    setTimeout(() => { try { bus.disconnect(); } catch (e) { /* gone */ } }, 12000);
    return true;
  };

  /** For measurement: the cue names the game knows how to play. */
  Audio.cues = function () { return Object.keys(CUES); };

  /* For measurement. The score tables, the chord a progression index names,
     and the kits that are supposed to sound different each time - all three
     live in closures, and a harness that reproduced any of them would be
     asserting against its own copy rather than against the game's. */
  Audio.scores = function () { return SCORES; };
  Audio.chordAt = function (scale, i, tense) { return chordOn(scale, i, tense); };
  /** The weather's actual shape: how long the shared buffer is and what is
   *  layered over it. Both are what decides whether the bed has an audible
   *  period, and both were previously copied into the harness by hand - so a
   *  harness could pass while the game looped every 1.2 seconds. */
  Audio.weather = function () {
    const b = noiseBuf();
    return { seconds: b ? b.duration : 0, layers: AIR_LAYERS };
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
      /* EVERY layer. The weather is two sources now, and stopping only the
         first left the second running into a disconnected bed for the life of
         the page - one leaked oscillator per zone the player visits, which is
         exactly the fault the `muted` rule in check-score exists to catch. */
      if (m.air) {
        for (const src of (m.air.layers || [m.air.src])) {
          src.stop(this.ctx.currentTime + 1.2);
        }
      }
      if (m.bossDrone) m.bossDrone.stop(this.ctx.currentTime + 1.2);
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
