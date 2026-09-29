'use strict';
// ============================================================
//  Mörkrets Hjärta — en Dungeon Keeper-inspirerad prototyp
// ============================================================

const W = 48, H = 30, T = 20;
const LW = W * T, LH = H * T;   // logisk upplösning; canvasen ritas i 2× för skarpare grafik
const SCALE = 2;
const cv = document.getElementById('c');
cv.width = LW * SCALE; cv.height = LH * SCALE;
const ctx = cv.getContext('2d');

// ---------- Grafik (genererad i DaVinci, utklippt med tools/cut_sprites.py) ----------
const IMG = {};
['tile_rock', 'tile_earth', 'tile_gold', 'tile_gem', 'tile_floor', 'tile_claimed', 'tile_wall',
 'room_lair', 'room_hatchery', 'room_treasury', 'room_training', 'room_library',
 'heart', 'portal', 'gate',
 'imp', 'goblin', 'mistress', 'warlock', 'warrior', 'archer', 'priest', 'dwarf', 'lord'].forEach(n => {
  const im = new Image();
  let tries = 0;
  im.onerror = () => { if (++tries < 5) setTimeout(() => { im.src = `assets/${n}.png?r=${tries}`; }, 300 * tries); };
  im.src = `assets/${n}.png`;
  IMG[n] = im;
});
const ready = n => IMG[n] && IMG[n].complete && IMG[n].naturalWidth > 0;

// ---------- Tiles ----------
const ROCK = 0, EARTH = 1, GOLD = 2, GEM = 3, FLOOR = 4, CLAIMED = 5, WALL = 6, HEART = 7, PORTAL = 8, GATE = 9;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const tiles = new Uint8Array(W * H);
const work = new Float32Array(W * H);      // återstående grävarbete
const claimWork = new Float32Array(W * H); // framsteg för anspråk/befästning
const room = new Array(W * H).fill(null);
const mark = new Uint8Array(W * H);
const resv = new Map();                    // tile -> antal imps som jobbar där
const field = new Float32Array(W * H);     // hjältarnas avståndsfält mot hjärtat

const idx = (x, y) => y * W + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const ix = i => i % W, iy = i => (i / W) | 0;
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const passable = t => t === FLOOR || t === CLAIMED || t === PORTAL || t === GATE;
const diggable = t => t === EARTH || t === GOLD || t === GEM || t === WALL; // egna murar går att riva

const HEART_C = { x: 7, y: 15 }, PORTAL_C = { x: 23, y: 6 }, GATE_C = { x: 43, y: 23 };
const FINAL_WAVE = 5;

// ---------- Data ----------
const ROOMS = {
  lair:     { name: 'Lya',          cost: 40, color: '#6b4a32', icon: '🛏️' },
  hatchery: { name: 'Kläckeri',     cost: 50, color: '#8a5a1c', icon: '🐔' },
  treasury: { name: 'Skattkammare', cost: 30, color: '#7a6614', icon: '💰' },
  training: { name: 'Träningssal',  cost: 80, color: '#7a2424', icon: '⚔️' },
  library:  { name: 'Bibliotek',    cost: 90, color: '#46287a', icon: '📜' },
};

const KINDS = {
  imp:      { name: 'Imp',          icon: '😈', hp: 50,  dmg: 3,  range: 1.1, rate: 1.2, speed: 3.4, wage: 0 },
  goblin:   { name: 'Goblin',       icon: '👺', hp: 140, dmg: 11, range: 1.2, rate: 1.1, speed: 2.5, wage: 25 },
  mistress: { name: 'Härskarinna',  icon: '🧛', hp: 180, dmg: 16, range: 1.3, rate: 1.0, speed: 2.7, wage: 45 },
  warlock:  { name: 'Häxmästare',   icon: '🧙', hp: 110, dmg: 14, range: 5,   rate: 0.7, speed: 2.1, wage: 55, ranged: true },
  warrior:  { name: 'Krigare',      icon: '💂', hp: 170, dmg: 12, range: 1.2, rate: 1.0, speed: 2.2, hero: true, dig: 1 },
  archer:   { name: 'Bågskytt',     icon: '🏹', hp: 100, dmg: 9,  range: 5,   rate: 0.9, speed: 2.4, hero: true, dig: 0.6, ranged: true },
  priest:   { name: 'Präst',        icon: '😇', hp: 90,  dmg: 5,  range: 4,   rate: 0.6, speed: 2.1, hero: true, dig: 0.5, healer: true },
  dwarf:    { name: 'Dvärg',        icon: '🧔', hp: 130, dmg: 10, range: 1.2, rate: 1.0, speed: 2.0, hero: true, dig: 3.5 },
  lord:     { name: 'Riddarherren', icon: '🤴', hp: 700, dmg: 28, range: 1.3, rate: 0.9, speed: 2.0, hero: true, dig: 1.5 },
};

// Personligheter — det som gör varje varelse till en individ.
const TRAITS = [
  { id: 'girig',  name: 'Girig',       desc: 'kräver dubbel lön' },
  { id: 'lat',    name: 'Lat',         desc: 'sover dubbelt så mycket' },
  { id: 'blod',   name: 'Blodtörstig', desc: 'älskar strid, blir rastlös i fred' },
  { id: 'flitig', name: 'Flitig',      desc: 'tränar snabbare' },
  { id: 'feg',    name: 'Feg',         desc: 'flyr när det gör ont' },
  { id: 'gral',   name: 'Grälsjuk',    desc: 'bråkar med andra varelser' },
];
const SYL1 = ['Gru', 'Zar', 'Mok', 'Ska', 'Vel', 'Nix', 'Brak', 'Ghu', 'Ulm', 'Kri', 'Sna', 'Dro', 'Fes', 'Hob'];
const SYL2 = ['kk', 'zul', 'gor', 'th', 'ra', 'mund', 'lik', 'bå', 'xa', 'nor', 'g', 'ssa', 'grim', 'ult'];
const makeName = () => pick(SYL1) + pick(SYL2);

// ---------- Tillstånd ----------
const G = {
  gold: 1500, time: 0, speed: 1, paused: false, over: null, tool: 'dig',
  heartHp: 1000, heartMax: 1000, wave: 0, nextWave: 240, warned: false, spawnQ: [],
  payday: 120, portalTimer: 10, portalOwned: false, food: 0, research: 0,
  spells: { lightning: false, heal: false }, hand: [], log: [], kills: 0, fullWarned: false,
};
let ents = [], fx = [], nextId = 1;
let roomTiles = {}, roomCount = {};
let fieldDirty = true, fieldTimer = 0;

// ---------- Kartgenerering ----------
function genMap() {
  tiles.fill(EARTH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tiles[idx(x, y)] = ROCK;

  const setIn = (x, y, t) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) tiles[idx(x, y)] = t; };
  for (let n = 0; n < 16; n++) {
    const cx = rnd(2, W - 3), cy = rnd(2, H - 3), r = 1 + Math.random() * 2.2;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++)
      if (dx * dx + dy * dy <= r * r + Math.random()) setIn(cx + dx, cy + dy, ROCK);
  }
  for (let n = 0; n < 13; n++) {
    let x = rnd(3, W - 4), y = rnd(3, H - 4);
    for (let k = rnd(5, 12); k > 0; k--) {
      if (tiles[idx(x, y)] === EARTH) tiles[idx(x, y)] = GOLD;
      const d = pick(DIRS); x = clamp(x + d[0], 2, W - 3); y = clamp(y + d[1], 2, H - 3);
    }
  }
  setIn(rnd(14, 30), rnd(18, 27), GEM);
  setIn(rnd(30, 40), rnd(3, 12), GEM);

  // Garantera att allt går att nå genom att gräva
  corridor(HEART_C, PORTAL_C);
  corridor(HEART_C, GATE_C);

  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) setIn(HEART_C.x + dx, HEART_C.y + dy, CLAIMED);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setIn(HEART_C.x + dx, HEART_C.y + dy, HEART);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setIn(PORTAL_C.x + dx, PORTAL_C.y + dy, FLOOR);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setIn(PORTAL_C.x + dx, PORTAL_C.y + dy, PORTAL);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setIn(GATE_C.x + dx, GATE_C.y + dy, FLOOR);
  setIn(GATE_C.x, GATE_C.y, GATE);
  let wy = GATE_C.y;
  for (let x = GATE_C.x - 3; x >= 33; x--) {
    setIn(x, wy, FLOOR);
    if (Math.random() < 0.3) { wy = clamp(wy + pick([-1, 1]), 18, H - 3); setIn(x, wy, FLOOR); }
  }

  for (let i = 0; i < W * H; i++) work[i] = tiles[i] === EARTH ? 3 : tiles[i] === GOLD ? 8 : 0;
}

