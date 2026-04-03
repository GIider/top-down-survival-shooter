# Top-Down Survival Shooter

A browser-based top-down survival shooter built with JavaScript and bundled into a single deployable HTML file.

## Play the latest version

https://giider.github.io/top-down-survival-shooter/

Perk library page (spoilers):

https://giider.github.io/top-down-survival-shooter/perks/

### Debug Mode

Debug mode can be accessed by adding `?debug=1` to the URL: https://giider.github.io/top-down-survival-shooter?debug=1

## Project structure

- `src/` - Game source code (entities, systems, rendering, config)
- `scripts/build.mjs` - Build pipeline for producing the release artifact
- `dist/` - Build output

## Requirements

- Node.js
- npm

## Build

```bash
npm ci
npm run test:regression
npm run build
```

The build output is written to `dist/index.html`.
The generated perk library page is written to `dist/perks/index.html`.

## Release and deployment

GitHub Actions runs regression tests, builds on pushes to `main`, creates/updates a `latest` release artifact, and deploys the full `dist/` output (including `perks/`) to GitHub Pages.
