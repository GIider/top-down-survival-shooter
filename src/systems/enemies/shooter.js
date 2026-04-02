import { GAME_CONFIG } from "../../core/constants.js";
import { createProjectile } from "../../entities/projectile.js";
import { moveEnemyWithTerrain, normalize, pickShooterAimPoint } from "./common.js";

const ENEMY_CONFIG = GAME_CONFIG.enemies.archetypes;

export function updateShooterBehavior(gameState, enemy, player, world, dt, speedMultiplier, playerVelocity) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dir = normalize(dx, dy);
  const tooClose = distance < enemy.preferredDistance - 24;
  const tooFar = distance > enemy.preferredDistance + 24;
  const moveDirection = tooClose ? -1 : tooFar ? 1 : 0;
  moveEnemyWithTerrain(enemy, dir, enemy.speed * speedMultiplier, dt, world, moveDirection);

  enemy.fireTimer += dt;
  if (enemy.fireTimer >= enemy.fireCooldown) {
    enemy.fireTimer = 0;
    const aimPoint = pickShooterAimPoint(enemy.x, enemy.y, player, playerVelocity, ENEMY_CONFIG.shooter.projectile.speed);
    const fireDir = normalize(aimPoint.x - enemy.x, aimPoint.y - enemy.y);
    gameState.projectiles.push(
      createProjectile({
        position: { x: enemy.x, y: enemy.y },
        velocity: { x: fireDir.x * ENEMY_CONFIG.shooter.projectile.speed, y: fireDir.y * ENEMY_CONFIG.shooter.projectile.speed },
        damage: ENEMY_CONFIG.shooter.projectile.damage,
        lifetime: ENEMY_CONFIG.shooter.projectile.lifetime,
        owner: "enemy",
        color: ENEMY_CONFIG.shooter.projectile.color,
        radius: ENEMY_CONFIG.shooter.projectile.radius,
        modifiers: [],
      })
    );
  }
}
