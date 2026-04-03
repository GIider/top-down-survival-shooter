import { GAME_CONFIG } from "../core/constants.js";

function getPickupDropMultiplier(type, options = {}) {
  if (type === "chaser") {
    return 0.32;
  }

  if (type === "slime") {
    const tier = Math.max(0, options.tier || 0);
    const multipliers = [0.0, 0.0, 0.0, 0.12];
    return multipliers[Math.min(tier, multipliers.length - 1)];
  }

  if (type === "shooter") {
    return 0.8;
  }

  if (type === "assaultShooter") {
    return 1.05;
  }

  if (type === "shotgunShooter") {
    return 1.1;
  }

  if (type === "bomber") {
    return 0.95;
  }

  if (type === "flyingBomber") {
    return 1.1;
  }

  if (type === "mortar") {
    return 1.3;
  }

  return 1;
}

export function createEnemy(type, x, y, difficulty, options = {}) {
  const enemyConfig = GAME_CONFIG.enemies.archetypes;
  const shooterHp = enemyConfig.shooter.hpBase + difficulty * enemyConfig.shooter.hpDifficultyScale;
  const assaultShooterHp = enemyConfig.assaultShooter.hpBase + difficulty * enemyConfig.assaultShooter.hpDifficultyScale;
  const shotgunShooterHp = enemyConfig.shotgunShooter.hpBase + difficulty * enemyConfig.shotgunShooter.hpDifficultyScale;
  const mortarHp = enemyConfig.mortar.hpBase + difficulty * enemyConfig.mortar.hpDifficultyScale;
  const bomberHp = enemyConfig.bomber.hpBase + difficulty * enemyConfig.bomber.hpDifficultyScale;
  const chaserHp = enemyConfig.chaser.hpBase + difficulty * enemyConfig.chaser.hpDifficultyScale;
  const flyingBomberHp = enemyConfig.flyingBomber.hpBase + difficulty * enemyConfig.flyingBomber.hpDifficultyScale;

  const recycleState = {
    isRespawning: false,
    respawnTimer: 0,
    offscreenTime: 0,
    spawnBoostTimer:
      GAME_CONFIG.enemies.ai.spawnBoostTime.min +
      Math.random() * (GAME_CONFIG.enemies.ai.spawnBoostTime.max - GAME_CONFIG.enemies.ai.spawnBoostTime.min),
    spawnBoostMultiplier: GAME_CONFIG.enemies.ai.spawnBoostMultiplier,
    pickupDropMultiplier: getPickupDropMultiplier(type, options),
  };

  if (type === "shooter") {
    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: shooterHp,
      maxHp: shooterHp,
      speed: enemyConfig.shooter.speedBase + difficulty * enemyConfig.shooter.speedDifficultyScale,
      radius: enemyConfig.shooter.radius,
      color: enemyConfig.shooter.color,
      fireCooldown: enemyConfig.shooter.fireCooldown,
      fireTimer: 0,
      preferredDistance: enemyConfig.shooter.preferredDistance,
      contactDamage: enemyConfig.shooter.contactDamage,
      xp: enemyConfig.shooter.xp,
      ...recycleState,
    };
  }

  if (type === "mortar") {
    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: mortarHp,
      maxHp: mortarHp,
      speed: enemyConfig.mortar.speedBase + difficulty * enemyConfig.mortar.speedDifficultyScale,
      radius: enemyConfig.mortar.radius,
      color: enemyConfig.mortar.color,
      throwCooldown: enemyConfig.mortar.throwCooldown,
      throwTimer: enemyConfig.mortar.throwTimer,
      preferredDistance: enemyConfig.mortar.preferredDistance,
      throwRange: enemyConfig.mortar.throwRange,
      contactDamage: enemyConfig.mortar.contactDamage,
      xp: enemyConfig.mortar.xp,
      ...recycleState,
    };
  }

  if (type === "assaultShooter") {
    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: assaultShooterHp,
      maxHp: assaultShooterHp,
      speed: enemyConfig.assaultShooter.speedBase + difficulty * enemyConfig.assaultShooter.speedDifficultyScale,
      radius: enemyConfig.assaultShooter.radius,
      color: enemyConfig.assaultShooter.color,
      fireCooldown: enemyConfig.assaultShooter.fireCooldown,
      fireTimer: 0.8,
      preferredDistance: enemyConfig.assaultShooter.preferredDistance,
      burstCount: enemyConfig.assaultShooter.burstCount,
      burstShotsRemaining: 0,
      burstInterval: enemyConfig.assaultShooter.burstInterval,
      burstTimer: 0,
      waveAmplitude: enemyConfig.assaultShooter.waveAmplitude,
      waveFrequency: enemyConfig.assaultShooter.waveFrequency,
      waveSeed: Math.random() * Math.PI * 2,
      aimJitter: enemyConfig.assaultShooter.aimJitter,
      projectileSpeed: enemyConfig.assaultShooter.projectile.speed,
      projectileDamage: enemyConfig.assaultShooter.projectile.damage,
      projectileLifetime: enemyConfig.assaultShooter.projectile.lifetime,
      contactDamage: enemyConfig.assaultShooter.contactDamage,
      xp: enemyConfig.assaultShooter.xp,
      ...recycleState,
    };
  }

  if (type === "shotgunShooter") {
    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: shotgunShooterHp,
      maxHp: shotgunShooterHp,
      speed: enemyConfig.shotgunShooter.speedBase + difficulty * enemyConfig.shotgunShooter.speedDifficultyScale,
      radius: enemyConfig.shotgunShooter.radius,
      color: enemyConfig.shotgunShooter.color,
      fireCooldown: enemyConfig.shotgunShooter.fireCooldown,
      fireTimer: 0.9,
      preferredDistance: enemyConfig.shotgunShooter.preferredDistance,
      pelletCount: enemyConfig.shotgunShooter.pelletCount,
      pelletSpread: enemyConfig.shotgunShooter.pelletSpread,
      projectileSpeed: enemyConfig.shotgunShooter.projectile.speed,
      projectileDamage: enemyConfig.shotgunShooter.projectile.damage,
      projectileLifetime: enemyConfig.shotgunShooter.projectile.lifetime,
      contactDamage: enemyConfig.shotgunShooter.contactDamage,
      xp: enemyConfig.shotgunShooter.xp,
      ...recycleState,
    };
  }

  if (type === "slime") {
    const slimeConfig = enemyConfig.slime;
    const maxSlimeTier = slimeConfig.maxTier;
    const tier = Math.max(0, Math.min(maxSlimeTier, options.tier || 0));

    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: slimeConfig.hpByTier[tier] + difficulty * slimeConfig.hpDifficultyScaleByTier[tier],
      maxHp: slimeConfig.hpByTier[tier] + difficulty * slimeConfig.hpDifficultyScaleByTier[tier],
      speed: slimeConfig.speedByTier[tier] + difficulty * 2,
      radius: slimeConfig.radiusByTier[tier],
      color: slimeConfig.colorByTier[tier],
      contactDamage: slimeConfig.contactDamageByTier[tier],
      xp: slimeConfig.xpByTier[tier],
      slimeTier: tier,
      maxSlimeTier,
      splitCount: slimeConfig.splitCount,
      ...recycleState,
    };
  }

  if (type === "bomber") {
    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: bomberHp,
      maxHp: bomberHp,
      speed: enemyConfig.bomber.speedBase + difficulty * enemyConfig.bomber.speedDifficultyScale,
      radius: enemyConfig.bomber.radius,
      color: enemyConfig.bomber.color,
      contactDamage: enemyConfig.bomber.contactDamage,
      explosionRadius: enemyConfig.bomber.explosionRadius,
      explosionDamage: enemyConfig.bomber.explosionDamage,
      detonationRange: enemyConfig.bomber.detonationRange,
      fuseDuration: enemyConfig.bomber.fuseDuration,
      fuseTimer: 0,
      isPrimed: false,
      xp: enemyConfig.bomber.xp,
      ...recycleState,
    };
  }

  if (type === "flyingBomber") {
    const flyConfig = enemyConfig.flyingBomber;
    return {
      type,
      x: options.fromX !== undefined ? options.fromX : x,
      y: options.fromY !== undefined ? options.fromY : y,
      vx: 0,
      vy: 0,
      hp: flyingBomberHp,
      maxHp: flyingBomberHp,
      radius: flyConfig.radius,
      color: flyConfig.color,
      contactDamage: flyConfig.contactDamage,
      xp: flyConfig.xp,
      flyDirX: options.dirX || 0,
      flyDirY: options.dirY || 1,
      flyFromX: options.fromX !== undefined ? options.fromX : x,
      flyFromY: options.fromY !== undefined ? options.fromY : y,
      flyExitX: options.exitX !== undefined ? options.exitX : x,
      flyExitY: options.exitY !== undefined ? options.exitY : y,
      flyPhase: "warning",
      warningTimer: flyConfig.warningDuration,
      warningDuration: flyConfig.warningDuration,
      distTraveled: 0,
      bombDistAccum: 0,
      isDone: false,
      skipRecycle: true,
      ...recycleState,
    };
  }

  return {
    type: "chaser",
    x,
    y,
    vx: 0,
    vy: 0,
    hp: chaserHp,
    maxHp: chaserHp,
    speed: enemyConfig.chaser.speedBase + difficulty * enemyConfig.chaser.speedDifficultyScale,
    radius: enemyConfig.chaser.radius,
    color: enemyConfig.chaser.color,
    contactDamage: enemyConfig.chaser.contactDamage,
    xp: enemyConfig.chaser.xp,
    ...recycleState,
  };
}
