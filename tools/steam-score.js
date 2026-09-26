/* The trailer's score: fifty-six seconds of music written to the cut.
 *
 * Run in the page (tools/steam-trailer.js hands this function to Chromium),
 * rendered offline by WebAudio into a buffer, so it is exact to the sample
 * and needs no sound card. Everything is synthesised here - there is no
 * sample library and no recording - out of the same kinds of voices the
 * game's own music is made of, just more of them and louder:
 *
 *   drones     low saw and sine in D, felt more than heard
 *   strings    detuned saw ensembles: long pads, and a driving ostinato
 *   choir      saw voices through vowel formants, with vibrato
 *   brass      saws whose filter opens on the attack; stabs, then the theme
 *   taiko      a pitched-down sine body and a skin of noise, in a big hall
 *   braams     distorted low fifths with a filter that tears open
 *   celesta    the ember motif, a bell-like sine and its inharmonic partial
 *   risers     noise and a glide that climb into each hit
 *   fire       a crackle under the opening and closing cards
 *
 * D minor at 120 bpm, so a bar is two seconds and every cut in the trailer
 * lands on a bar line. Before the three biggest hits (the boss, the
 * finale, the end card) everything drops out for a quarter of a second,
 * and the picture goes black with it. It ends on D major: the dawn.
 *
 * `cuts` is the trailer's timeline in seconds, so the score follows it if
 * the edit changes. */
'use strict';

