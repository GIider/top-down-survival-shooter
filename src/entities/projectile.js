export function createProjectile({ position, velocity, damage, lifetime, owner, color = "#ffe18a", radius = 4, modifiers = [], ...extra }) {
  return {
    position: { ...position },
    velocity: { ...velocity },
    damage,
    lifetime,
    owner,
    color,
    radius,
    modifiers,
    alive: true,
    ...extra,
  };
}

export function updateProjectile(projectile, dt) {
  projectile.position.x += projectile.velocity.x * dt;
  projectile.position.y += projectile.velocity.y * dt;
  projectile.lifetime -= dt;

  if (projectile.lifetime <= 0) {
    projectile.alive = false;
    projectile.modifiers.forEach((modifier) => {
      if (typeof modifier.onExpire === "function") {
        modifier.onExpire(projectile);
      }
    });
  }
}
