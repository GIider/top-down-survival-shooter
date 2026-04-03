import { perkRegistry } from "./perkRegistry.js";

function getOwnedPerkIds(player) {
  if (!player?.ownedPerkIds) {
    return [];
  }
  return Array.from(player.ownedPerkIds).sort();
}

export function createPerkEngine() {
  let cachedPlayerSignature = "";
  let cachedHooks = new Map();
  const debug = {
    activePerkCount: 0,
    invocationsThisFrame: 0,
    lastInvocation: "none",
    seenHookNames: new Set(),
  };

  function invalidate() {
    cachedPlayerSignature = "";
    cachedHooks = new Map();
  }

  function resetFrameDebug() {
    debug.invocationsThisFrame = 0;
    debug.lastInvocation = "none";
    debug.seenHookNames.clear();
  }

  function buildHooksForPlayer(player) {
    const perkIds = getOwnedPerkIds(player);
    const signature = perkIds.join("|");
    debug.activePerkCount = perkIds.length;
    if (signature === cachedPlayerSignature) {
      return cachedHooks;
    }

    const hookMap = new Map();

    for (let i = 0; i < perkIds.length; i += 1) {
      const perkDef = perkRegistry.get(perkIds[i]);
      if (!perkDef?.hooks) {
        continue;
      }

      const priority = Number.isFinite(perkDef.priority) ? perkDef.priority : 100;
      for (const [hookName, handler] of Object.entries(perkDef.hooks)) {
        if (typeof handler !== "function") {
          continue;
        }
        if (!hookMap.has(hookName)) {
          hookMap.set(hookName, []);
        }
        hookMap.get(hookName).push({ priority, handler, perkId: perkDef.id });
      }
    }

    hookMap.forEach((entries, hookName) => {
      entries.sort((a, b) => a.priority - b.priority || a.perkId.localeCompare(b.perkId));
      hookMap.set(hookName, entries);
    });

    cachedPlayerSignature = signature;
    cachedHooks = hookMap;
    return hookMap;
  }

  function runTransformHook(hookName, context, player) {
    const hooks = buildHooksForPlayer(player).get(hookName);
    if (!hooks || hooks.length === 0) {
      return context;
    }
    for (let i = 0; i < hooks.length; i += 1) {
      hooks[i].handler(context);
      debug.invocationsThisFrame += 1;
      debug.lastInvocation = `${hookName}:${hooks[i].perkId}`;
      debug.seenHookNames.add(hookName);
    }
    return context;
  }

  function emitSideEffectHook(hookName, payload, player) {
    const hooks = buildHooksForPlayer(player).get(hookName);
    if (!hooks || hooks.length === 0) {
      return;
    }
    for (let i = 0; i < hooks.length; i += 1) {
      hooks[i].handler(payload);
      debug.invocationsThisFrame += 1;
      debug.lastInvocation = `${hookName}:${hooks[i].perkId}`;
      debug.seenHookNames.add(hookName);
    }
  }

  function getDebugSnapshot() {
    return {
      activePerkCount: debug.activePerkCount,
      invocationsThisFrame: debug.invocationsThisFrame,
      lastInvocation: debug.lastInvocation,
      uniqueHookCount: debug.seenHookNames.size,
    };
  }

  return {
    invalidate,
    resetFrameDebug,
    getDebugSnapshot,
    runTransformHook,
    emitSideEffectHook,
  };
}
