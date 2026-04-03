import { GAME_CONFIG } from "../../core/constants.js";
import { getPlayerDamageMultiplier } from "../../entities/player.js";
import { igniteTreesAt, isProjectileBlockedByMountain } from "../worldSystem.js";
import { PERK_HOOKS } from "../perks/contracts.js";

const FIREBALL_CONFIG = GAME_CONFIG.skills.fireball;

export function tryFireball(services, worldPointer) {
  const gameState = services.gameState;
  const player = gameState.player;
  const perkEngine = services.getPerkEngine();

  // If a fireball is already in flight, F triggers manual detonation instead of casting another.
  if (gameState.fireballs.length > 0) {
    for (let i = 0; i < gameState.fireballs.length; i += 1) {
      gameState.fireballs[i].manualDetonateRequested = true;
    }
    return true;
  }

  if (player.fireballCooldownRemaining > 0) {
    return false;
  }

  const dx = worldPointer.x - player.x;
  const dy = worldPointer.y - player.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    return false;
  }

  const nx = dx / length;
  const ny = dy / length;
  player.fireballCooldownRemaining = player.fireballCooldown;
  const fireball = {
    x: player.x,
    y: player.y,
    vx: nx * FIREBALL_CONFIG.speed,
    vy: ny * FIREBALL_CONFIG.speed,
    radius: FIREBALL_CONFIG.radius,
    damage: FIREBALL_CONFIG.directDamage * getPlayerDamageMultiplier(player),
    splashDamage: FIREBALL_CONFIG.splashDamage * getPlayerDamageMultiplier(player),
    splashRadius: FIREBALL_CONFIG.splashRadius,
    lifetime: FIREBALL_CONFIG.lifetime,
    alive: true,
    manualDetonateRequested: false,
    detonateOnImpact: false,
    spawnFireField: false,
  };
  if (perkEngine) {
    perkEngine.runTransformHook(PERK_HOOKS.onFireballCreate, { gameState, player, fireball }, player);
  }
  gameState.fireballs.push(fireball);
  gameState.effects.push({
    x: player.x,
    y: player.y,
    radius: FIREBALL_CONFIG.castEffect.radius,
    elapsed: 0,
    duration: FIREBALL_CONFIG.castEffect.duration,
    growth: FIREBALL_CONFIG.castEffect.growth,
    color: FIREBALL_CONFIG.castEffect.color,
  });
  return true;
}

export function updateFireballs(services, dt) {
  const gameState = services.gameState;
  const world = services.getWorld();
  for (let index = gameState.fireballs.length - 1; index >= 0; index -= 1) {
    const fireball = gameState.fireballs[index];
    fireball.x += fireball.vx * dt;
    fireball.y += fireball.vy * dt;
    fireball.lifetime -= dt;

    igniteTreesAt(world, fireball.x, fireball.y, fireball.radius + 8);

    if (isProjectileBlockedByMountain(world, fireball.x, fireball.y, fireball.radius)) {
      fireball.alive = false;
    }

    if (fireball.lifetime <= 0 || !fireball.alive) {
      gameState.fireballs.splice(index, 1);
    }
  }
}

export function updateLingeringZones(services, dt) {
  const gameState = services.gameState;
  const enemies = gameState.enemies;
  const world = services.getWorld();
  for (let i = 0; i < enemies.length; i += 1) {
    enemies[i].externalSlowMultiplier = 1;
  }

  for (let z = gameState.lingeringZones.length - 1; z >= 0; z -= 1) {
    const zone = gameState.lingeringZones[z];
    zone.lifetime -= dt;
    if (zone.lifetime <= 0) {
      gameState.lingeringZones.splice(z, 1);
      continue;
    }

    if (zone.type === "fire") {
      igniteTreesAt(world, zone.x, zone.y, zone.radius);
    }

    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (enemy.isRespawning) {
        continue;
      }
      const distance = Math.hypot(enemy.x - zone.x, enemy.y - zone.y);
      if (distance > zone.radius + enemy.radius) {
        continue;
      }

      if (zone.type === "fire" && zone.damagePerSecond > 0) {
        enemy.hp = Math.max(1, enemy.hp - zone.damagePerSecond * dt);
      }

      if (zone.type === "ice") {
        enemy.externalSlowMultiplier = Math.min(enemy.externalSlowMultiplier ?? 1, zone.slowMultiplier ?? 1);
      }
    }
  }
}