import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";
import { minify } from "html-minifier-terser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const distDir = path.join(rootDir, "dist");
const templateHtmlPath = path.join(rootDir, "src", "index.template.html");
const sourceCssPath = path.join(rootDir, "src", "style.css");
const sourceJsEntryPath = path.join(rootDir, "src", "main.js");
const buildNumberPath = path.join(rootDir, "scripts", "build-number.json");
const outputSourceHtmlPath = path.join(distDir, "index.source.html");
const outputHtmlPath = path.join(distDir, "index.html");

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
  const [templateHtml, cssContent] = await Promise.all([
    readFile(templateHtmlPath, "utf8"),
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
  const minifiedCssResult = await transform(cssContent, {
    loader: "css",
    minify: true,
    legalComments: "none",
  });

  const composedHtml = templateHtml
    .replace(/__APP_VERSION__/g, appVersion)
    .replace("__INLINE_CSS__", minifiedCssResult.code)
    .replace("<!-- __INLINE_SCRIPT__ -->", `  <script>\n${jsBundle}\n  </script>`);

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

  await mkdir(distDir, { recursive: true });
  await writeFile(outputSourceHtmlPath, composedHtml, "utf8");
  await writeFile(outputHtmlPath, minifiedHtml, "utf8");

  console.log(`Build complete: dist/index.source.html + dist/index.html (version ${appVersion})`);
}

runBuild().catch((error) => {
  console.error("Build failed:", error);
  process.exitCode = 1;
});
