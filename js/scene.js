/*
 * The backdrop: the inside of a library tower, drawn as pixel art on a
 * low-resolution canvas and scaled up. The camera follows a climber on a
 * ladder; app.js tells it how high to climb. Everything is generated from
 * seeded hashes, so a given floor always looks the same.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const TOP = 70; // floors; a perfect score reaches the lantern room
  const FLOOR_H = 45; // art pixels per floor: 40 of wall over a 5px slab
  const SLAB_Y = 40;
  const SHELF_H = 13; // 11px of books over a 2px board, three shelves a floor
  const BAY = 34; // width of one bookcase
  const PILLAR = 5;
  const PERIOD = BAY + PILLAR;
  const CLIMB_RATE = 2.8; // how quickly the camera closes on its target

  const SKY_HIGH = '#0d1230';
  const SKY_LOW = '#1a2152';
  const STAR = '#f4efcf';

  // The tower changes character as it rises; the breaks match the score bands.
  const ZONES = [
    { from: 0, wall: '#2a1a12', wood: '#8f5f33', woodL: '#b9824a', woodD: '#5a3a1f', slab: '#9c6a3a', slabL: '#c9955a', slabD: '#54351c', gap: 0.04, window: 9,
      books: ['#b5432f', '#d98a3d', '#3f8a5a', '#3d74b8', '#8a56b0', '#e2c46a', '#93323f', '#2f7a7d', '#d8c39a', '#5a6ea8'] },
    { from: 15, wall: '#23150f', wood: '#734927', woodL: '#96663a', woodD: '#452a16', slab: '#7d5229', slabL: '#a8743f', slabD: '#402714', gap: 0.06, window: 8,
      books: ['#96392b', '#b3742f', '#34704b', '#335f96', '#6f4690', '#bfa24f', '#742833', '#27625f', '#a8997a', '#465887'] },
    { from: 25, wall: '#22110f', wood: '#7a3a2c', woodL: '#a0523d', woodD: '#4a1f18', slab: '#84402f', slabL: '#b5654a', slabD: '#451c15', gap: 0.08, window: 7,
      books: ['#7d2f28', '#9a6a2c', '#2f5f45', '#2d4f80', '#5b3a78', '#a88f45', '#5f2230', '#235450', '#8e8068', '#b0a078'] },
    { from: 35, wall: '#18141d', wood: '#57506a', woodL: '#7a7290', woodD: '#352f45', slab: '#5e5672', slabL: '#8a82a0', slabD: '#322c40', gap: 0.14, window: 5,
      books: ['#6a2a2e', '#7a5628', '#2c4d3c', '#2b4068', '#4c3468', '#9a843c', '#4a2030', '#3e3a48', '#7a6e58'] },
    { from: 45, wall: '#0f1320', wood: '#3f4d6e', woodL: '#5f7098', woodD: '#252f49', slab: '#465578', slabL: '#7084ad', slabD: '#232c45', gap: 0.24, window: 3,
      books: ['#3d4f73', '#4f3f63', '#2c4c4f', '#5c5d70', '#6c5c3c', '#3f2c3f', '#7a7f95'] },
  ];

  // One dim floor of archives below the ground floor, so the climb starts
  // from somewhere rather than from a blank wall.
  const CELLAR = { wall: '#140d0b', wood: '#4a3220', woodL: '#644629', woodD: '#2b1b11', slab: '#3f2b1c', slabL: '#5a3f27', slabD: '#22150d', gap: 0.3, window: Infinity,
    books: ['#5a2f28', '#6b4f2a', '#2f4a3a', '#2e4263', '#4a3559', '#7d6c3f', '#57504a'] };

  const zoneIndex = (f) => {
    let i = 0;
    while (i + 1 < ZONES.length && f >= ZONES[i + 1].from) i++;
    return i;
  };

  // The climber, seen from behind. The second frame is this one mirrored.
  const CLIMBER = [
    '...hhhh...',
    '..hhhhhh..',
    '..hhhhhh..',
    's..hhhh...',
    'cc..ss...s',
    '.cccccccc.',
    '..cbbbbc..',
    '..cbyybc..',
    '..cbbbbc..',
    '..dddddd..',
    '..pp..pp..',
    '..pp..kk..',
    '..kk......',
  ];
  const CLIMBER_COLORS = { h: '#3a2a22', s: '#e8b98a', c: '#3f9c96', d: '#2a6b68', b: '#a5482f', y: '#ffcc4d', p: '#40385c', k: '#1c1722' };

  // 3x5 digits for the floor plaques.
  const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001001010010', '111101111101111', '111101111001111'];

  let px = 4; // screen pixels per art pixel
  let W = 0;
  let H = 0;
  let feetY = 0; // where the climber stands on screen
  let ladderX = 0;
  let bay0 = 0; // left edge of the ladder's bay
  let cam = 0; // current height, in floors
  let target = 0;
  let marks = [];
  let motes = [];
  let lastFrame = 0;
  const strips = new Map();

  function hash(a, b, c) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sprite(g, rows, colors, x, y, flip) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[flip ? row.length - 1 - i : i];
        if (ch === '.') continue;
        g.fillStyle = colors[ch];
        g.fillRect(x + i, y + j, 1, 1);
      }
    }
  }

  // ------------------------------------------------------- one floor's parts

  // The books on one shelf of one bookcase: always the same for the same
  // place in the tower. x is measured from the bookcase's left edge.
  function shelfBooks(f, k, shelf, z) {
    const r = rng(hash(f, k, shelf));
    const end = BAY - 1;
    const books = [];
    let cx = 1;
    while (cx < end - 1) {
      if (r() < z.gap) {
        cx += 2 + ((r() * 4) | 0);
        continue;
      }
      const w = Math.min(2 + ((r() * 3) | 0), end - cx);
      const h = 7 + ((r() * 5) | 0);
      const color = z.books[(r() * z.books.length) | 0];
      books.push({ x: cx, w, h, color, band: w >= 3 && r() < 0.45 });
      cx += w;
    }
    return books;
  }

  // One book, its foot at y. `lift` slides it up out of its row.
  function paintBook(g, x, foot, b, lift) {
    const y = foot - b.h - lift;
    g.fillStyle = b.color;
    g.fillRect(x, y, b.w, b.h + lift);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(x + b.w - 1, y, 1, b.h + lift);
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillRect(x, y, b.w - 1, 1);
    if (b.band) {
      g.fillStyle = 'rgba(255,232,170,.6)'; // a title band
      g.fillRect(x, y + 2, b.w - 1, 1);
    }
  }

  function drawBooks(g, x, f, k, z, shelf) {
    const top = 1 + shelf * SHELF_H;
    g.fillStyle = 'rgba(0,0,0,.3)'; // shadow cast by the board above
    g.fillRect(x, top, BAY, 1);
    for (const b of shelfBooks(f, k, shelf, z)) paintBook(g, x + b.x, top + 11, b, 0);
    g.fillStyle = z.wood;
    g.fillRect(x, top + 11, BAY, 2);
    g.fillStyle = z.woodL;
    g.fillRect(x, top + 11, BAY, 1);
  }

  function drawCobweb(g, x) {
    g.fillStyle = 'rgba(255,255,255,.22)';
    for (const [dx, dy] of [[1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5]]) g.fillRect(x + dx, dy, 1, 1);
  }

  // An arched window onto the night, taking the place of the top two shelves.
  function drawWindow(g, x, f, k, z, stars) {
    const r = rng(hash(f, k, 41));
    const wx = x + 8;
    const wy = 3;
    const ww = 18;
    const wh = 21;
    g.fillStyle = z.woodD;
    g.fillRect(x, 1, BAY, 2 * SHELF_H);
    g.fillStyle = z.woodL;
    g.fillRect(wx, wy + 3, ww, wh - 3);
    g.fillRect(wx + 1, wy + 1, ww - 2, 2);
    g.fillRect(wx + 3, wy, ww - 6, 1);
    g.fillStyle = SKY_LOW;
    g.fillRect(wx + 2, wy + 4, ww - 4, wh - 6);
    g.fillStyle = SKY_HIGH;
    g.fillRect(wx + 2, wy + 4, ww - 4, 8);
    g.fillRect(wx + 3, wy + 2, ww - 6, 2);
    g.fillStyle = STAR;
    for (let i = 0; i < 4; i++) {
      const star = { x: wx + 3 + ((r() * (ww - 6)) | 0), y: wy + 3 + ((r() * 9) | 0), phase: i * 1.7 + (hash(f, k, 43) % 628) / 100 };
      g.fillRect(star.x, star.y, 1, 1);
      stars.push(star);
    }
    if (r() < 0.35) {
      g.fillRect(wx + 11, wy + 5, 3, 3);
      g.fillStyle = SKY_HIGH;
      g.fillRect(wx + 12, wy + 5, 2, 2);
    }
    g.fillStyle = z.woodL;
    g.fillRect(wx + ww / 2 - 1, wy + 1, 2, wh - 3);
    g.fillRect(wx + 2, wy + 11, ww - 4, 1);
    g.fillStyle = z.wood;
    g.fillRect(wx - 2, wy + wh - 1, ww + 4, 2);
    g.fillStyle = z.woodL;
    g.fillRect(wx - 2, wy + wh - 1, ww + 4, 1);
    g.fillStyle = z.wood;
    g.fillRect(x, 2 * SHELF_H - 1, BAY, 2);
    g.fillStyle = z.woodL;
    g.fillRect(x, 2 * SHELF_H - 1, BAY, 1);
    drawBooks(g, x, f, k, z, 2);
  }

  function drawPillar(g, x, f, k, z, lanterns) {
    g.fillStyle = z.wood;
    g.fillRect(x, 0, PILLAR, SLAB_Y);
    g.fillStyle = z.woodL;
    g.fillRect(x, 0, 1, SLAB_Y);
    g.fillStyle = z.woodD;
    g.fillRect(x + PILLAR - 1, 0, 1, SLAB_Y);
    if ((((k + f) % 2) + 2) % 2 !== 0) return;
    g.fillStyle = z.woodD; // a lantern on every other pillar
    g.fillRect(x + 2, 9, 1, 3);
    g.fillStyle = '#20150f';
    g.fillRect(x + 1, 12, 3, 6);
    g.fillStyle = '#ffb84a';
    g.fillRect(x + 1, 13, 3, 4);
    g.fillStyle = '#fff0b8';
    g.fillRect(x + 2, 14, 1, 2);
    lanterns.push({ x: x + 2, y: 15, phase: (hash(f, k, 3) % 628) / 100, big: false, key: `${f},${k}` });
  }

  function drawLadder(g, fromY, toY) {
    for (const x of [ladderX - 5, ladderX + 4]) {
      g.fillStyle = '#dba76a';
      g.fillRect(x, fromY, 1, toY - fromY);
      g.fillStyle = '#8a5a30';
      g.fillRect(x + 1, fromY, 1, toY - fromY);
    }
    g.fillStyle = '#c08a50';
    for (let y = 2; y < FLOOR_H; y += 5) if (y >= fromY && y < toY) g.fillRect(ladderX - 3, y, 7, 1);
  }

  function drawPlaque(g, n) {
    const text = String(n);
    const w = text.length * 4 + 1;
    const x = bay0 + 1;
    const y = SLAB_Y - 9;
    g.fillStyle = '#6b4a16';
    g.fillRect(x, y, w + 2, 9);
    g.fillStyle = '#d8b04c';
    g.fillRect(x + 1, y + 1, w, 7);
    g.fillStyle = '#2b1c14';
    for (let d = 0; d < text.length; d++) {
      const bits = DIGITS[Number(text[d])];
      for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + 2 + d * 4 + (i % 3), y + 2 + ((i / 3) | 0), 1, 1);
    }
  }

  const zoneOf = (f) => (f < 0 ? CELLAR : ZONES[zoneIndex(f)]);
  const isWindow = (f, k, z) => hash(f, k, 7) % z.window === 0;

  function drawLibraryFloor(g, f, lanterns, stars) {
    const cellar = f < 0;
    const zi = cellar ? -1 : zoneIndex(f);
    const z = zoneOf(f);
    g.fillStyle = z.wall;
    g.fillRect(0, 0, W, FLOOR_H);
    const kMin = Math.floor(-bay0 / PERIOD) - 1;
    const kMax = Math.ceil((W - bay0) / PERIOD);
    for (let k = kMin; k <= kMax; k++) {
      const x = bay0 + k * PERIOD;
      if (k !== 0) {
        if (isWindow(f, k, z)) {
          drawWindow(g, x, f, k, z, stars);
        } else {
          for (let s = 0; s < 3; s++) drawBooks(g, x, f, k, z, s);
          if ((cellar || zi >= 3) && hash(f, k, 9) % 3 === 0) drawCobweb(g, x);
        }
      }
      drawPillar(g, x + BAY, f, k, z, lanterns);
    }
    const landing = f > 0 && f === z.from; // a brass edge where a new part of the tower begins
    g.fillStyle = landing ? '#e8c35a' : z.slabL;
    g.fillRect(0, SLAB_Y, W, 1);
    g.fillStyle = z.slab;
    g.fillRect(0, SLAB_Y + 1, W, 3);
    g.fillStyle = z.slabD;
    g.fillRect(0, SLAB_Y + 4, W, 1);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, 0, W, 1);

    // The ladder runs up an open shaft, through a hatch in every floor. It
    // starts from the cellar floor, which has no hatch.
    const foot = cellar ? SLAB_Y : FLOOR_H;
    g.fillStyle = '#110a09';
    g.fillRect(bay0, 0, BAY, foot);
    g.fillStyle = 'rgba(255,255,255,.035)';
    for (const dx of [8, 17, 26]) g.fillRect(bay0 + dx, 0, 1, foot);
    drawLadder(g, 0, foot);
    if (f > 0 && f % 5 === 0) drawPlaque(g, f);
  }

  function drawStars(g, f) {
    const depth = f - TOP;
    g.fillStyle = depth >= 2 ? '#080b20' : depth === 1 ? SKY_HIGH : '#141a44';
    g.fillRect(0, 0, W, FLOOR_H);
    const r = rng(hash(f, 5, 5));
    for (let i = Math.round(W / 8); i > 0; i--) {
      g.fillStyle = r() < 0.2 ? '#ffffff' : '#aab4e0';
      g.fillRect((r() * W) | 0, (r() * FLOOR_H) | 0, 1, 1);
    }
    if (depth === 1) {
      const mx = Math.round(W * 0.72);
      const widths = [5, 7, 9, 9, 9, 9, 9, 7, 5];
      g.fillStyle = STAR;
      widths.forEach((w, j) => g.fillRect(mx - (w >> 1), 10 + j, w, 1));
      g.fillStyle = SKY_HIGH;
      widths.forEach((w, j) => g.fillRect(mx + 3 - (w >> 1), 8 + j, w, 1));
    }
  }

  // The top: an open parapet under the sky, with the beacon the tower is named for.
  function drawRoof(g, lanterns) {
    const z = ZONES[ZONES.length - 1];
    drawStars(g, TOP);
    for (let x = (((bay0 % 12) + 12) % 12) - 12; x < W; x += 12) {
      g.fillStyle = z.slab;
      g.fillRect(x, SLAB_Y - 6, 7, 6);
      g.fillStyle = z.slabL;
      g.fillRect(x, SLAB_Y - 6, 7, 1);
    }
    g.fillStyle = z.slabL;
    g.fillRect(0, SLAB_Y, W, 1);
    g.fillStyle = z.slab;
    g.fillRect(0, SLAB_Y + 1, W, 3);
    g.fillStyle = z.slabD;
    g.fillRect(0, SLAB_Y + 4, W, 1);
    g.fillStyle = '#110a09';
    g.fillRect(ladderX - 8, SLAB_Y - 6, 17, FLOOR_H - SLAB_Y + 6);
    drawLadder(g, SLAB_Y - 5, FLOOR_H);
    const bx = ladderX + 16;
    g.fillStyle = z.slabD;
    g.fillRect(bx - 4, SLAB_Y - 2, 9, 2);
    g.fillRect(bx - 4, SLAB_Y - 14, 9, 1);
    g.fillStyle = '#20150f';
    g.fillRect(bx - 3, SLAB_Y - 13, 7, 11);
    g.fillStyle = '#ffb84a';
    g.fillRect(bx - 2, SLAB_Y - 12, 5, 9);
    g.fillStyle = '#fff0b8';
    g.fillRect(bx - 1, SLAB_Y - 10, 3, 5);
    lanterns.push({ x: bx, y: SLAB_Y - 8, phase: 0, big: true, key: 'beacon' });
  }

  function drawFoundation(g) {
    g.fillStyle = '#110c13';
    g.fillRect(0, 0, W, FLOOR_H);
    g.fillStyle = '#211827';
    for (let y = 0; y < FLOOR_H; y += 9) {
      g.fillRect(0, y, W, 1);
      for (let x = (y / 9) % 2 ? 8 : 0; x < W; x += 16) g.fillRect(x, y, 1, 9);
    }
  }

  // Floors are drawn once into their own small canvas and reused every frame.
  function strip(f) {
    let s = strips.get(f);
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = FLOOR_H;
    const g = c.getContext('2d');
    const lanterns = [];
    const stars = [];
    if (f < -1) drawFoundation(g);
    else if (f > TOP) drawStars(g, f);
    else if (f === TOP) drawRoof(g, lanterns);
    else drawLibraryFloor(g, f, lanterns, stars);
    s = { canvas: c, lanterns, stars };
    if (strips.size > 60) strips.clear();
    strips.set(f, s);
    return s;
  }

  // --------------------------------------------------------------- per frame

  function glow(x, y, alpha, big) {
    const s = big ? 2 : 1;
    ctx.fillStyle = `rgba(255,186,86,${alpha})`;
    ctx.fillRect(x - 8 * s, y - 3 * s, 17 * s, 7 * s);
    ctx.fillRect(x - 5 * s, y - 5 * s, 11 * s, 11 * s);
    ctx.fillRect(x - 3 * s, y - 8 * s, 7 * s, 17 * s);
  }

  // ------------------------------------------------------- pointer and play

  const pointer = { x: -99, y: -99, on: false }; // in art pixels; on = over the scene itself
  const pulled = new Set(); // books taken off their shelf this session
  const snuffed = new Set(); // lanterns put out
  let falling = []; // books on their way down
  let sparks = []; // short-lived pixels: dust, smoke, the burst when an answer lands
  let lift = { key: null, since: 0 }; // the book under the pointer
  let hopUntil = 0;
  let clock = 0;

  const topOf = (f, camPx) => feetY - (f * FLOOR_H - camPx) - SLAB_Y;

  // The book at a point of the screen, if there is one.
  function bookAt(ax, ay, camPx) {
    const f = Math.ceil((feetY - SLAB_Y + camPx - ay) / FLOOR_H);
    if (f < -1 || f >= TOP) return null;
    const ly = ay - topOf(f, camPx);
    const shelf = Math.floor((ly - 1) / SHELF_H);
    const inShelf = ly - 1 - shelf * SHELF_H;
    if (ly < 1 || shelf > 2 || inShelf > 10) return null;
    const k = Math.floor((ax - bay0) / PERIOD);
    const inBay = ax - (bay0 + k * PERIOD);
    if (k === 0 || inBay >= BAY) return null;
    const z = zoneOf(f);
    if (shelf < 2 && isWindow(f, k, z)) return null;
    const books = shelfBooks(f, k, shelf, z);
    for (let i = 0; i < books.length; i++) {
      const b = books[i];
      if (inBay < b.x || inBay >= b.x + b.w || inShelf < 11 - b.h) continue;
      const key = `${f},${k},${shelf},${i}`;
      return pulled.has(key) ? null : { key, f, b, z, x: bay0 + k * PERIOD + b.x, offset: 1 + shelf * SHELF_H + 11 };
    }
    return null;
  }

  function spark(x, y, vx, vy, life, color, gravity) {
    sparks.push({ x, y, vx, vy, life, age: 0, color, gravity });
  }

  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  function click(ax, ay) {
    const camPx = Math.round(cam * FLOOR_H);
    if (Math.abs(ax - ladderX) <= 6 && ay >= feetY - 14 && ay <= feetY) {
      hopUntil = clock + 0.28; // the climber gives a little start
      return;
    }
    for (const l of visibleLanterns(camPx)) {
      if (Math.abs(ax - l.x) > 3 || Math.abs(ay - l.y) > 4) continue;
      if (snuffed.delete(l.key)) {
        for (let i = 0; i < 5; i++) spark(l.x, l.y, rand(-14, 14), rand(-22, -4), rand(0.25, 0.5), '#ffe9a8', 30);
      } else {
        snuffed.add(l.key);
        for (let i = 0; i < 4; i++) spark(l.x + rand(-1, 1), l.y - 2, rand(-3, 3), rand(-14, -6), rand(0.6, 1.1), 'rgba(190,180,170,.55)', -4);
      }
      return;
    }
    const hit = bookAt(ax, ay, camPx);
    if (!hit) return;
    pulled.add(hit.key);
    const y = topOf(hit.f, camPx) + hit.offset;
    falling.push({ x: hit.x, y: y - hit.b.h, w: hit.b.w, h: hit.b.h, color: hit.b.color, vx: rand(-10, 10), vy: -38, age: 0 });
    for (let i = 0; i < 5; i++) spark(hit.x + rand(0, hit.b.w), y - rand(0, hit.b.h), rand(-10, 10), rand(-16, -2), rand(0.3, 0.7), 'rgba(255,240,214,.6)', 26);
  }

  function visibleLanterns(camPx) {
    const out = [];
    const fMin = Math.floor((feetY - SLAB_Y + camPx - H) / FLOOR_H);
    const fMax = Math.ceil((feetY + FLOOR_H - SLAB_Y + camPx) / FLOOR_H);
    for (let f = fMin; f <= fMax; f++) for (const l of strip(f).lanterns) out.push({ x: l.x, y: topOf(f, camPx) + l.y, phase: l.phase, big: l.big, key: l.key });
    return out;
  }

  function draw(time, movedPx, dt) {
    clock = time;
    const camPx = Math.round(cam * FLOOR_H);
    ctx.fillStyle = '#0d090e';
    ctx.fillRect(0, 0, W, H);

    // Floor f's strip has its slab surface at world height f * FLOOR_H.
    const fMin = Math.floor((feetY - SLAB_Y + camPx - H) / FLOOR_H);
    const fMax = Math.ceil((feetY + FLOOR_H - SLAB_Y + camPx) / FLOOR_H);
    for (let f = fMin; f <= fMax; f++) {
      const s = strip(f);
      const top = topOf(f, camPx);
      ctx.drawImage(s.canvas, 0, top);
      if (!motionOK) continue;
      for (const star of s.stars) {
        const v = Math.sin(time * 1.6 + star.phase);
        if (v > 0.8) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(star.x, top + star.y, 1, 1);
        } else if (v < -0.85) {
          ctx.fillStyle = SKY_HIGH; // winks out for a moment
          ctx.fillRect(star.x, top + star.y, 1, 1);
        }
      }
    }

    // Gaps where books have been pulled out.
    for (const key of pulled) {
      const [f, k, shelf, i] = key.split(',').map(Number);
      const top = topOf(f, camPx);
      if (top > H || top < -FLOOR_H) continue;
      const z = zoneOf(f);
      const b = shelfBooks(f, k, shelf, z)[i];
      ctx.fillStyle = z.wall;
      ctx.fillRect(bay0 + k * PERIOD + b.x, top + 1 + shelf * SHELF_H + 11 - b.h, b.w, b.h);
    }

    // The book under the pointer slides up out of its row.
    const hover = pointer.on ? bookAt(pointer.x, pointer.y, camPx) : null;
    if ((hover ? hover.key : null) !== lift.key) lift = { key: hover ? hover.key : null, since: time };
    if (hover) {
      const up = motionOK ? Math.min(3, 1 + Math.floor((time - lift.since) / 0.045)) : 3;
      const foot = topOf(hover.f, camPx) + hover.offset;
      paintBook(ctx, hover.x, foot, hover.b, up);
      ctx.fillStyle = 'rgba(255,236,190,.22)';
      ctx.fillRect(hover.x, foot - hover.b.h - up, hover.b.w, hover.b.h + up);
    }

    // Lanterns: lit ones glow and flare as the pointer nears; snuffed ones go dark.
    const lanterns = visibleLanterns(camPx);
    let overLantern = false;
    for (const l of lanterns) {
      const near = pointer.on ? Math.max(0, 1 - Math.hypot(pointer.x - l.x, pointer.y - l.y) / 12) : 0;
      if (near > 0.7) overLantern = true;
      if (snuffed.has(l.key)) {
        const s = l.big ? 2 : 1;
        ctx.fillStyle = '#2b1d14';
        ctx.fillRect(l.x - s, l.y - 2 * s, 2 * s + 1, 4 * s + 1);
        continue;
      }
      const flicker = motionOK ? 0.82 + 0.18 * Math.sin(time * 5 + l.phase) : 1;
      glow(l.x, l.y, 0.075 * flicker * (1 + near * 1.4), l.big);
    }

    // The pointer carries a little light of its own.
    if (pointer.on) {
      glow(pointer.x, pointer.y, 0.035, false);
      glow(pointer.x, pointer.y, 0.022, true);
    }

    // A pennant on the ladder for every round, at the height it ended.
    for (const m of marks) {
      const y = feetY - (Math.round(m.floor * FLOOR_H) - camPx);
      if (y < -10 || y > H + 10) continue;
      const pole = m.miss ? ladderX - 8 : ladderX + 7;
      ctx.fillStyle = '#f1e3c2';
      ctx.fillRect(pole, y - 9, 1, 9);
      ctx.fillStyle = m.color;
      ctx.fillRect(m.miss ? pole - 5 : pole + 1, y - 9, 5, 2);
      ctx.fillRect(m.miss ? pole - 3 : pole + 1, y - 7, 3, 1);
    }

    // The climber: steps while climbing, shifts grip now and then when still,
    // and starts when clicked.
    const moving = Math.abs(target - cam) > 0.01;
    const hopping = time < hopUntil;
    const fidget = motionOK && !moving && time % 6.2 < 0.3;
    const overClimber = pointer.on && Math.abs(pointer.x - ladderX) <= 6 && pointer.y >= feetY - 14 && pointer.y <= feetY;
    glow(ladderX, feetY - 7, overClimber ? 0.09 : 0.05, false);
    sprite(ctx, CLIMBER, CLIMBER_COLORS, ladderX - 5, feetY - CLIMBER.length - (hopping ? 2 : 0), (moving && Math.floor(camPx / 4) % 2 === 1) || hopping || fidget);
    canvas.style.cursor = hover || overLantern || overClimber ? 'pointer' : '';

    // Pulled books tumble away.
    falling = falling.filter((b) => b.y < H + 12);
    for (const b of falling) {
      b.age += dt;
      b.vy += 260 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt + movedPx;
      const flat = Math.floor(b.age / 0.09) % 2 === 1; // end over end, a quarter turn at a time
      const w = flat ? b.h : b.w;
      const h = flat ? b.w : b.h;
      ctx.fillStyle = b.color;
      ctx.fillRect(Math.round(b.x), Math.round(b.y), w, h);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(Math.round(b.x) + w - 1, Math.round(b.y), 1, h);
    }

    sparks = sparks.filter((p) => p.age < p.life);
    for (const p of sparks) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt + movedPx;
      if (p.age > p.life * 0.7 && Math.floor(p.age / 0.05) % 2) continue; // flickers out
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }

    if (motionOK) {
      ctx.fillStyle = 'rgba(255,224,160,.38)';
      for (const m of motes) {
        m.y += movedPx * 0.6 - m.v * dt; // dust drifts up, and falls away as we climb
        m.x += Math.sin(time * 0.7 + m.p) * 0.03;
        if (m.y < 0) m.y += H;
        else if (m.y >= H) m.y -= H;
        ctx.fillRect(m.x | 0, m.y | 0, 1, 1);
      }
    }

    // Darken the top and bottom in steps, so the light sits on the climber.
    const band = Math.ceil(H * 0.04);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(8,5,10,${0.085 * (6 - i)})`;
      ctx.fillRect(0, i * band, W, band);
      ctx.fillRect(0, H - (i + 1) * band, W, band);
    }
  }

  function frame(now) {
    const dt = Math.min(1, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    const before = cam;
    if (cam !== target) {
      // Exponential ease, written so the climb takes the same time at any frame rate.
      cam = motionOK ? cam + (target - cam) * (1 - Math.exp(-dt * CLIMB_RATE)) : target;
      if (Math.abs(target - cam) < 0.004) cam = target;
    }
    draw(now / 1000, (cam - before) * FLOOR_H, Math.min(dt, 0.1));
    requestAnimationFrame(frame);
  }

  function layout() {
    px = window.innerWidth < 520 ? 3 : 4;
    W = Math.ceil(window.innerWidth / px);
    H = Math.ceil(window.innerHeight / px);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W * px + 'px';
    canvas.style.height = H * px + 'px';
    feetY = Math.round(H * 0.66);
    // The ladder sits in the gutter to the left of the page.
    const shell = document.querySelector('.shell');
    const left = shell ? shell.getBoundingClientRect().left : 56;
    ladderX = Math.round((left >= 120 ? left - 44 : left / 2) / px);
    bay0 = ladderX - BAY / 2;
    strips.clear();
    pulled.clear(); // bookcases move when the window changes size
    const r = rng(1234);
    motes = Array.from({ length: Math.round((W * H) / 1600) }, () => ({ x: r() * W, y: r() * H, v: 1.5 + r() * 4, p: r() * 6.28 }));
  }

  const css = getComputedStyle(document.documentElement);
  const flagColor = (tier) => css.getPropertyValue('--tb-' + (tier || 'miss')).trim() || '#f1e3c2';

  window.TOWER = {
    // points: a score from 0 to 700; ten points is one floor.
    climbTo(points) {
      target = Math.max(0, Math.min(TOP, points / 10));
    },
    // rounds: [{ points: running total after the round, tier: id or null }]
    setMarks(rounds) {
      marks = rounds.map((r) => ({ floor: r.points / 10, color: flagColor(r.tier), miss: !r.tier }));
    },
    // An answer landed: pixels in its tier's colour fly off the climber,
    // more of them the rarer it was.
    burst(tier, points) {
      if (!motionOK) return;
      const color = flagColor(tier);
      const count = Math.round(5 + points / 5);
      const reach = 0.6 + points / 100;
      for (let i = 0; i < count; i++) {
        spark(ladderX + rand(-3, 3), feetY - rand(4, 12), rand(-34, 34) * reach, rand(-70, -18) * reach, rand(0.45, 1), i % 4 ? color : '#fff4d0', 110);
      }
      hopUntil = clock + 0.2;
    },
  };

  // Track the pointer in art pixels, and only count it while it is over the
  // scene itself rather than the page on top of it.
  window.addEventListener('pointermove', (e) => {
    pointer.x = Math.floor(e.clientX / px);
    pointer.y = Math.floor(e.clientY / px);
    pointer.on = e.target === canvas;
  });
  document.documentElement.addEventListener('pointerleave', () => (pointer.on = false));
  canvas.addEventListener('pointerdown', (e) => click(Math.floor(e.clientX / px), Math.floor(e.clientY / px)));

  window.addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frame);
})();
