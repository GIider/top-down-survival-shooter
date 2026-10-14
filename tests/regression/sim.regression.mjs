import assert from "node:assert/strict";
import { runGame } from "../../src/sim/runGame.js";
import { createBot } from "../../src/sim/bots/policies.js";
import { GAME_CONFIG } from "../../src/core/constants.js";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const summary = (m) => ({ t: m.timeSurvived, k: m.kills, l: m.level, p: m.perks.join(",") });

runTest("same seed and bot produce identical runs", () => {
  const a = runGame({ seed: 3, bot: createBot("average:gun"), duration: 60 });
  const b = runGame({ seed: 3, bot: createBot("average:gun"), duration: 60 });
  assert.deepEqual(summary(a), summary(b));
});

runTest("idle bot dies before an expert bot", () => {
  const idle = runGame({ seed: 5, bot: createBot("idle"), duration: 120 });
  const expert = runGame({ seed: 5, bot: createBot("expert:gun"), duration: 120 });
  assert.ok(idle.died);
  assert.ok(expert.timeSurvived > idle.timeSurvived);
});

runTest("config overrides apply and are restored", () => {
  const entry = GAME_CONFIG.enemies.spawn.weights.find((w) => w.type === "mortar");
  const before = entry.weight;
  runGame({ seed: 1, bot: createBot("idle"), duration: 5, overrides: { "enemies.spawn.weights.mortar.weight": 999 } });
  assert.equal(entry.weight, before);
});

runTest("all weapon bots run without throwing", () => {
  for (const spec of ["novice:sword", "average:bow", "expert:flail"]) {
    runGame({ seed: 2, bot: createBot(spec), duration: 30 });
  }
});

// Coarse balance guard (see `npm run balance` for the full picture): skill tiers must stay ordered and
// survive roughly the intended times. Bands are deliberately loose so seed noise doesn't flake the test.
runTest("skill tiers keep their intended survival bands", () => {
  const median = (spec) => {
    const times = [];
    for (let seed = 1; seed <= 5; seed += 1) {
      times.push(runGame({ seed, bot: createBot(spec), duration: 240 }).timeSurvived);
    }
    return times.sort((a, b) => a - b)[2];
  };
  const novice = median("novice:gun");
  const average = median("average:gun");
  const expert = median("expert:gun");
  assert.ok(novice >= 30 && novice <= 90, `novice median ${novice}`);
  assert.ok(average >= 80 && average <= 220, `average median ${average}`);
  assert.ok(novice < average && average < expert, `tier order ${novice} < ${average} < ${expert}`);
});
