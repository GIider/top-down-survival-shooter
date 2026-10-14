#!/usr/bin/env node
// Headless balance harness.
//   node scripts/balance.mjs --bots idle,novice:gun,average:gun,expert:gun --seeds 20 --duration 600
//   node scripts/balance.mjs --bots average:gun --seeds 30 --sweep enemies.spawn.weights.mortar.weight=0,8,16
//   node scripts/balance.mjs --bots average:gun --seeds 30 --perks gun-triple-shot,shout-stun
//   --override path=value (repeatable)  --out report.json  --perk-lift (per-perk lift from random-perk runs)  --workers N
import { writeFileSync } from "node:fs";
import os from "node:os";
import { runJobs } from "../src/sim/batch.js";

function parseArgs(argv) {
  const args = { bots: ["average:gun"], seeds: 10, duration: 600, overrides: {}, sweep: null, perks: [], perkLift: false, out: null, workers: Math.max(1, os.cpus().length - 1) };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => argv[++i];
    if (key === "--bots") args.bots = next().split(",");
    else if (key === "--seeds") args.seeds = Number(next());
    else if (key === "--duration") args.duration = Number(next());
    else if (key === "--override") {
      const [p, v] = next().split("=");
      args.overrides[p] = Number(v);
    } else if (key === "--sweep") {
      const [p, v] = next().split("=");
      args.sweep = { path: p, values: v.split(",").map(Number) };
    } else if (key === "--perks") args.perks = next().split(",");
    else if (key === "--perk-lift") args.perkLift = true;
    else if (key === "--out") args.out = next();
    else if (key === "--workers") args.workers = Number(next());
    else throw new Error(`Unknown argument ${key}`);
  }
  return args;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

function summarize(runs) {
  const times = runs.map((r) => r.timeSurvived).sort((a, b) => a - b);
  return {
    runs: runs.length,
    survivedMedian: pct(times, 0.5),
    survivedP10: pct(times, 0.1),
    survivedP90: pct(times, 0.9),
    survivedMean: mean(times),
    kills: mean(runs.map((r) => r.kills)),
    level: mean(runs.map((r) => r.level)),
    bossKills: mean(runs.map((r) => r.bossKills)),
    reachedBoss: runs.filter((r) => r.firstBossTime !== null).length / runs.length,
    peakEnemies: mean(runs.map((r) => r.peakEnemies)),
    survivedRate: runs.filter((r) => !r.died).length / runs.length,
  };
}

function play(bot, args, overrides, forcedPerk) {
  const jobs = [];
  for (let seed = 1; seed <= args.seeds; seed += 1) {
    jobs.push({ bot, forcedPerk, seed, duration: args.duration, overrides });
  }
  return runJobs(jobs, { workers: args.workers });
}

function printTable(rows) {
  const cols = Object.keys(rows[0]);
  const fmt = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => fmt(r[c]).length)));
  console.log(cols.map((c, i) => c.padEnd(widths[i])).join("  "));
  rows.forEach((r) => console.log(cols.map((c, i) => fmt(r[c]).padEnd(widths[i])).join("  ")));
}

const args = parseArgs(process.argv.slice(2));
await (async () => {
const report = { args, tiers: [], sweep: [], perks: [], perkLift: [] };
const configs = args.sweep
  ? args.sweep.values.map((v) => ({ label: `${args.sweep.path}=${v}`, overrides: { ...args.overrides, [args.sweep.path]: v } }))
  : [{ label: "baseline", overrides: args.overrides }];

for (const cfg of configs) {
  const rows = [];
  for (const spec of args.bots) {
    const runs = await play(spec, args, cfg.overrides);
    const row = { config: cfg.label, bot: spec, ...summarize(runs) };
    rows.push(row);
    (args.sweep ? report.sweep : report.tiers).push(row);
    if (args.perkLift && spec !== "idle") {
      // lift of each perk: mean survival of runs owning it vs. not, across seeds
      const stats = new Map();
      runs.forEach((r) => r.perks.forEach((id) => (stats.get(id) ?? stats.set(id, []).get(id)).push(r.timeSurvived)));
      const overall = mean(runs.map((r) => r.timeSurvived));
      stats.forEach((times, id) => {
        if (times.length >= 3) report.perkLift.push({ bot: spec, perk: id, picked: times.length, meanSurvived: mean(times), liftVsAll: mean(times) - overall });
      });
    }
  }
  console.log(`\n== ${cfg.label} ==`);
  printTable(rows.map(({ config, ...rest }) => rest));
}

if (args.perks.length) {
  for (const spec of args.bots.filter((b) => b !== "idle")) {
    const baseRuns = await play(spec, args, args.overrides);
    const baseTimes = baseRuns.map((r) => r.timeSurvived);
    for (const perkId of args.perks) {
      const runs = await play(spec, args, args.overrides, perkId);
      const diffs = runs.map((r, i) => r.timeSurvived - baseTimes[i]);
      const ci = 1.96 * (sd(diffs) / Math.sqrt(diffs.length));
      report.perks.push({ bot: spec, perk: perkId, deltaSurvived: mean(diffs), ci95: ci, baseline: mean(baseTimes) });
    }
  }
  console.log("\n== forced-perk A/B (paired seeds, delta seconds vs baseline) ==");
  printTable(report.perks);
}

if (args.perkLift && report.perkLift.length) {
  console.log("\n== perk lift (observational) ==");
  printTable(report.perkLift.sort((a, b) => b.liftVsAll - a.liftVsAll));
}

if (args.out) {
  writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${args.out}`);
}

})();
