import { createEnemy } from "../entities/enemy.js";
import { createRenderer } from "../core/renderer.js";
import { GAME_CONFIG } from "../core/constants.js";
import { createGameServices } from "../core/gameServices.js";
import { createInitialState } from "../core/state.js";
import { createWorldSystem } from "../systems/worldSystem.js";
import { updateAssaultShooterBehavior } from "../systems/enemies/assaultShooter.js";
import { updateBomberBehavior } from "../systems/enemies/bomber.js";
import { updateChaserSlimeBehavior } from "../systems/enemies/chaserSlime.js";
import { spawnFloatingText } from "../systems/enemies/common.js";
import { computeFlyingBomberPath, updateFlyingBomberBehavior } from "../systems/enemies/flyingBomber.js";
import { updateMortarBehavior } from "../systems/enemies/mortar.js";
import { updateShooterBehavior } from "../systems/enemies/shooter.js";
import { updateShotgunShooterBehavior } from "../systems/enemies/shotgunShooter.js";
import { updateIndicators } from "../systems/indicatorSystem.js";
import { updateEffects, updateFloatingTexts, updateSlashEffects } from "../systems/effectSystem.js";
import { updateProjectiles as updateProjectilesSystem } from "../systems/projectileSystem.js";

const DT = 1 / 60;
const DIFFICULTY = 10;
const SPEED_MULT = 1;
const PLAYER_MAX_HP = 140;
const PLAYER_RESPAWN_DELAY = 0.95;
const BOMBER_RESPAWN_DELAY = 0.85;
const SLIME_OPENING_SPLIT_DELAY = 0.5;
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
    legend: "Takes a scripted hit after 0.5s to split once, then continues normal pursuit.",
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

