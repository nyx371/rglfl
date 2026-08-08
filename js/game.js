// GRIDFORGE — mobile-first factory game. Vanilla JS, no dependencies.
"use strict";

/* ============================== utils ============================== */

function hash2(seed, x, y) {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function vnoise(seed, x, y, scale) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return "" + n;
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + "k";
  if (n < 1e9) return (n / 1e6).toFixed(2) + "M";
  return (n / 1e9).toFixed(2) + "B";
}

function el(id) { return document.getElementById(id); }

function svgIcon(name, color) {
  const d = ICON_PATHS[name];
  return `<svg viewBox="0 0 512 512" aria-hidden="true"><path d="${d}" fill="${color || "currentColor"}"/></svg>`;
}

const iconPathCache = {};
function iconPath2D(name) {
  if (!iconPathCache[name]) iconPathCache[name] = new Path2D(ICON_PATHS[name]);
  return iconPathCache[name];
}

/* ============================== state ============================== */

const SAVE_KEY = "gridforge-save";

let state = null;

function freshState() {
  return {
    version: VERSION,
    seed: (Math.random() * 0xffffffff) >>> 0,
    inv: {},
    rp: 0,
    techs: {},          // techId -> level
    perks: {},          // perkId -> count
    buildings: {        // "x,y" -> {type, recipe, job, progress, crafting}
      "0,0": { type: "base", x: 0, y: 0, recipe: null, job: null, progress: 0, crafting: false },
    },
    tileDelta: {},      // "x,y" -> {mined} or {coreDmg, broken}
    coresBroken: 0,
    reserve: {},        // itemId -> amount machines must leave untouched
    alloc: {},          // itemId -> { recipeId|__stock : weight }
    seen: {},           // itemId -> 1 once ever obtained; keeps Resources stable
    lastRecipe: {},     // machine type -> last recipe you chose, reused on place
    cam: { x: -0.5, y: 1, zoom: 0.8 },
    seenIntro: false,
  };
}

let resetting = false; // blocks autosave/pagehide saves from resurrecting a wiped save

function saveGame() {
  if (resetting) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object" || !s.cam) return null;
    return Object.assign(freshState(), s);
  } catch (e) { return null; }
}

/* ============================== world gen ============================== */

// Starter patches guarantee a playable spawn (world coords, inclusive rects).
const STARTER_PATCHES = [
  { res: "ironOre",   x0: 2,  y0: -2, x1: 5,  y1: 1 },
  { res: "copperOre", x0: -6, y0: 1,  x1: -3, y1: 4 },
  { res: "coal",      x0: -1, y0: 4,  x1: 2,  y1: 7 },
  { res: "stone",     x0: -6, y0: -5, x1: -3, y1: -2 },
];

// Larger noise scale + higher threshold = sparser fields with more open
// ground between patches. Tuned so a patch is a stop on a route, not a
// permanent home: you outgrow one and move outward.
// Thresholds are measured, not guessed: six generators overlap, so a
// per-generator threshold of ~0.85 lands total ore coverage near 15% of
// tiles. Open ground is the default; a patch is a destination.
const RES_GEN = [
  { res: "ironOre",   seed: 1013, scale: 13, th: 0.850 },
  { res: "copperOre", seed: 2027, scale: 13, th: 0.855 },
  { res: "coal",      seed: 3041, scale: 12, th: 0.860 },
  { res: "stone",     seed: 4057, scale: 12, th: 0.860 },
  { res: "crystal",   seed: 5077, scale: 14, th: 0.875, minDist: 40 },
  { res: "titanium",  seed: 6091, scale: 16, th: 0.885, minDist: 95 },
];

const CHUNK = 16;
const tileCache = new Map();

// Deterministic base tile: null | {res, cap} | {core, hp}
function baseTile(x, y) {
  const key = x + "," + y;
  if (tileCache.has(key)) return tileCache.get(key);
  if (tileCache.size > 60000) tileCache.clear();

  let out = null;
  const dist = Math.hypot(x, y);

  for (const p of STARTER_PATCHES) {
    if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) {
      out = { res: p.res, cap: Math.round(150 * (0.8 + 0.4 * hash2(state.seed ^ 77, x, y))) };
    }
  }

  // Core deposits: at most one per chunk, sparse, never near spawn.
  if (!out && dist >= 18) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    if (hash2(state.seed ^ 0xC0DE, cx, cy) < 0.22) {
      const px = cx * CHUNK + Math.floor(hash2(state.seed ^ 0xC1DE, cx, cy) * CHUNK);
      const py = cy * CHUNK + Math.floor(hash2(state.seed ^ 0xC2DE, cx, cy) * CHUNK);
      if (px === x && py === y) {
        out = { core: true, hp: Math.round(25 * Math.pow(1 + dist / 30, 1.7)) };
      }
    }
  }

  if (!out && dist > 9) { // keep the immediate spawn area tidy
    let best = null, bestMargin = 0;
    for (const g of RES_GEN) {
      if (g.minDist && dist < g.minDist) continue;
      const v = vnoise(state.seed ^ g.seed, x, y, g.scale);
      const m = v - g.th;
      if (m > 0 && m > bestMargin) { best = g; bestMargin = m; }
    }
    if (best) {
      // thinner tiles overall, but richness still climbs with distance so
      // pushing outward stays the answer to running dry
      const rich = 0.7 + 0.6 * hash2(state.seed ^ 99, x, y);
      out = { res: best.res, cap: Math.round((90 + 3.0 * dist) * rich * (1 + bestMargin * 4)) };
    }
  }

  tileCache.set(key, out);
  return out;
}

// Live tile view combining base tile with deltas.
function tileAt(x, y) {
  const base = baseTile(x, y);
  if (!base) return null;
  const d = state.tileDelta[x + "," + y];
  if (base.core) {
    if (d && d.broken) return null;
    return { core: true, hp: base.hp, dmg: d ? d.coreDmg || 0 : 0 };
  }
  const mined = d ? d.mined || 0 : 0;
  return { res: base.res, cap: base.cap, left: Math.max(0, base.cap - mined) };
}

function mineTileUnit(x, y) {
  const key = x + "," + y;
  const d = state.tileDelta[key] || (state.tileDelta[key] = {});
  d.mined = (d.mined || 0) + 1;
}

/* ============================== multipliers ============================== */

function perkN(id) { return state.perks[id] || 0; }
function techLvl(id) { return state.techs[id] || 0; }

function drillSpeedMult()  { return Math.pow(TECHS.drillSpeed.mult, techLvl("drillSpeed")) * Math.pow(2, perkN("overclock")); }
function smeltSpeedMult()  { return Math.pow(TECHS.smeltSpeed.mult, techLvl("smeltSpeed")) * Math.pow(2, perkN("frenzy")); }
function craftSpeedMult()  { return Math.pow(TECHS.craftSpeed.mult, techLvl("craftSpeed")) * Math.pow(2, perkN("assembly")); }
function labSpeedMult()    { return Math.pow(TECHS.labSpeed.mult, techLvl("labSpeed")) * Math.pow(2, perkN("bigbrain")); }
function manualMult()      { return Math.pow(TECHS.manualMining.mult, techLvl("manualMining")) * Math.pow(3, perkN("ironfist")); }
function drillYieldMult()  { return (techLvl("blastDrilling") ? 2 : 1) * Math.pow(1.5, perkN("richveins")); }
function luckyChance()     { return Math.min(1, 0.2 * perkN("lucky")); }
function coreDamageMult()  { return Math.pow(2, perkN("sturdy")); }

// Deep Veins multiplies only the two rarest ores.
function resYieldMult(res) {
  return (res === "crystal" || res === "titanium") ? Math.pow(3, perkN("deepveins")) : 1;
}

/* ---- per-machine upgrade levels ---- */
function bLevel(b) { return b.lvl || 1; }
function levelMult(b) { return Math.pow(UPGRADE.speedPerLevel, bLevel(b) - 1); }
function upgradeCost(b) {
  const scale = Math.pow(UPGRADE.growth, bLevel(b) - 1) * Math.pow(0.5, perkN("engineer"));
  const out = {};
  for (const k in UPGRADE.baseCost) out[k] = Math.max(1, Math.round(UPGRADE.baseCost[k] * scale));
  return out;
}
function canUpgrade(b) {
  return techLvl("machineOverhaul") > 0 && b.type !== "base";
}

function machineSpeed(b) {
  const t = b.type;
  const base = t === "smelter" ? smeltSpeedMult()
    : t === "assembler" ? craftSpeedMult()
    : t === "lab" ? labSpeedMult() : 1;
  return base * levelMult(b);
}

/* ============================== transfer grid (relay auras) ============================== */

// Buildings only operate inside the aura of a relay connected (via overlapping
// auras) back to the Base Beacon at spawn. Extending the grid = placing relays.

let gridRelays = []; // {x, y, r, active, base}

function relayRadiusOf(type) {
  return (BUILDINGS[type].radius || 0) + techLvl("relayRange") + 3 * perkN("network");
}

function rebuildCoverage() {
  gridRelays = [];
  for (const key in state.buildings) {
    const b = state.buildings[key];
    if (b.type === "base" || b.type === "relay") {
      gridRelays.push({ x: b.x, y: b.y, r: relayRadiusOf(b.type), active: false, base: b.type === "base" });
    }
  }
  // BFS from base over overlapping auras
  const queue = gridRelays.filter(r => r.base);
  queue.forEach(r => r.active = true);
  while (queue.length) {
    const a = queue.pop();
    for (const b of gridRelays) {
      if (!b.active && Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r) {
        b.active = true;
        queue.push(b);
      }
    }
  }
  // cache per-building coverage / offline status
  for (const key in state.buildings) {
    const b = state.buildings[key];
    b._cov = inCoverage(b.x, b.y);
    if (b.type === "relay" || b.type === "base") {
      const r = gridRelays.find(q => q.x === b.x && q.y === b.y);
      b._off = !(r && r.active);
    } else {
      b._off = !b._cov;
    }
  }
  rebuildAttention();
}

// Buildings wanting a look: offline, or a drill sitting on a dead tile.
function rebuildAttention() {
  offlineList = [];
  for (const key in state.buildings) {
    const b = state.buildings[key];
    b._dry = false;
    b._stuck = false;
    if (b.type === "drill") {
      const t = tileAt(b.x, b.y);
      b._dry = !t || !t.res || t.left <= 0;
    } else if (b.type !== "relay" && b.type !== "base") {
      b._stuck = (b.idle || 0) > 20; // starved long enough to be worth a look
    }
    if (b._off || b._dry || b._stuck) offlineList.push(b);
  }
}

