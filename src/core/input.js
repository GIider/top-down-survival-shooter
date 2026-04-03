export function createInput(canvas) {
  const keys = new Set();
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
    updatePointerPosition(event);
  });

  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
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

  return {
    keys,
    pointer,
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
      const x = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      const y = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      return { x, y };
    },
  };
}
