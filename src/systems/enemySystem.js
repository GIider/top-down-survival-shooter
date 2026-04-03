import { BALANCE, CANVAS, GAME_CONFIG } from "../core/constants.js";
import { createEnemy } from "../entities/enemy.js";
import { resolvePositionAgainstMountains } from "./worldSystem.js";
import { updateAssaultShooterBehavior } from "./enemies/assaultShooter.js";
import { updateBomberBehavior } from "./enemies/bomber.js";
import { updateChaserSlimeBehavior } from "./enemies/chaserSlime.js";
import { updateMortarBehavior } from "./enemies/mortar.js";
import { updateShooterBehavior } from "./enemies/shooter.js";
import { updateShotgunShooterBehavior } from "./enemies/shotgunShooter.js";
import { computeFlyingBomberPath, updateFlyingBomberBehavior } from "./enemies/flyingBomber.js";

const SPAWN_CONFIG = GAME_CONFIG.enemies.spawn;
const AI_CONFIG = GAME_CONFIG.enemies.ai;
const RECYCLE_DISTANCE = Math.max(CANVAS.width, CANVAS.height) * SPAWN_CONFIG.recycleDistanceMultiplier;
const OFFSCREEN_RESPAWN_AFTER = SPAWN_CONFIG.offscreenRespawnAfter;
const ENEMY_SPAWN_WEIGHTS = SPAWN_CONFIG.weights;

function randomRespawnDelay() {
  return SPAWN_CONFIG.randomRespawnDelay.min + Math.random() * (SPAWN_CONFIG.randomRespawnDelay.max - SPAWN_CONFIG.randomRespawnDelay.min);
}

function aggressiveRespawnDelay() {
  return SPAWN_CONFIG.aggressiveRespawnDelay.min + Math.random() * (SPAWN_CONFIG.aggressiveRespawnDelay.max - SPAWN_CONFIG.aggressiveRespawnDelay.min);
}

function randomSpawnPosition(player, playerVelocity = null) {
  const halfWidth = CANVAS.width * 0.5;
  const halfHeight = CANVAS.height * 0.5;
  const spawnPadding = SPAWN_CONFIG.spawnPadding;

  let centerX = player.x;
  let centerY = player.y;
  const speed = playerVelocity ? Math.hypot(playerVelocity.x, playerVelocity.y) : 0;
  if (speed > SPAWN_CONFIG.movementLookAhead.speedThreshold) {
    const nx = playerVelocity.x / speed;
    const ny = playerVelocity.y / speed;
    const speedRatio = Math.min(1, speed / SPAWN_CONFIG.movementLookAhead.speedMax);
    const lookAhead = SPAWN_CONFIG.movementLookAhead.base + speedRatio * SPAWN_CONFIG.movementLookAhead.extra;
    centerX += nx * lookAhead;
    centerY += ny * lookAhead;
  }

  const minX = centerX - halfWidth;
  const maxX = centerX + halfWidth;
  const minY = centerY - halfHeight;
  const maxY = centerY + halfHeight;
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return { x: minX - spawnPadding, y: minY + Math.random() * (maxY - minY) };
  if (edge === 1) return { x: maxX + spawnPadding, y: minY + Math.random() * (maxY - minY) };
  if (edge === 2) return { x: minX + Math.random() * (maxX - minX), y: minY - spawnPadding };
  return { x: minX + Math.random() * (maxX - minX), y: maxY + spawnPadding };
}

function respawnNearPlayer(enemy, player, playerVelocity) {
  const position = randomSpawnPosition(player, playerVelocity);
  enemy.x = position.x;
  enemy.y = position.y;
  enemy.hp = enemy.maxHp;
  enemy.isRespawning = false;
  enemy.respawnTimer = 0;
  enemy.offscreenTime = 0;
  enemy.spawnBoostTimer = AI_CONFIG.spawnBoostTime.min + Math.random() * (AI_CONFIG.spawnBoostTime.max - AI_CONFIG.spawnBoostTime.min);
}

function isEnemyOutsideViewport(enemy, player) {
  const halfWidth = CANVAS.width * 0.5;
  const halfHeight = CANVAS.height * 0.5;
  const padding = SPAWN_CONFIG.offscreenPadding;
  const minX = player.x - halfWidth - padding;
  const maxX = player.x + halfWidth + padding;
  const minY = player.y - halfHeight - padding;
  const maxY = player.y + halfHeight + padding;
  return enemy.x < minX || enemy.x > maxX || enemy.y < minY || enemy.y > maxY;
}

