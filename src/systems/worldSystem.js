import { GAME_CONFIG } from "../core/constants.js";

const WORLD_CONFIG = GAME_CONFIG.world;
const CHUNK_SIZE = WORLD_CONFIG.chunkSize;
const MAX_CHUNK_CACHE = WORLD_CONFIG.maxChunkCache;

function hashInt(value) {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}

function makeRng(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function createTreeState() {
  return {
    burnState: "healthy",
    burnTimer: 0,
  };
}

function getTreeState(world, treeId) {
  let state = world.treeStates.get(treeId);
  if (!state) {
    state = createTreeState();
    world.treeStates.set(treeId, state);
  }
  return state;
}

function generateChunk(world, cx, cy) {
  const mountainConfig = WORLD_CONFIG.mountains;
  const treeConfig = WORLD_CONFIG.trees;
  const mixedSeed = hashInt(world.seed ^ Math.imul(cx + 1013, 374761393) ^ Math.imul(cy + 1619, 668265263));
  const rng = makeRng(mixedSeed);
  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;

  const obstacles = [];
  const mountains = Math.floor(rng() * mountainConfig.countMaxExclusive);
  const trees = treeConfig.countBase + Math.floor(rng() * treeConfig.countRange);

  for (let i = 0; i < mountains; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < mountainConfig.attempts && !placed; attempt += 1) {
      const radius = mountainConfig.radiusMin + rng() * mountainConfig.radiusRange;
      const obstacle = {
        type: "mountain",
        x: baseX + mountainConfig.edgePadding + rng() * (CHUNK_SIZE - mountainConfig.edgePadding * 2),
        y: baseY + mountainConfig.edgePadding + rng() * (CHUNK_SIZE - mountainConfig.edgePadding * 2),
        radius,
        ridgeRadiusFactor: 0.26 + rng() * 0.24,
        ridgeOffsetX: (rng() * 2 - 1) * radius * 0.34,
        ridgeOffsetY: (rng() * 2 - 1) * radius * 0.34,
      };

      const overlaps = obstacles.some(
        (entry) => distanceSq(entry, obstacle) < (entry.radius + obstacle.radius + mountainConfig.spacing) ** 2
      );
      if (!overlaps) {
        obstacles.push(obstacle);
        placed = true;
      }
    }
  }

  const clusterCount = 1 + Math.floor(rng() * 3);
  const clusters = [];
  for (let i = 0; i < clusterCount; i += 1) {
    clusters.push({
      x: baseX + treeConfig.edgePadding + rng() * (CHUNK_SIZE - treeConfig.edgePadding * 2),
      y: baseY + treeConfig.edgePadding + rng() * (CHUNK_SIZE - treeConfig.edgePadding * 2),
      spread: CHUNK_SIZE * (0.06 + rng() * 0.08),
    });
  }

  for (let i = 0; i < trees; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < treeConfig.attempts && !placed; attempt += 1) {
      const radius = treeConfig.radiusMin + rng() * treeConfig.radiusRange;
      const treeId = `tree:${cx}:${cy}:${i}`;
      const useCluster = rng() < 0.65;
      const cluster = clusters[Math.floor(rng() * clusters.length)];
      const rawX = useCluster
        ? cluster.x + (rng() * 2 - 1) * cluster.spread
        : baseX + treeConfig.edgePadding + rng() * (CHUNK_SIZE - treeConfig.edgePadding * 2);
      const rawY = useCluster
        ? cluster.y + (rng() * 2 - 1) * cluster.spread
        : baseY + treeConfig.edgePadding + rng() * (CHUNK_SIZE - treeConfig.edgePadding * 2);
      const obstacle = {
        type: "tree",
        x: Math.min(baseX + CHUNK_SIZE - treeConfig.edgePadding, Math.max(baseX + treeConfig.edgePadding, rawX)),
        y: Math.min(baseY + CHUNK_SIZE - treeConfig.edgePadding, Math.max(baseY + treeConfig.edgePadding, rawY)),
        radius,
        treeId,
        treeState: getTreeState(world, treeId),
      };

      const overlaps = obstacles.some((entry) => {
        if (entry.type !== "mountain") {
          return false;
        }
        return distanceSq(entry, obstacle) < (entry.radius + obstacle.radius + treeConfig.spacing) ** 2;
      });
      if (!overlaps) {
        obstacles.push(obstacle);
        placed = true;
      }
    }
  }

  return { cx, cy, obstacles };
}