let offlineList = [];
let offlineIdx = 0;

function inCoverage(tx, ty) {
  for (const r of gridRelays) {
    if (r.active && Math.hypot(tx - r.x, ty - r.y) <= r.r) return true;
  }
  return false;
}

/* ============================== inventory ============================== */

function invGet(id) { return state.inv[id] || 0; }
function invAdd(id, n) { state.inv[id] = (state.inv[id] || 0) + n; }

function canAfford(cost) {
  for (const k in cost) if (invGet(k) < cost[k]) return false;
  return true;
}
// Player spending (buildings, techs, upgrades) comes out of the Stockpile
// bucket first — that is exactly what the stockpile share is set aside for —
// and only dips into consumer credit once the stockpile is dry.
function payCost(cost) {
  for (const k in cost) {
    state.inv[k] -= cost[k];
    debitLedger(k, cost[k]);
  }
}

function debitLedger(id, amt) {
  const led = credits[id];
  if (!led) return;
  const fromStock = Math.min(led[STOCK] || 0, amt);
  if (fromStock > 0) led[STOCK] -= fromStock;
  let rest = amt - fromStock;
  if (rest <= 1e-9) return;
  const cons = Object.keys(led).filter(k => k !== STOCK);
  let sum = 0;
  for (const k of cons) sum += led[k];
  if (sum <= 0) return;
  for (const k of cons) led[k] = Math.max(0, led[k] - rest * (led[k] / sum));
}

// Machines respect per-item reserves; player actions (building, techs) don't.
function reserveOf(id) { return state.reserve[id] || 0; }

/* ---- allocation: split each item's throughput between competing uses ----

   Instead of belts and splitters, every item has a share table: each recipe
   that consumes it gets a slice of production, and a "Stockpile" slice keeps
   items out of machines entirely. As items are produced they are credited to
   each consumer in proportion to its share; a machine may only start a craft
   if that recipe holds enough credit for the ingredients. The Stockpile share
   is credited to nobody, so those items simply accumulate for you to spend on
   buildings by hand.                                                        */

const STOCK = "__stock";
let credits = {}; // itemId -> { recipeId: credit } (runtime only)

function consumersOf(itemId) {
  return Object.keys(RECIPES).filter(rid => {
    const r = RECIPES[rid];
    if (!r.in[itemId]) return false;
    return !r.needsTech || techLvl(r.needsTech);
  });
}

function allocWeight(item, key) {
  const a = state.alloc[item];
  if (a && a[key] != null) return a[key];
  return key === STOCK ? 0 : 1; // default: machines take everything, split evenly
}

function setAllocWeight(item, key, w) {
  if (!state.alloc[item]) state.alloc[item] = {};
  state.alloc[item][key] = Math.max(0, Math.min(10, w));
}

function allocShares(item) {
  const keys = consumersOf(item).concat([STOCK]);
  const ws = {};
  let total = 0;
  for (const k of keys) { ws[k] = allocWeight(item, k); total += ws[k]; }
  const share = {};
  for (const k of keys) share[k] = total > 0 ? ws[k] / total : (k === STOCK ? 1 : 0);
  return { keys, ws, total, share };
}

function creditOf(item, key) {
  return (credits[item] && credits[item][key]) || 0;
}

// Every inflow of an item (mined, crafted, refunded) is split into the ledger.
// Stockpile holds a real bucket like any consumer, so the ledger accounts for
// every unit in stock — see reconcileCredits for why that matters.
function produceItem(id, n) {
  invAdd(id, n);
  if (n > 0) { state.seen[id] = 1; noteProduced(id, n); }
  const { keys, share } = allocShares(id);
  if (!credits[id]) credits[id] = {};
  for (const k of keys) credits[id][k] = creditOf(id, k) + n * share[k];
}

function seedCredits() {
  credits = {};
  for (const id in state.inv) {
    const { keys, share } = allocShares(id);
    credits[id] = {};
    for (const k of keys) credits[id][k] = invGet(id) * share[k];
  }
}

// The ledger must always add up to what's actually on the shelf. Stock can
// otherwise fall outside it — items banked before a recipe was unlocked, a
// share table that gained or lost a consumer, a save from an older build —
// and because machines gate on credit, un-ledgered stock would sit unusable
// forever. Runs once a second and is self-correcting in both directions.
function reconcileCredits(id) {
  const { keys, share } = allocShares(id);
  const avail = Math.max(0, invGet(id) - reserveOf(id));
  const led = credits[id] || (credits[id] = {});

  let sum = 0;
  for (const k in led) {
    if (keys.indexOf(k) < 0) { delete led[k]; continue; } // consumer went away
    sum += led[k];
  }

  const diff = avail - sum;
  if (Math.abs(diff) > 1e-6) {
    if (diff > 0) {
      // un-ledgered stock: hand it out along the current split
      for (const k of keys) led[k] = (led[k] || 0) + diff * share[k];
    } else if (sum > 0) {
      // stock spent behind the ledger's back: shrink every bucket in proportion
      const f = avail / sum;
      for (const k of keys) led[k] = (led[k] || 0) * f;
    }
  }

  // Stock banked while an item had no consumer lands in Stockpile because
  // there was nowhere else to put it — not because the player asked for it.
  // When the split sets Stockpile to zero, release it. Above zero the bucket
  // stays sticky, or a standing stockpile would bleed away a slice at a time.
  if (share[STOCK] === 0 && (led[STOCK] || 0) > 1e-6) {
    const held = led[STOCK];
    led[STOCK] = 0;
    for (const k of keys) if (k !== STOCK) led[k] = (led[k] || 0) + held * share[k];
  }
}

function reconcileAll() {
  for (const id in ITEMS) {
    if (state.seen[id] || invGet(id) > 0 || credits[id]) reconcileCredits(id);
  }
}

function machineCanAfford(cost, recipeId) {
  for (const k in cost) {
    if (invGet(k) - reserveOf(k) < cost[k]) return false;
    if (creditOf(k, recipeId) < cost[k]) return false;
  }
  return true;
}

function payMachineCost(cost, recipeId) {
  for (const k in cost) {
    state.inv[k] -= cost[k];
    credits[k][recipeId] -= cost[k];
  }
}

/* ---- per-second rate tracking (display only, not saved) ----
   Rates are gross *production*, not net stock change: a plate line running at
   full tilt reads +5/s whether or not assemblers eat every plate. Consumption
   is shown by the allocation split and the starvation census instead.        */

const rates = {};       // itemId -> smoothed items produced/sec ("__rp" for research)
let prodAccum = {};     // itemId -> produced since the last sample
let rateClock = 0;
let starved = {};       // itemId -> {stock, alloc} machine counts, sampled each second

function noteProduced(id, n) { prodAccum[id] = (prodAccum[id] || 0) + n; }

function updateRates(dt) {
  rateClock += dt;
  if (rateClock < 1) return;
  const keys = new Set([...Object.keys(rates), ...Object.keys(prodAccum)]);
  for (const k of keys) {
    const inst = (prodAccum[k] || 0) / rateClock;
    rates[k] = (rates[k] || 0) * 0.55 + inst * 0.45;
    if (rates[k] < 0.005) delete rates[k];
  }
  prodAccum = {};
  rateClock = 0;
  reconcileAll();
  censusStarvation();
}

// Point-in-time count of machines that can't start, and what's holding them.
function censusStarvation() {
  const out = {};
  for (const key in state.buildings) {
    const b = state.buildings[key];
    if (b.type === "drill" || b.type === "relay" || b.type === "base") continue;
    if (b._off || b.crafting) continue;
    const r = RECIPES[b.recipe];
    if (!r || (r.needsTech && !techLvl(r.needsTech))) continue;
    for (const k in r.in) {
      const haveStock = invGet(k) - reserveOf(k) >= r.in[k];
      const haveCredit = creditOf(k, b.recipe) >= r.in[k];
      if (haveStock && haveCredit) continue;
      const e = out[k] || (out[k] = { stock: 0, alloc: 0 });
      if (!haveStock) e.stock++; else e.alloc++;
    }
  }
  starved = out;
}

function rateHtml(id) {
  const r = rates[id] || 0;
  if (r < 0.05) return "";
  return `<span class="rate" style="color:var(--good)">+${r.toFixed(1)}/s</span>`;
}

/* ============================== simulation ============================== */

let floaters = []; // {wx, wy, txt, color, age}

function addFloater(wx, wy, txt, color) {
  floaters.push({ wx, wy, txt, color: color || "#fff", age: 0 });
  if (floaters.length > 60) floaters.shift();
}

/* ---- juice: particles, screen shake, camera easing ---- */

let particles = []; // world-space {wx, wy, vx, vy, age, life, color, r}
let shake = 0;
let camAnim = null; // {fx, fy, fz, tx, ty, tz, t, dur}
let panVel = null;  // world units/sec, carries a flick after the finger lifts

function burst(wx, wy, color, n, power) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.35 + Math.random() * 0.65);
    particles.push({
      wx, wy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - power * 0.35,
      age: 0,
      life: 0.45 + Math.random() * 0.5,
      color,
      r: 0.035 + Math.random() * 0.045,
    });
  }
  if (particles.length > 320) particles.splice(0, particles.length - 320);
}

function addShake(n) { shake = Math.min(26, shake + n); }

function flyTo(x, y, zoom) {
  camAnim = {
    fx: state.cam.x, fy: state.cam.y, fz: state.cam.zoom,
    tx: x, ty: y, tz: zoom == null ? state.cam.zoom : zoom,
    t: 0, dur: 0.45,
  };
}

function tickJuice(dt) {
  for (const p of particles) {
    p.age += dt;
    p.wx += p.vx * dt;
    p.wy += p.vy * dt;
    p.vy += 3.2 * dt; // gravity
    p.vx *= 1 - 1.6 * dt;
  }
  particles = particles.filter(p => p.age < p.life);

  if (shake > 0) shake = Math.max(0, shake - dt * 55);

  if (panVel && !camAnim && pointers.size === 0) {
    state.cam.x += panVel.vx * dt;
    state.cam.y += panVel.vy * dt;
    const decay = Math.pow(0.0022, dt);
    panVel.vx *= decay;
    panVel.vy *= decay;
    if (Math.hypot(panVel.vx, panVel.vy) < 0.35) panVel = null;
  }

  if (camAnim) {
    camAnim.t += dt;
    const k = Math.min(1, camAnim.t / camAnim.dur);
    const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
    state.cam.x = camAnim.fx + (camAnim.tx - camAnim.fx) * e;
    state.cam.y = camAnim.fy + (camAnim.ty - camAnim.fy) * e;
    state.cam.zoom = camAnim.fz + (camAnim.tz - camAnim.fz) * e;
    if (k >= 1) camAnim = null;
  }
}

