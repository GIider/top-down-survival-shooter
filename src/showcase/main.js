import { createEnemy } from "../entities/enemy.js";
import { GAME_CONFIG } from "../core/constants.js";
import { createWorldSystem } from "../systems/worldSystem.js";
import { updateAssaultShooterBehavior } from "../systems/enemies/assaultShooter.js";
import { updateBomberBehavior } from "../systems/enemies/bomber.js";
import { updateChaserSlimeBehavior } from "../systems/enemies/chaserSlime.js";
import { computeFlyingBomberPath, updateFlyingBomberBehavior } from "../systems/enemies/flyingBomber.js";
import { updateMortarBehavior } from "../systems/enemies/mortar.js";
import { updateShooterBehavior } from "../systems/enemies/shooter.js";
import { updateShotgunShooterBehavior } from "../systems/enemies/shotgunShooter.js";
import { updateIndicators } from "../systems/indicatorSystem.js";

const SHOWCASE_WIDTH = 820;
const SHOWCASE_HEIGHT = 420;
const DT = 1 / 60;
const DIFFICULTY = 10;
const SPEED_MULT = 1;
const WORLD_TO_CANVAS_SCALE = 0.36;
const PLAYER_MAX_HP = 140;
const PLAYER_RESPAWN_DELAY = 0.95;
const BOMBER_RESPAWN_DELAY = 0.85;
const SLIME_FIRE_DAMAGE_PER_SECOND = 70;
const SLIME_FIRE_ZONES = [
  { x: -120, y: -24, radius: 34 },
  { x: -70, y: 26, radius: 34 },
];
const AI_CONFIG = GAME_CONFIG.enemies.ai;

