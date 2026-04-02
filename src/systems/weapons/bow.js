import { GAME_CONFIG } from "../../config/gameConfig.js";
import { getPlayerDamageMultiplier } from "../../entities/player.js";
import { createProjectile } from "../../entities/projectile.js";

const BOW_CONFIG = GAME_CONFIG.weapons.bow;

export function getBowStrength(ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const [start, end] = BOW_CONFIG.chargeWindow;
  const isPerfect = clamped >= start && clamped <= end;
  const isFullCharge = clamped >= BOW_CONFIG.fullChargeThreshold;

  if (isPerfect) {
    return { strength: BOW_CONFIG.perfectStrength, isPerfect: true };
  }

  if (isFullCharge) {
    return { strength: BOW_CONFIG.fullChargeStrength, isPerfect: false };
  }

  return {
    strength: BOW_CONFIG.strengthBase + clamped * BOW_CONFIG.strengthScale,
    isPerfect: false,
  };
}

export function createBowProjectile(player, angle, chargeRatio, arrowShotId) {
  const { strength, isPerfect } = getBowStrength(chargeRatio);
  const damage = (BOW_CONFIG.minDamage + (BOW_CONFIG.maxDamage - BOW_CONFIG.minDamage) * strength) * getPlayerDamageMultiplier(player);
  const speed = (BOW_CONFIG.minSpeed + (BOW_CONFIG.maxSpeed - BOW_CONFIG.minSpeed) * strength) * player.projectileSpeedMultiplier;
  const ricochetEnabled = !!player.bowRicochetToClosestEnemy && isPerfect;

  return createProjectile({
    position: { x: player.x, y: player.y },
    velocity: {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    },
    damage,
    lifetime: BOW_CONFIG.projectileLifetime,
    owner: "player",
    color: isPerfect ? BOW_CONFIG.perfectColor : BOW_CONFIG.normalColor,
    radius: isPerfect ? BOW_CONFIG.perfectRadius : BOW_CONFIG.normalRadius,
    modifiers: [],
    pierceRemaining: ricochetEnabled ? 0 : isPerfect ? BOW_CONFIG.perfectPierce : 0,
    hitEnemies: new Set(),
    isArrow: true,
    arrowShotId,
    ricochetRemaining: ricochetEnabled ? 5 : 0,
  });
}

export function getBowConfig() {
  return BOW_CONFIG;
}
