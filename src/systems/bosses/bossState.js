// Shared runtime state for the boss framework: active boss, queue, scripted timers/emitters, beams.
// Lives in its own module so patterns, the boss system and the renderer can all use it without import cycles.

export function ensureBossState(gameState) {
  if (!gameState.systems) {
    gameState.systems = {};
  }
  if (!gameState.systems.boss) {
    gameState.systems.boss = {
      activeBoss: null,
      active: [],
      nextUid: 1,
      queue: [],
      entries: null,
      warning: null,
      banner: null,
      modifier: null,
      timers: [],
      emitters: [],
      beams: [],
      spawnCounts: {},
    };
  }
  return gameState.systems.boss;
}

// Run `fn` after `delay` seconds (cleared automatically on phase change / boss death).
export function addBossTimer(gameState, delay, fn, owner = null) {
  ensureBossState(gameState).timers.push({ remaining: delay, fn, owner });
}

// Emitter: calls fire(elapsed, shotIndex) every `interval` seconds and update(dt, elapsed) every frame
// for `duration` seconds, then onEnd().
export function addBossEmitter(gameState, emitter) {
  ensureBossState(gameState).emitters.push({ elapsed: 0, acc: emitter.interval || 0, shots: 0, ...emitter });
}

export function tickBossScripts(gameState, dt) {
  const state = ensureBossState(gameState);

  for (let i = state.timers.length - 1; i >= 0; i -= 1) {
    const timer = state.timers[i];
    if (!timer) {
      continue;
    }
    timer.remaining -= dt;
    if (timer.remaining <= 0) {
      state.timers.splice(i, 1);
      timer.fn();
    }
  }

  for (let i = state.emitters.length - 1; i >= 0; i -= 1) {
    const emitter = state.emitters[i];
    if (!emitter) {
      continue;
    }
    emitter.elapsed += dt;
    if (emitter.fire && emitter.interval > 0) {
      emitter.acc += dt;
      while (emitter.acc >= emitter.interval) {
        emitter.acc -= emitter.interval;
        emitter.fire(Math.min(emitter.elapsed, emitter.duration), emitter.shots);
        emitter.shots += 1;
      }
    }
    if (emitter.update) {
      emitter.update(dt, Math.min(emitter.elapsed, emitter.duration));
    }
    if (emitter.elapsed >= emitter.duration) {
      const index = state.emitters.indexOf(emitter);
      if (index >= 0) {
        state.emitters.splice(index, 1);
      }
      if (emitter.onEnd) {
        emitter.onEnd();
      }
    }
  }
}

// Drops pending boss scripts, telegraphs and (optionally) bullets. Bullets become small sparkles.
// With `owner` (a boss uid) only that boss's attacks are removed; without it everything goes.
export function clearBossAttacks(gameState, { bullets = true, owner = null } = {}) {
  const state = ensureBossState(gameState);
  const mine = (item) => owner === null || item.owner === owner;
  state.timers = state.timers.filter((item) => !mine(item));
  state.emitters = state.emitters.filter((item) => !mine(item));
  state.beams = state.beams.filter((item) => !mine(item));
  gameState.indicators = gameState.indicators.filter((indicator) => indicator.source !== "boss" || (owner !== null && indicator.owner !== owner));

  if (!bullets) {
    return;
  }
  for (let i = gameState.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = gameState.projectiles[i];
    if (projectile.source !== "boss" || (owner !== null && projectile.bossUid !== owner)) {
      continue;
    }
    gameState.effects.push({
      x: projectile.position.x,
      y: projectile.position.y,
      radius: Math.max(4, projectile.radius * 1.4),
      elapsed: 0,
      duration: 0.2,
      growth: 10,
      color: "255, 190, 245",
    });
    gameState.projectiles.splice(i, 1);
  }
}