function ensureEnemyAiState(gameState) {
  if (!gameState.systems.enemyAi) {
    gameState.systems.enemyAi = {
      lastPlayerPos: { x: gameState.player.x, y: gameState.player.y },
      playerVelocity: { x: 0, y: 0 },
    };
  }

  return gameState.systems.enemyAi;
}

function resolveEnemyCrowding(gameState) {
  const enemies = gameState.enemies;
  if (!enemies || enemies.length < 2) {
    return;
  }

  const world = gameState.systems.world;
  const iterations = Math.max(1, AI_CONFIG.enemySeparationIterations || 1);
  const strength = Math.max(0, Math.min(1.5, AI_CONFIG.enemySeparationStrength || 0.85));
  const paddingFactor = Math.max(0.6, Math.min(1.2, AI_CONFIG.enemySeparationPaddingFactor || 0.94));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a || a.isRespawning || a.skipRecycle) {
        continue;
      }

      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b || b.isRespawning || b.skipRecycle) {
          continue;
        }

        const minDistance = (a.radius + b.radius) * paddingFactor;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDistance * minDistance) {
          continue;
        }

        let nx;
        let ny;
        let dist = Math.sqrt(distSq);
        if (dist < 0.0001) {
          const angleSeed = (((i + 1) * 73856093) ^ ((j + 1) * 19349663) ^ ((iteration + 1) * 83492791)) & 1023;
          const angle = (angleSeed / 1024) * Math.PI * 2;
          nx = Math.cos(angle);
          ny = Math.sin(angle);
          dist = 0;
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }

        const overlap = minDistance - dist;
        if (overlap <= 0) {
          continue;
        }

        const push = overlap * 0.5 * strength;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;

        const resolvedA = resolvePositionAgainstMountains(world, a.x, a.y, a.radius);
        a.x = resolvedA.x;
        a.y = resolvedA.y;
        const resolvedB = resolvePositionAgainstMountains(world, b.x, b.y, b.radius);
        b.x = resolvedB.x;
        b.y = resolvedB.y;
      }
    }
  }
}

export function computeDifficulty(time) {
  return time * BALANCE.spawnScaling;
}

function getStage(time) {
  return 1 + Math.floor(time / 45);
}

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < entries.length; index += 1) {
    roll -= entries[index].weight;
    if (roll <= 0) {
      return entries[index].item;
    }
  }
  return entries[entries.length - 1].item;
}

export function updateEnemySpawning(gameState, dt, options = {}) {
  const enableSpawns = options.enableSpawns !== false;
  if (!enableSpawns) {
    return;
  }

  const difficulty = computeDifficulty(gameState.time);
  const stage = getStage(gameState.time);
  const enemyAiState = ensureEnemyAiState(gameState);
  const world = gameState.systems.world;

  const spawnRate = SPAWN_CONFIG.rateBase + stage * SPAWN_CONFIG.rateStageScale + difficulty * SPAWN_CONFIG.rateDifficultyScale;
  const maxEnemies = Math.floor(SPAWN_CONFIG.maxEnemiesBase + stage * SPAWN_CONFIG.maxEnemiesStageScale + difficulty * SPAWN_CONFIG.maxEnemiesDifficultyScale);

  gameState.waveTimer += dt;
  const interval = Math.max(0.05, 1 / spawnRate);

  while (gameState.waveTimer >= interval && gameState.enemies.length < maxEnemies) {
    gameState.waveTimer -= interval;
    const position = randomSpawnPosition(gameState.player, enemyAiState.playerVelocity);
    const candidates = ENEMY_SPAWN_WEIGHTS
      .filter((entry) => entry.minStage <= stage)
      .map((entry) => ({ item: entry, weight: entry.weight }));

    const picked = weightedPick(candidates);
    let spawnX = position.x;
    let spawnY = position.y;
    let spawnOptions = picked.options || {};
    if (picked.type === "flyingBomber") {
      const path = computeFlyingBomberPath(gameState.player, enemyAiState.playerVelocity);
      spawnX = path.fromX;
      spawnY = path.fromY;
      spawnOptions = { ...spawnOptions, fromX: path.fromX, fromY: path.fromY, dirX: path.dirX, dirY: path.dirY, exitX: path.exitX, exitY: path.exitY };
    }
    const enemy = createEnemy(picked.type, spawnX, spawnY, difficulty, spawnOptions);
    if (!enemy.skipRecycle) {
      const resolved = resolvePositionAgainstMountains(world, enemy.x, enemy.y, enemy.radius);
      enemy.x = resolved.x;
      enemy.y = resolved.y;
    }
    gameState.enemies.push(enemy);
  }
}

