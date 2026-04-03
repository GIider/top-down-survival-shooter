import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";
import { minify } from "html-minifier-terser";
import { skillPerkCatalog } from "../src/systems/perks/skillPerkCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const distDir = path.join(rootDir, "dist");
const templateHtmlPath = path.join(rootDir, "src", "index.template.html");
const showcaseTemplateHtmlPath = path.join(rootDir, "src", "showcase.template.html");
const sourceCssPath = path.join(rootDir, "src", "style.css");
const sourceJsEntryPath = path.join(rootDir, "src", "main.js");
const showcaseJsEntryPath = path.join(rootDir, "src", "showcase", "main.js");
const buildNumberPath = path.join(rootDir, "scripts", "build-number.json");
const outputGameSourceHtmlPath = path.join(distDir, "game.source.html");
const outputGameHtmlPath = path.join(distDir, "game.html");
const outputPerkLibrarySourceHtmlPath = path.join(distDir, "perk-library.source.html");
const outputPerkLibraryHtmlPath = path.join(distDir, "perk-library.html");
const outputShowcaseSourceHtmlPath = path.join(distDir, "showcase.source.html");
const outputShowcaseHtmlPath = path.join(distDir, "showcase.html");
const outputLandingHtmlPath = path.join(distDir, "index.html");
const legacyPerksDirPath = path.join(distDir, "perks");

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPerkLibraryHtml(appVersion) {
  const sorted = [...skillPerkCatalog].sort((a, b) => a.name.localeCompare(b.name));
  const groups = new Map();

  for (let i = 0; i < sorted.length; i += 1) {
    const perk = sorted[i];
    const tags = Array.isArray(perk.tags) ? perk.tags : ["other"];
    for (let t = 0; t < tags.length; t += 1) {
      const tag = tags[t];
      if (!groups.has(tag)) {
        groups.set(tag, []);
      }
      groups.get(tag).push(perk);
    }
  }

  const navItems = [...groups.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((tag) => `<a href="#tag-${escapeHtml(tag)}">${escapeHtml(tag)}</a>`)
    .join("\n");

  const sections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, perks]) => {
      const cards = perks
        .map(
          (perk) => `
<article class="perk-card">
  <h3>${escapeHtml(perk.name)}</h3>
  <p>${escapeHtml(perk.description)}</p>
  <div class="meta">
    <span class="perk-id">${escapeHtml(perk.id)}</span>
    <span class="perk-tags">${perk.tags.map((entry) => `#${escapeHtml(entry)}`).join(" ")}</span>
  </div>
</article>`
        )
        .join("\n");

      return `
<section id="tag-${escapeHtml(tag)}" class="tag-section">
  <h2>${escapeHtml(tag)} <span>(${perks.length})</span></h2>
  <div class="perk-grid">
${cards}
  </div>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Perk Library</title>
    <style>
      :root {
        --bg: #0c1014;
        --bg-alt: #131a20;
        --card: #171f27;
        --text: #e9f1f5;
        --muted: #9eb4bf;
        --accent: #7bf0c6;
        --border: #22303b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--text);
        background: radial-gradient(circle at 15% -10%, #19303c 0, var(--bg) 45%), var(--bg);
      }
      .page {
        max-width: 1200px;
        margin: 0 auto;
        padding: 28px 18px 72px;
      }
      header {
        margin-bottom: 18px;
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: linear-gradient(120deg, rgba(123, 240, 198, 0.08), rgba(255, 255, 255, 0.02));
      }
      h1 { margin: 0 0 10px; font-size: 1.8rem; }
      .sub { color: var(--muted); margin: 0; }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 14px 0 24px;
      }
      nav a {
        text-decoration: none;
        color: var(--text);
        font-size: 0.88rem;
        border: 1px solid var(--border);
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--bg-alt);
      }
      nav a:hover { border-color: var(--accent); color: var(--accent); }
      .tag-section { margin: 26px 0 20px; }
      .tag-section h2 {
        margin: 0 0 12px;
        font-size: 1.15rem;
        text-transform: capitalize;
      }
      .tag-section h2 span { color: var(--muted); font-size: 0.95rem; }
      .perk-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 12px;
      }
      .perk-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 12px;
      }
      .perk-card h3 { margin: 0 0 8px; font-size: 1rem; }
      .perk-card p { margin: 0 0 10px; color: var(--muted); line-height: 1.35; font-size: 0.92rem; }
      .meta {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .perk-id {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        font-size: 0.8rem;
        color: #b6c9d2;
      }
      .perk-tags { color: var(--accent); font-size: 0.78rem; }
      footer { margin-top: 30px; color: var(--muted); font-size: 0.84rem; }
    </style>
  </head>
  <body>
    <main class="page">
      <header>
        <h1>Perk Library</h1>
        <p class="sub">Automatically generated from perk metadata. Version ${escapeHtml(appVersion)}.</p>
      </header>
      <nav>
${navItems}
      </nav>
${sections}
      <footer>
        Generated during build from src/systems/perks/skillPerkCatalog.js.
        <a href="./index.html">Back to launcher</a>
      </footer>
    </main>
  </body>
</html>`;
}

function buildLandingHtml(appVersion) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Top-Down Survival Shooter</title>
    <style>
      :root {
        --bg: #0d1218;
        --panel: #141d27;
        --border: #273647;
        --text: #e9f2f8;
        --muted: #a6bbc8;
        --accent: #7bf0c6;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--text);
        background: radial-gradient(circle at 15% -10%, #203447 0, var(--bg) 52%), var(--bg);
      }
      .panel {
        width: min(760px, calc(100vw - 28px));
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 22px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.7rem;
      }
      p {
        margin: 0 0 14px;
        color: var(--muted);
      }
      .links {
        display: grid;
        gap: 10px;
      }
      a {
        display: block;
        text-decoration: none;
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 12px 14px;
        background: #101923;
      }
      a:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
      .meta {
        margin-top: 14px;
        font-size: 0.85rem;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <h1>Top-Down Survival Shooter</h1>
      <p>Select a destination.</p>
      <div class="links">
        <a href="./game.html">Play Game</a>
        <a href="./perk-library.html">Perk Library</a>
        <a href="./showcase.html">Enemy Showcase</a>
        <a href="https://github.com/GIider/top-down-survival-shooter">GitHub Repository</a>
      </div>
      <div class="meta">Build version ${escapeHtml(appVersion)}</div>
    </main>
  </body>
</html>`;
}

