import { ensureBossState } from "./bossState.js";

// Living bosses with an `arena` def hold the player inside one shared circle. The ring follows
// the boss(es) and disappears when the last one dies. Radius eases in from far away
// so a player who is outside when the boss appears is never snapped.

const LOCK_IN_EXTRA = 600;

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

export function getArenaRadius(boss) {
  const arena = boss.arena;
  if (!arena) {
    return null;
  }
  const lockIn = arena.lockIn ?? 1.5;
  const t = lockIn > 0 ? Math.min(1, (boss.age || 0) / lockIn) : 1;
  return arena.radius + (1 - easeOut(t)) * LOCK_IN_EXTRA;
}

// The ring in effect, as a list of zero or one { x, y, radius, boss, bosses }. With several bosses
// the ring is centered on their centroid and just large enough to contain each boss's own ring.
export function getBossArenas(gameState) {
  const state = gameState.systems?.boss;
  if (!state) {
    return [];
  }
  const members = [];
  state.active.forEach((boss) => {
    const radius = getArenaRadius(boss);
    if (radius !== null) {
      members.push({ boss, radius });
    }
  });
  if (members.length === 0) {
    return [];
  }
  let cx = 0;
  let cy = 0;
  members.forEach(({ boss }) => {
    cx += boss.x;
    cy += boss.y;
  });
  cx /= members.length;
  cy /= members.length;
  let radius = 0;
  members.forEach((member) => {
    radius = Math.max(radius, Math.hypot(member.boss.x - cx, member.boss.y - cy) + member.radius);
  });
  return [{ x: cx, y: cy, radius, boss: members[0].boss, bosses: members.map((member) => member.boss) }];
}

// Returns the position pushed back inside the ring.
export function constrainToBossArenas(gameState, x, y, playerRadius = 0) {
  const state = gameState.systems?.boss;
  if (!state || state.active.length === 0) {
    return { x, y };
  }
  let px = x;
  let py = y;
  for (const ring of getBossArenas(gameState)) {
    const limit = Math.max(1, ring.radius - playerRadius);
    const dx = px - ring.x;
    const dy = py - ring.y;
    const dist = Math.hypot(dx, dy);
    if (dist > limit) {
      px = ring.x + (dx / dist) * limit;
      py = ring.y + (dy / dist) * limit;
    }
  }
  return { x: px, y: py };
}
