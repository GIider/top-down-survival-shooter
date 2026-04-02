import { GAME_CONFIG } from "../../core/constants.js";
import { spawnIndicator } from "../indicatorSystem.js";
import { moveEnemyWithTerrain, normalize, spawnFloatingText } from "./common.js";

const AI_CONFIG = GAME_CONFIG.enemies.ai;
const BOMBER_CONFIG = GAME_CONFIG.enemies.archetypes.bomber;

function explodeBomber(gameState, enemy, player, enemyIndex) {
  const radius = enemy.explosionRadius || BOMBER_CONFIG.explosionRadius;
  const damage = enemy.explosionDamage || BOMBER_CONFIG.explosionDamage;
  const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);

  if (distance <= radius) {
    player.hp -= damage;
    spawnFloatingText(gameState, `-${damage}`, player.x, player.y - player.radius - 8, "255,142,150", 22, "damage");
    gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 2.3);
    gameState.screenFx.damageFlash = Math.min(1, gameState.screenFx.damageFlash + 0.2);
  }

  gameState.effects.push(
    {
      x: enemy.x,
      y: enemy.y,
      radius: 16,
      elapsed: 0,
      duration: 0.34,
      growth: 34,
      color: "255, 118, 140",
    },
    {
      x: enemy.x,
      y: enemy.y,
      radius: radius * 0.52,
      elapsed: 0,
      duration: 0.45,
      growth: 14,
      color: "255, 190, 162",
    }
  );

  gameState.enemies.splice(enemyIndex, 1);
}

export function updateBomberBehavior(gameState, enemy, enemyIndex, player, world, dt, speedMultiplier) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dir = normalize(dx, dy);
  const detonationDistance = player.radius + enemy.radius + (enemy.detonationRange || BOMBER_CONFIG.detonationRange);

  if (!enemy.isPrimed && distance <= detonationDistance) {
    enemy.isPrimed = true;
    enemy.fuseTimer = enemy.fuseDuration;
    spawnIndicator(gameState.indicators, {
      type: "circle",
      position: { x: enemy.x, y: enemy.y },
      size: { radius: enemy.explosionRadius },
      duration: enemy.fuseDuration,
    });
  }

  if (!enemy.isPrimed) {
    moveEnemyWithTerrain(enemy, dir, enemy.speed * speedMultiplier, dt, world);
    return false;
  }

  moveEnemyWithTerrain(enemy, dir, enemy.speed * speedMultiplier, dt, world, AI_CONFIG.bomberSlowFactorWhenPrimed);
  enemy.fuseTimer -= dt;
  if (enemy.fuseTimer <= 0) {
    explodeBomber(gameState, enemy, player, enemyIndex);
    return true;
  }

  return false;
}
