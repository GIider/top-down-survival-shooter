import { BALANCE, GAME_CONFIG } from "../core/constants.js";
import { getPlayerDamageMultiplier, scaleDamageAgainstEnemy } from "../entities/player.js";
import { createEnemy } from "../entities/enemy.js";
import { maybeSpawnPickupOnEnemyDeath } from "./pickups/index.js";
import { getTreeEffectsAt, igniteTreesAt, resolvePositionAgainstMountains } from "./worldSystem.js";
import { createDamageContext, PERK_HOOKS } from "./perks/contracts.js";

const FIREBALL_CONFIG = GAME_CONFIG.skills.fireball;
const BOMBER_CONFIG = GAME_CONFIG.enemies.archetypes.bomber;

function spawnFloatingText(gameState, text, x, y, color, size = 24, kind = "damage") {
  gameState.floatingTexts.push({
    text,
    x,
    y,
    vx: (Math.random() * 2 - 1) * 26,
    vy: -82 - Math.random() * 26,
    gravity: 42,
    elapsed: 0,
    duration: 0.65,
    color,
    size,
    kind,
  });
}

function spawnSlimeChildren(gameState, slime, protection = {}) {
  if (slime.type !== "slime") {
    return;
  }

  const nextTier = (slime.slimeTier || 0) + 1;
  if (nextTier > (slime.maxSlimeTier || 0)) {
    return;
  }

  const difficulty = gameState.time * BALANCE.spawnScaling;
  const count = slime.splitCount || 2;
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.4;
    const offset = 8 + Math.random() * 6;
    const child = createEnemy(
      "slime",
      slime.x + Math.cos(angle) * offset,
      slime.y + Math.sin(angle) * offset,
      difficulty,
      { tier: nextTier }
    );
    if (protection.meleeAttackId !== undefined && protection.meleeAttackId !== null) {
      child.meleeSpawnProtectedUntilAttack = protection.meleeAttackId;
    }
    if (protection.arrowShotId !== undefined && protection.arrowShotId !== null) {
      child.arrowSpawnProtectedShotId = protection.arrowShotId;
    }
    gameState.enemies.push(child);
  }
}

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) {
    a -= Math.PI * 2;
  }
  while (a < -Math.PI) {
    a += Math.PI * 2;
  }
  return a;
}

function isEnemyInsideSwing(enemy, swing) {
  const dx = enemy.x - swing.x;
  const dy = enemy.y - swing.y;
  const distance = Math.hypot(dx, dy);
  if (distance > swing.range + enemy.radius) {
    return false;
  }
  if (distance < Math.max(0, swing.innerRange - enemy.radius)) {
    return false;
  }

  const angleToEnemy = Math.atan2(dy, dx);
  const delta = Math.abs(normalizeAngle(angleToEnemy - swing.angle));
  return delta <= swing.arc * 0.5;
}

function isCircleInsideSwing(x, y, radius, swing) {
  const dx = x - swing.x;
  const dy = y - swing.y;
  const distance = Math.hypot(dx, dy);
  if (distance > swing.range + radius) {
    return false;
  }
  if (distance < Math.max(0, swing.innerRange - radius)) {
    return false;
  }

  const angle = Math.atan2(dy, dx);
  const delta = Math.abs(normalizeAngle(angle - swing.angle));
  return delta <= swing.arc * 0.5;
}

function reflectProjectile(projectile, nx, ny, speedMultiplier = 1) {
  const velocityDot = projectile.velocity.x * nx + projectile.velocity.y * ny;
  projectile.velocity.x -= 2 * velocityDot * nx;
  projectile.velocity.y -= 2 * velocityDot * ny;
  projectile.velocity.x *= speedMultiplier;
  projectile.velocity.y *= speedMultiplier;
}

function getClosestPointOnSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.000001) {
    return { x: ax, y: ay, t: 0 };
  }
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  return {
    x: ax + abx * t,
    y: ay + aby * t,
    t,
  };
}

function applyEnemyKnockback(enemy, nx, ny, knockbackPerSecond, dt, world) {
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    return;
  }
  const pushDistance = Math.max(0, knockbackPerSecond) * dt;
  if (pushDistance <= 0) {
    return;
  }

  enemy.x += nx * pushDistance;
  enemy.y += ny * pushDistance;
  const resolved = resolvePositionAgainstMountains(world, enemy.x, enemy.y, enemy.radius);
  enemy.x = resolved.x;
  enemy.y = resolved.y;
}

