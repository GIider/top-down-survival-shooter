import { GAME_CONFIG } from "../core/constants.js";

export function updatePlayerRuntime(gameState, dt) {
  const player = gameState.player;
  player.perfectReloadMoveBoostTimer = Math.max(0, player.perfectReloadMoveBoostTimer - dt);
  player.moveSpeedTemporaryMultiplier = player.perfectReloadMoveBoostTimer > 0 ? 1.1 : 1;
  player.shoutCooldownRemaining = Math.max(0, player.shoutCooldownRemaining - dt);
  player.fireballCooldownRemaining = Math.max(0, player.fireballCooldownRemaining - dt);
}

export function applyPendingLevelUps(gameState, eventBus = null) {
  while (gameState.player.xp >= gameState.player.xpToNext) {
    const previousLevel = gameState.player.level;
    gameState.player.xp -= gameState.player.xpToNext;
    gameState.player.level += 1;
    gameState.player.xpToNext = Math.floor(gameState.player.xpToNext * GAME_CONFIG.player.levelUpXpMultiplier);
    gameState.player.perkPoints += GAME_CONFIG.player.levelUpPerkPoints;
    eventBus?.emit("player:leveled-up", {
      previousLevel,
      level: gameState.player.level,
      perkPoints: gameState.player.perkPoints,
    });
  }
}