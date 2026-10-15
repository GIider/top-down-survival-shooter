import { BALANCE, GAME_CONFIG } from "../../core/constants.js";
import { maybeSpawnPickupOnEnemyDeath } from "../pickups/index.js";
import { playSfx } from "../../audio/sfx.js";
import { getBossDef } from "./bossCatalog.js";
import { clearBossAttacks, ensureBossState, tickBossScripts } from "./bossState.js";

/*
 * Boss definition contract (see kaleidoscope.js for a full example):
 *   id, name, warningDuration, transitionDuration
 *   spawnModifier        - applied to the regular spawner while the boss lives (overridable per phase)
 *   create(gameState, difficulty, x, y) -> enemy-shaped object (hp/maxHp/radius/color/contactDamage/xp/...)
 *   phases[]             - [{ name, hpBelow (fraction of max HP), tint, spawnModifier?, ...custom }]
 *   update({ gameState, boss, player, world, dt, phase, playerVelocity })  - movement + attack scheduling
 *
 * Spawn modifier shape: { spawnRateMultiplier, maxEnemiesMultiplier, allowedTypes|null, blockedTypes, clearExisting: "fade"|"none" }
 * Triggers live in GAME_CONFIG.bosses.schedule: { boss, trigger: { type: time|kills|level|custom, at, repeat?, test? }, maxSpawns? }
 */

const BOSS_CONFIG = GAME_CONFIG.bosses;
const SPAWN_DISTANCE = 420;

function getEntries(gameState, state) {
  if (!state.entries) {
    state.entries = BOSS_CONFIG.schedule.map((entry) => ({
      nextAt: entry.trigger.type === "custom" ? 0 : entry.trigger.at ?? 0,
      spawns: 0,
      pending: false,
    }));
  }
  return state.entries;
}

function triggerMetric(gameState, trigger) {
  if (trigger.type === "kills") {
    return gameState.runStats.kills;
  }
  if (trigger.type === "level") {
    return gameState.player.level;
  }
  return gameState.time;
}

function isTriggered(gameState, entry, config) {
  const trigger = config.trigger;
  if (trigger.type === "custom") {
    return gameState.time >= entry.nextAt && Boolean(trigger.test && trigger.test(gameState));
  }
  return triggerMetric(gameState, trigger) >= entry.nextAt;
}

function fadeExistingEnemies(gameState) {
  for (let i = gameState.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = gameState.enemies[i];
    if (enemy.isBoss) {
      continue;
    }
    gameState.effects.push({ x: enemy.x, y: enemy.y, radius: Math.max(enemy.radius, 10), elapsed: 0, duration: 0.3, growth: 22, color: "200, 170, 255" });
    gameState.enemies.splice(i, 1);
  }
}

function setBanner(state, text, sub, duration, kind) {
  state.banner = { text, sub, timer: duration, duration, kind };
}

function enterPhase(gameState, boss, def, index, withTransition) {
  const state = ensureBossState(gameState);
  const phase = def.phases[index];
  boss.phaseIndex = index;
  boss.color = phase.tint || boss.color;
  boss.scratch.cooldown = undefined;
  boss.modifier = phase.spawnModifier || def.spawnModifier || null;
  clearBossAttacks(gameState, { owner: boss.uid });

  if (withTransition) {
    boss.invulnerableTimer = def.transitionDuration || 0;
    boss.lockedHp = boss.hp;
    gameState.effects.push(
      { x: boss.x, y: boss.y, radius: boss.radius, elapsed: 0, duration: 0.6, growth: 160, color: "255, 190, 245" },
      { x: boss.x, y: boss.y, radius: boss.radius, elapsed: 0, duration: 0.9, growth: 90, color: "197, 140, 255" }
    );
    gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 8);
    gameState.screenFx.actionFlash = Math.min(1, gameState.screenFx.actionFlash + 0.3);
    playSfx("explosion", { volume: 0.9 });
    setBanner(state, phase.name.toUpperCase(), def.name, 2, "phase");
  }
}

export function getActiveBoss(gameState) {
  return gameState.systems?.boss?.activeBoss || null;
}

export function getActiveBosses(gameState) {
  return gameState.systems?.boss?.active || [];
}

// activeBoss stays as "the first living boss" for HUD/sim code that only cares about one.
function syncActive(state) {
  state.activeBoss = state.active[0] || null;
}

