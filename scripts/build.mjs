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
const perkLibraryTemplateHtmlPath = path.join(rootDir, "src", "perk-library.template.html");
const showcaseTemplateHtmlPath = path.join(rootDir, "src", "showcase.template.html");
const skillsShowcaseTemplateHtmlPath = path.join(rootDir, "src", "skills-showcase.template.html");
const sourceCssPath = path.join(rootDir, "src", "style.css");
const staticPagesCssPath = path.join(rootDir, "src", "static-pages.css");
const sourceJsEntryPath = path.join(rootDir, "src", "main.js");
const showcaseJsEntryPath = path.join(rootDir, "src", "showcase", "main.js");
const skillsShowcaseJsEntryPath = path.join(rootDir, "src", "skills-showcase", "main.js");
const buildNumberPath = path.join(rootDir, "scripts", "build-number.json");
const outputGameSourceHtmlPath = path.join(distDir, "game.source.html");
const outputGameHtmlPath = path.join(distDir, "game.html");
const outputPerkLibrarySourceHtmlPath = path.join(distDir, "perk-library.source.html");
const outputPerkLibraryHtmlPath = path.join(distDir, "perk-library.html");
const outputShowcaseSourceHtmlPath = path.join(distDir, "showcase.source.html");
const outputShowcaseHtmlPath = path.join(distDir, "showcase.html");
const outputSkillsShowcaseSourceHtmlPath = path.join(distDir, "skills-showcase.source.html");
const outputSkillsShowcaseHtmlPath = path.join(distDir, "skills-showcase.html");
const outputStaticPagesCssPath = path.join(distDir, "static-pages.css");
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

function buildStaticPageNav(currentPage) {
  const links = [
    { href: "./game.html", label: "Play Game", key: "game" },
    { href: "./perk-library.html", label: "Perk Library", key: "perk-library" },
    { href: "./showcase.html", label: "Enemy Showcase", key: "showcase" },
    { href: "./skills-showcase.html", label: "Skill Showcase", key: "skills-showcase" },
  ];

  return links
    .map((link) => {
      const currentAttr = link.key === currentPage ? ' aria-current="page"' : "";
      return `<a href="${link.href}"${currentAttr}>${link.label}</a>`;
    })
    .join("\n");
}

function buildStaticPageHeader({ title, subtitle, currentPage }) {
  return `<section class="hero">
      <h1>${escapeHtml(title)}</h1>
      <p class="sub">${escapeHtml(subtitle)}</p>
      <nav class="top-links" aria-label="Static page navigation">
${buildStaticPageNav(currentPage)}
      </nav>
    </section>`;
}

function buildStaticPageFooter(appVersion) {
  return `<footer>
      Generated from game build ${escapeHtml(appVersion)}. <a href="https://github.com/GIider/top-down-survival-shooter">GitHub Repository</a>
    </footer>`;
}

function buildPerkLibraryParts() {
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

  return { navItems, sections };
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
        --bg: #0a0f14;
        --panel: #101922;
        --border: #243445;
        --text: #e8f2fa;
        --muted: #9fb5c7;
        --accent: #88e5b9;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at 8% -15%, #1e3448 0%, transparent 42%),
          radial-gradient(circle at 92% -10%, #2e1f2f 0%, transparent 36%),
          var(--bg);
      }
      .panel {
        width: min(760px, calc(100vw - 28px));
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 14px;
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
        background: rgba(12, 18, 25, 0.95);
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
        <a href="./skills-showcase.html">Skill Showcase</a>
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
  const [templateHtml, perkLibraryTemplateHtml, showcaseTemplateHtml, skillsShowcaseTemplateHtml, cssContent, staticPagesCssContent] = await Promise.all([
    readFile(templateHtmlPath, "utf8"),
    readFile(perkLibraryTemplateHtmlPath, "utf8"),
    readFile(showcaseTemplateHtmlPath, "utf8"),
    readFile(skillsShowcaseTemplateHtmlPath, "utf8"),
    readFile(sourceCssPath, "utf8"),
    readFile(staticPagesCssPath, "utf8"),
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

  const skillsShowcaseJsBundleResult = await build({
    entryPoints: [skillsShowcaseJsEntryPath],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    legalComments: "none",
    minify: false,
  });

  const skillsShowcaseJsBundle = skillsShowcaseJsBundleResult.outputFiles[0].text;
  const minifiedCssResult = await transform(cssContent, {
    loader: "css",
    minify: true,
    legalComments: "none",
  });

  const minifiedStaticPagesCssResult = await transform(staticPagesCssContent, {
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
    .replace(
      "__STATIC_SITE_HEADER__",
      buildStaticPageHeader({
        title: "Enemy Behavior Showcase",
        subtitle:
          "Animated mini-simulations of every enemy archetype. This page is documentation-only and does not affect game progression.",
        currentPage: "showcase",
      })
    )
    .replace("__STATIC_SITE_FOOTER__", buildStaticPageFooter(appVersion))
    .replace("<!-- __INLINE_SCRIPT__ -->", `  <script>\n${showcaseJsBundle}\n  </script>`);

  const skillsShowcaseSourceHtml = skillsShowcaseTemplateHtml
    .replace(/__APP_VERSION__/g, appVersion)
    .replace(
      "__STATIC_SITE_HEADER__",
      buildStaticPageHeader({
        title: "Skill Showcase",
        subtitle: "Looping skill demonstrations rendered with the game engine.",
        currentPage: "skills-showcase",
      })
    )
    .replace("__STATIC_SITE_FOOTER__", buildStaticPageFooter(appVersion))
    .replace("<!-- __INLINE_SCRIPT__ -->", `  <script>\n${skillsShowcaseJsBundle}\n  </script>`);

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

  const skillsShowcaseHtml = await minify(skillsShowcaseSourceHtml, {
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

  const perkLibraryParts = buildPerkLibraryParts();
  const perksSourceHtml = perkLibraryTemplateHtml
    .replace(/__APP_VERSION__/g, appVersion)
    .replace(
      "__STATIC_SITE_HEADER__",
      buildStaticPageHeader({
        title: "Perk Library",
        subtitle: "Automatically generated from perk metadata.",
        currentPage: "perk-library",
      })
    )
    .replace("__PERK_TAG_NAV__", perkLibraryParts.navItems)
    .replace("__PERK_LIBRARY_SECTIONS__", perkLibraryParts.sections)
    .replace("__STATIC_SITE_FOOTER__", buildStaticPageFooter(appVersion));
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
  await writeFile(outputSkillsShowcaseSourceHtmlPath, skillsShowcaseSourceHtml, "utf8");
  await writeFile(outputSkillsShowcaseHtmlPath, skillsShowcaseHtml, "utf8");
  await writeFile(outputStaticPagesCssPath, minifiedStaticPagesCssResult.code, "utf8");
  await writeFile(outputLandingHtmlPath, landingHtml, "utf8");

  console.log(
    `Build complete: dist/index.html + dist/game.html + dist/perk-library.html + dist/showcase.html + dist/skills-showcase.html (version ${appVersion})`
  );
}

runBuild().catch((error) => {
  console.error("Build failed:", error);
  process.exitCode = 1;
});