function corridor(a, b) {
  let x = a.x, y = a.y;
  while (x !== b.x || y !== b.y) {
    if ((Math.random() < 0.5 && x !== b.x) || y === b.y) x += Math.sign(b.x - x);
    else y += Math.sign(b.y - y);
    const i = idx(x, y);
    if (tiles[i] === ROCK || tiles[i] === GEM) tiles[i] = EARTH;
  }
}

// ---------- Vägsökning ----------
function bfs(sx, sy, visit) {
  const n = W * H, d = new Int16Array(n).fill(-1), prev = new Int32Array(n).fill(-1);
  const s = idx(sx, sy), q = [s];
  d[s] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    if (visit && visit(i, x, y, d[i])) break;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      const j = idx(nx, ny);
      if (d[j] !== -1 || !passable(tiles[j])) continue;
      d[j] = d[i] + 1; prev[j] = i; q.push(j);
    }
  }
  return { d, prev, start: s };
}
function buildPath(prev, goal, start) {
  const p = [];
  for (let i = goal; i !== start && i !== -1; i = prev[i]) p.push(i);
  return p.reverse();
}
const tileOf = e => idx(Math.floor(e.x), Math.floor(e.y));
function pathToIdx(e, j, maxD = 60) {
  const r = bfs(Math.floor(e.x), Math.floor(e.y), (i, x, y, d) => i === j || d > maxD);
  return r.d[j] < 0 ? null : buildPath(r.prev, j, r.start);
}
function nearestWhere(e, pred) {
  let found = -1;
  const r = bfs(Math.floor(e.x), Math.floor(e.y), (i, x, y) => { if (pred(i, x, y)) { found = i; return true; } });
  return found < 0 ? null : { i: found, path: buildPath(r.prev, found, r.start) };
}

// Hjältarna använder ett avståndsfält (Dijkstra från hjärtat) där jord och murar kostar extra.
// Befästa murar blir därför en verklig försvarsmekanik.
function enterCost(t) {
  if (passable(t) || t === HEART) return 1;
  if (t === EARTH) return 4;
  if (t === GOLD) return 7;
  if (t === WALL) return 16;
  return Infinity;
}
function computeField() {
  field.fill(1e9);
  const heap = [];
  const push = (p, v) => { heap.push([p, v]); let c = heap.length - 1; while (c > 0) { const pa = (c - 1) >> 1; if (heap[pa][0] <= heap[c][0]) break; [heap[pa], heap[c]] = [heap[c], heap[pa]]; c = pa; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return top;
  };
  for (let i = 0; i < W * H; i++) if (tiles[i] === HEART) { field[i] = 0; push(0, i); }
  while (heap.length) {
    const [d, i] = pop();
    if (d > field[i]) continue;
    const x = ix(i), y = iy(i), step = enterCost(tiles[i]);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      const j = idx(nx, ny);
      if (enterCost(tiles[j]) === Infinity || tiles[j] === HEART) continue;
      const nd = d + step;
      if (nd < field[j]) { field[j] = nd; push(nd, j); }
    }
  }
}

function los(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, n = Math.ceil(Math.hypot(dx, dy) / 0.3);
  for (let k = 1; k < n; k++) {
    const t = tiles[idx(Math.floor(a.x + dx * k / n), Math.floor(a.y + dy * k / n))];
    if (!passable(t)) return false;
  }
  return true;
}

// ---------- Rum ----------
function recountRooms() {
  roomTiles = {}; roomCount = {};
  for (const k in ROOMS) { roomTiles[k] = []; roomCount[k] = 0; }
  for (let i = 0; i < W * H; i++) if (room[i]) { roomTiles[room[i]].push(i); roomCount[room[i]]++; }
}
const goldCap = () => 2000 + 400 * (roomCount.treasury || 0);
function updatePortalOwned() {
  let owned = false;
  for (let dy = -2; dy <= 2 && !owned; dy++) for (let dx = -2; dx <= 2; dx++)
    if (tiles[idx(PORTAL_C.x + dx, PORTAL_C.y + dy)] === CLAIMED) { owned = true; break; }
  if (owned && !G.portalOwned) {
    log('Portalen är din! Bygg Lya och Kläckeri så att varelser vill komma.', 'good');
    if (!roomCount.lair || !roomCount.hatchery) log('Tips: varelser kräver minst en Lya och ett Kläckeri.');
  }
  G.portalOwned = owned;
}

// ---------- Entiteter ----------
const lvlMul = l => 1 + 0.22 * (l - 1);
function spawn(kind, x, y, lvl = 1) {
  const k = KINDS[kind];
  const e = {
    id: nextId++, kind, k, x: x + 0.5, y: y + 0.5, lvl, xp: 0, hero: !!k.hero,
    hp: k.hp * lvlMul(lvl), maxhp: k.hp * lvlMul(lvl),
    path: null, task: null, state: k.hero ? 'march' : 'idle', timer: 0, cd: 0, slapped: 0, carry: 0,
    think: Math.random() * 0.4, actT: null,
  };
  if (!e.hero && kind !== 'imp') {
    e.name = makeName(); e.trait = pick(TRAITS);
    e.hunger = 70 + Math.random() * 30; e.sleep = 60 + Math.random() * 40; e.happy = 75;
    e.lastFight = 0; e.lastBrawl = 0; e.lair = -1;
  }
  ents.push(e);
  return e;
}
const label = e => `${e.k.icon} ${e.name || e.k.name}`;
const creatures = () => ents.filter(e => !e.dead && !e.hero && e.kind !== 'imp');
const imps = () => ents.filter(e => !e.dead && e.kind === 'imp');

function followPath(e, dt) {
  if (!e.path || !e.path.length) return true;
  const j = e.path[0];
  if (!passable(tiles[j])) { e.path = null; return true; }
  const tx = ix(j) + 0.5, ty = iy(j) + 0.5, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (Math.abs(dx) > 0.01) e.face = Math.sign(dx);
  const s = e.k.speed * dt * (e.slapped > 0 ? 1.6 : 1);
  if (d <= s) { e.x = tx; e.y = ty; e.path.shift(); return !e.path.length; }
  e.x += dx / d * s; e.y += dy / d * s;
  return false;
}

function releaseTask(e) {
  if (e.task && e.task.resKey != null) {
    const n = (resv.get(e.task.resKey) || 1) - 1;
    n > 0 ? resv.set(e.task.resKey, n) : resv.delete(e.task.resKey);
  }
  e.task = null;
}
function endTask(e) { releaseTask(e); e.path = null; }

function attack(a, b) {
  if (a.cd > 0) return;
  a.cd = 1 / a.k.rate / (a.slapped > 0 ? 1.4 : 1);
  const dmg = a.k.dmg * lvlMul(a.lvl) * (0.8 + Math.random() * 0.4);
  if (a.k.ranged) fx.push({ type: 'bolt', x: a.x, y: a.y, x2: b.x, y2: b.y, t: 0.25, max: 0.25, col: a.hero ? '#9cf' : '#d7f' });
  else fx.push({ type: 'hit', x: b.x, y: b.y, t: 0.2, max: 0.2 });
  b.hp -= dmg;
  if (a.trait) a.lastFight = G.time;
  if (b.trait) b.lastFight = G.time;
  if (b.hp <= 0) kill(b, a);
}

