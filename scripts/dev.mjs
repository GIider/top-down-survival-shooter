// Dev server: rebuilds dist/ when src/ changes and serves it with live reload.
// Usage: npm run dev [-- --port 8000 --host 0.0.0.0]
import { spawn } from "node:child_process";
import { createReadStream, watch } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const srcDir = path.join(rootDir, "src");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const port = Number(argValue("port", process.env.PORT || 8000));
const host = argValue("host", "0.0.0.0");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const RELOAD_SNIPPET = `<script>new EventSource("/__reload").onmessage=()=>location.reload();</script>`;

const clients = new Set();
let building = false;
let rebuildQueued = false;
let debounce = null;

function build() {
  if (building) {
    rebuildQueued = true;
    return;
  }
  building = true;
  const started = Date.now();
  // BUILD_NUMBER keeps the build counter file from being bumped on every save.
  const child = spawn(process.execPath, [path.join(rootDir, "scripts", "build.mjs")], {
    cwd: rootDir,
    env: { ...process.env, BUILD_NUMBER: process.env.BUILD_NUMBER || "0" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  child.on("exit", (code) => {
    building = false;
    if (code === 0) {
      console.log(`[dev] rebuilt in ${Date.now() - started}ms`);
      clients.forEach((res) => res.write("data: reload\n\n"));
    } else {
      console.error("[dev] build failed (see error above); serving the previous build");
    }
    if (rebuildQueued) {
      rebuildQueued = false;
      build();
    }
  });
}

watch(srcDir, { recursive: true }, () => {
  clearTimeout(debounce);
  debounce = setTimeout(build, 120);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/__reload") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }
  const filePath = path.join(distDir, path.normalize(pathname));
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error("not a file");
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const headers = { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" };
  if (ext === ".html") {
    const chunks = [];
    createReadStream(filePath)
      .on("data", (chunk) => chunks.push(chunk))
      .on("end", () => {
        const html = Buffer.concat(chunks).toString("utf8");
        const body = html.includes("</body>") ? html.replace("</body>", `${RELOAD_SNIPPET}</body>`) : html + RELOAD_SNIPPET;
        res.writeHead(200, headers).end(body);
      });
    return;
  }
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`[dev] serving dist/ on port ${port}, rebuilding on src/ changes`);
  console.log(`[dev]   local:   http://localhost:${port}/game.html`);
  Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === "IPv4" && !net.internal)
    .forEach((net) => console.log(`[dev]   network: http://${net.address}:${port}/game.html`));
});

build();