const DEFINITIONS = [
  {
    type: "chaser",
    title: "Chaser",
    badge: "Melee",
    description: "Aggressive direct pursuit that pressures your movement.",
    legend: "Green: player, white: enemy.",
  },
  {
    type: "slime",
    title: "Slime",
    badge: "Melee",
    description: "Aggressive direct pursuit, splits into smaller slimes when killed.",
    legend: "Orange pools deal damage and trigger slime splitting on death.",
  },
  {
    type: "shooter",
    title: "Shooter",
    badge: "Ranged",
    description: "Maintains spacing and uses aimed shots.",
    legend: "Orange dots: enemy bullets.",
  },
  {
    type: "assaultShooter",
    title: "Assault Shooter",
    badge: "Burst",
    description: "Wave-style burst streams with lateral offsets.",
    legend: "Orange dots: burst stream.",
  },
  {
    type: "shotgunShooter",
    title: "Shotgun Shooter",
    badge: "Spread",
    description: "Short-range cone volleys with pellet spread.",
    legend: "Orange dots: shotgun pellets.",
  },
  {
    type: "mortar",
    title: "Mortar",
    badge: "Telegraph",
    description: "Telegraphs delayed impact zones before AoE hits.",
    legend: "Red ring: detonation warning.",
  },
  {
    type: "bomber",
    title: "Bomber",
    badge: "Fuse",
    description: "Rushes, primes, then detonates near the player.",
    legend: "Pulse ring: blast radius.",
  },
  {
    type: "flyingBomber",
    title: "Flying Bomber",
    badge: "Flyby",
    description: "Telegraphs a lane, then performs a bomb-dropping flyby.",
    legend: "Dashed lane + arrows: attack path.",
  },
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function createMockState() {
  return {
    time: 0,
    projectiles: [],
    indicators: [],
    effects: [],
    floatingTexts: [],
    enemies: [],
    screenFx: { shake: 0, damageFlash: 0, actionFlash: 0, hitStop: 0 },
    systems: {
      world: createWorldSystem(1337),
    },
  };
}

function createPlayer() {
  return {
    x: 0,
    y: 0,
    radius: 12,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
  };
}

function makeEnemy(type) {
  if (type === "flyingBomber") {
    const path = computeFlyingBomberPath({ x: 0, y: 0 }, { x: 0, y: 0 });
    return createEnemy(type, path.fromX, path.fromY, DIFFICULTY, {
      fromX: path.fromX,
      fromY: path.fromY,
      dirX: path.dirX,
      dirY: path.dirY,
      exitX: path.exitX,
      exitY: path.exitY,
    });
  }
  return createEnemy(type, -190, 0, DIFFICULTY, type === "slime" ? { tier: 0 } : {});
}

function resetEnemyPosition(enemy, type) {
  if (type === "flyingBomber") {
    const path = computeFlyingBomberPath({ x: 0, y: 0 }, { x: 0, y: 0 });
    enemy.x = path.fromX;
    enemy.y = path.fromY;
    enemy.flyFromX = path.fromX;
    enemy.flyFromY = path.fromY;
    enemy.flyDirX = path.dirX;
    enemy.flyDirY = path.dirY;
    enemy.flyExitX = path.exitX;
    enemy.flyExitY = path.exitY;
    enemy.flyPhase = "warning";
    enemy.warningTimer = enemy.warningDuration;
    enemy.distTraveled = 0;
    enemy.bombDistAccum = 0;
    enemy.isDone = false;
    return;
  }

  const rx = (Math.random() * 2 - 1) * 52;
  const ry = (Math.random() * 2 - 1) * 52;
  enemy.x = -190 + rx;
  enemy.y = ry;
  enemy.offscreenTime = 0;
  enemy.isRespawning = false;
  enemy.isPrimed = false;
  enemy.fuseTimer = enemy.fuseDuration || 0;
}

function createSimulation(type) {
  const state = createMockState();
  const player = createPlayer();
  const enemy = makeEnemy(type);
  state.enemies.push(enemy);

  return {
    type,
    state,
    player,
    enemy,
    enemyRespawnTimer: 0,
    playerRespawnTimer: 0,
    deaths: 0,
    elapsed: 0,
    slimeScript:
      type === "slime"
        ? {
            phase: "fire-lane",
            splitEvents: 0,
          }
        : null,
  };
}

function resetSlimeScenario(sim) {
  sim.state.projectiles.length = 0;
  sim.state.indicators.length = 0;
  sim.state.effects.length = 0;
  sim.state.floatingTexts.length = 0;
  sim.state.enemies.length = 0;
  sim.enemyRespawnTimer = 0;
  sim.enemy = makeEnemy("slime");
  sim.state.enemies.push(sim.enemy);
  sim.slimeScript = {
    phase: "fire-lane",
    splitEvents: 0,
  };
}

function respawnPlayer(sim) {
  sim.player.hp = sim.player.maxHp;
  sim.player.x = 0;
  sim.player.y = 0;
  sim.playerRespawnTimer = 0;

  if (sim.type === "slime") {
    resetSlimeScenario(sim);
    return;
  }

  if (!sim.enemy) {
    const next = makeEnemy(sim.type);
    sim.enemy = next;
    sim.state.enemies.length = 0;
    sim.state.enemies.push(next);
  } else {
    resetEnemyPosition(sim.enemy, sim.type);
  }
}

function queueEnemyRespawn(sim, delay) {
  sim.enemy = null;
  sim.state.enemies.length = 0;
  sim.enemyRespawnTimer = Math.max(sim.enemyRespawnTimer, delay);
}

function handlePlayerDamageFromContact(sim) {
  if (sim.playerRespawnTimer > 0) {
    return;
  }

  const enemies = sim.type === "slime" ? sim.state.enemies : sim.enemy ? [sim.enemy] : [];
  for (let i = 0; i < enemies.length; i += 1) {
    const enemy = enemies[i];
    const dist = Math.hypot(enemy.x - sim.player.x, enemy.y - sim.player.y);
    if (dist <= enemy.radius + sim.player.radius) {
      const dps = Math.max(6, enemy.contactDamage || 10);
      sim.player.hp -= dps * DT;
    }
  }
}

function splitSlimeEnemy(sim, enemy) {
  const nextTier = (enemy.slimeTier || 0) + 1;
  if (nextTier > (enemy.maxSlimeTier || 0)) {
    return;
  }

  const count = enemy.splitCount || 2;
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.38;
    const offset = 10 + Math.random() * 8;
    const child = createEnemy("slime", enemy.x + Math.cos(angle) * offset, enemy.y + Math.sin(angle) * offset, DIFFICULTY, {
      tier: nextTier,
    });
    sim.state.enemies.push(child);
  }
}