function kill(e, by) {
  if (e.dead) return;
  e.dead = true; releaseTask(e);
  fx.push({ type: 'text', x: e.x, y: e.y, text: '💀', t: 1.2, max: 1.2 });
  if (e.hero) {
    G.kills++;
    G.gold = Math.min(goldCap(), G.gold + 40);
    if (by && !by.hero) { gainXp(by, 12); if (by.trait && by.trait.id === 'blod') by.happy += 10; }
    log(e.kind === 'lord' ? '🤴 Riddarherren har fallit!' : `${e.k.icon} En ${e.k.name.toLowerCase()} föll. +40 guld i plundring.`, 'good');
  } else if (e.name) {
    log(`${label(e)} (Nv ${e.lvl}) har dödats${by ? ` av en ${by.k.name.toLowerCase()}` : ''}.`, 'bad');
    // Varelser minns: de som såg en kamrat dö blir skakade.
    for (const o of creatures()) if (o !== e && dist(o, e) < 6) o.happy -= o.trait.id === 'blod' ? 0 : 6;
  } else if (e.kind === 'imp') log('😈 En imp har dödats.', 'bad');
}

function gainXp(e, amt) {
  if (e.kind === 'imp' || e.hero) return;
  e.xp += amt;
  while (e.xp >= 25 * e.lvl) {
    e.xp -= 25 * e.lvl; e.lvl++;
    const r = e.hp / e.maxhp;
    e.maxhp = e.k.hp * lvlMul(e.lvl); e.hp = e.maxhp * Math.max(r, 0.5);
    fx.push({ type: 'text', x: e.x, y: e.y - 0.4, text: '⬆', t: 1, max: 1 });
    if (e.lvl % 2 === 1 || e.lvl >= 4) log(`${label(e)} nådde nivå ${e.lvl}!`, 'good');
  }
}

function nearestEnemy(e, r) {
  let best = null, bd = r;
  for (const o of ents) {
    if (o.dead || o.held || o.hero === e.hero || o.state === 'leaving') continue;
    const d = dist(e, o);
    if (d < bd && los(e, o)) { best = o; bd = d; }
  }
  return best;
}

function fightUpdate(e, dt) {
  const t = e.target;
  if (!t || t.dead || t.held) { e.state = e.hero ? 'march' : 'idle'; e.target = null; e.path = null; return; }
  const d = dist(e, t);
  if (d <= e.k.range && (d < 1.5 || los(e, t))) { e.path = null; attack(e, t); return; }
  e.repath = (e.repath || 0) - dt;
  if (!e.path || !e.path.length || e.repath <= 0) { e.repath = 0.6; e.path = pathToIdx(e, tileOf(t), 25); }
  if (e.path && e.path.length) followPath(e, dt);
  else { e.state = e.hero ? 'march' : 'idle'; e.target = null; }
}

// ---------- Imps ----------
function impUpdate(e, dt) {
  const boost = e.slapped > 0 ? 1.7 : 1;
  if (e.task) {
    if (e.path && e.path.length) { followPath(e, dt); return; }
    e.timer -= dt * boost;
    if (e.timer > 0) return;
    e.timer = 0.45;
    doImpWork(e);
    return;
  }
  if (e.path && e.path.length) followPath(e, dt);
  e.think -= dt;
  if (e.think > 0) return;
  e.think = 0.3;
  impFindTask(e);
}

function touchesClaimed(x, y) {
  for (const [dx, dy] of DIRS) { const t = tiles[idx(x + dx, y + dy)]; if (t === CLAIMED || t === HEART) return true; }
  return false;
}

function impFindTask(e) {
  if (e.carry >= 100) return startDeliver(e);
  let dig = null, claim = null, fort = null;
  const r = bfs(Math.floor(e.x), Math.floor(e.y), (i, x, y) => {
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      const j = idx(nx, ny);
      if (!dig && mark[j] && diggable(tiles[j]) && (resv.get(j) || 0) < 2) dig = { type: 'dig', stand: i, target: j };
      if (!fort && tiles[i] === CLAIMED && tiles[j] === EARTH && !mark[j] && !resv.get(j)) fort = { type: 'fort', stand: i, target: j };
    }
    if (!claim && tiles[i] === FLOOR && !resv.get(i) && touchesClaimed(x, y)) claim = { type: 'claim', stand: i, target: i };
    return !!dig;
  });
  if (!dig && e.carry > 0) return startDeliver(e);
  const task = dig || claim || fort;
  if (!task) {
    // ingenting att göra — flanera lite
    if (Math.random() < 0.2) wander(e, 4);
    return;
  }
  e.task = task; e.timer = 0.45;
  e.path = buildPath(r.prev, task.stand, r.start);
  task.resKey = task.target;
  resv.set(task.target, (resv.get(task.target) || 0) + 1);
}

function startDeliver(e) {
  const heartAdj = (x, y) => DIRS.some(([dx, dy]) => tiles[idx(x + dx, y + dy)] === HEART);
  const res = nearestWhere(e, (i, x, y) => room[i] === 'treasury' || heartAdj(x, y));
  if (!res) { e.carry = 0; return; }
  e.task = { type: 'deliver', target: res.i };
  e.path = res.path; e.timer = 0.2;
}

function doImpWork(e) {
  const t = e.task, j = t.target;
  if (t.type === 'dig') {
    if (!diggable(tiles[j]) || !mark[j]) return endTask(e);
    if (tiles[j] === GOLD || tiles[j] === GEM) e.carry += 15;
    if (tiles[j] !== GEM) work[j] -= tiles[j] === WALL ? 3 : 1;
    fx.push({ type: 'dust', x: ix(j) + 0.5, y: iy(j) + 0.5, t: 0.3, max: 0.3, col: tiles[j] === GOLD || tiles[j] === GEM ? '#ffd84a' : '#8a6a4a' });
    if (work[j] <= 0) { tiles[j] = FLOOR; mark[j] = 0; fieldDirty = true; return endTask(e); }
    if (e.carry >= 100) endTask(e);
  } else if (t.type === 'claim') {
    if (tiles[j] !== FLOOR) return endTask(e);
    if (++claimWork[j] >= 3) {
      tiles[j] = CLAIMED; claimWork[j] = 0;
      if (Math.abs(ix(j) - PORTAL_C.x) <= 2 && Math.abs(iy(j) - PORTAL_C.y) <= 2) updatePortalOwned();
      endTask(e);
    }
  } else if (t.type === 'fort') {
    if (tiles[j] !== EARTH || mark[j]) return endTask(e);
    if (++claimWork[j] >= 4) { tiles[j] = WALL; work[j] = 12; claimWork[j] = 0; fieldDirty = true; endTask(e); }
  } else if (t.type === 'deliver') {
    const room_ = Math.max(0, goldCap() - G.gold), add = Math.min(e.carry, room_);
    G.gold += add;
    if (add > 0) fx.push({ type: 'text', x: e.x, y: e.y - 0.3, text: `+${add}`, col: '#ffd84a', t: 1, max: 1 });
    if (add < e.carry && !G.fullWarned) { log('Skattkammaren är full! Bygg fler skattkammar-rutor.', 'gold'); G.fullWarned = true; }
    e.carry = 0;
    endTask(e);
  }
}

function wander(e, r) {
  const cands = [];
  const res = bfs(Math.floor(e.x), Math.floor(e.y), (i, x, y, d) => {
    if (d > r) return true;
    if (tiles[i] === CLAIMED && d > 1) cands.push(i);
  });
  if (!cands.length) return;
  const j = pick(cands);
  e.path = buildPath(res.prev, j, res.start);
}

// ---------- Varelser ----------
function lairFor(e) {
  if (e.lair >= 0 && room[e.lair] === 'lair') return e.lair;
  const used = new Set(creatures().map(c => c.lair));
  const free = (roomTiles.lair || []).find(i => !used.has(i));
  e.lair = free === undefined ? -1 : free;
  return e.lair;
}
function goTo(e, state, j) {
  if (j == null || j < 0) return false;
  const p = pathToIdx(e, j);
  if (!p) return false;
  e.state = state; e.path = p; e.actT = null;
  return true;
}

