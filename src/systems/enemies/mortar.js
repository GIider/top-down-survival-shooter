import { GAME_CONFIG } from "../../core/constants.js";
import { spawnIndicator } from "../indicatorSystem.js";
import { moveEnemyWithTerrain, normalize, spawnFloatingText } from "./common.js";

const AI_CONFIG = GAME_CONFIG.enemies.ai;
const ENEMY_CONFIG = GAME_CONFIG.enemies.archetypes;

function chooseMortarTarget(player, reservedTargets) {
  let bestTarget = { x: player.x, y: player.y };
  let bestSpacing = -Infinity;
  const targetJitter = AI_CONFIG.mortarTargetJitter;
  const targetSpread = AI_CONFIG.mortarTargetSpread;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = {
      x: player.x + (Math.random() * 2 - 1) * targetJitter,
      y: player.y + (Math.random() * 2 - 1) * targetJitter,
    };

    let closest = Infinity;
    for (let index = 0; index < reservedTargets.length; index += 1) {
      const target = reservedTargets[index];
      const distance = Math.hypot(candidate.x - target.x, candidate.y - target.y);
      if (distance < closest) {
        closest = distance;
      }
    }

    if (closest > bestSpacing) {
      bestSpacing = closest;
      bestTarget = candidate;
    }

    if (closest >= targetSpread) {
      return candidate;
    }
  }

  return bestTarget;
}

export function updateMortarBehavior(gameState, enemy, player, world, dt, speedMultiplier, reservedMortarTargets) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dir = normalize(dx, dy);
  const tooClose = distance < enemy.preferredDistance - 36;
  const tooFar = distance > enemy.preferredDistance + 36;
  const moveDirection = tooClose ? -1 : tooFar ? 0.65 : 0;
  moveEnemyWithTerrain(enemy, dir, enemy.speed * speedMultiplier, dt, world, moveDirection);

  enemy.throwTimer += dt;
  if (enemy.throwTimer < enemy.throwCooldown || distance > enemy.throwRange) {
    return;
  }

  const dangerRadius = AI_CONFIG.mortarDangerRadius;
  enemy.throwTimer = 0;
  const target = chooseMortarTarget(player, reservedMortarTargets);
  reservedMortarTargets.push(target);

  spawnIndicator(gameState.indicators, {
    type: "circle",
    position: target,
    size: { radius: dangerRadius },
    duration: AI_CONFIG.mortarTelegraphDuration,
    source: "mortar",
    onTrigger() {
      const hit = Math.hypot(player.x - target.x, player.y - target.y) <= dangerRadius;
      if (hit) {
        const damage = ENEMY_CONFIG.mortar.impactDamage;
        player.hp -= damage;
        spawnFloatingText(gameState, `-${damage}`, player.x, player.y - player.radius - 8, "255,142,150", 22, "damage");
        gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 2.4);
        gameState.screenFx.damageFlash = Math.min(1, gameState.screenFx.damageFlash + 0.22);
      }

      gameState.effects.push(
        {
          x: target.x,
          y: target.y,
          radius: 18,
          elapsed: 0,
          duration: 0.38,
          growth: 30,
          color: "255, 146, 96",
        },
        {
          x: target.x,
          y: target.y,
          radius: dangerRadius * 0.62,
          elapsed: 0,
          duration: 0.5,
          growth: 14,
          color: "255, 214, 130",
        }
      );
    },
  });
}
