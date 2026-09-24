/* The villains of the finale, drawn as themselves.
 *
 * Three of the four people the story is about were wearing a common
 * creature's body with a hat stuck on it. Foreman Grimtunnel - who is in the
 * cockpit of three machines and talks through two finales - was a Lampling
 * Tunneler, the first thing that dies in Thornhollow, in a gold crown. The
 * Masked Admiral was a Kerchief Footpad with pauldrons. Mordecai was the Cult
 * Necromancer's traffic cone. Marrowfrost, the one drawn for the part, showed
 * how far apart that was.
 *
 * So each is painted here the way Marrowfrost is: a hundred-unit figure built
 * back to front, lit from the upper left, every surface given its form and
 * its material. They keep their family - Grimtunnel is still a lamp, the
 * Admiral still wears the Kerchief red, Mordecai still hangs his dead from
 * his belt - so the bestiary still reads as one world.
 *
 * Everything is drawn looking left, like the rest of the bestiary.
 */
'use strict';
(function (WS) {

  const { shaded, poly, eyes } = WS.Sprites.paint;

  /** The shared scaffolding each painter starts from. */
  function rig(g, s) {
    const u = s / 100;
    const X = (x) => x * u, Y = (y) => y * u;
    const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);
    const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    const glowAt = (x, y, r, rgba) => {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), X(r));
      gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(X(x), Y(y), X(r), 0, WS.TAU); g.fill();
      g.restore();
    };
    /** A path from points, left open for the caller to fill, stroke or clip. */
    const trace = (pts, close) => {
      g.beginPath();
      P(pts).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (close !== false) g.closePath();
    };
    /** A vertical ramp between two heights, for a fill. */
    const ramp = (y0, y1, stops) => {
      const gr = g.createLinearGradient(0, Y(y0), 0, Y(y1));
      stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
      return gr;
    };
    const line = (pts, colour, w, cap) => {
      g.save();
      g.strokeStyle = colour; g.lineWidth = w * u; g.lineCap = cap || 'round'; g.lineJoin = 'round';
      trace(pts, false); g.stroke();
      g.restore();
    };
    const dot = (x, y, r, colour) => {
      g.fillStyle = colour;
      g.beginPath(); g.arc(X(x), Y(y), X(r), 0, WS.TAU); g.fill();
    };
    /** A palette literal in the shape shaded() wants. */
    const pal = (hi, mid, lo, line2) => ({ hi, mid, lo, dark: lo, line: line2 || lo, glow: hi });
    return { u, X, Y, P, hash, glowAt, trace, ramp, line, dot, pal };
  }

  const BRASS = { hi: '#ffe7a8', mid: '#d4a04a', lo: '#8c5a1c', line: '#3a2208' };
  const LEATHER = { hi: '#8a5a34', mid: '#5e3a1f', lo: '#35200f', line: '#1e1108' };
  const IRON = { hi: '#dfe3ea', mid: '#8d94a1', lo: '#454b57', line: '#1d2129' };

  /* ================================================== FOREMAN GRIMTUNNEL ===
   * A lamp with a grudge. The Lamplings are lanterns that walk, and the
   * foreman is the oldest and the stoutest of them: a brass hard hat with a
   * headlamp where the family candle would be, a walrus moustache gone white,
   * a cigar, a harness of tools, and the thing he stole glowing in the glass
   * of his own belly. He carries a wrench nearly as tall as he is, over his
   * shoulder, and points with the other hand - he is a foreman. */
  function grimtunnel(g, s, p) {
    const { u, X, Y, P, hash, glowAt, trace, ramp, line, dot, pal } = rig(g, s);
    const WAX = pal(p.hi, p.mid, p.lo, p.line);

    // the light he carries, thrown on everything round him
    glowAt(48, 58, 42, 'rgba(255,190,90,.16)');

    // 1. the wrench, over the far shoulder - behind everything
    g.save();
    g.lineCap = 'round';
    line([[74, 80], [66, 20]], IRON.line, 5.6);
    line([[74, 80], [66, 20]], IRON.mid, 3.6);
    line([[72.8, 78], [65.2, 22]], IRON.hi, 1.1);
    // the grip, wrapped
    for (let i = 0; i < 6; i++) {
      const y = 62 + i * 3, xc = 74 - (80 - y) * (8 / 60);
      line([[xc - 2, y + 0.6], [xc + 2, y - 0.6]], LEATHER.lo, 1.3);
    }
    // the open jaw, at the top
    poly(g, P([[59, 23], [63, 11], [69, 8], [73, 12], [70, 15], [67, 14], [65, 19], [71, 22], [73, 26], [67, 28]]),
      IRON.mid, IRON.line, u * 0.9);
    line([[63.4, 12.4], [68.6, 9.2]], IRON.hi, 0.9);
    dot(66.4, 24, 1.4, IRON.lo);
    g.restore();

    // 2. boots, planted wide: a foreman does not stand like a mob does
    for (const [bx, k] of [[39, -1], [59, 1]]) {
      poly(g, P([[bx - 7 + k, 82], [bx + 5 + k, 82], [bx + 6 + k, 88], [bx - 9 + k * 0.5, 89], [bx - 9 + k * 0.5, 86]]),
        LEATHER.mid, LEATHER.line, u * 0.9);
      poly(g, P([[bx - 9.5 + k * 0.5, 88], [bx + 6.5 + k, 88], [bx + 6 + k, 90.4], [bx - 9.5 + k * 0.5, 90.4]]),
        '#221409', LEATHER.line, u * 0.6);
      line([[bx - 7 + k, 83.6], [bx + 3 + k, 83.6]], LEATHER.hi, 0.7);
    }

    // 3. the body: a lamp housing, squat and heavy
    shaded(g, X(50), Y(63), X(22), X(21), WAX);
    // the glass in his belly, and the stolen ember behind it
    g.save();
    trace([[38, 56], [62, 56], [60, 76], [40, 76]]); g.clip();
    g.fillStyle = ramp(56, 76, ['#5a2e0c', '#b8661a', '#ffb44a']);
    g.fillRect(X(36), Y(54), X(28), Y(24));
    glowAt(50, 68, 12, 'rgba(255,200,110,.9)');
    // the ember: a flame that does not belong in a lamp this small
    g.fillStyle = '#fff1c4'; g.shadowColor = '#ffae3c'; g.shadowBlur = X(3);
    g.beginPath();
    g.moveTo(X(50), Y(60)); g.quadraticCurveTo(X(54.5), Y(66), X(52), Y(71));
    g.quadraticCurveTo(X(50), Y(73), X(48), Y(71)); g.quadraticCurveTo(X(45.5), Y(66), X(50), Y(60));
    g.fill();
    g.shadowBlur = 0;
    // soot on the glass, top corners
    g.fillStyle = 'rgba(30,14,4,.35)';
    g.beginPath(); g.ellipse(X(40), Y(57), X(6), X(3), 0.3, 0, WS.TAU); g.fill();
    g.beginPath(); g.ellipse(X(61), Y(58), X(4), X(2.4), -0.3, 0, WS.TAU); g.fill();
    // a pane of reflection
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = u * 1;
    g.beginPath(); g.moveTo(X(42), Y(59)); g.lineTo(X(40.6), Y(70)); g.stroke();
    g.restore();
    // the brass frame round the glass: mullions and a cap rail
    trace([[38, 56], [62, 56], [60, 76], [40, 76]]);
    g.strokeStyle = BRASS.line; g.lineWidth = u * 2.2; g.stroke();
    g.strokeStyle = BRASS.mid; g.lineWidth = u * 1.2; g.stroke();
    line([[50, 56], [50, 76]], BRASS.line, 1.8);
    line([[50, 56], [50, 76]], BRASS.mid, 0.9);
    line([[38.8, 66], [61.2, 66]], BRASS.mid, 0.9);
    for (const [x, y] of [[38, 56], [62, 56], [60, 76], [40, 76]]) { dot(x, y, 1.3, BRASS.lo); dot(x - 0.3, y - 0.3, 0.6, BRASS.hi); }

    // 4. the tool belt: leather, a buckle, pouches and what is in them
    poly(g, P([[29, 72], [71, 72], [70, 77.4], [30, 77.4]]), LEATHER.mid, LEATHER.line, u * 0.8);
    line([[30, 73.2], [70, 73.2]], LEATHER.hi, 0.6);
    poly(g, P([[46.5, 71.4], [53.5, 71.4], [53.5, 78], [46.5, 78]]), BRASS.mid, BRASS.line, u * 0.8);
    poly(g, P([[48.2, 73], [51.8, 73], [51.8, 76.4], [48.2, 76.4]]), LEATHER.lo, BRASS.line, u * 0.5);
    // a pouch on the near hip, with a rolled plan sticking out of it
    poly(g, P([[29.5, 74], [37.5, 74], [37, 83], [30, 83]]), LEATHER.mid, LEATHER.line, u * 0.8);
    line([[29.8, 76.4], [37.2, 76.4]], LEATHER.lo, 0.9);
    g.save();
    g.translate(X(33), Y(72)); g.rotate(-0.35);
    poly(g, [[-X(2.2), -Y(10)], [X(2.2), -Y(10)], [X(2.2), Y(2)], [-X(2.2), Y(2)]], '#e8e2cf', '#6a6250', u * 0.6);
    g.strokeStyle = '#3f6fb0'; g.lineWidth = u * 0.5;
    for (const dy of [-8, -5.5, -3]) { g.beginPath(); g.moveTo(-X(2), Y(dy)); g.lineTo(X(2), Y(dy)); g.stroke(); }
    g.fillStyle = '#c9c1ab'; g.beginPath(); g.ellipse(0, -Y(10), X(2.2), X(0.9), 0, 0, WS.TAU); g.fill();
    g.restore();
    // a hammer on the far hip
    line([[65, 74], [69, 86]], LEATHER.lo, 2);
    poly(g, P([[64, 84.5], [72.5, 82.6], [73.2, 85.4], [64.7, 87.3]]), IRON.mid, IRON.line, u * 0.7);

    // 5. shoulder harness: two straps crossing the housing above the glass
    for (const [x0, x1] of [[33, 47], [67, 53]]) {
      poly(g, P([[x0 - 2.4, 44], [x0 + 2.4, 44], [x1 + 2.2, 56.5], [x1 - 2.2, 56.5]]), LEATHER.mid, LEATHER.line, u * 0.7);
      dot((x0 + x1) / 2, 50.2, 1.2, BRASS.mid);
    }

    /** A forearm in a laced leather bracer, elbow to wrist. */
    const bracer = (ex, ey, wx, wy, w) => {
      const dx = wx - ex, dy = wy - ey, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      const q = (t, k) => [ex + dx * t + nx * w * k, ey + dy * t + ny * w * k];
      poly(g, P([q(0, -1), q(1, -0.8), q(1, 0.8), q(0, 1)]), LEATHER.mid, LEATHER.line, u * 0.8);
      for (const t of [0.3, 0.55, 0.8]) line([q(t, -0.9), q(t, 0.9)], LEATHER.lo, 0.8);
      line([q(0.05, -0.55), q(0.95, -0.45)], LEATHER.hi, 0.6);
      for (const t of [0.18, 0.92]) line([q(t, -0.95), q(t, 0.95)], BRASS.mid, 0.9);
    };

    // 6. the far arm, up to the wrench on his shoulder
    shaded(g, X(65), Y(48), X(5.2), X(7.6), WAX, 0.5);
    bracer(68, 42, 67.4, 32, 3.8);
    // the glove round the shaft
    shaded(g, X(67), Y(29.5), X(5), X(4.2), pal(LEATHER.hi, LEATHER.mid, LEATHER.lo, LEATHER.line));
    line([[63.4, 28.2], [70.6, 29.6]], LEATHER.line, 0.7);
    line([[63.6, 30.8], [70.2, 32]], LEATHER.line, 0.7);

    // 7. the near arm: out in front, pointing - "you, thief"
    shaded(g, X(31), Y(52), X(5.4), X(7.8), WAX, -0.9);
    bracer(26.4, 49, 17.6, 45.4, 3.8);
    shaded(g, X(15.5), Y(44.6), X(4.6), X(4), pal(LEATHER.hi, LEATHER.mid, LEATHER.lo, LEATHER.line));
    // the cuff of the glove, and the finger
    line([[18.4, 41.6], [19.6, 47.6]], LEATHER.line, 0.9);
    poly(g, P([[12.6, 42.6], [5.6, 41], [5.2, 43.2], [12.4, 45.2]]), LEATHER.mid, LEATHER.line, u * 0.7);
    poly(g, P([[12.8, 45.6], [10, 48.4], [12.6, 49.2], [15, 47.4]]), LEATHER.lo, LEATHER.line, u * 0.6);

    // 8. the head, sunk into the shoulders
    shaded(g, X(48), Y(37), X(14), X(12.5), WAX);
    // ears: the family's long lamp-fins, swept back and nicked
    poly(g, P([[36.5, 35], [20, 25], [24.5, 31], [22, 32.4], [35.2, 40]]), p.mid, p.line, u * 0.9);
    poly(g, P([[58.6, 33], [74, 22], [70.5, 29.6], [72.6, 30.6], [60.2, 38.6]]), p.lo, p.line, u * 0.9);
    line([[24.6, 28.2], [34, 35.6]], p.hi, 0.7);

    // 9. the face: brows down, eyes lit, a nose that has been in a mine
    eyes(g, X(45), Y(36.4), X(4.4), X(1.55), '#ffcf5c');
    for (const d of [-1, 1]) {
      poly(g, P([[45 + d * 1.6, 33.6], [45 + d * 7.8, 31.8 - (d > 0 ? 0 : 1.2)], [45 + d * 7.2, 33.8], [45 + d * 2.2, 35]]),
        '#f3efe4', '#6e675a', u * 0.5);
    }
    shaded(g, X(43.4), Y(40.6), X(3.6), X(3.1), pal('#ffc59a', '#d9895e', '#8a4a2c', '#4a2414'));
    dot(42.3, 39.5, 0.8, 'rgba(255,255,255,.6)');
    // the moustache: two heavy drooping lobes, combed
    for (const d of [-1, 1]) {
      const pts = d < 0
        ? [[43.4, 42.6], [36, 42.4], [30.6, 46.8], [32, 49.4], [36.4, 46.4], [41.4, 46.6], [44, 44.6]]
        : [[43.4, 42.6], [51, 42.2], [56.4, 46.4], [55.2, 49], [50.8, 46.4], [45.6, 46.6], [43.4, 44.8]];
      poly(g, P(pts), '#eeeae0', '#7b7465', u * 0.8);
      g.strokeStyle = 'rgba(120,112,98,.55)'; g.lineWidth = u * 0.4;
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        g.beginPath();
        g.moveTo(X(43.4 + d * (1 + t * 3)), Y(43.2 + t * 0.6));
        g.quadraticCurveTo(X(43.4 + d * (6 + t * 3)), Y(44 + t), X(43.4 + d * (9 + t * 3.4)), Y(46.4 + t * 1.2));
        g.stroke();
      }
    }
    // the cigar, out of the corner of the mouth, and its ember
    g.save();
    g.translate(X(35.6), Y(46.6)); g.rotate(0.35);
    poly(g, [[-X(6.4), -Y(1.1)], [0, -Y(1.2)], [0, Y(1.2)], [-X(6.4), Y(1.1)]], '#6b4020', '#2c1608', u * 0.5);
    g.strokeStyle = '#c9a15a'; g.lineWidth = u * 0.7;
    g.beginPath(); g.moveTo(-X(2.4), -Y(1.2)); g.lineTo(-X(2.4), Y(1.2)); g.stroke();
    g.fillStyle = '#ff7a2a'; g.shadowColor = '#ff8a2a'; g.shadowBlur = X(2);
    g.beginPath(); g.ellipse(-X(6.6), 0, X(0.9), X(1.1), 0, 0, WS.TAU); g.fill();
    g.restore();
    // and its smoke
    g.save();
    g.strokeStyle = 'rgba(210,205,200,.4)'; g.lineWidth = u * 0.9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(X(29.4), Y(45)); g.bezierCurveTo(X(26), Y(41), X(31), Y(38), X(27), Y(33)); g.stroke();
    g.lineWidth = u * 0.6; g.strokeStyle = 'rgba(210,205,200,.25)';
    g.beginPath(); g.moveTo(X(27), Y(33)); g.bezierCurveTo(X(24), Y(29), X(28), Y(27), X(25.6), Y(23)); g.stroke();
    g.restore();

    // 10. the hard hat: brass, dented, with the headlamp where a candle was
    poly(g, P([[30.6, 29.6], [66, 29.6], [67.6, 31.8], [29, 31.8]]), BRASS.lo, BRASS.line, u * 0.8);
    g.save();
    g.beginPath();
    g.moveTo(X(34), Y(30)); g.quadraticCurveTo(X(34), Y(16), X(48.4), Y(15.4));
    g.quadraticCurveTo(X(62.6), Y(16), X(62.6), Y(30)); g.closePath();
    const hat = g.createRadialGradient(X(42), Y(19), X(1), X(48), Y(24), X(17));
    hat.addColorStop(0, BRASS.hi); hat.addColorStop(0.5, BRASS.mid); hat.addColorStop(1, BRASS.lo);
    g.fillStyle = hat; g.fill();
    g.strokeStyle = BRASS.line; g.lineWidth = u * 0.9; g.stroke();
    g.clip();
    // a ridge down the crown, a dent, and scuffs
    line([[48.4, 15.6], [49.2, 30]], BRASS.lo, 1.4);
    line([[47.6, 16.4], [48.2, 29]], BRASS.hi, 0.6);
    g.fillStyle = 'rgba(80,46,10,.35)';
    g.beginPath(); g.ellipse(X(57), Y(22), X(2.6), X(1.6), 0.6, 0, WS.TAU); g.fill();
    g.strokeStyle = 'rgba(255,240,200,.35)'; g.lineWidth = u * 0.4;
    for (let i = 0; i < 5; i++) {
      const x = 37 + hash(i + 3) * 22, y = 19 + hash(i + 9) * 9;
      g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x + 2), Y(y - 0.6)); g.stroke();
    }
    g.restore();
    // the brim's lit edge
    line([[31, 29.8], [66, 29.8]], BRASS.hi, 0.6);
    // goggles pushed up on the hat: a strap and two round lenses
    line([[35, 26.6], [62, 25.8]], LEATHER.lo, 2.2);
    for (const gx of [52.6, 59.4]) {
      dot(gx, 25.8, 3, BRASS.line);
      dot(gx, 25.8, 2.4, BRASS.mid);
      g.save();
      g.beginPath(); g.arc(X(gx), Y(25.8), X(1.8), 0, WS.TAU); g.clip();
      g.fillStyle = ramp(24, 27.6, ['#9fd8ff', '#2a4a6a']); g.fillRect(X(gx - 2), Y(23.8), X(4), Y(4));
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.arc(X(gx - 0.6), Y(25.1), X(0.55), 0, WS.TAU); g.fill();
      g.restore();
    }
    // the headlamp: a brass box on the brow, glass, and a live flame in it
    glowAt(40.5, 22.5, 16, 'rgba(255,215,130,.42)');
    poly(g, P([[36.4, 18], [44.6, 18], [45, 27.4], [36, 27.4]]), BRASS.mid, BRASS.line, u * 0.8);
    poly(g, P([[37.4, 16], [43.6, 16], [44.6, 18.4], [36.4, 18.4]]), BRASS.lo, BRASS.line, u * 0.7);
    g.save();
    trace([[37.6, 19.4], [43.4, 19.4], [43.6, 26.2], [37.4, 26.2]]); g.clip();
    g.fillStyle = '#ffe9b0'; g.fillRect(X(37), Y(19), X(7), Y(8));
    g.fillStyle = '#fffaf0'; g.shadowColor = '#ffd36b'; g.shadowBlur = X(3);
    g.beginPath(); g.ellipse(X(40.5), Y(23.4), X(1.2), X(2.4), 0, 0, WS.TAU); g.fill();
    g.restore();
    line([[40.5, 19.4], [40.5, 26.2]], BRASS.line, 0.6);
    dot(40.5, 15.2, 1, BRASS.lo);
  }

  WS.Sprites.define('grimtunnel', grimtunnel);

  /* ==================================================== THE MASKED ADMIRAL ==
   * The Kerchiefs' idea of an officer, which is to say an officer's coat
   * taken off an officer. A crimson frock coat long in the tails and braided
   * in gold, epaulettes with their fringe, a bicorne with a plume a yard
   * long, and the family's kerchief worn up over the face under a black
   * domino mask. A cutlass out in front and a pistol in the sash. He stands
   * like a portrait of himself. */
  function admiral(g, s, p) {
    const { u, X, Y, P, hash, glowAt, trace, ramp, line, dot, pal } = rig(g, s);
    const RED = pal(p.hi, p.mid, p.lo, p.line);
    const GOLD = { hi: '#fff0b0', mid: '#e0b24a', lo: '#8a6118', line: '#3a2606' };
    const BLACK = { hi: '#4a4652', mid: '#23212a', lo: '#0e0d12', line: '#050408' };
    const CLOTH = '#efe8da', CLOTH_LO = '#b9ad98';

    // 1. the coat tails behind him, swung out by the stance
    poly(g, P([[36, 50], [64, 50], [72, 84], [62, 88], [52, 80], [40, 86], [28, 84]]), p.lo, p.line, u * 0.9);
    line([[62, 88], [72, 84]], GOLD.mid, 1.2);
    line([[28, 84], [40, 86]], GOLD.mid, 1.2);

    // 2. legs: white breeches into tall black boots with turned cuffs
    for (const [lx, k] of [[42, -1], [57, 1]]) {
      poly(g, P([[lx - 4.6, 60], [lx + 4.6, 60], [lx + 4.2 + k, 74], [lx - 4.2 + k, 74]]), CLOTH, CLOTH_LO, u * 0.7);
      poly(g, P([[lx - 5 + k, 72], [lx + 5 + k, 72], [lx + 4.6 + k, 86], [lx - 4.6 + k, 86]]), BLACK.mid, BLACK.line, u * 0.8);
      poly(g, P([[lx - 5.6 + k, 71], [lx + 5.6 + k, 71], [lx + 5.2 + k, 75], [lx - 5.2 + k, 75]]), BLACK.hi, BLACK.line, u * 0.7);
      poly(g, P([[lx - 4.6 + k, 85], [lx + 4.6 + k, 85], [lx + 4 + k, 90], [lx - 9.4 + k, 90], [lx - 9 + k, 87.4]]), BLACK.mid, BLACK.line, u * 0.7);
      line([[lx - 3.4 + k, 76], [lx - 3 + k, 84]], BLACK.hi, 0.8);
      line([[lx - 9 + k, 89.6], [lx + 4 + k, 89.6]], '#000', 0.9);
    }

    // 3. the coat: fitted at the chest, flaring past the hips, open down the front
    const coat = [[35, 38], [65, 38], [68, 58], [70, 76], [58, 79], [52, 62], [48, 62], [42, 79], [30, 76], [32, 58]];
    poly(g, P(coat), p.mid, p.line, u);
    g.save();
    trace(coat); g.clip();
    // the lit side and the shadow side of the cloth
    const cg = g.createLinearGradient(X(30), 0, X(70), 0);
    cg.addColorStop(0, 'rgba(255,220,200,.18)'); cg.addColorStop(0.45, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,.32)');
    g.fillStyle = cg; g.fillRect(X(28), Y(36), X(44), Y(46));
    // folds where the skirt breaks
    for (const [x0, x1] of [[36, 32], [40, 38], [60, 63], [64, 68]]) {
      line([[x0, 60], [x1, 78]], 'rgba(0,0,0,.28)', 1.1);
      line([[x0 + 1.2, 60], [x1 + 1.4, 78]], 'rgba(255,220,210,.14)', 0.8);
    }
    g.restore();
    // gold braid down both front edges and round the hem
    line([[48, 40], [48, 62], [42, 79], [30, 76]], GOLD.line, 2.4);
    line([[48, 40], [48, 62], [42, 79], [30, 76]], GOLD.mid, 1.4);
    line([[52, 40], [52, 62], [58, 79], [70, 76]], GOLD.line, 2.4);
    line([[52, 40], [52, 62], [58, 79], [70, 76]], GOLD.mid, 1.4);

    // 4. the waistcoat and shirt, showing down the opening
    poly(g, P([[48, 40], [52, 40], [52, 62], [48, 62]]), BLACK.mid, BLACK.line, u * 0.6);
    for (let i = 0; i < 4; i++) { dot(50, 45 + i * 4.4, 0.9, GOLD.mid); dot(49.7, 44.7 + i * 4.4, 0.4, GOLD.hi); }
    // the sash, knotted at the hip, with the pistol in it
    poly(g, P([[32, 56], [68, 56], [68.6, 61], [31.4, 61]]), BLACK.mid, BLACK.line, u * 0.7);
    line([[32, 57.4], [68, 57.4]], BLACK.hi, 0.6);
    poly(g, P([[61, 59], [65, 60], [64, 70], [60.6, 68]]), BLACK.hi, BLACK.line, u * 0.6);
    // pistol: walnut grip and a brass butt, barrel down behind the sash
    g.save();
    g.translate(X(58), Y(58)); g.rotate(-0.5);
    poly(g, [[-X(1.6), -Y(1)], [X(4.4), -Y(1.6)], [X(5.2), Y(2.6)], [-X(1.2), Y(3.4)]], '#6b3e1e', '#2a1508', u * 0.6);
    dot(5.4 - 58 + 58, 0.4, 1.3, GOLD.mid);
    g.restore();
    dot(62.6, 55.8, 1.5, GOLD.mid); dot(62.2, 55.4, 0.6, GOLD.hi);

    // 5. the cravat: a spill of white lace at the throat
    poly(g, P([[46, 37], [54, 37], [55.4, 42], [52.6, 46], [50, 43.6], [47.4, 46], [44.6, 42]]), CLOTH, CLOTH_LO, u * 0.7);
    line([[47, 40.4], [50, 42], [53, 40.4]], CLOTH_LO, 0.5);

    // 6. the far arm, bent back to the hip
    poly(g, P([[64, 39], [70.6, 42], [72, 55], [66.6, 57], [65, 46]]), p.lo, p.line, u * 0.9);
    poly(g, P([[66.2, 54], [72.4, 52.6], [73, 56.6], [67, 58.2]]), p.hi, GOLD.line, u * 0.6);   // turnback
    line([[66.4, 55.6], [72.6, 54.2]], GOLD.mid, 0.9);
    shaded(g, X(68.4), Y(59.4), X(2.6), X(2.2), pal('#f3ece0', '#cfc4b0', '#8b806c'));      // glove

    // 7. the near arm: forward, the cutlass up and out in front of him
    poly(g, P([[36, 39], [29.4, 42], [23, 50], [27, 53.4], [33.4, 47]]), p.mid, p.line, u * 0.9);
    poly(g, P([[20.8, 48.4], [26.6, 52.8], [23.8, 55.4], [18.4, 51.4]]), p.hi, GOLD.line, u * 0.6);  // turnback
    line([[19.6, 50], [25.2, 54.2]], GOLD.mid, 0.9);
    // the cutlass: a curved blade with a fuller, a bell guard and a gold grip
    g.save();
    g.translate(X(18.6), Y(53.4));
    const blade = [[-X(1.4), -Y(1)], [-X(6), -Y(14)], [-X(9.6), -Y(26)], [-X(10.2), -Y(34)],
      [-X(7.4), -Y(26)], [-X(3.6), -Y(14)], [X(1.2), -Y(1.6)]];
    poly(g, blade, '#dfe4ec', '#4a5160', u * 0.7);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = u * 0.5;
    g.beginPath(); g.moveTo(-X(0.8), -Y(3)); g.quadraticCurveTo(-X(6), -Y(16), -X(9.2), -Y(31)); g.stroke();
    g.strokeStyle = 'rgba(60,70,90,.55)'; g.lineWidth = u * 0.5;
    g.beginPath(); g.moveTo(-X(1.6), -Y(4)); g.quadraticCurveTo(-X(5.4), -Y(15), -X(7.8), -Y(24)); g.stroke();
    // bell guard
    g.beginPath(); g.ellipse(0, 0, X(3.6), X(2.4), 0.45, 0, WS.TAU);
    g.fillStyle = GOLD.mid; g.fill(); g.strokeStyle = GOLD.line; g.lineWidth = u * 0.7; g.stroke();
    g.strokeStyle = GOLD.hi; g.lineWidth = u * 0.5;
    g.beginPath(); g.ellipse(0, 0, X(3), X(1.8), 0.45, WS.PI * 1.1, WS.PI * 1.7); g.stroke();
    g.restore();
    shaded(g, X(19.4), Y(54), X(2.8), X(2.4), pal('#f3ece0', '#cfc4b0', '#8b806c'));        // glove on the grip

    // 8. epaulettes: gold boards on each shoulder with a hanging fringe
    for (const [ex, k] of [[35.4, -1], [64.6, 1]]) {
      poly(g, P([[ex - 6.4, 36.6], [ex + 6.4, 36.6], [ex + 7 * (k > 0 ? 1.1 : 1), 40.6], [ex - 7 * (k < 0 ? 1.1 : 1), 40.6]]),
        GOLD.mid, GOLD.line, u * 0.8);
      line([[ex - 5.4, 37.6], [ex + 5.4, 37.6]], GOLD.hi, 0.6);
      for (let i = 0; i < 8; i++) {
        const fx = ex - 6.2 + i * 1.78;
        line([[fx, 40.6], [fx + k * 0.3, 44.4 + hash(i + (k > 0 ? 5 : 0)) * 1.6]], GOLD.lo, 0.9);
        line([[fx - 0.2, 40.6], [fx + k * 0.1, 43.6]], GOLD.hi, 0.4);
      }
    }
    // a medal on the breast: the star of an order nobody gave him
    dot(40.6, 46, 1.9, GOLD.line); dot(40.6, 46, 1.5, GOLD.mid);
    poly(g, P([[39.6, 43.4], [41.6, 43.4], [41.4, 44.8], [39.8, 44.8]]), '#2a5aa8', '#122a50', u * 0.4);
    dot(40.2, 45.6, 0.5, GOLD.hi);

    // 9. the head: the kerchief up over the face, the mask across the eyes
    shaded(g, X(48), Y(29), X(8.6), X(9.4), pal('#e2c7a8', '#bf9d7c', '#7c604a', '#46362a'));
    // dark hair tied back behind, in a queue with a ribbon
    poly(g, P([[54, 24], [58.6, 27], [60, 35], [57.6, 36], [55.4, 30]]), '#2a1e18', '#0f0a08', u * 0.6);
    line([[58.2, 33], [61.6, 35.6]], p.mid, 1.4);
    // the kerchief: red, knotted behind, over nose and mouth
    poly(g, P([[39.4, 29.6], [56.6, 29], [55.6, 34.6], [48.6, 39.4], [40.6, 35]]), p.mid, p.line, u * 0.8);
    g.save();
    trace([[39.4, 29.6], [56.6, 29], [55.6, 34.6], [48.6, 39.4], [40.6, 35]]); g.clip();
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.ellipse(X(52), Y(35), X(6), X(4), 0, 0, WS.TAU); g.fill();
    for (let i = 0; i < 5; i++) dot(42 + i * 3.2, 32 + (i % 2), 0.5, 'rgba(255,230,220,.55)');   // the print
    line([[41.6, 31], [47.4, 36.2]], 'rgba(0,0,0,.25)', 0.6);
    g.restore();
    poly(g, P([[56, 29.6], [61, 31.6], [59.4, 33.6], [56.2, 32.4]]), p.lo, p.line, u * 0.6);          // the knot
    // hair under the hat: dark, oiled, a lock falling over the brow
    poly(g, P([[39.2, 26], [40.4, 20.4], [48, 18.6], [56.8, 20.6], [57.4, 25.4], [52, 23], [47, 24.6], [44, 23.4]]),
      '#2a1e18', '#0f0a08', u * 0.6);
    line([[42, 21.6], [46, 20.6]], '#5a4436', 0.5);
    line([[50, 20.4], [54.6, 21.4]], '#5a4436', 0.5);
    // the domino mask, and the eyes behind it
    poly(g, P([[38.6, 24.6], [57, 24], [57.4, 27.8], [52.6, 29.6], [48, 28], [43.6, 29.8], [38.8, 28.2]]), BLACK.mid, BLACK.line, u * 0.7);
    line([[39.6, 25.2], [56, 24.6]], BLACK.hi, 0.5);
    eyes(g, X(46.6), Y(26.6), X(3.8), X(1.2), '#ffd9a0');

    // 10. the bicorne: broad, black, edged in gold, worn athwart
    poly(g, P([[30, 21], [36, 13], [48, 9.4], [60, 12.6], [67, 20.6], [58, 19.4], [48, 21.6], [38, 19.6]]), BLACK.mid, BLACK.line, u * 0.9);
    g.save();
    trace([[30, 21], [36, 13], [48, 9.4], [60, 12.6], [67, 20.6], [58, 19.4], [48, 21.6], [38, 19.6]]); g.clip();
    g.fillStyle = ramp(9, 22, ['rgba(255,255,255,.14)', 'rgba(0,0,0,0)', 'rgba(0,0,0,.3)']);
    g.fillRect(X(29), Y(8), X(40), Y(15));
    g.restore();
    line([[30, 21], [38, 19.6], [48, 21.6], [58, 19.4], [67, 20.6]], GOLD.mid, 1.2);
    line([[31, 20.2], [36.4, 13.4], [48, 10], [59.6, 13.2], [66, 20]], GOLD.lo, 0.7);
    // the cockade: a rosette of the family red, and a gold loop
    dot(48, 16, 3, p.line); dot(48, 16, 2.5, p.mid); dot(48, 16, 1.2, GOLD.mid);
    // the plume: long, white, sweeping back and down over the far brim
    g.save();
    const plume = [[46, 13], [54, 5.6], [66, 4.4], [76, 9], [80, 16], [75, 13.6], [70, 11.6], [62, 11], [54, 13]];
    poly(g, P(plume), '#f6f1e6', '#9a907e', u * 0.7);
    g.strokeStyle = 'rgba(150,140,120,.6)'; g.lineWidth = u * 0.45;
    for (let i = 0; i < 9; i++) {
      const t = i / 8, bx = 50 + t * 26, by = 8 + t * 2.6 + t * t * 3;
      g.beginPath(); g.moveTo(X(bx), Y(by)); g.lineTo(X(bx + 2.6), Y(by + 3.6 + t * 1.4)); g.stroke();
    }
    g.strokeStyle = '#cfc6b2'; g.lineWidth = u * 0.6;
    g.beginPath(); g.moveTo(X(48), Y(12)); g.quadraticCurveTo(X(64), Y(4.6), X(79), Y(15)); g.stroke();
    g.restore();
    glowAt(48, 16, 5, 'rgba(255,120,110,.2)');
  }
  WS.Sprites.define('admiral', admiral);

  /* ====================================================== MORDECAI ==========
   * The Unburied. He climbed out of his own grave in the cloth they put him
   * in, and he has not changed since: a shroud gone grey with the ground, the
   * burial wrappings still round his chest, grave-chains he broke and kept.
   * A collar of bone stands up behind his head. His staff is a gallows crook
   * with a lantern on a chain, and the light in it is somebody. The dead he
   * has taken hang from his belt; the soul-fire in his raised hand is his own
   * colour, so the bestiary's two tints of him still read as two men. */
  function mordecai(g, s, p) {
    const { u, X, Y, P, hash, glowAt, trace, ramp, line, dot, pal } = rig(g, s);
    const SOUL = p.glow, SOUL_MID = p.hi;
    const ROBE = { hi: '#46524c', mid: '#28302d', lo: '#111614', line: '#070a09' };
    const LINEN = { hi: '#e2dcc4', mid: '#b3aa8c', lo: '#6f6852', line: '#3a3526' };
    const SKIN = pal('#b7c4ae', '#7d8c77', '#3d4839', '#1e251c');
    const BONE = { hi: '#f2eee2', mid: '#cfc6b0', lo: '#857c66', line: '#3e3829' };
    const CHAIN = { hi: '#b9bec4', mid: '#6d737c', lo: '#33373e' };
    const soulRGB = [1, 3, 5].map((i) => parseInt(p.hi.slice(i, i + 2), 16));
    const soulA = (a) => `rgba(${soulRGB.join(',')},${a})`;

    // 1. the graveyard light he walks in
    glowAt(50, 52, 44, soulA(0.14));

    // 2. the collar of bone, standing up behind the hood
    for (let i = 0; i < 7; i++) {
      const a = -2.55 + i * 0.3, r0 = 9, r1 = 17 + (i % 2 ? 2 : 5) + hash(i) * 3;
      const bx = 49 + Math.cos(a) * r0, by = 33 + Math.sin(a) * r0;
      const tx = 49 + Math.cos(a) * r1, ty = 33 + Math.sin(a) * r1;
      const nx = -Math.sin(a) * 1.6, ny = Math.cos(a) * 1.6;
      poly(g, P([[bx - nx, by - ny], [tx, ty], [bx + nx, by + ny]]), BONE.mid, BONE.line, u * 0.6);
      line([[bx - nx * 0.4, by - ny * 0.4], [tx - nx * 0.1, ty - ny * 0.1]], BONE.hi, 0.5);
    }

    // 3. the staff: a crooked black branch, a gallows arm, a lantern on a chain
    line([[25, 92], [22, 58], [24, 40], [20, 14]], ROBE.line, 3.6);
    line([[25, 92], [22, 58], [24, 40], [20, 14]], '#3a2f26', 2.2);
    line([[24.2, 90], [21.3, 58], [23.2, 40], [19.4, 16]], '#6a5746', 0.7);
    line([[20, 14], [15, 11.4], [12, 13]], '#3a2f26', 2.2);
    for (const y of [48, 70]) line([[21, y], [25, y + 1.6]], CHAIN.mid, 1.3);        // iron bands
    // the chain and the lantern on it (drawn three units in from where the
    // numbers say, so its light stays inside the tile)
    g.save(); g.translate(X(3), 0);
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = CHAIN.mid; g.lineWidth = u * 0.7;
      g.beginPath(); g.ellipse(X(9), Y(15 + i * 2), X(0.8), X(1.2), 0, 0, WS.TAU); g.stroke();
    }
    glowAt(9, 29, 9, soulA(0.55));
    poly(g, P([[5.6, 22], [12.4, 22], [11.6, 24], [6.4, 24]]), CHAIN.lo, '#111', u * 0.5);
    g.save();
    trace([[6, 24], [12, 24], [12.8, 33], [5.2, 33]]); g.clip();
    g.fillStyle = soulA(0.9); g.fillRect(X(4), Y(23), X(10), Y(11));
    // the face in the light: someone he kept
    g.fillStyle = 'rgba(20,50,35,.55)';
    g.beginPath(); g.ellipse(X(8), Y(27.6), X(0.8), X(1), 0, 0, WS.TAU); g.fill();
    g.beginPath(); g.ellipse(X(10.2), Y(27.6), X(0.8), X(1), 0, 0, WS.TAU); g.fill();
    g.beginPath(); g.ellipse(X(9.1), Y(30.6), X(0.9), X(1.4), 0, 0, WS.TAU); g.fill();
    g.restore();
    trace([[6, 24], [12, 24], [12.8, 33], [5.2, 33]]);
    g.strokeStyle = CHAIN.lo; g.lineWidth = u * 1; g.stroke();
    line([[9, 24], [9, 33]], CHAIN.lo, 0.7);
    poly(g, P([[4.8, 33], [13.2, 33], [12, 35.4], [6, 35.4]]), CHAIN.lo, '#111', u * 0.5);
    g.restore();

    // 4. the shroud: long, heavy with earth, torn to strips at the hem
    const hem = [];
    for (let i = 0; i <= 10; i++) hem.push([70 - i * 4.2, 90 + (i % 2 ? -3.6 - hash(i + 30) * 3 : 0.6)]);
    const shroud = [[37, 36], [61, 36], [68, 58], [71, 89]].concat(hem, [[30, 58]]);
    g.save();
    trace(shroud);
    g.fillStyle = ramp(36, 90, [ROBE.hi, ROBE.mid, ROBE.lo]); g.fill();
    g.clip();
    // folds from the shoulders
    for (const [x0, x1] of [[40, 32], [45, 42], [55, 58], [59, 67]]) {
      const fg = g.createLinearGradient(X(x1 - 3), 0, X(x1 + 3), 0);
      fg.addColorStop(0, 'rgba(0,0,0,.4)'); fg.addColorStop(0.6, 'rgba(200,230,210,.08)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fg;
      g.beginPath(); g.moveTo(X(x0 - 1), Y(38)); g.lineTo(X(x0 + 1), Y(38));
      g.lineTo(X(x1 + 3), Y(91)); g.lineTo(X(x1 - 3), Y(91)); g.closePath(); g.fill();
    }
    // the grave still on it: earth caked at the hem
    g.fillStyle = 'rgba(60,44,28,.55)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.ellipse(X(30 + hash(i + 50) * 40), Y(80 + hash(i + 70) * 10), X(2 + hash(i) * 3), X(1.2 + hash(i + 2)), 0, 0, WS.TAU);
      g.fill();
    }
    // soul-light catching the lit edge
    g.strokeStyle = soulA(0.35); g.lineWidth = u * 1;
    g.beginPath(); g.moveTo(X(37), Y(36)); g.lineTo(X(30), Y(58)); g.lineTo(X(28.4), Y(88)); g.stroke();
    g.restore();

    // 5. the burial wrappings across his chest, and the chain he broke
    g.save();
    const chest = [[40, 38], [58, 38], [60, 60], [38, 60]];
    trace(chest); g.clip();
    g.fillStyle = LINEN.lo; g.fillRect(X(38), Y(38), X(22), Y(22));
    for (let i = 0; i < 6; i++) {
      const y = 39 + i * 3.8, tilt = (i % 2 ? 1.6 : -1.4);
      poly(g, P([[37, y - tilt], [61, y + tilt], [61, y + 3 + tilt], [37, y + 3 - tilt]]), LINEN.mid, LINEN.line, u * 0.5);
      line([[38, y + 0.6 - tilt], [60, y + 0.6 + tilt]], LINEN.hi, 0.5);
    }
    g.fillStyle = 'rgba(60,70,50,.3)';
    g.beginPath(); g.ellipse(X(52), Y(52), X(4), X(3), 0.3, 0, WS.TAU); g.fill();
    g.restore();
    // the chain, slung across and hanging broken
    for (let i = 0; i < 9; i++) {
      const t = i / 8, cx = 39 + t * 22, cy = 42 + t * 14 + Math.sin(t * 3) * 1.2;
      g.strokeStyle = CHAIN.mid; g.lineWidth = u * 0.9;
      g.beginPath(); g.ellipse(X(cx), Y(cy), X(1.3), X(0.8), 0.6, 0, WS.TAU); g.stroke();
      g.strokeStyle = CHAIN.hi; g.lineWidth = u * 0.35;
      g.beginPath(); g.ellipse(X(cx), Y(cy), X(1.3), X(0.8), 0.6, WS.PI, WS.PI * 1.6); g.stroke();
    }
    poly(g, P([[59, 55], [63, 55], [63.4, 60], [58.6, 60]]), CHAIN.mid, CHAIN.lo, u * 0.6);      // padlock
    g.strokeStyle = CHAIN.mid; g.lineWidth = u * 0.8;
    g.beginPath(); g.arc(X(61), Y(55), X(1.5), WS.PI, 0); g.stroke();
    dot(61, 57.4, 0.5, '#111');

    // 6. the belt and his dead on it
    poly(g, P([[34, 60], [64, 60], [64.6, 64], [33.4, 64]]), '#2c2218', '#0e0a06', u * 0.7);
    line([[34, 61], [64, 61]], '#5a4632', 0.5);
    for (const [kx, len] of [[37, 7], [44, 10], [57, 8]]) {
      line([[kx, 63], [kx + 0.6, 63 + len]], '#4a3a28', 0.6);
      const sy = 63 + len + 2.4;
      shaded(g, X(kx + 0.6), Y(sy), X(2.4), X(2.6), pal(BONE.hi, BONE.mid, BONE.lo, BONE.line));
      dot(kx - 0.3, sy - 0.1, 0.7, '#1a1612'); dot(kx + 1.5, sy - 0.1, 0.7, '#1a1612');
      line([[kx - 0.4, sy + 1.6], [kx + 1.6, sy + 1.6]], BONE.lo, 0.4);
    }

    // 7. the far arm: raised, open, the soul-fire in it
    poly(g, P([[60, 38], [66, 40], [72, 30], [69, 27], [63, 34]]), ROBE.mid, ROBE.line, u * 0.9);
    poly(g, P([[67, 31], [74.4, 27], [73, 24], [66, 28]]), ROBE.hi, ROBE.line, u * 0.6);     // ragged cuff
    g.save();
    g.strokeStyle = SKIN.mid; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = -2.0 + i * 0.32;
      const k1x = 72 + Math.cos(a) * 3.4, k1y = 24 + Math.sin(a) * 3.4;
      const tx = k1x + Math.cos(a + 0.4) * 3, ty = k1y + Math.sin(a + 0.4) * 3;
      g.lineWidth = u * 0.9;
      g.beginPath(); g.moveTo(X(72), Y(25)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(tx), Y(ty)); g.stroke();
    }
    g.restore();
    glowAt(73, 16, 9, soulA(0.6));
    g.save();
    g.fillStyle = SOUL; g.shadowColor = SOUL_MID; g.shadowBlur = X(4);
    g.beginPath();
    g.moveTo(X(74), Y(8)); g.quadraticCurveTo(X(79), Y(15), X(76.6), Y(19));
    g.quadraticCurveTo(X(74), Y(21.4), X(71.4), Y(19)); g.quadraticCurveTo(X(69.6), Y(14), X(74), Y(8));
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.ellipse(X(74), Y(16.6), X(1.3), X(2), 0, 0, WS.TAU); g.fill();
    g.restore();

    // 8. the near arm, down the staff
    poly(g, P([[38, 38], [31, 42], [24, 55], [28.4, 58], [36, 47]]), ROBE.hi, ROBE.line, u * 0.9);
    g.save();
    g.strokeStyle = SKIN.mid; g.lineCap = 'round'; g.lineWidth = u * 1.2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(X(26.4), Y(55 + i * 1.4)); g.lineTo(X(21.4), Y(56.4 + i * 1.4)); g.stroke(); }
    g.restore();

    // 9. the hood, and the face at the back of it
    g.save();
    g.beginPath();
    g.moveTo(X(36.6), Y(42)); g.quadraticCurveTo(X(35), Y(20), X(48.6), Y(15.4));
    g.quadraticCurveTo(X(62), Y(19), X(61.4), Y(42)); g.quadraticCurveTo(X(49), Y(38), X(36.6), Y(42));
    const hg = g.createRadialGradient(X(47), Y(31), X(2), X(48), Y(30), X(15));
    hg.addColorStop(0, '#040605'); hg.addColorStop(0.62, ROBE.mid); hg.addColorStop(1, ROBE.hi);
    g.fillStyle = hg; g.fill();
    g.strokeStyle = ROBE.line; g.lineWidth = u * 0.8; g.stroke();
    g.restore();
    line([[37.4, 40.6], [36.2, 22.6], [48.6, 16.2]], soulA(0.3), 0.8);
    // the face: long, grey, the skin gone tight over the bone
    g.save();
    g.beginPath();
    g.moveTo(X(42.4), Y(28)); g.quadraticCurveTo(X(42.6), Y(22.4), X(47.6), Y(22));
    g.quadraticCurveTo(X(53), Y(22.4), X(53.2), Y(28));
    g.quadraticCurveTo(X(53), Y(34), X(49.6), Y(38.4)); g.lineTo(X(46.2), Y(38.4));
    g.quadraticCurveTo(X(42.4), Y(34), X(42.4), Y(28)); g.closePath();
    g.fillStyle = ramp(22, 38.4, [SKIN.hi, SKIN.mid, SKIN.lo]); g.fill();
    g.clip();
    const shade = g.createLinearGradient(0, Y(22), 0, Y(28));
    shade.addColorStop(0, 'rgba(4,6,5,.8)'); shade.addColorStop(1, 'rgba(4,6,5,0)');
    g.fillStyle = shade; g.fillRect(X(42), Y(21), X(12), Y(7));
    g.fillStyle = 'rgba(25,35,25,.55)';
    g.beginPath(); g.ellipse(X(44.2), Y(32.6), X(1.2), X(2.4), 0.2, 0, WS.TAU); g.fill();
    g.beginPath(); g.ellipse(X(51.8), Y(32.6), X(1.2), X(2.4), -0.2, 0, WS.TAU); g.fill();
    g.restore();
    eyes(g, X(47.8), Y(28.2), X(2.8), X(1.1), SOUL);
    // the mouth, sewn shut by the undertaker and grinning anyway
    line([[45, 35.4], [47.8, 36.2], [50.8, 35.2]], '#1a221a', 0.7);
    for (let i = 0; i < 4; i++) line([[45.8 + i * 1.5, 34.4], [45.8 + i * 1.5, 36.8]], LINEN.mid, 0.35);
    // lank white hair out of the hood
    g.save();
    g.strokeStyle = 'rgba(225,230,220,.75)'; g.lineWidth = u * 0.5; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, k = i % 3;
      const x0 = 47.8 + side * (5.2 + k * 1.2);
      g.beginPath(); g.moveTo(X(x0), Y(23.4 + k));
      g.quadraticCurveTo(X(x0 + side * 2.6), Y(32 + k * 2), X(x0 + side * 2.2), Y(42 + k * 2.4)); g.stroke();
    }
    g.restore();

    // 10. motes of soul-fire in the air round him
    for (let i = 0; i < 12; i++) {
      const x = 14 + hash(i + 90) * 72, y = 10 + hash(i + 130) * 70;
      if (x > 34 && x < 66 && y > 20) continue;
      dot(x, y, 0.5 + hash(i + 7) * 0.5, soulA(0.8));
    }
  }
  WS.Sprites.define('mordecai', mordecai);
  WS.Sprites.define('mordecai_face', (g, s) => face('mordecai', [0.55, 0.92, 0.72], 2.1, 0.47, 0.28)(g, s));
  WS.Sprites.define('admiral_face', (g, s) => face('admiral', [0.92, 0.22, 0.28], 2.0, 0.48, 0.25)(g, s));

  /* Speaker portraits: the face, not the figure. A whole body in a
     dialogue circle is a face three pixels wide. */
  function face(art, tint, zoom, fx, fy) {
    return function (g, s) {
      const full = WS.Sprites.creature(art, tint, WS.round(s));
      g.drawImage(full, s / 2 - s * zoom * fx, s * 0.5 - s * zoom * fy, s * zoom, s * zoom);
    };
  }
  WS.Sprites.define('grimtunnel_face', face('grimtunnel', [1.0, 0.86, 0.5], 1.9, 0.46, 0.33));

  /* ======================================================== DEATH ITSELF ====
   * Who comes for you at the end of the night if you are still standing.
   * It was the Pale Wraith's body with a scythe stood beside it, which is
   * a costume. Death is taller than anything on the field, and narrow; a
   * robe that does not reach the ground so much as stop being there, a
   * skull at the back of a peaked hood, hands of bone - one on the haft,
   * one reaching for you - and at the belt an hourglass with the sand
   * nearly through. The scythe is the silhouette: a blade that sweeps back
   * over the hood, wider than Death is. */
  function reaper(g, s, p) {
    const { u, X, Y, P, hash, glowAt, trace, ramp, line, dot } = rig(g, s);
    const ROBE = { hi: '#39435a', mid: '#161b28', lo: '#07090e' };
    const BONE = { hi: '#f4f6f4', mid: '#cdd4d6', lo: '#7f8a92', line: '#2c3238' };
    const COLD = p.glow;
    const coldRGB = [1, 3, 5].map((i) => parseInt(COLD.slice(i, i + 2), 16));
    const cold = (a) => `rgba(${coldRGB.join(',')},${a})`;

    // 1. the cold it brings with it
    glowAt(48, 52, 46, cold(0.16));

    // 2. the scythe's haft, behind the body: dark wood, iron-shod
    line([[70, 93], [62, 12]], '#0b0a0c', 3.4);
    line([[70, 93], [62, 12]], '#3a2e26', 2.2);
    line([[69.3, 91], [61.4, 14]], '#6a5646', 0.6);
    for (const t of [0.12, 0.72]) {
      const x = 70 - 8 * t, y = 93 - 81 * t;
      line([[x - 1.8, y + 0.4], [x + 1.8, y - 0.4]], '#8b95a2', 1.4);
    }

    // 3. the robe: tall, narrow at the shoulder, frayed into nothing at the foot
    const strips = [];
    for (let i = 0; i <= 12; i++) {
      const x = 26 + i * (48 / 12);
      strips.push([x, 80 + (i % 2 ? 10 + hash(i + 3) * 5 : 2 + hash(i) * 3)]);
    }
    const robe = [[40, 30], [58, 30], [66, 52], [74, 80]].concat(strips.reverse(), [[22, 80], [32, 52]]);
    g.save();
    trace(robe);
    g.fillStyle = ramp(30, 94, [ROBE.hi, ROBE.mid, ROBE.lo]); g.fill();
    g.clip();
    for (const [x0, x1] of [[43, 31], [47, 41], [53, 57], [56, 67]]) {
      const fg = g.createLinearGradient(X(x1 - 3), 0, X(x1 + 3), 0);
      fg.addColorStop(0, 'rgba(0,0,0,.5)'); fg.addColorStop(0.6, cold(0.1)); fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fg;
      g.beginPath(); g.moveTo(X(x0 - 1), Y(32)); g.lineTo(X(x0 + 1), Y(32));
      g.lineTo(X(x1 + 3), Y(95)); g.lineTo(X(x1 - 3), Y(95)); g.closePath(); g.fill();
    }
    // the hem is not there: the robe fades as it goes down
    const fade = g.createLinearGradient(0, Y(70), 0, Y(95));
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, cold(0.35));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = fade; g.fillRect(X(20), Y(70), X(60), Y(26));
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = cold(0.4); g.lineWidth = u * 1;
    g.beginPath(); g.moveTo(X(40), Y(30)); g.lineTo(X(32), Y(52)); g.lineTo(X(22), Y(80)); g.stroke();
    g.restore();
    // mist curling off the frayed strips
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = 28 + i * 8.4;
      const mg = g.createLinearGradient(0, Y(86), 0, Y(95));
      mg.addColorStop(0, cold(0.16)); mg.addColorStop(1, cold(0));
      g.strokeStyle = mg; g.lineWidth = u * (2.4 - i * 0.15);
      g.beginPath(); g.moveTo(X(x), Y(86)); g.quadraticCurveTo(X(x - 2.4), Y(90), X(x + 0.6), Y(95)); g.stroke();
    }
    g.restore();

    // 4. the belt: a cord, and the hourglass on it
    line([[33, 56], [48, 58.6], [63, 56]], '#2a2622', 1.4);
    const hx = 58, hy = 63;
    poly(g, P([[hx - 3.6, hy - 5.4], [hx + 3.6, hy - 5.4], [hx + 3.6, hy - 4.4], [hx - 3.6, hy - 4.4]]), '#c9a24a', '#3a2606', u * 0.5);
    poly(g, P([[hx - 3.6, hy + 4.4], [hx + 3.6, hy + 4.4], [hx + 3.6, hy + 5.4], [hx - 3.6, hy + 5.4]]), '#c9a24a', '#3a2606', u * 0.5);
    g.save();
    trace([[hx - 2.8, hy - 4.4], [hx + 2.8, hy - 4.4], [hx + 0.5, hy], [hx + 2.8, hy + 4.4], [hx - 2.8, hy + 4.4], [hx - 0.5, hy]]);
    g.fillStyle = 'rgba(200,230,255,.25)'; g.fill();
    g.clip();
    g.fillStyle = '#e8c070';
    g.fillRect(X(hx - 3), Y(hy + 2), X(6), Y(3));                // nearly all through
    g.fillRect(X(hx - 0.35), Y(hy - 0.8), X(0.7), Y(3));          // the last of it falling
    g.fillRect(X(hx - 1.2), Y(hy - 1.6), X(2.4), Y(0.8));
    g.restore();
    trace([[hx - 2.8, hy - 4.4], [hx + 2.8, hy - 4.4], [hx + 0.5, hy], [hx + 2.8, hy + 4.4], [hx - 2.8, hy + 4.4], [hx - 0.5, hy]]);
    g.strokeStyle = 'rgba(210,235,255,.7)'; g.lineWidth = u * 0.5; g.stroke();
    for (const d of [-1, 1]) line([[hx + d * 3.3, hy - 4.6], [hx + d * 3.3, hy + 4.6]], '#8a6118', 0.7);

    // 5. the far arm, up to the haft, and the hand of bone on it
    poly(g, P([[57, 32], [63, 35], [66, 46], [62, 48], [58, 40]]), ROBE.hi, '#05070a', u * 0.8);
    g.save();
    g.strokeStyle = BONE.mid; g.lineCap = 'round'; g.lineWidth = u * 1.1;
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(X(62), Y(45 + i * 1.3)); g.lineTo(X(66.6), Y(44.4 + i * 1.3)); g.stroke();
    }
    g.restore();

    // 6. the near arm: out toward you, the hand open
    poly(g, P([[41, 32], [34, 35], [24, 43], [27, 47], [36, 41]]), ROBE.hi, '#05070a', u * 0.8);
    poly(g, P([[22, 40.6], [28.6, 44.6], [26, 48.2], [20.4, 44.6]]), ROBE.mid, '#05070a', u * 0.6);   // ragged cuff
    g.save();
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = 2.6 + i * 0.24;
      const k1x = 21 + Math.cos(a) * 4, k1y = 44 + Math.sin(a) * 4;
      const tx = k1x + Math.cos(a + 0.5) * 3.6, ty = k1y + Math.sin(a + 0.5) * 3.6;
      g.strokeStyle = BONE.mid; g.lineWidth = u * 0.8;
      g.beginPath(); g.moveTo(X(21.4), Y(44)); g.lineTo(X(k1x), Y(k1y)); g.lineTo(X(tx), Y(ty)); g.stroke();
      dot(k1x, k1y, 0.55, BONE.hi);
    }
    line([[21.6, 45.6], [18.6, 48.6]], BONE.mid, 0.8);          // the thumb
    g.restore();

    // 7. the hood: tall, peaked, falling to the shoulders
    g.save();
    g.beginPath();
    g.moveTo(X(36), Y(40)); g.quadraticCurveTo(X(33), Y(19), X(47), Y(9));
    g.quadraticCurveTo(X(52), Y(8), X(55), Y(12));
    g.quadraticCurveTo(X(63), Y(21), X(61), Y(40)); g.quadraticCurveTo(X(49), Y(35), X(36), Y(40));
    const hg = g.createRadialGradient(X(47), Y(27), X(2), X(48), Y(26), X(17));
    hg.addColorStop(0, '#020305'); hg.addColorStop(0.55, ROBE.mid); hg.addColorStop(1, ROBE.hi);
    g.fillStyle = hg; g.fill();
    g.strokeStyle = '#05070a'; g.lineWidth = u * 0.8; g.stroke();
    g.restore();
    line([[36.8, 39], [34.4, 20], [47, 9.8]], cold(0.45), 0.8);
    // the skull, back in the dark
    g.save();
    g.beginPath();
    g.moveTo(X(42), Y(25)); g.quadraticCurveTo(X(42), Y(18.6), X(47.4), Y(18.4));
    g.quadraticCurveTo(X(52.8), Y(18.6), X(52.8), Y(25));
    g.quadraticCurveTo(X(52.6), Y(29), X(50.6), Y(31)); g.lineTo(X(50), Y(33.4));
    g.lineTo(X(45), Y(33.4)); g.lineTo(X(44.4), Y(31));
    g.quadraticCurveTo(X(42), Y(29), X(42), Y(25)); g.closePath();
    g.fillStyle = ramp(18, 33, [BONE.hi, BONE.mid, BONE.lo]); g.fill();
    g.clip();
    const shade = g.createLinearGradient(0, Y(18), 0, Y(25));
    shade.addColorStop(0, 'rgba(2,3,5,.85)'); shade.addColorStop(1, 'rgba(2,3,5,0)');
    g.fillStyle = shade; g.fillRect(X(41), Y(17), X(13), Y(9));
    g.restore();
    for (const d of [-1, 1]) {
      g.fillStyle = '#05070a';
      g.beginPath(); g.ellipse(X(47.4 + d * 2.6), Y(25.4), X(1.9), X(1.7), 0, 0, WS.TAU); g.fill();
    }
    eyes(g, X(47.4), Y(25.6), X(2.6), X(0.7), COLD);
    g.fillStyle = '#05070a';
    g.beginPath(); g.moveTo(X(47.4), Y(27.6)); g.lineTo(X(46.4), Y(29.6)); g.lineTo(X(48.4), Y(29.6)); g.closePath(); g.fill();
    line([[44.8, 31.4], [50.2, 31.4]], BONE.line, 0.5);
    for (let i = -2; i <= 2; i++) line([[47.5 + i * 1.05, 30.6], [47.5 + i * 1.05, 32.8]], BONE.line, 0.35);

    // 8. the blade: the widest thing about Death, sweeping back over the hood
    const top = [62, 12];
    g.save();
    const bladePts = [[62.6, 9.6], [52, 4.4], [36, 3.8], [22, 7.6], [11, 15], [7.4, 21], [14, 16.4], [25, 12], [38, 9.4], [51, 10.6], [61.6, 14.4]];
    const bg = g.createLinearGradient(X(10), Y(4), X(20), Y(22));
    bg.addColorStop(0, '#f2f8ff'); bg.addColorStop(0.5, '#a9b6c8'); bg.addColorStop(1, '#4a5566');
    poly(g, P(bladePts), bg, '#1d2330', u * 0.8);
    // the edge, honed bright, and the cold running along it
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = u * 0.7; g.lineCap = 'round';
    trace([[61.6, 14.4], [51, 10.6], [38, 9.4], [25, 12], [14, 16.4], [7.4, 21]], false); g.stroke();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = cold(0.5); g.lineWidth = u * 1.8;
    trace([[50, 11.2], [38, 10.2], [25, 12.8], [14, 17.2]], false); g.stroke();
    g.globalCompositeOperation = 'source-over';
    // the fuller, and the tang where it meets the haft
    line([[58, 10.8], [46, 7.6], [32, 7.4]], 'rgba(40,50,66,.5)', 0.8);
    poly(g, P([[59.6, 8.4], [64.4, 9.6], [64.2, 15], [59.8, 14.6]]), '#6d7580', '#1d2330', u * 0.6);
    dot(62, 11.8, 0.8, '#c9d2dc');
    g.restore();
    void top;

    // 9. the air round it, which has gone cold
    for (let i = 0; i < 14; i++) {
      const x = 12 + hash(i + 70) * 76, y = 26 + hash(i + 110) * 62;
      if (x > 30 && x < 68) continue;
      dot(x, y, 0.4 + hash(i + 3) * 0.4, cold(0.8));
    }
  }
  WS.Sprites.define('reaper', reaper);

  WS.Villains = { face };

})(window.WS);