function getChunk(world, cx, cy) {
  const key = chunkKey(cx, cy);
  if (world.chunkCache.has(key)) {
    const value = world.chunkCache.get(key);
    world.chunkCache.delete(key);
    world.chunkCache.set(key, value);
    return value;
  }

  const chunk = generateChunk(world, cx, cy);
  world.chunkCache.set(key, chunk);

  while (world.chunkCache.size > world.maxCachedChunks) {
    const oldestKey = world.chunkCache.keys().next().value;
    world.chunkCache.delete(oldestKey);
  }

  return chunk;
}

function getChunksInBounds(world, minX, minY, maxX, maxY) {
  const minCx = Math.floor(minX / CHUNK_SIZE);
  const maxCx = Math.floor(maxX / CHUNK_SIZE);
  const minCy = Math.floor(minY / CHUNK_SIZE);
  const maxCy = Math.floor(maxY / CHUNK_SIZE);

  const chunks = [];
  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      chunks.push(getChunk(world, cx, cy));
    }
  }

  return chunks;
}

function getNearbyObstacles(world, x, y, radius) {
  const padding = radius + WORLD_CONFIG.obstaclePadding;
  const chunks = getChunksInBounds(world, x - padding, y - padding, x + padding, y + padding);
  const result = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const obstacles = chunks[i].obstacles;
    for (let j = 0; j < obstacles.length; j += 1) {
      result.push(obstacles[j]);
    }
  }

  return result;
}

export function createWorldSystem(seed) {
  return {
    seed,
    chunkCache: new Map(),
    maxCachedChunks: MAX_CHUNK_CACHE,
    treeStates: new Map(),
  };
}

export function getVisibleObstacles(world, centerX, centerY, width, height, padding = WORLD_CONFIG.visiblePadding) {
  const resolvedPadding = padding;
  const minX = centerX - width * 0.5 - resolvedPadding;
  const maxX = centerX + width * 0.5 + resolvedPadding;
  const minY = centerY - height * 0.5 - resolvedPadding;
  const maxY = centerY + height * 0.5 + resolvedPadding;
  const chunks = getChunksInBounds(world, minX, minY, maxX, maxY);
  const result = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const obstacles = chunks[i].obstacles;
    for (let j = 0; j < obstacles.length; j += 1) {
      const obstacle = obstacles[j];
      if (obstacle.x + obstacle.radius < minX || obstacle.x - obstacle.radius > maxX) {
        continue;
      }
      if (obstacle.y + obstacle.radius < minY || obstacle.y - obstacle.radius > maxY) {
        continue;
      }
      result.push(obstacle);
    }
  }

  return result;
}

export function getMovementSlowMultiplier(world, x, y, radius) {
  if (!world) {
    return 1;
  }

  const nearby = getNearbyObstacles(world, x, y, radius);
  let slow = 1;

  for (let i = 0; i < nearby.length; i += 1) {
    const obstacle = nearby[i];
    if (obstacle.type !== "tree") {
      continue;
    }
    if (obstacle.treeState?.burnState === "burned") {
      continue;
    }
    const distance = Math.hypot(obstacle.x - x, obstacle.y - y);
    if (distance <= obstacle.radius + radius) {
      slow = Math.min(slow, WORLD_CONFIG.trees.slowMultiplier);
    }
  }

  return slow;
}