function updateSlimeScript(sim) {
  if (sim.type !== "slime") {
    return;
  }

  if (sim.playerRespawnTimer > 0 || !sim.slimeScript) {
    return;
  }

  const script = sim.slimeScript;
  for (let i = sim.state.enemies.length - 1; i >= 0; i -= 1) {
    const slime = sim.state.enemies[i];
    if (slime.type !== "slime") {
      continue;
    }

    let inFire = false;
    for (let z = 0; z < SLIME_FIRE_ZONES.length; z += 1) {
      const zone = SLIME_FIRE_ZONES[z];
      const dist = Math.hypot(slime.x - zone.x, slime.y - zone.y);
      if (dist <= zone.radius + slime.radius * 0.35) {
        inFire = true;
        break;
      }
    }

    if (!inFire) {
      continue;
    }

    slime.hp -= SLIME_FIRE_DAMAGE_PER_SECOND * DT;
    if (slime.hp <= 0) {
      sim.state.enemies.splice(i, 1);
      if ((slime.slimeTier || 0) < (slime.maxSlimeTier || 0)) {
        splitSlimeEnemy(sim, slime);
        script.splitEvents += 1;
      }
    }
  }
}

function handleProjectileHits(sim) {
  if (sim.playerRespawnTimer > 0) {
    return;
  }

  for (let i = sim.state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = sim.state.projectiles[i];
    const dist = Math.hypot(projectile.position.x - sim.player.x, projectile.position.y - sim.player.y);
    const hitRadius = (projectile.radius || 4) + sim.player.radius;
    if (dist <= hitRadius) {
      sim.player.hp -= projectile.damage || 8;
      sim.state.projectiles.splice(i, 1);
    }
  }
}

function updateEnemyBehavior(sim) {
  const { state, player, type } = sim;
  const enemy = sim.enemy;
  if (!enemy && type !== "slime") {
    return;
  }

  const world = state.systems.world;
  const playerVelocity = { x: 0, y: 0 };

  if (type === "slime") {
    for (let i = 0; i < state.enemies.length; i += 1) {
      updateChaserSlimeBehavior(state.enemies[i], player, world, DT, SPEED_MULT);
    }
  } else if (type === "chaser") {
    updateChaserSlimeBehavior(enemy, player, world, DT, SPEED_MULT);
  } else if (type === "shooter") {
    updateShooterBehavior(state, enemy, player, world, DT, SPEED_MULT, playerVelocity);
  } else if (type === "assaultShooter") {
    updateAssaultShooterBehavior(state, enemy, player, world, DT, SPEED_MULT, playerVelocity);
  } else if (type === "shotgunShooter") {
    updateShotgunShooterBehavior(state, enemy, player, world, DT, SPEED_MULT, playerVelocity);
  } else if (type === "mortar") {
    updateMortarBehavior(state, enemy, player, world, DT, SPEED_MULT, []);
  } else if (type === "bomber") {
    updateBomberBehavior(state, enemy, 0, player, world, DT, SPEED_MULT);
  } else if (type === "flyingBomber") {
    updateFlyingBomberBehavior(state, enemy, player, DT);
    if (enemy.isDone) {
      resetEnemyPosition(enemy, type);
    }
  }

  if (type === "bomber" && state.enemies[0] !== enemy) {
    queueEnemyRespawn(sim, BOMBER_RESPAWN_DELAY);
  }

  if (type === "slime") {
    for (let i = 0; i < state.enemies.length; i += 1) {
      if (Math.abs(state.enemies[i].x) > 520 || Math.abs(state.enemies[i].y) > 340) {
        resetEnemyPosition(state.enemies[i], "slime");
      }
    }
    sim.enemy = state.enemies[0] || null;
  } else if (type !== "flyingBomber" && enemy && (Math.abs(enemy.x) > 500 || Math.abs(enemy.y) > 320)) {
    resetEnemyPosition(enemy, type);
  }
}

function resolveEnemyCrowdingInShowcase(sim) {
  const enemies = sim.state.enemies;
  if (!enemies || enemies.length < 2) {
    return;
  }

  const world = sim.state.systems.world;
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

        // Showcase world has no blocking mountains in practice, so we can keep this lightweight.
        const _world = world;
        if (!_world) {
          continue;
        }
      }
    }
  }
}

