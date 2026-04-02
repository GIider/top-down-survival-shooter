import { GAME_CONFIG } from "../../core/constants.js";
import { createProjectile } from "../../entities/projectile.js";
import { moveEnemyWithTerrain, normalize, pickShooterAimPoint } from "./common.js";

const ENEMY_CONFIG = GAME_CONFIG.enemies.archetypes;

export function updateShotgunShooterBehavior(gameState, enemy, player, world, dt, speedMultiplier, playerVelocity) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dir = normalize(dx, dy);
  const tooClose = distance < enemy.preferredDistance - 24;
  const tooFar = distance > enemy.preferredDistance + 24;
  const moveDirection = tooClose ? -1 : tooFar ? 1 : 0;
  moveEnemyWithTerrain(enemy, dir, enemy.speed * speedMultiplier, dt, world, moveDirection);

  enemy.fireTimer += dt;
  if (enemy.fireTimer < enemy.fireCooldown) {
    return;
  }

  enemy.fireTimer = 0;
  const aimPoint = pickShooterAimPoint(enemy.x, enemy.y, player, playerVelocity, enemy.projectileSpeed);
  const toAim = normalize(aimPoint.x - enemy.x, aimPoint.y - enemy.y);
  const centerAngle = Math.atan2(toAim.y, toAim.x);

  for (let pellet = 0; pellet < enemy.pelletCount; pellet += 1) {
    const spread = (Math.random() * 2 - 1) * enemy.pelletSpread;
    const angle = centerAngle + spread;
    const speed = enemy.projectileSpeed * (0.9 + Math.random() * 0.2);

    gameState.projectiles.push(
      createProjectile({
        position: { x: enemy.x, y: enemy.y },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        damage: enemy.projectileDamage,
        lifetime: enemy.projectileLifetime,
        owner: "enemy",
        color: ENEMY_CONFIG.shotgunShooter.projectile.color,
        radius: ENEMY_CONFIG.shotgunShooter.projectile.radius,
        modifiers: [],
      })
    );
  }
}
