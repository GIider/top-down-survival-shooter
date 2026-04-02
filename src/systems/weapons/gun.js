import { GAME_CONFIG } from "../../config/gameConfig.js";
import { getPlayerDamageMultiplier } from "../../entities/player.js";
import { createProjectile } from "../../entities/projectile.js";

const GUN_CONFIG = GAME_CONFIG.weapons.gun;

export function createGunProjectile(player, target, spread, angleOffset = 0) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const angle = Math.atan2(dy, dx);
  const finalAngle = angle + angleOffset + (Math.random() * 2 - 1) * spread;
  const speed = GAME_CONFIG.balance.projectileSpeed * GUN_CONFIG.projectileSpeedMultiplier * player.projectileSpeedMultiplier;
  const crit = Math.random() < player.critChance;

  return createProjectile({
    position: { x: player.x, y: player.y },
    velocity: {
      x: Math.cos(finalAngle) * speed,
      y: Math.sin(finalAngle) * speed,
    },
    damage: GUN_CONFIG.damage * getPlayerDamageMultiplier(player) * (crit ? player.critMultiplier : 1),
    lifetime: GAME_CONFIG.balance.projectileLifetime,
    owner: "player",
    color: crit ? "#fff38f" : "#ffd166",
    modifiers: [],
    isGunBullet: true,
    bounceRemaining: player.gunBulletBounces ? 3 : 0,
    hitEnemies: new Set(),
  });
}

export function getGunConfig() {
  return GUN_CONFIG;
}
