import { GAME_CONFIG } from "../core/constants.js";
import { createEnemy } from "../entities/enemy.js";
import { PICKUP_POOL } from "./pickups/pickupCatalog.js";
import { computeFlyingBomberPath } from "./enemies/flyingBomber.js";

function spawnDebugEnemy(services, type) {
  const gameState = services.gameState;
  const canvas = services.canvas;
  const difficulty = gameState.time * 0.02;
  if (type === "flyingBomber") {
    const aiState = gameState.systems?.enemyAi;
    const vel = aiState ? aiState.playerVelocity : { x: 0, y: 0 };
    const path = computeFlyingBomberPath(gameState.player, vel);
    gameState.enemies.push(createEnemy("flyingBomber", path.fromX, path.fromY, difficulty, {
      fromX: path.fromX, fromY: path.fromY, dirX: path.dirX, dirY: path.dirY, exitX: path.exitX, exitY: path.exitY,
    }));
    return;
  }
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.max(canvas.width, canvas.height) * 0.42;
  const x = gameState.player.x + Math.cos(angle) * distance;
  const y = gameState.player.y + Math.sin(angle) * distance;
  gameState.enemies.push(createEnemy(type, x, y, difficulty));
}

function applyDebugLevelUp(services) {
  const gameState = services.gameState;
  const player = gameState.player;
  player.level += 1;
  player.perkPoints += GAME_CONFIG.player.levelUpPerkPoints;
  player.xp = 0;
  player.xpToNext = Math.floor(player.xpToNext * GAME_CONFIG.player.levelUpXpMultiplier);
}

function spawnDebugPickups(services) {
  const gameState = services.gameState;
  const player = gameState.player;
  const radius = 84;
  const count = PICKUP_POOL.length;

  for (let index = 0; index < count; index += 1) {
    const def = PICKUP_POOL[index];
    const angle = (Math.PI * 2 * index) / count;
    gameState.drops.push({
      type: def.type,
      icon: def.icon,
      color: def.color,
      radius: def.radius,
      lifetime: def.lifetime,
      position: {
        x: player.x + Math.cos(angle) * radius,
        y: player.y + Math.sin(angle) * radius,
      },
    });
  }
}

export function createDebugSystem(services) {
  const debugControls = services.document.getElementById("debug-controls");
  const debugDirectorToggle = services.document.getElementById("debug-director-toggle");
  const debugNoCooldownsToggle = services.document.getElementById("debug-no-cooldowns-toggle");
  const debugLevelUpButton = services.document.getElementById("debug-level-up");
  const debugSpawnPickupsButton = services.document.getElementById("debug-spawn-pickups");
  let debugDirectorEnabled = false;
  let debugNoCooldownsEnabled = false;

  if (services.isDebugMode && debugControls) {
    debugControls.hidden = false;

    if (debugDirectorToggle) {
      debugDirectorToggle.checked = false;
      debugDirectorToggle.addEventListener("change", () => {
        debugDirectorEnabled = debugDirectorToggle.checked;
      });
    }

    if (debugNoCooldownsToggle) {
      debugNoCooldownsToggle.checked = false;
      debugNoCooldownsToggle.addEventListener("change", () => {
        debugNoCooldownsEnabled = debugNoCooldownsToggle.checked;
      });
    }

    const buttons = debugControls.querySelectorAll("button[data-enemy-type]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const type = button.getAttribute("data-enemy-type");
        if (type) {
          spawnDebugEnemy(services, type);
        }
      });
    });

    if (debugLevelUpButton) {
      debugLevelUpButton.addEventListener("click", () => {
        applyDebugLevelUp(services);
      });
    }

    if (debugSpawnPickupsButton) {
      debugSpawnPickupsButton.addEventListener("click", () => {
        spawnDebugPickups(services);
      });
    }
  }

  return {
    seedStarterEnemies() {
      if (!services.isDebugMode) {
        const gameState = services.gameState;
        const canvas = services.canvas;
        gameState.enemies.push(createEnemy("mortar", gameState.player.x + canvas.width * 0.5 + 90, gameState.player.y, 0));
      }
    },
    isDirectorEnabled() {
      return debugDirectorEnabled;
    },
    isNoCooldownsEnabled() {
      return debugNoCooldownsEnabled;
    },
  };
}