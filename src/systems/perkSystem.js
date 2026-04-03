import { GAME_CONFIG } from "../core/constants.js";
import { skillPerkCatalog } from "./perks/skillPerkCatalog.js";
import { PERK_HOOKS } from "./perks/contracts.js";

const PERK_CONFIG = GAME_CONFIG.perks;
export const allPerks = skillPerkCatalog;

function pickRandom(pool) {
  if (pool.length <= 0) {
    return null;
  }
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function getPerkChoices(player, excludedPerkIds = [], disabledPerkIds = []) {
  const excluded = new Set(excludedPerkIds);
  const disabled = new Set(disabledPerkIds);
  const pool = allPerks.filter((perk) => !player.ownedPerkIds.has(perk.id) && !excluded.has(perk.id) && !disabled.has(perk.id));
  const selected = [];
  const remaining = [...pool];

  while (selected.length < 3 && remaining.length > 0) {
    const pick = pickRandom(remaining);
    if (!pick) {
      break;
    }
    selected.push(pick);
    const index = remaining.findIndex((entry) => entry.id === pick.id);
    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }

  return selected;
}

export function applyPerk(player, perk, options = {}) {
  if (player.ownedPerkIds.has(perk.id)) {
    return;
  }

  player.ownedPerks.push(perk);
  player.ownedPerkIds.add(perk.id);
  if (options.perkEngine && typeof options.perkEngine.invalidate === "function") {
    options.perkEngine.invalidate();
    options.perkEngine.emitSideEffectHook(
      PERK_HOOKS.onPerkApplied,
      {
        player,
        perkId: perk.id,
      },
      player
    );
  }

  const newMaxHp = Math.max(PERK_CONFIG.minBaseMaxHp, GAME_CONFIG.player.baseHp + player.maxHpBonus);
  player.maxHp = newMaxHp;
  player.hp = Math.min(player.hp + PERK_CONFIG.applyHealOnPickup, newMaxHp);
}
