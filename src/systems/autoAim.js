import { hypot2 } from "../core/mathUtil.js";
// Controller auto-aim: pulls the aim direction toward the best enemy near the
// stick direction. `snap` (0..1) scales cone width, pull strength and turn speed.

const DEG = Math.PI / 180;

function normalizeAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function getAutoAimParams(snap, config = {}) {
  const t = Math.max(0, Math.min(1, snap));
  return {
    enabled: t > 0,
    coneHalfAngle: lerp(config.minCone ?? 14, config.maxCone ?? 55, t) * DEG,
    pull: lerp(config.minPull ?? 0.45, 1, t),
    turnRate: lerp(config.minTurnRate ?? 7, config.maxTurnRate ?? 70, t),
    range: config.range ?? 560,
  };
}

export function createAutoAim(config = {}) {
  let dir = { x: 1, y: 0 };
  let target = null;

  function reset(initialDir = null) {
    target = null;
    if (initialDir) {
      dir = { x: initialDir.x, y: initialDir.y };
    }
  }

  function pickTarget(origin, refAngle, enemies, params) {
    let best = null;
    let bestScore = Infinity;
    for (const enemy of enemies) {
      if (!enemy || !(enemy.hp > 0)) continue;
      const dx = enemy.x - origin.x;
      const dy = enemy.y - origin.y;
      const dist = hypot2(dx, dy);
      if (dist > params.range || dist < 1) continue;
      const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - refAngle));
      // Widen the cone for large/near enemies so they stay easy to catch.
      const apparent = Math.atan2(enemy.radius ?? 0, dist);
      if (diff - apparent > params.coneHalfAngle) continue;
      let score = diff / params.coneHalfAngle + dist / params.range * 0.6;
      if (enemy === target) score -= 0.35; // hysteresis: avoid flicker between targets
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  // stickDir: unit vector or null when the stick is idle.
  function update({ origin, stickDir, enemies, snap, dt }) {
    const params = getAutoAimParams(snap, config);
    const rawAngle = stickDir ? Math.atan2(stickDir.y, stickDir.x) : Math.atan2(dir.y, dir.x);

    if (!params.enabled) {
      target = null;
      if (stickDir) dir = { x: stickDir.x, y: stickDir.y };
      return { x: dir.x, y: dir.y, target: null };
    }

    target = pickTarget(origin, rawAngle, enemies, params);

    let desiredAngle = rawAngle;
    if (target) {
      const toTarget = Math.atan2(target.y - origin.y, target.x - origin.x);
      desiredAngle = rawAngle + normalizeAngle(toTarget - rawAngle) * params.pull;
    }

    const currentAngle = Math.atan2(dir.y, dir.x);
    // Without a target (or with the stick moving freely) follow the stick quickly.
    const rate = target ? params.turnRate : Math.max(params.turnRate, 40);
    const k = 1 - Math.exp(-rate * Math.max(0, dt));
    const nextAngle = currentAngle + normalizeAngle(desiredAngle - currentAngle) * k;
    dir = { x: Math.cos(nextAngle), y: Math.sin(nextAngle) };
    return { x: dir.x, y: dir.y, target };
  }

  return { update, reset, getTarget: () => target };
}
