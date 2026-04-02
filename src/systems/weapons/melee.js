import { GAME_CONFIG } from "../../config/gameConfig.js";
import { getPlayerDamageMultiplier } from "../../entities/player.js";

const MELEE_CONFIG = GAME_CONFIG.weapons.melee;

export function getMeleeCombo() {
  return MELEE_CONFIG.combo;
}

export function getMeleePreview(comboIndex) {
  return MELEE_CONFIG.combo[comboIndex];
}

export function createMeleeSwing(comboIndex, attackId, player, angle) {
  const comboConfig = MELEE_CONFIG.combo[comboIndex];
  return {
    id: `${Date.now()}-${Math.random()}`,
    attackId,
    x: player.x,
    y: player.y,
    angle,
    range: comboConfig.range,
    innerRange: comboConfig.innerRange,
    arc: comboConfig.arc,
    startup: comboConfig.startup,
    damage: comboConfig.damage * getPlayerDamageMultiplier(player),
    elapsed: 0,
    duration: comboConfig.duration,
    color: comboConfig.color,
    hitEnemies: new Set(),
    comboStep: comboIndex,
    didHit: false,
  };
}

export function getMeleeConfig() {
  return MELEE_CONFIG;
}
