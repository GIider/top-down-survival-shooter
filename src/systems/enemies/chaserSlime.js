import { moveEnemyWithTerrain, normalize } from "./common.js";

export function updateChaserSlimeBehavior(enemy, player, world, dt, speedMultiplier) {
  const dir = normalize(player.x - enemy.x, player.y - enemy.y);
  moveEnemyWithTerrain(enemy, dir, enemy.speed * speedMultiplier, dt, world);
}