function creatureUpdate(e, dt) {
  const tr = e.trait.id;
  e.hunger = Math.max(0, e.hunger - dt * 1.1);
  e.sleep = Math.max(0, e.sleep - dt * (tr === 'lat' ? 1.1 : 0.55));
  if (e.hunger < 15) e.happy -= dt * (G.food < 1 ? 0.8 : 0.2);
  if (e.sleep < 10) e.happy -= dt * 0.4;
  if (e.lair < 0 && !(roomCount.lair > creatures().filter(c => c.lair >= 0).length)) e.happy -= dt * 0.15;
  if (tr === 'blod' && G.time - e.lastFight > 90) e.happy -= dt * 0.15;
  if (tr === 'gral' && G.time - e.lastBrawl > 40 && Math.random() < dt * 0.02) tryBrawl(e);
  e.happy = clamp(e.happy, 0, 100);

  if (e.happy < 12 && e.state !== 'leaving') {
    e.state = 'leaving'; e.path = null; e.target = null;
    log(`${label(e)} har fått nog och lämnar din dungeon!`, 'bad');
  }

  e.think -= dt;
  if (e.think <= 0) { e.think = 0.4; creatureDecide(e); }

  switch (e.state) {
    case 'fight': fightUpdate(e, dt); break;
    case 'leaving':
      if (followPath(e, dt) && tiles[tileOf(e)] === PORTAL) { e.dead = true; e.gone = true; }
      break;
    default:
      if (e.path && e.path.length) { followPath(e, dt); break; }
      activity(e, dt);
  }
}

function creatureDecide(e) {
  if (e.state === 'leaving') {
    if (!e.path || !e.path.length) {
      const res = nearestWhere(e, i => tiles[i] === PORTAL);
      if (res) e.path = res.path; else { e.dead = true; e.gone = true; }
      if (res && !res.path.length) { e.dead = true; e.gone = true; }
    }
    return;
  }
  const enemy = nearestEnemy(e, e.state === 'sleep' && e.actT != null ? 2.5 : 8);
  if (enemy && e.trait.id === 'feg' && e.hp < e.maxhp * 0.35) {
    if (e.state !== 'sleep' && goTo(e, 'sleep', lairFor(e))) log(`${label(e)} flyr fegt från striden!`);
    return;
  }
  if (enemy) { if (e.state !== 'fight') { e.path = null; e.actT = null; } e.state = 'fight'; e.target = enemy; return; }
  if (e.state === 'fight') { e.state = 'idle'; e.target = null; }
  if (['eat', 'sleep', 'train', 'research'].includes(e.state)) return;

  if (e.hunger < 30 && roomCount.hatchery && G.food >= 1) {
    const res = nearestWhere(e, i => room[i] === 'hatchery');
    if (res) { e.state = 'eat'; e.path = res.path; e.actT = null; return; }
  }
  if ((e.sleep < 25 || e.hp < e.maxhp * 0.5) && goTo(e, 'sleep', lairFor(e))) return;
  if (e.kind === 'warlock' && roomCount.library && goTo(e, 'research', pick(roomTiles.library))) return;
  if (roomCount.training && G.gold >= 10 && e.lvl < 10 && Math.random() < 0.7 && goTo(e, 'train', pick(roomTiles.training))) return;
  if ((!e.path || !e.path.length) && Math.random() < 0.3) wander(e, 6);
}

function activity(e, dt) {
  const done = () => { e.state = 'idle'; e.actT = null; };
  switch (e.state) {
    case 'eat':
      if (e.actT == null) { if (G.food < 1) return done(); G.food -= 1; e.actT = 2.5; }
      if ((e.actT -= dt) <= 0) { e.hunger = 100; e.happy += 3; done(); }
      break;
    case 'sleep':
      if (e.actT == null) e.actT = e.trait.id === 'lat' ? 16 : 9;
      e.hp = Math.min(e.maxhp, e.hp + dt * e.maxhp / 8);
      e.sleep = Math.min(100, e.sleep + dt * 12);
      if ((e.actT -= dt) <= 0) done();
      break;
    case 'train':
      if (room[tileOf(e)] !== 'training') return done();
      if (e.actT == null) { e.actT = 8; e.payAcc = 0; }
      e.payAcc += dt;
      if (e.payAcc >= 1) { e.payAcc -= 1; if (G.gold < 2) return done(); G.gold -= 2; }
      gainXp(e, dt * (e.trait.id === 'flitig' ? 1.6 : 1));
      e.happy += dt * 0.1;
      if ((e.actT -= dt) <= 0) done();
      break;
    case 'research':
      if (room[tileOf(e)] !== 'library') return done();
      if (e.actT == null) e.actT = 12;
      G.research += dt * lvlMul(e.lvl);
      e.happy += dt * 0.1;
      checkResearch();
      if ((e.actT -= dt) <= 0) done();
      break;
  }
}

function tryBrawl(e) {
  const o = creatures().find(c => c !== e && dist(c, e) < 1.6 && c.state !== 'leaving');
  if (!o) return;
  e.lastBrawl = G.time;
  for (const c of [e, o]) { c.hp = Math.max(1, c.hp - c.maxhp * 0.12); c.happy -= 5; fx.push({ type: 'hit', x: c.x, y: c.y, t: 0.3, max: 0.3 }); }
  const about = pick(['en kyckling', 'den bästa sängen', 'vem som är fulast', 'en borttappad guldpeng', 'vems tur det var att träna']);
  log(`${label(e)} och ${label(o)} slogs om ${about}.`);
}

function checkResearch() {
  if (!G.spells.lightning && G.research >= 60) { G.spells.lightning = true; log('Dina häxmästare har forskat fram ⚡ BLIXT!', 'good'); buildTools(); }
  if (!G.spells.heal && G.research >= 180) { G.spells.heal = true; log('Dina häxmästare har forskat fram 💚 LÄK!', 'good'); buildTools(); }
}

// ---------- Hjältar ----------
function heroUpdate(e, dt) {
  e.think -= dt;
  if (e.think <= 0) {
    e.think = 0.4;
    const enemy = nearestEnemy(e, 6);
    if (enemy) { e.state = 'fight'; e.target = enemy; e.digging = null; }
    else if (e.state === 'fight') { e.state = 'march'; e.target = null; e.path = null; }
  }
  if (e.k.healer && e.cd <= 0) {
    const w = ents.find(o => o.hero && !o.dead && o !== e && o.hp < o.maxhp * 0.7 && dist(o, e) < 4);
    if (w) {
      w.hp = Math.min(w.maxhp, w.hp + 25); e.cd = 1.4;
      fx.push({ type: 'bolt', x: e.x, y: e.y, x2: w.x, y2: w.y, t: 0.3, max: 0.3, col: '#7f7' });
    }
  }
  if (e.state === 'fight') { fightUpdate(e, dt); if (e.state === 'fight') return; }
  march(e, dt);
}

function march(e, dt) {
  if (e.digging != null) {
    const j = e.digging;
    if (passable(tiles[j])) { e.digging = null; }
    else {
      work[j] -= dt * e.k.dig;
      if (Math.random() < dt * 4) fx.push({ type: 'dust', x: ix(j) + 0.5, y: iy(j) + 0.5, t: 0.3, max: 0.3, col: tiles[j] === WALL ? '#bbb' : '#8a6a4a' });
      if (work[j] <= 0) {
        if (tiles[j] === WALL) log(`${e.k.icon} Hjältarna har brutit igenom en befäst mur!`, 'bad');
        tiles[j] = FLOOR; mark[j] = 0; claimWork[j] = 0; fieldDirty = true; e.digging = null;
      }
      return;
    }
  }
  if (e.path && e.path.length) { followPath(e, dt); return; }
  const i = tileOf(e), x = ix(i), y = iy(i);
  let best = -1, bv = field[i];
  for (const [dx, dy] of DIRS) {
    const j = idx(x + dx, y + dy);
    if (field[j] < bv) { bv = field[j]; best = j; }
  }
  if (best < 0) return;
  if (tiles[best] === HEART) {
    if (e.cd <= 0) {
      e.cd = 1 / e.k.rate;
      G.heartHp -= e.k.dmg * lvlMul(e.lvl);
      fx.push({ type: 'hit', x: ix(best) + 0.5, y: iy(best) + 0.5, t: 0.25, max: 0.25 });
      if (!G.heartWarn && G.heartHp < G.heartMax * 0.5) { G.heartWarn = true; log('💔 Ditt Dungeon-hjärta är under attack!', 'bad'); }
      if (G.heartHp <= 0) { G.heartHp = 0; G.over = 'lose'; }
    }
    return;
  }
  if (passable(tiles[best])) e.path = [best]; else e.digging = best;
}

