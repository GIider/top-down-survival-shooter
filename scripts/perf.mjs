#!/usr/bin/env node
// Headless update-loop benchmark (no rendering).
//   node scripts/perf.mjs [--bot expert:gun] [--seed 1] [--duration 300] [--scenario normal|stress|all]
//                         [--out before.json] [--compare before.json]
// Run with `node --expose-gc scripts/perf.mjs` for steadier heap numbers.
import { readFileSync, writeFileSync } from "node:fs";
import { createBot } from "../src/sim/bots/policies.js";
import { applyConfigOverrides } from "../src/sim/configOverrides.js";
import { createBotSession, SIM_DT } from "../src/sim/runGame.js";
import { withSeededRandom } from "../src/sim/seededRandom.js";

const SCENARIOS = {
  normal: {},
  stress: {
    "enemies.spawn.maxEnemiesBase": 120,
    "enemies.spawn.maxEnemiesStageScale": 20,
    "enemies.spawn.maxEnemiesDifficultyScale": 20,
    "enemies.spawn.rateBase": 3,
  },
};

function parseArgs(argv) {
  const args = { bot: "expert:gun", seed: 1, duration: 300, scenario: "all", out: null, compare: null };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => argv[++i];
    if (key === "--bot") args.bot = next();
    else if (key === "--seed") args.seed = Number(next());
    else if (key === "--duration") args.duration = Number(next());
    else if (key === "--scenario") args.scenario = next();
    else if (key === "--out") args.out = next();
    else if (key === "--compare") args.compare = next();
    else throw new Error(`Unknown argument ${key}`);
  }
  return args;
}

function createStageProfiler() {
  const totals = new Map();
  let last = 0;
  return {
    totals,
    begin() {
      last = performance.now();
    },
    mark(name) {
      const now = performance.now();
      totals.set(name, (totals.get(name) ?? 0) + (now - last));
      last = now;
    },
  };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

function runScenario(name, overrides, args) {
  const restore = applyConfigOverrides(overrides);
  try {
    return withSeededRandom(args.seed, () => {
      const session = createBotSession({ seed: args.seed, bot: createBot(args.bot) });
      const profiler = createStageProfiler();
      session.game.ctx.profiler = profiler;
      const frames = Math.ceil(args.duration / SIM_DT);
      const times = new Float64Array(frames);
      let n = 0;
      let peak = { enemies: 0, projectiles: 0, effects: 0, floatingTexts: 0 };
      globalThis.gc?.();
      const heap0 = process.memoryUsage().heapUsed;
      let allocated = 0;
      let lastHeap = heap0;
      for (; n < frames; n += 1) {
        const t0 = performance.now();
        const alive = session.step();
        times[n] = performance.now() - t0;
        const gs = session.game.gameState;
        peak.enemies = Math.max(peak.enemies, gs.enemies.length);
        peak.projectiles = Math.max(peak.projectiles, gs.projectiles.length);
        peak.effects = Math.max(peak.effects, gs.effects.length);
        peak.floatingTexts = Math.max(peak.floatingTexts, gs.floatingTexts.length);
        if (n % 60 === 0) {
          const heap = process.memoryUsage().heapUsed;
          if (heap > lastHeap) allocated += heap - lastHeap; // GC drops are ignored, so this is a lower bound
          lastHeap = heap;
        }
        if (!alive) {
          n += 1;
          break;
        }
      }
      const sorted = Array.from(times.subarray(0, n)).sort((a, b) => a - b);
      const sum = sorted.reduce((s, x) => s + x, 0);
      const stages = {};
      profiler.totals.forEach((ms, key) => (stages[key] = +(ms / n).toFixed(4)));
      return {
        scenario: name,
        frames: n,
        simSeconds: +(n * SIM_DT).toFixed(1),
        avgMs: +(sum / n).toFixed(4),
        p95Ms: +pct(sorted, 0.95).toFixed(4),
        p99Ms: +pct(sorted, 0.99).toFixed(4),
        maxMs: +sorted[n - 1].toFixed(4),
        framesOver4ms: sorted.filter((t) => t > 4).length,
        heapGrowthMB: +(allocated / 1048576).toFixed(1),
        peak,
        stagesAvgMs: stages,
        died: n < frames,
      };
    });
  } finally {
    restore();
  }
}

const args = parseArgs(process.argv.slice(2));
const names = args.scenario === "all" ? Object.keys(SCENARIOS) : [args.scenario];
const results = names.map((name) => {
  if (!SCENARIOS[name]) throw new Error(`Unknown scenario ${name}`);
  return runScenario(name, SCENARIOS[name], args);
});
const baseline = args.compare ? JSON.parse(readFileSync(args.compare, "utf8")) : null;

for (const r of results) {
  const base = baseline?.results.find((b) => b.scenario === r.scenario);
  const delta = (key) => (base ? ` (${(((r[key] - base[key]) / base[key]) * 100).toFixed(0)}%)` : "");
  console.log(`\n== ${r.scenario} (${r.frames} frames, ${r.simSeconds}s sim${r.died ? ", bot died" : ""}) ==`);
  console.log(`avg ${r.avgMs}ms${delta("avgMs")}  p95 ${r.p95Ms}ms${delta("p95Ms")}  p99 ${r.p99Ms}ms  max ${r.maxMs}ms  >4ms: ${r.framesOver4ms}`);
  console.log(`heap growth ${r.heapGrowthMB}MB  peaks ${JSON.stringify(r.peak)}`);
  Object.entries(r.stagesAvgMs)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v.toFixed(4)}ms${base?.stagesAvgMs[k] ? ` (${(((v - base.stagesAvgMs[k]) / base.stagesAvgMs[k]) * 100).toFixed(0)}%)` : ""}`));
}
if (args.out) {
  writeFileSync(args.out, JSON.stringify({ args, results }, null, 2));
  console.log(`\nWrote ${args.out}`);
}