function tick(dt) {
  // buildings
  for (const key in state.buildings) {
    const b = state.buildings[key];
    if (b.type === "drill") tickDrill(b, dt);
    else tickMachine(b, dt);
    if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
  }
  // manual hold-mining
  if (hold.active) tickHold(dt);
  // floaters
  for (const f of floaters) f.age += dt;
  floaters = floaters.filter(f => f.age < 1.1);
  tickJuice(dt);
}

function tickDrill(b, dt) {
  if (!b._cov) { b.progress = 0; return; }
  const t = tileAt(b.x, b.y);
  if (!t || !t.res || t.left <= 0) { b.progress = 0; return; }
  const gate = RESOURCES[t.res].needsTech;
  if (gate && !techLvl(gate)) { b.progress = 0; return; }
  b.progress += dt * BUILDINGS.drill.baseRate * drillSpeedMult() * levelMult(b);
  const cycles = Math.min(Math.floor(b.progress), t.left);
  if (cycles > 0) {
    b.progress -= cycles;
    const per = drillYieldMult() * resYieldMult(t.res);
    let yield_ = cycles * per;
    const luck = luckyChance();
    if (luck > 0) {
      if (cycles <= 16) {
        for (let i = 0; i < cycles; i++) if (Math.random() < luck) yield_ += per;
      } else {
        yield_ *= 1 + luck; // expected value for big batches
      }
    }
    produceItem(t.res, yield_);
    const key = b.x + "," + b.y;
    const d = state.tileDelta[key] || (state.tileDelta[key] = {});
    d.mined = (d.mined || 0) + cycles;
    b.flash = 0.3;
    if (particles.length < 200) burst(b.x + 0.5, b.y + 0.5, ITEMS[t.res].color, 2, 0.8);
  }
  if (b.progress > 1) b.progress = 0; // tile ran dry mid-batch
}

function tickMachine(b, dt) {
  if (!b._cov) return;
  const r = RECIPES[b.recipe];
  if (!r) return;
  if (r.needsTech && !techLvl(r.needsTech)) { b.crafting = false; b.progress = 0; return; }
  let budget = dt * machineSpeed(b);
  for (let guard = 0; guard < 200; guard++) {
    if (!b.crafting) {
      if (!machineCanAfford(r.in, b.recipe)) { b.idle = (b.idle || 0) + dt; return; }
      b.idle = 0;
      payMachineCost(r.in, b.recipe);
      b.crafting = true;
      b.job = b.recipe;
      b.progress = 0;
    }
    const jr = RECIPES[b.job] || r;
    const need = jr.time - b.progress;
    if (budget < need) { b.progress += budget; return; }
    budget -= need;
    for (const k in jr.out) produceItem(k, jr.out[k]);
    b.flash = 0.3;
    const outId = Object.keys(jr.out)[0];
    if (particles.length < 200) {
      burst(b.x + 0.5, b.y + 0.5, jr.rp ? RP_COLOR : ITEMS[outId].color, 3, 0.9);
    }
    if (jr.rp) {
      state.rp += jr.rp;
      noteProduced("__rp", jr.rp);
      addFloater(b.x + 0.5, b.y, "+" + jr.rp + " RP", RP_COLOR);
    }
    b.crafting = false;
    b.progress = 0;
  }
}

/* ============================== manual mining ============================== */

/* Manual mining revs up. Hold without letting go and the swings come faster
   and hit harder — a streak that peaks after ~9 swings and resets the moment
   you release. It gives the one verb you always have a skill curve, and pays
   back the slower base rate for anyone willing to commit to a tile. */

const hold = { active: false, x: 0, y: 0, t: 0, kind: null, streak: 0 };
const STREAK_PEAK = 9;

function holdRamp() { return Math.min(1, hold.streak / STREAK_PEAK); }
function holdInterval() {
  const base = hold.kind === "core" ? 0.5 : 1.1;
  return base * (1 - 0.62 * holdRamp());
}
function holdPower() { return 1 + 2 * holdRamp(); }

function startHold(tx, ty) {
  const t = tileAt(tx, ty);
  if (!t) return false;
  if (t.res) {
    if (t.left <= 0) return false;
    const gate = RESOURCES[t.res].needsTech;
    if (gate && !techLvl(gate)) { toast("Requires " + TECHS[gate].name + " tech"); return false; }
    hold.kind = "res";
  } else if (t.core) {
    hold.kind = "core";
  } else return false;
  hold.active = true; hold.x = tx; hold.y = ty; hold.t = 0; hold.streak = 0;
  if (navigator.vibrate) navigator.vibrate(8);
  return true;
}

function stopHold() { hold.active = false; hold.streak = 0; }

function tickHold(dt) {
  hold.t += dt;
  let interval = holdInterval();
  while (hold.t >= interval) {
    hold.t -= interval;
    // this swing is paid at the streak it was earned at; the increment counts
    // toward the next one
    const ramp = holdRamp();
    const pow = holdPower();
    hold.streak++;
    interval = holdInterval();
    const t = tileAt(hold.x, hold.y);
    if (!t) { stopHold(); return; }
    if (hold.kind === "res") {
      if (t.left <= 0) { stopHold(); return; }
      const y = manualMult() * resYieldMult(t.res) * pow;
      produceItem(t.res, y);
      mineTileUnit(hold.x, hold.y);
      addFloater(hold.x + 0.5, hold.y + 0.2, "+" + fmt(y), ITEMS[t.res].color);
      burst(hold.x + 0.5, hold.y + 0.5, ITEMS[t.res].color, 6 + Math.round(14 * ramp), 1.5 + 1.6 * ramp);
      addShake(2 + 5 * ramp);
      if (navigator.vibrate) navigator.vibrate(4 + Math.round(8 * ramp));
    } else {
      const key = hold.x + "," + hold.y;
      const d = state.tileDelta[key] || (state.tileDelta[key] = {});
      const dmg = manualMult() * coreDamageMult() * pow;
      d.coreDmg = (d.coreDmg || 0) + dmg;
      addFloater(hold.x + 0.5, hold.y + 0.2, "-" + fmt(dmg), "#c48be0");
      burst(hold.x + 0.5, hold.y + 0.5, "#c48be0", 6 + Math.round(14 * ramp), 1.7 + 1.6 * ramp);
      addShake(3 + 6 * ramp);
      if (navigator.vibrate) navigator.vibrate(8 + Math.round(10 * ramp));
      if (d.coreDmg >= t.hp) {
        d.broken = true;
        stopHold();
        state.coresBroken++;
        burst(hold.x + 0.5, hold.y + 0.5, "#c48be0", 70, 4.5);
        burst(hold.x + 0.5, hold.y + 0.5, "#ffffff", 24, 3.2);
        addShake(24);
        if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
        setTimeout(offerPerks, 520); // let the break land before the modal
      }
    }
  }
}

/* ============================== perks ============================== */

function offerPerks() {
  const pool = PERKS.slice();
  const picks = [];
  while (picks.length < 3 && pool.length) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  const modal = el("modal");
  modal.innerHTML = `<h2>CORE DEPOSIT CRACKED</h2>
    <div class="modal-sub">Choose one permanent upgrade &mdash; they stack forever</div>` +
    picks.map(p => `
      <button class="perk-card" data-perk="${p.id}">
        <span class="card-icon">${svgIcon(p.icon, "#e8c87f")}</span>
        <span class="card-main">
          <span class="card-title">${p.name}${perkN(p.id) ? ` <span class="lvl">owned x${perkN(p.id)}</span>` : ""}</span>
          <span class="card-sub">${p.desc}</span>
        </span>
      </button>`).join("");
  modal.querySelectorAll(".perk-card").forEach(btn => {
    btn.addEventListener("click", () => {
      applyPerk(btn.dataset.perk);
      el("modal-wrap").classList.add("hidden");
    });
  });
  el("modal-wrap").classList.remove("hidden");
}

function applyPerk(id) {
  state.perks[id] = (state.perks[id] || 0) + 1;
  const p = PERKS.find(q => q.id === id);
  if (id === "network") rebuildCoverage();
  if (id === "hoard") {
    const amt = Math.round(100 * Math.pow(1.6, state.coresBroken));
    for (const r of ["ironOre", "copperOre", "coal", "stone", "crystal"]) produceItem(r, amt);
    toast(`Hoarder's Cache: +${fmt(amt)} of every raw resource`);
  } else {
    toast("Perk gained: " + p.name);
  }
  saveGame();
}

/* ============================== camera & canvas ============================== */

const canvas = el("game");
const ctx = canvas.getContext("2d");
const TILE = 56;
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(2.5, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
}
window.addEventListener("resize", resize);
// iOS Safari resizes the visual viewport when its toolbar slides in/out
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

function tilePx() { return TILE * state.cam.zoom; }
function worldToScreen(wx, wy) {
  const s = tilePx();
  return [W / 2 + (wx - state.cam.x) * s, H / 2 + (wy - state.cam.y) * s];
}
function screenToWorld(sx, sy) {
  const s = tilePx();
  return [state.cam.x + (sx - W / 2) / s, state.cam.y + (sy - H / 2) / s];
}

/* ============================== rendering ============================== */

const GROUND = ["#1d232a", "#1f262d", "#1b2128"];
const spawnAnim = {}; // "x,y" -> timestamp, drives the placement pop

function drawIcon(name, cx, cy, size, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 512, size / 512);
  ctx.fillStyle = color;
  ctx.fill(iconPath2D(name));
  ctx.restore();
}

