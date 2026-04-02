import { BALANCE, GAME_CONFIG } from "../core/constants.js";

const HEAL_DROP_CONFIG = GAME_CONFIG.drops.heal;

export function maybeSpawnHealDrop(dropList, x, y, difficulty) {
  if (Math.random() > BALANCE.healDropChance) {
    return;
  }

  dropList.push({
    position: { x, y },
    type: "heal",
    value: HEAL_DROP_CONFIG.baseValue + difficulty * HEAL_DROP_CONFIG.difficultyScale,
    lifetime: HEAL_DROP_CONFIG.lifetime,
    radius: HEAL_DROP_CONFIG.radius,
  });
}

export function updateDrops(dropList, dt) {
  for (let index = dropList.length - 1; index >= 0; index -= 1) {
    const drop = dropList[index];
    drop.lifetime -= dt;
    if (drop.lifetime <= 0) {
      dropList.splice(index, 1);
    }
  }
}

export function tryPickupDrops(dropList, player) {
  const pickupRadius = player.radius + HEAL_DROP_CONFIG.pickupBaseBonus + player.pickupRadiusBonus;

  for (let index = dropList.length - 1; index >= 0; index -= 1) {
    const drop = dropList[index];
    const dx = drop.position.x - player.x;
    const dy = drop.position.y - player.y;

    if (Math.hypot(dx, dy) <= pickupRadius + drop.radius) {
      if (drop.type === "heal") {
        const maxHp = player.maxHp + player.maxHpBonus;
        player.hp = Math.min(maxHp, player.hp + drop.value);
      }
      dropList.splice(index, 1);
    }
  }
}
