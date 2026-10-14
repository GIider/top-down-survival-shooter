// Cheap per-run bookkeeping of damage dealt to the player by source; read by the balance sim.
export function recordPlayerDamage(gameState, source, amount) {
  if (!(amount > 0)) {
    return;
  }
  const stats = (gameState.damageBySource ??= {});
  stats[source] = (stats[source] || 0) + amount;
}

export function recordEnemyKill(gameState, type, xp) {
  const kills = (gameState.killsByType ??= {});
  kills[type] = (kills[type] || 0) + 1;
  const xpStats = (gameState.xpByType ??= {});
  xpStats[type] = (xpStats[type] || 0) + (xp || 0);
}
