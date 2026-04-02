import { GAME_CONFIG } from "../../core/constants.js";
import { createProjectile } from "../../entities/projectile.js";
import { moveEnemyWithTerrain, normalize, pickShooterAimPoint } from "./common.js";

const ENEMY_CONFIG = GAME_CONFIG.enemies.archetypes;

export function updateAssaultShooterBehavior(gameState, enemy, player, world, dt, speedMultiplier, playerVelocity) {
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dir = normalize(dx, dy);
  const tooClose = distance < enemy.preferredDistance - 26;
  const tooFar = distance > enemy.preferredDistance + 26;
  const moveDirection = tooClose ? -1 : tooFar ? 1 : 0;
  moveEnemyWithTerrain(enemy, dir, enemy.speed * speedMultiplier, dt, world, moveDirection);

  if (enemy.burstShotsRemaining <= 0) {
    enemy.fireTimer += dt;
    if (enemy.fireTimer >= enemy.fireCooldown) {
      enemy.fireTimer = 0;
      enemy.burstShotsRemaining = enemy.burstCount;
      enemy.burstTimer = 0;
      enemy.waveSeed = Math.random() * Math.PI * 2;
    }
  }

  if (enemy.burstShotsRemaining <= 0) {
    return;
  }

  enemy.burstTimer += dt;
  while (enemy.burstTimer >= enemy.burstInterval && enemy.burstShotsRemaining > 0) {
    enemy.burstTimer -= enemy.burstInterval;

    const shotIndex = enemy.burstCount - enemy.burstShotsRemaining;
    const progress = enemy.burstCount <= 1 ? 0 : shotIndex / (enemy.burstCount - 1);
    const wavePhase = enemy.waveSeed + progress * Math.PI * 2 * enemy.waveFrequency;
    const lateralOffset = Math.sin(wavePhase) * enemy.waveAmplitude;
    const perp = { x: -dir.y, y: dir.x };
    const spawnX = enemy.x + perp.x * lateralOffset;
    const spawnY = enemy.y + perp.y * lateralOffset;
    const aimPoint = pickShooterAimPoint(spawnX, spawnY, player, playerVelocity, enemy.projectileSpeed);
    const toAim = normalize(aimPoint.x - spawnX, aimPoint.y - spawnY);
    const baseAngle = Math.atan2(toAim.y, toAim.x);
    const angle = baseAngle + (Math.random() * 2 - 1) * enemy.aimJitter;
    const speed = enemy.projectileSpeed * (0.95 + Math.random() * ENEMY_CONFIG.assaultShooter.projectile.speedVariance);

    gameState.projectiles.push(
      createProjectile({
        position: { x: spawnX, y: spawnY },
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        damage: enemy.projectileDamage,
        lifetime: enemy.projectileLifetime,
        owner: "enemy",
        color: ENEMY_CONFIG.assaultShooter.projectile.color,
        radius: ENEMY_CONFIG.assaultShooter.projectile.radius,
        modifiers: [],
      })
    );

    enemy.burstShotsRemaining -= 1;
  }
}