function render() {
  let shx = 0, shy = 0;
  if (shake > 0) {
    shx = (Math.random() - 0.5) * shake;
    shy = (Math.random() - 0.5) * shake;
  }
  ctx.setTransform(DPR, 0, 0, DPR, shx * DPR, shy * DPR);
  ctx.clearRect(-32, -32, W + 64, H + 64);
  const s = tilePx();
  const [wx0, wy0] = screenToWorld(0, 0);
  const [wx1, wy1] = screenToWorld(W, H);
  const x0 = Math.floor(wx0), y0 = Math.floor(wy0);
  const x1 = Math.ceil(wx1), y1 = Math.ceil(wy1);

  const lod = s < 14; // deep zoom: flat colors only, no icons or bars

  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const [sx, sy] = worldToScreen(tx, ty);
      // ground
      ctx.fillStyle = GROUND[Math.floor(hash2(state.seed ^ 7, tx, ty) * 3)];
      ctx.fillRect(sx, sy, s + 1, s + 1);

      const t = tileAt(tx, ty);
      if (t && t.res) {
        const depleted = t.left <= 0;
        if (lod) {
          ctx.fillStyle = depleted ? "#20262d" : ITEMS[t.res].color;
          ctx.fillRect(sx, sy, s + 1, s + 1);
          continue;
        }
        ctx.fillStyle = depleted ? "#20262d" : RESOURCES[t.res].tileColor;
        ctx.fillRect(sx + s * 0.04, sy + s * 0.04, s * 0.92, s * 0.92);
        if (!depleted) {
          drawIcon(ITEMS[t.res].icon, sx + s / 2, sy + s / 2, s * 0.62, ITEMS[t.res].color, 0.55 + 0.45 * (t.left / t.cap));
          if (t.left < t.cap) {
            ctx.fillStyle = "rgba(0,0,0,.45)";
            ctx.fillRect(sx + s * 0.1, sy + s * 0.86, s * 0.8, s * 0.07);
            ctx.fillStyle = ITEMS[t.res].color;
            ctx.fillRect(sx + s * 0.1, sy + s * 0.86, s * 0.8 * (t.left / t.cap), s * 0.07);
          }
        }
      } else if (t && t.core) {
        if (lod) {
          ctx.fillStyle = "#c48be0";
          ctx.fillRect(sx - s * 0.2, sy - s * 0.2, s * 1.4, s * 1.4);
          continue;
        }
        // oversized heavy node, breathing so it reads as special
        const pulse = 0.5 + 0.5 * Math.sin(lastT / 620 + (tx + ty));
        ctx.fillStyle = "#171321";
        ctx.fillRect(sx - s * 0.2, sy - s * 0.2, s * 1.4, s * 1.4);
        ctx.strokeStyle = `rgba(140,102,184,${0.55 + 0.45 * pulse})`;
        ctx.lineWidth = Math.max(1, s * 0.03) * (1 + 0.5 * pulse);
        ctx.strokeRect(sx - s * 0.2, sy - s * 0.2, s * 1.4, s * 1.4);
        drawIcon("core", sx + s / 2, sy + s / 2, s * (1.02 + 0.05 * pulse), "#c48be0");
        const frac = 1 - t.dmg / t.hp;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        ctx.fillRect(sx - s * 0.15, sy + s * 1.06, s * 1.3, s * 0.09);
        ctx.fillStyle = "#c48be0";
        ctx.fillRect(sx - s * 0.15, sy + s * 1.06, s * 1.3 * frac, s * 0.09);
      }
    }
  }

  // grid (subtle, only when zoomed in)
  if (state.cam.zoom > 0.65) {
    ctx.strokeStyle = "rgba(255,255,255,.035)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let tx = x0; tx <= x1; tx++) {
      const [sx] = worldToScreen(tx, 0);
      ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
    }
    for (let ty = y0; ty <= y1; ty++) {
      const [, sy] = worldToScreen(0, ty);
      ctx.moveTo(0, sy); ctx.lineTo(W, sy);
    }
    ctx.stroke();
  }

  // relay auras (under buildings). Barely visible by default; a selected
  // relay (its sheet open) or active relay-placement mode lights them up.
  let strongRelay = null;
  if (currentSheet === "building" && sheetContext) {
    const sb = state.buildings[sheetContext.x + "," + sheetContext.y];
    if (sb && (sb.type === "relay" || sb.type === "base")) strongRelay = sb;
  }
  // Placing anything lights the whole grid: the aura *is* the placement area.
  const placingRelay = mode.name === "place";
  for (const r of gridRelays) {
    const [cx, cy] = worldToScreen(r.x + 0.5, r.y + 0.5);
    const rp = r.r * s;
    if (cx + rp < -40 || cx - rp > W + 40 || cy + rp < -40 || cy - rp > H + 40) continue;
    const strong = placingRelay || (strongRelay && strongRelay.x === r.x && strongRelay.y === r.y);
    ctx.beginPath();
    ctx.arc(cx, cy, rp, 0, Math.PI * 2);
    if (r.active) {
      if (strong) {
        ctx.fillStyle = "rgba(242,163,60,.06)";
        ctx.fill();
      }
      ctx.strokeStyle = strong ? "rgba(242,163,60,.6)" : "rgba(242,163,60,.07)";
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = strong ? "rgba(224,96,96,.7)" : "rgba(224,96,96,.15)";
      ctx.setLineDash([6, 6]);
    }
    ctx.lineWidth = strong ? 2 : 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // selected tile (tile build sheet open)
  if (selTile) {
    const [sx, sy] = worldToScreen(selTile.x, selTile.y);
    ctx.strokeStyle = "rgba(242,163,60,.95)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(sx + 2, sy + 2, s - 4, s - 4);
    ctx.setLineDash([]);
  }

  // buildings (badges collected here, drawn after the loop so they always
  // sit above neighboring buildings)
  const badges = [];
  for (const key in state.buildings) {
    const b = state.buildings[key];
    if (b.x < x0 - 1 || b.x > x1 || b.y < y0 - 1 || b.y > y1) continue;
    const [sx, sy] = worldToScreen(b.x, b.y);
    const isRelay = b.type === "relay" || b.type === "base";

    if (lod) {
      ctx.fillStyle = b._off ? "#e06060" : isRelay ? "#f2a33c" : "#e8eef4";
      ctx.fillRect(sx, sy, s + 1, s + 1);
      continue;
    }

    // placement pop + output flash
    const pop = spawnAnim[key];
    let scale = 1;
    if (pop != null) {
      const k = Math.min(1, (lastT - pop) / 260);
      if (k >= 1) delete spawnAnim[key];
      scale = 0.55 + 0.45 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.12;
    }
    const fl = b.flash > 0 ? b.flash / 0.3 : 0;
    if (fl > 0) scale *= 1 + 0.03 * fl;

    ctx.save();
    if (scale !== 1) {
      ctx.translate(sx + s / 2, sy + s / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(sx + s / 2), -(sy + s / 2));
    }

    ctx.fillStyle = isRelay ? "#33302a" : "#2a333e";
    roundRect(sx + s * 0.06, sy + s * 0.06, s * 0.88, s * 0.88, s * 0.14);
    ctx.fill();
    // Output feedback is a faint inner warmth plus the tiny scale pop above —
    // deliberately not an outline flash, which strobes across a big factory.
    if (fl > 0) {
      ctx.fillStyle = `rgba(242,163,60,${0.08 * fl})`;
      roundRect(sx + s * 0.06, sy + s * 0.06, s * 0.88, s * 0.88, s * 0.14);
      ctx.fill();
    }
    ctx.strokeStyle = b._off ? "#c05050"
      : (b.type === "base" ? "#f2a33c" : isRelay ? "#8a7448" : "#4a5866");
    ctx.lineWidth = Math.max(1, s * 0.025);
    roundRect(sx + s * 0.06, sy + s * 0.06, s * 0.88, s * 0.88, s * 0.14);
    ctx.stroke();
    drawIcon(BUILDINGS[b.type].icon, sx + s / 2, sy + s * 0.47, s * 0.56,
      b._off ? "#8a6a6a" : isRelay ? "#f2c67f" : "#dfe8f2", b._off ? 0.7 : 1);
    ctx.restore();
    // progress
    let frac = 0;
    if (b.type === "drill") frac = b.progress;
    else if (b.crafting) frac = Math.min(1, b.progress / (RECIPES[b.job || b.recipe].time));
    if (frac > 0) {
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(sx + s * 0.12, sy + s * 0.8, s * 0.76, s * 0.07);
      ctx.fillStyle = "#f2a33c";
      ctx.fillRect(sx + s * 0.12, sy + s * 0.8, s * 0.76 * frac, s * 0.07);
    }

    // upgrade level, bottom-left corner
    if (bLevel(b) > 1 && s >= 22) {
      ctx.textAlign = "left";
      ctx.font = `800 ${Math.max(9, s * 0.2)}px -apple-system, sans-serif`;
      ctx.fillStyle = "#f2a33c";
      ctx.fillText("Mk" + bLevel(b), sx + s * 0.12, sy + s * 0.74);
    }

    // a dead tile or a long-starved machine is flagged everywhere on screen,
    // not just near center like the item badges
    if ((b._dry || b._stuck) && s >= 14) {
      badges.push({
        x: sx + s * 0.92, y: sy + s * 0.08,
        icon: "warn", color: "#f2a33c",
        size: Math.min(24, Math.max(14, s * 0.42)),
        alpha: 0.75 + 0.25 * Math.sin(lastT / 300),
      });
    }

    // item-type badge for buildings near the center of the screen; scales
    // with zoom and disappears once tiles get small
    if (!b._dry && !b._stuck && s >= 16) {
      const dc = Math.hypot(sx + s / 2 - W / 2, sy + s / 2 - H / 2);
      const R0 = Math.min(W, H) * 0.38;
      if (dc < R0 * 1.25) {
        const badge = badgeFor(b);
        if (badge) {
          badges.push({
            x: sx + s * 0.92, y: sy + s * 0.08,
            icon: badge.icon, color: badge.color,
            size: Math.min(22, s * 0.38),
            alpha: Math.min(1, Math.max(0, 1 - (dc - R0) / (R0 * 0.25))),
          });
        }
      }
    }
  }
  for (const g of badges) {
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = "rgba(16,20,24,.95)";
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.size / 2 + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    drawIcon(g.icon, g.x, g.y, g.size * 0.72, g.color, g.alpha);
    ctx.globalAlpha = 1;
  }

  // hold-mining feedback: highlighted tile, big ring past the thumb, callout bubble
  if (hold.active) {
    const [sx, sy] = worldToScreen(hold.x + 0.5, hold.y + 0.5);
    const interval = holdInterval();
    const ramp = holdRamp();
    const t = tileAt(hold.x, hold.y);
    const pulse = 0.75 + 0.25 * Math.sin(lastT / (110 - 60 * ramp));
    // the ring runs from ember orange to white-hot as the streak builds
    const hot = [
      Math.round(242 + 13 * ramp),
      Math.round(163 + 82 * ramp),
      Math.round(60 + 140 * ramp),
    ].join(",");

    // tile highlight
    ctx.strokeStyle = `rgba(${hot},${0.9 * pulse})`;
    ctx.lineWidth = Math.max(2, s * 0.05) * (1 + 0.6 * ramp);
    ctx.strokeRect(sx - s / 2, sy - s / 2, s, s);

    // big progress ring, radius well beyond a thumb
    const R = Math.max(s * 0.95, 46) * (1 + 0.1 * ramp);
    ctx.strokeStyle = `rgba(${hot},.25)`;
    ctx.lineWidth = Math.max(5, s * 0.11) * (1 + 0.5 * ramp);
    ctx.beginPath();
    ctx.arc(sx, sy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${hot},.95)`;
    ctx.beginPath();
    ctx.arc(sx, sy, R, -Math.PI / 2, -Math.PI / 2 + (hold.t / interval) * Math.PI * 2);
    ctx.stroke();
    // spokes mark each landed swing, so the streak is countable
    if (hold.streak > 0) {
      const spokes = Math.min(hold.streak, STREAK_PEAK);
      ctx.lineWidth = Math.max(2, s * 0.04);
      for (let i = 0; i < spokes; i++) {
        const a = -Math.PI / 2 + (i / STREAK_PEAK) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * (R + 5), sy + Math.sin(a) * (R + 5));
        ctx.lineTo(sx + Math.cos(a) * (R + 12), sy + Math.sin(a) * (R + 12));
        ctx.stroke();
      }
    }

    // callout above the finger so the thumb never hides it. The ring already
    // shows swing progress, so this only carries what the ring can't.
    if (t) {
      const mult = holdPower();
      const showMult = mult > 1.05;
      const bw = showMult ? 176 : 134, bh = 38;
      const bx = Math.min(W - bw - 8, Math.max(8, sx - bw / 2));
      const by = Math.max(8, sy - R - bh - 16);
      ctx.fillStyle = "rgba(26,33,41,.96)";
      roundRect(bx, by, bw, bh, 11);
      ctx.fill();
      ctx.strokeStyle = `rgb(${hot})`;
      ctx.lineWidth = 1.5 + ramp;
      roundRect(bx, by, bw, bh, 11);
      ctx.stroke();
      const icon = t.res ? ITEMS[t.res].icon : "core";
      const color = t.res ? ITEMS[t.res].color : "#c48be0";
      drawIcon(icon, bx + 24, by + bh / 2, 24, color);
      ctx.textAlign = "left";
      ctx.fillStyle = "#d8e2ec";
      ctx.font = "700 15px -apple-system, sans-serif";
      ctx.fillText(t.res ? fmt(t.left) : fmt(t.hp - t.dmg), bx + 44, by + bh / 2 + 5);
      if (showMult) {
        ctx.textAlign = "right";
        ctx.fillStyle = `rgb(${hot})`;
        ctx.font = `800 ${15 + Math.round(4 * ramp)}px -apple-system, sans-serif`;
        ctx.fillText("×" + mult.toFixed(1), bx + bw - 12, by + bh / 2 + 5);
      }
    }
  }

  // particles
  for (const p of particles) {
    const [px, py] = worldToScreen(p.wx, p.wy);
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    const r = Math.max(1.2, p.r * s);
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  // floaters
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.max(11, s * 0.26)}px -apple-system, sans-serif`;
  for (const f of floaters) {
    const [sx, sy] = worldToScreen(f.wx, f.wy - f.age * 0.8);
    ctx.globalAlpha = Math.max(0, 1 - f.age);
    ctx.fillStyle = f.color;
    ctx.fillText(f.txt, sx, sy);
  }
  ctx.globalAlpha = 1;
}

// What item a building is currently working on, for its overlay badge.
function badgeFor(b) {
  if (b.type === "drill") {
    const t = tileAt(b.x, b.y);
    if (!t || !t.res || t.left <= 0) return null;
    return { icon: ITEMS[t.res].icon, color: ITEMS[t.res].color };
  }
  const r = RECIPES[b.recipe];
  if (!r) return null;
  if (r.rp) return { icon: RP_ICON, color: RP_COLOR };
  const out = Object.keys(r.out)[0];
  return out ? { icon: ITEMS[out].icon, color: ITEMS[out].color } : null;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============================== placement & building ============================== */

let selTile = null; // tile highlighted while the tile build sheet is open

// Which buildings make sense on this tile (ignoring cost/coverage, which are
// reported separately so the sheet can explain *why* something is blocked).
function optionsForTile(tx, ty) {
  const t = tileAt(tx, ty);
  if (state.buildings[tx + "," + ty]) return [];
  if (t && t.core) return [];
  if (t && t.res && t.left > 0) return ["drill", "relay"];
  return ["smelter", "assembler", "lab", "relay"]; // free or exhausted ground
}

// New machines inherit whatever you last set on that machine type, so laying
// down a row of assemblers doesn't mean re-picking the recipe each time.
function defaultRecipeFor(type) {
  const last = state.lastRecipe[type];
  const r = last && RECIPES[last];
  if (r && (!r.needsTech || techLvl(r.needsTech))) {
    // ...but never hand a new machine a recipe whose inputs you've never held;
    // it would sit idle looking broken.
    let known = true;
    for (const k in r.in) if (!state.seen[k]) known = false;
    if (known) return last;
  }
  return BUILDINGS[type].defaultRecipe || null;
}

function placeBlocker(type, tx, ty) {
  const t = tileAt(tx, ty);
  if (type === "drill" && t && t.res) {
    const gate = RESOURCES[t.res].needsTech;
    if (gate && !techLvl(gate)) return "Requires " + TECHS[gate].name + " tech";
  }
  if (!inCoverage(tx, ty)) return "Outside the transfer grid — place a Relay closer";
  if (!canAfford(BUILDINGS[type].cost)) return "Not enough resources";
  return null;
}

function tryPlace(type, tx, ty) {
  if (optionsForTile(tx, ty).indexOf(type) < 0) { toast("Can't build that here"); return false; }
  const blocker = placeBlocker(type, tx, ty);
  if (blocker) { toast(blocker); return false; }
  payCost(BUILDINGS[type].cost);
  state.buildings[tx + "," + ty] = {
    type, x: tx, y: ty,
    recipe: defaultRecipeFor(type),
    job: null, progress: 0, crafting: false,
  };
  rebuildCoverage();
  spawnAnim[tx + "," + ty] = lastT;
  burst(tx + 0.5, ty + 0.5, "#f2c67f", 10, 1.6);
  addShake(3);
  if (navigator.vibrate) navigator.vibrate(12);
  saveGame();
  return true;
}

// Build-menu placement mode: pick a building, then tap tiles to place it
// repeatedly until Done. Coexists with the tap-a-tile contextual sheet.
const mode = { name: "none", building: null };

function setMode(name, building) {
  mode.name = name;
  mode.building = building || null;
  const bar = el("placebar");
  bar.classList.toggle("demo", name === "demolish");
  if (name === "place" || name === "demolish") {
    updatePlacebar();
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

function updatePlacebar() {
  const lab = el("placebar-label");
  if (mode.name === "demolish") {
    const html = `<span class="pb-icon">${svgIcon("trash", "#e06060")}</span>Demolish<span class="pb-cost">50% back</span>`;
    if (lab._html !== html) { lab.innerHTML = html; lab._html = html; }
    return;
  }
  if (mode.name !== "place") return;
  const spec = BUILDINGS[mode.building];
  const cost = Object.keys(spec.cost).map(k =>
    `<span class="cost${invGet(k) >= spec.cost[k] ? "" : " short"}">${
      svgIcon(ITEMS[k].icon, invGet(k) >= spec.cost[k] ? ITEMS[k].color : "#e06060")}${spec.cost[k]}</span>`).join("");
  const html = `<span class="pb-icon">${svgIcon(spec.icon, "#f2c67f")}</span>${spec.name}<span class="pb-cost">${cost}</span>`;
  if (lab._html !== html) { lab.innerHTML = html; lab._html = html; }
}

/* ---- radial tile menu: icon-only build ring around the tapped tile ---- */

let radial = null; // {tx, ty, items:[{id, btn, cost}]}

function closeRadial() {
  radial = null;
  el("radial").classList.add("hidden");
  el("radial").innerHTML = "";
  if (currentSheet !== "building") selTile = null;
}

// Cost pill: shows exactly what a blocked option still needs, live.
function costPillHtml(type) {
  const cost = BUILDINGS[type].cost;
  const parts = [];
  for (const k in cost) {
    const short = invGet(k) < cost[k];
    parts.push(`<span style="color:${short ? "var(--bad)" : "var(--dim)"}">${
      svgIcon(ITEMS[k].icon, short ? "#e06060" : "#8a99a8")}${cost[k]}</span>`);
  }
  return parts.join("");
}

function openRadial(tx, ty, sx, sy) {
  const opts = optionsForTile(tx, ty).filter(id => !BUILDINGS[id].hidden);
  if (!opts.length) return;
  selTile = { x: tx, y: ty };

  const wrap = el("radial");
  wrap.innerHTML = "";
  wrap.classList.remove("hidden");

  const R = 76;
  const cx = Math.min(W - R - 40, Math.max(R + 40, sx));
  const cy = Math.min(H - R - 110, Math.max(R + 70, sy));

  // center chip: what this tile is
  const t = tileAt(tx, ty);
  const chip = document.createElement("div");
  chip.className = "rad-center";
  chip.style.left = cx + "px";
  chip.style.top = cy + "px";
  chip.innerHTML = t && t.res
    ? svgIcon(ITEMS[t.res].icon, ITEMS[t.res].color) + fmt(t.left)
    : `<span style="color:var(--dim)">&mdash;</span>`;
  wrap.appendChild(chip);

  radial = { tx, ty, items: [] };

  // ring of building icons, starting at the top
  const step = (Math.PI * 2) / opts.length;
  const start = -Math.PI / 2 - (opts.length > 1 ? step / 2 : 0);
  opts.forEach((id, i) => {
    const a = start + step * i;
    const bx = cx + Math.cos(a) * R, by = cy + Math.sin(a) * R;
    const btn = document.createElement("button");
    btn.className = "rad-btn";
    btn.style.left = bx + "px";
    btn.style.top = by + "px";
    btn.innerHTML = svgIcon(BUILDINGS[id].icon, "#f2c67f");
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const blocker = placeBlocker(id, tx, ty);
      if (blocker) { toast(BUILDINGS[id].name + ": " + blocker); return; }
      tryPlace(id, tx, ty);
      closeRadial();
    });
    wrap.appendChild(btn);

    const cost = document.createElement("div");
    cost.className = "rad-cost";
    cost.style.left = bx + "px";
    cost.style.top = (by + 30) + "px";
    wrap.appendChild(cost);

    radial.items.push({ id, btn, cost });
  });
  refreshRadial();
}

// Keeps the ring honest as resources tick in: affordable options light up and
// their cost pills disappear the moment you can pay.
function refreshRadial() {
  if (!radial) return;
  for (const it of radial.items) {
    const blocker = placeBlocker(it.id, radial.tx, radial.ty);
    it.btn.className = "rad-btn " + (blocker ? "no" : "ok");
    it.btn.querySelector("path").setAttribute("fill", blocker ? "#8a99a8" : "#f2c67f");
    if (!blocker) {
      it.cost.style.display = "none";
    } else {
      it.cost.style.display = "";
      const html = canAfford(BUILDINGS[it.id].cost)
        ? `<span style="color:var(--bad)">${svgIcon("relay", "#e06060")}</span>` // in range is the blocker
        : costPillHtml(it.id);
      if (it.cost._html !== html) { it.cost.innerHTML = html; it.cost._html = html; }
    }
  }
}

function demolish(tx, ty) {
  const key = tx + "," + ty;
  const b = state.buildings[key];
  if (!b || b.type === "base") return;
  const cost = BUILDINGS[b.type].cost;
  for (const k in cost) produceItem(k, Math.floor(cost[k] / 2));
  delete state.buildings[key];
  delete spawnAnim[key];
  burst(tx + 0.5, ty + 0.5, "#8a99a8", 12, 1.8);
  addShake(3);
  rebuildCoverage();
  toast(BUILDINGS[b.type].name + " demolished (50% refund)");
  saveGame();
}

/* ============================== input ============================== */

const pointers = new Map();
let pinchStart = null;
let holdTimer = null;
let suppressTap = false;
let dismissedRadial = false;

canvas.addEventListener("pointerdown", e => {
  camAnim = null; // touching the map always wins over an in-flight camera move
  panVel = null;
  // Never let a capture failure abort the handler — that would drop the touch
  // entirely and leave the map unresponsive.
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() });
  if (pointers.size === 2) {
    stopHold();
    clearTimeout(holdTimer);
    const [a, b] = [...pointers.values()];
    pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.cam.zoom };
    if (mode.name === "place" || mode.name === "demolish") {
      paintStroke = new Set();
      const [wx, wy] = screenToWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      paintAt(Math.floor(wx), Math.floor(wy));
      suppressTap = true;
    }
  } else if (pointers.size === 1) {
    suppressTap = false;
    // A touch anywhere on the map dismisses an open ring, and that tap does
    // nothing else — no ring hops to the new tile, no sheet opens.
    dismissedRadial = !!radial;
    closeRadial();
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const tx = Math.floor(wx), ty = Math.floor(wy);
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      const p = pointers.get(e.pointerId);
      if (p && !p.moved && pointers.size === 1) {
        if (startHold(tx, ty)) suppressTap = true;
      }
    }, 230);
  }
  e.preventDefault();
});

