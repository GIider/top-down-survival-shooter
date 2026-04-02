import { GAME_CONFIG } from "../../core/constants.js";
import { getPlayerDamageMultiplier } from "../../entities/player.js";

const SHOUT_CONFIG = GAME_CONFIG.skills.shout;

function reflectProjectileByShout(projectile, origin, player) {
  const speed = Math.max(SHOUT_CONFIG.reflectMinSpeed, Math.hypot(projectile.velocity.x, projectile.velocity.y));
  const dx = projectile.position.x - origin.x;
  const dy = projectile.position.y - origin.y;
  const distance = Math.hypot(dx, dy);
  let nx;
  let ny;

  if (distance < 0.0001) {
    const vLen = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1;
    nx = projectile.velocity.x / vLen;
    ny = projectile.velocity.y / vLen;
  } else {
    nx = dx / distance;
    ny = dy / distance;
  }

  projectile.velocity.x = nx * speed;
  projectile.velocity.y = ny * speed;
  projectile.owner = "player";
  projectile.color = SHOUT_CONFIG.reflectColor;
  projectile.damage *= Math.max(1, getPlayerDamageMultiplier(player));
  projectile.lifetime = Math.max(projectile.lifetime, SHOUT_CONFIG.reflectedLifetimeMin);
  projectile.modifiers = [];
  projectile.hitEnemies = new Set();
}

export function updateShoutPreview(services, shoutCanceledDuringHold) {
  const player = services.getPlayer();
  if (player.shoutCooldownRemaining > 0 || shoutCanceledDuringHold) {
    player.shoutPreview.active = false;
    return;
  }

  player.shoutPreview.active = true;
}

export function tryShout(services) {
  const gameState = services.gameState;
  const player = gameState.player;
  if (player.shoutCooldownRemaining > 0) {
    return false;
  }

  player.shoutCooldownRemaining = player.shoutCooldown;
  gameState.shoutWaves.push({
    x: player.x,
    y: player.y,
    elapsed: 0,
    duration: SHOUT_CONFIG.wave.duration,
    maxRadius: player.shoutRadius + player.shoutRangeBonus,
    thickness: SHOUT_CONFIG.wave.thickness,
    reflectedProjectiles: new Set(),
    stunnedEnemies: new Set(),
  });

  gameState.effects.push({
    x: player.x,
    y: player.y,
    radius: player.radius + 4,
    elapsed: 0,
    duration: SHOUT_CONFIG.castEffect.duration,
    growth: SHOUT_CONFIG.castEffect.growth,
    color: SHOUT_CONFIG.castEffect.color,
  });
  gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + SHOUT_CONFIG.screenShake);
  gameState.screenFx.actionFlash = Math.min(1, gameState.screenFx.actionFlash + SHOUT_CONFIG.screenFlash);
  return true;
}

export function updateShoutWaves(services, dt) {
  const gameState = services.gameState;
  const waves = gameState.shoutWaves;
  const player = gameState.player;

  for (let w = waves.length - 1; w >= 0; w -= 1) {
    const wave = waves[w];
    wave.elapsed += dt;
    const progress = Math.max(0, Math.min(1, wave.elapsed / wave.duration));
    const radius = wave.maxRadius * progress;

    if (player.shoutReflectProjectiles) {
      for (let p = gameState.projectiles.length - 1; p >= 0; p -= 1) {
        const projectile = gameState.projectiles[p];
        if (projectile.owner !== "enemy") {
          continue;
        }
        if (wave.reflectedProjectiles.has(projectile)) {
          continue;
        }

        const distance = Math.hypot(projectile.position.x - wave.x, projectile.position.y - wave.y);
        if (distance <= radius + wave.thickness * 0.5) {
          wave.reflectedProjectiles.add(projectile);
          reflectProjectileByShout(projectile, wave, player);
          gameState.effects.push({
            x: projectile.position.x,
            y: projectile.position.y,
            radius: SHOUT_CONFIG.reflectImpactEffect.radius,
            elapsed: 0,
            duration: SHOUT_CONFIG.reflectImpactEffect.duration,
            growth: SHOUT_CONFIG.reflectImpactEffect.growth,
            color: SHOUT_CONFIG.reflectImpactEffect.color,
          });
        }
      }
    }

    for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
      const enemy = gameState.enemies[e];
      if (enemy.isRespawning || wave.stunnedEnemies.has(enemy)) {
        continue;
      }

      const distance = Math.hypot(enemy.x - wave.x, enemy.y - wave.y);
      if (distance <= radius + enemy.radius + wave.thickness * 0.25) {
        wave.stunnedEnemies.add(enemy);
        enemy.stunnedTimer = Math.max(enemy.stunnedTimer || 0, SHOUT_CONFIG.stunDuration + player.shoutStunDurationBonus);
        gameState.effects.push({
          x: enemy.x,
          y: enemy.y,
          radius: Math.max(10, enemy.radius * 0.65),
          elapsed: 0,
          duration: SHOUT_CONFIG.stunImpactEffect.duration,
          growth: SHOUT_CONFIG.stunImpactEffect.growth,
          color: SHOUT_CONFIG.stunImpactEffect.color,
        });
      }
    }

    if (wave.elapsed >= wave.duration) {
      waves.splice(w, 1);
    }
  }
}