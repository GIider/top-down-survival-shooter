import assert from "node:assert/strict";
import { createPerkEngine } from "../../src/systems/perks/perkEngine.js";
import { PERK_HOOKS, createDefaultShotPlan, createDamageContext } from "../../src/systems/perks/contracts.js";

function createPlayer(perkIds = []) {
  return {
    ownedPerkIds: new Set(perkIds),
    ownedPerks: perkIds.map((id) => ({ id })),
    blinkMaxCharges: 1,
    blinkCharges: 1,
    blinkChargeTimer: 0,
    blinkCooldownRemaining: 0,
    shoutCooldownRemaining: 5,
    fireballCooldownRemaining: 6,
    shoutRadius: 100,
    shoutCooldown: 8,
    fireballCooldown: 10,
    perfectReloadMoveBoostTimer: 0,
  };
}

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("gun triple+backward shot expands to 6 projectiles", () => {
  const player = createPlayer(["gun-triple-shot", "gun-backward-shot"]);
  const perkEngine = createPerkEngine();
  const plan = createDefaultShotPlan({ player, target: { x: 1, y: 0 }, spread: 0.1 });
  const result = perkEngine.runTransformHook(PERK_HOOKS.onWeaponFireRequest, plan, player);

  assert.equal(result.shots.length, 6);
  const backwardCount = result.shots.filter((shot) => shot.reverse === true).length;
  assert.equal(backwardCount, 3);
  assert.deepEqual(
    result.shots.map((shot) => shot.angleOffset),
    [-0.14, -0.14, 0, 0, 0.14, 0.14]
  );
});

runTest("bow projectile hooks set fire and ricochet on perfect", () => {
  const player = createPlayer(["bow-fire-arrows", "bow-ricochet-chain"]);
  const perkEngine = createPerkEngine();
  const context = {
    weaponType: "bow",
    isPerfect: true,
    projectile: {
      isArrow: true,
      isFireArrow: false,
      pierceRemaining: 3,
      ricochetRemaining: 0,
    },
  };

  perkEngine.runTransformHook(PERK_HOOKS.onProjectileCreate, context, player);
  assert.equal(context.projectile.isFireArrow, true);
  assert.equal(context.projectile.pierceRemaining, 0);
  assert.equal(context.projectile.ricochetRemaining, 5);
});

runTest("stunned target + fire arrow damage stacks multiplicatively", () => {
  const player = createPlayer(["utility-stunned-target-damage", "bow-fire-arrows"]);
  const perkEngine = createPerkEngine();
  const context = createDamageContext({
    player,
    target: { stunnedTimer: 1.2 },
    baseDamage: 100,
    damageSource: { tags: ["projectile", "arrow", "bow"] },
    gameState: {},
  });

  const result = perkEngine.runTransformHook(PERK_HOOKS.onDamageCompute, context, player);
  assert.equal(result.damage, 187.5);
});

runTest("kill hooks apply ammo/reload/cooldown rewards", () => {
  const player = createPlayer(["gun-kill-reload", "bow-kill-reload", "melee-skill-cooldown-kill"]);
  const perkEngine = createPerkEngine();
  const weaponSystem = {
    currentAmmo: 1,
    bowReloadTimer: 2,
    bowCharging: false,
    state: "bow-reloading",
    getMagazineSize() {
      return 6;
    },
    showAmmoBar() {},
  };
  const gameState = {
    systems: {
      weaponSystem,
    },
  };

  perkEngine.emitSideEffectHook(
    PERK_HOOKS.onEnemyKilled,
    { gameState, player, damageSource: { sourceType: "gunProjectile" } },
    player
  );
  assert.equal(weaponSystem.currentAmmo, 2);

  perkEngine.emitSideEffectHook(
    PERK_HOOKS.onEnemyKilled,
    { gameState, player, damageSource: { sourceType: "arrowProjectile" } },
    player
  );
  assert.equal(weaponSystem.bowReloadTimer, 0);
  assert.equal(weaponSystem.state, "ready");

  perkEngine.emitSideEffectHook(
    PERK_HOOKS.onEnemyKilled,
    { gameState, player, damageSource: { sourceType: "meleeSwing" } },
    player
  );
  assert.equal(player.shoutCooldownRemaining, 4.5);
  assert.equal(player.fireballCooldownRemaining, 5.4);
  assert.equal(player.blinkCooldownRemaining, 0);
});

runTest("onPerkApplied initializes blink three charges", () => {
  const player = createPlayer(["blink-three-charges"]);
  const perkEngine = createPerkEngine();

  player.blinkMaxCharges = 1;
  player.blinkCharges = 1;
  perkEngine.emitSideEffectHook(PERK_HOOKS.onPerkApplied, { player, perkId: "blink-three-charges" }, player);

  assert.equal(player.blinkMaxCharges, 3);
  assert.equal(player.blinkCharges, 3);
});

runTest("window hooks apply gun and bow perfect window multipliers", () => {
  const player = createPlayer(["gun-perfect-window", "bow-perfect-window"]);
  const perkEngine = createPerkEngine();

  const gunContext = perkEngine.runTransformHook(
    PERK_HOOKS.onPerfectWindowCompute,
    { weaponType: "gun", multiplier: 1, player },
    player
  );
  const bowContext = perkEngine.runTransformHook(
    PERK_HOOKS.onPerfectWindowCompute,
    { weaponType: "bow", multiplier: 1, player },
    player
  );

  assert.equal(gunContext.multiplier, 1.25);
  assert.equal(bowContext.multiplier, 1.25);
});

runTest("perfect reload success grants move speed timer", () => {
  const player = createPlayer(["gun-perfect-speed"]);
  const perkEngine = createPerkEngine();

  perkEngine.emitSideEffectHook(PERK_HOOKS.onPerfectReloadSuccess, { player }, player);
  assert.equal(player.perfectReloadMoveBoostTimer, 1);
});

runTest("pickup and runtime utility hooks are applied", () => {
  const player = createPlayer(["pickup-magnet", "pickup-global-cooldown-reduction", "utility-regen-half-hp"]);
  const perkEngine = createPerkEngine();

  const magnetContext = perkEngine.runTransformHook(
    PERK_HOOKS.onPickupMagnetQuery,
    { enabled: false, player, gameState: {} },
    player
  );
  const cooldownContext = perkEngine.runTransformHook(
    PERK_HOOKS.onPickupGlobalCooldownCompute,
    { multiplier: 1, player, gameState: {}, pickupDef: { type: "health" } },
    player
  );
  const runtimeContext = perkEngine.runTransformHook(
    PERK_HOOKS.onPlayerRuntimeUpdate,
    { regenToHalfMaxHpPerSecond: 0, player, gameState: {}, dt: 0.016 },
    player
  );

  assert.equal(magnetContext.enabled, true);
  assert.equal(cooldownContext.multiplier, 0.8);
  assert.equal(runtimeContext.regenToHalfMaxHpPerSecond, 0.03);
});

runTest("render and melee query hooks enable their behaviors", () => {
  const player = createPlayer(["shared-laser-pointer", "melee-projectile-reflect"]);
  const perkEngine = createPerkEngine();

  const laserContext = perkEngine.runTransformHook(
    PERK_HOOKS.onRenderReticleCompute,
    { enableLaser: false, weaponType: "gun", player, gameState: {} },
    player
  );
  const reflectContext = perkEngine.runTransformHook(
    PERK_HOOKS.onMeleeReflectQuery,
    { enabled: false, player, gameState: {}, swing: {} },
    player
  );

  assert.equal(laserContext.enableLaser, true);
  assert.equal(reflectContext.enabled, true);
});
