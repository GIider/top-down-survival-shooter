# 🎮 Top-Down Survival Shooter

A browser-based top-down survival shooter built with JavaScript and bundled into a single deployable HTML file.

👉 Play now:  
https://giider.github.io/top-down-survival-shooter/

---

## 🚀 Quick Access

- **Play latest version**  
  https://giider.github.io/top-down-survival-shooter/game.html

- **Perk library (⚠ spoilers)**  
  https://giider.github.io/top-down-survival-shooter/perk-library.html

---

## 🕹 Controls

| Action | Keyboard / Mouse | Controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Aim | Mouse | Right stick (with auto-aim) |
| Attack | Left click | RT |
| Switch weapon | 1 / 2 / 3 / 4 | D-pad left / right |
| Blink (hold, release to cast) | Q | LT |
| Shout (hold, release to cast) | E | RB |
| Fireball | F | Y |
| Reload | R | X |
| Cancel a held blink / shout | Click | B |
| Pause / resume / start run | Space | Start |

Menus: the perk modal, title, pause and game-over screens are fully navigable with a controller
(D-pad / left stick to move focus, A to confirm, B to go back). The perk library is mouse-only.

The game switches between keyboard/mouse and controller automatically based on the last input used.

### Controller auto-aim & settings

Open **Pause → Settings** to tune *Controller auto-aim snappiness* (0 = off, 10 = max, default 6).
Higher values widen the catch cone around the stick direction, pull harder toward the nearest enemy
and turn faster. The value is stored in `localStorage` and applies to controller aiming only.

---

## 👹 Bosses

Bosses are set pieces defined in `src/systems/bosses/` (catalog, triggers, spawn modifiers, attack-pattern primitives).
The schedule lives in `GAME_CONFIG.bosses.schedule` (`time`, `kills`, `level` or `custom` triggers). The first boss,
**The Kaleidoscope**, appears at 3:00 and every 6:00 after being defeated. While it lives, regular spawns are reduced
and restricted to chasers/slimes. In debug mode use **Pause → Debug → Spawn Kaleidoscope Boss**.

---

## 🛠 Debug Mode

Enable debug mode by appending the query parameter:

```

?debug=1

```

**Example:**  
https://giider.github.io/top-down-survival-shooter/game.html?debug=1

Debug mode also shows an overlay with FPS, update/render CPU time per frame (rolling average / worst of the last 120 frames) and entity counts.

---

## 📁 Project Structure

```

src/                # Game source (entities, systems, rendering, config)
src/core/input.js   # Keyboard, mouse and gamepad input (polls the pure gamepadMapper)
src/systems/autoAim.js  # Controller auto-aim
scripts/build.mjs   # Build pipeline
dist/               # Generated output

````

---

## 📦 Requirements

- Node.js  
- npm  

---

## 🔧 Build

```bash
npm ci
npm run test:regression
npm run build
````

**Output:**

* Launcher: `dist/index.html`
* Game: `dist/game.html`
* Perk library: `dist/perk-library.html`
* Sound lab: `dist/sound-showcase.html`
* Balance lab: `dist/sim-lab.html`

---

## 🚀 Deployment

Deployment is fully automated via GitHub Actions:

* Runs regression tests
* Builds on every push to `main`
* Updates the `latest` release artifact
* Deploys `dist/` to GitHub Pages

---

## 🧠 Notes

* The entire game is bundled into a single HTML file for easy deployment
* No backend required — runs entirely in the browser

## Balance testing

Bots play seeded, deterministic headless runs through the real game systems.

- CLI: `npm run balance -- --bots idle,average:gun,expert:gun --seeds 40 --duration 600`
  - `--sweep path=a,b,c`, `--override path=value`, `--perks id1,id2` (forced-perk A/B), `--perk-lift`, `--workers N`, `--out report.json`
  - Config paths address array entries by type, e.g. `enemies.spawn.weights.mortar.weight`. `pickups.<type>.<prop>` addresses the pickup catalog (e.g. `pickups.health.healAmount`).
  - Judge by median and p10/p90, not the mean: a few seeds survive to the cap and skew it (the mean is kept in the `--out` JSON). Use 40+ seeds; sweeps with fewer are mostly noise.
  - Per-run metrics include `firstBossTime`, `firstBossKillTime`, `damageBySource` and `killsByType`.
- Web UI: `dist/sim-lab.html` (Balance Lab) shows survival distributions, damage/kill breakdowns, perk lift, sweeps and a live "watch a bot" view. Query params: `?seeds=6&duration=120&bots=idle,average:gun&autorun=1`.
- Code: `src/core/simStep.js` (shared sim frame), `src/sim/` (headless game, bots, runner), `src/sim-lab/` (page).

## Performance testing

- `npm run perf -- --duration 120` times the headless update loop (no rendering) for a `normal` and a `stress` scenario and prints avg/p95/p99/max frame ms, per-stage ms, entity peaks and heap growth.
  - `--out before.json` saves a result, `--compare before.json` prints deltas against it; `--scenario normal|stress`, `--bot`, `--seed` select the run.
  - Stages come from the optional `ctx.profiler` hook in `src/core/simStep.js`; it costs nothing when unset.
- Render cost needs a browser: open the game with `?debug=1` and read the `rnd` / `upd` lines.
- Allocation profile: `node --heap-prof scripts/perf.mjs` (run once per scenario), then load the `.heapprofile` in Chrome DevTools → Memory.

### Balance targets and current state

Targets (gun bot, median survival, 40 seeds): novice ~45s, average ~150s and reaching the boss about half the time,
expert ~300s and beating it. Weapons should stay within ~15% of each other. `tests/regression/sim.regression.mjs`
enforces coarse versions of the tier bands.

Levers that actually move survival (found by sweeping): player base HP and the XP curve
(`player.baseHp`, `player.baseXpToNext`, `player.levelUpXpMultiplier`), and which ranged enemies unlock at which
stage (`enemies.spawn.weights[].minStage`, one stage = 45s). Single enemy-damage or spawn-rate tweaks barely move the
median, and no individual perk was a significant outlier in forced-perk A/B at 30 seeds.

Gotchas: forced-perk runs only apply the perk when the game offers it, so most seeds are unchanged and CIs are wide.
The sim keeps running after a bot reaches the boss, so cap `--duration` when you only care about the early game.

Boss threat: Kaleidoscope damage values were swept at 1x/1.5x/2x/3x. At 2x (current) the boss kills ~8% of expert and
~20% of average runs that reach it; 3x raises that to ~18% / ~36%. Fight length (~80s median kill time at 4000 HP) is
unaffected by damage.
