import { CANVAS } from "../core/constants.js";
import { createGameServices } from "../core/gameServices.js";
import { createSimContext } from "../core/simStep.js";
import { createInitialState } from "../core/state.js";
import { createPerkEngine } from "../systems/perks/perkEngine.js";
import { createWeaponSystem } from "../systems/weaponSystem.js";
import { createWorldSystem } from "../systems/worldSystem.js";

/**
 * Builds a DOM-free game instance mirroring the bootstrap in src/main.js.
 * Call inside withSeededRandom() so spawn/loot RNG is reproducible.
 */
export function createHeadlessGame({ seed = 1, startWeapon = 2 } = {}) {
  const gameState = createInitialState();
  gameState.titleScreen = false;
  gameState.running = true;
  gameState.paused = false;
  gameState.runStats.startedAt = 1;

  const perkEngine = createPerkEngine();
  gameState.systems.perkEngine = perkEngine;
  const weaponSystem = createWeaponSystem(gameState.player);
  gameState.systems.weaponSystem = weaponSystem;
  gameState.systems.world = createWorldSystem(seed >>> 0);

  const services = createGameServices({ gameState, canvas: CANVAS, documentRef: null, isDebugMode: false });
  services.setWeaponSystem(weaponSystem);
  services.setPerkEngine(perkEngine);
  services.setWorld(gameState.systems.world);
  weaponSystem.switchWeapon(startWeapon);

  const ctx = createSimContext({ gameState, services });
  return { gameState, services, ctx, weaponSystem, perkEngine, player: gameState.player };
}
