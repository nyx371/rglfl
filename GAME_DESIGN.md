# GRIDFORGE — Game Design Document

A mobile-first factory/automation game in the spirit of Factorio, played entirely
by touch, running as a static vanilla-JS app on GitHub Pages.

**Current version: 1.1** — see [Version history](#version-history).

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
   techs × per-machine Mk levels × distance-scaled ore richness. Every system
   multiplies the others.
4. **Sessions of any size.** 30 seconds of tapping or an hour of factory layout
   both feel productive. State autosaves to localStorage.

## UI principles

These are binding on every screen; when a change violates one, the change is
wrong.

1. **A refusal must state its price.** Anything you cannot do right now shows
   exactly what it needs, in place — the radial's blocked options carry a cost
   pill listing each missing resource in red. Never "Not enough resources".
2. **Never say a thing twice.** One fact, one place: press-and-hold shows swing
   progress *only* in the ring, so the callout above the thumb carries just the
   amount remaining.
3. **Live, not snapshot.** Anything showing affordability re-evaluates while
   open — the radial ring lights up mid-mine as ore arrives, with no reopen.
4. **No instructions in menus.** The interface teaches itself through icons,
   costs and state. Copy is labels and numbers, never a tutorial. Exactly one
   first-run toast covers press-and-hold, which no icon can imply.
5. **Nothing moves under your thumb.** Lists are keyed to what you've *ever*
   held, in a fixed order, so a row never shifts position between glances —
   the Resources sheet keeps depleted items in place, dimmed at 0, rather
   than dropping them out and reflowing everything below.
6. **One dismissal at a time.** An open transient (the radial ring) swallows
   the next tap and closes; that tap does nothing else. You never open a thing
   by accident while closing another.
7. **The row is the button.** Where a list row has exactly one action, the
   whole row is the tap target; the button remains only as the affordance.
   Thumbs are wide and buttons are small.
8. **Show the whole answer, with the lightest mark that carries it.** Arming a
   build must answer "where can this go?" — but the answer is the relay aura,
   which already exists, so placement mode simply brightens it rather than
   washing every tile. (0.8 tinted each legal tile and outlined the region;
   correct information, far too much ink. Reach for the mark already on
   screen before adding a new one.)
9. **State the machine can't fix, the map must show.** A drill on a dead tile,
   or any machine starved for more than 20 seconds, carries a pulsing warning
   badge visible anywhere on screen — not only near the centre like the item
   badges — and joins the top-bar attention chip that cycles the camera
   through everything needing a look. A factory that has quietly stopped
   should announce itself, not wait to be audited.
10. **Feedback must survive repetition.** An effect that fires once is a
    flourish; the same effect across two hundred machines is a strobe. Machine
    output is a faint inner warmth and a 3% scale pop — never an outline flash.
11. **Remember the last choice, but never hand over a broken one.** Placing a
    machine reuses the recipe you last set on that machine type — unless it is
    tech-locked, or needs an input you have never held, in which case it falls
    back to the building default. Inheriting a recipe you cannot feed produces
    a row of machines that look built and do nothing.
12. **Bulk work deserves a bulk gesture.** A second finger changes the verb:
    with a build or demolish armed, a two-finger drag paints along its path
    instead of panning or zooming, so laying a relay chain or clearing a dead
    patch is one motion. Repetitive cleanup also gets a single button —
    "3 exhausted drills · Clear" leads the Build sheet whenever drills have
    run dry.
13. **One meaning, one mark.** Research points own the idea icon; the flask
    stays the craftable item. Reusing a symbol for two things makes a lab's
    overlay ambiguous with its own ingredient.

## Game feel

Every action gets physical feedback, all of it cheap canvas work:

- **Particles.** World-space sparks in the item's own color: a small puff per
  drill output, a bigger one per hand-mined swing, gold on placement, grey on
  demolish. Capped at 320 and budget-gated so a large factory can't flood them.
- **Screen shake.** Scales with the event — a nudge per swing, a jolt on
  placement, a hard kick when a core deposit cracks. Decays linearly.
- **Camera easing.** Recenter and offline-jump fly with an ease-out cubic over
  0.45s so you keep your bearings; touching the map cancels an in-flight move.
- **Machine pop.** Each output gives a faint gold inner wash and a 3% scale
  pulse; newly placed buildings scale in with a slight overshoot. Kept
  deliberately quiet so a large factory reads as busy, not flickering.
- **Core deposits breathe**, their glow and border pulsing so they read as
  special from across the map. On break, the modal is held back ~0.5s so the
  explosion lands first.
- **Press feedback.** Every button scales down on touch; sheets slide up,
  perk cards stagger in.

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
evenly.

**The ledger must be complete (1.1).** Stockpile holds a real bucket like any
consumer, and the invariant is that every bucket for an item sums to the stock
actually on the shelf. This is not bookkeeping neatness — machines gate on
credit, so any stock sitting *outside* the ledger is dead forever. That was a
real bug: 300 crystal flasks banked before Advanced Flasks was researched, with
a correctly configured lab and full coverage, produced nothing at all, because
credits were only ever issued at production time and the consumer did not exist
yet. A reconciliation pass runs once a second and is self-correcting in both
directions — un-ledgered stock is handed out along the current split, and stock
spent behind the ledger's back shrinks every bucket proportionally.

Two rules keep that pass honest:

- **Stockpile is sticky above zero.** Reconciliation must never re-derive the
  stockpile bucket from current stock, or a standing 50% stockpile would bleed
  away a slice every second (50 of 100, then 25 of 50, …) and never hold.
- **Stockpile at exactly zero releases.** Stock banked while an item had no
  consumer lands in Stockpile because there was nowhere else to put it, not
  because the player asked for it. A zero share means "set nothing aside", so
  the bucket drains to consumers — which is also what lowering the share to
  zero should visibly do.

Player spending (buildings, techs, upgrades) debits Stockpile first, which is
exactly what that share is set aside for, and only dips into consumer credit
once the stockpile is dry.

Reserves and allocation compose: a reserve is a hard floor on the *stock*,
allocation is a proportional split of the *flow*.

**Rates (0.2, corrected 1.0):** each item shows a smoothed **gross production**
rate — how fast it is being *made*, sampled from production events rather than
from stock deltas. Net-of-consumption was the original design and it read as
nonsense: a healthy plate line feeding assemblers showed a negative number,
punishing the player for the thing they built it to do. Consumption is already
legible through the allocation split, so the rate answers only "is this line
running?".

**Starvation census (1.0):** once a second the game counts machines that can't
start and what is holding each one — empty stock, or an allocation share that
hasn't credited them. The Resources sheet leads with the worst offender
("**7** idle · Iron Plate"), tagged with the split icon when the cause is
allocation rather than supply, which turns "why is nothing happening" into one
glance.

### Production tiers

Each tier gates the next behind both a tech and a further-out ore, so research
and expansion pull each other forward.

| Tier | Unlocked by | Key recipes | Research value |
|---|---|---|---|
| 1 — Basics | — | iron/copper plate, gear, wire, flask | 1 RP |
| 2 — Electronics | Electronics | circuit (1 iron plate + 3 wire) | — |
| 3 — Crystal | Crystal Drilling (ore ≥ 40 tiles out) | crystal flask | 10 RP |
| 4 — Steel | Steel Processing | steel plate (5 iron plate + 2 coal) | — |
| 5 — Titanium | Deep Drilling (ore ≥ 95 tiles out) | processor (2 circuit + 2 steel + 1 titanium) | — |
| 6 — Data | Data Analysis | data flask (1 processor + 1 crystal flask) | 120 RP |

### Machine Mk levels (0.6)

Once **Machine Overhaul** is researched, every individual machine can be
upgraded in place: each level doubles *that machine's* speed, and costs double
with it (10 steel + 5 circuits at Mk1→Mk2, doubling thereafter). Levels are
uncapped, so late-game optimisation becomes "which machine deserves the next
doubling" rather than "place another hundred smelters". The level shows on the
map and in the building sheet as Mk2, Mk3, …

### Tech tree
Research points (RP) come from labs. Two kinds of tech:
- **Repeatable multipliers** with exponential cost (×3 per level): drill speed,
  smelt speed, craft speed, research speed, manual mining. These never run out.
- **One-off unlocks:** Electronics, Crystal Drilling, Advanced Flasks, Blast
  Drilling (drill output ×2), Steel Processing, Machine Overhaul (per-machine
  Mk levels), Deep Drilling (titanium), Processors, Data Analysis. Costs run
  from 20 RP to 6000 RP, so the tree spans the whole game.

### Core Deposits (roguelike layer)
- Rare dense nodes; HP scales with distance from spawn.
- Damaged by press-and-hold mining (drills can't crack them in 0.1).
- On destruction: modal offers **1 of 3 perks** from a twelve-strong pool —
  drill/smelter/assembler/research speed ×2, manual mining ×3, 20% drill
  double-strike, +50% drill yield, double core damage, instant resource cache,
  half-price machine upgrades, crystal+titanium yield ×3, relay aura +3.
- Perks stack multiplicatively with each other and with techs — this is the
  engine of the crazy scaling.

### Persistence
Autosave to localStorage every few seconds and on tab hide. Save stores
inventory, RP, techs, perks, placed buildings, tile deltas, camera, and seed.

## UI layout

- **Top bar (0.9):** an attention chip (only when something is offline or a
  drill has run dry) above a single wrapping strip that leads with research
  points and then every discovered resource in fixed order, dimmed at zero.
  No collapse control — the strip is stable enough not to need one.
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
| 1.1 | Fixes stock that machines could never consume |
| 1.0 | Two-finger paint building, starvation hints, gross rates |
| 0.9 | RP in top bar, sticky recipes, exhausted drill warnings |
| 0.8 | Placement area preview, full-row taps, calmer machine flash |
| 0.7 | Particles, screen shake, eased camera, stable resource list |
| 0.6 | Steel, titanium, processors and per-machine Mk upgrades |
| 0.5 | Radial build menu and percentage resource allocation |
| 0.4 | Build menu, deep zoom, offline finder, subtle auras |
| 0.3 | Relay transfer grid, minimap, tap-to-build, menu tab |
| 0.2 | Mining callout, resource reserves, rates, structure badges |
| 0.1 | Drills, smelting, crafting, tech tree, core deposit perks |
