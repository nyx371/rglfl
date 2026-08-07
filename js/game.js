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
    buildings: {},      // "x,y" -> {type, recipe, job, progress, crafting}
    tileDelta: {},      // "x,y" -> {mined} or {coreDmg, broken}
    coresBroken: 0,
    cam: { x: -0.5, y: 1, zoom: 0.8 },
    seenIntro: false,
  };
}

function saveGame() {
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

const RES_GEN = [
  { res: "ironOre",   seed: 1013, scale: 9,  th: 0.660 },
  { res: "copperOre", seed: 2027, scale: 9,  th: 0.665 },
  { res: "coal",      seed: 3041, scale: 8,  th: 0.670 },
  { res: "stone",     seed: 4057, scale: 8,  th: 0.670 },
  { res: "crystal",   seed: 5077, scale: 10, th: 0.700, minDist: 40 },
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
      out = { res: p.res, cap: Math.round(400 * (0.8 + 0.4 * hash2(state.seed ^ 77, x, y))) };
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
      const rich = 0.7 + 0.6 * hash2(state.seed ^ 99, x, y);
      out = { res: best.res, cap: Math.round((350 + 4 * dist) * rich * (1 + bestMargin * 6)) };
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

function machineSpeed(type) {
  if (type === "smelter") return smeltSpeedMult();
  if (type === "assembler") return craftSpeedMult();
  if (type === "lab") return labSpeedMult();
  return 1;
}

/* ============================== inventory ============================== */

function invGet(id) { return state.inv[id] || 0; }
function invAdd(id, n) { state.inv[id] = (state.inv[id] || 0) + n; }

function canAfford(cost) {
  for (const k in cost) if (invGet(k) < cost[k]) return false;
  return true;
}
function payCost(cost) {
  for (const k in cost) state.inv[k] -= cost[k];
}

/* ============================== simulation ============================== */

let floaters = []; // {wx, wy, txt, color, age}

function addFloater(wx, wy, txt, color) {
  floaters.push({ wx, wy, txt, color: color || "#fff", age: 0 });
  if (floaters.length > 60) floaters.shift();
}

function tick(dt) {
  // buildings
  for (const key in state.buildings) {
    const b = state.buildings[key];
    if (b.type === "drill") tickDrill(b, dt);
    else tickMachine(b, dt);
  }
  // manual hold-mining
  if (hold.active) tickHold(dt);
  // floaters
  for (const f of floaters) f.age += dt;
  floaters = floaters.filter(f => f.age < 1.1);
}

function tickDrill(b, dt) {
  const t = tileAt(b.x, b.y);
  if (!t || !t.res || t.left <= 0) { b.progress = 0; return; }
  const gate = RESOURCES[t.res].needsTech;
  if (gate && !techLvl(gate)) { b.progress = 0; return; }
  b.progress += dt * BUILDINGS.drill.baseRate * drillSpeedMult();
  const cycles = Math.min(Math.floor(b.progress), t.left);
  if (cycles > 0) {
    b.progress -= cycles;
    let yield_ = cycles * drillYieldMult();
    const luck = luckyChance();
    if (luck > 0) {
      if (cycles <= 16) {
        for (let i = 0; i < cycles; i++) if (Math.random() < luck) yield_ += drillYieldMult();
      } else {
        yield_ *= 1 + luck; // expected value for big batches
      }
    }
    invAdd(t.res, yield_);
    const key = b.x + "," + b.y;
    const d = state.tileDelta[key] || (state.tileDelta[key] = {});
    d.mined = (d.mined || 0) + cycles;
  }
  if (b.progress > 1) b.progress = 0; // tile ran dry mid-batch
}

function tickMachine(b, dt) {
  const r = RECIPES[b.recipe];
  if (!r) return;
  if (r.needsTech && !techLvl(r.needsTech)) { b.crafting = false; b.progress = 0; return; }
  let budget = dt * machineSpeed(b.type);
  for (let guard = 0; guard < 200; guard++) {
    if (!b.crafting) {
      if (!canAfford(r.in)) return;
      payCost(r.in);
      b.crafting = true;
      b.job = b.recipe;
      b.progress = 0;
    }
    const jr = RECIPES[b.job] || r;
    const need = jr.time - b.progress;
    if (budget < need) { b.progress += budget; return; }
    budget -= need;
    for (const k in jr.out) invAdd(k, jr.out[k]);
    if (jr.rp) {
      state.rp += jr.rp;
      addFloater(b.x + 0.5, b.y, "+" + jr.rp + " RP", "#8ab4f0");
    }
    b.crafting = false;
    b.progress = 0;
  }
}

/* ============================== manual mining ============================== */

const hold = { active: false, x: 0, y: 0, t: 0, kind: null };

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
  hold.active = true; hold.x = tx; hold.y = ty; hold.t = 0;
  if (navigator.vibrate) navigator.vibrate(8);
  return true;
}

function stopHold() { hold.active = false; }

function tickHold(dt) {
  const interval = hold.kind === "core" ? 0.35 : 0.7;
  hold.t += dt;
  while (hold.t >= interval) {
    hold.t -= interval;
    const t = tileAt(hold.x, hold.y);
    if (!t) { stopHold(); return; }
    if (hold.kind === "res") {
      if (t.left <= 0) { stopHold(); return; }
      const y = manualMult();
      invAdd(t.res, y);
      mineTileUnit(hold.x, hold.y);
      addFloater(hold.x + 0.5, hold.y + 0.2, "+" + fmt(y), ITEMS[t.res].color);
      if (navigator.vibrate) navigator.vibrate(5);
    } else {
      const key = hold.x + "," + hold.y;
      const d = state.tileDelta[key] || (state.tileDelta[key] = {});
      d.coreDmg = (d.coreDmg || 0) + manualMult() * coreDamageMult();
      addFloater(hold.x + 0.5, hold.y + 0.2, "-" + fmt(manualMult() * coreDamageMult()), "#c48be0");
      if (navigator.vibrate) navigator.vibrate(10);
      if (d.coreDmg >= t.hp) {
        d.broken = true;
        stopHold();
        state.coresBroken++;
        if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
        offerPerks();
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
  if (id === "hoard") {
    const amt = Math.round(100 * Math.pow(1.6, state.coresBroken));
    for (const r of ["ironOre", "copperOre", "coal", "stone", "crystal"]) invAdd(r, amt);
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
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const s = tilePx();
  const [wx0, wy0] = screenToWorld(0, 0);
  const [wx1, wy1] = screenToWorld(W, H);
  const x0 = Math.floor(wx0), y0 = Math.floor(wy0);
  const x1 = Math.ceil(wx1), y1 = Math.ceil(wy1);

  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const [sx, sy] = worldToScreen(tx, ty);
      // ground
      ctx.fillStyle = GROUND[Math.floor(hash2(state.seed ^ 7, tx, ty) * 3)];
      ctx.fillRect(sx, sy, s + 1, s + 1);

      const t = tileAt(tx, ty);
      if (t && t.res) {
        const depleted = t.left <= 0;
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
        // oversized heavy node
        ctx.fillStyle = "#171321";
        ctx.fillRect(sx - s * 0.2, sy - s * 0.2, s * 1.4, s * 1.4);
        ctx.strokeStyle = "#4d3a66";
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.strokeRect(sx - s * 0.2, sy - s * 0.2, s * 1.4, s * 1.4);
        drawIcon("core", sx + s / 2, sy + s / 2, s * 1.05, "#c48be0");
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

  // buildings
  for (const key in state.buildings) {
    const b = state.buildings[key];
    if (b.x < x0 - 1 || b.x > x1 || b.y < y0 - 1 || b.y > y1) continue;
    const [sx, sy] = worldToScreen(b.x, b.y);
    ctx.fillStyle = "#2a333e";
    roundRect(sx + s * 0.06, sy + s * 0.06, s * 0.88, s * 0.88, s * 0.14);
    ctx.fill();
    ctx.strokeStyle = "#4a5866";
    ctx.lineWidth = Math.max(1, s * 0.025);
    roundRect(sx + s * 0.06, sy + s * 0.06, s * 0.88, s * 0.88, s * 0.14);
    ctx.stroke();
    drawIcon(BUILDINGS[b.type].icon, sx + s / 2, sy + s * 0.47, s * 0.56, "#dfe8f2");
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
  }

  // hold-mining ring
  if (hold.active) {
    const [sx, sy] = worldToScreen(hold.x + 0.5, hold.y + 0.5);
    const interval = hold.kind === "core" ? 0.35 : 0.7;
    ctx.strokeStyle = "rgba(242,163,60,.9)";
    ctx.lineWidth = Math.max(3, s * 0.07);
    ctx.beginPath();
    ctx.arc(sx, sy, s * 0.44, -Math.PI / 2, -Math.PI / 2 + (hold.t / interval) * Math.PI * 2);
    ctx.stroke();
  }

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

const mode = { name: "pan", building: null }; // pan | place | demolish

function canPlaceAt(type, tx, ty) {
  if (state.buildings[tx + "," + ty]) return false;
  const t = tileAt(tx, ty);
  const spec = BUILDINGS[type];
  if (spec.placeOn === "resource") {
    if (!t || !t.res || t.left <= 0) return false;
    const gate = RESOURCES[t.res].needsTech;
    if (gate && !techLvl(gate)) return false;
    return true;
  }
  // free ground or an exhausted resource tile; core tiles are blocked
  return !t || (!!t.res && t.left <= 0);
}

function tryPlace(tx, ty) {
  const type = mode.building;
  const spec = BUILDINGS[type];
  if (!canPlaceAt(type, tx, ty)) {
    const t = tileAt(tx, ty);
    if (spec.placeOn === "resource" && t && t.res && RESOURCES[t.res].needsTech && !techLvl(RESOURCES[t.res].needsTech)) {
      toast("Requires " + TECHS[RESOURCES[t.res].needsTech].name + " tech");
    } else if (spec.placeOn === "resource") {
      toast("Drills go on resource tiles");
    } else {
      toast("Needs free ground");
    }
    return;
  }
  if (!canAfford(spec.cost)) { toast("Not enough resources"); return; }
  payCost(spec.cost);
  state.buildings[tx + "," + ty] = {
    type, x: tx, y: ty,
    recipe: spec.defaultRecipe || null,
    job: null, progress: 0, crafting: false,
  };
  if (navigator.vibrate) navigator.vibrate(12);
  saveGame();
}

function demolish(tx, ty) {
  const key = tx + "," + ty;
  const b = state.buildings[key];
  if (!b) { toast("Tap a building to demolish"); return; }
  const cost = BUILDINGS[b.type].cost;
  for (const k in cost) invAdd(k, Math.floor(cost[k] / 2));
  delete state.buildings[key];
  toast(BUILDINGS[b.type].name + " demolished (50% refund)");
  saveGame();
}

function setMode(name, building) {
  mode.name = name;
  mode.building = building || null;
  const bar = el("placebar");
  if (name === "place") {
    el("placebar-label").textContent = "Tap a tile to place " + BUILDINGS[building].name;
    bar.classList.remove("hidden");
  } else if (name === "demolish") {
    el("placebar-label").textContent = "Tap a building to demolish";
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

/* ============================== input ============================== */

const pointers = new Map();
let pinchStart = null;
let holdTimer = null;
let suppressTap = false;

canvas.addEventListener("pointerdown", e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() });
  if (pointers.size === 2) {
    stopHold();
    clearTimeout(holdTimer);
    const [a, b] = [...pointers.values()];
    pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.cam.zoom };
  } else if (pointers.size === 1) {
    suppressTap = false;
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const tx = Math.floor(wx), ty = Math.floor(wy);
    clearTimeout(holdTimer);
    if (mode.name === "pan") {
      holdTimer = setTimeout(() => {
        const p = pointers.get(e.pointerId);
        if (p && !p.moved && pointers.size === 1) {
          if (startHold(tx, ty)) suppressTap = true;
        }
      }, 230);
    }
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

  if (pointers.size === 1 && !hold.active) {
    const s = tilePx();
    state.cam.x -= dx / s;
    state.cam.y -= dy / s;
  } else if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 10) {
      state.cam.zoom = Math.min(2.5, Math.max(0.35, pinchStart.zoom * (d / pinchStart.d)));
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
  if (!p.moved && dur < 350 && !suppressTap && e.type === "pointerup") {
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    handleTap(Math.floor(wx), Math.floor(wy));
  }
  e.preventDefault();
}
canvas.addEventListener("pointerup", pointerEnd);
canvas.addEventListener("pointercancel", pointerEnd);

function handleTap(tx, ty) {
  if (mode.name === "place") { tryPlace(tx, ty); return; }
  if (mode.name === "demolish") { demolish(tx, ty); return; }
  const b = state.buildings[tx + "," + ty];
  if (b) { openBuildingSheet(tx, ty); return; }
  const t = tileAt(tx, ty);
  if (t && t.res) {
    toast(`${ITEMS[t.res].name}: ${fmt(t.left)} left — press & hold to mine`);
  } else if (t && t.core) {
    toast(`Core deposit — press & hold to crack it (${fmt(t.hp - t.dmg)} HP)`);
  }
}

// Belt & suspenders against browser gestures the CSS can't fully stop.
document.addEventListener("gesturestart", e => e.preventDefault());
document.addEventListener("gesturechange", e => e.preventDefault());
document.addEventListener("dblclick", e => e.preventDefault());
document.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
canvas.addEventListener("touchend", e => e.preventDefault(), { passive: false });

/* ============================== UI: chrome ============================== */

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  el("toasts").appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function initChrome() {
  el("version-badge").textContent = "v" + VERSION;
  el("version-popover").innerHTML =
    `<b>v${VERSION}</b> &mdash; ${VERSION_SNIPPET}<br><br>` +
    `<button class="btn ghost" id="reset-save">Reset save</button>`;
  el("version-badge").addEventListener("click", () => {
    el("version-popover").classList.toggle("hidden");
  });
  document.addEventListener("click", e => {
    const pop = el("version-popover");
    if (!pop.classList.contains("hidden") &&
        !pop.contains(e.target) && e.target !== el("version-badge")) {
      pop.classList.add("hidden");
    }
  });
  el("version-popover").addEventListener("click", e => {
    if (e.target.id === "reset-save") {
      if (confirm("Wipe your factory and start over?")) {
        localStorage.removeItem(SAVE_KEY);
        location.reload();
      }
    }
  });
  // static icons in chrome
  document.querySelectorAll("[data-icon]").forEach(span => {
    span.innerHTML = svgIcon(span.dataset.icon, "currentColor");
  });
  // tabs
  document.querySelectorAll("#bottombar .tab").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentSheet === btn.dataset.panel) closeSheet();
      else openSheet(btn.dataset.panel);
    });
  });
  el("sheet-close").addEventListener("click", closeSheet);
  el("placebar-cancel").addEventListener("click", () => setMode("pan"));
}

const INV_ORDER = Object.keys(ITEMS);

function updateTopbar() {
  el("rp-count").textContent = fmt(state.rp);
  const strip = el("inv-strip");
  let html = "";
  for (const id of INV_ORDER) {
    const n = invGet(id);
    if (n >= 1) html += `<div class="chip"><span class="chip-icon" style="color:${ITEMS[id].color}">${svgIcon(id in ITEMS ? ITEMS[id].icon : "ore", ITEMS[id].color)}</span>${fmt(n)}</div>`;
  }
  if (strip._html !== html) { strip.innerHTML = html; strip._html = html; }
}

/* ============================== UI: sheets ============================== */

let currentSheet = null;
let sheetContext = null; // for building sheet: {x, y}

function openSheet(name, ctx2) {
  currentSheet = name;
  sheetContext = ctx2 || null;
  el("sheet").classList.remove("hidden");
  document.querySelectorAll("#bottombar .tab").forEach(b =>
    b.classList.toggle("active", b.dataset.panel === name));
  renderSheet();
}

function closeSheet() {
  currentSheet = null;
  sheetContext = null;
  el("sheet").classList.add("hidden");
  document.querySelectorAll("#bottombar .tab").forEach(b => b.classList.remove("active"));
}

function costHtml(cost, rp) {
  let h = "";
  if (rp) h += `<span class="cost ${state.rp >= rp ? "" : "short"}">${svgIcon("flask", "currentColor")} ${fmt(rp)} RP</span>`;
  for (const k in cost) {
    h += `<span class="cost ${invGet(k) >= cost[k] ? "" : "short"}">${svgIcon(ITEMS[k].icon, ITEMS[k].color)} ${cost[k]} ${ITEMS[k].name}</span>`;
  }
  return h;
}

function renderSheet() {
  if (!currentSheet) return;
  const body = el("sheet-body");
  const title = el("sheet-title");
  if (currentSheet === "build") {
    title.textContent = "Build";
    let h = "";
    for (const id in BUILDINGS) {
      const b = BUILDINGS[id];
      const count = Object.values(state.buildings).filter(x => x.type === id).length;
      h += `<div class="card">
        <span class="card-icon">${svgIcon(b.icon, "#dfe8f2")}</span>
        <span class="card-main">
          <div class="card-title">${b.name}${count ? ` <span class="lvl">x${count}</span>` : ""}</div>
          <div class="card-sub">${b.desc}<br>${costHtml(b.cost)}</div>
        </span>
        <button class="btn" data-build="${id}" ${canAfford(b.cost) ? "" : "disabled"}>Place</button>
      </div>`;
    }
    h += `<div class="card">
      <span class="card-icon">${svgIcon("trash", "#e06060")}</span>
      <span class="card-main">
        <div class="card-title">Demolish</div>
        <div class="card-sub">Remove a building for a 50% refund.</div>
      </span>
      <button class="btn danger" data-demolish="1">Select</button>
    </div>`;
    body.innerHTML = h;
    body.querySelectorAll("[data-build]").forEach(btn =>
      btn.addEventListener("click", () => { setMode("place", btn.dataset.build); closeSheet(); }));
    body.querySelector("[data-demolish]").addEventListener("click", () => { setMode("demolish"); closeSheet(); });

  } else if (currentSheet === "tech") {
    title.textContent = "Tech";
    let h = "";
    for (const id in TECHS) {
      const t = TECHS[id];
      const lvl = techLvl(id);
      const done = !t.repeat && lvl > 0;
      const rpCost = t.repeat ? Math.round(t.baseCost * Math.pow(t.costGrowth, lvl)) : t.baseCost;
      const items = t.itemCost || {};
      const afford = !done && state.rp >= rpCost && canAfford(items);
      h += `<div class="card ${done ? "locked" : ""}">
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
         <div class="card-sub">Find a glowing core deposit out in the world and press &amp; hold to crack it. Each one grants a choice of 1 of 3 permanent stacking upgrades.</div></span></div>`;

  } else if (currentSheet === "inv") {
    title.textContent = "Storage";
    const rows = INV_ORDER.filter(id => invGet(id) >= 1);
    body.innerHTML = rows.length
      ? rows.map(id => `<div class="card">
          <span class="card-icon">${svgIcon(ITEMS[id].icon, ITEMS[id].color)}</span>
          <span class="card-main"><div class="card-title">${ITEMS[id].name}</div></span>
          <span class="card-title">${fmt(invGet(id))}</span>
        </div>`).join("")
      : `<div class="card"><span class="card-main"><div class="card-sub">Nothing yet — press &amp; hold a resource tile to mine it by hand.</div></span></div>`;

  } else if (currentSheet === "building") {
    const b = state.buildings[sheetContext.x + "," + sheetContext.y];
    if (!b) { closeSheet(); return; }
    const spec = BUILDINGS[b.type];
    title.textContent = spec.name;
    let h = "";
    if (b.type === "drill") {
      const t = tileAt(b.x, b.y);
      h += `<div class="card"><span class="card-icon">${svgIcon(spec.icon, "#dfe8f2")}</span>
        <span class="card-main"><div class="card-title">${t && t.res ? ITEMS[t.res].name : "Exhausted"}</div>
        <div class="card-sub">${t && t.res ? `${fmt(t.left)} left in tile<br>Rate: ${(BUILDINGS.drill.baseRate * drillSpeedMult() * drillYieldMult()).toFixed(2)}/s` : "This tile is mined out."}</div></span></div>`;
    } else {
      const recipes = Object.keys(RECIPES).filter(rid =>
        RECIPES[rid].machine === b.type && (!RECIPES[rid].needsTech || techLvl(RECIPES[rid].needsTech)));
      h += `<div class="card"><span class="card-main">
        <div class="card-title">Recipe</div>
        <div class="recipe-row">` +
        recipes.map(rid => {
          const r = RECIPES[rid];
          const outIcon = r.rp ? "flask" : ITEMS[Object.keys(r.out)[0]].icon;
          const outColor = r.rp ? "#8ab4f0" : ITEMS[Object.keys(r.out)[0]].color;
          return `<button class="recipe-pick ${b.recipe === rid ? "sel" : ""}" data-recipe="${rid}">${svgIcon(outIcon, outColor)} ${r.name}</button>`;
        }).join("") +
        `</div>
        <div class="card-sub" style="margin-top:10px">${recipeDesc(b)}</div>
      </span></div>`;
    }
    h += `<div class="card"><span class="card-icon">${svgIcon("trash", "#e06060")}</span>
      <span class="card-main"><div class="card-sub">Demolish for a 50% refund.</div></span>
      <button class="btn danger" data-demo="1">Demolish</button></div>`;
    body.innerHTML = h;
    body.querySelectorAll("[data-recipe]").forEach(btn =>
      btn.addEventListener("click", () => {
        b.recipe = btn.dataset.recipe;
        b.crafting = false; b.progress = 0;
        renderSheet();
      }));
    body.querySelector("[data-demo]").addEventListener("click", () => {
      demolish(b.x, b.y);
      setMode("pan");
      closeSheet();
    });
  }
}

function recipeDesc(b) {
  const r = RECIPES[b.recipe];
  if (!r) return "";
  const ins = Object.keys(r.in).map(k => `${r.in[k]} ${ITEMS[k].name}`).join(" + ");
  const outs = r.rp ? `${r.rp} RP` : Object.keys(r.out).map(k => `${r.out[k]} ${ITEMS[k].name}`).join(" + ");
  const t = (r.time / machineSpeed(b.type)).toFixed(1);
  return `${ins} &rarr; ${outs} every ${t}s`;
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
  toast(t.name + (t.repeat ? " Lv " + (lvl + 1) : "") + " researched");
  if (navigator.vibrate) navigator.vibrate(15);
  saveGame();
  renderSheet();
}

/* ============================== main loop ============================== */

let lastT = 0;
let uiTimer = 0;
let sheetTimer = 0;

function frame(t) {
  const dt = Math.min(0.25, (t - lastT) / 1000 || 0);
  lastT = t;
  tick(dt);
  render();
  uiTimer += dt;
  if (uiTimer > 0.25) { uiTimer = 0; updateTopbar(); }
  sheetTimer += dt;
  // live-refresh affordability in open sheets (not the building one; it has its own interactions)
  if (sheetTimer > 1 && (currentSheet === "build" || currentSheet === "tech")) {
    sheetTimer = 0;
    if (!el("sheet-body").querySelector(":active")) renderSheet();
  }
  requestAnimationFrame(frame);
}

/* ============================== boot ============================== */

function boot() {
  state = loadGame() || freshState();
  resize();
  initChrome();
  updateTopbar();
  if (!state.seenIntro) {
    state.seenIntro = true;
    setTimeout(() => toast("Press & hold an ore tile to mine it"), 600);
    setTimeout(() => toast("Drag to pan — pinch to zoom"), 3400);
    saveGame();
  }
  setInterval(saveGame, 5000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
  window.addEventListener("pagehide", saveGame);
  requestAnimationFrame(frame);
}

boot();