canvas.addEventListener("pointermove", e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 9) {
    p.moved = true;
    if (hold.active) stopHold();
  }
  p.x = e.clientX; p.y = e.clientY;

  // Two fingers while a build/demolish mode is armed paints instead of
  // zooming: the midpoint is the brush, every tile it crosses gets built.
  if (pointers.size === 2 && (mode.name === "place" || mode.name === "demolish")) {
    const [a, b] = [...pointers.values()];
    const [wx, wy] = screenToWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
    paintAt(Math.floor(wx), Math.floor(wy));
    e.preventDefault();
    return;
  }

  // one finger while the hold-to-draw button is down paints too
  if (pointers.size === 1 && paintHeld && (mode.name === "place" || mode.name === "demolish")) {
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    paintAt(Math.floor(wx), Math.floor(wy));
    suppressTap = true;
    e.preventDefault();
    return;
  }

  if (pointers.size === 1 && !hold.active) {
    const s = tilePx();
    state.cam.x -= dx / s;
    state.cam.y -= dy / s;
    const now = performance.now();
    const gap = Math.max(8, now - (p.mt || now - 16));
    p.mt = now;
    panVel = { vx: -dx / s / (gap / 1000), vy: -dy / s / (gap / 1000) };
  } else if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 10) {
      // zoom about the pinch midpoint, so the map grows under your fingers
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const [wx, wy] = screenToWorld(mx, my);
      state.cam.zoom = Math.min(2.5, Math.max(0.12, pinchStart.zoom * (d / pinchStart.d)));
      const s2 = tilePx();
      state.cam.x = wx - (mx - W / 2) / s2;
      state.cam.y = wy - (my - H / 2) / s2;
    }
  }
  e.preventDefault();
});

