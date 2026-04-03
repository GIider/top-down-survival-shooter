import { GAME_CONFIG } from "../core/constants.js";
import { PERK_HOOKS } from "./perks/contracts.js";

export function updatePlayerRuntime(gameState, dt) {
  const player = gameState.player;
  const perkEngine = gameState.systems?.perkEngine;
  const maxHp = player.maxHp + player.maxHpBonus;
  const regenCap = maxHp * 0.5;

  player.perfectReloadMoveBoostTimer = Math.max(0, player.perfectReloadMoveBoostTimer - dt);
  player.moveSpeedTemporaryMultiplier = player.perfectReloadMoveBoostTimer > 0 ? 1.1 : 1;
  player.shoutCooldownRemaining = Math.max(0, player.shoutCooldownRemaining - dt);
  player.fireballCooldownRemaining = Math.max(0, player.fireballCooldownRemaining - dt);

  const regenContext = {
    regenToHalfMaxHpPerSecond: 0,
    player,
    gameState,
    dt,
  };
  const finalizedRegenContext = perkEngine
    ? perkEngine.runTransformHook(PERK_HOOKS.onPlayerRuntimeUpdate, regenContext, player)
    : regenContext;

  if (finalizedRegenContext.regenToHalfMaxHpPerSecond > 0 && player.hp < regenCap) {
    player.hp = Math.min(regenCap, player.hp + maxHp * finalizedRegenContext.regenToHalfMaxHpPerSecond * dt);
  }
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