function updateProjectiles(sim) {
  for (let i = sim.state.projectiles.length - 1; i >= 0; i -= 1) {
    const p = sim.state.projectiles[i];
    p.position.x += p.velocity.x * DT;
    p.position.y += p.velocity.y * DT;
    p.lifetime -= DT;
    if (p.lifetime <= 0) {
      sim.state.projectiles.splice(i, 1);
    }
  }
}

function updateIndicatorsAndEffects(sim) {
  const triggered = updateIndicators(sim.state.indicators, DT);
  for (let i = 0; i < triggered.length; i += 1) {
    const indicator = triggered[i];
    if (typeof indicator.onTrigger === "function") {
      indicator.onTrigger();
    }
  }

  for (let i = sim.state.effects.length - 1; i >= 0; i -= 1) {
    const effect = sim.state.effects[i];
    effect.elapsed += DT;
    if (effect.elapsed >= effect.duration) {
      sim.state.effects.splice(i, 1);
    }
  }

  for (let i = sim.state.floatingTexts.length - 1; i >= 0; i -= 1) {
    const entry = sim.state.floatingTexts[i];
    entry.elapsed += DT;
    if (entry.elapsed >= entry.duration) {
      sim.state.floatingTexts.splice(i, 1);
    }
  }
}

function updateSimulation(sim) {
  sim.elapsed += DT;
  sim.state.time += DT;

  updateSlimeScript(sim);

  if (sim.playerRespawnTimer > 0) {
    sim.playerRespawnTimer = Math.max(0, sim.playerRespawnTimer - DT);
    if (sim.playerRespawnTimer <= 0) {
      respawnPlayer(sim);
    }
    return;
  }

  if (!sim.enemy && sim.enemyRespawnTimer > 0) {
    sim.enemyRespawnTimer = Math.max(0, sim.enemyRespawnTimer - DT);
    if (sim.enemyRespawnTimer <= 0) {
      const next = makeEnemy(sim.type);
      sim.enemy = next;
      sim.state.enemies.length = 0;
      sim.state.enemies.push(next);
    }
  }

  updateEnemyBehavior(sim);
  resolveEnemyCrowdingInShowcase(sim);
  updateProjectiles(sim);
  handleProjectileHits(sim);
  handlePlayerDamageFromContact(sim);
  updateIndicatorsAndEffects(sim);

  if (sim.player.hp <= 0 && sim.playerRespawnTimer <= 0) {
    sim.player.hp = 0;
    sim.deaths += 1;
    sim.playerRespawnTimer = PLAYER_RESPAWN_DELAY;
    queueEnemyRespawn(sim, sim.type === "bomber" ? BOMBER_RESPAWN_DELAY : 0.15);
  }
}

function toCanvasSpace(x, y, width, height) {
  return {
    x: width * 0.5 + x * WORLD_TO_CANVAS_SCALE,
    y: height * 0.5 + y * WORLD_TO_CANVAS_SCALE,
  };
}