function spawnWave() {
  G.wave++;
  const n = G.wave, comp = ['dwarf'];
  for (let k = 0; k < 1 + n; k++) comp.push(k % 2 ? 'archer' : 'warrior');
  if (n >= 2) comp.push('priest');
  // Hjältarna anpassar sig efter din dungeon
  const greed = Math.floor(G.gold / 1500);
  for (let k = 0; k < greed; k++) comp.push(pick(['warrior', 'archer']));
  if (greed) log(`Rykten om ditt guld (${Math.floor(G.gold)}) lockar ${greed} extra lycksökare.`, 'gold');
  let walls = 0;
  for (let i = 0; i < W * H; i++) if (tiles[i] === WALL) walls++;
  if (walls > 50) { comp.push('dwarf'); log('Spejare har rapporterat om dina murar — hjältarna tar med extra dvärgar.'); }
  const warlocks = creatures().filter(c => c.kind === 'warlock').length;
  if (warlocks >= 2) { comp.push('priest'); log('Hjältarna fruktar din magi och tar med ännu en präst.'); }
  if (n === FINAL_WAVE) comp.push('lord');
  comp.forEach((kind, k) => G.spawnQ.push({ kind, t: G.time + k * 1.3, lvl: kind === 'lord' ? 3 : n }));
  log(`⚔️ Våg ${n}/${FINAL_WAVE}: ${comp.length} hjältar stormar in från öster!`, 'bad');
}

// ---------- Övrigt ----------
function payday() {
  let total = 0;
  for (const e of creatures()) {
    const wage = Math.round(e.k.wage * (e.trait.id === 'girig' ? 2 : 1) * lvlMul(e.lvl));
    if (G.gold >= wage) { G.gold -= wage; total += wage; e.happy += 12; }
    else { e.happy -= 30; log(`${label(e)} fick ingen lön och är rasande!`, 'bad'); }
  }
  if (total) log(`💰 Lönedag: ${total} guld utbetalt.`, 'gold');
}

function portalTick() {
  if (!G.portalOwned) return;
  const pop = creatures().length, cap = Math.min(16, roomCount.lair || 0);
  if (!roomCount.hatchery || pop >= cap) return;
  const opts = ['goblin', 'goblin'];
  if (roomCount.training) opts.push('mistress', 'mistress');
  if (roomCount.library) opts.push('warlock', 'warlock');
  const e = spawn(pick(opts), PORTAL_C.x, PORTAL_C.y);
  log(`${label(e)} (${e.k.name}, ${e.trait.name.toLowerCase()}) har klivit ut ur portalen.`);
}

function update(dt) {
  G.time += dt;
  const hatch = roomCount.hatchery || 0;
  G.food = Math.min(hatch * 2, G.food + hatch * dt / 10);

  if ((G.portalTimer -= dt) <= 0) { G.portalTimer = 20; portalTick(); }
  if ((G.payday -= dt) <= 0) { G.payday = 120; payday(); }
  if (G.wave < FINAL_WAVE) {
    G.nextWave -= dt;
    if (!G.warned && G.nextWave <= 20) { G.warned = true; log('Du hör rustningar skramla i fjärran… hjältar närmar sig!', 'bad'); }
    if (G.nextWave <= 0) { spawnWave(); G.nextWave = 150; G.warned = false; }
  }
  while (G.spawnQ.length && G.spawnQ[0].t <= G.time) {
    const s = G.spawnQ.shift();
    spawn(s.kind, GATE_C.x, GATE_C.y, s.lvl);
  }
  fieldTimer -= dt;
  if (fieldDirty && fieldTimer <= 0) { computeField(); fieldDirty = false; fieldTimer = 0.5; }

  for (const e of ents) {
    if (e.dead || e.held) continue;
    e.cd -= dt; e.slapped -= dt;
    if (e.hero) heroUpdate(e, dt);
    else if (e.kind === 'imp') impUpdate(e, dt);
    else creatureUpdate(e, dt);
  }
  for (const e of ents) if (e.dead && e.gone && !e.logged) { e.logged = true; log(`${label(e)} försvann genom portalen.`); }
  ents = ents.filter(e => !e.dead);
  for (const f of fx) f.t -= dt;
  fx = fx.filter(f => f.t > 0);

  if (!G.over && G.wave >= FINAL_WAVE && !G.spawnQ.length && !ents.some(e => e.hero)) G.over = 'win';
}

function log(text, cls = '') {
  G.log.unshift({ text, cls, t: G.time });
  if (G.log.length > 50) G.log.pop();
  logDirty = true;
}

// ---------- Spelaren: hand, verktyg, magi ----------
const TOOLS = [
  { id: 'dig', label: '⛏️ Gräv', sub: 'markera jord' },
  ...Object.entries(ROOMS).map(([id, r]) => ({ id, label: `${r.icon} ${r.name}`, sub: `${r.cost} g/ruta` })),
  { id: 'sell', label: '♻️ Sälj rum', sub: 'halva priset' },
  { id: 'imp', label: '😈 Skapa imp', sub: () => `${impCost()} g` },
  { id: 'lightning', label: '⚡ Blixt', sub: '60 g', locked: () => !G.spells.lightning },
  { id: 'heal', label: '💚 Läk', sub: '80 g', locked: () => !G.spells.heal },
];
const impCost = () => 100 + 50 * Math.max(0, imps().length - 4);

function pickUp(e) {
  if (G.hand.length >= 8) return log('Handen är full (max 8).');
  releaseTask(e);
  e.held = true; e.path = null; e.target = null; e.actT = null; e.digging = null;
  if (e.state !== 'leaving') e.state = 'idle';
  G.hand.push(e);
}
function dropHeld(m) {
  const i = idx(m.x, m.y);
  if (tiles[i] !== CLAIMED) return log('Du kan bara släppa varelser på din egen mark.');
  const e = G.hand.pop();
  e.held = false; e.x = m.fx; e.y = m.fy; e.think = 0;
  e.x = m.x + 0.5; e.y = m.y + 0.5;
  fx.push({ type: 'ring', x: e.x, y: e.y, t: 0.4, max: 0.4, col: '#f55' });
}
function slap(e) {
  e.slapped = 6;
  e.hp = Math.max(1, e.hp - e.maxhp * 0.04);
  if (e.trait) e.happy -= 4;
  fx.push({ type: 'text', x: e.x, y: e.y - 0.4, text: '👋', t: 0.6, max: 0.6 });
}

function castSpell(tool, m) {
  const i = idx(m.x, m.y);
  if (tool === 'imp') {
    const c = impCost();
    if (tiles[i] !== CLAIMED) return log('Imps kan bara skapas på din egen mark.');
    if (G.gold < c) return log('Inte tillräckligt med guld.');
    G.gold -= c; spawn('imp', m.x, m.y);
    fx.push({ type: 'ring', x: m.x + 0.5, y: m.y + 0.5, t: 0.5, max: 0.5, col: '#f55' });
  } else if (tool === 'lightning') {
    if (G.gold < 60) return log('Inte tillräckligt med guld.');
    G.gold -= 60;
    fx.push({ type: 'lightning', x: m.fx, y: m.fy, t: 0.35, max: 0.35 });
    for (const e of ents) if (e.hero && !e.dead && Math.hypot(e.x - m.fx, e.y - m.fy) < 1.6) { e.hp -= 70; if (e.hp <= 0) kill(e, null); }
  } else if (tool === 'heal') {
    if (G.gold < 80) return log('Inte tillräckligt med guld.');
    G.gold -= 80;
    fx.push({ type: 'ring', x: m.fx, y: m.fy, t: 0.6, max: 0.6, col: '#6f6', r: 2.5 });
    for (const e of ents) if (!e.hero && !e.dead && !e.held && Math.hypot(e.x - m.fx, e.y - m.fy) < 2.5) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * 0.6);
  }
}

