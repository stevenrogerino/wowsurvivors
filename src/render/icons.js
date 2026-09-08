/* Procedural ability icons. Each glyph is drawn in a normalised 100x100 space
 * on an obsidian plate with an arc-lit rim, so weapons, passives, blessings and
 * achievements all share one visual language (see docs/ARCLIGHT-UI.md). */
'use strict';
(function (WS) {

  const cache = new Map();

  /* Every glyph draws inside 0..100 with the ctx already translated. */
  const G = {
    /* ---- weapons -------------------------------------------------------- */
    missile(g, c) {
      for (let i = 0; i < 3; i++) {
        g.save(); g.translate(0, i * 14 - 14); g.rotate(-0.25);
        g.strokeStyle = c; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(18, 62); g.quadraticCurveTo(50, 40, 82, 46); g.stroke();
        g.restore();
      }
    },
    ember(g, c) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(50, 12); g.quadraticCurveTo(76, 42, 68, 62);
      g.quadraticCurveTo(62, 86, 50, 88); g.quadraticCurveTo(38, 86, 32, 62);
      g.quadraticCurveTo(24, 42, 50, 12); g.fill();
      g.fillStyle = '#fff6d8';
      g.beginPath(); g.ellipse(50, 66, 10, 14, 0, 0, WS.TAU); g.fill();
    },
    shard(g, c) {
      g.fillStyle = c; g.strokeStyle = '#eaf7ff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(50, 8); g.lineTo(76, 46); g.lineTo(50, 92); g.lineTo(24, 46);
      g.closePath(); g.fill(); g.stroke();
    },
    spark(g, c) {
      g.strokeStyle = c; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(62, 8); g.lineTo(36, 46); g.lineTo(56, 50); g.lineTo(34, 92); g.stroke();
    },
    ring(g, c) {
      g.strokeStyle = c; g.lineWidth = 6;
      for (const r of [18, 30, 42]) { g.globalAlpha = r === 42 ? 0.4 : 0.9; g.beginPath(); g.arc(50, 50, r, 0, WS.TAU); g.stroke(); }
      g.globalAlpha = 1;
    },
    beam(g, c) {
      const grd = g.createLinearGradient(10, 0, 90, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.45, c); grd.addColorStop(1, '#eaffd8');
      g.fillStyle = grd; g.fillRect(8, 40, 84, 20);
      g.fillStyle = '#f6ffe8'; g.fillRect(8, 47, 84, 6);
    },
    coil(g, c) {
      g.strokeStyle = c; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, a = t * WS.TAU * 1.8, r = 8 + t * 34;
        const x = 50 + WS.cos(a) * r, y = 50 + WS.sin(a) * r * 0.85;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    },
    zone(g, c) {
      g.strokeStyle = c; g.lineWidth = 5;
      g.beginPath(); g.ellipse(50, 60, 38, 20, 0, 0, WS.TAU); g.stroke();
      g.globalAlpha = 0.35; g.fillStyle = c;
      g.beginPath(); g.ellipse(50, 60, 38, 20, 0, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 4; g.lineCap = 'round';
      for (const dx of [-20, 0, 20]) { g.beginPath(); g.moveTo(50 + dx, 50); g.lineTo(50 + dx * 0.8, 22); g.stroke(); }
    },
    bolt(g, c) {
      g.fillStyle = c;
      g.beginPath(); g.ellipse(50, 50, 20, 34, -0.4, 0, WS.TAU); g.fill();
      g.globalAlpha = 0.5; g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(43, 40, 7, 12, -0.4, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
    },
    dagger(g) {
      g.fillStyle = '#dfe4ee'; g.strokeStyle = '#7b8394'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(50, 6); g.lineTo(60, 56); g.lineTo(50, 66); g.lineTo(40, 56); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = '#8a6a45'; g.fillRect(44, 66, 12, 24);
      g.fillRect(34, 62, 32, 7);
    },
    sword(g) {
      G.dagger(g);
      g.strokeStyle = '#ffe6ae'; g.lineWidth = 2; g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(50, 12); g.lineTo(50, 58); g.stroke();
      g.globalAlpha = 1;
    },
    axe(g) {
      g.strokeStyle = '#8a6a45'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(50, 92); g.lineTo(50, 26); g.stroke();
      g.fillStyle = '#d8dee9'; g.strokeStyle = '#7b8394'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(50, 18); g.quadraticCurveTo(88, 26, 78, 54); g.quadraticCurveTo(62, 44, 50, 46); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(50, 18); g.quadraticCurveTo(12, 26, 22, 54); g.quadraticCurveTo(38, 44, 50, 46); g.closePath(); g.fill(); g.stroke();
    },
    arrow(g, c) {
      g.strokeStyle = '#a97f4a'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(20, 82); g.lineTo(78, 24); g.stroke();
      g.fillStyle = c || '#dfe4ee';
      g.beginPath(); g.moveTo(86, 14); g.lineTo(62, 22); g.lineTo(78, 38); g.closePath(); g.fill();
      g.strokeStyle = '#dfe4ee'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(22, 68); g.lineTo(34, 80); g.stroke();
      g.beginPath(); g.moveTo(14, 76); g.lineTo(26, 88); g.stroke();
    },
    moon(g, c) {
      g.fillStyle = c;
      g.beginPath(); g.arc(50, 50, 34, 0, WS.TAU); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(66, 40, 28, 0, WS.TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    },
    shield(g, c) {
      g.fillStyle = c || '#e0d3a8'; g.strokeStyle = '#8a7440'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(50, 8); g.lineTo(84, 22); g.quadraticCurveTo(84, 72, 50, 92);
      g.quadraticCurveTo(16, 72, 16, 22); g.closePath(); g.fill(); g.stroke();
    },
    aegis(g, c) {
      G.shield(g, c);
      g.strokeStyle = '#fff6d8'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(50, 26); g.lineTo(50, 70); g.stroke();
      g.beginPath(); g.moveTo(32, 44); g.lineTo(68, 44); g.stroke();
    },
    chaos(g, c) {
      g.fillStyle = c;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * WS.TAU;
        g.beginPath();
        g.moveTo(50, 50);
        g.lineTo(50 + WS.cos(a) * 40, 50 + WS.sin(a) * 40);
        g.lineTo(50 + WS.cos(a + 0.5) * 26, 50 + WS.sin(a + 0.5) * 26);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(50, 50, 9, 0, WS.TAU); g.fill();
    },

    /* ---- passives / meta / blessings ------------------------------------ */
    fist(g, c) {
      g.fillStyle = c; g.strokeStyle = '#00000055'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(26, 34, 48, 40, 10); g.fill(); g.stroke();
      for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(28 + i * 12, 26, 10, 16, 5); g.fill(); }
    },
    wing(g, c) {
      g.fillStyle = c;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(50, 74); g.quadraticCurveTo(30 - i * 6, 60 - i * 8, 14 - i * 2, 30 - i * 6);
        g.quadraticCurveTo(38, 44, 50, 74); g.fill();
      }
    },
    boot(g, c) {
      g.fillStyle = c;
      g.beginPath(); g.moveTo(34, 18); g.lineTo(56, 18); g.lineTo(58, 60); g.lineTo(84, 68);
      g.lineTo(84, 84); g.lineTo(30, 84); g.closePath(); g.fill();
      g.strokeStyle = '#fff8'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(16, 40); g.lineTo(30, 44); g.stroke();
      g.beginPath(); g.moveTo(14, 56); g.lineTo(28, 58); g.stroke();
    },
    magnet(g, c) {
      g.strokeStyle = c; g.lineWidth = 14; g.lineCap = 'butt';
      g.beginPath(); g.arc(50, 54, 26, WS.PI, 0); g.stroke();
      g.fillStyle = '#e2e7f0'; g.fillRect(17, 54, 14, 20); g.fillRect(69, 54, 14, 20);
    },
    heart(g, c) {
      g.fillStyle = c;
      g.beginPath(); g.moveTo(50, 84);
      g.bezierCurveTo(10, 56, 20, 18, 50, 36);
      g.bezierCurveTo(80, 18, 90, 56, 50, 84);
      g.fill();
    },
    crosshair(g, c) {
      g.strokeStyle = c; g.lineWidth = 5;
      g.beginPath(); g.arc(50, 50, 28, 0, WS.TAU); g.stroke();
      g.lineWidth = 4; g.lineCap = 'round';
      for (const [x1, y1, x2, y2] of [[50, 8, 50, 30], [50, 70, 50, 92], [8, 50, 30, 50], [70, 50, 92, 50]]) {
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      g.fillStyle = c; g.beginPath(); g.arc(50, 50, 5, 0, WS.TAU); g.fill();
    },
    claw(g, c) {
      g.strokeStyle = c; g.lineWidth = 7; g.lineCap = 'round';
      for (const dx of [-18, 0, 18]) {
        g.beginPath(); g.moveTo(50 + dx * 0.6, 14); g.quadraticCurveTo(50 + dx, 52, 50 + dx * 1.6, 86); g.stroke();
      }
    },
    expand(g, c) {
      g.strokeStyle = c; g.lineWidth = 5;
      g.beginPath(); g.arc(50, 50, 16, 0, WS.TAU); g.stroke();
      g.globalAlpha = 0.55; g.beginPath(); g.arc(50, 50, 30, 0, WS.TAU); g.stroke();
      g.globalAlpha = 0.28; g.beginPath(); g.arc(50, 50, 42, 0, WS.TAU); g.stroke();
      g.globalAlpha = 1;
    },
    triple(g, c) {
      g.fillStyle = c;
      for (const dx of [-24, 0, 24]) {
        g.beginPath(); g.ellipse(50 + dx, 50, 9, 22, 0, 0, WS.TAU); g.fill();
      }
    },
    coin(g, c) {
      g.fillStyle = c || '#ffd35c'; g.strokeStyle = '#a3781c'; g.lineWidth = 4;
      g.beginPath(); g.arc(50, 50, 32, 0, WS.TAU); g.fill(); g.stroke();
      g.fillStyle = '#a3781c'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('G', 50, 52);
    },
    clover(g, c) {
      g.fillStyle = c || '#4fd67a';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * WS.TAU + WS.PI / 4;
        g.beginPath(); g.ellipse(50 + WS.cos(a) * 17, 46 + WS.sin(a) * 17, 14, 14, 0, 0, WS.TAU); g.fill();
      }
      g.strokeStyle = '#2f7a45'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(50, 58); g.quadraticCurveTo(58, 76, 46, 90); g.stroke();
    },
    book(g, c) {
      g.fillStyle = '#c8b48c'; g.fillRect(18, 22, 64, 58);
      g.fillStyle = c; g.fillRect(18, 22, 64, 8);
      g.strokeStyle = '#8a7450'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(50, 26); g.lineTo(50, 80); g.stroke();
      g.lineWidth = 2; g.strokeStyle = '#9c8763';
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.moveTo(26, 40 + i * 10); g.lineTo(44, 40 + i * 10); g.stroke();
        g.beginPath(); g.moveTo(56, 40 + i * 10); g.lineTo(74, 40 + i * 10); g.stroke();
      }
    },
    leaf(g, c) {
      g.fillStyle = c || '#5fcf6a';
      g.beginPath(); g.moveTo(22, 82); g.quadraticCurveTo(24, 22, 80, 20);
      g.quadraticCurveTo(80, 74, 22, 82); g.fill();
      g.strokeStyle = '#2f7a45'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(22, 82); g.quadraticCurveTo(52, 56, 78, 24); g.stroke();
    },
    spear(g, c) {
      g.strokeStyle = '#a97f4a'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(22, 84); g.lineTo(70, 32); g.stroke();
      g.fillStyle = c || '#dfe4ee';
      g.beginPath(); g.moveTo(86, 14); g.lineTo(60, 22); g.lineTo(78, 40); g.closePath(); g.fill();
    },
    skull(g, c) {
      g.fillStyle = c || '#cfd5e0';
      g.beginPath(); g.arc(50, 44, 28, WS.PI, 0); g.lineTo(78, 62); g.lineTo(22, 62); g.closePath(); g.fill();
      g.fillRect(34, 62, 32, 20);
      g.fillStyle = '#14161d';
      g.beginPath(); g.ellipse(39, 44, 8, 10, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(61, 44, 8, 10, 0, 0, WS.TAU); g.fill();
      g.fillRect(46, 62, 8, 14);
    },
    frostaura(g, c) {
      g.strokeStyle = c || '#7fd4ff'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        g.save(); g.translate(50, 50); g.rotate((i / 6) * WS.TAU);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36); g.stroke();
        g.beginPath(); g.moveTo(0, -22); g.lineTo(-8, -30); g.stroke();
        g.beginPath(); g.moveTo(0, -22); g.lineTo(8, -30); g.stroke();
        g.restore();
      }
    },
    spiritwolf(g, c) {
      g.globalAlpha = 0.9; g.fillStyle = c || '#7fd4ff';
      g.beginPath(); g.ellipse(52, 58, 26, 15, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(24, 44, 14, 12, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.moveTo(16, 34); g.lineTo(14, 18); g.lineTo(26, 32); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(30, 32); g.lineTo(34, 16); g.lineTo(40, 32); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(74, 50); g.lineTo(92, 34); g.lineTo(78, 62); g.closePath(); g.fill();
      g.globalAlpha = 1; g.fillStyle = '#fff';
      g.beginPath(); g.arc(20, 42, 3.5, 0, WS.TAU); g.fill();
    },
    risen(g, c) {
      g.fillStyle = c || '#9fd66b';
      g.beginPath(); g.ellipse(50, 40, 18, 20, 0, 0, WS.TAU); g.fill();
      g.fillStyle = '#141a20';
      g.beginPath(); g.arc(43, 38, 4, 0, WS.TAU); g.fill();
      g.beginPath(); g.arc(57, 38, 4, 0, WS.TAU); g.fill();
      g.strokeStyle = c || '#9fd66b'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(30, 66); g.lineTo(20, 88); g.stroke();
      g.beginPath(); g.moveTo(70, 66); g.lineTo(80, 88); g.stroke();
      g.beginPath(); g.moveTo(50, 58); g.lineTo(50, 80); g.stroke();
    },
    command(g, c) {
      g.strokeStyle = c; g.lineWidth = 5;
      g.beginPath(); g.arc(50, 50, 30, 0, WS.TAU); g.stroke();
      g.fillStyle = c;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * WS.TAU - WS.PI / 2;
        g.beginPath(); g.arc(50 + WS.cos(a) * 30, 50 + WS.sin(a) * 30, 8, 0, WS.TAU); g.fill();
      }
    },
    thorn(g, c) {
      g.strokeStyle = c || '#6fbf5a'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(18, 84); g.quadraticCurveTo(50, 60, 82, 16); g.stroke();
      g.fillStyle = c || '#6fbf5a';
      for (let i = 0; i < 4; i++) {
        const t = 0.2 + i * 0.2;
        const x = 18 + (82 - 18) * t, y = 84 - (84 - 16) * t * t * 0.8 - 10 * t;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y - 6); g.lineTo(x + 2, y - 14); g.closePath(); g.fill();
      }
    },
    desecrate(g, c) {
      g.fillStyle = '#5a1f7a';
      g.beginPath(); g.ellipse(50, 62, 36, 20, 0, 0, WS.TAU); g.fill();
      g.fillStyle = c || '#8cf24a';
      g.beginPath(); g.ellipse(50, 62, 22, 12, 0, 0, WS.TAU); g.fill();
      g.strokeStyle = '#c77dff'; g.lineWidth = 4; g.lineCap = 'round';
      for (const dx of [-22, 0, 22]) { g.beginPath(); g.moveTo(50 + dx, 48); g.lineTo(50 + dx * 0.7, 16); g.stroke(); }
    },
    soulrend(g, c) {
      g.strokeStyle = c || '#8cf24a'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(50, 50, 30, -1.0, 1.6); g.stroke();
      g.beginPath(); g.arc(50, 50, 18, 1.6, -1.0, true); g.stroke();
      g.fillStyle = '#eaffd8'; g.beginPath(); g.arc(50, 50, 6, 0, WS.TAU); g.fill();
    },
    retaura(g, c) {
      g.strokeStyle = c || '#ffdf7a'; g.lineWidth = 4;
      g.beginPath(); g.arc(50, 50, 34, 0, WS.TAU); g.stroke();
      g.fillStyle = c || '#ffdf7a';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * WS.TAU;
        g.beginPath();
        g.moveTo(50 + WS.cos(a) * 34, 50 + WS.sin(a) * 34);
        g.lineTo(50 + WS.cos(a + 0.12) * 46, 50 + WS.sin(a + 0.12) * 46);
        g.lineTo(50 + WS.cos(a - 0.12) * 46, 50 + WS.sin(a - 0.12) * 46);
        g.closePath(); g.fill();
      }
      g.beginPath(); g.arc(50, 50, 10, 0, WS.TAU); g.fill();
    },
    feint(g, c) {
      g.globalAlpha = 0.35; g.fillStyle = c;
      g.beginPath(); g.ellipse(34, 52, 14, 26, 0, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
      g.beginPath(); g.ellipse(60, 50, 14, 26, 0, 0, WS.TAU); g.fill();
    },
    reroll(g, c) {
      g.strokeStyle = c; g.lineWidth = 6;
      g.beginPath(); g.arc(50, 52, 28, 0.5, WS.TAU - 0.2); g.stroke();
      g.fillStyle = c;
      g.beginPath(); g.moveTo(74, 20); g.lineTo(84, 44); g.lineTo(58, 40); g.closePath(); g.fill();
    },
    banish(g, c) {
      g.strokeStyle = c; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(50, 50, 28, 0, WS.TAU); g.stroke();
      g.beginPath(); g.moveTo(30, 30); g.lineTo(70, 70); g.stroke();
    },
    hourglass(g, c) {
      g.fillStyle = '#b98f4c'; g.fillRect(24, 14, 52, 8); g.fillRect(24, 78, 52, 8);
      g.fillStyle = c || '#7fd4ff';
      g.beginPath(); g.moveTo(30, 22); g.lineTo(70, 22); g.lineTo(52, 50); g.lineTo(70, 78);
      g.lineTo(30, 78); g.lineTo(48, 50); g.closePath(); g.fill();
    },
    ankh(g, c) {
      g.strokeStyle = c || '#ffd35c'; g.lineWidth = 8; g.lineCap = 'round';
      g.beginPath(); g.arc(50, 32, 16, 0, WS.TAU); g.stroke();
      g.beginPath(); g.moveTo(50, 48); g.lineTo(50, 88); g.stroke();
      g.beginPath(); g.moveTo(28, 60); g.lineTo(72, 60); g.stroke();
    },
    egg(g, c) {
      g.fillStyle = c || '#f0e6cf'; g.strokeStyle = '#b6a680'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(50, 56, 26, 34, 0, 0, WS.TAU); g.fill(); g.stroke();
      g.globalAlpha = 0.5; g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(41, 42, 7, 11, -0.4, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
    },
    crown(g, c) {
      g.fillStyle = c || '#ffd35c'; g.strokeStyle = '#a3781c'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(18, 74); g.lineTo(24, 30); g.lineTo(38, 52); g.lineTo(50, 22);
      g.lineTo(62, 52); g.lineTo(76, 30); g.lineTo(82, 74); g.closePath(); g.fill(); g.stroke();
    },
    drain(g, c) {
      g.fillStyle = c || '#c94f8a';
      g.beginPath(); g.moveTo(50, 16); g.quadraticCurveTo(76, 52, 66, 70);
      g.quadraticCurveTo(50, 92, 34, 70); g.quadraticCurveTo(24, 52, 50, 16); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.globalAlpha = 0.6;
      g.beginPath(); g.arc(42, 62, 8, 0.4, 2.6); g.stroke();
      g.globalAlpha = 1;
    },
    flame(g, c) { G.ember(g, c || '#ff8a3c'); },
    arcane(g, c) {
      g.strokeStyle = c || '#8f7bff'; g.lineWidth = 4;
      g.beginPath(); g.arc(50, 50, 30, 0, WS.TAU); g.stroke();
      for (let i = 0; i < 3; i++) {
        g.save(); g.translate(50, 50); g.rotate((i / 3) * WS.PI);
        g.beginPath(); g.ellipse(0, 0, 34, 12, 0, 0, WS.TAU); g.stroke();
        g.restore();
      }
      g.fillStyle = '#e6dcff'; g.beginPath(); g.arc(50, 50, 8, 0, WS.TAU); g.fill();
    },
    sun(g, c) {
      g.fillStyle = c || '#ffdf7a';
      g.beginPath(); g.arc(50, 50, 20, 0, WS.TAU); g.fill();
      g.strokeStyle = c || '#ffdf7a'; g.lineWidth = 5; g.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * WS.TAU;
        g.beginPath();
        g.moveTo(50 + WS.cos(a) * 28, 50 + WS.sin(a) * 28);
        g.lineTo(50 + WS.cos(a) * 42, 50 + WS.sin(a) * 42);
        g.stroke();
      }
    },
    crystal(g, c) {
      g.fillStyle = c || '#7fd4ff'; g.strokeStyle = '#dff2ff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(50, 10); g.lineTo(76, 46); g.lineTo(50, 90); g.lineTo(24, 46);
      g.closePath(); g.fill(); g.stroke();
      g.globalAlpha = 0.5; g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(50, 10); g.lineTo(50, 90); g.lineTo(24, 46); g.closePath(); g.fill();
      g.globalAlpha = 1;
    },
    deadtree(g, c) {
      g.strokeStyle = c || '#7a7080'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(50, 92); g.lineTo(50, 40); g.stroke();
      g.lineWidth = 4;
      for (const [x, y] of [[22, 26], [78, 20], [30, 12], [70, 44]]) {
        g.beginPath(); g.moveTo(50, 52); g.lineTo(x, y); g.stroke();
      }
    },
    grave(g, c) {
      g.fillStyle = c || '#8b93a7';
      g.beginPath(); g.moveTo(24, 88); g.lineTo(24, 40); g.arc(50, 40, 26, WS.PI, 0);
      g.lineTo(76, 88); g.closePath(); g.fill();
      g.strokeStyle = '#3a3f49'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(50, 34); g.lineTo(50, 70); g.stroke();
      g.beginPath(); g.moveTo(34, 48); g.lineTo(66, 48); g.stroke();
    },
    blade(g, c) { G.sword(g, c); },
    candle(g, c) {
      g.fillStyle = '#e8dfc8'; g.fillRect(38, 40, 24, 46);
      g.fillStyle = c || '#ffd166';
      g.beginPath(); g.moveTo(50, 12); g.quadraticCurveTo(64, 30, 50, 40);
      g.quadraticCurveTo(36, 30, 50, 12); g.fill();
    },
    mask(g, c) {
      g.fillStyle = c || '#c33b3b';
      g.beginPath(); g.moveTo(18, 34); g.quadraticCurveTo(50, 22, 82, 34);
      g.quadraticCurveTo(78, 68, 50, 84); g.quadraticCurveTo(22, 68, 18, 34); g.fill();
      g.fillStyle = '#12141a';
      g.beginPath(); g.ellipse(37, 48, 9, 6, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.ellipse(63, 48, 9, 6, 0, 0, WS.TAU); g.fill();
    },
    murloc(g, c) {
      g.fillStyle = c || '#5fd68a';
      g.beginPath(); g.ellipse(50, 54, 26, 30, 0, 0, WS.TAU); g.fill();
      g.beginPath(); g.moveTo(26, 40); g.lineTo(6, 20); g.lineTo(28, 54); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(74, 40); g.lineTo(94, 20); g.lineTo(72, 54); g.closePath(); g.fill();
      g.fillStyle = '#0e1218';
      g.beginPath(); g.ellipse(50, 68, 16, 8, 0, 0, WS.PI); g.fill();
      g.fillStyle = '#eaffd8';
      g.beginPath(); g.arc(39, 44, 7, 0, WS.TAU); g.fill();
      g.beginPath(); g.arc(61, 44, 7, 0, WS.TAU); g.fill();
    },
    anvil(g, c) {
      g.fillStyle = c || '#8b93a7';
      g.beginPath(); g.moveTo(14, 34); g.lineTo(86, 34); g.lineTo(70, 52); g.lineTo(60, 52);
      g.lineTo(62, 72); g.lineTo(76, 84); g.lineTo(24, 84); g.lineTo(38, 72); g.lineTo(40, 52);
      g.lineTo(30, 52); g.closePath(); g.fill();
    },
    sovereign(g, c) {
      g.fillStyle = '#150e28';
      g.beginPath(); g.arc(50, 50, 28, 0, WS.TAU); g.fill();
      g.strokeStyle = c || '#ffe6ae'; g.lineWidth = 4;
      g.beginPath(); g.arc(50, 50, 28, 0, WS.TAU); g.stroke();
      g.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * WS.TAU;
        g.beginPath();
        g.moveTo(50 + WS.cos(a) * 30, 50 + WS.sin(a) * 30);
        g.lineTo(50 + WS.cos(a) * 44, 50 + WS.sin(a) * 44);
        g.stroke();
      }
    },
    /* ---- pickups / world objects ---------------------------------------- */
    potion(g, c) {
      g.fillStyle = '#8a8f9c'; g.fillRect(42, 10, 16, 12);
      g.fillStyle = c || '#e2483d';
      g.beginPath();
      g.moveTo(40, 22); g.lineTo(60, 22); g.lineTo(76, 60);
      g.quadraticCurveTo(76, 90, 50, 90);
      g.quadraticCurveTo(24, 90, 24, 60); g.closePath(); g.fill();
      g.globalAlpha = 0.45; g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(38, 58, 5, 14, -0.3, 0, WS.TAU); g.fill();
      g.globalAlpha = 1;
    },
    chest(g, c) {
      g.fillStyle = '#6b4a2c'; g.fillRect(14, 44, 72, 40);
      g.fillStyle = '#8a6238';
      g.beginPath(); g.moveTo(14, 44); g.arc(50, 44, 36, WS.PI, 0); g.closePath(); g.fill();
      g.fillStyle = c || '#f5c56b';
      g.fillRect(14, 40, 72, 8);
      g.fillRect(44, 40, 12, 30);
      g.fillStyle = '#2b2f36';
      g.beginPath(); g.arc(50, 62, 5, 0, WS.TAU); g.fill();
    },
    bomb(g, c) {
      g.fillStyle = '#2b2f36';
      g.beginPath(); g.arc(48, 62, 28, 0, WS.TAU); g.fill();
      g.strokeStyle = '#8a6238'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(62, 40); g.quadraticCurveTo(78, 26, 70, 12); g.stroke();
      g.save(); g.shadowColor = c || '#ff8a3c'; g.shadowBlur = 16;
      g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(70, 10, 6, 0, WS.TAU); g.fill();
      g.restore();
    },
    stone(g, c) {
      g.fillStyle = c || '#59bfff';
      g.beginPath(); g.moveTo(50, 14); g.lineTo(78, 44); g.lineTo(66, 86); g.lineTo(34, 86);
      g.lineTo(22, 44); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = 3;
      g.beginPath(); g.arc(50, 52, 34, 0, WS.TAU); g.stroke();
    },
    cache(g, c) {
      g.fillStyle = '#7a5f3a'; g.fillRect(18, 26, 64, 58);
      g.strokeStyle = '#4a3a24'; g.lineWidth = 4;
      g.strokeRect(18, 26, 64, 58);
      g.beginPath(); g.moveTo(18, 26); g.lineTo(82, 84); g.stroke();
      g.beginPath(); g.moveTo(82, 26); g.lineTo(18, 84); g.stroke();
      g.fillStyle = c || '#f5c56b'; g.fillRect(18, 20, 64, 8);
    },
    coffin(g, c) {
      g.fillStyle = '#5a5f6b';
      g.beginPath();
      g.moveTo(50, 8); g.lineTo(76, 34); g.lineTo(66, 92); g.lineTo(34, 92);
      g.lineTo(24, 34); g.closePath(); g.fill();
      g.strokeStyle = c || '#d8dce6'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(50, 26); g.lineTo(50, 66); g.stroke();
      g.beginPath(); g.moveTo(34, 42); g.lineTo(66, 42); g.stroke();
    },
    runeblade(g, c) {
      g.fillStyle = '#cfd8e6'; g.strokeStyle = '#5f6878'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(50, 6); g.lineTo(60, 62); g.lineTo(50, 72); g.lineTo(40, 62);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#3a2020'; g.fillRect(44, 72, 12, 20);
      g.fillRect(32, 68, 36, 7);
      g.save(); g.shadowColor = c || '#e2483d'; g.shadowBlur = 14;
      g.strokeStyle = c || '#e2483d'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(50, 16); g.lineTo(50, 58); g.stroke();
      g.restore();
    },
    warglaive(g, c) {
      const col = c || '#8cf24a';
      g.save(); g.shadowColor = col; g.shadowBlur = 14;
      g.strokeStyle = col; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(50, 50, 32, -1.0, 1.6); g.stroke();
      g.beginPath(); g.arc(50, 50, 18, 1.6, -1.0, true); g.stroke();
      g.restore();
      g.fillStyle = '#2b2f36'; g.fillRect(44, 40, 12, 26);
    },
    merchant(g, c) {
      g.fillStyle = '#7a5f3a'; g.fillRect(16, 44, 68, 42);
      g.fillStyle = c || '#f5c56b';
      g.beginPath(); g.moveTo(10, 44); g.lineTo(50, 20); g.lineTo(90, 44); g.closePath(); g.fill();
      g.fillStyle = '#e8dfc8';
      g.beginPath(); g.ellipse(50, 66, 13, 16, 0, 0, WS.TAU); g.fill();
      g.strokeStyle = '#b6a680'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(50, 66, 13, 16, 0, 0, WS.TAU); g.stroke();
    },
    wheat(g, c) {
      g.strokeStyle = '#8f7a3c'; g.lineWidth = 3; g.lineCap = 'round';
      for (const dx of [-18, 0, 18]) {
        g.beginPath(); g.moveTo(50 + dx, 90);
        g.quadraticCurveTo(50 + dx + 7, 58, 50 + dx, 26); g.stroke();
        g.fillStyle = c || '#c9a94c';
        g.beginPath(); g.ellipse(50 + dx, 30, 7, 15, 0, 0, WS.TAU); g.fill();
      }
    },

    rune(g, c) {
      g.strokeStyle = c; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(32, 20); g.lineTo(32, 80); g.lineTo(68, 50); g.lineTo(68, 20); g.stroke();
    },
  };

  /** Draws the obsidian plate + arc rim shared by every icon. */
  function plate(g, s, accent) {
    const r = s * 0.16;
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, '#191f2c');
    grd.addColorStop(1, '#0b0e15');
    g.fillStyle = grd;
    g.beginPath(); g.roundRect(0.5, 0.5, s - 1, s - 1, r); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
    g.stroke();
    // The arc: a lit quarter along the top-left corner.
    g.save();
    g.strokeStyle = accent; g.globalAlpha = 0.85; g.lineWidth = s * 0.035; g.lineCap = 'round';
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.46, WS.PI * 0.78, WS.PI * 1.32); g.stroke();
    g.restore();
  }

  WS.Icons = {
    /** Cached icon canvas. `art` is a glyph name, `color` an [r,g,b] accent. */
    get(art, color, size) {
      size = WS.round(size || 64);
      const accent = WS.hex(color || WS.CONST.COLORS.arc);
      const key = `i:${art}:${accent}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      c = document.createElement('canvas');
      c.width = size; c.height = size;
      const g = c.getContext('2d');
      plate(g, size, accent);
      g.save();
      const inset = size * 0.16;
      g.translate(inset, inset);
      g.scale((size - inset * 2) / 100, (size - inset * 2) / 100);
      g.save();
      g.shadowColor = accent; g.shadowBlur = 10;
      (G[art] || G.rune)(g, accent);
      g.restore();
      g.restore();
      cache.set(key, c);
      return c;
    },

    /** The bare glyph with no obsidian plate, for world-space objects: a coin
     *  lying in the grass should not look like a UI tile. */
    glyph(art, color, size) {
      size = WS.round(size || 32);
      const accent = WS.hex(color || WS.CONST.COLORS.arc);
      const key = `w:${art}:${accent}:${size}`;
      let c = cache.get(key);
      if (c) return c;
      const res = size * 2;
      c = document.createElement('canvas');
      c.width = res; c.height = res;
      const g = c.getContext('2d');
      g.save();
      g.scale(res / 100, res / 100);
      g.shadowColor = accent;
      g.shadowBlur = 12;
      g.lineWidth = 1;
      (G[art] || G.rune)(g, accent);
      g.restore();
      cache.set(key, c);
      return c;
    },

    /** Data URL for use in CSS/img elements (the DOM-side UI). */
    url(art, color, size) { return this.get(art, color, size).toDataURL(); },

    has(art) { return !!G[art]; },
  };

})(window.WS);
