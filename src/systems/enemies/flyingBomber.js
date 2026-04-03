import { CANVAS, GAME_CONFIG } from "../../core/constants.js";
import { spawnIndicator } from "../indicatorSystem.js";
import { spawnFloatingText } from "./common.js";

const FLY_CONFIG = GAME_CONFIG.enemies.archetypes.flyingBomber;

export function computeFlyingBomberPath(player, playerVelocity) {
  const halfW = CANVAS.width * 0.5;
  const halfH = CANVAS.height * 0.5;
  const margin = 200;

  // Pick target: player's current position or predicted position
  const usePredicted = Math.random() < 0.5;
  const lookAheadTime = 1.2;
  const targetX = usePredicted ? player.x + playerVelocity.x * lookAheadTime : player.x;
  const targetY = usePredicted ? player.y + playerVelocity.y * lookAheadTime : player.y;

  // Pick a random entry edge (0=left, 1=right, 2=top, 3=bottom)
  const edge = Math.floor(Math.random() * 4);
  let fromX, fromY;
  if (edge === 0) {
    fromX = player.x - halfW - margin;
    fromY = targetY + (Math.random() * 2 - 1) * halfH * 0.6;
  } else if (edge === 1) {
    fromX = player.x + halfW + margin;
    fromY = targetY + (Math.random() * 2 - 1) * halfH * 0.6;
  } else if (edge === 2) {
    fromX = targetX + (Math.random() * 2 - 1) * halfW * 0.6;
    fromY = player.y - halfH - margin;
  } else {
    fromX = targetX + (Math.random() * 2 - 1) * halfW * 0.6;
    fromY = player.y + halfH + margin;
  }

  const dxRaw = targetX - fromX;
  const dyRaw = targetY - fromY;
  const lenRaw = Math.hypot(dxRaw, dyRaw) || 1;
  const dirX = dxRaw / lenRaw;
  const dirY = dyRaw / lenRaw;

  const diagonal = Math.hypot(CANVAS.width, CANVAS.height);
  const totalLen = lenRaw + diagonal + margin;
  const exitX = fromX + dirX * totalLen;
  const exitY = fromY + dirY * totalLen;

  return { fromX, fromY, dirX, dirY, exitX, exitY };
}

export function updateFlyingBomberBehavior(gameState, enemy, player, dt) {
  if (enemy.flyPhase === "warning") {
    enemy.warningTimer -= dt;
    if (enemy.warningTimer <= 0) {
      enemy.flyPhase = "flying";
      enemy.distTraveled = 0;
      // First bomb drops after a short initial distance so it starts close to the viewport edge
      enemy.bombDistAccum = FLY_CONFIG.bombInterval * 0.5;
    }
    return;
  }

  if (enemy.flyPhase === "flying") {
    const step = FLY_CONFIG.flySpeed * dt;
    enemy.x += enemy.flyDirX * step;
    enemy.y += enemy.flyDirY * step;
    enemy.distTraveled = (enemy.distTraveled || 0) + step;
    enemy.bombDistAccum = (enemy.bombDistAccum || 0) + step;

    while (enemy.bombDistAccum >= FLY_CONFIG.bombInterval) {
      enemy.bombDistAccum -= FLY_CONFIG.bombInterval;
      dropBomb(gameState, enemy, player);
    }

    // Mark done once off-screen and has traveled past the original entry distance
    const halfW = CANVAS.width * 0.5;
    const halfH = CANVAS.height * 0.5;
    const offX = enemy.x < player.x - halfW - 120 || enemy.x > player.x + halfW + 120;
    const offY = enemy.y < player.y - halfH - 120 || enemy.y > player.y + halfH + 120;
    const fromLen = Math.hypot(enemy.flyExitX - enemy.flyFromX, enemy.flyExitY - enemy.flyFromY);
    if ((offX || offY) && enemy.distTraveled >= fromLen * 0.4) {
      enemy.isDone = true;
    }
  }
}

function dropBomb(gameState, enemy, player) {
  const bx = enemy.x;
  const by = enemy.y;
  const radius = FLY_CONFIG.bombRadius;
  const damage = FLY_CONFIG.bombDamage;

  spawnIndicator(gameState.indicators, {
    type: "circle",
    position: { x: bx, y: by },
    size: { radius },
    duration: FLY_CONFIG.bombTelegraphDuration,
    source: "flyingBomber",
    onTrigger() {
      const dist = Math.hypot(player.x - bx, player.y - by);
      if (dist <= radius) {
        player.hp -= damage;
        spawnFloatingText(gameState, `-${damage}`, player.x, player.y - player.radius - 8, "255,142,150", 22, "damage");
        gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 2.1);
        gameState.screenFx.damageFlash = Math.min(1, gameState.screenFx.damageFlash + 0.18);
      }
      gameState.effects.push(
        { x: bx, y: by, radius: 14, elapsed: 0, duration: 0.32, growth: 30, color: "255, 90, 120" },
        { x: bx, y: by, radius: radius * 0.55, elapsed: 0, duration: 0.52, growth: 11, color: "255, 185, 100" }
      );
    },
  });
}