async function readAndBumpBuildNumber() {
  let current = 0;

  try {
    const raw = await readFile(buildNumberPath, "utf8");
    const parsed = JSON.parse(raw);
    const value = Number(parsed?.buildNumber);
    if (Number.isFinite(value) && value >= 0) {
      current = Math.floor(value);
    }
  } catch {
    current = 0;
  }

  const next = current + 1;
  await writeFile(buildNumberPath, `${JSON.stringify({ buildNumber: next }, null, 2)}\n`, "utf8");
  return next;
}

async function runBuild() {
  // CI can pass BUILD_NUMBER env var (e.g. github.run_number) to avoid
  // mutating build-number.json during automated builds.
  let buildNumber;
  if (process.env.BUILD_NUMBER) {
    buildNumber = Number(process.env.BUILD_NUMBER);
  } else {
    buildNumber = await readAndBumpBuildNumber();
  }
  const appVersion = `0.${buildNumber}`;
  const [templateHtml, showcaseTemplateHtml, cssContent] = await Promise.all([
    readFile(templateHtmlPath, "utf8"),
    readFile(showcaseTemplateHtmlPath, "utf8"),
    readFile(sourceCssPath, "utf8"),
  ]);

  const jsBundleResult = await build({
    entryPoints: [sourceJsEntryPath],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    legalComments: "none",
    minify: false,
  });

  const jsBundle = jsBundleResult.outputFiles[0].text;

  const showcaseJsBundleResult = await build({
    entryPoints: [showcaseJsEntryPath],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    legalComments: "none",
    minify: false,
  });

  const showcaseJsBundle = showcaseJsBundleResult.outputFiles[0].text;
  const minifiedCssResult = await transform(cssContent, {
    loader: "css",
    minify: true,
    legalComments: "none",
  });

  const composedHtml = templateHtml
    .replace(/__APP_VERSION__/g, appVersion)
    .replace("__INLINE_CSS__", minifiedCssResult.code)
    .replace("<!-- __INLINE_SCRIPT__ -->", `  <script>\n${jsBundle}\n  </script>`);

  const showcaseSourceHtml = showcaseTemplateHtml
    .replace(/__APP_VERSION__/g, appVersion)
    .replace("<!-- __INLINE_SCRIPT__ -->", `  <script>\n${showcaseJsBundle}\n  </script>`);

  const minifiedHtml = await minify(composedHtml, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeOptionalTags: false,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    useShortDoctype: true,
    keepClosingSlash: true,
  });

  const showcaseHtml = await minify(showcaseSourceHtml, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeOptionalTags: false,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    useShortDoctype: true,
    keepClosingSlash: true,
  });

  await mkdir(distDir, { recursive: true });
  await rm(legacyPerksDirPath, { recursive: true, force: true });

  const perksSourceHtml = buildPerkLibraryHtml(appVersion);
  const perksHtml = await minify(perksSourceHtml, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeOptionalTags: false,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    useShortDoctype: true,
    keepClosingSlash: true,
  });

  const landingSourceHtml = buildLandingHtml(appVersion);
  const landingHtml = await minify(landingSourceHtml, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeOptionalTags: false,
    removeEmptyAttributes: true,
    minifyCSS: true,
    minifyJS: true,
    useShortDoctype: true,
    keepClosingSlash: true,
  });

  await writeFile(outputGameSourceHtmlPath, composedHtml, "utf8");
  await writeFile(outputGameHtmlPath, minifiedHtml, "utf8");
  await writeFile(outputPerkLibrarySourceHtmlPath, perksSourceHtml, "utf8");
  await writeFile(outputPerkLibraryHtmlPath, perksHtml, "utf8");
  await writeFile(outputShowcaseSourceHtmlPath, showcaseSourceHtml, "utf8");
  await writeFile(outputShowcaseHtmlPath, showcaseHtml, "utf8");
  await writeFile(outputLandingHtmlPath, landingHtml, "utf8");

  console.log(
    `Build complete: dist/index.html + dist/game.html + dist/perk-library.html + dist/showcase.html (version ${appVersion})`
  );
}

runBuild().catch((error) => {
  console.error("Build failed:", error);
  process.exitCode = 1;
});