function renderBackground(ctx, width, height) {
  // Static background (no scrolling/parallax animation)
  ctx.fillStyle = "#0d141b";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(141, 171, 196, 0.08)";
  ctx.lineWidth = 1;
  const step = 32;
  for (let x = 0; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function renderIndicator(ctx, indicator, width, height) {
  const p = toCanvasSpace(indicator.position.x, indicator.position.y, width, height);
  const progress = clamp(indicator.elapsed / indicator.duration, 0, 1);

  if (indicator.type === "circle") {
    const radius = indicator.size.radius * WORLD_TO_CANVAS_SCALE;
    ctx.strokeStyle = "rgba(255, 83, 95, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 83, 95, 0.24)";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, radius, -Math.PI * 0.5, -Math.PI * 0.5 + progress * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
}

function renderFlyingLane(ctx, sim) {
  const enemy = sim.enemy;
  if (!enemy || enemy.type !== "flyingBomber" || enemy.flyPhase !== "warning") {
    return;
  }

  const from = toCanvasSpace(enemy.flyFromX, enemy.flyFromY, SHOWCASE_WIDTH, SHOWCASE_HEIGHT);
  const exit = toCanvasSpace(enemy.flyExitX, enemy.flyExitY, SHOWCASE_WIDTH, SHOWCASE_HEIGHT);
  const warningProgress = 1 - clamp(enemy.warningTimer / Math.max(0.001, enemy.warningDuration), 0, 1);

  ctx.save();
  ctx.globalAlpha = 0.3 + warningProgress * 0.2;
  ctx.strokeStyle = "#ff3355";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(exit.x, exit.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const dx = exit.x - from.x;
  const dy = exit.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const dirX = dx / len;
  const dirY = dy / len;
  const perpX = -dirY;
  const perpY = dirX;
  const spacing = 120;
  const offset = (sim.state.time * 180) % spacing;

  for (let d = offset; d < len; d += spacing) {
    const ax = from.x + dirX * d;
    const ay = from.y + dirY * d;
    const size = 11;
    ctx.fillStyle = "rgba(255, 72, 94, 0.78)";
    ctx.beginPath();
    ctx.moveTo(ax + dirX * size, ay + dirY * size);
    ctx.lineTo(ax - dirX * size + perpX * size * 0.6, ay - dirY * size + perpY * size * 0.6);
    ctx.lineTo(ax - dirX * size - perpX * size * 0.6, ay - dirY * size - perpY * size * 0.6);
    ctx.closePath();
    ctx.fill();
  }
}

function render(sim, ctx, width, height) {
  renderBackground(ctx, width, height);

  if (sim.type === "slime") {
    for (let i = 0; i < SLIME_FIRE_ZONES.length; i += 1) {
      const zone = SLIME_FIRE_ZONES[i];
      const p = toCanvasSpace(zone.x, zone.y, width, height);
      const r = zone.radius * WORLD_TO_CANVAS_SCALE;
      ctx.fillStyle = "rgba(255, 106, 54, 0.22)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 148, 72, 0.72)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (let i = 0; i < sim.state.indicators.length; i += 1) {
    renderIndicator(ctx, sim.state.indicators[i], width, height);
  }

  for (let i = 0; i < sim.state.effects.length; i += 1) {
    const e = sim.state.effects[i];
    const p = toCanvasSpace(e.x, e.y, width, height);
    const alpha = 1 - e.elapsed / e.duration;
    ctx.strokeStyle = `rgba(${e.color || "255, 220, 120"}, ${Math.max(0, alpha)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (e.radius + e.elapsed * (e.growth || 12)) * WORLD_TO_CANVAS_SCALE, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (sim.enemy && sim.enemy.type === "bomber") {
    const center = toCanvasSpace(sim.enemy.x, sim.enemy.y, width, height);
    const pulse = 0.4 + 0.6 * Math.sin(sim.state.time * 8 + sim.enemy.x * 0.02);
    ctx.strokeStyle = `rgba(255, 116, 144, ${0.24 + pulse * 0.32})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, (sim.enemy.explosionRadius || 70) * WORLD_TO_CANVAS_SCALE, 0, Math.PI * 2);
    ctx.stroke();
  }

  renderFlyingLane(ctx, sim);

  const playerP = toCanvasSpace(sim.player.x, sim.player.y, width, height);
  ctx.fillStyle = sim.playerRespawnTimer > 0 ? "rgba(116, 240, 167, 0.45)" : "#74f0a7";
  ctx.beginPath();
  ctx.arc(playerP.x, playerP.y, sim.player.radius * WORLD_TO_CANVAS_SCALE, 0, Math.PI * 2);
  ctx.fill();

  if (sim.type === "slime") {
    for (let i = 0; i < sim.state.enemies.length; i += 1) {
      const enemy = sim.state.enemies[i];
      const enemyP = toCanvasSpace(enemy.x, enemy.y, width, height);
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.arc(enemyP.x, enemyP.y, enemy.radius * WORLD_TO_CANVAS_SCALE, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (sim.enemy) {
    const enemyP = toCanvasSpace(sim.enemy.x, sim.enemy.y, width, height);
    ctx.fillStyle = sim.enemy.color;
    ctx.beginPath();
    ctx.arc(enemyP.x, enemyP.y, sim.enemy.radius * WORLD_TO_CANVAS_SCALE, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < sim.state.projectiles.length; i += 1) {
    const projectile = sim.state.projectiles[i];
    const p = toCanvasSpace(projectile.position.x, projectile.position.y, width, height);
    ctx.fillStyle = projectile.color || "#ff8d6d";
    ctx.beginPath();
    ctx.arc(p.x, p.y, (projectile.radius || 4) * WORLD_TO_CANVAS_SCALE, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(12, 12, width - 24, 8);
  ctx.fillStyle = "#79e57e";
  const playerHpRatio = sim.player.maxHp <= 0 ? 0 : clamp(sim.player.hp / sim.player.maxHp, 0, 1);
  ctx.fillRect(12, 12, (width - 24) * playerHpRatio, 8);

  if (sim.playerRespawnTimer > 0) {
    ctx.fillStyle = "rgba(255, 220, 140, 0.92)";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PLAYER DOWN", width * 0.5, 34);
    ctx.textAlign = "start";
  }
}

const canvas = document.getElementById("showcase-canvas");
const ctx = canvas.getContext("2d");
const picker = document.getElementById("enemy-picker");
const titleEl = document.getElementById("showcase-title");
const badgeEl = document.getElementById("showcase-badge");
const descEl = document.getElementById("showcase-description");
const legendEl = document.getElementById("showcase-legend");
const statsEl = document.getElementById("showcase-stats");

for (let i = 0; i < DEFINITIONS.length; i += 1) {
  const def = DEFINITIONS[i];
  const option = document.createElement("option");
  option.value = def.type;
  option.textContent = `${def.title} (${def.badge})`;
  picker.appendChild(option);
}

let activeSim = createSimulation(DEFINITIONS[0].type);

function getDefinition(type) {
  return DEFINITIONS.find((d) => d.type === type) || DEFINITIONS[0];
}

function getInitialEnemyTypeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("enemy");
  if (!requested) {
    return DEFINITIONS[0].type;
  }
  return getDefinition(requested).type;
}

function setEnemyTypeInUrl(type) {
  const params = new URLSearchParams(window.location.search);
  params.set("enemy", type);
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function syncMeta(type) {
  const def = getDefinition(type);
  titleEl.textContent = def.title;
  badgeEl.textContent = def.badge;
  descEl.textContent = def.description;
  legendEl.textContent = def.legend;
}

const initialEnemyType = getInitialEnemyTypeFromUrl();
activeSim = createSimulation(initialEnemyType);
picker.value = activeSim.type;
syncMeta(activeSim.type);
setEnemyTypeInUrl(activeSim.type);

picker.addEventListener("change", () => {
  const selectedType = getDefinition(picker.value).type;
  activeSim = createSimulation(selectedType);
  syncMeta(activeSim.type);
  setEnemyTypeInUrl(activeSim.type);
});

function updateStats(sim) {
  const enemyHp =
    sim.type === "slime"
      ? sim.state.enemies.length > 0
        ? `${sim.state.enemies.length} active`
        : "respawning"
      : sim.enemy
        ? `${Math.round(sim.enemy.hp)}/${Math.round(sim.enemy.maxHp)}`
        : "respawning";
  const enemyState = sim.enemy
    ? sim.type === "slime"
      ? sim.slimeScript?.phase || "active"
      : sim.type === "flyingBomber"
      ? sim.enemy.flyPhase
      : sim.type === "bomber"
        ? sim.enemy.isPrimed
          ? "primed"
          : "chasing"
        : "active"
    : "respawn-wait";

  const items = [
    `Player HP ${Math.round(sim.player.hp)}/${sim.player.maxHp}`,
    `Enemy HP ${enemyHp}`,
    `Enemy ${enemyState}`,
    `Deaths ${sim.deaths}`,
  ];

  if (sim.type === "slime") {
    items.push(`Split Events ${sim.slimeScript?.splitEvents || 0}`);
  }

  if (!sim.enemy && sim.enemyRespawnTimer > 0) {
    items.push(`Enemy Respawn ${sim.enemyRespawnTimer.toFixed(2)}s`);
  }
  if (sim.playerRespawnTimer > 0) {
    items.push(`Player Respawn ${sim.playerRespawnTimer.toFixed(2)}s`);
  }

  statsEl.innerHTML = items.map((text) => `<span>${text}</span>`).join("");
}

function frame() {
  updateSimulation(activeSim);
  render(activeSim, ctx, canvas.width, canvas.height);
  updateStats(activeSim);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
