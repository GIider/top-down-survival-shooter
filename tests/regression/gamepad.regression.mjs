import assert from "node:assert/strict";
import { applyRadialDeadzone, createGamepadMapper, GAMEPAD_BUTTONS } from "../../src/core/gamepadMapper.js";

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function snapshot({ axes = [0, 0, 0, 0], pressed = [] } = {}) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  pressed.forEach((index) => {
    buttons[index] = { pressed: true, value: 1 };
  });
  return { axes, buttons };
}

runTest("radial deadzone zeroes small input and rescales the rest", () => {
  assert.deepEqual(applyRadialDeadzone(0.1, 0.1, 0.2), { x: 0, y: 0, magnitude: 0 });
  const full = applyRadialDeadzone(1, 0, 0.2);
  assert.ok(Math.abs(full.x - 1) < 1e-9 && full.y === 0);
  const half = applyRadialDeadzone(0.6, 0, 0.2);
  assert.ok(Math.abs(half.magnitude - 0.5) < 1e-9);
});

runTest("diagonal stick magnitude is clamped to 1", () => {
  const mapper = createGamepadMapper();
  const state = mapper.update(snapshot({ axes: [1, 1, 0, 0] }), 0.016);
  assert.ok(Math.hypot(state.move.x, state.move.y) <= 1 + 1e-9);
});

runTest("button edges fire once per press and once per release", () => {
  const mapper = createGamepadMapper();
  const down = snapshot({ pressed: [GAMEPAD_BUTTONS.rt] });
  assert.equal(mapper.update(down, 0.016).pressed.fire, true);
  assert.equal(mapper.update(down, 0.016).pressed.fire, false);
  const up = mapper.update(snapshot(), 0.016);
  assert.equal(up.released.fire, true);
});

runTest("aim keeps last direction when stick is released", () => {
  const mapper = createGamepadMapper();
  const active = mapper.update(snapshot({ axes: [0, 0, 0, -1] }), 0.016);
  assert.ok(active.aim && active.aim.y < 0);
  const idle = mapper.update(snapshot(), 0.016);
  assert.equal(idle.aim, null);
  assert.ok(idle.lastAim.y < 0);
});

runTest("menu navigation repeats only after the delay", () => {
  const mapper = createGamepadMapper({ navRepeatDelay: 0.4, navRepeatInterval: 0.15 });
  const right = snapshot({ pressed: [GAMEPAD_BUTTONS.dpadRight] });
  assert.equal(mapper.update(right, 0.016).nav.dx, 1);
  assert.equal(mapper.update(right, 0.1).nav.dx, 0);
  assert.equal(mapper.update(right, 0.4).nav.dx, 1);
});

runTest("disconnect resets mapper state", () => {
  const mapper = createGamepadMapper();
  mapper.update(snapshot({ pressed: [GAMEPAD_BUTTONS.rt] }), 0.016);
  const state = mapper.update(null, 0.016);
  assert.equal(state.connected, false);
  assert.equal(state.wasActive, true);
});

import { createAutoAim, getAutoAimParams } from "../../src/systems/autoAim.js";
import { loadSettings, saveSettings } from "../../src/core/settings.js";

runTest("auto-aim off follows the stick exactly", () => {
  const aim = createAutoAim();
  const out = aim.update({
    origin: { x: 0, y: 0 },
    stickDir: { x: 0, y: -1 },
    enemies: [{ x: 100, y: -10, hp: 10, radius: 10 }],
    snap: 0,
    dt: 0.016,
  });
  assert.deepEqual({ x: out.x, y: out.y }, { x: 0, y: -1 });
  assert.equal(out.target, null);
});

runTest("auto-aim pulls toward an enemy inside the cone and ignores ones outside", () => {
  const aim = createAutoAim();
  const enemies = [
    { x: 300, y: 60, hp: 10, radius: 12 },
    { x: -300, y: 0, hp: 10, radius: 12 },
  ];
  let out;
  for (let i = 0; i < 30; i += 1) {
    out = aim.update({ origin: { x: 0, y: 0 }, stickDir: { x: 1, y: 0 }, enemies, snap: 1, dt: 0.016 });
  }
  assert.equal(out.target, enemies[0]);
  assert.ok(out.y > 0.15, "aim should have rotated toward the enemy");
});

runTest("higher snappiness converges faster", () => {
  const run = (snap) => {
    const aim = createAutoAim();
    const enemies = [{ x: 300, y: 80, hp: 10, radius: 10 }];
    const out = aim.update({ origin: { x: 0, y: 0 }, stickDir: { x: 1, y: 0 }, enemies, snap, dt: 0.016 });
    return out.y;
  };
  assert.ok(run(1) > run(0.2));
  assert.ok(getAutoAimParams(1).coneHalfAngle > getAutoAimParams(0.2).coneHalfAngle);
});

runTest("settings load defaults, clamp, and round-trip", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(loadSettings(storage).autoAimSnap, 6);
  saveSettings({ autoAimSnap: 99 }, storage);
  assert.equal(loadSettings(storage).autoAimSnap, 10);
  saveSettings({ autoAimSnap: 3 }, storage);
  assert.equal(loadSettings(storage).autoAimSnap, 3);
});