function pointerEnd(e) {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  clearTimeout(holdTimer);
  if (hold.active) stopHold();
  if (!p) return;
  const dur = performance.now() - p.t;
  // a flick only coasts if the finger was still moving when it left
  if (panVel && (performance.now() - (p.mt || 0) > 90 || pointers.size > 0)) panVel = null;
  if (!p.moved && dur < 350 && !suppressTap && e.type === "pointerup") {
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    handleTap(Math.floor(wx), Math.floor(wy), e.clientX, e.clientY);
  }
  e.preventDefault();
}
canvas.addEventListener("pointerup", pointerEnd);
canvas.addEventListener("pointercancel", pointerEnd);

let paintStroke = new Set(); // tiles already touched by the current paint stroke
let paintHeld = false;       // the hold-to-draw button is down

function paintAt(tx, ty) {
  const key = tx + "," + ty;
  if (paintStroke.has(key)) return;
  paintStroke.add(key);
  if (mode.name === "place") tryPlace(mode.building, tx, ty);
  else if (mode.name === "demolish") demolish(tx, ty);
}

function handleTap(tx, ty, sx, sy) {
  if (dismissedRadial) { dismissedRadial = false; return; }
  const b = state.buildings[tx + "," + ty];
  if (mode.name === "demolish") { demolish(tx, ty); return; }
  if (mode.name === "place") {
    if (b) { openBuildingSheet(tx, ty); return; }
    tryPlace(mode.building, tx, ty); // stay in place mode for chains
    return;
  }
  if (b) { openBuildingSheet(tx, ty); return; }
  const t = tileAt(tx, ty);
  if (t && t.core) {
    toast(`Core deposit — press & hold to crack it (${fmt(t.hp - t.dmg)} HP)`);
    return;
  }
  closeSheet();
  openRadial(tx, ty, sx, sy);
}

// Belt & suspenders against browser gestures the CSS can't fully stop.
document.addEventListener("gesturestart", e => e.preventDefault());
document.addEventListener("gesturechange", e => e.preventDefault());
document.addEventListener("dblclick", e => e.preventDefault());
document.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
canvas.addEventListener("touchend", e => e.preventDefault(), { passive: false });

/* ============================== UI: chrome ============================== */

// Repeats collapse into a count instead of stacking — placing twenty relays
// should read "Not enough resources ×20", not fill the screen.
function toast(msg) {
  const box = el("toasts");
  const last = box.lastElementChild;
  if (last && last._msg === msg) {
    last._n = (last._n || 1) + 1;
    last.textContent = msg + "  ×" + last._n;
    last.style.animation = "none";
    void last.offsetHeight; // reflow so the fade restarts
    last.style.animation = "";
    clearTimeout(last._t);
    last._t = setTimeout(() => last.remove(), 2600);
    return;
  }
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  t._msg = msg;
  t._n = 1;
  box.appendChild(t);
  t._t = setTimeout(() => t.remove(), 2600);
}

function recenterCamera() {
  flyTo(0.5, 0.5, 0.8);
}

function initChrome() {
  // static icons in chrome
  document.querySelectorAll("[data-icon]").forEach(span => {
    span.innerHTML = svgIcon(span.dataset.icon, "currentColor");
  });
  el("placebar-cancel").addEventListener("click", () => setMode("none"));
  // Hold with the left thumb, draw with the right — an alternative to the
  // two-finger paint gesture that leaves the drawing hand free.
  const paintBtn = el("paint-hold");
  const setPaint = on => {
    paintHeld = on;
    paintBtn.classList.toggle("on", on);
    if (on) { paintStroke = new Set(); if (navigator.vibrate) navigator.vibrate(8); }
  };
  paintBtn.addEventListener("pointerdown", e => {
    e.preventDefault();
    try { paintBtn.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    setPaint(true);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev =>
    paintBtn.addEventListener(ev, () => setPaint(false)));
  el("offline-jump").addEventListener("click", () => {
    if (!offlineList.length) return;
    offlineIdx = offlineIdx % offlineList.length;
    const b = offlineList[offlineIdx++];
    flyTo(b.x + 0.5, b.y + 0.5, Math.max(0.5, state.cam.zoom));
    toast(BUILDINGS[b.type].name +
      (b._dry ? " · exhausted" : b._stuck ? " · starved" : " · offline"));
  });
  // tabs
  document.querySelectorAll("#bottombar .tab").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentSheet === btn.dataset.panel) closeSheet();
      else openSheet(btn.dataset.panel);
    });
  });
  el("sheet-close").addEventListener("click", closeSheet);
  // a resource chip is a shortcut into its own sheet
  el("inv-strip").addEventListener("click", () => openSheet("inv"));
}

const INV_ORDER = Object.keys(ITEMS);

function updateTopbar() {
  const jump = el("offline-jump");
  jump.classList.toggle("hidden", offlineList.length === 0);
  if (offlineList.length) el("offline-count").textContent = offlineList.length;
  const strip = el("inv-strip");
  let html = `<div class="chip rp${state.rp < 1 ? " empty" : ""}"><span class="chip-icon" style="color:${RP_COLOR}">${
    svgIcon(RP_ICON, RP_COLOR)}</span>${fmt(state.rp)}</div>`;
  for (const id of INV_ORDER) {
    const n = invGet(id);
    if (!state.seen[id] && n < 1) continue; // fixed order, discovered items stay
    html += `<div class="chip${n < 1 ? " empty" : ""}"><span class="chip-icon" style="color:${ITEMS[id].color}">${
      svgIcon(ITEMS[id].icon, ITEMS[id].color)}</span>${fmt(n)}</div>`;
  }
  if (strip._html !== html) { strip.innerHTML = html; strip._html = html; }
}

/* ============================== UI: sheets ============================== */

let currentSheet = null;
let sheetContext = null; // for building sheet: {x, y}

function openSheet(name, ctx2) {
  currentSheet = name;
  sheetContext = ctx2 || null;
  if (name !== "alloc") closeRadial();
  selTile = name === "building" ? { x: ctx2.x, y: ctx2.y } : null;
  el("sheet").classList.remove("hidden");
  document.querySelectorAll("#bottombar .tab").forEach(b =>
    b.classList.toggle("active", b.dataset.panel === name));
  renderSheet();
}

function closeSheet() {
  currentSheet = null;
  sheetContext = null;
  selTile = null;
  el("sheet").classList.add("hidden");
  document.querySelectorAll("#bottombar .tab").forEach(b => b.classList.remove("active"));
}

