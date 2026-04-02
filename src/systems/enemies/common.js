import { GAME_CONFIG } from "../../core/constants.js";
import { getMovementSlowMultiplier, resolvePositionAgainstMountains } from "../worldSystem.js";

export function spawnFloatingText(gameState, text, x, y, color, size = 24, kind = "damage") {
  gameState.floatingTexts.push({
    text,
    x,
    y,
    vx: (Math.random() * 2 - 1) * 26,
    vy: -80 - Math.random() * 24,
    gravity: 42,
    elapsed: 0,
    duration: 0.68,
    color,
    size,
    kind,
  });
}

export function moveEnemyWithTerrain(enemy, dir, speed, dt, world, moveDirection = 1) {
  const treeSlow = getMovementSlowMultiplier(world, enemy.x, enemy.y, enemy.radius);
  const finalSpeed = speed * moveDirection * treeSlow;
  const nextX = enemy.x + dir.x * finalSpeed * dt;
  const nextY = enemy.y + dir.y * finalSpeed * dt;
  const resolved = resolvePositionAgainstMountains(world, nextX, nextY, enemy.radius);
  enemy.x = resolved.x;
  enemy.y = resolved.y;
}

export function normalize(dx, dy) {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

export function pickShooterAimPoint(originX, originY, player, playerVelocity, projectileSpeed) {
  const predictiveChance = GAME_CONFIG.enemies.ai.predictiveAimChance;
  if (Math.random() >= predictiveChance) {
    return { x: player.x, y: player.y };
  }

  const distance = Math.hypot(player.x - originX, player.y - originY);
  const travelTime = distance / Math.max(1, projectileSpeed);
  return {
    x: player.x + playerVelocity.x * travelTime,
    y: player.y + playerVelocity.y * travelTime,
  };
}
