import { kaleidoscope } from "./kaleidoscope.js";

// Register new bosses here. See bossSystem.js for the definition contract.
export const BOSS_CATALOG = [kaleidoscope];

export function getBossDef(id) {
  return BOSS_CATALOG.find((def) => def.id === id) || null;
}
