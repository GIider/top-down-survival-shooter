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
