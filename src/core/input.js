import { createGamepadMapper } from "./gamepadMapper.js";
import { GAME_CONFIG } from "../config/gameConfig.js";

export function createInput(canvas) {
  const keys = new Set();
  const gamepadMapper = createGamepadMapper(GAME_CONFIG.gamepad);
  let activeDevice = "keyboard";
  let menuMode = false;
  let gamepadMove = { x: 0, y: 0 };
  let gamepadAimDir = { x: 1, y: 0 };
  let gamepadFireHeld = false;
  let gamepadBlinkHeld = false;
  let gamepadShoutHeld = false;
  let gamepadWasConnected = false;
  let gamepadDisconnected = false;
  let cancelPressed = false;
  let weaponCycle = 0;
  let menuNav = { dx: 0, dy: 0 };
  let menuConfirm = false;
  let menuBack = false;
  let gamepadAimActive = false;
  let keyNav = { dx: 0, dy: 0 };
  let enterPressed = false;
  let reloadPressed = false;
  let pausePressed = false;
  let shoutPressed = false;
  let shoutHeld = false;
  let shoutReleased = false;
  let fireballPressed = false;
  let blinkHeld = false;
  let blinkReleased = false;
  let weaponSlotPressed = 0;
  let pointerReleased = false;
  let wheelDeltaY = 0;

  const pointer = {
    x: 0,
    y: 0,
    down: false,
    clicked: false,
  };

  function updatePointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    pointer.x = (event.clientX - rect.left) * scaleX;
    pointer.y = (event.clientY - rect.top) * scaleY;
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const code = event.code;
    keys.add(key);
    activeDevice = "keyboard";

    if (!event.repeat || key === "arrowleft" || key === "arrowright") {
      if (key === "arrowleft") keyNav = { dx: -1, dy: 0 };
      else if (key === "arrowright") keyNav = { dx: 1, dy: 0 };
      else if (key === "arrowup") keyNav = { dx: 0, dy: -1 };
      else if (key === "arrowdown") keyNav = { dx: 0, dy: 1 };
      else if (key === "enter") enterPressed = true;
    }

    if (key === "r" && !event.repeat) {
      reloadPressed = true;
    }

    if (key === " " && !event.repeat) {
      pausePressed = true;
    }

    if (key === "q" && !event.repeat) {
      blinkHeld = true;
    }

    if (key === "e" && !event.repeat) {
      shoutPressed = true;
      shoutHeld = true;
    }

    if (key === "f" && !event.repeat) {
      fireballPressed = true;
    }

    if (!event.repeat) {
      if (code === "Digit1" || key === "1") {
        weaponSlotPressed = 1;
      } else if (code === "Digit2" || key === "2") {
        weaponSlotPressed = 2;
      } else if (code === "Digit3" || key === "3") {
        weaponSlotPressed = 3;
      } else if (code === "Digit4" || key === "4") {
        weaponSlotPressed = 4;
      }
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    if (key === "q") {
      blinkHeld = false;
      blinkReleased = true;
    }
    if (key === "e") {
      shoutHeld = false;
      shoutReleased = true;
    }
  });

  canvas.addEventListener("mousemove", (event) => {
    activeDevice = "keyboard";
    updatePointerPosition(event);
  });

  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    activeDevice = "keyboard";
    updatePointerPosition(event);
    pointer.down = true;
    pointer.clicked = true;
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button !== 0) {
      return;
    }
    pointer.down = false;
    pointerReleased = true;
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      updatePointerPosition(event);
      wheelDeltaY += event.deltaY;
      event.preventDefault();
    },
    { passive: false }
  );

  function releaseGamepadHolds() {
    if (gamepadFireHeld) {
      gamepadFireHeld = false;
      pointer.down = false;
      pointerReleased = true;
    }
    if (gamepadBlinkHeld) {
      gamepadBlinkHeld = false;
      blinkHeld = false;
    }
    if (gamepadShoutHeld) {
      gamepadShoutHeld = false;
      shoutHeld = false;
    }
    gamepadMove = { x: 0, y: 0 };
  }

  function readGamepadSnapshot() {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      return null;
    }
    const pads = navigator.getGamepads() || [];
    for (const pad of pads) {
      if (pad && pad.connected) {
        return { axes: Array.from(pad.axes), buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })) };
      }
    }
    return null;
  }

  // Poll once per update tick; feeds gamepad state into the same latches the keyboard/mouse use.
  function poll(dt = 0) {
    const state = gamepadMapper.update(readGamepadSnapshot(), dt);
    if (!state.connected) {
      if (gamepadWasConnected) {
        gamepadWasConnected = false;
        gamepadDisconnected = true;
        releaseGamepadHolds();
        if (activeDevice === "gamepad") {
          activeDevice = "keyboard";
        }
      }
      return;
    }
    gamepadWasConnected = true;

    if (state.anyInput) {
      activeDevice = "gamepad";
    }
    if (activeDevice !== "gamepad") {
      // Keep edge tracking current but do not drive the game from a pad nobody is touching.
      return;
    }

    gamepadMove = state.move;
    gamepadAimActive = !!state.aim;
    if (state.aim) {
      gamepadAimDir = { x: state.aim.x, y: state.aim.y };
    }

    if (state.pressed.pause) {
      pausePressed = true;
    }
    menuNav = state.nav.dx !== 0 || state.nav.dy !== 0 ? state.nav : menuNav;
    if (state.pressed.confirm) {
      menuConfirm = true;
    }
    if (state.pressed.back) {
      menuBack = true;
    }

    if (menuMode) {
      // Menus use confirm/back/nav only; do not leak fire/skills into stale pointer positions.
      if (gamepadFireHeld) {
        releaseGamepadHolds();
      }
      return;
    }

    if (state.pressed.reload) {
      reloadPressed = true;
    }
    if (state.pressed.back) {
      cancelPressed = true;
    }
    if (state.pressed.fireball) {
      fireballPressed = true;
    }
    if (state.pressed.weaponPrev) {
      weaponCycle = -1;
    } else if (state.pressed.weaponNext) {
      weaponCycle = 1;
    }

    if (state.pressed.fire) {
      gamepadFireHeld = true;
      pointer.down = true;
      pointer.clicked = true;
    } else if (state.released.fire && gamepadFireHeld) {
      gamepadFireHeld = false;
      pointer.down = false;
      pointerReleased = true;
    }

    if (state.pressed.blink) {
      gamepadBlinkHeld = true;
      blinkHeld = true;
    } else if (state.released.blink && gamepadBlinkHeld) {
      gamepadBlinkHeld = false;
      blinkHeld = false;
      blinkReleased = true;
    }

    if (state.pressed.shout) {
      gamepadShoutHeld = true;
      shoutPressed = true;
      shoutHeld = true;
    } else if (state.released.shout && gamepadShoutHeld) {
      gamepadShoutHeld = false;
      shoutHeld = false;
      shoutReleased = true;
    }
  }

  return {
    keys,
    pointer,
    poll,
    get activeDevice() {
      return activeDevice;
    },
    setMenuMode(value) {
      menuMode = !!value;
    },
    isGamepadActive() {
      return activeDevice === "gamepad";
    },
    isGamepadAimActive() {
      return activeDevice === "gamepad" && gamepadAimActive;
    },
    consumeKeyNav() {
      const value = keyNav;
      keyNav = { dx: 0, dy: 0 };
      return value;
    },
    consumeEnterPress() {
      const value = enterPressed;
      enterPressed = false;
      return value;
    },
    gamepadAimDirection() {
      return gamepadAimDir;
    },
    consumeGamepadDisconnect() {
      const value = gamepadDisconnected;
      gamepadDisconnected = false;
      return value;
    },
    consumeCancelPress() {
      const value = cancelPressed;
      cancelPressed = false;
      return value;
    },
    consumeWeaponCycle() {
      const value = weaponCycle;
      weaponCycle = 0;
      return value;
    },
    consumeMenuNav() {
      const value = menuNav;
      menuNav = { dx: 0, dy: 0 };
      return value;
    },
    consumeMenuConfirm() {
      const value = menuConfirm;
      menuConfirm = false;
      return value;
    },
    consumeMenuBack() {
      const value = menuBack;
      menuBack = false;
      return value;
    },
    consumeReloadPress() {
      const pressed = reloadPressed;
      reloadPressed = false;
      return pressed;
    },
    consumePausePress() {
      const pressed = pausePressed;
      pausePressed = false;
      return pressed;
    },
    consumeShoutPress() {
      const pressed = shoutPressed;
      shoutPressed = false;
      return pressed;
    },
    isShoutHeld() {
      return shoutHeld;
    },
    consumeShoutRelease() {
      const released = shoutReleased;
      shoutReleased = false;
      return released;
    },
    consumeFireballPress() {
      const pressed = fireballPressed;
      fireballPressed = false;
      return pressed;
    },
    isBlinkHeld() {
      return blinkHeld;
    },
    consumeBlinkRelease() {
      const released = blinkReleased;
      blinkReleased = false;
      return released;
    },
    consumeClick() {
      const clicked = pointer.clicked;
      pointer.clicked = false;
      return clicked;
    },
    consumeWeaponSlotPress() {
      const slot = weaponSlotPressed;
      weaponSlotPressed = 0;
      return slot;
    },
    consumePointerRelease() {
      const released = pointerReleased;
      pointerReleased = false;
      return released;
    },
    consumeWheelDeltaY() {
      const delta = wheelDeltaY;
      wheelDeltaY = 0;
      return delta;
    },
    movement() {
      if (activeDevice === "gamepad") {
        return { x: gamepadMove.x, y: gamepadMove.y };
      }
      const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      const y = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      return { x, y };
    },
  };
}
