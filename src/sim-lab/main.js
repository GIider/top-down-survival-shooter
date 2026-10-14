import { GAME_CONFIG, CANVAS } from "../core/constants.js";
import { createRenderer } from "../core/renderer.js";
import { sfx } from "../audio/sfx.js";
import { skillPerkCatalog } from "../systems/perks/skillPerkCatalog.js";
import { createBot } from "../sim/bots/policies.js";
import { applyConfigOverrides } from "../sim/configOverrides.js";
import { createBotSession } from "../sim/runGame.js";
import { createSeededRandom } from "../sim/seededRandom.js";
import { PALETTE, boxPlot, divergingBars, esc, legend, lineChart, stackedBars } from "./charts.js";

sfx.silence(true);

const TIERS = ["idle", "novice", "average", "expert"];
const WEAPONS = ["sword", "gun", "bow", "flail"];
const ENEMY_COLORS = {
  chaser: "#e8f2fa", slime: "#7bdc7b", shooter: "#ffb347", assaultShooter: "#ff7043", shotgunShooter: "#ffd166",
  bomber: "#ff5e73", mortar: "#b388ff", flyingBomber: "#4cc9f0", boss: "#f72585", fire: "#ff9f1c", projectile: "#999",
};

const $ = (id) => document.getElementById(id);
const specLabel = (spec) => spec;
const botSpecs = () => [...document.querySelectorAll("#bot-grid input:checked")].map((el) => el.value);
const colorForBot = (spec, all) => PALETTE[all.indexOf(spec) % PALETTE.length];

// ---------- setup UI ----------
const botGrid = $("bot-grid");
botGrid.insertAdjacentHTML("beforeend", `<span></span>${WEAPONS.map((w) => `<span class="hd">${w}</span>`).join("")}`);
TIERS.forEach((tier) => {
  botGrid.insertAdjacentHTML("beforeend", `<span>${tier}</span>`);
  WEAPONS.forEach((weapon) => {
    if (tier === "idle") {
      botGrid.insertAdjacentHTML("beforeend", weapon === "gun" ? `<label><input type="checkbox" value="idle" /></label>` : `<span></span>`);
      return;
    }
    const value = `${tier}:${weapon}`;
    const checked = tier !== "novice" && weapon === "gun" ? "checked" : "";
    botGrid.insertAdjacentHTML("beforeend", `<label><input type="checkbox" value="${value}" ${checked} /></label>`);
  });
});
document.querySelector('#bot-grid input[value="idle"]').checked = true;

const weightEntries = GAME_CONFIG.enemies.spawn.weights;
const defaultWeights = Object.fromEntries(weightEntries.map((w) => [w.type, w.weight]));
$("weights").innerHTML = weightEntries
  .map((w) => `<div class="field"><label for="w-${w.type}">${w.type}</label><input id="w-${w.type}" data-type="${w.type}" type="number" min="0" step="1" value="${w.weight}" /></div>`)
  .join("");
$("reset-weights").addEventListener("click", () => {
  weightEntries.forEach((w) => {
    $(`w-${w.type}`).value = defaultWeights[w.type];
  });
  $("overrides").value = "";
});

$("perk-pick").innerHTML = [...skillPerkCatalog]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((p) => `<label title="${esc(p.description)}"><input type="checkbox" value="${p.id}" />${esc(p.id)}</label>`)
  .join("");

function collectOverrides() {
  const overrides = {};
  weightEntries.forEach((w) => {
    const value = Number($(`w-${w.type}`).value);
    if (Number.isFinite(value) && value !== defaultWeights[w.type]) {
      overrides[`enemies.spawn.weights.${w.type}.weight`] = value;
    }
  });
  $("overrides").value.split("\n").forEach((line) => {
    const [path, value] = line.split("=").map((s) => s.trim());
    if (path && value !== undefined && Number.isFinite(Number(value))) {
      overrides[path] = Number(value);
    }
  });
  return overrides;
}

// ---------- worker pool ----------
const workerSource = $("sim-worker-src").textContent;
const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
const POOL_SIZE = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
let busy = false;

function setStatus(text, progress) {
  $("status").textContent = text;
  if (progress !== undefined) {
    $("progress").firstElementChild.style.width = `${Math.round(progress * 100)}%`;
  }
}

