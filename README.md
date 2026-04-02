# Top-Down Survival Shooter

A browser-based top-down survival shooter built with JavaScript and bundled into a single deployable HTML file.

## Play the latest version

https://giider.github.io/top-down-survival-shooter/

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
npm run build
```

The build output is written to `dist/index.html`.

## Release and deployment

GitHub Actions builds on pushes to `main`, creates/updates a `latest` release artifact, and deploys the `dist/` output to GitHub Pages.
