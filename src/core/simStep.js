import { updatePlayerMovement } from "../entities/player.js";
import { updateCollisionSystem } from "../systems/collisionSystem.js";
import { updateBossDirector } from "../systems/bosses/bossSystem.js";
import { updateEnemies, updateEnemySpawning } from "../systems/enemySystem.js";
import { updateEffects, updateFloatingTexts, updateSlashEffects } from "../systems/effectSystem.js";
import { updateIndicators } from "../systems/indicatorSystem.js";
import { updatePickups } from "../systems/pickups/index.js";
import { applyPendingLevelUps, updatePlayerRuntime } from "../systems/playerRuntimeSystem.js";
import { updateProjectiles } from "../systems/projectileSystem.js";
import { constrainToBossArenas } from "../systems/bosses/arena.js";
import {
  tryBlink,
  tryFireball,
  tryShout,
  updateBlinkCharges,
  updateBlinkPreview,
  updateFireballs,
  updateLingeringZones,
  updateShoutPreview,
  updateShoutWaves,
} from "../systems/skills/index.js";
import {
  getMovementSlowMultiplier,
  resolvePositionAgainstMountainsShared,
  updateBurningTrees,
} from "../systems/worldSystem.js";

/**
 * Creates the persistent context for stepSim. Holds the hold-cancel flags that
 * must survive between frames.
 */
export function createSimContext({ gameState, services, options = {} }) {
  return {
    gameState,
    services,
    options: {
      directorEnabled: true,
      noCooldowns: false,
      ...options,
    },
    blinkCanceledDuringHold: false,
    shoutCanceledDuringHold: false,
  };
}

/**
 * One gameplay frame (no menu/pause handling). `getActions` is called after
 * movement and player runtime so aim sources (auto-aim) see the updated player.
 *
 * actions: {
 *   movement:{x,y}, worldPointer:{x,y,down}, clicked, releasedClick,
 *   reloadPressed, weaponSlot, blinkHeld, blinkReleased, shoutHeld,
 *   shoutReleased, fireballPressed, cancelPressed
 * }
 */
export function stepSim(ctx, dt, movement, getActions) {
  const { gameState, services, options } = ctx;
  const weaponSystem = services.getWeaponSystem();
  const perkEngine = services.getPerkEngine();
  const player = gameState.player;
  const world = gameState.systems.world;

  const prof = ctx.profiler;
  prof?.begin();
  gameState.time += dt;

  const treeSlow = getMovementSlowMultiplier(world, player.x, player.y, player.radius);
  updatePlayerMovement(player, movement, dt, {
    terrainMultiplier: treeSlow,
    resolveCollision(p) {
      const resolved = resolvePositionAgainstMountainsShared(world, p.x, p.y, p.radius);
      const constrained = constrainToBossArenas(gameState, resolved.x, resolved.y, p.radius);
      p.x = constrained.x;
      p.y = constrained.y;
    },
  });

  updateBlinkCharges(services, dt);
  updatePlayerRuntime(gameState, dt);
  if (options.noCooldowns) {
    player.shoutCooldownRemaining = 0;
    player.fireballCooldownRemaining = 0;
    player.blinkChargeTimer = 0;
    player.blinkCooldownRemaining = 0;
    player.blinkCharges = player.blinkMaxCharges;
  }

  prof?.mark("player");
  const actions = typeof getActions === "function" ? getActions() : getActions;
  const worldPointer = actions.worldPointer;
  player.aim.x = worldPointer.x;
  player.aim.y = worldPointer.y;

  const holdingBlink = !!actions.blinkHeld;
  if (holdingBlink) {
    updateBlinkPreview(services, worldPointer, ctx.blinkCanceledDuringHold);
  } else {
    player.blinkPreview.active = false;
  }

  const holdingShout = !!actions.shoutHeld;
  if (holdingShout) {
    updateShoutPreview(services, ctx.shoutCanceledDuringHold);
  } else {
    player.shoutPreview.active = false;
  }

  const { clicked, reloadPressed, cancelPressed, weaponSlot } = actions;

  if (weaponSlot === 1 || weaponSlot === 2 || weaponSlot === 3 || weaponSlot === 4) {
    weaponSystem.switchWeapon(weaponSlot);
  }

  if (holdingBlink && (reloadPressed || clicked || cancelPressed)) {
    ctx.blinkCanceledDuringHold = true;
    player.blinkPreview.active = false;
  }

  if (holdingShout && (clicked || cancelPressed)) {
    ctx.shoutCanceledDuringHold = true;
    player.shoutPreview.active = false;
  }

  if (actions.blinkReleased) {
    if (!ctx.blinkCanceledDuringHold) {
      tryBlink(services, worldPointer);
    }
    ctx.blinkCanceledDuringHold = false;
    player.blinkPreview.active = false;
  }

  if (actions.shoutReleased) {
    if (!ctx.shoutCanceledDuringHold) {
      tryShout(services);
    }
    ctx.shoutCanceledDuringHold = false;
    player.shoutPreview.active = false;
  }

  if (actions.fireballPressed) {
    tryFireball(services, worldPointer);
  }

  if (reloadPressed && weaponSystem.isGunSelected()) {
    if (weaponSystem.isReloading) {
      weaponSystem.onReloadClick(player, perkEngine);
    } else {
      weaponSystem.startReload(player);
    }
  }

  if (clicked && weaponSystem.isGunSelected() && weaponSystem.isReloading) {
    weaponSystem.onReloadClick(player, perkEngine);
  } else if (weaponSystem.isMeleeSelected() && (worldPointer.down || clicked)) {
    weaponSystem.tryMeleeAttack(player, worldPointer, gameState.slashEffects);
  } else if (weaponSystem.isBowSelected()) {
    if (worldPointer.down) {
      weaponSystem.startBowCharge();
    }
    if (actions.releasedClick) {
      weaponSystem.releaseBowShot(player, worldPointer, gameState.projectiles, perkEngine);
    }
  } else if (weaponSystem.isGunSelected() && (worldPointer.down || clicked)) {
    weaponSystem.tryFire(player, worldPointer, gameState.projectiles, perkEngine);
  }

  weaponSystem.update(dt, player, worldPointer);
  prof?.mark("input+weapons");

  updateProjectiles(services, dt);
  updateFireballs(services, dt);
  updateShoutWaves(services, dt);
  updateLingeringZones(services, dt);
  updateBurningTrees(world, dt);
  prof?.mark("projectiles+skills");
  updateBossDirector(gameState, dt, { enabled: options.directorEnabled });
  updateEnemySpawning(gameState, dt, { enableSpawns: options.directorEnabled });
  prof?.mark("director+spawn");
  updateEnemies(gameState, dt);
  prof?.mark("enemies");

  const triggeredIndicators = updateIndicators(gameState.indicators, dt);
  triggeredIndicators.forEach((indicator) => {
    if (typeof indicator.onTrigger === "function") {
      indicator.onTrigger();
    }
  });

  prof?.mark("indicators");
  updateCollisionSystem(gameState, dt);
  prof?.mark("collision");
  updatePickups(services, dt);
  prof?.mark("pickups");

  updateFloatingTexts(gameState, dt);
  updateSlashEffects(gameState, dt);
  updateEffects(gameState, dt);
  applyPendingLevelUps(gameState, services.events);
  prof?.mark("effects+levelups");
}
