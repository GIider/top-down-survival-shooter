import { CANVAS, GAME_CONFIG } from "./core/constants.js";
import { createFpsTracker } from "./core/fpsTracker.js";
import { createGameServices } from "./core/gameServices.js";
import { createHud } from "./core/hud.js";
import { createInput } from "./core/input.js";
import { createLoop } from "./core/loop.js";
import { loadPerkProgress, savePerkProgress } from "./core/perkProgress.js";
import { createRenderer } from "./core/renderer.js";
import { loadRunHistory, saveRunHistory } from "./core/runHistory.js";
import { createInitialState } from "./core/state.js";
import { updatePlayerMovement } from "./entities/player.js";
import { updateCollisionSystem } from "./systems/collisionSystem.js";
import { createDebugSystem } from "./systems/debugSystem.js";
import { updateEnemies, updateEnemySpawning } from "./systems/enemySystem.js";
import { updateEffects, updateFloatingTexts, updateSlashEffects } from "./systems/effectSystem.js";
import { updateIndicators } from "./systems/indicatorSystem.js";
import { applyPerk, getPerkChoices } from "./systems/perkSystem.js";
import { updatePickups } from "./systems/pickups/index.js";
import { applyPendingLevelUps, updatePlayerRuntime } from "./systems/playerRuntimeSystem.js";
import { updateProjectiles } from "./systems/projectileSystem.js";
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
} from "./systems/skills/index.js";
import {
  createWorldSystem,
  getMovementSlowMultiplier,
  resolvePositionAgainstMountains,
  updateBurningTrees,
} from "./systems/worldSystem.js";
import { createWeaponSystem } from "./systems/weaponSystem.js";

const canvas = document.getElementById("game");
canvas.width = CANVAS.width;
canvas.height = CANVAS.height;

const isDebugMode = new URLSearchParams(window.location.search).get("debug") === "1";
const GAME_OVER_ANIMATION_TIME = GAME_CONFIG.player.gameOverAnimationTime;
const PERK_SELECTION_LOCK_DURATION = GAME_CONFIG.player.perkSelectionLockDuration;
const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content || "0.0";

const gameState = createInitialState();
gameState.runHistory = loadRunHistory();
gameState.perkProgress = loadPerkProgress();
gameState.appVersion = APP_VERSION;
const input = createInput(canvas);
let weaponSystem = createWeaponSystem(gameState.player);
gameState.systems.weaponSystem = weaponSystem;
gameState.systems.world = createWorldSystem(Math.floor(Math.random() * 2147483647));
const services = createGameServices({ gameState, canvas, documentRef: document, isDebugMode });
services.setWeaponSystem(weaponSystem);
services.setWorld(gameState.systems.world);

let blinkCanceledDuringHold = false;
let shoutCanceledDuringHold = false;

const renderer = createRenderer(canvas, gameState);
const fpsTracker = createFpsTracker();
const hud = createHud(document, { isDebugMode });
const debugSystem = createDebugSystem(services);

function applyFreshState(freshState) {
  freshState.runHistory = [...gameState.runHistory];
  freshState.runHistorySort = gameState.runHistorySort;
  freshState.appVersion = gameState.appVersion;
  freshState.perkProgress = {
    seen: { ...gameState.perkProgress.seen },
    activated: { ...gameState.perkProgress.activated },
  };
  Object.assign(gameState, freshState);

  weaponSystem = createWeaponSystem(gameState.player);
  services.setWeaponSystem(weaponSystem);
  services.setWorld(createWorldSystem(Math.floor(Math.random() * 2147483647)));
  gameState.systems.weaponSystem = weaponSystem;
  gameState.systems.world = services.getWorld();
}

function persistPerkProgress() {
  savePerkProgress(gameState.perkProgress);
}

function markPerkSeen(perkId) {
  if (gameState.perkProgress.seen[perkId]) {
    return;
  }
  gameState.perkProgress.seen[perkId] = true;
  persistPerkProgress();
}

function markPerksSeen(perks) {
  let changed = false;
  for (let i = 0; i < perks.length; i += 1) {
    const id = perks[i]?.id;
    if (!id || gameState.perkProgress.seen[id]) {
      continue;
    }
    gameState.perkProgress.seen[id] = true;
    changed = true;
  }
  if (changed) {
    persistPerkProgress();
  }
}

function markPerkActivated(perkId) {
  if (gameState.perkProgress.activated[perkId]) {
    return;
  }
  gameState.perkProgress.activated[perkId] = true;
  gameState.perkProgress.seen[perkId] = true;
  persistPerkProgress();
}