function runJobs(jobs, label) {
  return new Promise((resolve, reject) => {
    const results = new Array(jobs.length);
    const workers = [];
    let next = 0;
    let done = 0;
    const t0 = performance.now();
    const finish = (error) => {
      workers.forEach((w) => w.terminate());
      error ? reject(error) : resolve(results);
    };
    const dispatch = (w) => {
      if (next < jobs.length) {
        const id = next++;
        w.postMessage({ id, job: jobs[id] });
      }
    };
    if (!jobs.length) return finish();
    for (let i = 0; i < Math.min(POOL_SIZE, jobs.length); i += 1) {
      const w = new Worker(workerUrl);
      w.onmessage = ({ data }) => {
        if (data.error) return finish(new Error(data.error));
        results[data.id] = data.result;
        done += 1;
        setStatus(`${label}: ${done}/${jobs.length} runs (${((performance.now() - t0) / 1000).toFixed(0)}s)`, done / jobs.length);
        done === jobs.length ? finish() : dispatch(w);
      };
      w.onerror = (e) => finish(new Error(e.message));
      workers.push(w);
      dispatch(w);
    }
  });
}

function jobsFor(bots, { seeds, duration, overrides, forcedPerk }) {
  const jobs = [];
  bots.forEach((bot) => {
    for (let seed = 1; seed <= seeds; seed += 1) {
      jobs.push({ bot, seed, duration, overrides, forcedPerk });
    }
  });
  return jobs;
}

// ---------- stats ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function summarize(runs) {
  const times = runs.map((r) => r.timeSurvived).sort((a, b) => a - b);
  return {
    n: runs.length,
    p10: quantile(times, 0.1), q1: quantile(times, 0.25), median: quantile(times, 0.5), q3: quantile(times, 0.75), p90: quantile(times, 0.9),
    mean: mean(times),
    kills: mean(runs.map((r) => r.kills)),
    level: mean(runs.map((r) => r.level)),
    peak: mean(runs.map((r) => r.peakEnemies)),
    boss: runs.filter((r) => r.firstBossTime !== null).length / Math.max(1, runs.length),
    alive: runs.filter((r) => !r.died).length / Math.max(1, runs.length),
    avgHp: mean(runs.map((r) => r.avgHp)),
  };
}
function meanMap(runs, key) {
  const out = {};
  runs.forEach((r) => Object.entries(r[key] || {}).forEach(([k, v]) => (out[k] = (out[k] || 0) + v / runs.length)));
  return out;
}
function groupBy(runs, key) {
  const m = new Map();
  runs.forEach((r) => (m.get(r[key]) ?? m.set(r[key], []).get(r[key])).push(r));
  return m;
}

// ---------- rendering ----------
function card(title, body, note = "") {
  return `<section class="card"><h2>${esc(title)}</h2>${note ? `<p class="note">${note}</p>` : ""}${body}</section>`;
}