function normalizeDamageSource(damageSource = {}) {
  const sourceProjectile = damageSource?.projectile;
  if (sourceProjectile?.isArrow) {
    return {
      sourceType: "arrowProjectile",
      projectile: sourceProjectile,
      tags: ["projectile", "arrow", "bow"],
      arrowShotId: damageSource?.arrowShotId ?? null,
      meleeAttackId: null,
    };
  }
  if (sourceProjectile?.isGunBullet) {
    return {
      sourceType: "gunProjectile",
      projectile: sourceProjectile,
      tags: ["projectile", "gun"],
      arrowShotId: null,
      meleeAttackId: null,
    };
  }
  if (damageSource?.meleeAttackId !== undefined && damageSource?.meleeAttackId !== null) {
    return {
      sourceType: "meleeSwing",
      projectile: null,
      tags: ["melee"],
      arrowShotId: null,
      meleeAttackId: damageSource.meleeAttackId,
    };
  }
  if (damageSource?.sourceType) {
    return {
      ...damageSource,
      tags: Array.isArray(damageSource.tags) ? damageSource.tags : [],
    };
  }
  return {
    sourceType: "generic",
    projectile: null,
    tags: [],
    arrowShotId: null,
    meleeAttackId: null,
  };
}

function computeDamageWithPerks(gameState, player, enemy, baseDamage, damageSource) {
  const perkEngine = gameState.systems.perkEngine;
  if (!perkEngine) {
    return scaleDamageAgainstEnemy(player, enemy, baseDamage);
  }

  const context = createDamageContext({
    player,
    target: enemy,
    baseDamage,
    damageSource,
    gameState,
  });
  const finalized = perkEngine.runTransformHook(PERK_HOOKS.onDamageCompute, context, player);
  return Math.max(0, finalized.damage);
}

function emitEnemyHitWithPerks(gameState, player, enemy, damage, damageSource) {
  const perkEngine = gameState.systems.perkEngine;
  if (!perkEngine) {
    return;
  }
  perkEngine.emitSideEffectHook(
    PERK_HOOKS.onEnemyHit,
    {
      gameState,
      player,
      enemy,
      damage,
      damageSource: normalizeDamageSource(damageSource),
    },
    player
  );
}

function killEnemy(gameState, enemy, enemyIndex, damageSource, player) {
  const weaponSystem = gameState.systems.weaponSystem;
  const normalizedDamageSource = normalizeDamageSource(damageSource);

  const perkEngine = gameState.systems.perkEngine;
  if (perkEngine) {
    perkEngine.emitSideEffectHook(
      PERK_HOOKS.onEnemyKilled,
      {
        gameState,
        player,
        enemy,
        enemyIndex,
        weaponSystem,
        damageSource: normalizedDamageSource,
      },
      player
    );
  }

  if (enemy.type === "slime") {
    const protection = {};
    if (normalizedDamageSource?.meleeAttackId !== undefined && normalizedDamageSource?.meleeAttackId !== null) {
      protection.meleeAttackId = normalizedDamageSource.meleeAttackId;
    }
    if (normalizedDamageSource?.arrowShotId !== undefined && normalizedDamageSource?.arrowShotId !== null) {
      protection.arrowShotId = normalizedDamageSource.arrowShotId;
    }
    spawnSlimeChildren(gameState, enemy, protection);
  }

  if (enemy.type === "bomber") {
    const explosionRadius = enemy.explosionRadius || BOMBER_CONFIG.explosionRadius;
    const explosionDamage = enemy.explosionDamage || BOMBER_CONFIG.explosionDamage;
    const deathEffects = BOMBER_CONFIG.deathEffects;
    const playerDistance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (playerDistance <= explosionRadius) {
      player.hp -= explosionDamage;
      spawnFloatingText(
        gameState,
        `-${explosionDamage}`,
        player.x,
        player.y - player.radius - 8,
        "255,142,150",
        22,
        "damage"
      );
      gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + deathEffects.screenShake);
      gameState.screenFx.damageFlash = Math.min(1, gameState.screenFx.damageFlash + deathEffects.screenFlash);
    }

    gameState.effects.push(
      ...deathEffects.effects.map((effect) => ({
        x: enemy.x,
        y: enemy.y,
        radius: effect.radius ?? explosionRadius * effect.radiusFactor,
        elapsed: 0,
        duration: effect.duration,
        growth: effect.growth,
        color: effect.color,
      }))
    );
  }

  gameState.effects.push({ x: enemy.x, y: enemy.y, radius: enemy.radius, elapsed: 0, duration: 0.35 });
  spawnFloatingText(gameState, `XP +${enemy.xp}`, enemy.x, enemy.y - enemy.radius - 16, "149,255,206", 20, "xp");
  gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 2.1);
  gameState.screenFx.actionFlash = Math.min(1, gameState.screenFx.actionFlash + 0.08);
  gameState.enemies.splice(enemyIndex, 1);
  gameState.runStats.kills += 1;
  maybeSpawnPickupOnEnemyDeath(gameState, enemy, gameState.time * BALANCE.spawnScaling, weaponSystem, normalizedDamageSource);
  player.xp += enemy.xp;
}

