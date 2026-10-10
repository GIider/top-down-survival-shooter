import { GAME_CONFIG } from "../core/constants.js";
import { createEnemy } from "../entities/enemy.js";
import { PICKUP_POOL } from "./pickups/pickupCatalog.js";
import { spawnBoss } from "./bosses/bossSystem.js";
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

// Entries shown on the pause-menu debug page (?debug=1). "toggle" items keep state in the debug system.
export const DEBUG_MENU_ITEMS = [
  { id: "director", label: "Director auto spawning", kind: "toggle" },
  { id: "noCooldowns", label: "No Cooldowns", kind: "toggle" },
  { id: "chaser", label: "Spawn Chaser", kind: "enemy" },
  { id: "slime", label: "Spawn Slime", kind: "enemy" },
  { id: "shooter", label: "Spawn Shooter", kind: "enemy" },
  { id: "assaultShooter", label: "Spawn Assault Shooter", kind: "enemy" },
  { id: "shotgunShooter", label: "Spawn Shotgun Shooter", kind: "enemy" },
  { id: "bomber", label: "Spawn Bomber", kind: "enemy" },
  { id: "mortar", label: "Spawn Mortar", kind: "enemy" },
  { id: "flyingBomber", label: "Spawn Flying Bomber", kind: "enemy" },
  { id: "boss_kaleidoscope", label: "Spawn Kaleidoscope Boss", kind: "boss" },
  { id: "levelUp", label: "Level Up Player", kind: "action" },
  { id: "pickups", label: "Spawn Pickups", kind: "action" },
];

export function createDebugSystem(services) {
  let debugDirectorEnabled = false;
  let debugNoCooldownsEnabled = false;

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
    isToggled(id) {
      return id === "director" ? debugDirectorEnabled : id === "noCooldowns" ? debugNoCooldownsEnabled : false;
    },
    activate(id) {
      const item = DEBUG_MENU_ITEMS.find((entry) => entry.id === id);
      if (!item) {
        return;
      }
      if (id === "director") {
        debugDirectorEnabled = !debugDirectorEnabled;
      } else if (id === "noCooldowns") {
        debugNoCooldownsEnabled = !debugNoCooldownsEnabled;
      } else if (id === "levelUp") {
        applyDebugLevelUp(services);
      } else if (id === "pickups") {
        spawnDebugPickups(services);
      } else if (item.kind === "boss") {
        spawnBoss(services.gameState, id.replace("boss_", ""));
      } else if (item.kind === "enemy") {
        spawnDebugEnemy(services, id);
      }
    },
  };
}