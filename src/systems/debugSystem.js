import { GAME_CONFIG } from "../core/constants.js";
import { createEnemy } from "../entities/enemy.js";

function spawnDebugEnemy(services, type) {
  const gameState = services.gameState;
  const canvas = services.canvas;
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.max(canvas.width, canvas.height) * 0.42;
  const x = gameState.player.x + Math.cos(angle) * distance;
  const y = gameState.player.y + Math.sin(angle) * distance;
  const difficulty = gameState.time * 0.02;
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

export function createDebugSystem(services) {
  const debugControls = services.document.getElementById("debug-controls");
  const debugDirectorToggle = services.document.getElementById("debug-director-toggle");
  const debugLevelUpButton = services.document.getElementById("debug-level-up");
  let debugDirectorEnabled = false;

  if (services.isDebugMode && debugControls) {
    debugControls.hidden = false;

    if (debugDirectorToggle) {
      debugDirectorToggle.checked = false;
      debugDirectorToggle.addEventListener("change", () => {
        debugDirectorEnabled = debugDirectorToggle.checked;
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
  };
}