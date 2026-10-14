import { playSfx, SFX_VOLUME_STEPS, sfx } from "./audio/sfx.js";
import { GAME_CONFIG } from "./core/constants.js";
import { createFpsTracker } from "./core/fpsTracker.js";
import { createGameServices } from "./core/gameServices.js";
import { createInput } from "./core/input.js";
import { createLoop } from "./core/loop.js";
import { loadPerkProgress, savePerkProgress } from "./core/perkProgress.js";
import { createRenderer } from "./core/renderer.js";
import { createSimContext, stepSim } from "./core/simStep.js";
import { createView } from "./core/view.js";
import { loadRunHistory, saveRunHistory } from "./core/runHistory.js";
import { AUTO_AIM_SNAP_MAX, loadSettings, saveSettings } from "./core/settings.js";
import { createAutoAim } from "./systems/autoAim.js";
import { createInitialState } from "./core/state.js";
import { createDebugSystem, DEBUG_MENU_ITEMS } from "./systems/debugSystem.js";
import { applyPerk, allPerks, getPerkChoices } from "./systems/perkSystem.js";
import { createPerkEngine } from "./systems/perks/perkEngine.js";
import { createWorldSystem } from "./systems/worldSystem.js";
import { createWeaponSystem } from "./systems/weaponSystem.js";

const canvas = document.getElementById("game");
const view = createView(canvas);

const isDebugMode = new URLSearchParams(window.location.search).get("debug") === "1";
const GAME_OVER_ANIMATION_TIME = GAME_CONFIG.player.gameOverAnimationTime;
const PERK_SELECTION_LOCK_DURATION = GAME_CONFIG.player.perkSelectionLockDuration;
const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content || "0.0";

const gameState = createInitialState();
gameState.runHistory = loadRunHistory();
gameState.perkProgress = loadPerkProgress();
gameState.settings = loadSettings();
const autoAim = createAutoAim();
gameState.appVersion = APP_VERSION;
const perkEngine = createPerkEngine();
gameState.systems.perkEngine = perkEngine;
const input = createInput(canvas, view);
let weaponSystem = createWeaponSystem(gameState.player);
gameState.systems.weaponSystem = weaponSystem;
gameState.systems.world = createWorldSystem(Math.floor(Math.random() * 2147483647));
const services = createGameServices({ gameState, canvas: view, documentRef: document, isDebugMode });
services.setWeaponSystem(weaponSystem);
services.setPerkEngine(perkEngine);
services.setWorld(gameState.systems.world);

const debugSystem = createDebugSystem(services);
const simContext = createSimContext({ gameState, services });
Object.defineProperty(simContext.options, "directorEnabled", {
  get: () => !isDebugMode || debugSystem.isDirectorEnabled(),
});
Object.defineProperty(simContext.options, "noCooldowns", {
  get: () => debugSystem.isNoCooldownsEnabled(),
});
const renderer = createRenderer(canvas, gameState, view, { debugSystem });
const fpsTracker = createFpsTracker();

function applyFreshState(freshState) {
  freshState.runHistory = [...gameState.runHistory];
  freshState.runHistorySort = gameState.runHistorySort;
  freshState.appVersion = gameState.appVersion;
  freshState.settings = gameState.settings;
  autoAim.reset();
  freshState.perkProgress = {
    seen: { ...gameState.perkProgress.seen },
    activated: { ...gameState.perkProgress.activated },
    disabled: { ...gameState.perkProgress.disabled },
  };
  Object.assign(gameState, freshState);

  weaponSystem = createWeaponSystem(gameState.player);
  services.setWeaponSystem(weaponSystem);
  perkEngine.invalidate();
  services.setPerkEngine(perkEngine);
  services.setWorld(createWorldSystem(Math.floor(Math.random() * 2147483647)));
  gameState.systems.weaponSystem = weaponSystem;
  gameState.systems.world = services.getWorld();
}

function persistPerkProgress() {
  if (isDebugMode) {
    return;
  }
  savePerkProgress(gameState.perkProgress);
}

function markPerkSeen(perkId) {
  if (isDebugMode) {
    return;
  }
  if (gameState.perkProgress.seen[perkId]) {
    return;
  }
  gameState.perkProgress.seen[perkId] = true;
  persistPerkProgress();
}

function markPerksSeen(perks) {
  if (isDebugMode) {
    return;
  }
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
  if (isDebugMode) {
    return;
  }
  if (gameState.perkProgress.activated[perkId]) {
    return;
  }
  gameState.perkProgress.activated[perkId] = true;
  gameState.perkProgress.seen[perkId] = true;
  persistPerkProgress();
}