function detonateFireball(gameState, fireball, playerProjectileIndex = null) {
  const player = gameState.player;
  const detonationConfig = FIREBALL_CONFIG.detonation;
  const world = gameState.systems.world;
  gameState.effects.push(
    ...detonationConfig.effects.map((effect) => ({
      x: fireball.x,
      y: fireball.y,
      radius: effect.radius ?? fireball.splashRadius * effect.radiusFactor,
      elapsed: 0,
      duration: effect.duration,
      growth: effect.growth,
      color: effect.color,
    }))
  );
  gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + detonationConfig.screenShake);
  gameState.screenFx.actionFlash = Math.min(1, gameState.screenFx.actionFlash + detonationConfig.screenFlash);
  gameState.screenFx.hitStop = Math.max(gameState.screenFx.hitStop || 0, detonationConfig.hitStop);
  igniteTreesAt(world, fireball.x, fireball.y, fireball.splashRadius);

  if (fireball.spawnFireField) {
    const ringCount = 6;
    const ringRadius = fireball.splashRadius * 0.38;
    for (let i = 0; i < ringCount; i += 1) {
      const angle = (Math.PI * 2 * i) / ringCount;
      gameState.lingeringZones.push({
        type: "fire",
        x: fireball.x + Math.cos(angle) * ringRadius,
        y: fireball.y + Math.sin(angle) * ringRadius,
        radius: 28,
        lifetime: 2.8,
        maxLifetime: 2.8,
        damagePerSecond: 22,
        slowMultiplier: 1,
      });
    }
  }

  for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
    const enemy = gameState.enemies[e];
    if (enemy.isRespawning) {
      continue;
    }

    const distance = Math.hypot(enemy.x - fireball.x, enemy.y - fireball.y);
    if (distance > fireball.splashRadius + enemy.radius) {
      continue;
    }

    const splashDamage = computeDamageWithPerks(gameState, player, enemy, fireball.splashDamage, {
      sourceType: "fireballSplash",
      tags: ["skill", "fireball", "aoe", "fire"],
    });
    enemy.hp -= splashDamage;
    spawnFloatingText(
      gameState,
      `-${Math.max(1, Math.round(splashDamage))}`,
      enemy.x,
      enemy.y - enemy.radius - 4,
      "255,196,120",
      23,
      "damage"
    );
    gameState.effects.push({
      x: enemy.x,
      y: enemy.y,
      radius: Math.max(10, enemy.radius * 0.55),
      elapsed: 0,
      duration: 0.2,
      growth: 20,
      color: "255, 180, 112",
    });

    if (enemy.hp <= 0) {
      killEnemy(gameState, enemy, e, {}, player);
    }
  }

  if (playerProjectileIndex !== null) {
    gameState.projectiles.splice(playerProjectileIndex, 1);
  }

  fireball.alive = false;
}