function removeActive(state, boss) {
  const index = state.active.indexOf(boss);
  if (index >= 0) {
    state.active.splice(index, 1);
  }
  syncActive(state);
}

export function spawnBoss(gameState, id, entryIndex = -1, { allowDuplicate = false } = {}) {
  const def = getBossDef(id);
  const state = ensureBossState(gameState);
  if (!def || (!allowDuplicate && state.active.some((boss) => boss.bossId === id))) {
    return null;
  }

  const player = gameState.player;
  const angle = Math.random() * Math.PI * 2;
  const difficulty = gameState.time * BALANCE.spawnScaling;
  const boss = def.create(gameState, difficulty, player.x + Math.cos(angle) * SPAWN_DISTANCE, player.y + Math.sin(angle) * SPAWN_DISTANCE);
  Object.assign(boss, {
    isBoss: true,
    bossId: id,
    name: def.name,
    phaseMarkers: def.phases.slice(1).map((phase) => phase.hpBelow),
    entryIndex,
    arena: def.arena || null,
    uid: state.nextUid++,
    modifier: null,
    skipRecycle: true,
    immuneToCC: true,
    isRespawning: false,
    offscreenTime: 0,
    spawnBoostTimer: 0,
    phaseIndex: -1,
    invulnerableTimer: 0,
    lockedHp: boss.hp,
    age: 0,
    scratch: {},
  });

  const initialModifier = def.phases[0].spawnModifier || def.spawnModifier;
  if (initialModifier?.clearExisting === "fade") {
    fadeExistingEnemies(gameState);
  }

  gameState.enemies.push(boss);
  state.active.push(boss);
  syncActive(state);
  state.spawnCounts[id] = (state.spawnCounts[id] || 0) + 1;
  enterPhase(gameState, boss, def, 0, false);
  setBanner(state, def.name.toUpperCase(), "has awoken", 2.5, "spawn");
  playSfx("explosion", { volume: 0.8 });
  return boss;
}

function combineModifiers(modifiers) {
  if (modifiers.length === 0) {
    return null;
  }
  if (modifiers.length === 1) {
    return modifiers[0];
  }
  const combined = { spawnRateMultiplier: 1, maxEnemiesMultiplier: 1, allowedTypes: null, blockedTypes: [] };
  const unionAllowed = new Set();
  modifiers.forEach((modifier) => {
    combined.spawnRateMultiplier = Math.min(combined.spawnRateMultiplier, modifier.spawnRateMultiplier ?? 1);
    combined.maxEnemiesMultiplier = Math.min(combined.maxEnemiesMultiplier, modifier.maxEnemiesMultiplier ?? 1);
    if (modifier.allowedTypes) {
      modifier.allowedTypes.forEach((type) => unionAllowed.add(type));
      combined.allowedTypes = combined.allowedTypes
        ? combined.allowedTypes.filter((type) => modifier.allowedTypes.includes(type))
        : [...modifier.allowedTypes];
    }
    (modifier.blockedTypes || []).forEach((type) => combined.blockedTypes.push(type));
  });
  if (combined.allowedTypes && combined.allowedTypes.length === 0) {
    combined.allowedTypes = [...unionAllowed];
  }
  return combined;
}

// Regular-spawner hook: returns the active modifier (or a hold during the warning) or null.
export function getSpawnModifier(gameState) {
  const state = gameState.systems?.boss;
  if (!state) {
    return null;
  }
  if (state.active.length > 0) {
    return combineModifiers(state.active.map((boss) => boss.modifier).filter(Boolean));
  }
  if (state.warning) {
    return { spawnRateMultiplier: 0 };
  }
  return null;
}