export function updateEnemies(gameState, dt) {
  const player = gameState.player;
  const world = gameState.systems.world;
  const enemyAiState = ensureEnemyAiState(gameState);
  const dtSafe = Math.max(0.0001, dt);
  const measuredVelX = (player.x - enemyAiState.lastPlayerPos.x) / dtSafe;
  const measuredVelY = (player.y - enemyAiState.lastPlayerPos.y) / dtSafe;
  enemyAiState.playerVelocity.x += (measuredVelX - enemyAiState.playerVelocity.x) * 0.35;
  enemyAiState.playerVelocity.y += (measuredVelY - enemyAiState.playerVelocity.y) * 0.35;
  enemyAiState.lastPlayerPos.x = player.x;
  enemyAiState.lastPlayerPos.y = player.y;
  const reservedMortarTargets = gameState.indicators
    .filter((indicator) => indicator.type === "circle" && indicator.source === "mortar")
    .map((indicator) => ({ x: indicator.position.x, y: indicator.position.y }));

  for (let index = gameState.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = gameState.enemies[index];
    enemy.stunnedTimer = Math.max(0, (enemy.stunnedTimer || 0) - dt);
    enemy.spawnBoostTimer = Math.max(0, (enemy.spawnBoostTimer || 0) - dt);
    const spawnBoost = enemy.spawnBoostTimer > 0 ? enemy.spawnBoostMultiplier || AI_CONFIG.spawnBoostMultiplier : 1;
    const slowMultiplier = enemy.externalSlowMultiplier ?? 1;
    const speedMultiplier = spawnBoost * slowMultiplier;

    if (!enemy.isRespawning) {
      if (isEnemyOutsideViewport(enemy, player)) {
        enemy.offscreenTime = (enemy.offscreenTime || 0) + dt;
      } else {
        enemy.offscreenTime = 0;
      }
    }

    if (enemy.skipRecycle) {
      if (enemy.isDone) {
        gameState.enemies.splice(index, 1);
        continue;
      }
      if (enemy.type === "flyingBomber") {
        updateFlyingBomberBehavior(gameState, enemy, player, dt);
        continue;
      }
      continue;
    }

    const distanceToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);

    if (!enemy.isRespawning && (distanceToPlayer > RECYCLE_DISTANCE || enemy.offscreenTime >= OFFSCREEN_RESPAWN_AFTER)) {
      enemy.isRespawning = true;
      enemy.respawnTimer = enemy.offscreenTime >= OFFSCREEN_RESPAWN_AFTER ? aggressiveRespawnDelay() : randomRespawnDelay();
    }

    if (enemy.isRespawning) {
      enemy.respawnTimer -= dt;
      if (enemy.respawnTimer <= 0) {
        respawnNearPlayer(enemy, player, enemyAiState.playerVelocity);
        const resolved = resolvePositionAgainstMountains(world, enemy.x, enemy.y, enemy.radius);
        enemy.x = resolved.x;
        enemy.y = resolved.y;
      }
      continue;
    }

    if (enemy.stunnedTimer > 0) {
      continue;
    }

    if (enemy.type === "chaser" || enemy.type === "slime") {
      updateChaserSlimeBehavior(enemy, player, world, dt, speedMultiplier);
      continue;
    }

    if (enemy.type === "bomber") {
      const exploded = updateBomberBehavior(gameState, enemy, index, player, world, dt, speedMultiplier);
      if (exploded) {
        continue;
      }
      continue;
    }

    if (enemy.type === "shooter") {
      updateShooterBehavior(gameState, enemy, player, world, dt, speedMultiplier, enemyAiState.playerVelocity);
      continue;
    }

    if (enemy.type === "assaultShooter") {
      updateAssaultShooterBehavior(gameState, enemy, player, world, dt, speedMultiplier, enemyAiState.playerVelocity);
      continue;
    }

    if (enemy.type === "shotgunShooter") {
      updateShotgunShooterBehavior(gameState, enemy, player, world, dt, speedMultiplier, enemyAiState.playerVelocity);
      continue;
    }

    if (enemy.type === "mortar") {
      updateMortarBehavior(gameState, enemy, player, world, dt, speedMultiplier, reservedMortarTargets);
    }
  }

  // Keep enemies from perfectly stacking into one pixel pile around the player.
  resolveEnemyCrowding(gameState);
}
