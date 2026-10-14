import { hypot2 } from "../core/mathUtil.js";
export function updatePlayerMovement(player, movement, dt, options = {}) {
  const magnitude = hypot2(movement.x, movement.y) || 1;
  // Analog sticks may be below full tilt; keyboard diagonals (magnitude > 1) still normalize to 1.
  const strength = Math.min(1, hypot2(movement.x, movement.y));
  const nx = (movement.x / magnitude) * strength;
  const ny = (movement.y / magnitude) * strength;
  const terrainMultiplier = options.terrainMultiplier ?? 1;
  const temporaryMultiplier = player.moveSpeedTemporaryMultiplier ?? 1;
  const pickupSpeedMultiplier = player.pickupMoveSpeedMultiplier ?? 1;

  player.x += nx * player.speed * player.moveSpeedMultiplier * temporaryMultiplier * pickupSpeedMultiplier * terrainMultiplier * dt;
  player.y += ny * player.speed * player.moveSpeedMultiplier * temporaryMultiplier * pickupSpeedMultiplier * terrainMultiplier * dt;

  if (typeof options.resolveCollision === "function") {
    options.resolveCollision(player);
  }
}

export function getPlayerDamageMultiplier(player) {
  return (player.damageMultiplier ?? 1) * (player.pickupDamageMultiplier ?? 1);
}

export function scaleDamageAgainstEnemy(player, enemy, damage) {
  void player;
  void enemy;
  return damage;
}
