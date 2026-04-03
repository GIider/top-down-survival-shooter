import { GAME_CONFIG } from "../../config/gameConfig.js";
import { getPlayerDamageMultiplier } from "../../entities/player.js";
import { createProjectile } from "../../entities/projectile.js";
import { PERK_HOOKS } from "../perks/contracts.js";

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

export function createBowProjectile(player, angle, chargeRatio, arrowShotId, perkEngine = null) {
  const { strength, isPerfect } = getBowStrength(chargeRatio);
  const damage =
    (BOW_CONFIG.minDamage + (BOW_CONFIG.maxDamage - BOW_CONFIG.minDamage) * strength) *
    getPlayerDamageMultiplier(player);
  const speed = (BOW_CONFIG.minSpeed + (BOW_CONFIG.maxSpeed - BOW_CONFIG.minSpeed) * strength) * player.projectileSpeedMultiplier;

  const projectile = createProjectile({
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
    pierceRemaining: isPerfect ? BOW_CONFIG.perfectPierce : 0,
    hitEnemies: new Set(),
    isArrow: true,
    isFireArrow: false,
    arrowShotId,
    ricochetRemaining: 0,
  });

  if (!perkEngine) {
    return projectile;
  }

  const context = {
    projectile,
    player,
    weaponType: "bow",
    chargeRatio,
    isPerfect,
    gameState: null,
  };
  return perkEngine.runTransformHook(PERK_HOOKS.onProjectileCreate, context, player).projectile;
}

export function getBowConfig() {
  return BOW_CONFIG;
}
