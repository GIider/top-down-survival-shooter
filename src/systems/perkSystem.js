import { GAME_CONFIG } from "../core/constants.js";
import { skillPerkCatalog } from "./perks/skillPerkCatalog.js";

const PERK_CONFIG = GAME_CONFIG.perks;
export const allPerks = skillPerkCatalog;

function pickRandom(pool) {
  if (pool.length <= 0) {
    return null;
  }
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function getPerkChoices(player, excludedPerkIds = []) {
  const excluded = new Set(excludedPerkIds);
  const pool = allPerks.filter((perk) => !player.ownedPerkIds.has(perk.id) && !excluded.has(perk.id));
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

export function applyPerk(player, perk) {
  if (player.ownedPerkIds.has(perk.id)) {
    return;
  }

  player.ownedPerks.push(perk);
  player.ownedPerkIds.add(perk.id);
  perk.apply(player);

  const newMaxHp = Math.max(PERK_CONFIG.minBaseMaxHp, GAME_CONFIG.player.baseHp + player.maxHpBonus);
  player.maxHp = newMaxHp;
  player.hp = Math.min(player.hp + PERK_CONFIG.applyHealOnPickup, newMaxHp);
}
