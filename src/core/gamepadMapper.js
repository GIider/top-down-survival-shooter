// Pure gamepad -> game-intent mapping (standard mapping layout). No DOM access.

export const GAMEPAD_BUTTONS = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
};

export const DEFAULT_GAMEPAD_CONFIG = {
  moveDeadzone: 0.2,
  aimDeadzone: 0.25,
  triggerThreshold: 0.35,
  navStickThreshold: 0.6,
  navRepeatDelay: 0.4,
  navRepeatInterval: 0.15,
};

export function applyRadialDeadzone(x, y, deadzone) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) {
    return { x: 0, y: 0, magnitude: 0 };
  }
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled, magnitude: scaled };
}

function buttonDown(buttons, index, threshold) {
  const button = buttons?.[index];
  if (!button) {
    return false;
  }
  return !!button.pressed || (button.value ?? 0) > threshold;
}

export function createGamepadMapper(config = {}) {
  const cfg = { ...DEFAULT_GAMEPAD_CONFIG, ...config };
  let prev = {};
  let lastAim = null;
  let navHeldDir = null;
  let navTimer = 0;

  function reset() {
    prev = {};
    lastAim = null;
    navHeldDir = null;
    navTimer = 0;
  }

  // snapshot: { axes: number[], buttons: {pressed, value}[] } or null when disconnected.
  function update(snapshot, dt = 0) {
    if (!snapshot) {
      const wasActive = Object.keys(prev).length > 0;
      reset();
      return { connected: false, wasActive };
    }

    const axes = snapshot.axes || [];
    const b = snapshot.buttons || [];
    const t = cfg.triggerThreshold;
    const held = {
      fire: buttonDown(b, GAMEPAD_BUTTONS.rt, t),
      reload: buttonDown(b, GAMEPAD_BUTTONS.x, t),
      blink: buttonDown(b, GAMEPAD_BUTTONS.lt, t),
      shout: buttonDown(b, GAMEPAD_BUTTONS.rb, t),
      fireball: buttonDown(b, GAMEPAD_BUTTONS.y, t) || buttonDown(b, GAMEPAD_BUTTONS.lb, t),
      confirm: buttonDown(b, GAMEPAD_BUTTONS.a, t),
      back: buttonDown(b, GAMEPAD_BUTTONS.b, t),
      pause: buttonDown(b, GAMEPAD_BUTTONS.start, t),
      dpadLeft: buttonDown(b, GAMEPAD_BUTTONS.dpadLeft, t),
      dpadRight: buttonDown(b, GAMEPAD_BUTTONS.dpadRight, t),
      dpadUp: buttonDown(b, GAMEPAD_BUTTONS.dpadUp, t),
      dpadDown: buttonDown(b, GAMEPAD_BUTTONS.dpadDown, t),
    };

    const pressed = {};
    const released = {};
    for (const name of Object.keys(held)) {
      pressed[name] = held[name] && !prev[name];
      released[name] = !held[name] && !!prev[name];
    }
    prev = held;

    const move = applyRadialDeadzone(axes[0] ?? 0, axes[1] ?? 0, cfg.moveDeadzone);
    const aimRaw = applyRadialDeadzone(axes[2] ?? 0, axes[3] ?? 0, cfg.aimDeadzone);
    let aim = null;
    if (aimRaw.magnitude > 0) {
      const len = Math.hypot(aimRaw.x, aimRaw.y);
      aim = { x: aimRaw.x / len, y: aimRaw.y / len, magnitude: aimRaw.magnitude };
      lastAim = { x: aim.x, y: aim.y };
    }

    // Menu navigation: D-pad or left stick, with key-repeat while held.
    let navDir = null;
    const sx = axes[0] ?? 0;
    const sy = axes[1] ?? 0;
    if (held.dpadLeft || sx < -cfg.navStickThreshold) {
      navDir = { dx: -1, dy: 0 };
    } else if (held.dpadRight || sx > cfg.navStickThreshold) {
      navDir = { dx: 1, dy: 0 };
    } else if (held.dpadUp || sy < -cfg.navStickThreshold) {
      navDir = { dx: 0, dy: -1 };
    } else if (held.dpadDown || sy > cfg.navStickThreshold) {
      navDir = { dx: 0, dy: 1 };
    }

    let nav = { dx: 0, dy: 0 };
    if (!navDir) {
      navHeldDir = null;
      navTimer = 0;
    } else if (!navHeldDir || navHeldDir.dx !== navDir.dx || navHeldDir.dy !== navDir.dy) {
      navHeldDir = navDir;
      navTimer = cfg.navRepeatDelay;
      nav = navDir;
    } else {
      navTimer -= dt;
      if (navTimer <= 0) {
        navTimer = cfg.navRepeatInterval;
        nav = navDir;
      }
    }

    const anyInput =
      move.magnitude > 0 ||
      aimRaw.magnitude > 0 ||
      Object.values(held).some(Boolean);

    return {
      connected: true,
      anyInput,
      move: { x: move.x, y: move.y },
      aim,
      lastAim,
      held,
      pressed,
      released,
      nav,
    };
  }

  return { update, reset };
}