// Costs and recipes read as icon + number: quantities are what you scan for,
// and the names are already carried by the icons.
function iconCost(map, check) {
  let h = "";
  for (const k in map) {
    const short = check && invGet(k) < map[k];
    h += `<span class="cost${short ? " short" : ""}">${
      svgIcon(ITEMS[k].icon, short ? "#e06060" : ITEMS[k].color)}${fmt(map[k])}</span>`;
  }
  return h;
}

function costHtml(cost, rp) {
  let h = "";
  if (rp) h += `<span class="cost ${state.rp >= rp ? "" : "short"}">${svgIcon(RP_ICON, RP_COLOR)}${fmt(rp)}</span>`;
  return h + iconCost(cost, true);
}

// A row with exactly one action is tappable end to end — the button stays as
// the affordance, but the whole card is the target.
function wireRowActions(container) {
  container.querySelectorAll(".card, .alloc-row").forEach(card => {
    const btns = card.querySelectorAll("button");
    if (btns.length !== 1) return;
    const btn = btns[0];
    card.classList.add("row-action");
    if (btn.disabled) { card.classList.add("row-off"); return; }
    card.addEventListener("click", ev => {
      if (ev.target.closest("button") === btn) return; // let its own handler fire
      btn.click();
    });
  });
}

function renderSheet() {
  if (!currentSheet) return;
  const body = el("sheet-body");
  const title = el("sheet-title");
  el("sheet-actions").innerHTML = "";
  if (currentSheet === "build") {
    title.textContent = "Build";
    let h = "";
    for (const id in BUILDINGS) {
      const spec = BUILDINGS[id];
      if (spec.hidden) continue;
      const count = Object.values(state.buildings).filter(q => q.type === id).length;
      h += `<div class="card ${canAfford(spec.cost) ? "afford" : "locked"}">
        <span class="card-icon">${svgIcon(spec.icon, "#dfe8f2")}</span>
        <span class="card-main">
          <div class="card-title">${spec.name}${count ? ` <span class="lvl">x${count}</span>` : ""}</div>
          <div class="card-sub">${spec.desc}<br>${costHtml(spec.cost)}</div>
        </span>
        <button class="btn" data-pick="${id}">Place</button>
      </div>`;
    }
    // an action item, so it leads the sheet rather than trailing it
    const dry = Object.values(state.buildings).filter(q => q._dry);
    if (dry.length) {
      const refund = {};
      for (const d of dry) {
        for (const k in BUILDINGS.drill.cost) refund[k] = (refund[k] || 0) + Math.floor(BUILDINGS.drill.cost[k] / 2);
      }
      h = `<div class="card">
        <span class="card-icon">${svgIcon("warn", "#f2a33c")}</span>
        <span class="card-main">
          <div class="card-title">${dry.length} exhausted drill${dry.length > 1 ? "s" : ""}</div>
          <div class="card-sub">${iconCost(refund)}</div>
        </span>
        <button class="btn danger" data-clear="1">Clear</button>
      </div>` + h;
    }
    h += `<div class="card">
      <span class="card-icon">${svgIcon("trash", "#e06060")}</span>
      <span class="card-main"><div class="card-title">Demolish</div></span>
      <button class="btn danger" data-demolish="1">Select</button>
    </div>`;
    body.innerHTML = h;
    body.querySelectorAll("[data-pick]").forEach(btn =>
      btn.addEventListener("click", () => {
        setMode("place", btn.dataset.pick);
        closeSheet();
      }));
    body.querySelector("[data-demolish]").addEventListener("click", () => {
      setMode("demolish");
      closeSheet();
    });
    const clearBtn = body.querySelector("[data-clear]");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      const n = dry.length;
      for (const d of dry) demolish(d.x, d.y);
      toast(n + " exhausted drill" + (n > 1 ? "s" : "") + " cleared");
      renderSheet();
    });

  } else if (currentSheet === "alloc") {
    const item = sheetContext.item;
    title.textContent = ITEMS[item].name + " split";
    el("sheet-actions").innerHTML = `<button class="icon-btn" data-back="1">${svgIcon("crate", "#8a99a8")}</button>`;
    el("sheet-actions").querySelector("[data-back]")
      .addEventListener("click", () => openSheet("inv"));
    const { keys, ws, total, share } = allocShares(item);
    const colorFor = k => k === STOCK ? "#f2a33c"
      : (RECIPES[k].rp ? RP_COLOR : ITEMS[Object.keys(RECIPES[k].out)[0]].color);

    let bar = `<div class="alloc-bar">`;
    for (const k of keys) {
      if (share[k] <= 0) continue;
      bar += `<span style="width:${(share[k] * 100).toFixed(1)}%;background:${colorFor(k)}"></span>`;
    }
    bar += `</div>`;

    let h = bar;

    for (const k of keys) {
      const isStock = k === STOCK;
      const icon = isStock ? svgIcon("crate", "#f2a33c")
        : svgIcon(RECIPES[k].rp ? RP_ICON : ITEMS[Object.keys(RECIPES[k].out)[0]].icon, colorFor(k));
      const name = isStock ? "Stockpile" : RECIPES[k].name;
      const sub = isStock ? "" : iconCost({ [item]: RECIPES[k].in[item] });
      h += `<div class="alloc-row">
        <span class="alloc-swatch" style="background:${share[k] > 0 ? colorFor(k) : "#39424d"}"></span>
        <span class="alloc-icon">${icon}</span>
        <span class="alloc-name">${name}${sub ? `<small>${sub}</small>` : ""}</span>
        <span class="alloc-step">
          <button data-w="${k}" data-d="-1" ${ws[k] <= 0 ? "disabled" : ""}>&minus;</button>
          <span class="alloc-pct">${total > 0 ? (share[k] * 100).toFixed(0) + "%" : "—"}</span>
          <button data-w="${k}" data-d="1" ${ws[k] >= 10 ? "disabled" : ""}>+</button>
        </span>
      </div>`;
    }
    body.innerHTML = h;
    body.querySelectorAll("[data-w]").forEach(btn =>
      btn.addEventListener("click", () => {
        const k = btn.dataset.w;
        setAllocWeight(item, k, allocWeight(item, k) + Number(btn.dataset.d));
        saveGame();
        renderSheet();
      }));

  } else if (currentSheet === "menu") {
    title.textContent = "Menu";
    body.innerHTML = `
      <div class="card">
        <span class="card-icon">${svgIcon("info", "#8ab4f0")}</span>
        <span class="card-main">
          <div class="card-title">GRIDFORGE v${VERSION}</div>
          <div class="card-sub">${VERSION_SNIPPET}</div>
        </span>
      </div>
      <div class="card">
        <span class="card-icon">${svgIcon("marker", "#f2a33c")}</span>
        <span class="card-main"><div class="card-title">Base Beacon</div></span>
        <button class="btn" data-menu="recenter">Center</button>
      </div>
      <div class="card">
        <span class="card-icon">${svgIcon("trash", "#e06060")}</span>
        <span class="card-main"><div class="card-title">New world</div></span>
        <button class="btn danger" data-menu="reset">Reset</button>
      </div>
      <div class="card">
        <span class="card-main"><div class="card-sub">Icons by lorc, delapouite &amp; faithtoken from game-icons.net (CC BY 3.0).</div></span>
      </div>`;
    body.querySelector('[data-menu="recenter"]').addEventListener("click", () => { recenterCamera(); closeSheet(); });
    body.querySelector('[data-menu="reset"]').addEventListener("click", () => {
      if (confirm("Wipe your factory and start over?")) {
        resetting = true;
        localStorage.removeItem(SAVE_KEY);
        location.reload();
      }
    });

  } else if (currentSheet === "tech") {
    title.textContent = "Tech";
    let h = `<div class="card">
      <span class="card-icon">${svgIcon(RP_ICON, RP_COLOR)}</span>
      <span class="card-main">
        <div class="card-title">${fmt(state.rp)} RP ${rateHtml("__rp")}</div>
      </span>
    </div>`;
    for (const id in TECHS) {
      const t = TECHS[id];
      const lvl = techLvl(id);
      const done = !t.repeat && lvl > 0;
      const rpCost = t.repeat ? Math.round(t.baseCost * Math.pow(t.costGrowth, lvl)) : t.baseCost;
      const items = t.itemCost || {};
      const afford = !done && state.rp >= rpCost && canAfford(items);
      h += `<div class="card ${done ? "locked" : afford ? "afford" : ""}">
        <span class="card-icon">${svgIcon(done ? "check" : t.icon, done ? "#6fce6f" : "#dfe8f2")}</span>
        <span class="card-main">
          <div class="card-title">${t.name}${t.repeat && lvl ? ` <span class="lvl">Lv ${lvl}</span>` : ""}</div>
          <div class="card-sub">${t.effect}${done ? "" : "<br>" + costHtml(items, rpCost)}</div>
        </span>
        ${done ? "" : `<button class="btn" data-tech="${id}" ${afford ? "" : "disabled"}>${t.repeat ? "Upgrade" : "Research"}</button>`}
      </div>`;
    }
    body.innerHTML = h;
    body.querySelectorAll("[data-tech]").forEach(btn =>
      btn.addEventListener("click", () => buyTech(btn.dataset.tech)));

  } else if (currentSheet === "perks") {
    title.textContent = "Perks";
    const owned = PERKS.filter(p => perkN(p.id));
    body.innerHTML = owned.length
      ? owned.map(p => `<div class="card">
          <span class="card-icon">${svgIcon(p.icon, "#e8c87f")}</span>
          <span class="card-main">
            <div class="card-title">${p.name} <span class="lvl">x${perkN(p.id)}</span></div>
            <div class="card-sub">${p.desc}</div>
          </span>
        </div>`).join("")
      : `<div class="card"><span class="card-icon">${svgIcon("core", "#c48be0")}</span>
         <span class="card-main"><div class="card-title">No perks yet</div>
         <div class="card-sub">Crack a core deposit</div></span></div>`;

  } else if (currentSheet === "inv") {
    title.textContent = "Resources";
    // what's blocking the most machines right now, and why
    let hint = "";
    const worst = Object.keys(starved)
      .map(k => ({ k, n: starved[k].stock + starved[k].alloc, ...starved[k] }))
      .sort((a, b) => b.n - a.n)[0];
    if (worst) {
      const byAlloc = worst.alloc >= worst.stock;
      // the split icon (same mark as the row's split button) points at the
      // cause when allocation, not stock, is the thing holding machines up
      hint = `<div class="slim starve">${svgIcon("warn", "#f2a33c")}<span><b>${worst.n}</b> idle &middot; ${
        svgIcon(ITEMS[worst.k].icon, ITEMS[worst.k].color)} <b>${ITEMS[worst.k].name}</b>${
        byAlloc ? " &middot; " + svgIcon("expand", "#f2a33c") : ""}</span></div>`;
    }
    // everything ever obtained, in a fixed order, so rows never reshuffle
    const rows = INV_ORDER.filter(id => state.seen[id] || invGet(id) >= 1 || reserveOf(id) > 0);
    body.innerHTML = hint + (rows.length
      ? rows.map(id => {
          const cons = consumersOf(id);
          const sh = cons.length ? allocShares(id) : null;
          const split = sh && sh.total > 0
            ? cons.map(k => `${(sh.share[k] * 100).toFixed(0)}% ${RECIPES[k].name}`).join(" · ") +
              (sh.share[STOCK] > 0 ? ` · ${(sh.share[STOCK] * 100).toFixed(0)}% stockpiled` : "")
            : (cons.length ? "All stockpiled" : "");
          return `<div class="card${invGet(id) < 1 ? " empty" : ""}">
          <span class="card-icon">${svgIcon(ITEMS[id].icon, ITEMS[id].color)}</span>
          <span class="card-main">
            <div class="card-title">${ITEMS[id].name} ${rateHtml(id)}</div>
            <div class="card-sub">${split || (reserveOf(id) ? `Reserved ${fmt(reserveOf(id))}` : "&mdash;")}</div>
          </span>
          <span class="card-title" style="margin-right:6px">${fmt(invGet(id))}</span>
          ${cons.length ? `<button class="btn ghost lock-btn" data-split="${id}">${svgIcon("expand", "#f2a33c")}</button>` : ""}
          <button class="btn ghost lock-btn" data-lock="${id}">${svgIcon("lock", reserveOf(id) ? "#f2a33c" : "#8a99a8")}<span>${reserveOf(id) ? fmt(reserveOf(id)) : "Off"}</span></button>
        </div>`;
        }).join("")
      : "");
    body.querySelectorAll("[data-lock]").forEach(btn =>
      btn.addEventListener("click", () => {
        const id = btn.dataset.lock;
        const steps = [0, 100, 1000, 10000, 100000];
        state.reserve[id] = steps[(steps.indexOf(reserveOf(id)) + 1) % steps.length];
        saveGame();
        renderSheet();
      }));
    body.querySelectorAll("[data-split]").forEach(btn =>
      btn.addEventListener("click", () => openSheet("alloc", { item: btn.dataset.split })));

  } else if (currentSheet === "building") {
    const b = state.buildings[sheetContext.x + "," + sheetContext.y];
    if (!b) { closeSheet(); return; }
    const spec = BUILDINGS[b.type];
    title.textContent = spec.name + (bLevel(b) > 1 ? " Mk" + bLevel(b) : "");
    if (b.type !== "base") {
      el("sheet-actions").innerHTML = `<button class="icon-btn" data-demo="1">${svgIcon("trash", "#e06060")}</button>`;
      el("sheet-actions").querySelector("[data-demo]").addEventListener("click", () => {
        demolish(b.x, b.y);
        closeSheet();
      });
    }
    let h = "";
    if (b._off) {
      h += `<div class="slim">${svgIcon("relay", "#e06060")}<span style="color:var(--bad)"><b>Offline</b></span></div>`;
    }
    if (b.type === "relay" || b.type === "base") {
      if (!b._off) h += `<div class="slim">${svgIcon("relay", "#f2c67f")}<span><b>${relayRadiusOf(b.type)}</b> tile aura</span></div>`;
    } else if (b.type === "drill") {
      const t = tileAt(b.x, b.y);
      h += `<div class="slim">${t && t.res ? svgIcon(ITEMS[t.res].icon, ITEMS[t.res].color) : svgIcon("trash", "#8a99a8")}<span>${
        t && t.res
          ? `<b>${ITEMS[t.res].name}</b> &middot; ${fmt(t.left)} &middot; ${(BUILDINGS.drill.baseRate * drillSpeedMult() * levelMult(b) * drillYieldMult() * resYieldMult(t.res)).toFixed(2)}/s`
          : "Mined out"}</span></div>`;
    } else {
      const recipes = Object.keys(RECIPES).filter(rid =>
        RECIPES[rid].machine === b.type && (!RECIPES[rid].needsTech || techLvl(RECIPES[rid].needsTech)));
      h += `<div class="recipe-row" style="margin-bottom:8px">` +
        recipes.map(rid => {
          const r = RECIPES[rid];
          const outIcon = r.rp ? RP_ICON : ITEMS[Object.keys(r.out)[0]].icon;
          const outColor = r.rp ? RP_COLOR : ITEMS[Object.keys(r.out)[0]].color;
          return `<button class="recipe-pick ${b.recipe === rid ? "sel" : ""}" data-recipe="${rid}">${svgIcon(outIcon, outColor)} ${r.name}</button>`;
        }).join("") +
        `</div><div class="slim">${svgIcon("info", "#8a99a8")}<span>${recipeDesc(b)}</span></div>`;
      const sameType = Object.values(state.buildings).filter(q => q.type === b.type);
      const differing = sameType.filter(q => q.recipe !== b.recipe).length;
      if (differing) {
        h += `<div class="alloc-row">
          <span class="alloc-icon">${svgIcon(spec.icon, "#dfe8f2")}</span>
          <span class="alloc-name">All ${sameType.length} ${spec.name.toLowerCase()}s<small>${differing} differ</small></span>
          <button class="btn" data-all="1">Set</button>
        </div>`;
      }
    }
    if (canUpgrade(b)) {
      const cost = upgradeCost(b);
      const ok = canAfford(cost);
      h += `<div class="alloc-row">
        <span class="alloc-icon">${svgIcon("upgrade", ok ? "#f2a33c" : "#8a99a8")}</span>
        <span class="alloc-name">Mk${bLevel(b)} &rarr; Mk${bLevel(b) + 1}
          <small>${iconCost(cost, true)}</small></span>
        <button class="btn" data-up="1" ${ok ? "" : "disabled"}>x${UPGRADE.speedPerLevel}</button>
      </div>`;
    }
    body.innerHTML = h;
    const upBtn = body.querySelector("[data-up]");
    if (upBtn) upBtn.addEventListener("click", () => {
      const cost = upgradeCost(b);
      if (!canAfford(cost)) return;
      payCost(cost);
      b.lvl = bLevel(b) + 1;
      if (navigator.vibrate) navigator.vibrate(15);
      saveGame();
      renderSheet();
    });
    body.querySelectorAll("[data-recipe]").forEach(btn =>
      btn.addEventListener("click", () => {
        b.recipe = btn.dataset.recipe;
        state.lastRecipe[b.type] = b.recipe;
        b.crafting = false; b.progress = 0;
        saveGame();
        renderSheet();
      }));
  }
  const allBtn = body.querySelector("[data-all]");
  if (allBtn) allBtn.addEventListener("click", () => {
    const b = state.buildings[sheetContext.x + "," + sheetContext.y];
    let n = 0;
    for (const key in state.buildings) {
      const q = state.buildings[key];
      if (q.type !== b.type || q.recipe === b.recipe) continue;
      q.recipe = b.recipe;
      q.crafting = false; q.progress = 0; q.idle = 0;
      n++;
    }
    toast(n + " set to " + RECIPES[b.recipe].name);
    saveGame();
    renderSheet();
  });
  wireRowActions(body);
}