export function updateBossDirector(gameState, dt, { enabled = true } = {}) {
  const state = ensureBossState(gameState);

  if (state.banner) {
    state.banner.timer -= dt;
    if (state.banner.timer <= 0) {
      state.banner = null;
    }
  }

  tickBossScripts(gameState, dt);

  for (let i = state.active.length - 1; i >= 0; i -= 1) {
    const boss = state.active[i];
    if (!gameState.enemies.includes(boss)) {
      // Removed by something other than killEnemy (e.g. debug wipe).
      removeActive(state, boss);
      clearBossAttacks(gameState, { owner: boss.uid });
    }
  }

  if (enabled) {
    const entries = getEntries(gameState, state);
    BOSS_CONFIG.schedule.forEach((config, index) => {
      const entry = entries[index];
      if (entry.pending || entry.spawns >= (config.maxSpawns ?? Infinity)) {
        return;
      }
      if (isTriggered(gameState, entry, config)) {
        entry.pending = true;
        state.queue.push(index);
      }
    });
  }

  if (state.warning) {
    state.warning.timer -= dt;
    if (state.warning.timer <= 0) {
      const { entryIndex, id } = state.warning;
      state.warning = null;
      if (entryIndex >= 0) {
        getEntries(gameState, state)[entryIndex].spawns += 1;
      }
      spawnBoss(gameState, id, entryIndex);
    }
  } else if (state.queue.length > 0) {
    const entryIndex = state.queue.shift();
    const config = BOSS_CONFIG.schedule[entryIndex];
    const def = getBossDef(config.boss);
    if (def && state.active.some((boss) => boss.bossId === def.id)) {
      // Same boss still alive: retry once it is gone.
      state.queue.push(entryIndex);
    } else if (def) {
      const duration = def.warningDuration ?? BOSS_CONFIG.warningDuration;
      state.warning = { entryIndex, id: def.id, name: def.name, timer: duration, duration };
      playSfx("nuke", { volume: 0.5 });
    }
  }
}

// Called from the enemy update loop for entities with isBoss.
export function updateBoss(gameState, boss, player, world, dt, playerVelocity) {
  const def = getBossDef(boss.bossId);
  if (!def) {
    return;
  }

  boss.age += dt;
  if (boss.invulnerableTimer > 0) {
    boss.invulnerableTimer -= dt;
    boss.hp = Math.max(boss.hp, boss.lockedHp);
  }

  const ratio = boss.hp / boss.maxHp;
  const next = def.phases[boss.phaseIndex + 1];
  if (next && ratio <= next.hpBelow) {
    enterPhase(gameState, boss, def, boss.phaseIndex + 1, true);
  }

  def.update({ gameState, boss, player, world, dt, phase: def.phases[boss.phaseIndex], playerVelocity });
}

// Called from killEnemy once the boss' HP is gone.
export function onBossKilled(gameState, boss, player) {
  const state = ensureBossState(gameState);
  const def = getBossDef(boss.bossId);
  clearBossAttacks(gameState, { owner: boss.uid });
  removeActive(state, boss);
  gameState.runStats.bossKills = (gameState.runStats.bossKills || 0) + 1;

  const entries = getEntries(gameState, state);
  const entry = boss.entryIndex >= 0 ? entries[boss.entryIndex] : null;
  if (entry) {
    const trigger = BOSS_CONFIG.schedule[boss.entryIndex].trigger;
    entry.pending = false;
    entry.nextAt = trigger.repeat ? triggerMetric(gameState, trigger) + trigger.repeat : Infinity;
  }

  const healBase = GAME_CONFIG.drops.heal;
  for (let i = 0; i < 2; i += 1) {
    const angle = Math.PI * i + Math.random();
    gameState.drops.push({
      position: { x: boss.x + Math.cos(angle) * 40, y: boss.y + Math.sin(angle) * 40 },
      type: "heal",
      value: healBase.baseValue * 2,
      lifetime: 20,
      radius: healBase.radius,
    });
  }
  const bonusDrop = { x: boss.x, y: boss.y, pickupDropMultiplier: 10 };
  for (let i = 0; i < 2; i += 1) {
    maybeSpawnPickupOnEnemyDeath(gameState, bonusDrop, gameState.time * BALANCE.spawnScaling, gameState.systems.weaponSystem, null);
  }

  gameState.effects.push(
    { x: boss.x, y: boss.y, radius: boss.radius, elapsed: 0, duration: 0.8, growth: 220, color: "255, 190, 245" },
    { x: boss.x, y: boss.y, radius: boss.radius, elapsed: 0, duration: 1.1, growth: 120, color: "197, 140, 255" }
  );
  gameState.screenFx.shake = 14;
  gameState.screenFx.actionFlash = 1;
  playSfx("levelUp", { volume: 0.9 });
  setBanner(state, "BOSS DEFEATED", def ? def.name : "", BOSS_CONFIG.defeatBannerDuration, "defeat");
}