function renderBaseline(runs, bots, settings) {
  const groups = groupBy(runs, "bot");
  const order = bots.filter((b) => groups.has(b));
  const stats = order.map((b) => ({ bot: b, color: colorForBot(b, bots), ...summarize(groups.get(b)), runs: groups.get(b) }));
  const out = [];

  out.push(
    card(
      "Summary",
      `<div class="scroll"><table class="results"><thead><tr><th>Bot</th><th>Runs</th><th>Median s</th><th>P10</th><th>P90</th><th>Mean s</th><th>Kills</th><th>Level</th><th>Avg HP</th><th>Peak enemies</th><th>Boss reached</th><th>Survived cap</th></tr></thead><tbody>${stats
        .map(
          (s) =>
            `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.color};margin-right:6px"></i>${esc(specLabel(s.bot))}</td><td>${s.n}</td><td>${s.median.toFixed(1)}</td><td>${s.p10.toFixed(1)}</td><td>${s.p90.toFixed(1)}</td><td>${s.mean.toFixed(1)}</td><td>${s.kills.toFixed(0)}</td><td>${s.level.toFixed(1)}</td><td>${s.avgHp.toFixed(0)}</td><td>${s.peak.toFixed(0)}</td><td>${(s.boss * 100).toFixed(0)}%</td><td>${(s.alive * 100).toFixed(0)}%</td></tr>`
        )
        .join("")}</tbody></table></div>`,
      `Overrides: ${Object.keys(settings.overrides).length ? esc(JSON.stringify(settings.overrides)) : "none (game defaults)"} · ${settings.seeds} seeds · cap ${settings.duration}s`
    )
  );

  out.push(card("Survival time distribution", boxPlot(stats), "Whiskers P10–P90, box Q1–Q3, white line median, dot mean. Tiers should separate clearly; a flat spread means skill doesn't matter."));

  const maxT = Math.max(...runs.map((r) => r.timeSurvived), 1);
  const curves = stats.map((s) => {
    const times = s.runs.map((r) => r.timeSurvived);
    const pts = [];
    const steps = 80;
    for (let i = 0; i <= steps; i += 1) {
      const t = (maxT / steps) * i;
      pts.push([t, times.filter((x) => x > t).length / times.length]);
    }
    return { label: specLabel(s.bot), color: s.color, points: pts };
  });
  out.push(card("Survival curve", lineChart(curves, { xLabel: "time (s)", yLabel: "runs still alive", yMax: 1, yPercent: true }), "Steep drops show difficulty spikes (boss waves, spawn-rate ramps)."));

  const timelineSeries = stats.map((s) => {
    const byT = new Map();
    s.runs.forEach((r) => r.timeline.forEach((p) => (byT.get(p.t) ?? byT.set(p.t, []).get(p.t)).push(p)));
    const pts = [...byT.entries()].filter(([, v]) => v.length >= Math.max(1, s.runs.length / 3)).sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, mean(v.map((p) => p.enemies))]);
    return { label: specLabel(s.bot), color: s.color, points: pts };
  });
  out.push(card("Enemies on screen over time", lineChart(timelineSeries, { xLabel: "time (s)", yLabel: "enemies" }), "Mean over runs still alive at that moment (needs ≥ 1/3 of runs)."));

  const damageColors = { ...ENEMY_COLORS };
  const dmgRows = stats.map((s) => ({ label: s.bot, parts: meanMap(s.runs, "damageBySource") }));
  out.push(card("Damage taken by source", stackedBars(dmgRows, damageColors, { unit: " hp" }) + legend(Object.entries(damageColors).filter(([k]) => dmgRows.some((r) => r.parts[k] > 0)).map(([k, c]) => ({ label: k, color: c }))), "Mean HP lost per run. A dominant segment points at the enemy type driving deaths."));

  const killRows = stats.map((s) => ({ label: s.bot, parts: meanMap(s.runs, "killsByType") }));
  out.push(card("Kills by enemy type", stackedBars(killRows, ENEMY_COLORS) + legend(Object.entries(ENEMY_COLORS).filter(([k]) => killRows.some((r) => r.parts[k] > 0)).map(([k, c]) => ({ label: k, color: c }))), "Mean kills per run. Compare with spawn weights to spot types the bots rarely get to kill."));

  const weaponNames = { 1: "sword", 2: "gun", 3: "bow", 4: "flail" };
  const wRows = stats.map((s) => {
    const parts = {};
    s.runs.forEach((r) => Object.entries(r.weaponTime).forEach(([slot, t]) => (parts[weaponNames[slot]] = (parts[weaponNames[slot]] || 0) + t / s.runs.length)));
    return { label: s.bot, parts };
  });
  const weaponColors = { sword: "#ffd166", gun: "#4cc9f0", bow: "#90be6d", flail: "#c77dff" };

  // perk lift: mean survival of runs holding a perk vs all runs of the same bot
  const lifts = [];
  stats.forEach((s) => {
    if (s.bot === "idle") return;
    const per = new Map();
    s.runs.forEach((r) => r.perks.forEach((id) => (per.get(id) ?? per.set(id, []).get(id)).push(r.timeSurvived)));
    per.forEach((times, id) => {
      if (times.length >= 4 && times.length < s.runs.length) {
        const others = s.runs.filter((r) => !r.perks.includes(id)).map((r) => r.timeSurvived);
        lifts.push({ label: `${id}`, sub: `${s.bot} · n=${times.length}`, value: mean(times) - mean(others), ci: 1.96 * Math.sqrt(sd(times) ** 2 / times.length + sd(others) ** 2 / others.length) });
      }
    });
  });
  lifts.sort((a, b) => b.value - a.value);
  if (lifts.length) {
    const shown = lifts.length > 24 ? [...lifts.slice(0, 12), ...lifts.slice(-12)] : lifts;
    out.push(card("Perk lift (observational)", divergingBars(shown), "Mean survival of runs that picked the perk minus runs that didn't (error bars 95%). Observational and confounded by pick timing — confirm with the forced A/B test."));
  }
  out.push(card("Weapon time share", stackedBars(wRows, weaponColors, { unit: " s" }) + legend(Object.entries(weaponColors).map(([k, c]) => ({ label: k, color: c })))));

  return out.join("");
}

function mount(html) {
  $("results").innerHTML = html;
}

// ---------- actions ----------
async function guard(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`, 0);
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

