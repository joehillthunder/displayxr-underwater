# Underwater Worlds 3D

An educational underwater exploration app for DisplayXR (glasses-free 3D on Leia displays, 2D in
any browser). You swim first-person through ten dive sites, photograph creatures and landmarks to
fill a field guide, read the facts, and take a short quiz per site. Plain ES modules, no build step,
no package.json. GitHub Pages serves the `main` branch root:
https://joehillthunder.github.io/displayxr-underwater/ . There is no CI, so test before you push.

## The ten sites (shallow → deep, then legend)

`reef` Great Barrier Reef · `kelp` Monterey kelp forest · `arctic` under the Arctic sea ice ·
`baikal` Lake Baikal · `amazon` flooded Amazon forest · `blue` open ocean off Tonga · `cenote`
Yucatán cave · `deep` twilight/midnight zone and hydrothermal vents (submersible) · `trench`
Challenger Deep (submersible) · `atlantis` Plato's legend.

## Layout

| File | Role |
|---|---|
| `index.html` | All CSS and DOM: home (site cards + passport), HUD (dive computer, field guide, toolbar), find card, quiz, help. Import map (three 0.161.0, inline3d 1.45.1, jsDelivr). |
| `js/main.js` | Boot, site loading/disposal, swim controls (keys, mouse, touch), picking/photographs, guide orb, tour mode, quiz, progress (localStorage `uw3d.*`), audio, `window.dive`. |
| `js/stage.js` | DisplayXR rig (attach pattern, one persistent canvas, double-width woven buffer, 2D fallback). First-person: `focusDist` = distance to what you look at. |
| `js/water.js` | Fog, sky dome, surface from below (Snell's window), god rays, caustics (`addCaustics`), particles, exhaled bubbles, `heightfield()` floors and ceilings. |
| `js/models.js` | Procedural models (no assets): `fishGeo`, `mammalGeo`, `rayGeo`, `turtleGeo`, `jellyGeo`, `octopusGeo`, `squidGeo`, `eelGeo`, corals, kelp, rocks… merged into one geometry with vertex colours. `swimMat()` animates them on the GPU. |
| `js/life.js` | Behaviours: `Swimmer` (wander/circle/hover/surface/crawl/drift, shy or curious) and `School` (one InstancedMesh, boids-lite, parts around the diver). Also the registry of findables. |
| `js/sites/common.js` | `createContext()`: the API a site builds with (`floor`, `ceiling`, `swimmer`, `school`, `prop`, `scatter`, `find`, `tick`, `light`, `dispose`) and `SITE_MODULES` (lazy imports). |
| `js/sites/<id>.js` | One file per site: `env` (water look) + `build(ctx)` placing terrain, props and creatures, and setting `ctx.start`, `ctx.bounds`, `ctx.tour` (optional `ctx.depthAt`, `ctx.obstacles`). |
| `js/data.js` | Every fact: sites, finds, quizzes. The UI reads only this. |
| `js/labels.js` | Text sprites with real depth (copied from Solar System 3D). |

## Conventions and gotchas

- **Units are metres.** y = 0 is the water surface; the floor is negative. The dive computer shows
  `site.depth.top + (surface - y)` unless the site sets `ctx.depthAt(y)`. `deep` (600-2,500 m)
  and `trench` (7,800-10,935 m) squeeze their range into the swimmable volume, and their blurbs say so.
- **env fields** (water.js `configure`): fog/density, dome colours, lights, `surface` (y or null),
  `rays`/`rayCenter`, `caustics`, `particles`, `lamp` (diver/sub light), `sub` (porthole, no
  bubbles), `song` (whale song), `lightAt(d)`, `tempAt(pos)`, `edgeText`, `exposure`.
- **Collision:** floor and roof heightfields (`ctx.floorAt` / `ctx.ceilAt`) for everything; the
  diver also slides around `ctx.obstacles` ([x, z, r] cylinders, the Amazon tree trunks). Don't
  fake obstacles by raising `floorAt`: swimmers are clamped between floor and roof and would pop
  out of the water.
- **Model axes:** head at +z, back at +y, length centred on 0. `Object3D.lookAt` points +z at the
  target, which is what swimmers use.
- **swimMat modes:** `fish` (side-to-side, grows toward the tail), `whale` (up-down), `flap` (|x|
  beyond `span0` beats; rays, turtles, sea angels), `pulse` (bell squeezes, below-y=0 parts trail;
  jellies, octopuses), `sway` (rooted at y = 0; kelp, grass, tube worms). Every geometry using it
  must have the `glow` attribute, so build it through `Parts`.
- Each material gets its own uniforms (`m.userData.u`); cache key is `swim<mode>` (+`|caustic`).
  Don't share a swim material between creatures that should not move in sync.
- Findables: every `data.js` find id must be registered by its site's `build` (via
  `ctx.find(id, object, radius)`), or it can never be photographed. `?selftest` checks this.
- Picking is ray vs. bounding sphere, not triangles, so small fish need a generous radius.
- Labels draw with `depthTest: false`; only show them near the diver.
- Facts are for kids and must be accurate and checkable. Legends (Atlantis, the Baikal gold) are
  labelled LEGEND. Use "about"/"up to" where numbers vary.

## Testing (demo PC: no Python or Node on PATH)

- A portable Node lives in an old session scratchpad; use it for `node --check` on copies of the
  modules renamed `.mjs`.
- Serve with a PowerShell `HttpListener` on a free port (8765 and 8790-8793 are often taken).
- `?site=<id>` opens a site directly, `?tour` starts the auto-tour, `?mono` forces 2D,
  `?depth=0-2`, `?selftest` loads every site and reports findables and errors to the console.
- Headless Chrome/Edge screenshots need `--use-angle=swiftshader --enable-unsafe-swiftshader`.
  Woven 3D can only be checked in the DisplayXR Browser on the Leia panel.
- Driving it over CDP (`--remote-debugging-port`) works well: `window.dive` exposes
  `{ stage, water, diver, ctx, site, loadSite, enterDive, goHome, photograph, pickFind, aimRay,
  found, selftest, tour }`. Before pushing a content change, run `?selftest` (every site loads,
  every data.js find is placed, no errors) and an aim audit (for each find instance, place the
  diver in front, aim with `pickFind(aimRay(null))` and check the right id comes back). Both
  passed for all 85 finds on 2026-10-14.
- Synthetic keys must go through `Input.dispatchKeyEvent`; the help dialog shows once per browser
  profile (`uw3d.helped`).

## Related

- HQ homepage room `underwater` in `joehillthunder/joehillthunder.github.io` (`home/demos.js` and a
  set piece in `home/office.js`). Use your own worktree there; the shared clone often has other
  sessions' uncommitted work.
