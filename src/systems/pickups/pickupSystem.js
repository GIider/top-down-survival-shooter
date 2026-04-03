import { GAME_CONFIG } from "../../core/constants.js";
import { PICKUP_DEFS, PICKUP_POOL } from "./pickupCatalog.js";
import { PERK_HOOKS } from "../perks/contracts.js";

const PICKUP_BASE_DROP_CHANCE = 0.26;
const NUKE_WAVE_SPEED = 920;
const NUKE_WAVE_LINE_WIDTH = 18;

function getAvailablePickupPool(weaponSystem) {
  const gunSelected = !!(weaponSystem && typeof weaponSystem.isGunSelected === "function" && weaponSystem.isGunSelected());
  return PICKUP_POOL.filter((item) => {
    if ((item.type === PICKUP_DEFS.magazine.type || item.type === PICKUP_DEFS.infiniteAmmo.type) && !gunSelected) {
      return false;
    }
    return true;
  });
}

function getEligiblePickupPool(pool, cooldowns) {
  return pool.filter((item) => (cooldowns[item.type] || 0) <= 0);
}

function pickWeightedPickup(pool) {
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= pool[i].weight;
    if (roll <= 0) {
      return pool[i];
    }
  }
  return pool[pool.length - 1];
}

function createPickup(def, x, y) {
  return {
    type: def.type,
    icon: def.icon,
    color: def.color,
    radius: def.radius,
    lifetime: def.lifetime,
    position: { x, y },
  };
}

function applyPickupEffect(services, pickup) {
  const gameState = services.gameState;
  const player = gameState.player;
  const weaponSystem = services.getWeaponSystem();

  if (pickup.type === PICKUP_DEFS.health.type) {
    const maxHp = player.maxHp + player.maxHpBonus;
    player.hp = Math.min(maxHp, player.hp + PICKUP_DEFS.health.healAmount);
    return;
  }

  if (pickup.type === PICKUP_DEFS.magazine.type) {
    if (weaponSystem && typeof weaponSystem.getMagazineSize === "function") {
      weaponSystem.currentAmmo = weaponSystem.getMagazineSize(player);
      weaponSystem.isReloading = false;
      weaponSystem.reloadProgress = 0;
      weaponSystem.reloadFailed = false;
      weaponSystem.reloadAttemptUsed = false;
      if (typeof weaponSystem.showAmmoBar === "function") {
        weaponSystem.showAmmoBar(1);
      }
    }
    return;
  }

  if (pickup.type === PICKUP_DEFS.nuke.type) {
    const maxRadius = Math.hypot(services.canvas.width, services.canvas.height) * 0.9;
    gameState.nukeWaves.push({
      x: player.x,
      y: player.y,
      radius: 0,
      maxRadius,
      speed: NUKE_WAVE_SPEED,
      lineWidth: NUKE_WAVE_LINE_WIDTH,
      elapsed: 0,
      duration: maxRadius / NUKE_WAVE_SPEED,
    });
    return;
  }

  if (pickup.type === PICKUP_DEFS.cd.type) {
    player.shoutCooldownRemaining = 0;
    player.fireballCooldownRemaining = 0;
    player.blinkChargeTimer = 0;
    player.blinkCooldownRemaining = 0;
    player.blinkCharges = player.blinkMaxCharges;
    return;
  }

  if (pickup.type === PICKUP_DEFS.rage.type) {
    player.rageTimer = Math.max(player.rageTimer, PICKUP_DEFS.rage.duration);
    return;
  }

  if (pickup.type === PICKUP_DEFS.infiniteAmmo.type) {
    player.infiniteAmmoTimer = Math.max(player.infiniteAmmoTimer, PICKUP_DEFS.infiniteAmmo.duration);
  }
}

function updateTimedPickupEffects(gameState, dt) {
  const player = gameState.player;
  player.rageTimer = Math.max(0, player.rageTimer - dt);
  player.infiniteAmmoTimer = Math.max(0, player.infiniteAmmoTimer - dt);

  player.pickupDamageMultiplier = player.rageTimer > 0 ? PICKUP_DEFS.rage.damageMultiplier : 1;
  player.pickupMoveSpeedMultiplier = player.rageTimer > 0 ? PICKUP_DEFS.rage.moveSpeedMultiplier : 1;
  player.hasInfiniteAmmo = player.infiniteAmmoTimer > 0;

  const bars = [];
  if (player.perfectReloadMoveBoostTimer > 0) {
    bars.push({
      id: "perfect-reload-speed",
      label: "Flow Reload",
      color: "rgba(122, 245, 164, 0.95)",
      remaining: player.perfectReloadMoveBoostTimer,
      duration: 1,
    });
  }
  if (player.rageTimer > 0) {
    bars.push({
      id: "rage",
      label: PICKUP_DEFS.rage.bar.label,
      color: PICKUP_DEFS.rage.bar.color,
      remaining: player.rageTimer,
      duration: PICKUP_DEFS.rage.duration,
    });
  }
  if (player.infiniteAmmoTimer > 0) {
    bars.push({
      id: "infinite-ammo",
      label: PICKUP_DEFS.infiniteAmmo.bar.label,
      color: PICKUP_DEFS.infiniteAmmo.bar.color,
      remaining: player.infiniteAmmoTimer,
      duration: PICKUP_DEFS.infiniteAmmo.duration,
    });
  }
  player.activeDurationBars = bars;
}

