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

- **Enemy showcase**  
  https://giider.github.io/top-down-survival-shooter/showcase.html

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
* Enemy showcase: `dist/showcase.html`

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
