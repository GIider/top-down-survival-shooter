import { updateProjectile } from "../entities/projectile.js";
import { getMountainCollisionNormal, igniteTreesAt, isProjectileBlockedByMountain } from "./worldSystem.js";

function spawnProjectileObstacleImpact(gameState, projectile, collision) {
  const hitX = collision?.x ?? projectile.position.x;
  const hitY = collision?.y ?? projectile.position.y;
  const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y);
  const baseRadius = Math.max(2, projectile.radius * 0.8);
  const ringGrowth = Math.min(34, 14 + speed * 0.02);

  gameState.effects.push({
    x: hitX,
    y: hitY,
    radius: baseRadius,
    elapsed: 0,
    duration: 0.16,
    growth: ringGrowth,
    color: projectile.owner === "enemy" ? "255,162,170" : "255,224,170",
  });

  const impactAngle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
  const sparkCount = projectile.owner === "enemy" ? 5 : 7;
  for (let i = 0; i < sparkCount; i += 1) {
    const spread = (Math.random() - 0.5) * Math.PI * 0.9;
    const angle = impactAngle + Math.PI + spread;
    const sparkSpeed = 34 + Math.random() * 58;
    const sparkRadius = 1.4 + Math.random() * 1.8;
    gameState.effects.push({
      kind: "particle",
      x: hitX,
      y: hitY,
      vx: Math.cos(angle) * sparkSpeed,
      vy: Math.sin(angle) * sparkSpeed,
      drag: 5.2,
      radius: sparkRadius,
      growth: -2.4,
      elapsed: 0,
      duration: 0.2 + Math.random() * 0.1,
      color: projectile.owner === "enemy" ? "255,148,158" : "255,214,168",
    });
  }
}

export function updateProjectiles(services, dt) {
  const gameState = services.gameState;
  const canvas = services.canvas;
  const world = services.getWorld();
  const viewMinX = gameState.player.x - canvas.width * 0.5 - 40;
  const viewMaxX = gameState.player.x + canvas.width * 0.5 + 40;
  const viewMinY = gameState.player.y - canvas.height * 0.5 - 40;
  const viewMaxY = gameState.player.y + canvas.height * 0.5 + 40;

  for (let index = gameState.projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = gameState.projectiles[index];
    let obstacleCollision = null;
    updateProjectile(projectile, dt);
    if (projectile.owner === "player" && projectile.isFireArrow) {
      igniteTreesAt(world, projectile.position.x, projectile.position.y, projectile.radius + 6);
    }
    if (isProjectileBlockedByMountain(world, projectile.position.x, projectile.position.y, projectile.radius)) {
      obstacleCollision = getMountainCollisionNormal(world, projectile.position.x, projectile.position.y, projectile.radius);
      if (projectile.owner === "player" && projectile.bounceRemaining > 0) {
        const collision = obstacleCollision;
        if (collision) {
          const dot = projectile.velocity.x * collision.nx + projectile.velocity.y * collision.ny;
          projectile.velocity.x -= 2 * dot * collision.nx;
          projectile.velocity.y -= 2 * dot * collision.ny;
          projectile.velocity.x *= 1.02;
          projectile.velocity.y *= 1.02;
          projectile.position.x = collision.x;
          projectile.position.y = collision.y;
          projectile.bounceRemaining -= 1;
        } else {
          projectile.alive = false;
          spawnProjectileObstacleImpact(gameState, projectile, obstacleCollision);
        }
      } else {
        projectile.alive = false;
        spawnProjectileObstacleImpact(gameState, projectile, obstacleCollision);
      }
    }

    if (
      !projectile.alive ||
      projectile.position.x < viewMinX ||
      projectile.position.x > viewMaxX ||
      projectile.position.y < viewMinY ||
      projectile.position.y > viewMaxY
    ) {
      gameState.projectiles.splice(index, 1);
    }
  }
}