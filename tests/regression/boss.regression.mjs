import assert from "node:assert/strict";
import { spawnBoss, updateBossDirector, getSpawnModifier, updateBoss, onBossKilled } from "../../src/systems/bosses/bossSystem.js";
import { updateIndicators } from "../../src/systems/indicatorSystem.js";
import { createInitialState } from "../../src/core/state.js";
import { createWorldSystem } from "../../src/systems/worldSystem.js";
import { updateEnemySpawning } from "../../src/systems/enemySystem.js";
import { GAME_CONFIG } from "../../src/core/constants.js";
import { clearBossAttacks } from "../../src/systems/bosses/bossState.js";
import { constrainToBossArenas, getBossArenas } from "../../src/systems/bosses/arena.js";

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
    [...(state.systems.boss?.active || [])].forEach((boss) => {
      updateBoss(state, boss, state.player, world, dt, { x: 0, y: 0 });
    });
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
  state.time = 60;
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

runTest("first boss is scheduled at 90s and the second at 180s", () => {
  const [first, second] = GAME_CONFIG.bosses.schedule;
  assert.equal(first.boss, "kaleidoscope");
  assert.equal(first.trigger.at, 90);
  assert.equal(second.boss, "juggernaut");
  assert.equal(second.trigger.at, 180);
});

runTest("two bosses can be alive at once and their attacks are cleared independently", () => {
  const state = makeState();
  const a = spawnBoss(state, "kaleidoscope");
  const b = spawnBoss(state, "juggernaut");
  assert.ok(a && b, "both spawned");
  assert.equal(spawnBoss(state, "juggernaut"), null, "no duplicate of the same boss");
  assert.equal(state.systems.boss.active.length, 2);
  assert.equal(state.systems.boss.activeBoss, a);
  step(state, 5);
  const owners = new Set(state.indicators.filter((i) => i.source === "boss").map((i) => i.owner));
  assert.ok(owners.has(a.uid) || owners.has(b.uid));
  clearBossAttacks(state, { owner: a.uid });
  assert.equal(state.indicators.filter((i) => i.source === "boss" && i.owner === a.uid).length, 0);
  onBossKilled(state, a, state.player);
  state.enemies.splice(state.enemies.indexOf(a), 1);
  assert.equal(state.systems.boss.activeBoss, b);
  assert.equal(state.systems.boss.active.length, 1);
});

runTest("combined spawn modifier takes the strictest limits of every living boss", () => {
  const state = makeState();
  spawnBoss(state, "kaleidoscope");
  spawnBoss(state, "juggernaut");
  const modifier = getSpawnModifier(state);
  assert.equal(modifier.spawnRateMultiplier, 0.3);
  assert.equal(modifier.maxEnemiesMultiplier, 0.5);
  assert.deepEqual([...modifier.allowedTypes].sort(), ["chaser", "slime"]);
});

runTest("arena ring holds the player, follows the boss and lifts on death", () => {
  const state = makeState();
  state.player.x = 0;
  state.player.y = 0;
  const boss = spawnBoss(state, "juggernaut");
  boss.x = 100;
  boss.y = 0;
  boss.age = 10;
  const radius = GAME_CONFIG.bosses.juggernaut.arena.radius;
  let pos = constrainToBossArenas(state, 5000, 0, 14);
  assert.ok(Math.abs(pos.x - (100 + radius - 14)) < 1e-6 && Math.abs(pos.y) < 1e-6);
  boss.x = 1000;
  pos = constrainToBossArenas(state, 0, 0, 14);
  assert.ok(pos.x > 0 && Math.hypot(pos.x - 1000, pos.y) <= radius - 14 + 1e-6, "ring moved with the boss");
  assert.equal(getBossArenas(state).length, 1);
  onBossKilled(state, boss, state.player);
  state.enemies.splice(state.enemies.indexOf(boss), 1);
  assert.deepEqual(constrainToBossArenas(state, 5000, 0, 14), { x: 5000, y: 0 });
});

runTest("arena rings ease in so the player is not snapped at spawn", () => {
  const state = makeState();
  state.player.x = 0;
  state.player.y = 0;
  const boss = spawnBoss(state, "kaleidoscope");
  boss.x = 420;
  boss.y = 0;
  boss.age = 0;
  const start = constrainToBossArenas(state, 0, 0, 14);
  assert.deepEqual(start, { x: 0, y: 0 });
  assert.ok(getBossArenas(state)[0].radius > GAME_CONFIG.bosses.kaleidoscope.arena.radius);
});

runTest("multiple bosses share one ring centered between them", () => {
  const state = makeState();
  const a = spawnBoss(state, "kaleidoscope");
  const b = spawnBoss(state, "juggernaut");
  a.age = b.age = 10;
  a.x = -200;
  a.y = 0;
  b.x = 200;
  b.y = 0;
  const rings = getBossArenas(state);
  assert.equal(rings.length, 1);
  const ring = rings[0];
  assert.ok(Math.abs(ring.x) < 1e-6 && Math.abs(ring.y) < 1e-6, "centered on midpoint");
  const big = Math.max(GAME_CONFIG.bosses.kaleidoscope.arena.radius, GAME_CONFIG.bosses.juggernaut.arena.radius);
  assert.ok(Math.abs(ring.radius - (200 + big)) < 1e-6);
  const pos = constrainToBossArenas(state, 0, 5000, 14);
  assert.ok(Math.hypot(pos.x, pos.y) <= ring.radius - 14 + 1e-6, "inside shared ring");
});

runTest("debug can spawn duplicate bosses, the director cannot", () => {
  const state = makeState();
  assert.ok(spawnBoss(state, "kaleidoscope"));
  assert.equal(spawnBoss(state, "kaleidoscope"), null);
  assert.ok(spawnBoss(state, "kaleidoscope", -1, { allowDuplicate: true }));
  assert.equal(state.systems.boss.active.length, 2);
  assert.equal(getBossArenas(state).length, 1);
});

runTest("juggernaut dashes, chains and changes phase", () => {
  const state = makeState();
  const boss = spawnBoss(state, "juggernaut");
  boss.age = 10;
  state.player.x = 0;
  state.player.y = 0;
  step(state, 6);
  assert.ok(state.indicators.length > 0 || boss.scratch.dash || state.projectiles.length > 0, "attacked");
  boss.hp = boss.maxHp * 0.5;
  step(state, 1 / 60);
  assert.equal(boss.phaseIndex, 1);
  assert.equal(boss.scratch.dash ?? null, null);
  step(state, 30);
  assert.ok(state.projectiles.length <= GAME_CONFIG.bosses.maxBullets);
});
