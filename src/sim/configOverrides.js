import { BALANCE, GAME_CONFIG } from "../core/constants.js";
import { PICKUP_DEFS } from "../systems/pickups/pickupCatalog.js";

function resolveParent(root, segments) {
  let node = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (Array.isArray(node)) {
      node = node.find((entry) => entry.type === segment || entry.id === segment || entry.boss === segment);
    } else {
      node = node?.[segment];
    }
    if (node === undefined || node === null) {
      throw new Error(`Config override path not found at "${segment}" in ${segments.join(".")}`);
    }
  }
  return node;
}

/**
 * Applies { "enemies.spawn.weights.mortar.weight": 16, ... } to GAME_CONFIG in place
 * (array entries are addressed by their `type`/`id`/`boss`; `pickups.*` maps to PICKUP_DEFS). Returns a restore function.
 * `balance.*` keys are mirrored into BALANCE, which is a copy taken at import time.
 */
export function applyConfigOverrides(overrides = {}) {
  const restores = [];
  for (const [path, value] of Object.entries(overrides)) {
    const segments = path.split(".");
    // "pickups.health.healAmount" addresses PICKUP_DEFS, which lives outside GAME_CONFIG
    const root = segments[0] === "pickups" ? { pickups: PICKUP_DEFS } : GAME_CONFIG;
    const parent = resolveParent(root, segments);
    const key = segments[segments.length - 1];
    const target = Array.isArray(parent) ? parent.find((e) => e.type === key || e.id === key) : parent;
    const prop = Array.isArray(parent) ? null : key;
    if (prop === null || !(prop in target)) {
      throw new Error(`Config override path not found: ${path}`);
    }
    const previous = target[prop];
    target[prop] = value;
    restores.push(() => {
      target[prop] = previous;
    });
    if (segments[0] === "balance" && segments.length === 2 && segments[1] in BALANCE) {
      const previousBalance = BALANCE[segments[1]];
      BALANCE[segments[1]] = value;
      restores.push(() => {
        BALANCE[segments[1]] = previousBalance;
      });
    }
  }
  return () => {
    for (let i = restores.length - 1; i >= 0; i -= 1) {
      restores[i]();
    }
  };
}