function getDisabledPerkIds() {
  return Object.keys(gameState.perkProgress.disabled).filter((id) => gameState.perkProgress.disabled[id]);
}

function togglePerkDisabled(perkId) {
  if (!isDebugMode && !gameState.perkProgress.activated[perkId]) {
    return;
  }
  gameState.perkProgress.disabled[perkId] = !gameState.perkProgress.disabled[perkId];
  persistPerkProgress();
}

function bulkSetFilteredDisabled(filteredPerks, disabledValue) {
  let changed = false;
  for (let i = 0; i < filteredPerks.length; i += 1) {
    const id = filteredPerks[i].id;
    if (!isDebugMode && !gameState.perkProgress.activated[id]) {
      continue;
    }
    if (!!gameState.perkProgress.disabled[id] !== disabledValue) {
      gameState.perkProgress.disabled[id] = disabledValue;
      changed = true;
    }
  }
  if (changed) {
    persistPerkProgress();
  }
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

    const toggledPerk = (gameState.titlePerkLibraryToggleRects || []).find(
      (rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    );
    if (toggledPerk) {
      togglePerkDisabled(toggledPerk.perkId);
      return true;
    }

    const filterTag = gameState.titlePerkLibraryFilter || "all";
    const filteredForBulk = allPerks.filter((p) => filterTag === "all" || (p.tags || []).includes(filterTag));

    const enableAllRect = gameState.titlePerkLibraryEnableAllRect;
    if (enableAllRect && x >= enableAllRect.x && x <= enableAllRect.x + enableAllRect.width && y >= enableAllRect.y && y <= enableAllRect.y + enableAllRect.height) {
      bulkSetFilteredDisabled(filteredForBulk, false);
      return true;
    }

    const disableAllRect = gameState.titlePerkLibraryDisableAllRect;
    if (disableAllRect && x >= disableAllRect.x && x <= disableAllRect.x + disableAllRect.width && y >= disableAllRect.y && y <= disableAllRect.y + disableAllRect.height) {
      bulkSetFilteredDisabled(filteredForBulk, true);
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
    player.perkChoices = getPerkChoices(player, [], getDisabledPerkIds());
    if (player.perkChoices.length === 0) {
      player.perkPoints = Math.max(0, player.perkPoints - 1);
      return;
    }
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

function setAutoAimSnap(value) {
  const next = Math.max(0, Math.min(AUTO_AIM_SNAP_MAX, Math.round(value)));
  if (next === gameState.settings.autoAimSnap) {
    return;
  }
  gameState.settings.autoAimSnap = next;
  saveSettings(gameState.settings);
}

function getVolumeStep() {
  return Math.round(sfx.getVolume() * SFX_VOLUME_STEPS);
}

function setVolumeStep(value) {
  const next = Math.max(0, Math.min(SFX_VOLUME_STEPS, Math.round(value)));
  if (next === getVolumeStep() && !sfx.isMuted()) {
    return;
  }
  sfx.setVolume(next / SFX_VOLUME_STEPS);
  // Touching the slider is an explicit request to hear sound again.
  sfx.setMuted(false);
  sfx.unlock();
  playSfx("uiClick");
}

function pointInRect(rect, x, y, pad = 0) {
  return !!rect && x >= rect.x - pad && x <= rect.x + rect.width + pad && y >= rect.y - pad && y <= rect.y + rect.height + pad;
}

function handlePauseDebug({ nav, keyNav, activate, clicked, x, y }) {
  const itemCount = DEBUG_MENU_ITEMS.length;
  const backIndex = itemCount;
  let index = gameState.pauseDebugIndex ?? 0;

  const dx = nav.dx || keyNav.dx;
  const dy = nav.dy || keyNav.dy;
  if (index === backIndex) {
    if (dy < 0) {
      index = itemCount - 2;
    }
  } else if (dx !== 0) {
    index = Math.max(0, Math.min(itemCount - 1, index + dx));
  } else if (dy !== 0) {
    index += dy * 2;
    if (index >= itemCount) {
      index = backIndex;
    }
    index = Math.max(0, index);
  }
  gameState.pauseDebugIndex = index;

  let target = -1;
  if (clicked) {
    const rects = gameState.pauseDebugRects || [];
    target = rects.findIndex((rect) => pointInRect(rect, x, y));
  }
  if (target < 0 && activate) {
    target = index;
  }
  if (target < 0) {
    return;
  }

  gameState.pauseDebugIndex = target;
  if (target === backIndex) {
    gameState.pauseView = "main";
    return;
  }
  playSfx("uiClick");
  debugSystem.activate(DEBUG_MENU_ITEMS[target].id);
}

function handlePauseMenu({ nav, keyNav, confirm, clicked }) {
  const activate = confirm;
  const { x, y } = input.pointer;

  if (gameState.pauseView === "debug" && isDebugMode) {
    handlePauseDebug({ nav, keyNav, activate, clicked, x, y });
    return;
  }

  if (gameState.pauseView !== "settings") {
    const maxRow = isDebugMode ? 1 : 0;
    const rowDelta = nav.dy || keyNav.dy;
    if (rowDelta !== 0) {
      gameState.pauseMainRow = Math.max(0, Math.min(maxRow, (gameState.pauseMainRow ?? 0) + rowDelta));
    }

    const clickedSettings = clicked && pointInRect(gameState.pauseSettingsButtonRect, x, y);
    const clickedDebug = clicked && pointInRect(gameState.pauseDebugButtonRect, x, y);
    if (clickedDebug || (activate && gameState.pauseMainRow === 1 && isDebugMode)) {
      gameState.pauseView = "debug";
      gameState.pauseDebugIndex = 0;
    } else if (clickedSettings || activate) {
      gameState.pauseView = "settings";
      gameState.pauseSettingsRow = 0;
    }
    return;
  }

  const dy = nav.dy || keyNav.dy;
  if (dy !== 0) {
    gameState.pauseSettingsRow = Math.max(0, Math.min(1, gameState.pauseSettingsRow + dy));
  }

  const dx = nav.dx || keyNav.dx;
  if (dx !== 0) {
    if (gameState.pauseSettingsRow === 0) {
      setAutoAimSnap(gameState.settings.autoAimSnap + dx);
    } else {
      setVolumeStep(getVolumeStep() + dx);
    }
  }

  if (input.pointer.down && input.activeDevice === "keyboard") {
    const aimTrack = gameState.pauseSettingsSliderRect;
    const volumeTrack = gameState.pauseSettingsVolumeRect;
    if (pointInRect(aimTrack, x, y, 14)) {
      gameState.pauseSettingsRow = 0;
      const ratio = Math.max(0, Math.min(1, (x - aimTrack.x) / aimTrack.width));
      setAutoAimSnap(ratio * AUTO_AIM_SNAP_MAX);
    } else if (pointInRect(volumeTrack, x, y, 14)) {
      gameState.pauseSettingsRow = 1;
      const ratio = Math.max(0, Math.min(1, (x - volumeTrack.x) / volumeTrack.width));
      setVolumeStep(ratio * SFX_VOLUME_STEPS);
    }
  }

  if (activate || (clicked && pointInRect(gameState.pauseSettingsBackRect, x, y))) {
    gameState.pauseView = "main";
  }
}

function handleGamepadPerkNav(nav, confirm) {
  const player = gameState.player;
  if (!player.perkModalOpen || !input.isGamepadActive()) {
    return;
  }

  const count = player.perkChoices.length;
  const hasReroll = !!player.perkRerollAvailable;
  const total = count + (hasReroll ? 1 : 0);
  if (total === 0) {
    return;
  }

  let index = Math.max(0, Math.min(total - 1, player.perkFocusIndex ?? 0));
  if (nav.dx !== 0) {
    index = (index + nav.dx + total) % total;
  } else if (nav.dy > 0 && hasReroll) {
    index = count;
  } else if (nav.dy < 0 && index === count) {
    index = Math.floor((count - 1) / 2);
  }
  player.perkFocusIndex = index;

  if (confirm) {
    const rect = index < count ? player.perkChoices[index].__cardRect : player.perkRerollRect;
    if (rect) {
      input.pointer.x = rect.x + rect.width * 0.5;
      input.pointer.y = rect.y + rect.height * 0.5;
      input.pointer.clicked = true;
    }
  }
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
      player.perkChoices = getPerkChoices(player, excludedIds, getDisabledPerkIds());
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

  applyPerk(player, selected, { perkEngine });
  playSfx("perkSelect");
  markPerkActivated(selected.id);
  player.perkPoints = Math.max(0, player.perkPoints - 1);

  if (player.perkPoints > 0) {
    player.perkChoices = getPerkChoices(player, [], getDisabledPerkIds());
    if (player.perkChoices.length === 0) {
      player.perkPoints = 0;
      closePerkModal();
      player.perkChoices = [];
      player.perkRerollAvailable = false;
      player.perkRerollAnimationTimer = 0;
      player.perkRerollRect = null;
      return true;
    }
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
  if (typeof perkEngine.resetFrameDebug === "function") {
    perkEngine.resetFrameDebug();
  }
  fpsTracker.update(dt);
  gameState.fps = fpsTracker.getValue();

  if (gameState.player.perkRerollAnimationTimer > 0) {
    gameState.player.perkRerollAnimationTimer = Math.max(0, gameState.player.perkRerollAnimationTimer - dt);
  }
  if (gameState.player.perkSelectionLockTimer > 0) {
    gameState.player.perkSelectionLockTimer = Math.max(0, gameState.player.perkSelectionLockTimer - dt);
  }

  input.setMenuMode(
    gameState.titleScreen || gameState.gameOver || gameState.paused || gameState.player.perkModalOpen
  );
  input.poll(dt);
  gameState.inputDevice = input.activeDevice;
  canvas.style.cursor = input.isGamepadActive() ? "none" : "";

  const menuNav = input.consumeMenuNav();
  const menuConfirm = input.consumeMenuConfirm();
  const menuBack = input.consumeMenuBack();
  const keyNav = input.consumeKeyNav();
  const enterPressed = input.consumeEnterPress();

  if (input.consumeGamepadDisconnect() && gameState.running && !gameState.titleScreen && !gameState.gameOver) {
    gameState.paused = true;
  }

  handleGamepadPerkNav(menuNav, menuConfirm);

  const perkClickHandled = choosePerkByPointer();
  if (perkClickHandled) {
    return;
  }

  const pausePressed =
    input.consumePausePress() ||
    (menuBack &&
      gameState.paused &&
      gameState.pauseView === "main" &&
      !gameState.titleScreen &&
      !gameState.gameOver &&
      !gameState.player.perkModalOpen);
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

    if (pausePressed || menuConfirm) {
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
    if (reloadPressed || menuConfirm) {
      startNewRun();
      return;
    }
    if (pausePressed || menuBack) {
      returnToTitleScreen();
    }
    return;
  }

  if (gameState.paused && (gameState.pauseView === "settings" || gameState.pauseView === "debug") && menuBack) {
    gameState.pauseView = "main";
  } else if (gameState.paused && !gameState.player.perkModalOpen && !pausePressed) {
    handlePauseMenu({ nav: menuNav, keyNav, confirm: menuConfirm || enterPressed, clicked });
  }

  if (gameState.player.perkModalOpen && pausePressed) {
    gameState.player.perkSelectionLockTimer = 0;
  } else if (!gameState.player.perkModalOpen && pausePressed) {
    gameState.paused = !gameState.paused;
    gameState.pauseView = "main";
    gameState.pauseMainRow = 0;
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

  stepSim(simContext, dt, input.movement(), () => {
    let gamepadAim = null;
    if (input.isGamepadActive()) {
      gamepadAim = autoAim.update({
        origin: gameState.player,
        stickDir: input.isGamepadAimActive() ? input.gamepadAimDirection() : null,
        enemies: gameState.enemies,
        snap: gameState.settings.autoAimSnap / AUTO_AIM_SNAP_MAX,
        dt,
      });
    }
    gameState.autoAimTarget = gamepadAim?.target ?? null;
    const aimRadius = GAME_CONFIG.gamepad.aimRadius;
    const worldPointer = {
      x: gamepadAim ? gameState.player.x + gamepadAim.x * aimRadius : gameState.player.x + (input.pointer.x - view.width * 0.5),
      y: gamepadAim ? gameState.player.y + gamepadAim.y * aimRadius : gameState.player.y + (input.pointer.y - view.height * 0.5),
      down: input.pointer.down,
    };

    const blinkHeld = input.isBlinkHeld();
    const shoutHeld = input.isShoutHeld();
    input.consumeShoutPress();
    return {
      worldPointer,
      clicked,
      reloadPressed,
      blinkHeld,
      shoutHeld,
      shoutReleased: input.consumeShoutRelease(),
      fireballPressed: input.consumeFireballPress(),
      releasedClick: input.consumePointerRelease(),
      weaponSlot: input.consumeWeaponSlotPress(),
      cancelPressed: input.consumeCancelPress(),
      blinkReleased: input.consumeBlinkRelease(),
    };
  });

  if (gameState.player.perkPoints > 0 && !gameState.player.perkModalOpen && !gameState.paused && gameState.player.perkChoices.length === 0) {
    openPerkModal({ refreshChoices: gameState.player.perkChoices.length === 0 });
    return;
  }

  if (gameState.player.hp <= 0) {
    recordRunResult();
    playSfx("gameOver");
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
  },
  isDebugMode
    ? {
        onFrame(updateTime, renderTime) {
          fpsTracker.recordFrame(updateTime, renderTime);
          gameState.perf = fpsTracker.getTimings();
        },
      }
    : undefined
);