function updateNukeWaves(gameState, dt) {
  for (let waveIndex = gameState.nukeWaves.length - 1; waveIndex >= 0; waveIndex -= 1) {
    const wave = gameState.nukeWaves[waveIndex];
    wave.elapsed += dt;
    wave.radius = Math.min(wave.maxRadius, wave.radius + wave.speed * dt);

    for (let enemyIndex = gameState.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = gameState.enemies[enemyIndex];
      if (enemy.isRespawning) {
        continue;
      }

      const distance = Math.hypot(enemy.x - wave.x, enemy.y - wave.y);
      if (distance > wave.radius + enemy.radius) {
        continue;
      }

      gameState.effects.push({
        x: enemy.x,
        y: enemy.y,
        radius: Math.max(enemy.radius, 10),
        elapsed: 0,
        duration: 0.26,
        growth: 28,
        color: "255, 198, 132",
      });
      gameState.runStats.kills += 1;
      gameState.enemies.splice(enemyIndex, 1);
    }

    gameState.indicators = gameState.indicators.filter((indicator) => {
      if (indicator.source !== "mortar") {
        return true;
      }
      const distance = Math.hypot(indicator.position.x - wave.x, indicator.position.y - wave.y);
      return distance > wave.radius + (indicator.size?.radius || 0);
    });

    if (wave.radius >= wave.maxRadius) {
      gameState.nukeWaves.splice(waveIndex, 1);
    }
  }
}

export function maybeSpawnPickupOnEnemyDeath(gameState, enemy, difficulty = 0, weaponSystem = null, damageSource = null) {
  if (damageSource?.sourceType === "nuke") {
    return;
  }

  const chance = Math.min(0.7, (PICKUP_BASE_DROP_CHANCE + difficulty * 0.03) * (enemy.pickupDropMultiplier || 1));
  if (Math.random() > chance) {
    return;
  }

  const pool = getAvailablePickupPool(weaponSystem);
  if (pool.length <= 0) {
    return;
  }

  const cooldowns = gameState.pickupTypeCooldowns || (gameState.pickupTypeCooldowns = {});
  const eligiblePool = getEligiblePickupPool(pool, cooldowns);
  if (eligiblePool.length <= 0) {
    return;
  }

  const def = pickWeightedPickup(eligiblePool);
  gameState.drops.push(createPickup(def, enemy.x, enemy.y));
  const perkEngine = gameState.systems?.perkEngine;
  const context = {
    multiplier: 1,
    player: gameState.player,
    pickupDef: def,
    gameState,
  };
  const finalized = perkEngine
    ? perkEngine.runTransformHook(PERK_HOOKS.onPickupGlobalCooldownCompute, context, gameState.player)
    : context;
  cooldowns[def.type] = Math.max(0.25, (def.globalCooldown || 1) * finalized.multiplier);
}

export function updatePickups(services, dt) {
  const gameState = services.gameState;
  const player = gameState.player;
  const perkEngine = gameState.systems?.perkEngine;
  const dropList = gameState.drops;
  const cooldowns = gameState.pickupTypeCooldowns || (gameState.pickupTypeCooldowns = {});
  const pickupRadius = player.radius + GAME_CONFIG.drops.heal.pickupBaseBonus + player.pickupRadiusBonus;

  for (const key of Object.keys(cooldowns)) {
    cooldowns[key] = Math.max(0, cooldowns[key] - dt);
  }

  updateTimedPickupEffects(gameState, dt);
  updateNukeWaves(gameState, dt);

  const magnetContext = {
    enabled: false,
    player,
    gameState,
  };
  const finalizedMagnetContext = perkEngine
    ? perkEngine.runTransformHook(PERK_HOOKS.onPickupMagnetQuery, magnetContext, player)
    : magnetContext;

  for (let index = dropList.length - 1; index >= 0; index -= 1) {
    const drop = dropList[index];
    drop.lifetime -= dt;
    if (drop.lifetime <= 0) {
      dropList.splice(index, 1);
      continue;
    }

    if (finalizedMagnetContext.enabled) {
      const dxMagnet = player.x - drop.position.x;
      const dyMagnet = player.y - drop.position.y;
      const distMagnet = Math.hypot(dxMagnet, dyMagnet) || 1;
      if (distMagnet <= 280) {
        const magnetSpeed = 36;
        drop.position.x += (dxMagnet / distMagnet) * magnetSpeed * dt;
        drop.position.y += (dyMagnet / distMagnet) * magnetSpeed * dt;
      }
    }

    const dx = drop.position.x - player.x;
    const dy = drop.position.y - player.y;
    if (Math.hypot(dx, dy) <= pickupRadius + drop.radius) {
      applyPickupEffect(services, drop);
      dropList.splice(index, 1);
    }
  }
}