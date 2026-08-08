# GRIDFORGE — Game Design Document

A mobile-first factory/automation game in the spirit of Factorio, played entirely
by touch, running as a static vanilla-JS app on GitHub Pages.

**Current version: 0.5** — see [Version history](#version-history).

---

## Vision

Factorio's core loop — mine, smelt, craft, automate, research, expand — compressed
into something you can play one-handed on a phone. No player character: you are a
disembodied overseer panning across an infinite procedurally generated ore field.
Placement is tap-based, logistics are abstracted early (no belts in 0.1), and the
long game is driven by *crazy scaling*: exponential tech costs, multiplicative
stacking perks, and ore that gets richer the further you expand.

The roguelike twist: **Core Deposits** — huge, dense nodes scattered across the
world. Mining through one rewards a choice of 1 of 3 permanent upgrades, drawn
from a random pool. Runs stay fresh because your multiplier build path differs
every time.

## Design pillars

1. **Thumb-first.** Every interaction works with one finger: pan, pinch, tap,
   press-and-hold. No hover, no right-click, no keyboard.
2. **Automate or ache.** Manual mining (press-and-hold) works but is slow;
   the game constantly nudges you toward building the machine that does it for you.
3. **Numbers go vertical.** Multiplicative perk stacking × exponential repeatable
   techs × distance-scaled ore richness. Every system multiplies the others.
4. **Sessions of any size.** 30 seconds of tapping or an hour of factory layout
   both feel productive. State autosaves to localStorage.

## Core loop

```
press-hold mine → build drills → smelt plates → assemble parts
     ↑                                              ↓
perk choice ← crack core deposit ← expand outward ← research tech
```

## Systems (v0.1)

### World
- Infinite chunked grid, deterministic from a seed (value noise). Nothing is
  stored for untouched tiles; only deltas (depletion, buildings) are saved.
- Resource tiles: **iron ore, copper ore, coal, stone** near spawn; **crystal**
  appears further out. Each tile holds a finite (large) amount. Fields are
  deliberately sparse (0.3) — large stretches of open ground between patches
  make expansion routes and relay placement meaningful decisions.
- **Distance scaling:** tile richness grows with distance from spawn, so
  expansion is always worth the logistics pain.
- Guaranteed starter patches of iron/copper/coal/stone near spawn so the
  opening is never a dud roll.

### Interaction
- **Pan:** one-finger drag. **Zoom:** pinch. No player character.
- **Manual mine:** press-and-hold any resource tile; the tile highlights, a
  large progress ring extends well past the thumb, and a callout bubble above
  the finger shows the mined item, amount left, and swing progress (0.2 —
  sized so your own thumb never hides the feedback).
- **Build (0.3, expanded 0.4, radial in 0.5):** two complementary flows.
  *Tap-on-grid:* tapping a terrain tile pops a small **radial menu** of
  icon-only buttons around that tile — just the buildings valid there (ore
  tile → Drill or Relay; open ground → the rest), with a center chip naming
  the tile's contents. Unaffordable or out-of-range options are dimmed and
  explain themselves via toast when tapped. The backdrop is pass-through, so
  panning still works with the ring open. *Build menu:* the Build tab carries
  the full descriptions and costs; picking one enters repeat-placement mode
  (tap tiles until Done) — ideal for chaining relays. Demolish lives in the
  building sheet's header and refunds 50%.
- **Navigation (0.4):** the dedicated minimap is gone — instead the camera
  zooms out far enough (to 0.12x) that the world *becomes* the minimap, with
  a low-detail render mode (flat color fields, no icons) keeping it fast.
  A red chip in the top bar appears whenever buildings are offline and cycles
  the camera through them. Center-on-base lives in the Menu sheet.
- **Selection (0.4):** the tapped building or tile is marked with a dashed
  highlight while its sheet is open. Relay auras are barely visible by
  default; selecting a relay (or placing relays from the build menu) lights
  them up.
- Double-tap zoom, text selection, and the iOS long-press magnifier are all
  suppressed — long-press is a *game verb* here.

### Production chain
| Building | Placed on | Does |
|---|---|---|
| Drill | ore/coal/stone tile | mines the tile into global storage |
| Smelter | any free tile | ore + coal → plates |
| Assembler | any free tile | plates → gears, wire, circuits, flasks |
| Lab | any free tile | consumes flasks → research points (RP) |

### Transfer grid (0.3)

There is no magic global storage. A **Base Beacon** at spawn and placeable
**Relay** towers each project a circular aura; relays whose auras overlap link
up, and only the network connected back to the Base Beacon is *active*.
Buildings operate — drills mine, machines pull ingredients and push outputs —
only inside an active aura. Everything inside the connected grid shares one
resource pool (the "Resources" tab); buildings outside it sit offline with a
red outline until you chain relays out to them. Expanding the factory
therefore means expanding the grid, tower by tower. Relays must themselves be
placed inside existing coverage, so the grid always grows from the base
outward. The repeatable **Signal Boost** tech (+1 aura radius per level) makes
late-game grids exponentially cheaper per tile covered. Manual press-and-hold
mining still works anywhere — you carry what you dig.

Belts/inserters as a finer-grained logistics layer remain a candidate for a
later version.

**Reserves (0.2):** each item can have a reserve level (set via the lock button
in Storage: off/100/1k/10k/100k). Machines never consume an item below its
reserve, so you can stockpile e.g. gears for building labs while assemblers
keep running on the surplus. Player actions (placing buildings, buying techs)
ignore reserves — the stash is yours, it's only protected from automation.

### Allocation — the belt-free splitter (0.5)

**The problem.** With one shared pool and no belts, a single hungry consumer
eats an intermediate as fast as it is made. Iron plates vanish into gears the
instant they are smelted, so you can never bank plates for circuits or for
building. Factorio solves this with belts and splitters; that is far too
fiddly for a thumb.

**The solution: percentage shares per item.** Every item has a share table
listing each recipe that consumes it, plus a **Stockpile** entry. Production is
dealt out into those proportions:

- As an item is produced, each consumer is *credited* its share of the amount.
- A machine may only begin a craft if that recipe holds enough credit for the
  ingredients; starting one spends the credit.
- The Stockpile share is credited to nobody, so that fraction of production
  simply accumulates for you to spend on buildings by hand.

Set "50% Gear / 50% Stockpile" on iron plate and exactly half of every plate
smelted stays untouchable by assemblers. Set "70% Circuit / 30% Gear" and the
two lines split throughput in that ratio no matter which machine asks first.

**Why this shape.** It is one concept (a pie of percentages per item) instead
of a spatial routing puzzle; it reads at a glance as a stacked bar; it is
edited with ±  steppers rather than drag targets, so it works one-handed; and
it scales — a hundred assemblers behave like one line with one share.

Defaults are backwards compatible: every consuming recipe starts at weight 1
and Stockpile at 0, i.e. machines take everything and competing recipes split
evenly. Credits are capped per consumer (`max(100, stock)`) so an idle line
cannot bank forever and then drain a fresh stockpile in one burst.

Reserves and allocation compose: a reserve is a hard floor on the *stock*,
allocation is a proportional split of the *flow*.

**Rates (0.2):** the Storage sheet shows a smoothed net items/second next to
each item, so production vs. consumption balance is visible at a glance.

Recipes: iron plate (2 ore + 1 coal), copper plate (2 ore + 1 coal),
gear (2 iron plate), wire (1 copper plate → 2), circuit (1 iron plate + 3 wire,
tech-gated), flask (1 gear + 1 wire), crystal flask (1 circuit + 2 crystal,
tech-gated, worth 10 RP).

### Tech tree
Research points (RP) come from labs. Two kinds of tech:
- **Repeatable multipliers** with exponential cost (×3 per level): drill speed,
  smelt speed, craft speed, research speed, manual mining. These never run out.
- **One-off unlocks:** Electronics (circuits), Crystal Drilling (drills work on
  crystal), Advanced Flasks (10-RP crystal flasks), Blast Drilling (drill
  output ×2).

### Core Deposits (roguelike layer)
- Rare dense nodes; HP scales with distance from spawn.
- Damaged by press-and-hold mining (drills can't crack them in 0.1).
- On destruction: modal offers **1 of 3 perks** from a pool, e.g. drill speed ×2,
  smelter speed ×2, research ×2, manual mining ×3, 20% drill double-strike,
  +50% drill yield, core deposits take double damage, instant resource cache.
- Perks stack multiplicatively with each other and with techs — this is the
  engine of the crazy scaling.

### Persistence
Autosave to localStorage every few seconds and on tab hide. Save stores
inventory, RP, techs, perks, placed buildings, tile deltas, camera, and seed.

## UI layout

- **Top bar:** recenter button, inventory strip, collapse toggle, minimap.
  The strip wraps to multiple rows by default; the toggle collapses it to a
  single scrollable row (0.2).
- **Bottom tabs (0.3):** Tech / Perks / Resources / Menu. Research points and
  their rate live at the top of the Tech sheet. The Menu sheet holds the
  version + what's-new snippet, recenter, reset, and icon attribution — the
  version number is no longer shown on the map screen.
- **Structure badges (0.2, tuned 0.4):** buildings near the center of the
  screen get a small circular overlay showing the item they're currently
  mining/crafting, fading out toward the screen edges. Badges draw above all
  buildings, scale down with zoom, and vanish once tiles get small. Resource
  item/tile colors are pushed far apart (blue iron, orange copper, near-black
  coal, tan stone, cyan crystal) so fields read distinctly at any zoom.
- **Bottom bar:** Build / Tech / Perks / Inventory sheet toggles.
- **Sheets** slide up from the bottom and rest directly on the tab bar (which
  paints above them), so there is never a dead band of padding underneath.
  Heights use `dvh` so iOS Safari's collapsing toolbar can't strand the
  content. The map stays live behind them.
- All symbols are SVG path icons from [game-icons.net](https://game-icons.net)
  (CC BY 3.0 — authors: lorc, delapouite, faithtoken). No emojis, ever.

## Technical notes

- Vanilla JS, zero dependencies, static hosting on GitHub Pages from `main`.
- Canvas 2D renderer; icons drawn as `Path2D` from embedded game-icons path data.
- `index.html` references assets with `?v=<stamp>` query strings;
  `tools/bump-cache.sh` rewrites the stamp and **must be run before every push**
  so GitHub Pages caches never serve stale code.
- Gesture suppression: `touch-action: none`, `user-select: none`,
  `-webkit-touch-callout: none`, `gesturestart`/`dblclick`/`contextmenu`
  preventDefault, `viewport` meta with `user-scalable=no`.

## Roadmap

- **0.6** — storage caps, offline progress, allocation presets.
- **0.3** — power system, steel/advanced material tier, drill-vs-core mining.
- **0.4** — prestige loop ("re-seed the planet"), perk rarity tiers, biomes.
- **0.5** — sound, haptics, achievements, cloud save export.

## Version history

| Version | Snippet (shown in-game) |
|---|---|
| 0.5 | Radial build menu and percentage resource allocation |
| 0.4 | Build menu, deep zoom, offline finder, subtle auras |
| 0.3 | Relay transfer grid, minimap, tap-to-build, menu tab |
| 0.2 | Mining callout, resource reserves, rates, structure badges |
| 0.1 | Drills, smelting, crafting, tech tree, core deposit perks |
