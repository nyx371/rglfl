# GRIDFORGE

A mobile-first Factorio-like factory game in pure vanilla JS. Pan an infinite
procedurally generated ore field, press-and-hold to mine, place drills,
smelters, assemblers and labs, research an exponential tech tree, and crack
rare core deposits for 1-of-3 roguelike stacking perks.

**Play:** https://nyx371.github.io/rglfl/ (GitHub Pages, served from `main`)

- Design doc: [GAME_DESIGN.md](GAME_DESIGN.md)
- No build step, no dependencies. `index.html` + `style.css` + `js/`.
- Icons are SVG path data from [game-icons.net](https://game-icons.net)
  (CC BY 3.0 — lorc, delapouite, faithtoken).

## Developing

Serve the folder with any static server (`python3 -m http.server`) and open it
on a phone or in mobile emulation.

**Before every push:** run `tools/bump-cache.sh` to rewrite the `?v=` cache
stamps in `index.html`, then commit. This keeps GitHub Pages caches honest.