function recordRunResult() {
  if (isDebugMode) {
    return;
  }

  if (gameState.runStats.recorded || gameState.runStats.startedAt <= 0) {
    return;
  }

  gameState.runStats.recorded = true;
  gameState.runHistory = [
    {
      startedAt: gameState.runStats.startedAt,
      timeSurvived: gameState.time,
      kills: gameState.runStats.kills,
      version: APP_VERSION,
    },
    ...gameState.runHistory,
  ].slice(0, 40);
  saveRunHistory(gameState.runHistory);
}

function handleTitleScreenClick() {
  const { x, y } = input.pointer;

  const toggleRect = gameState.titlePerkLibraryToggleRect;
  if (toggleRect && x >= toggleRect.x && x <= toggleRect.x + toggleRect.width && y >= toggleRect.y && y <= toggleRect.y + toggleRect.height) {
    gameState.titlePerkLibraryOpen = !gameState.titlePerkLibraryOpen;
    gameState.titlePerkLibraryScrollOffset = 0;
    gameState.titlePerkLibraryDragging = false;
    gameState.titlePerkLibraryFilterDropdownOpen = false;
    return true;
  }

  if (gameState.titlePerkLibraryOpen) {
    const closeRect = gameState.titlePerkLibraryCloseRect;
    if (closeRect && x >= closeRect.x && x <= closeRect.x + closeRect.width && y >= closeRect.y && y <= closeRect.y + closeRect.height) {
      gameState.titlePerkLibraryOpen = false;
      gameState.titlePerkLibraryFilterDropdownOpen = false;
      return true;
    }

    const filterRect = gameState.titlePerkLibraryFilterRect;
    if (filterRect && x >= filterRect.x && x <= filterRect.x + filterRect.width && y >= filterRect.y && y <= filterRect.y + filterRect.height) {
      gameState.titlePerkLibraryFilterDropdownOpen = !gameState.titlePerkLibraryFilterDropdownOpen;
      return true;
    }

    if (gameState.titlePerkLibraryFilterDropdownOpen) {
      const selectedOption = gameState.titlePerkLibraryFilterRects.find(
        (rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
      );
      if (selectedOption) {
        gameState.titlePerkLibraryFilter = selectedOption.filter;
        gameState.titlePerkLibraryScrollOffset = 0;
      }
      gameState.titlePerkLibraryFilterDropdownOpen = false;
      return true;
    }

    return true;
  }

  const sortRect = gameState.titleSortRects.find(
    (rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  );
  if (sortRect) {
    gameState.runHistorySort = sortRect.sort;
    return true;
  }

  const startRect = gameState.titleStartRect;
  if (startRect && x >= startRect.x && x <= startRect.x + startRect.width && y >= startRect.y && y <= startRect.y + startRect.height) {
    startNewRun();
    return true;
  }

  return false;
}

function startNewRun() {
  const freshState = createInitialState();
  freshState.titleScreen = false;
  freshState.running = true;
  freshState.paused = false;
  freshState.runStats.startedAt = Date.now();
  applyFreshState(freshState);
  debugSystem.seedStarterEnemies();
  fpsTracker.reset();
  services.events.emit("game:reset", { gameState });
}

function returnToTitleScreen() {
  const freshState = createInitialState();
  applyFreshState(freshState);
  fpsTracker.reset();
}

function openPerkModal({ refreshChoices = false } = {}) {
  const player = gameState.player;
  if (player.perkPoints <= 0 || gameState.titleScreen || gameState.gameOver) {
    return;
  }

  if (refreshChoices || player.perkChoices.length === 0) {
    player.perkChoices = getPerkChoices(player);
    markPerksSeen(player.perkChoices);
    player.perkRerollAvailable = true;
    player.perkRerollAnimationTimer = 0;
    player.perkSelectionLockTimer = PERK_SELECTION_LOCK_DURATION;
  }

  player.perkModalOpen = true;
  player.perkRerollRect = null;
  gameState.paused = true;
}

function closePerkModal() {
  gameState.player.perkModalOpen = false;
  gameState.player.perkRerollRect = null;
  gameState.paused = false;
}

function choosePerkByPointer() {
  const player = gameState.player;
  if (!player.perkModalOpen || !input.consumeClick()) {
    return false;
  }

  const { x, y } = input.pointer;
  if (player.perkSelectionLockTimer <= 0 && player.perkRerollAvailable && player.perkRerollRect) {
    const rect = player.perkRerollRect;
    const clickedReroll = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    if (clickedReroll) {
      const excludedIds = player.perkChoices.map((perk) => perk.id);
      player.perkChoices = getPerkChoices(player, excludedIds);
      markPerksSeen(player.perkChoices);
      player.perkRerollAvailable = isDebugMode ? true : false;
      player.perkRerollAnimationTimer = 0.28;
      player.perkSelectionLockTimer = PERK_SELECTION_LOCK_DURATION;
      return true;
    }
  }

  if (player.perkSelectionLockTimer > 0) {
    return true;
  }

  const selected = player.perkChoices.find((perk) => {
    const rect = perk.__cardRect;
    return rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
  });

  if (!selected) {
    return true;
  }

  applyPerk(player, selected);
  markPerkActivated(selected.id);
  player.perkPoints = Math.max(0, player.perkPoints - 1);

  if (player.perkPoints > 0) {
    player.perkChoices = getPerkChoices(player);
    markPerksSeen(player.perkChoices);
    player.perkRerollAvailable = true;
    player.perkRerollAnimationTimer = 0;
    player.perkRerollRect = null;
    player.perkSelectionLockTimer = 0;
    return true;
  }

  closePerkModal();
  player.perkChoices = [];
  player.perkRerollAvailable = false;
  player.perkRerollAnimationTimer = 0;
  player.perkRerollRect = null;
  return true;
}

function update(dt) {
  fpsTracker.update(dt);

  if (gameState.player.perkRerollAnimationTimer > 0) {
    gameState.player.perkRerollAnimationTimer = Math.max(0, gameState.player.perkRerollAnimationTimer - dt);
  }
  if (gameState.player.perkSelectionLockTimer > 0) {
    gameState.player.perkSelectionLockTimer = Math.max(0, gameState.player.perkSelectionLockTimer - dt);
  }

  const perkClickHandled = choosePerkByPointer();
  if (perkClickHandled) {
    return;
  }

  const pausePressed = input.consumePausePress();
  const reloadPressed = input.consumeReloadPress();
  const clicked = input.consumeClick();
  const wheelDeltaY = input.consumeWheelDeltaY();

  if (gameState.titleScreen) {
    if (gameState.titlePerkLibraryOpen) {
      const scrollArea = gameState.titlePerkLibraryScrollAreaRect;
      const inScrollArea =
        !!scrollArea &&
        input.pointer.x >= scrollArea.x &&
        input.pointer.x <= scrollArea.x + scrollArea.width &&
        input.pointer.y >= scrollArea.y &&
        input.pointer.y <= scrollArea.y + scrollArea.height;

      if (wheelDeltaY !== 0 && inScrollArea) {
        gameState.titlePerkLibraryScrollOffset = Math.max(
          0,
          Math.min(gameState.titlePerkLibraryScrollMax, gameState.titlePerkLibraryScrollOffset + wheelDeltaY)
        );
      }

      if (input.pointer.down && inScrollArea && !gameState.titlePerkLibraryFilterDropdownOpen) {
        if (!gameState.titlePerkLibraryDragging) {
          gameState.titlePerkLibraryDragging = true;
          gameState.titlePerkLibraryDragLastY = input.pointer.y;
        } else {
          const dy = input.pointer.y - gameState.titlePerkLibraryDragLastY;
          gameState.titlePerkLibraryDragLastY = input.pointer.y;
          if (dy !== 0) {
            gameState.titlePerkLibraryScrollOffset = Math.max(
              0,
              Math.min(gameState.titlePerkLibraryScrollMax, gameState.titlePerkLibraryScrollOffset - dy)
            );
          }
        }
      }

      if (!input.pointer.down || input.consumePointerRelease()) {
        gameState.titlePerkLibraryDragging = false;
      }
    }

    if (pausePressed) {
      startNewRun();
    } else if (clicked) {
      handleTitleScreenClick();
    }
    return;
  }

  if (gameState.gameOver) {
    gameState.gameOverElapsed += dt;
    gameState.slashEffects.length = 0;
    gameState.shoutWaves.length = 0;
    gameState.fireballs.length = 0;
    if (reloadPressed) {
      startNewRun();
      return;
    }
    if (pausePressed) {
      returnToTitleScreen();
    }
    return;
  }

  if (gameState.player.perkModalOpen && pausePressed) {
    gameState.player.perkSelectionLockTimer = 0;
  } else if (!gameState.player.perkModalOpen && pausePressed) {
    gameState.paused = !gameState.paused;
    if (gameState.paused) {
      gameState.screenFx.shake = 0;
    }
  }

  if (gameState.paused || !gameState.running) {
    return;
  }

  if (gameState.screenFx.hitStop > 0) {
    gameState.screenFx.hitStop = Math.max(0, gameState.screenFx.hitStop - dt);
    return;
  }

  gameState.time += dt;

  const movement = input.movement();
  const world = gameState.systems.world;
  const treeSlow = getMovementSlowMultiplier(world, gameState.player.x, gameState.player.y, gameState.player.radius);
  updatePlayerMovement(gameState.player, movement, dt, {
    terrainMultiplier: treeSlow,
    resolveCollision(player) {
      const resolved = resolvePositionAgainstMountains(world, player.x, player.y, player.radius);
      player.x = resolved.x;
      player.y = resolved.y;
    },
  });

  updateBlinkCharges(services, dt);
  updatePlayerRuntime(gameState, dt);
  if (debugSystem.isNoCooldownsEnabled()) {
    const player = gameState.player;
    player.shoutCooldownRemaining = 0;
    player.fireballCooldownRemaining = 0;
    player.blinkChargeTimer = 0;
    player.blinkCooldownRemaining = 0;
    player.blinkCharges = player.blinkMaxCharges;
  }

  const worldPointer = {
    x: gameState.player.x + (input.pointer.x - canvas.width * 0.5),
    y: gameState.player.y + (input.pointer.y - canvas.height * 0.5),
    down: input.pointer.down,
  };
  gameState.player.aim.x = worldPointer.x;
  gameState.player.aim.y = worldPointer.y;

  const holdingBlink = input.isBlinkHeld();
  if (holdingBlink) {
    updateBlinkPreview(services, worldPointer, blinkCanceledDuringHold);
  } else {
    gameState.player.blinkPreview.active = false;
  }

  const holdingShout = input.isShoutHeld();
  if (holdingShout) {
    updateShoutPreview(services, shoutCanceledDuringHold);
  } else {
    gameState.player.shoutPreview.active = false;
  }

  input.consumeShoutPress();
  const shoutReleased = input.consumeShoutRelease();
  const fireballPressed = input.consumeFireballPress();
  const releasedClick = input.consumePointerRelease();
  const weaponSlot = input.consumeWeaponSlotPress();

  if (weaponSlot === 1 || weaponSlot === 2 || weaponSlot === 3) {
    weaponSystem.switchWeapon(weaponSlot);
  }

  if (holdingBlink && (reloadPressed || clicked)) {
    blinkCanceledDuringHold = true;
    gameState.player.blinkPreview.active = false;
  }

  if (holdingShout && clicked) {
    shoutCanceledDuringHold = true;
    gameState.player.shoutPreview.active = false;
  }

  if (input.consumeBlinkRelease()) {
    if (!blinkCanceledDuringHold) {
      tryBlink(services, worldPointer);
    }
    blinkCanceledDuringHold = false;
    gameState.player.blinkPreview.active = false;
  }

  if (shoutReleased) {
    if (!shoutCanceledDuringHold) {
      tryShout(services);
    }
    shoutCanceledDuringHold = false;
    gameState.player.shoutPreview.active = false;
  }

  if (fireballPressed) {
    tryFireball(services, worldPointer);
  }

  if (reloadPressed && weaponSystem.isGunSelected()) {
    if (weaponSystem.isReloading) {
      weaponSystem.onReloadClick(gameState.player);
    } else {
      weaponSystem.startReload(gameState.player);
    }
  }

  if (clicked && weaponSystem.isGunSelected() && weaponSystem.isReloading) {
    weaponSystem.onReloadClick(gameState.player);
  } else if (weaponSystem.isMeleeSelected() && (input.pointer.down || clicked)) {
    weaponSystem.tryMeleeAttack(gameState.player, worldPointer, gameState.slashEffects);
  } else if (weaponSystem.isBowSelected()) {
    if (input.pointer.down) {
      weaponSystem.startBowCharge();
    }
    if (releasedClick) {
      weaponSystem.releaseBowShot(gameState.player, worldPointer, gameState.projectiles);
    }
  } else if (weaponSystem.isGunSelected() && (input.pointer.down || clicked)) {
    weaponSystem.tryFire(gameState.player, worldPointer, gameState.projectiles);
  }

  weaponSystem.update(dt, gameState.player);

  updateProjectiles(services, dt);
  updateFireballs(services, dt);
  updateShoutWaves(services, dt);
  updateLingeringZones(services, dt);
  updateBurningTrees(world, dt);
  updateEnemySpawning(gameState, dt, { enableSpawns: !isDebugMode || debugSystem.isDirectorEnabled() });
  updateEnemies(gameState, dt);

  const triggeredIndicators = updateIndicators(gameState.indicators, dt);
  triggeredIndicators.forEach((indicator) => {
    if (typeof indicator.onTrigger === "function") {
      indicator.onTrigger();
    }
  });

  updateCollisionSystem(gameState, dt);
  updatePickups(services, dt);

  updateFloatingTexts(gameState, dt);
  updateSlashEffects(gameState, dt);
  updateEffects(gameState, dt);
  applyPendingLevelUps(gameState, services.events);

  if (gameState.player.perkPoints > 0 && !gameState.player.perkModalOpen && !gameState.paused && gameState.player.perkChoices.length === 0) {
    openPerkModal({ refreshChoices: gameState.player.perkChoices.length === 0 });
    return;
  }

  if (gameState.player.hp <= 0) {
    recordRunResult();
    gameState.gameOver = true;
    gameState.gameOverElapsed = 0;
    gameState.running = false;
    gameState.paused = true;
  }

}

createLoop(
  update,
  () => {
    renderer.render();
    hud.update(services, fpsTracker.getValue());
  }
);