function createMockState() {
  const state = createInitialState();
  state.running = true;
  state.paused = false;
  state.titleScreen = false;
  state.gameOver = false;
  state.player.x = 0;
  state.player.y = 0;
  state.player.aim.x = state.player.x + 120;
  state.player.aim.y = state.player.y;
  state.systems.world = createWorldSystem(1337);
  return state;
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
  state.player.x = 0;
  state.player.y = 0;
  state.player.hp = PLAYER_MAX_HP;
  state.player.maxHp = PLAYER_MAX_HP;
  state.player.radius = 12;

  const services = createGameServices({
    gameState: state,
    canvas,
    documentRef: document,
    isDebugMode: false,
  });
  const renderer = createRenderer(canvas, state);

  const enemy = makeEnemy(type);
  state.enemies.push(enemy);

  return {
    type,
    state,
    services,
    renderer,
    player: state.player,
    enemy,
    enemyRespawnTimer: 0,
    playerRespawnTimer: 0,
    deaths: 0,
    elapsed: 0,
    slimeScript:
      type === "slime"
        ? {
            phase: "opening-split",
            splitEvents: 0,
            openingSplitDone: false,
            openingSplitDelay: SLIME_OPENING_SPLIT_DELAY,
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
  sim.state.player.hp = sim.player.maxHp;
  sim.state.player.x = sim.player.x;
  sim.state.player.y = sim.player.y;
  sim.slimeScript = {
    phase: "opening-split",
    splitEvents: 0,
    openingSplitDone: false,
    openingSplitDelay: SLIME_OPENING_SPLIT_DELAY,
  };
}

function respawnPlayer(sim) {
  sim.player.hp = sim.player.maxHp;
  sim.player.x = 0;
  sim.player.y = 0;
  sim.playerRespawnTimer = 0;
  sim.state.player.hp = sim.player.hp;
  sim.state.player.x = sim.player.x;
  sim.state.player.y = sim.player.y;

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
  let accumulatedContactDamage = 0;
  for (let i = 0; i < enemies.length; i += 1) {
    const enemy = enemies[i];
    const dist = Math.hypot(enemy.x - sim.player.x, enemy.y - sim.player.y);
    if (dist <= enemy.radius + sim.player.radius) {
      const dps = Math.max(6, enemy.contactDamage || 10);
      accumulatedContactDamage += dps * DT;
    }
  }

  if (accumulatedContactDamage > 0) {
    sim.player.hp -= accumulatedContactDamage;
    spawnFloatingText(
      sim.state,
      `-${Math.max(1, Math.round(accumulatedContactDamage))}`,
      sim.player.x,
      sim.player.y - sim.player.radius - 8,
      "255,142,150",
      20,
      "damage"
    );
    sim.state.screenFx.shake = Math.min(14, sim.state.screenFx.shake + 0.9);
    sim.state.screenFx.damageFlash = Math.min(1, sim.state.screenFx.damageFlash + 0.06);
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
  if (!script.openingSplitDone) {
    if (script.openingSplitDelay > 0) {
      script.openingSplitDelay = Math.max(0, script.openingSplitDelay - DT);
      script.phase = "opening-delay";
      return;
    }

    const openingTarget = sim.state.enemies.find((enemy) => enemy.type === "slime" && (enemy.slimeTier || 0) === 0);
    if (openingTarget) {
      const scriptedDamage = Math.max(1, openingTarget.hp);
      openingTarget.hp -= scriptedDamage;
      sim.state.effects.push({
        x: openingTarget.x,
        y: openingTarget.y,
        radius: Math.max(8, openingTarget.radius * 0.4),
        elapsed: 0,
        duration: 0.16,
        growth: 18,
        color: "255, 224, 170",
      });
      spawnFloatingText(
        sim.state,
        `-${Math.max(1, Math.round(scriptedDamage))}`,
        openingTarget.x,
        openingTarget.y - openingTarget.radius - 4,
        "255,214,168",
        21,
        "damage"
      );
      sim.state.screenFx.shake = Math.min(14, sim.state.screenFx.shake + 0.7);

      const index = sim.state.enemies.indexOf(openingTarget);
      if (index >= 0 && openingTarget.hp <= 0) {
        sim.state.enemies.splice(index, 1);
      }
      if (openingTarget.hp <= 0 && (openingTarget.slimeTier || 0) < (openingTarget.maxSlimeTier || 0)) {
        splitSlimeEnemy(sim, openingTarget);
        script.splitEvents += 1;
      }
    }
    script.openingSplitDone = true;
    script.phase = "active";
    return;
  }

}

function handleProjectileHits(sim) {
  if (sim.playerRespawnTimer > 0) {
    return;
  }

  let accumulatedProjectileDamage = 0;
  for (let i = sim.state.projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = sim.state.projectiles[i];
    const dist = Math.hypot(projectile.position.x - sim.player.x, projectile.position.y - sim.player.y);
    const hitRadius = (projectile.radius || 4) + sim.player.radius;
    if (dist <= hitRadius) {
      accumulatedProjectileDamage += projectile.damage || 8;
      sim.state.projectiles.splice(i, 1);
    }
  }

  if (accumulatedProjectileDamage > 0) {
    sim.player.hp -= accumulatedProjectileDamage;
    spawnFloatingText(
      sim.state,
      `-${Math.max(1, Math.round(accumulatedProjectileDamage))}`,
      sim.player.x,
      sim.player.y - sim.player.radius - 8,
      "255,142,150",
      20,
      "damage"
    );
    sim.state.screenFx.shake = Math.min(14, sim.state.screenFx.shake + 0.9);
    sim.state.screenFx.damageFlash = Math.min(1, sim.state.screenFx.damageFlash + 0.06);
  }
}

function updateEnemyBehavior(sim) {
  const { state, type } = sim;
  const player = state.player;
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
  updateProjectilesSystem(sim.services, DT);
}

function updateIndicatorsAndEffects(sim) {
  const triggered = updateIndicators(sim.state.indicators, DT);
  for (let i = 0; i < triggered.length; i += 1) {
    const indicator = triggered[i];
    if (typeof indicator.onTrigger === "function") {
      indicator.onTrigger();
    }
  }

  updateSlashEffects(sim.state, DT);
  updateEffects(sim.state, DT);
  updateFloatingTexts(sim.state, DT);
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
    sim.state.player.hp = 0;
    sim.deaths += 1;
    sim.playerRespawnTimer = PLAYER_RESPAWN_DELAY;
    queueEnemyRespawn(sim, sim.type === "bomber" ? BOMBER_RESPAWN_DELAY : 0.15);
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
  activeSim.renderer.render();
  updateStats(activeSim);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
