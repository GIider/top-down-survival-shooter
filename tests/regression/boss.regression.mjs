import assert from "node:assert/strict";
import { spawnBoss, updateBossDirector, getSpawnModifier, updateBoss, onBossKilled } from "../../src/systems/bosses/bossSystem.js";
import { updateIndicators } from "../../src/systems/indicatorSystem.js";
import { createInitialState } from "../../src/core/state.js";
import { createWorldSystem } from "../../src/systems/worldSystem.js";
import { updateEnemySpawning } from "../../src/systems/enemySystem.js";
import { GAME_CONFIG } from "../../src/core/constants.js";

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function makeState() {
  const state = createInitialState();
  state.systems.world = createWorldSystem(1234);
  return state;
}

function step(state, seconds, dt = 1 / 60) {
  const world = state.systems.world;
  for (let t = 0; t < seconds; t += dt) {
    state.time += dt;
    updateBossDirector(state, dt);
    const boss = state.systems.boss?.activeBoss;
    if (boss) {
      updateBoss(state, boss, state.player, world, dt, { x: 0, y: 0 });
    }
    updateIndicators(state.indicators, dt).forEach((indicator) => indicator.onTrigger && indicator.onTrigger());
    state.projectiles.forEach((p) => {
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
    });
  }
}

runTest("time trigger queues a warning then spawns the boss and applies the spawn modifier", () => {
  const state = makeState();
  step(state, GAME_CONFIG.bosses.schedule[0].trigger.at - 1);
  assert.equal(state.systems.boss.activeBoss, null);
  step(state, 2);
  assert.ok(state.systems.boss.warning, "warning started");
  assert.equal(getSpawnModifier(state).spawnRateMultiplier, 0);
  step(state, GAME_CONFIG.bosses.warningDuration + 0.5);
  const boss = state.systems.boss.activeBoss;
  assert.ok(boss && boss.isBoss && state.enemies.includes(boss));
  assert.deepEqual(getSpawnModifier(state).allowedTypes, ["chaser", "slime"]);
});

runTest("spawn modifier restricts regular spawns and fades existing enemies", () => {
  const state = makeState();
  state.enemies.push({ type: "shooter", x: 0, y: 0, radius: 10, hp: 1, maxHp: 1 });
  spawnBoss(state, "kaleidoscope");
  assert.equal(state.enemies.filter((e) => !e.isBoss).length, 0);
  state.time = 120;
  for (let i = 0; i < 600; i += 1) {
    updateEnemySpawning(state, 0.1);
  }
  const types = new Set(state.enemies.filter((e) => !e.isBoss).map((e) => e.type));
  assert.ok(types.size > 0);
  types.forEach((type) => assert.ok(["chaser", "slime"].includes(type), `unexpected ${type}`));
});

runTest("boss is invulnerable during phase transitions and bullets are cleared", () => {
  const state = makeState();
  const boss = spawnBoss(state, "kaleidoscope");
  step(state, 4);
  assert.ok(state.indicators.some((i) => i.source === "boss") || state.projectiles.length > 0);
  boss.hp = boss.maxHp * 0.6;
  step(state, 1 / 60);
  assert.equal(boss.phaseIndex, 1);
  assert.ok(boss.invulnerableTimer > 0);
  assert.equal(state.projectiles.filter((p) => p.source === "boss").length, 0);
  const locked = boss.hp;
  boss.hp -= 500;
  step(state, 1 / 60);
  assert.ok(boss.hp >= locked - 1e-6);
});

runTest("bullet cap is respected and boss defeat restores spawning and re-arms trigger", () => {
  const state = makeState();
  const boss = spawnBoss(state, "kaleidoscope", 0);
  boss.phaseIndex = 1;
  step(state, 30);
  assert.ok(state.projectiles.length <= GAME_CONFIG.bosses.maxBullets);
  state.time = 400;
  onBossKilled(state, boss, state.player);
  state.enemies.splice(state.enemies.indexOf(boss), 1);
  assert.equal(state.systems.boss.activeBoss, null);
  assert.equal(getSpawnModifier(state), null);
  assert.equal(state.projectiles.filter((p) => p.source === "boss").length, 0);
  assert.equal(state.systems.boss.entries[0].nextAt, 400 + GAME_CONFIG.bosses.schedule[0].trigger.repeat);
  assert.equal(state.runStats.bossKills, 1);
});
