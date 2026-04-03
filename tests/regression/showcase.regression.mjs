import assert from "node:assert/strict";
import { createEnemy } from "../../src/entities/enemy.js";
import { updateBomberBehavior } from "../../src/systems/enemies/bomber.js";
import { createWorldSystem } from "../../src/systems/worldSystem.js";

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("bomber explosion supports showcase-like mock state", () => {
  const world = createWorldSystem(4242);
  const gameState = {
    indicators: [],
    effects: [],
    floatingTexts: [],
    enemies: [],
    screenFx: {
      shake: 0,
      damageFlash: 0,
      actionFlash: 0,
      hitStop: 0,
    },
  };
  const player = { x: 0, y: 0, radius: 9, hp: 120 };
  const enemy = createEnemy("bomber", 0, 0, 0);
  enemy.isPrimed = true;
  enemy.fuseTimer = 0.001;
  gameState.enemies.push(enemy);

  assert.doesNotThrow(() => {
    updateBomberBehavior(gameState, enemy, 0, player, world, 0.016, 1);
  });

  assert.equal(gameState.enemies.length, 0);
  assert.ok(gameState.floatingTexts.length > 0);
});