function recipeDesc(b) {
  const r = RECIPES[b.recipe];
  if (!r) return "";
  const ins = iconCost(r.in);
  const outs = r.rp
    ? `<span class="cost">${svgIcon(RP_ICON, RP_COLOR)}${r.rp}</span>`
    : iconCost(r.out);
  const t = (r.time / machineSpeed(b)).toFixed(1);
  return `${ins}<span class="arrow">&rarr;</span>${outs}<span class="per">${t}s</span>`;
}

function openBuildingSheet(x, y) { openSheet("building", { x, y }); }

function buyTech(id) {
  const t = TECHS[id];
  const lvl = techLvl(id);
  if (!t.repeat && lvl > 0) return;
  const rpCost = t.repeat ? Math.round(t.baseCost * Math.pow(t.costGrowth, lvl)) : t.baseCost;
  const items = t.itemCost || {};
  if (state.rp < rpCost || !canAfford(items)) { toast("Can't afford that yet"); return; }
  state.rp -= rpCost;
  payCost(items);
  state.techs[id] = lvl + 1;
  if (id === "relayRange") rebuildCoverage();
  toast(t.name + (t.repeat ? " Lv " + (lvl + 1) : "") + " researched");
  if (navigator.vibrate) navigator.vibrate(15);
  saveGame();
  renderSheet();
}

/* ============================== main loop ============================== */

let lastT = 0;
let uiTimer = 0;
let sheetTimer = 0;
let attnTimer = 0;

function frame(t) {
  const dt = Math.min(0.25, (t - lastT) / 1000 || 0);
  lastT = t;
  tick(dt);
  updateRates(dt);
  render();
  uiTimer += dt;
  if (uiTimer > 0.25) { uiTimer = 0; updateTopbar(); refreshRadial(); updatePlacebar(); }
  attnTimer += dt;
  if (attnTimer > 1.5) { attnTimer = 0; rebuildAttention(); } // tiles run dry over time
  sheetTimer += dt;
  // live-refresh open sheets that show counts, rates or affordability
  if (sheetTimer > 1 && (currentSheet === "build" || currentSheet === "tech" || currentSheet === "inv")) {
    sheetTimer = 0;
    if (!el("sheet-body").querySelector(":active")) renderSheet();
  }
  requestAnimationFrame(frame);
}

/* ============================== boot ============================== */

function boot() {
  state = loadGame() || freshState();
  // migrate pre-0.3 saves: they have no Base Beacon
  if (!state.buildings["0,0"] || state.buildings["0,0"].type !== "base") {
    state.buildings["0,0"] = { type: "base", x: 0, y: 0, recipe: null, job: null, progress: 0, crafting: false };
  }
  // pre-0.7 saves: seed the "ever seen" set from what's on hand
  if (!state.seen) state.seen = {};
  for (const id in state.inv) if (state.inv[id] > 0) state.seen[id] = 1;
  rebuildCoverage();
  seedCredits();
  resize();
  initChrome();
  updateTopbar();
  if (!state.seenIntro) {
    state.seenIntro = true;
    setTimeout(() => toast("Press & hold an ore tile to mine"), 700);
    saveGame();
  }
  setInterval(saveGame, 5000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
  window.addEventListener("pagehide", saveGame);
  requestAnimationFrame(frame);
}

boot();