function composeScore(oc, out, cuts) {
  const SR = oc.sampleRate;
  const BAR = 2, BEAT = 0.5, E8 = 0.25, S16 = 0.125;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---- the room and the bus ------------------------------------------ */
  function hall(secs) {
    const len = Math.floor(SR * secs), pre = Math.floor(SR * 0.02);
    const b = oc.createBuffer(2, len, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const k = (i - pre) / (len - pre);
        lp += (0.6 - 0.5 * k) * ((rnd() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - k, 2.4) * 0.5;
      }
    }
    return b;
  }
  const mix = oc.createGain(); mix.gain.value = 1;
  const verb = oc.createConvolver(); verb.buffer = hall(4.2);
  const verbIn = oc.createGain(); verbIn.gain.value = 1;
  const verbOut = oc.createGain(); verbOut.gain.value = 0.55;
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(mix);
  // The drop-outs: a gate across dry and wet together.
  const gate = oc.createGain(); gate.gain.value = 1;
  mix.connect(gate);
  // Nothing below 32Hz: felt, not heard, and it eats the headroom.
  const floor = oc.createBiquadFilter(); floor.type = 'highpass'; floor.frequency.value = 32; floor.Q.value = 0.7;
  const glue = oc.createDynamicsCompressor();
  glue.threshold.value = -18; glue.knee.value = 10; glue.ratio.value = 3;
  glue.attack.value = 0.02; glue.release.value = 0.3;
  // And a limiter, so the hits are loud without the rest being quiet.
  const lim = oc.createDynamicsCompressor();
  lim.threshold.value = -8; lim.knee.value = 2; lim.ratio.value = 20;
  lim.attack.value = 0.002; lim.release.value = 0.12;
  gate.connect(floor); floor.connect(glue); glue.connect(lim); lim.connect(out);

  const bus = (level, wet, pan) => {
    const g = oc.createGain(); g.gain.value = level;
    let node = g;
    if (pan) { const p = oc.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(mix);
    if (wet) { const s = oc.createGain(); s.gain.value = wet; node.connect(s); s.connect(verbIn); }
    return g;
  };

  let noiseBuf = null;
  const noise = () => {
    if (!noiseBuf) {
      noiseBuf = oc.createBuffer(2, SR * 2, SR);
      for (let ch = 0; ch < 2; ch++) { const d = noiseBuf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
    }
    const s = oc.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    return s;
  };
  const env = (g, t, a, hold, r, peak) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  };

  /* ---- voices -------------------------------------------------------- */
  /** A section of detuned saws through a lowpass: strings and brass. */
  function ensemble(dest, t, dur, midi, o) {
    const n = o.voices || 3;
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q || 0.7;
    lp.frequency.setValueAtTime(o.cut || 1800, t);
    if (o.bite) {
      lp.frequency.setValueAtTime(o.cut * 0.3, t);
      lp.frequency.exponentialRampToValueAtTime(o.cut * o.bite, t + (o.a || 0.05) + 0.04);
      lp.frequency.exponentialRampToValueAtTime(o.cut, t + (o.a || 0.05) + 0.35);
    }
    const g = oc.createGain();
    env(g, t, o.a || 0.02, Math.max(0, dur - (o.a || 0.02)), o.r || 0.3, o.gain || 0.1);
    lp.connect(g); g.connect(dest);
    for (let i = 0; i < n; i++) {
      const osc = oc.createOscillator();
      osc.type = o.wave || 'sawtooth';
      osc.frequency.value = mtof(midi);
      osc.detune.value = (i - (n - 1) / 2) * (o.spread || 9) + (rnd() - 0.5) * 3;
      if (o.vib) {
        const l = oc.createOscillator(), lg = oc.createGain();
        l.frequency.value = 4.8 + rnd(); lg.gain.value = o.vib;
        l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(t + dur + (o.r || 0.3) + 0.1);
      }
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur + (o.r || 0.3) + 0.1);
    }
  }

  const VOWEL = { ah: [[730, 6, 1], [1090, 8, 0.5], [2440, 10, 0.22]], oo: [[300, 6, 1], [870, 8, 0.35], [2240, 10, 0.12]] };
  /** Voices: saws with vibrato through three vowel formants. */
  function choir(dest, t, dur, midis, o) {
    const sum = oc.createGain(); sum.gain.value = 1;
    const g = oc.createGain();
    env(g, t, o.a || 0.9, Math.max(0, dur - (o.a || 0.9)), o.r || 1.8, o.gain || 0.1);
    for (const [f, q, lvl] of VOWEL[o.vowel || 'ah']) {
      const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const lg = oc.createGain(); lg.gain.value = lvl * 3.2;
      sum.connect(bp); bp.connect(lg); lg.connect(g);
    }
    g.connect(dest);
    for (const m of midis) {
      for (let v = 0; v < 3; v++) {
        const osc = oc.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.value = mtof(m); osc.detune.value = (v - 1) * 11 + (rnd() - 0.5) * 6;
        const l = oc.createOscillator(), lg = oc.createGain();
        l.frequency.value = 4.6 + rnd() * 0.9; lg.gain.value = 14;
        l.connect(lg); lg.connect(osc.detune);
        osc.connect(sum);
        const end = t + dur + (o.r || 1.8) + 0.1;
        osc.start(t); osc.stop(end); l.start(t); l.stop(end);
      }
    }
  }

  /** The drum everything stands on. */
  function taiko(dest, t, vel, pitch) {
    const p = pitch || 1;
    const body = oc.createOscillator(); body.type = 'sine';
    body.frequency.setValueAtTime(150 * p, t);
    body.frequency.exponentialRampToValueAtTime(46 * p, t + 0.22);
    const bg = oc.createGain(); env(bg, t, 0.002, 0.02, 0.7, 0.55 * vel);
    body.connect(bg); bg.connect(dest); body.start(t); body.stop(t + 1.1);
    const skin = noise(), bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 * p; bp.Q.value = 0.9;
    const sg = oc.createGain(); env(sg, t, 0.001, 0.005, 0.12, 0.45 * vel);
    skin.connect(bp); bp.connect(sg); sg.connect(dest); skin.start(t, rnd()); skin.stop(t + 0.3);
  }
  function snare(dest, t, vel) {
    const s = noise(), hp = oc.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2200; hp.Q.value = 0.6;
    const g = oc.createGain(); env(g, t, 0.001, 0.01, 0.16, 0.35 * vel);
    s.connect(hp); hp.connect(g); g.connect(dest); s.start(t, rnd()); s.stop(t + 0.3);
    const tone = oc.createOscillator(); tone.frequency.setValueAtTime(240, t); tone.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const tg = oc.createGain(); env(tg, t, 0.001, 0.005, 0.1, 0.25 * vel);
    tone.connect(tg); tg.connect(dest); tone.start(t); tone.stop(t + 0.2);
  }
  function crash(dest, t, vel, len) {
    const s = noise(), hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const pk = oc.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 7800; pk.gain.value = 6;
    const g = oc.createGain(); env(g, t, 0.003, 0.05, len || 2.6, 0.32 * vel);
    s.connect(hp); hp.connect(pk); pk.connect(g); g.connect(dest); s.start(t, rnd()); s.stop(t + (len || 2.6) + 0.2);
  }
  /** The trailer hit: a sub drop and a burst, with the room behind it. */
  function boom(dest, t, vel) {
    const sub = oc.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(72, t); sub.frequency.exponentialRampToValueAtTime(29, t + 1.6);
    const g = oc.createGain(); env(g, t, 0.003, 0.08, 2.8, 1.1 * vel);
    sub.connect(g); g.connect(dest); sub.start(t); sub.stop(t + 3.2);
    const s = noise(), lp = oc.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const ng = oc.createGain(); env(ng, t, 0.002, 0.03, 1.3, 0.6 * vel);
    s.connect(lp); lp.connect(ng); ng.connect(dest); s.start(t, rnd()); s.stop(t + 1.6);
    for (const [k, d] of [[1, 0], [0.7, 0.06], [0.5, 0.13]]) taiko(dest, t + d, vel * k, 0.8);
  }
  /** The braam: low fifths, distorted, with a filter that tears open. */
  const shaper = oc.createWaveShaper();
  { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 3.2); } shaper.curve = c; }
  function braam(dest, t, dur, notes, vel) {
    const pre = oc.createGain(); pre.gain.value = 0.35;
    const sh = oc.createWaveShaper(); sh.curve = shaper.curve;
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
    lp.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = oc.createGain(); env(g, t, 0.03, Math.max(0, dur - 0.5), 1.6, 0.34 * vel);
    pre.connect(sh); sh.connect(lp); lp.connect(g); g.connect(dest);
    for (const m of notes) {
      for (let v = 0; v < 3; v++) {
        const o = oc.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = (v - 1) * 14;
        o.connect(pre); o.start(t); o.stop(t + dur + 1.8);
      }
    }
  }
  /** A climb into a hit, cut dead a moment before it. */
  function riser(dest, t0, t1, vel) {
    const s = noise(), bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(7000, t1);
    const g = oc.createGain(); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1);
    s.connect(bp); bp.connect(g); g.connect(dest); s.start(t0, rnd()); s.stop(t1 + 0.05);
    const o = oc.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(mtof(38), t0); o.frequency.exponentialRampToValueAtTime(mtof(74), t1);
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(5000, t1);
    const og = oc.createGain(); og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.12 * vel, t1 - 0.02); og.gain.linearRampToValueAtTime(0, t1);
    o.connect(lp); lp.connect(og); og.connect(dest); o.start(t0); o.stop(t1 + 0.05);
  }
  /** The ember motif's voice. */
  function celesta(dest, t, midi, vel, len) {
    for (const [mul, lvl, dec] of [[1, 1, len || 2.2], [2, 0.25, 0.9], [4.02, 0.12, 0.35]]) {
      const o = oc.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi) * mul;
      const g = oc.createGain(); env(g, t, 0.002, 0.01, dec, 0.16 * vel * lvl);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dec + 0.1);
    }
  }
  function crackle(dest, t0, t1, rate) {
    let t = t0;
    while (t < t1) {
      t += -Math.log(1 - rnd()) / rate;
      const s = noise(), hp = oc.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1500 + rnd() * 3500; hp.Q.value = 1.2;
      const g = oc.createGain(); env(g, t, 0.0005, 0.001, 0.012 + rnd() * 0.03, 0.05 + rnd() * 0.12);
      s.connect(hp); hp.connect(g); g.connect(dest); s.start(t, rnd()); s.stop(t + 0.08);
    }
  }
  function drone(dest, t, dur, midi, gain) {
    for (const [m, w, lvl] of [[midi, 'sawtooth', 0.5], [midi + 12, 'triangle', 0.7], [midi - 12, 'sine', 0.4]]) {
      const o = oc.createOscillator(); o.type = w; o.frequency.value = mtof(m);
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const g = oc.createGain(); env(g, t, 1.2, Math.max(0, dur - 1.2), 1.5, gain * lvl);
      o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 1.6);
    }
  }

  /* ---- buses --------------------------------------------------------- */
  const B = {
    drone: bus(0.5, 0.2), pad: bus(1.0, 0.5), osti: bus(1.0, 0.25), choir: bus(1.1, 0.7),
    brass: bus(1.5, 0.4), drums: bus(0.8, 0.35), hits: bus(0.85, 0.45), fx: bus(0.6, 0.5),
    cel: bus(1.1, 0.8), fire: bus(0.9, 0.15), violins: bus(0.8, 0.6, 0.15),
  };

  /* ---- harmony -------------------------------------------------------- */
  // Chord tones as MIDI, low to high, for the pad and the ostinato.
  const CH = {
    Dm: [50, 53, 57], Bb: [46, 50, 53], F: [53, 57, 60], C: [48, 52, 55],
    Gm: [43, 46, 50], A: [45, 49, 52], D: [50, 54, 57],
  };
  const c = cuts;   // { horde, levelup, boss, highmoor, pale, finale, arena, end, total }
  // One chord per bar from the first cut to the end card.
  const plan = [];
  const put = (t0, chords) => chords.forEach((ch, i) => plan.push([t0 + i * BAR, ch]));
  put(c.horde, ['Dm', 'Bb', 'C']);
  put(c.levelup, ['Dm', 'Bb', 'A']);
  put(c.boss, ['Dm', 'Gm', 'A']);
  put(c.highmoor, ['Dm', 'Bb', 'C']);
  put(c.pale, ['Dm', 'Bb', 'A']);
  put(c.finale, ['Dm', 'Bb', 'F', 'A']);
  put(c.arena, ['Dm', 'Bb', 'A']);
  const chordAt = (t) => { let ch = 'Dm'; for (const [t0, k] of plan) if (t0 <= t + 1e-6) ch = k; return ch; };

  /* ---- the opening card ---------------------------------------------- */
  crackle(B.fire, 0.0, c.horde - 0.2, 14);
  drone(B.drone, 0.0, c.horde, 38, 0.22);
  choir(B.choir, 1.4, c.horde - 1.6, [50, 57, 62], { vowel: 'oo', a: 1.8, gain: 0.06 });
  braam(B.hits, 1.55, 2.4, [38, 45, 50], 0.4);             // the name arrives
  [[1.0, 69, 0.25], [1.5, 74], [2.0, 76], [2.5, 77, 1.6], [3.5, 76], [4.0, 74, 3]]
    .forEach(([t, m, l]) => celesta(B.cel, t, m, 0.9, l));
  riser(B.fx, c.horde - 1.8, c.horde - 0.02, 0.8);

  /* ---- the long middle ------------------------------------------------ */
  const sections = [
    // start, bars, ostinato step, drum pattern (eighths), drum velocity, pad register
    [c.horde, 3, E8, [0, 3, 6], 0.55, 0],
    [c.levelup, 3, S16, [0, 3, 6, 7], 0.65, 0],
    [c.boss, 3, S16, [0, 2, 3, 5, 6, 7], 0.85, 0],
    [c.highmoor, 3, S16, [0, 3, 4, 6], 0.8, 12],
    [c.pale, 3, S16, [0, 1, 3, 4, 6, 7], 0.9, 12],
    [c.finale, 4, S16, [0, 1, 2, 3, 4, 5, 6, 7], 1.0, 12],
    [c.arena, 3, S16, [0, 1, 2, 3, 4, 5, 6, 7], 1.0, 12],
  ];
  const OSTI = [0, 0, 2, 0, 3, 0, 2, 1];   // chord-tone indices, 3 = octave
  for (const [t0, bars, step, drums, dv, up] of sections) {
    const t1 = t0 + bars * BAR;
    for (let b = 0; b < bars; b++) {
      const bt = t0 + b * BAR;
      const ch = CH[chordAt(bt)];
      // Pads: strings, and from the boss on, voices too.
      for (const m of ch) ensemble(B.pad, bt, BAR, m + up, { a: 0.35, r: 0.6, cut: 2200, gain: 0.05, voices: 3, spread: 12 });
      ensemble(B.pad, bt, BAR, ch[0] - 12, { a: 0.2, r: 0.5, cut: 900, gain: 0.07 });
      if (t0 >= c.highmoor) choir(B.choir, bt, BAR, ch.map((m) => m + 12), { vowel: 'ah', a: 0.4, r: 0.9, gain: 0.05 });
      // The ostinato.
      for (let k = 0; k < BAR / step; k++) {
        const idx = OSTI[k % OSTI.length];
        const m = idx === 3 ? ch[0] + 12 : ch[idx];
        const acc = k % 4 === 0 ? 1 : 0.7;
        ensemble(B.osti, bt + k * step, step * 0.8, m - 12, { a: 0.006, r: 0.08, cut: 1600, gain: 0.06 * acc, voices: 2, spread: 7 });
      }
      // Drums.
      for (const e of drums) taiko(B.drums, bt + e * E8, dv * (e === 0 ? 1 : 0.72), e % 2 ? 1.25 : 1);
      if (t0 >= c.highmoor) { snare(B.drums, bt + 1 * BEAT, 0.7 * dv); snare(B.drums, bt + 3 * BEAT, 0.8 * dv); }
      if (t0 >= c.finale) crash(B.drums, bt, 0.5, 1.6);
      // Violins, high, sixteenths on the chord: the lift from Highmoor on.
      if (t0 >= c.highmoor) {
        for (let k = 0; k < 16; k++) {
          const m = ch[[2, 1, 0, 1][k % 4]] + 24;
          ensemble(B.violins, bt + k * S16, S16 * 0.9, m, { a: 0.01, r: 0.1, cut: 5200, gain: 0.03 * (k % 4 ? 0.75 : 1), voices: 3, spread: 9 });
        }
      }
      // Low brass: on the beat from the boss on.
      if (t0 >= c.boss && t0 < c.finale) {
        for (let q = 0; q < 4; q++) ensemble(B.brass, bt + q * BEAT, 0.3, ch[0] - 12, { a: 0.03, r: 0.2, cut: 1300, bite: 2.2, gain: q ? 0.07 : 0.1, voices: 3, spread: 8 });
      }
    }
    // A stab at the top of every section, and a hit.
    for (const m of CH[chordAt(t0)]) ensemble(B.brass, t0, 0.5, m, { a: 0.03, r: 0.5, cut: 1500, bite: 2.6, gain: 0.08, voices: 3 });
    if (t0 === c.boss || t0 === c.finale) {
      boom(B.hits, t0, 1.0);
      braam(B.hits, t0, 2.2, [26, 33, 38], 1.0);
      crash(B.hits, t0, 1.0, 3.2);
    } else {
      boom(B.hits, t0, 0.6);
      crash(B.hits, t0, 0.55, 2.2);
    }
    // Builds into the next cut.
    if (t0 === c.levelup || t0 === c.pale || t0 === c.arena) {
      riser(B.fx, t1 - 1.7, t1 - 0.26, 1.0);
      for (let k = 0; k < 12; k++) snare(B.drums, t1 - 1.5 + k * 0.105, 0.3 + k * 0.05);
    }
  }

  /* ---- the theme, on the horns ----------------------------------------- */
  const theme = [
    // [beat from the finale's first bar, midi, beats]
    [0, 62, 1.5], [1.5, 65, 0.5], [2, 69, 2],
    [4, 70, 1.5], [5.5, 69, 0.5], [6, 65, 2],
    [8, 69, 1], [9, 72, 1], [10, 69, 1], [11, 67, 1],
    [12, 69, 1.5], [13.5, 67, 0.5], [14, 64, 2],
    [16, 74, 2], [18, 72, 1], [19, 69, 1],
    [20, 70, 1.5], [21.5, 69, 0.5], [22, 65, 2],
    [24, 64, 2], [26, 69, 1.5],
  ];
  for (const [b, m, d] of theme) {
    const t = c.finale + b * BEAT;
    ensemble(B.brass, t, d * BEAT, m, { a: 0.05, r: 0.35, cut: 1900, bite: 2.0, gain: 0.085, voices: 4, spread: 10, vib: 7 });
    ensemble(B.brass, t, d * BEAT, m - 12, { a: 0.05, r: 0.35, cut: 1300, bite: 1.8, gain: 0.07, voices: 3, spread: 10 });
    ensemble(B.pad, t, d * BEAT, m + 12, { a: 0.08, r: 0.4, cut: 3500, gain: 0.03, voices: 3, spread: 6, vib: 10 });
  }

  /* ---- the arc: quiet at the fire, full weight by the finale ------------ */
  // (Scaled so only the finale leans on the limiter; above that, the limiter
  // would level every section to the same loudness and there is no arc.)
  const arc = [[0, 0.3], [c.horde, 0.38], [c.levelup, 0.42], [c.boss, 0.5], [c.highmoor, 0.5],
    [c.pale, 0.56], [c.finale, 0.68], [c.arena, 0.7], [c.end, 0.72]].map(([t, v]) => [t, v * 0.85]);
  mix.gain.setValueAtTime(arc[0][1], 0);
  for (const [t, v] of arc.slice(1)) { mix.gain.setValueAtTime(mix.gain.value, t - 0.01); mix.gain.linearRampToValueAtTime(v, t); }
  // A build is a build: the last second and a half before each drop swells.
  for (const [from, to] of [[c.levelup, c.boss], [c.pale, c.finale]]) {
    const pre = arc.find((x) => x[0] === from)[1];
    mix.gain.setValueAtTime(pre, to - 1.8);
    mix.gain.linearRampToValueAtTime(pre * 1.25, to - 0.3);
  }

  /* ---- the drops ------------------------------------------------------- */
  for (const t of [c.boss, c.finale, c.end]) {
    gate.gain.setValueAtTime(1, t - 0.3);
    gate.gain.linearRampToValueAtTime(0, t - 0.24);
    gate.gain.setValueAtTime(0, t - 0.005);
    gate.gain.linearRampToValueAtTime(1, t);
  }

  /* ---- dawn ------------------------------------------------------------ */
  const e = c.end;
  boom(B.hits, e, 1.2);
  braam(B.hits, e, 3.0, [26, 33, 38, 42], 1.1);            // D major, at last
  crash(B.hits, e, 1.0, 4.5);
  for (const m of [50, 54, 57, 62]) ensemble(B.brass, e, 2.4, m, { a: 0.04, r: 2.2, cut: 1800, bite: 2.4, gain: 0.08, voices: 4, spread: 10 });
  choir(B.choir, e, c.total - e - 1.8, [62, 66, 69, 74], { vowel: 'ah', a: 0.25, r: 1.6, gain: 0.07 });
  for (const m of [38, 45, 50, 54]) ensemble(B.pad, e, c.total - e - 1.5, m, { a: 0.3, r: 1.4, cut: 1500, gain: 0.05, voices: 3, spread: 12 });
  crackle(B.fire, e + 1.0, c.total, 10);
  [[1.2, 69], [1.7, 74], [2.2, 76], [2.7, 78, 2.6]]
    .forEach(([t, m, l]) => celesta(B.cel, e + t, m, 0.9, l));
  // Everything out by the last frame.
  const fade = oc.createGain();
  out.gain && out.gain.setValueAtTime(out.gain.value, c.total - 2.2);
  if (out.gain) out.gain.linearRampToValueAtTime(0, c.total - 0.05);
  void fade;
}

module.exports = { composeScore };