function readSettings() {
  return {
    seeds: Math.max(1, Math.min(200, Number($("seeds").value) || 10)),
    duration: Math.max(30, Number($("duration").value) || 420),
    overrides: collectOverrides(),
  };
}

$("run").addEventListener("click", () =>
  guard(async () => {
    const bots = botSpecs();
    if (!bots.length) return setStatus("Select at least one bot.", 0);
    const settings = readSettings();
    const runs = await runJobs(jobsFor(bots, settings), "Simulating");
    mount(renderBaseline(runs.flat(), bots, settings));
    setStatus(`Done: ${runs.length} runs.`, 1);
    fillWatchBots();
  })
);

$("run-sweep").addEventListener("click", () =>
  guard(async () => {
    const bots = botSpecs();
    const settings = readSettings();
    const path = $("sweep-path").value.trim();
    const values = $("sweep-values").value.split(",").map(Number).filter((v) => Number.isFinite(v));
    if (!bots.length || !path || !values.length) return setStatus("Need bots, a path and values.", 0);
    const jobs = [];
    values.forEach((v) => jobs.push(...jobsFor(bots, { ...settings, overrides: { ...settings.overrides, [path]: v } }).map((j) => ({ ...j, sweepValue: v }))));
    const results = await runJobs(jobs, "Sweeping");
    const series = bots.map((bot, i) => ({
      label: bot,
      color: PALETTE[i % PALETTE.length],
      markers: true,
      points: values.map((v) => [v, mean(results.filter((r, idx) => jobs[idx].bot === bot && jobs[idx].sweepValue === v).map((r) => r.timeSurvived))]),
    }));
    const width = 720;
    const xs = values.map((v) => v);
    const body =
      lineChart(
        series.map((s) => ({ ...s, points: s.points.map(([x, y]) => [xs.indexOf(x), y]) })),
        { xLabel: path, yLabel: "mean survival (s)", xMax: Math.max(1, values.length - 1), width, xTickLabels: values.map(String) }
      ) +
      `<div class="scroll"><table class="results"><thead><tr><th>${esc(path)}</th>${bots.map((b) => `<th>${esc(b)} s</th>`).join("")}</tr></thead><tbody>${values
        .map((v, vi) => `<tr><td>${v}</td>${series.map((s) => `<td>${s.points[vi][1].toFixed(1)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
    $("empty-state")?.remove();
    $("results").insertAdjacentHTML("afterbegin", card(`Sweep: ${path}`, body, "Mean survival per value, same seeds for every value."));
    setStatus(`Sweep done: ${jobs.length} runs.`, 1);
  })
);

$("run-perks").addEventListener("click", () =>
  guard(async () => {
    const bots = botSpecs().filter((b) => b !== "idle");
    const perks = [...document.querySelectorAll("#perk-pick input:checked")].map((el) => el.value);
    const settings = readSettings();
    if (!bots.length || !perks.length) return setStatus("Select a non-idle bot and at least one perk.", 0);
    const jobs = [];
    bots.forEach((bot) => {
      jobs.push(...jobsFor([bot], settings));
      perks.forEach((perk) => jobs.push(...jobsFor([bot], { ...settings, forcedPerk: perk })));
    });
    const results = await runJobs(jobs, "A/B testing");
    const rows = [];
    bots.forEach((bot) => {
      const base = results.filter((r, i) => jobs[i].bot === bot && !jobs[i].forcedPerk).sort((a, b) => a.seed - b.seed);
      perks.forEach((perk) => {
        const test = results.filter((r, i) => jobs[i].bot === bot && jobs[i].forcedPerk === perk).sort((a, b) => a.seed - b.seed);
        const diffs = test.map((r, i) => r.timeSurvived - base[i].timeSurvived);
        rows.push({ label: perk, sub: bot, value: mean(diffs), ci: 1.96 * (sd(diffs) / Math.sqrt(diffs.length)) });
      });
    });
    rows.sort((a, b) => b.value - a.value);
    $("empty-state")?.remove();
    $("results").insertAdjacentHTML(
      "afterbegin",
      card("Perk A/B test (forced pick, paired seeds)", divergingBars(rows), "Δ mean survival vs the same bot without the forced perk. Bars whose error whisker crosses zero are not distinguishable from noise — raise seeds.")
    );
    setStatus(`A/B done: ${jobs.length} runs.`, 1);
  })
);

// ---------- watch mode ----------
const watchCanvas = $("watch-canvas");
const realRandom = Math.random;
let watch = null;

function fillWatchBots() {
  const select = $("watch-bot");
  const selected = select.value;
  const specs = [];
  TIERS.forEach((t) => (t === "idle" ? specs.push("idle") : WEAPONS.forEach((w) => specs.push(`${t}:${w}`))));
  select.innerHTML = specs.map((s) => `<option value="${s}">${s}</option>`).join("");
  select.value = selected || "average:gun";
}
fillWatchBots();

function stopWatch() {
  if (watch) {
    watch.restore?.();
    Math.random = realRandom;
    watch = null;
  }
}

function startWatch() {
  stopWatch();
  const seed = Math.max(1, Number($("watch-seed").value) || 1);
  const bot = createBot($("watch-bot").value);
  const restoreConfig = applyConfigOverrides(collectOverrides());
  const simRandom = createSeededRandom(seed);
  Math.random = simRandom;
  const session = createBotSession({ seed, bot });
  Math.random = realRandom;

  CANVAS.scale = watchCanvas.width / CANVAS.width;
  CANVAS.dpr = 1;
  const renderer = createRenderer(watchCanvas, session.game.gameState, CANVAS);
  session.game.gameState.inputDevice = "keyboard";
  watch = { session, renderer, simRandom, paused: false, acc: 0, last: performance.now(), restore: restoreConfig, bot };
}

$("watch-start").addEventListener("click", startWatch);
$("watch-pause").addEventListener("click", () => {
  if (watch) {
    watch.paused = !watch.paused;
    $("watch-pause").textContent = watch.paused ? "Resume" : "Pause";
  }
});

function watchFrame(now) {
  requestAnimationFrame(watchFrame);
  if (!watch) return;
  const w = watch;
  const dt = Math.min(0.1, (now - w.last) / 1000);
  w.last = now;
  const { gameState, player } = w.session.game;
  if (!w.paused && !w.session.metrics.died) {
    w.acc += dt * Number($("watch-speed").value);
    let steps = 0;
    Math.random = w.simRandom;
    while (w.acc >= 1 / 60 && steps < 160) {
      w.acc -= 1 / 60;
      steps += 1;
      if (!w.session.step()) break;
    }
    if (steps >= 160) w.acc = 0;
    Math.random = realRandom;
  }
  w.renderer.render();
  const m = w.session.metrics;
  const status = m.died ? `<b class="neg">Dead</b>` : w.paused ? "Paused" : "Playing";
  const dmg = Object.entries(gameState.damageBySource || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(", ") || "–";
  $("watch-stats").innerHTML = [
    status,
    `Time <b>${gameState.time.toFixed(1)}s</b>`,
    `HP <b>${Math.max(0, player.hp).toFixed(0)}/${player.maxHp}</b>`,
    `Level <b>${player.level}</b>`,
    `Kills <b>${gameState.runStats.kills}</b>`,
    `Enemies <b>${gameState.enemies.length}</b>`,
    `Perks <b>${player.ownedPerks.length}</b> ${esc(player.ownedPerks.map((p) => p.id).join(", ") || "–")}`,
    `Top damage: ${esc(dmg)}`,
  ].map((s) => `<span>${s}</span>`).join("");
}
requestAnimationFrame(watchFrame);
startWatch();

// Shareable setup: ?seeds=3&duration=60&bots=average:gun,idle&autorun=1
const params = new URLSearchParams(window.location.search);
if (params.has("seeds")) $("seeds").value = params.get("seeds");
if (params.has("duration")) $("duration").value = params.get("duration");
if (params.has("bots")) {
  const wanted = new Set(params.get("bots").split(","));
  document.querySelectorAll("#bot-grid input").forEach((el) => (el.checked = wanted.has(el.value)));
}
if (params.get("autorun") === "1") $("run").click();
