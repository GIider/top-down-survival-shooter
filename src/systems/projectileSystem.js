import { updateProjectile } from "../entities/projectile.js";
import { getMountainCollisionNormal, isProjectileBlockedByMountain } from "./worldSystem.js";

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
    updateProjectile(projectile, dt);
    if (isProjectileBlockedByMountain(world, projectile.position.x, projectile.position.y, projectile.radius)) {
      if (projectile.owner === "player" && projectile.bounceRemaining > 0) {
        const collision = getMountainCollisionNormal(world, projectile.position.x, projectile.position.y, projectile.radius);
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
        }
      } else {
        projectile.alive = false;
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