function applyDrag(d) {
  const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
  let placed = 0, poor = false, refund = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inb(x, y)) continue;
    const i = idx(x, y);
    if (G.tool === 'dig') { if (diggable(tiles[i])) mark[i] = d.val; }
    else if (G.tool === 'sell') { if (room[i]) { refund += ROOMS[room[i]].cost >> 1; room[i] = null; } }
    else if (ROOMS[G.tool] && tiles[i] === CLAIMED && !room[i]) {
      const c = ROOMS[G.tool].cost;
      if (G.gold < c) { poor = true; continue; }
      G.gold -= c; room[i] = G.tool; placed++;
    }
  }
  if (refund) { G.gold += refund; log(`Sålde rum för ${refund} guld.`); }
  if (poor) log('Inte tillräckligt med guld för hela rummet.');
  if (placed || refund) recountRooms();
}

// ---------- Input ----------
let drag = null, hover = null, logDirty = true;
function mouseTile(ev) {
  const r = cv.getBoundingClientRect();
  const fx_ = (ev.clientX - r.left) * LW / r.width / T, fy_ = (ev.clientY - r.top) * LH / r.height / T;
  return { fx: fx_, fy: fy_, x: clamp(Math.floor(fx_), 0, W - 1), y: clamp(Math.floor(fy_), 0, H - 1) };
}
function entityAt(fx_, fy_) {
  let best = null, bd = 0.5;
  for (const e of ents) {
    if (e.dead || e.held || e.hero) continue;
    const d = Math.hypot(e.x - fx_, e.y - fy_);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function anyEntityAt(fx_, fy_) {
  let best = null, bd = 0.6;
  for (const e of ents) { if (e.dead || e.held) continue; const d = Math.hypot(e.x - fx_, e.y - fy_); if (d < bd) { bd = d; best = e; } }
  return best;
}

cv.addEventListener('contextmenu', ev => ev.preventDefault());
cv.addEventListener('mousedown', ev => {
  if (G.over) return;
  const m = mouseTile(ev);
  if (ev.button === 0) {
    if (['imp', 'lightning', 'heal'].includes(G.tool)) return castSpell(G.tool, m);
    const e = entityAt(m.fx, m.fy);
    if (e) return pickUp(e);
    drag = { x0: m.x, y0: m.y, x1: m.x, y1: m.y, val: mark[idx(m.x, m.y)] ? 0 : 1 };
  } else if (ev.button === 2) {
    if (G.hand.length) return dropHeld(m);
    const e = entityAt(m.fx, m.fy);
    if (e) slap(e); else if (G.tool !== 'dig') setTool('dig');
  }
});
cv.addEventListener('mousemove', ev => {
  hover = mouseTile(ev);
  if (drag) { drag.x1 = hover.x; drag.y1 = hover.y; }
});
cv.addEventListener('mouseleave', () => { hover = null; });
window.addEventListener('mouseup', () => { if (drag) { applyDrag(drag); drag = null; } });
window.addEventListener('keydown', ev => {
  if (ev.code === 'Space') { G.paused = !G.paused; ev.preventDefault(); updateSpeedButtons(); }
  else if (['Digit1', 'Digit2', 'Digit3'].includes(ev.code)) { G.speed = +ev.code.slice(-1); G.paused = false; updateSpeedButtons(); }
  else if (ev.code === 'Escape') setTool('dig');
  else if (ev.code === 'KeyR' && G.over) location.reload();
});

// ---------- UI ----------
const $ = id => document.getElementById(id);
function setTool(id) { G.tool = id; buildTools(); }
function buildTools() {
  $('tools').innerHTML = TOOLS.map(t => {
    const locked = t.locked && t.locked();
    const sub = typeof t.sub === 'function' ? t.sub() : t.sub;
    return `<button data-tool="${t.id}" class="${G.tool === t.id ? 'on' : ''}" ${locked ? 'disabled' : ''}>${t.label}<small>${locked ? 'kräver forskning' : sub}</small></button>`;
  }).join('');
}
$('tools').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && !b.disabled) setTool(b.dataset.tool); });
$('speed').addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  const s = +b.dataset.speed;
  if (s === 0) G.paused = !G.paused; else { G.speed = s; G.paused = false; }
  updateSpeedButtons();
});
function updateSpeedButtons() {
  for (const b of $('speed').children) {
    const s = +b.dataset.speed;
    b.classList.toggle('on', s === 0 ? G.paused : (!G.paused && G.speed === s));
  }
}

const moodIcon = h => h > 70 ? '😊' : h > 40 ? '😐' : h > 20 ? '😠' : '🤬';
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const STATE_SV = { idle: 'strosar', eat: 'äter', sleep: 'sover', train: 'tränar', research: 'forskar', fight: 'slåss', leaving: 'lämnar dig', march: 'marscherar' };

let uiTimer = 0;
function uiTick(dt) {
  uiTimer -= dt;
  if (uiTimer > 0) return;
  uiTimer = 0.25;
  const cr = creatures();
  const waveTxt = G.wave >= FINAL_WAVE ? 'sista vågen!' : fmtTime(Math.max(0, G.nextWave));
  $('stats').innerHTML = `
    <div><span>💰 Guld</span><b>${Math.floor(G.gold)} / ${goldCap()}</b></div>
    <div><span>❤️ Hjärta</span><b>${Math.ceil(G.heartHp)}</b></div>
    <div class="bar"><i style="width:${G.heartHp / G.heartMax * 100}%"></i></div>
    <div><span>😈 Imps</span><b>${imps().length}</b></div>
    <div><span>👺 Varelser</span><b>${cr.length} / ${Math.min(16, roomCount.lair || 0)}</b></div>
    <div><span>🐔 Mat</span><b>${Math.floor(G.food)}</b></div>
    <div><span>📜 Forskning</span><b>${Math.floor(G.research)}</b></div>
    <div><span>⚔️ Nästa våg (${Math.min(G.wave + 1, FINAL_WAVE)}/${FINAL_WAVE})</span><b>${waveTxt}</b></div>
    <div><span>🕐 Lönedag</span><b>${fmtTime(G.payday)}</b></div>
    ${G.hand.length ? `<div><span>✋ I handen</span><b>${G.hand.map(e => e.k.icon).join('')}</b></div>` : ''}`;
  $('crlist').innerHTML = cr.length
    ? cr.map(e => `<div><span>${e.k.icon} ${e.name} <small style="color:var(--muted)">${e.trait.name}</small></span><span>Nv${e.lvl} ${moodIcon(e.happy)}</span></div>`).join('')
    : '<span class="help">Inga varelser än. Gör anspråk på portalen.</span>';
  const h = hover && anyEntityAt(hover.fx, hover.fy);
  if (h) {
    $('info').innerHTML = h.trait
      ? `<b>${label(h)}</b> — ${h.k.name}, nivå ${h.lvl}<br>Personlighet: <b>${h.trait.name}</b> (${h.trait.desc})<br>
         HP ${Math.ceil(h.hp)}/${Math.ceil(h.maxhp)} · Humör ${moodIcon(h.happy)} ${Math.floor(h.happy)}<br>
         Hunger ${Math.floor(h.hunger)} · Sömn ${Math.floor(h.sleep)} · ${STATE_SV[h.state] || h.state}`
      : `<b>${label(h)}</b>${h.lvl > 1 ? ` nivå ${h.lvl}` : ''}<br>HP ${Math.ceil(h.hp)}/${Math.ceil(h.maxhp)}${h.carry ? ` · bär ${h.carry} guld` : ''}`;
  }
  const s = TOOLS.find(t => t.id === 'imp');
  const btn = document.querySelector('[data-tool="imp"] small');
  if (btn && s) btn.textContent = s.sub();
  if (logDirty) {
    logDirty = false;
    $('log').innerHTML = G.log.map(l => `<div class="${l.cls}"><small style="color:var(--muted)">${fmtTime(l.t)}</small> ${l.text}</div>`).join('');
  }
}

