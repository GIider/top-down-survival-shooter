import { GAME_CONFIG } from "../config/gameConfig.js";

export const CANVAS = GAME_CONFIG.canvas;
export const TAGS = GAME_CONFIG.perks.tags;
export const BALANCE = {
  ...GAME_CONFIG.balance,
  perfectReloadWindow: GAME_CONFIG.weapons.gun.perfectReloadWindow,
  playerSpeed: GAME_CONFIG.player.speed,
  playerRadius: GAME_CONFIG.player.radius,
  baseWeapon: GAME_CONFIG.weapons.gun,
};

export { GAME_CONFIG };
