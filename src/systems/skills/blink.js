import { GAME_CONFIG } from "../../core/constants.js";
import { getPlayerDamageMultiplier } from "../../entities/player.js";
import { igniteTreesAt, resolvePositionAgainstMountains } from "../worldSystem.js";

const BLINK_CONFIG = GAME_CONFIG.skills.blink;

function applyBlinkExplosion(gameState, x, y) {
  const player = gameState.player;
  const radius = 78;
  const damage = 20 * getPlayerDamageMultiplier(player);
  const stunDuration = 1.2;

  gameState.effects.push(
    {
      x,
      y,
      radius: 16,
      elapsed: 0,
      duration: 0.3,
      growth: 38,
      color: "136, 236, 255",
    },
    {
      x,
      y,
      radius: radius * 0.42,
      elapsed: 0,
      duration: 0.4,
      growth: 22,
      color: "198, 252, 255",
    }
  );

  for (let index = 0; index < gameState.enemies.length; index += 1) {
    const enemy = gameState.enemies[index];
    if (enemy.isRespawning) {
      continue;
    }
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance > radius + enemy.radius) {
      continue;
    }

    enemy.stunnedTimer = Math.max(enemy.stunnedTimer || 0, stunDuration);
    enemy.hp = Math.max(1, enemy.hp - damage);
  }
}

function spawnBlinkTrail(gameState, fromX, fromY, toX, toY, type) {
  const world = gameState.systems.world;
  const segments = 6;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const zone = {
      type,
      x: fromX + (toX - fromX) * t,
      y: fromY + (toY - fromY) * t,
      radius: type === "fire" ? 20 : 24,
      lifetime: type === "fire" ? 1.8 : 2.2,
      maxLifetime: type === "fire" ? 1.8 : 2.2,
      damagePerSecond: type === "fire" ? 18 : 0,
      slowMultiplier: type === "ice" ? 0.56 : 1,
    };
    gameState.lingeringZones.push(zone);
    if (type === "fire") {
      igniteTreesAt(world, zone.x, zone.y, zone.radius);
    }
  }
}

export function tryBlink(services, worldPointer) {
  const gameState = services.gameState;
  const player = gameState.player;
  const world = services.getWorld();
  const weaponSystem = services.getWeaponSystem();
  if (player.blinkMaxCharges <= 1) {
    if (player.blinkCooldownRemaining > 0) {
      return false;
    }
  } else if (player.blinkCharges <= 0) {
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
  const blinkDirX = player.blinkAimsBehind ? -nx : nx;
  const blinkDirY = player.blinkAimsBehind ? -ny : ny;
  const sourceX = player.x;
  const sourceY = player.y;
  const targetX = player.x + blinkDirX * player.blinkDistance;
  const targetY = player.y + blinkDirY * player.blinkDistance;
  const resolved = resolvePositionAgainstMountains(world, targetX, targetY, player.radius);
  player.x = resolved.x;
  player.y = resolved.y;
  if (player.blinkMaxCharges <= 1) {
    player.blinkCharges = 0;
    player.blinkChargeTimer = player.blinkCooldown;
    player.blinkCooldownRemaining = player.blinkChargeTimer;
  } else {
    player.blinkCharges = Math.max(0, Math.min(player.blinkMaxCharges, player.blinkCharges - 1));
    if (player.blinkCharges < player.blinkMaxCharges && player.blinkChargeTimer <= 0) {
      player.blinkChargeTimer = player.blinkCooldown;
      player.blinkCooldownRemaining = player.blinkChargeTimer;
    }
  }

  gameState.effects.push({
    x: player.x,
    y: player.y,
    radius: BLINK_CONFIG.effect.radius,
    elapsed: 0,
    duration: BLINK_CONFIG.effect.duration,
    growth: BLINK_CONFIG.effect.growth,
    color: BLINK_CONFIG.effect.color,
  });

  if (player.blinkReloadsGun) {
    weaponSystem.currentAmmo = weaponSystem.getMagazineSize(player);
    weaponSystem.isReloading = false;
    weaponSystem.reloadProgress = 0;
    weaponSystem.reloadFailed = false;
    weaponSystem.reloadAttemptUsed = false;
    weaponSystem.showAmmoBar(1);
  }

  if (player.blinkExplosionAtSource) {
    applyBlinkExplosion(gameState, sourceX, sourceY);
  }
  if (player.blinkExplosionAtTarget) {
    applyBlinkExplosion(gameState, player.x, player.y);
  }
  if (player.blinkLeavesFireTrail) {
    spawnBlinkTrail(gameState, sourceX, sourceY, player.x, player.y, "fire");
  }
  if (player.blinkLeavesIceTrail) {
    spawnBlinkTrail(gameState, sourceX, sourceY, player.x, player.y, "ice");
  }

  return true;
}

export function updateBlinkCharges(services, dt) {
  const player = services.getPlayer();

  if (player.blinkMaxCharges <= 1) {
    player.blinkChargeTimer = Math.max(0, player.blinkChargeTimer - dt);
    player.blinkCooldownRemaining = player.blinkChargeTimer;
    player.blinkCharges = player.blinkChargeTimer > 0 ? 0 : 1;
    return;
  }

  player.blinkCharges = Math.max(0, Math.min(player.blinkMaxCharges, player.blinkCharges));

  if (player.blinkCharges >= player.blinkMaxCharges) {
    player.blinkChargeTimer = 0;
    player.blinkCooldownRemaining = 0;
    return;
  }

  player.blinkChargeTimer = Math.max(0, player.blinkChargeTimer - dt);
  player.blinkCooldownRemaining = player.blinkChargeTimer;
  if (player.blinkChargeTimer <= 0) {
    player.blinkCharges = Math.min(player.blinkMaxCharges, player.blinkCharges + 1);
    if (player.blinkCharges < player.blinkMaxCharges) {
      player.blinkChargeTimer = player.blinkCooldown;
      player.blinkCooldownRemaining = player.blinkChargeTimer;
    } else {
      player.blinkCooldownRemaining = 0;
    }
  }
}

export function updateBlinkPreview(services, worldPointer, blinkCanceledDuringHold) {
  const player = services.getPlayer();
  const world = services.getWorld();
  if (player.blinkCharges <= 0 || blinkCanceledDuringHold) {
    player.blinkPreview.active = false;
    return;
  }

  const dx = worldPointer.x - player.x;
  const dy = worldPointer.y - player.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    player.blinkPreview.active = false;
    return;
  }

  const nx = dx / length;
  const ny = dy / length;
  const previewDirX = player.blinkAimsBehind ? -nx : nx;
  const previewDirY = player.blinkAimsBehind ? -ny : ny;
  const preview = resolvePositionAgainstMountains(
    world,
    player.x + previewDirX * player.blinkDistance,
    player.y + previewDirY * player.blinkDistance,
    player.radius
  );
  player.blinkPreview.active = true;
  player.blinkPreview.x = preview.x;
  player.blinkPreview.y = preview.y;
}