// ---------- Rendering ----------
const TILE_IMG = {
  [ROCK]: 'tile_rock', [EARTH]: 'tile_earth', [GOLD]: 'tile_gold', [GEM]: 'tile_gem', [FLOOR]: 'tile_floor',
  [CLAIMED]: 'tile_claimed', [WALL]: 'tile_wall', [HEART]: 'tile_claimed', [PORTAL]: 'tile_floor', [GATE]: 'tile_floor',
};
const hash = i =>{ let h = i * 2654435761 >>> 0; h ^= h >>> 13; return (h * 1274126177) >>> 0; };
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

function drawTile(i) {
  const x = ix(i), y = iy(i), X = x * T, Y = y * T, t = tiles[i], h = hash(i);
  const speck = (c, n) => { ctx.fillStyle = c; for (let k = 0; k < n; k++) { const hh = hash(i * 7 + k); ctx.fillRect(X + 2 + hh % 15, Y + 2 + (hh >> 5) % 15, 3, 3); } };
  const img = TILE_IMG[t];
  if (img && ready(img)) {
    // spegla rutorna slumpvis så att mönstret inte upprepas lika tydligt
    const fxp = t !== WALL && (h & 1), fyp = t !== WALL && t !== CLAIMED && (h & 2);
    if (fxp || fyp) {
      ctx.save(); ctx.translate(X + T / 2, Y + T / 2); ctx.scale(fxp ? -1 : 1, fyp ? -1 : 1);
      ctx.drawImage(IMG[img], -T / 2, -T / 2, T, T); ctx.restore();
    } else ctx.drawImage(IMG[img], X, Y, T, T);
    if (t === GOLD && work[i] <= 4) { ctx.fillStyle = 'rgba(40,25,15,.35)'; ctx.fillRect(X, Y, T, T); }
  } else switch (t) {
    case ROCK: ctx.fillStyle = '#17151b'; ctx.fillRect(X, Y, T, T); speck('#211e26', 2); break;
    case EARTH: ctx.fillStyle = '#4b3928'; ctx.fillRect(X, Y, T, T); speck('#5a4431', 2); break;
    case GOLD: ctx.fillStyle = '#4b3928'; ctx.fillRect(X, Y, T, T); speck('#e8c33a', 3 + (work[i] > 4 ? 1 : 0)); break;
    case GEM: ctx.fillStyle = '#1d2e48'; ctx.fillRect(X, Y, T, T); ctx.fillStyle = '#6ff'; ctx.beginPath(); ctx.moveTo(X + 10, Y + 3); ctx.lineTo(X + 17, Y + 10); ctx.lineTo(X + 10, Y + 17); ctx.lineTo(X + 3, Y + 10); ctx.fill(); break;
    case FLOOR: ctx.fillStyle = '#2a2420'; ctx.fillRect(X, Y, T, T); speck('#231e1b', 1); break;
    case CLAIMED: ctx.fillStyle = (x + y) % 2 ? '#3b2d3c' : '#342838'; ctx.fillRect(X, Y, T, T); break;
    case WALL:
      ctx.fillStyle = '#5e4d54'; ctx.fillRect(X, Y, T, T);
      ctx.fillStyle = '#48393f';
      ctx.fillRect(X, Y + 6, T, 1); ctx.fillRect(X, Y + 13, T, 1);
      ctx.fillRect(X + (h % 2 ? 6 : 12), Y, 1, 6); ctx.fillRect(X + (h % 2 ? 12 : 5), Y + 7, 1, 6); ctx.fillRect(X + 9, Y + 14, 1, 6);
      break;
    case HEART: ctx.fillStyle = '#3a0a12'; ctx.fillRect(X, Y, T, T); break;
    case PORTAL: ctx.fillStyle = '#1e1040'; ctx.fillRect(X, Y, T, T); break;
    case GATE: ctx.fillStyle = '#22354f'; ctx.fillRect(X, Y, T, T); break;
  }
  // skugga mellan fast mark och gångar
  if (!passable(t) && t !== HEART && t !== PORTAL && y + 1 < H && passable(tiles[i + W])) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(X, Y + T - 3, T, 3);
  }
  if (claimWork[i] > 0 && t === FLOOR) { ctx.fillStyle = `rgba(120,70,140,${claimWork[i] / 4})`; ctx.fillRect(X, Y, T, T); }
  if (room[i]) {
    const r = ROOMS[room[i]], rimg = 'room_' + room[i];
    if (ready(rimg)) {
      // rumstexturen täcker 4×4 rutor, så större rum ser sammanhängande ut
      const S = IMG[rimg].naturalWidth / 4;
      ctx.drawImage(IMG[rimg], (x % 4) * S, (y % 4) * S, S, S, X, Y, T, T);
      // mörk kant där rummet slutar
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      if (room[i - 1] !== room[i]) ctx.fillRect(X, Y, 1.5, T);
      if (room[i + 1] !== room[i]) ctx.fillRect(X + T - 1.5, Y, 1.5, T);
      if (room[i - W] !== room[i]) ctx.fillRect(X, Y, T, 1.5);
      if (room[i + W] !== room[i]) ctx.fillRect(X, Y + T - 1.5, T, 1.5);
    } else {
      ctx.fillStyle = r.color; ctx.globalAlpha = 0.75; ctx.fillRect(X + 1, Y + 1, T - 2, T - 2); ctx.globalAlpha = 1;
      if ((x * 7 + y * 3) % 4 === 0) { ctx.font = `11px ${EMOJI_FONT}`; ctx.fillText(r.icon, X + 10, Y + 11); }
    }
    if (room[i] === 'treasury' && G.gold > 2000 && !ready(rimg)) {
      const fill = (G.gold - 2000) / (400 * roomCount.treasury);
      if ((h % 100) / 100 < fill) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(X + 5, Y + 11, 10, 5); ctx.fillRect(X + 7, Y + 8, 6, 3); }
    }
  }
  if (mark[i] && diggable(t)) {
    ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1; ctx.strokeRect(X + 1.5, Y + 1.5, T - 3, T - 3);
    ctx.fillStyle = 'rgba(255,216,74,.15)'; ctx.fillRect(X, Y, T, T);
  }
}

function drawSpecial(now) {
  const hx = (HEART_C.x + 0.5) * T, hy = (HEART_C.y + 0.5) * T, pulse = 1 + Math.sin(now / 300) * 0.08;
  const g = ctx.createRadialGradient(hx, hy, 2, hx, hy, 34 * pulse);
  g.addColorStop(0, 'rgba(255,64,96,.9)'); g.addColorStop(0.5, 'rgba(160,16,42,.6)'); g.addColorStop(1, 'rgba(90,0,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 34 * pulse, 0, Math.PI * 2); ctx.fill();
  const px = (PORTAL_C.x + 0.5) * T, py = (PORTAL_C.y + 0.5) * T;
  if (ready('heart')) {
    const s = 72 * (1 + Math.sin(now / 300) * 0.03);
    ctx.drawImage(IMG.heart, hx - s / 2, hy - s * 0.62, s, s);
    if (G.heartHp < G.heartMax) { // hjärtats liv
      ctx.fillStyle = '#000'; ctx.fillRect(hx - 24, hy + 28, 48, 4);
      ctx.fillStyle = '#ff3050'; ctx.fillRect(hx - 24, hy + 28, 48 * G.heartHp / G.heartMax, 4);
    }
  }
  if (ready('portal')) {
    ctx.globalAlpha = G.portalOwned ? 1 : 0.6;
    ctx.drawImage(IMG.portal, px - 34, py - 38, 68, 68);
    ctx.globalAlpha = 1;
  }
  if (ready('gate')) {
    const gx = (GATE_C.x + 0.5) * T, gy = (GATE_C.y + 0.5) * T;
    ctx.drawImage(IMG.gate, gx - 32, gy - 42, 64, 64);
  }
  if (ready('heart') && ready('portal') && ready('gate')) return;
  ctx.save(); ctx.translate(px, py); ctx.rotate(now / 800);
  ctx.strokeStyle = G.portalOwned ? '#c07aff' : '#5a3a8a'; ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, 8 + k * 6, k, k + 3.5); ctx.stroke(); }
  ctx.restore();
  const gx = (GATE_C.x + 0.5) * T, gy = (GATE_C.y + 0.5) * T;
  ctx.strokeStyle = '#8fc4ff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + Math.sin(now / 400) * 0.3;
  ctx.beginPath(); ctx.arc(gx, gy, 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
}