export function updateCollisionSystem(gameState, dt = 0.016) {
  const player = gameState.player;
  let accumulatedContactDamage = 0;
  let accumulatedTreeFireDamage = 0;
  const weapon = gameState.systems.weaponSystem;
  const world = gameState.systems.world;

  if (weapon && typeof weapon.getActiveMeleeSwings === "function") {
    const swings = weapon.getActiveMeleeSwings();
    for (let s = 0; s < swings.length; s += 1) {
      const swing = swings[s];
      if (swing.elapsed < (swing.startup || 0)) {
        continue;
      }

      const perkEngine = gameState.systems.perkEngine;
      const reflectContext = {
        enabled: false,
        gameState,
        player,
        swing,
      };
      const finalizedReflectContext = perkEngine
        ? perkEngine.runTransformHook(PERK_HOOKS.onMeleeReflectQuery, reflectContext, player)
        : reflectContext;
      if (finalizedReflectContext.enabled) {
        if (!swing.reflectedProjectiles) {
          swing.reflectedProjectiles = new Set();
        }
        for (let p = gameState.projectiles.length - 1; p >= 0; p -= 1) {
          const projectile = gameState.projectiles[p];
          if (projectile.owner !== "enemy" || swing.reflectedProjectiles.has(projectile)) {
            continue;
          }
          if (!isCircleInsideSwing(projectile.position.x, projectile.position.y, projectile.radius, swing)) {
            continue;
          }

          const dx = projectile.position.x - player.x;
          const dy = projectile.position.y - player.y;
          const distance = Math.hypot(dx, dy) || 1;
          const nx = dx / distance;
          const ny = dy / distance;
          reflectProjectile(projectile, nx, ny, 1.05);
          projectile.owner = "player";
          projectile.color = "#98ffe0";
          projectile.damage *= Math.max(1, getPlayerDamageMultiplier(player));
          projectile.hitEnemies = new Set();
          projectile.modifiers = [];
          swing.reflectedProjectiles.add(projectile);
        }
      }

      for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = gameState.enemies[e];
        if (enemy.isRespawning || swing.hitEnemies.has(enemy)) {
          continue;
        }
        if (
          typeof enemy.meleeSpawnProtectedUntilAttack === "number" &&
          swing.attackId <= enemy.meleeSpawnProtectedUntilAttack
        ) {
          continue;
        }
        if (!isEnemyInsideSwing(enemy, swing)) {
          continue;
        }

        swing.hitEnemies.add(enemy);
        if (weapon && typeof weapon.notifyMeleeSwingHit === "function") {
          weapon.notifyMeleeSwingHit(swing.attackId, swing.comboStep);
        }
        const swingDamage = computeDamageWithPerks(gameState, player, enemy, swing.damage, {
          sourceType: "meleeSwing",
          tags: ["melee"],
          meleeAttackId: swing.attackId,
        });
        enemy.hp -= swingDamage;
        emitEnemyHitWithPerks(gameState, player, enemy, swingDamage, {
          sourceType: "meleeSwing",
          tags: ["melee"],
          meleeAttackId: swing.attackId,
        });
        gameState.effects.push({
          x: enemy.x,
          y: enemy.y,
          radius: Math.max(10, enemy.radius * 0.55),
          elapsed: 0,
          duration: 0.2,
          growth: 24,
          color: "152, 255, 214",
        });
        spawnFloatingText(
          gameState,
          `-${Math.max(1, Math.round(swingDamage))}`,
          enemy.x,
          enemy.y - enemy.radius - 4,
          "255,214,168",
          21,
          "damage"
        );
        gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 1.2);
        gameState.screenFx.actionFlash = Math.min(1, gameState.screenFx.actionFlash + 0.07);
        gameState.screenFx.hitStop = Math.max(gameState.screenFx.hitStop || 0, 0.028);

        if (enemy.hp <= 0) {
          killEnemy(gameState, enemy, e, { meleeAttackId: swing.attackId }, player);
          if (player.lifeSteal > 0) {
            const maxHp = player.maxHp + player.maxHpBonus;
            player.hp = Math.min(maxHp, player.hp + swingDamage * player.lifeSteal * 0.08);
          }
        }
      }
    }
  }

  if (weapon && weapon.isFlailSelected && weapon.isFlailSelected() && typeof weapon.getFlailSnapshot === "function") {
    const flail = weapon.getFlailSnapshot(player);
    if (flail) {
      for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = gameState.enemies[e];
        if (enemy.isRespawning) {
          continue;
        }

        let registeredHit = false;
        const headDx = enemy.x - flail.x;
        const headDy = enemy.y - flail.y;
        const headDistance = Math.hypot(headDx, headDy) || 0.0001;
        const headOverlap = headDistance <= enemy.radius + flail.radius;

        if (headOverlap && weapon.canFlailHitEnemy(enemy, "head")) {
          const impactSpeed = flail.speed;
          const impactRatio = weapon.getFlailImpactRatio(impactSpeed);
          const baseDamage = weapon.getFlailHeadDamage(player, impactSpeed);
          const hitDamage = computeDamageWithPerks(gameState, player, enemy, baseDamage, {
            sourceType: "flailHead",
            tags: ["melee", "flail", "impact"],
          });

          enemy.hp -= hitDamage;
          emitEnemyHitWithPerks(gameState, player, enemy, hitDamage, {
            sourceType: "flailHead",
            tags: ["melee", "flail", "impact"],
          });

          const knockback = weapon.getFlailKnockback(impactSpeed, 1);
          const velLen = Math.hypot(flail.velocity.x, flail.velocity.y);
          const nx = velLen > 0.001 ? flail.velocity.x / velLen : headDx / headDistance;
          const ny = velLen > 0.001 ? flail.velocity.y / velLen : headDy / headDistance;
          applyEnemyKnockback(enemy, nx, ny, knockback, dt, world);

          weapon.markFlailEnemyHit(enemy, "head");
          weapon.applyFlailImpactResponse(impactRatio);

          gameState.effects.push({
            x: enemy.x,
            y: enemy.y,
            radius: Math.max(10, enemy.radius * 0.65),
            elapsed: 0,
            duration: 0.2,
            growth: 26,
            color: "255, 209, 132",
          });
          for (let spark = 0; spark < 5; spark += 1) {
            const angle = Math.atan2(ny, nx) + (Math.random() * 2 - 1) * 0.8;
            const speed = 120 + Math.random() * 120;
            gameState.effects.push({
              kind: "particle",
              x: enemy.x,
              y: enemy.y,
              radius: 2 + Math.random() * 2,
              elapsed: 0,
              duration: 0.15,
              growth: -6,
              color: "255, 232, 166",
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              damping: 0.9,
            });
          }

          spawnFloatingText(
            gameState,
            `-${Math.max(1, Math.round(hitDamage))}`,
            enemy.x,
            enemy.y - enemy.radius - 4,
            "255,214,168",
            22,
            "damage"
          );
          gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 1.3 + impactRatio * 0.9);
          gameState.screenFx.actionFlash = Math.min(1, gameState.screenFx.actionFlash + 0.07 + impactRatio * 0.05);
          gameState.screenFx.hitStop = Math.max(gameState.screenFx.hitStop || 0, 0.02 + impactRatio * 0.015);
          registeredHit = true;

          if (enemy.hp <= 0) {
            killEnemy(gameState, enemy, e, { sourceType: "flailHead", tags: ["melee", "flail", "impact"] }, player);
            if (player.lifeSteal > 0) {
              const maxHp = player.maxHp + player.maxHpBonus;
              player.hp = Math.min(maxHp, player.hp + hitDamage * player.lifeSteal * 0.08);
            }
            continue;
          }
        }

        if (registeredHit || !weapon.canFlailHitEnemy(enemy, "chain")) {
          continue;
        }

        let bestContact = null;
        const chainRadius = enemy.radius + (flail.chainHitRadius || 0);
        const chainRadiusSq = chainRadius * chainRadius;

        for (let i = 0; i < flail.chainPoints.length - 1; i += 1) {
          const from = flail.chainPoints[i];
          const to = flail.chainPoints[i + 1];
          const closest = getClosestPointOnSegment(enemy.x, enemy.y, from.x, from.y, to.x, to.y);
          const dx = enemy.x - closest.x;
          const dy = enemy.y - closest.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > chainRadiusSq) {
            continue;
          }

          if (!bestContact || distSq < bestContact.distSq) {
            bestContact = { dx, dy, distSq, x: closest.x, y: closest.y };
          }
        }

        if (!bestContact) {
          continue;
        }

        const chainImpactSpeed = flail.speed * 0.62;
        const impactRatio = weapon.getFlailImpactRatio(chainImpactSpeed);
        const baseChainDamage = weapon.getFlailChainDamage(player, flail.speed);
        const chainDamage = computeDamageWithPerks(gameState, player, enemy, baseChainDamage, {
          sourceType: "flailChain",
          tags: ["melee", "flail", "chain"],
        });

        enemy.hp -= chainDamage;
        emitEnemyHitWithPerks(gameState, player, enemy, chainDamage, {
          sourceType: "flailChain",
          tags: ["melee", "flail", "chain"],
        });

        const dist = Math.sqrt(bestContact.distSq) || 0.0001;
        const nx = bestContact.dx / dist;
        const ny = bestContact.dy / dist;
        const chainKnockback = weapon.getFlailKnockback(chainImpactSpeed, 0.58);
        applyEnemyKnockback(enemy, nx, ny, chainKnockback, dt, world);

        weapon.markFlailEnemyHit(enemy, "chain");
        weapon.applyFlailImpactResponse(impactRatio * 0.45);

        gameState.effects.push({
          kind: "particle",
          x: bestContact.x,
          y: bestContact.y,
          radius: 2,
          elapsed: 0,
          duration: 0.14,
          growth: 8,
          color: "192, 247, 255",
          vx: nx * 90,
          vy: ny * 90,
          damping: 0.86,
        });
        spawnFloatingText(
          gameState,
          `-${Math.max(1, Math.round(chainDamage))}`,
          enemy.x,
          enemy.y - enemy.radius - 4,
          "206,239,255",
          17,
          "damage"
        );

        if (enemy.hp <= 0) {
          killEnemy(gameState, enemy, e, { sourceType: "flailChain", tags: ["melee", "flail", "chain"] }, player);
          continue;
        }
      }
    }
  }

  for (let p = gameState.projectiles.length - 1; p >= 0; p -= 1) {
    const projectile = gameState.projectiles[p];

    if (projectile.owner === "player") {
      for (let f = gameState.fireballs.length - 1; f >= 0; f -= 1) {
        const fireball = gameState.fireballs[f];
        const dxFireball = fireball.x - projectile.position.x;
        const dyFireball = fireball.y - projectile.position.y;
        if (Math.hypot(dxFireball, dyFireball) <= fireball.radius + projectile.radius) {
          detonateFireball(gameState, fireball, p);
          gameState.fireballs.splice(f, 1);
          break;
        }
      }
      if (!gameState.projectiles[p]) {
        continue;
      }
    }

    if (projectile.owner === "player") {
      let didHit = false;

      for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = gameState.enemies[e];
        if (enemy.isRespawning) {
          continue;
        }

        if (projectile.hitEnemies && projectile.hitEnemies.has(enemy)) {
          continue;
        }

        if (projectile.isArrow && enemy.arrowSpawnProtectedShotId === projectile.arrowShotId) {
          continue;
        }

        const dx = enemy.x - projectile.position.x;
        const dy = enemy.y - projectile.position.y;
        const overlap = Math.hypot(dx, dy) <= enemy.radius + projectile.radius;

        if (!overlap) {
          continue;
        }

        const projectileDamage = computeDamageWithPerks(gameState, player, enemy, projectile.damage, {
          sourceType: projectile.isArrow ? "arrowProjectile" : projectile.isGunBullet ? "gunProjectile" : "playerProjectile",
          tags: projectile.isArrow ? ["projectile", "arrow", "bow"] : projectile.isGunBullet ? ["projectile", "gun"] : ["projectile"],
          projectile,
          arrowShotId: projectile.isArrow ? projectile.arrowShotId : null,
        });
        enemy.hp -= projectileDamage;
        emitEnemyHitWithPerks(gameState, player, enemy, projectileDamage, {
          sourceType: projectile.isArrow ? "arrowProjectile" : projectile.isGunBullet ? "gunProjectile" : "playerProjectile",
          tags: projectile.isArrow ? ["projectile", "arrow", "bow"] : projectile.isGunBullet ? ["projectile", "gun"] : ["projectile"],
          projectile,
          arrowShotId: projectile.isArrow ? projectile.arrowShotId : null,
        });
        gameState.effects.push({
          x: enemy.x,
          y: enemy.y,
          radius: Math.max(8, enemy.radius * 0.4),
          elapsed: 0,
          duration: 0.16,
          growth: 18,
          color: "255, 224, 170",
        });
        if (projectile.hitEnemies) {
          projectile.hitEnemies.add(enemy);
        }
        spawnFloatingText(
          gameState,
          `-${Math.max(1, Math.round(projectileDamage))}`,
          enemy.x,
          enemy.y - enemy.radius - 4,
          "255,214,168",
          21,
          "damage"
        );
        gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 0.7);
        didHit = true;

        projectile.modifiers.forEach((modifier) => {
          if (typeof modifier.onHit === "function") {
            modifier.onHit(enemy, projectile, gameState);
          }
        });

        if (enemy.hp <= 0) {
          killEnemy(
            gameState,
            enemy,
            e,
            { arrowShotId: projectile.isArrow ? projectile.arrowShotId : null, projectile },
            player
          );
          if (player.lifeSteal > 0) {
            const maxHp = player.maxHp + player.maxHpBonus;
            player.hp = Math.min(maxHp, player.hp + projectileDamage * player.lifeSteal * 0.08);
          }
        }

        if (player.aoeRadius > 0) {
          for (let ae = gameState.enemies.length - 1; ae >= 0; ae -= 1) {
            const aoeEnemy = gameState.enemies[ae];
            const adx = aoeEnemy.x - enemy.x;
            const ady = aoeEnemy.y - enemy.y;
            if (Math.hypot(adx, ady) <= player.aoeRadius) {
              aoeEnemy.hp -= computeDamageWithPerks(gameState, player, aoeEnemy, projectileDamage * 0.25, {
                sourceType: "aoeSplash",
                tags: ["aoe", "projectile"],
              });
            }
          }
        }

        if (player.chainChance > 0 && Math.random() < player.chainChance) {
          for (let ce = gameState.enemies.length - 1; ce >= 0; ce -= 1) {
            const chainEnemy = gameState.enemies[ce];
            if (chainEnemy === enemy) {
              continue;
            }
            const cdx = chainEnemy.x - enemy.x;
            const cdy = chainEnemy.y - enemy.y;
            if (Math.hypot(cdx, cdy) <= 120) {
              chainEnemy.hp -= computeDamageWithPerks(gameState, player, chainEnemy, projectileDamage * 0.45, {
                sourceType: "chainArc",
                tags: ["chain", "projectile"],
              });
              break;
            }
          }
        }

        if (projectile.ricochetRemaining > 0 && projectile.isArrow) {
          let closest = null;
          let closestDistance = Infinity;
          for (let search = 0; search < gameState.enemies.length; search += 1) {
            const candidate = gameState.enemies[search];
            if (candidate === enemy || candidate.isRespawning) {
              continue;
            }
            if (projectile.hitEnemies && projectile.hitEnemies.has(candidate)) {
              continue;
            }
            if (projectile.isArrow && candidate.arrowSpawnProtectedShotId === projectile.arrowShotId) {
              continue;
            }
            if (candidate.hp <= 0) {
              continue;
            }
            const distance = Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y);
            if (distance < closestDistance) {
              closestDistance = distance;
              closest = candidate;
            }
          }

          if (closest) {
            const dxRicochet = closest.x - enemy.x;
            const dyRicochet = closest.y - enemy.y;
            const len = Math.hypot(dxRicochet, dyRicochet) || 1;
            const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1;
            projectile.velocity.x = (dxRicochet / len) * speed;
            projectile.velocity.y = (dyRicochet / len) * speed;
            projectile.position.x = enemy.x + (dxRicochet / len) * (enemy.radius + projectile.radius + 2);
            projectile.position.y = enemy.y + (dyRicochet / len) * (enemy.radius + projectile.radius + 2);
            projectile.ricochetRemaining -= 1;
            didHit = false;
            break;
          }
        }

        if (projectile.bounceRemaining > 0) {
          const dxBounce = projectile.position.x - enemy.x;
          const dyBounce = projectile.position.y - enemy.y;
          const bounceDistance = Math.hypot(dxBounce, dyBounce) || 1;
          const nxBounce = dxBounce / bounceDistance;
          const nyBounce = dyBounce / bounceDistance;
          reflectProjectile(projectile, nxBounce, nyBounce, 1.03);
          projectile.position.x = enemy.x + nxBounce * (enemy.radius + projectile.radius + 2);
          projectile.position.y = enemy.y + nyBounce * (enemy.radius + projectile.radius + 2);
          projectile.bounceRemaining -= 1;
          didHit = false;
          break;
        }

        if (projectile.pierceRemaining > 0) {
          projectile.pierceRemaining -= 1;
          didHit = false;
          continue;
        }

        break;
      }

      if (didHit) {
        gameState.projectiles.splice(p, 1);
        continue;
      }
    }

    if (projectile.owner === "enemy") {
      const dx = player.x - projectile.position.x;
      const dy = player.y - projectile.position.y;
      if (Math.hypot(dx, dy) <= player.radius + projectile.radius) {
        player.hp -= projectile.damage;
        spawnFloatingText(
          gameState,
          `-${Math.max(1, Math.round(projectile.damage))}`,
          player.x,
          player.y - player.radius - 8,
          "255,142,150",
          22,
          "damage"
        );
        gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 1.8);
        gameState.screenFx.damageFlash = Math.min(1, gameState.screenFx.damageFlash + 0.16);
        gameState.projectiles.splice(p, 1);
      }
    }
  }

  for (let f = gameState.fireballs.length - 1; f >= 0; f -= 1) {
    const fireball = gameState.fireballs[f];
    let directHit = false;

    for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
      const enemy = gameState.enemies[e];
      if (enemy.isRespawning) {
        continue;
      }

      const dx = enemy.x - fireball.x;
      const dy = enemy.y - fireball.y;
      if (Math.hypot(dx, dy) > enemy.radius + fireball.radius) {
        continue;
      }

      const fireballDamage = computeDamageWithPerks(gameState, player, enemy, fireball.damage, {
        sourceType: "fireballDirect",
        tags: ["skill", "fireball", "fire"],
      });
      enemy.hp -= fireballDamage;
      emitEnemyHitWithPerks(gameState, player, enemy, fireballDamage, {
        sourceType: "fireballDirect",
        tags: ["skill", "fireball", "fire"],
      });
      spawnFloatingText(
        gameState,
        `-${Math.max(1, Math.round(fireballDamage))}`,
        enemy.x,
        enemy.y - enemy.radius - 4,
        "255,214,168",
        21,
        "damage"
      );
      gameState.effects.push({
        x: fireball.x,
        y: fireball.y,
        radius: fireball.radius,
        elapsed: 0,
        duration: 0.2,
        growth: 18,
        color: "255, 134, 84",
      });
      directHit = true;

      if (fireball.detonateOnImpact) {
        detonateFireball(gameState, fireball);
      }

      if (enemy.hp <= 0) {
        killEnemy(gameState, enemy, e, {}, player);
      }

      break;
    }

    if (directHit) {
      gameState.fireballs.splice(f, 1);
    }
  }

  gameState.enemies.forEach((enemy) => {
    if (enemy.isRespawning) {
      return;
    }
    if ((enemy.stunnedTimer || 0) > 0) {
      return;
    }
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    if (Math.hypot(dx, dy) <= enemy.radius + player.radius) {
      accumulatedContactDamage += enemy.contactDamage * dt;
    }
  });

  for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
    const enemy = gameState.enemies[e];
    if (enemy.isRespawning) {
      continue;
    }

    const treeEffects = getTreeEffectsAt(world, enemy.x, enemy.y, enemy.radius);
    if (treeEffects.fireDamagePerSecond <= 0) {
      continue;
    }

    enemy.hp -= treeEffects.fireDamagePerSecond * dt;
    if (enemy.hp <= 0) {
      killEnemy(gameState, enemy, e, {}, player);
    }
  }

  for (let e = gameState.enemies.length - 1; e >= 0; e -= 1) {
    const enemy = gameState.enemies[e];
    if (enemy.isRespawning || enemy.hp > 0) {
      continue;
    }
    killEnemy(gameState, enemy, e, {}, player);
  }

  const playerTreeEffects = getTreeEffectsAt(world, player.x, player.y, player.radius);
  if (playerTreeEffects.fireDamagePerSecond > 0) {
    accumulatedTreeFireDamage += playerTreeEffects.fireDamagePerSecond * dt;
  }

  if (accumulatedContactDamage > 0) {
    player.hp -= accumulatedContactDamage;
    spawnFloatingText(
      gameState,
      `-${Math.max(1, Math.round(accumulatedContactDamage))}`,
      player.x,
      player.y - player.radius - 8,
      "255,142,150",
      20,
      "damage"
    );
    gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 0.9);
    gameState.screenFx.damageFlash = Math.min(1, gameState.screenFx.damageFlash + 0.06);
  }

  if (accumulatedTreeFireDamage > 0) {
    player.hp -= accumulatedTreeFireDamage;
    spawnFloatingText(
      gameState,
      `-${Math.max(1, Math.round(accumulatedTreeFireDamage))}`,
      player.x,
      player.y - player.radius - 24,
      "255,176,118",
      19,
      "damage"
    );
    gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 0.6);
    gameState.screenFx.damageFlash = Math.min(1, gameState.screenFx.damageFlash + 0.05);
  }
}
