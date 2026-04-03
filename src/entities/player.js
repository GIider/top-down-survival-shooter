export function updatePlayerMovement(player, movement, dt, options = {}) {
  const magnitude = Math.hypot(movement.x, movement.y) || 1;
  const nx = movement.x / magnitude;
  const ny = movement.y / magnitude;
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
  if ((enemy?.stunnedTimer || 0) > 0) {
    return damage * (player.stunnedTargetDamageMultiplier ?? 1);
  }
  return damage;
}

export function gainXp(player, amount) {
  player.xp += amount;

  let leveledUp = false;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.floor(player.xpToNext * 1.5);
    leveledUp = true;
  }

  return leveledUp;
}