function drawEntity(e) {
  const X = e.x * T, Y = e.y * T;
  ctx.globalAlpha = e.state === 'leaving' ? 0.5 : 1;
  let top = Y - 12;
  if (ready(e.kind)) {
    // skugga + ägarring vid fötterna, sprite ovanpå
    const size = e.kind === 'imp' ? 24 : e.kind === 'lord' ? 36 : 30;
    const foot = Y + 7;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(X, foot, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = e.hero ? 'rgba(120,180,255,.8)' : 'rgba(255,70,90,.8)';
    ctx.lineWidth = e.slapped > 0 ? 2 : 1;
    ctx.beginPath(); ctx.ellipse(X, foot, 8, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
    const sleeping = e.state === 'sleep' && e.actT != null;
    const bob = e.path && e.path.length ? Math.abs(Math.sin(G.time * 12 + e.id)) * 1.5 : 0;
    ctx.save();
    ctx.translate(X, foot - bob);
    if (sleeping) ctx.rotate(-Math.PI / 2 * 0.9);
    if ((e.face || 1) < 0) ctx.scale(-1, 1);
    ctx.drawImage(IMG[e.kind], -size / 2, -size, size, size);
    ctx.restore();
    top = foot - size - 2;
  } else {
    ctx.fillStyle = e.hero ? '#1f3a70' : '#5a1420';
    ctx.strokeStyle = e.hero ? '#8fc4ff' : '#ff6070';
    ctx.lineWidth = e.slapped > 0 ? 2.5 : 1;
    ctx.beginPath(); ctx.arc(X, Y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `13px ${EMOJI_FONT}`; ctx.fillText(e.k.icon, X, Y + 1);
  }
  if (e.carry > 0) { ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(X + 7, Y - 2, 2 + e.carry / 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  if (e.hp < e.maxhp) {
    ctx.fillStyle = '#000'; ctx.fillRect(X - 8, top - 3, 16, 3);
    ctx.fillStyle = e.hero ? '#6af' : '#f45'; ctx.fillRect(X - 8, top - 3, 16 * Math.max(0, e.hp / e.maxhp), 3);
  }
  if (e.lvl > 1) {
    ctx.font = 'bold 7px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(e.lvl, X + 9.5, Y + 6.5);
    ctx.fillStyle = e.hero ? '#9cf' : '#ffd84a'; ctx.fillText(e.lvl, X + 9, Y + 6);
  }
  if (e.state === 'sleep' && e.actT != null) { ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#bcf'; ctx.fillText('z', X + 8 + Math.sin(G.time * 3) * 2, top + 4); }
  ctx.globalAlpha = 1;
}

function drawFx() {
  for (const f of fx) {
    const a = f.t / f.max;
    ctx.globalAlpha = a;
    if (f.type === 'bolt') { ctx.strokeStyle = f.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f.x * T, f.y * T); ctx.lineTo(f.x2 * T, f.y2 * T); ctx.stroke(); }
    else if (f.type === 'hit') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(f.x * T, f.y * T, 5 * (1 - a) + 2, 0, Math.PI * 2); ctx.fill(); }
    else if (f.type === 'dust') { ctx.fillStyle = f.col; for (let k = 0; k < 3; k++) ctx.fillRect(f.x * T + Math.sin(k * 2 + f.t * 20) * 7, f.y * T + Math.cos(k * 3 + f.t * 20) * 7, 2, 2); }
    else if (f.type === 'ring') { ctx.strokeStyle = f.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x * T, f.y * T, (f.r || 1) * T * (1.2 - a), 0, Math.PI * 2); ctx.stroke(); }
    else if (f.type === 'text') { ctx.font = `bold 11px ${EMOJI_FONT}`; ctx.fillStyle = f.col || '#fff'; ctx.fillText(f.text, f.x * T, f.y * T - (1 - a) * 14); }
    else if (f.type === 'lightning') {
      ctx.strokeStyle = '#eef'; ctx.lineWidth = 3; ctx.beginPath();
      let lx = f.x * T, ly = 0; ctx.moveTo(lx, ly);
      while (ly < f.y * T) { ly += 18; lx = f.x * T + (Math.random() - 0.5) * 24 * (1 - ly / (f.y * T + 1)); ctx.lineTo(lx, Math.min(ly, f.y * T)); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,220,255,.4)'; ctx.beginPath(); ctx.arc(f.x * T, f.y * T, 1.6 * T, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function draw(now) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < W * H; i++) drawTile(i);
  drawSpecial(now);
  if (drag) {
    const x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y); let ok;
      if (G.tool === 'dig') ok = diggable(tiles[i]);
      else if (G.tool === 'sell') ok = !!room[i];
      else ok = tiles[i] === CLAIMED && !room[i];
      if (!ok) continue;
      ctx.fillStyle = G.tool === 'dig' ? (drag.val ? 'rgba(255,216,74,.35)' : 'rgba(0,0,0,.35)') : G.tool === 'sell' ? 'rgba(255,80,80,.35)' : 'rgba(120,255,140,.3)';
      ctx.fillRect(x * T, y * T, T, T);
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x0 * T + 0.5, y0 * T + 0.5, (x1 - x0 + 1) * T - 1, (y1 - y0 + 1) * T - 1);
  }
  const vis = ents.filter(e => !e.held).sort((a, b) => a.y - b.y);
  for (const e of vis) drawEntity(e);
  drawFx();
  if (hover) {
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.strokeRect(hover.x * T + 0.5, hover.y * T + 0.5, T - 1, T - 1);
    if (G.hand.length) {
      ctx.font = `14px ${EMOJI_FONT}`; ctx.fillText('✋', hover.fx * T + 10, hover.fy * T + 10);
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(G.hand.length, hover.fx * T + 20, hover.fy * T + 4);
    }
  }
  if (G.paused && !G.over) banner('PAUS', 'Tryck mellanslag för att fortsätta');
  if (G.over === 'win') banner('SEGER!', `Hjältarnas rike darrar. ${G.kills} hjältar besegrade. Tryck R för nytt spel.`);
  if (G.over === 'lose') banner('HJÄRTAT HAR FALLIT', 'Din dungeon är förlorad. Tryck R för att försöka igen.');
}
function banner(title, sub) {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, LH / 2 - 50, LW, 100);
  ctx.fillStyle = '#ff5068'; ctx.font = 'bold 34px Georgia, serif'; ctx.fillText(title, LW / 2, LH / 2 - 12);
  ctx.fillStyle = '#ddd'; ctx.font = '14px system-ui, sans-serif'; ctx.fillText(sub, LW / 2, LH / 2 + 24);
}

// ---------- Start ----------
genMap();
recountRooms();
computeField();
for (let k = 0; k < 4; k++) spawn('imp', HEART_C.x + pick([-2, 2]), HEART_C.y + rnd(-2, 2));
buildTools();
updateSpeedButtons();
log(`⚔️ Hjältar anfaller om ${fmtTime(G.nextWave)} från porten i öster. Överlev ${FINAL_WAVE} vågor!`, 'bad');
log('Bygg Lya + Kläckeri för att locka varelser. Träningssal lockar Härskarinnor, Bibliotek lockar Häxmästare.');
log('Gräv dig fram till portalen (lila, norrut). Dina imps gör anspråk på golv och befäster murar automatiskt.');
log('Välkommen, Mörkrets Herre. Dra med vänster musknapp över jord för att markera den för grävning.', 'good');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!G.paused && !G.over) for (let s = 0; s < G.speed; s++) update(dt);
  draw(now);
  uiTick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