export function getTreeEffectsAt(world, x, y, radius) {
  if (!world) {
    return { slowMultiplier: 1, fireDamagePerSecond: 0 };
  }

  const nearby = getNearbyObstacles(world, x, y, radius);
  let slowMultiplier = 1;
  let fireDamagePerSecond = 0;

  for (let i = 0; i < nearby.length; i += 1) {
    const obstacle = nearby[i];
    if (obstacle.type !== "tree") {
      continue;
    }

    const distance = Math.hypot(obstacle.x - x, obstacle.y - y);
    if (distance > obstacle.radius + radius) {
      continue;
    }

    if (obstacle.treeState?.burnState !== "burned") {
      slowMultiplier = Math.min(slowMultiplier, WORLD_CONFIG.trees.slowMultiplier);
    }
    if (obstacle.treeState?.burnState === "burning") {
      fireDamagePerSecond = Math.max(fireDamagePerSecond, WORLD_CONFIG.trees.burnDamagePerSecond);
    }
  }

  return { slowMultiplier, fireDamagePerSecond };
}

export function igniteTreesAt(world, x, y, radius) {
  if (!world) {
    return;
  }

  const nearby = getNearbyObstacles(world, x, y, radius);
  for (let i = 0; i < nearby.length; i += 1) {
    const obstacle = nearby[i];
    if (obstacle.type !== "tree") {
      continue;
    }
    if (obstacle.treeState?.burnState === "burned") {
      continue;
    }

    const distance = Math.hypot(obstacle.x - x, obstacle.y - y);
    if (distance > obstacle.radius + radius) {
      continue;
    }

    obstacle.treeState.burnState = "burning";
    obstacle.treeState.burnTimer = Math.max(obstacle.treeState.burnTimer, WORLD_CONFIG.trees.burnDuration);
  }
}

export function updateBurningTrees(world, dt) {
  if (!world || dt <= 0) {
    return;
  }

  for (const treeState of world.treeStates.values()) {
    if (treeState.burnState !== "burning") {
      continue;
    }

    treeState.burnTimer = Math.max(0, treeState.burnTimer - dt);
    if (treeState.burnTimer <= 0) {
      treeState.burnState = "burned";
      treeState.burnTimer = 0;
    }
  }
}

export function resolvePositionAgainstMountains(world, x, y, radius) {
  if (!world) {
    return { x, y, blocked: false };
  }

  let resolvedX = x;
  let resolvedY = y;
  let blocked = false;
  const nearby = getNearbyObstacles(world, x, y, radius);

  for (let i = 0; i < nearby.length; i += 1) {
    const obstacle = nearby[i];
    if (obstacle.type !== "mountain") {
      continue;
    }

    const dx = resolvedX - obstacle.x;
    const dy = resolvedY - obstacle.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = obstacle.radius + radius;
    if (distance < minDistance) {
      blocked = true;
      const nx = distance < 0.0001 ? 1 : dx / distance;
      const ny = distance < 0.0001 ? 0 : dy / distance;
      resolvedX = obstacle.x + nx * minDistance;
      resolvedY = obstacle.y + ny * minDistance;
    }
  }

  return { x: resolvedX, y: resolvedY, blocked };
}

export function isProjectileBlockedByMountain(world, x, y, radius) {
  if (!world) {
    return false;
  }

  const nearby = getNearbyObstacles(world, x, y, radius);
  for (let i = 0; i < nearby.length; i += 1) {
    const obstacle = nearby[i];
    if (obstacle.type !== "mountain") {
      continue;
    }

    const distance = Math.hypot(obstacle.x - x, obstacle.y - y);
    if (distance <= obstacle.radius + radius) {
      return true;
    }
  }

  return false;
}

export function getMountainCollisionNormal(world, x, y, radius) {
  if (!world) {
    return null;
  }

  const nearby = getNearbyObstacles(world, x, y, radius);
  for (let i = 0; i < nearby.length; i += 1) {
    const obstacle = nearby[i];
    if (obstacle.type !== "mountain") {
      continue;
    }

    const dx = x - obstacle.x;
    const dy = y - obstacle.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = obstacle.radius + radius;
    if (distance <= minDistance) {
      const nx = distance < 0.0001 ? 1 : dx / distance;
      const ny = distance < 0.0001 ? 0 : dy / distance;
      return {
        nx,
        ny,
        x: obstacle.x + nx * minDistance,
        y: obstacle.y + ny * minDistance,
      };
    }
  }

  return null;
}
