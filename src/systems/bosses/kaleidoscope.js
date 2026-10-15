import { GAME_CONFIG } from "../../core/constants.js";
import { addBossTimer } from "./bossState.js";
import { closingCage, gapRing, lanceBurst, ringPoints, spiralPoints, spiralStorm, strikeField, sweepBeam } from "./bossPatterns.js";
import { hypot2 } from "../../core/mathUtil.js";

const CONFIG = GAME_CONFIG.bosses.kaleidoscope;
const QUARTER = Math.PI / 2;
const EIGHTH = Math.PI / 4;

function angleToPlayer(boss, player) {
  return Math.atan2(player.y - boss.y, player.x - boss.x);
}

function telegraph(base, tempo) {
  return Math.max(0.6, base * tempo);
}

// Each attack returns how long the boss stays busy before the next one is picked.
const ATTACKS = {
  // Four lanes around the player's current spot, then a second volley rotated 45 degrees.
  lanceCross(gameState, boss, player, tempo) {
    const origin = { x: boss.x, y: boss.y };
    const base = angleToPlayer(boss, player) + EIGHTH;
    const wait = telegraph(0.9, tempo);
    const first = lanceBurst(gameState, boss, { origin, angles: [0, 1, 2, 3].map((k) => base + k * QUARTER), telegraph: wait });
    addBossTimer(gameState, wait * 0.6, () => {
      lanceBurst(gameState, boss, { origin, angles: [0, 1, 2, 3].map((k) => base + EIGHTH + k * QUARTER), telegraph: wait });
    }, boss.uid);
    return wait * 0.6 + first;
  },

  gapRing(gameState, boss, player, tempo) {
    return gapRing(gameState, boss, {
      origin: { x: boss.x, y: boss.y },
      gapCenter: angleToPlayer(boss, player),
      firstDelay: telegraph(0.9, tempo),
      ringInterval: telegraph(0.7, tempo),
    });
  },

  // Six circles around the player detonating clockwise.
  constellation(gameState, boss, player, tempo) {
    return strikeField(gameState, boss, {
      points: ringPoints(player.x, player.y, 6, 140, Math.random() * Math.PI * 2),
      firstDelay: telegraph(0.9, tempo),
      step: 0.25 * tempo,
    });
  },

  spiralConstellation(gameState, boss, player, tempo) {
    return strikeField(gameState, boss, {
      points: spiralPoints(player.x, player.y, 9, 50, 230, 1.25, Math.random() * Math.PI * 2),
      firstDelay: telegraph(0.9, tempo),
      step: 0.22 * tempo,
      radius: 58,
    });
  },

  spiralStorm(gameState, boss, player, tempo) {
    return spiralStorm(gameState, boss, {
      origin: { x: boss.x, y: boss.y },
      baseAngle: angleToPlayer(boss, player),
      windup: telegraph(0.7, tempo),
    });
  },

  sweepBeam(gameState, boss, player, tempo) {
    const toPlayer = angleToPlayer(boss, player);
    const direction = Math.random() < 0.5 ? 1 : -1;
    const sweep = 2.1;
    return sweepBeam(gameState, boss, {
      origin: { x: boss.x, y: boss.y },
      startAngle: direction > 0 ? toPlayer - sweep * 0.5 : toPlayer + sweep * 0.5,
      sweep: sweep * direction,
      windup: telegraph(0.9, tempo),
    });
  },

  closingCage(gameState, boss, player, tempo) {
    return closingCage(gameState, boss, { center: { x: player.x, y: player.y }, telegraph: telegraph(1.0, tempo) });
  },

  comboLanceRing(gameState, boss, player, tempo) {
    const origin = { x: boss.x, y: boss.y };
    const base = angleToPlayer(boss, player) + EIGHTH;
    const lance = lanceBurst(gameState, boss, { origin, angles: [0, 1, 2, 3].map((k) => base + k * QUARTER), telegraph: telegraph(1.0, tempo) });
    const ring = gapRing(gameState, boss, {
      origin,
      gapCenter: base,
      rings: 2,
      firstDelay: telegraph(1.0, tempo),
      ringInterval: telegraph(0.8, tempo),
    });
    return Math.max(lance, ring);
  },
};

function moveBoss(boss, player, dt, phase) {
  const scratch = boss.scratch;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = hypot2(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;

  // Radial: hold the preferred distance so the whole pattern stays on screen.
  const error = distance - CONFIG.preferredDistance;
  const radial = Math.max(-1, Math.min(1, error / 80));
  let vx = nx * radial * boss.speed;
  let vy = ny * radial * boss.speed;

  // Tangential: orbit in later phases, flipping direction now and then.
  if (phase.moveStyle === "orbit") {
    scratch.orbitTimer = (scratch.orbitTimer ?? 0) - dt;
    if (scratch.orbitTimer <= 0) {
      scratch.orbitDir = Math.random() < 0.5 ? 1 : -1;
      scratch.orbitTimer = 4 + Math.random() * 3;
    }
    vx += -ny * scratch.orbitDir * boss.speed * 0.7;
    vy += nx * scratch.orbitDir * boss.speed * 0.7;
  }

  boss.x += vx * dt;
  boss.y += vy * dt;
}

export const kaleidoscope = {
  id: "kaleidoscope",
  name: "The Kaleidoscope",
  warningDuration: GAME_CONFIG.bosses.warningDuration,
  transitionDuration: CONFIG.transitionDuration,
  spawnModifier: CONFIG.spawnModifier,
  arena: CONFIG.arena,

  create(gameState, difficulty, x, y) {
    const hp = CONFIG.hpBase + difficulty * CONFIG.hpDifficultyScale;
    return {
      type: "boss",
      x,
      y,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      speed: CONFIG.speed,
      radius: CONFIG.radius,
      color: CONFIG.color,
      contactDamage: CONFIG.contactDamage,
      xp: CONFIG.xp,
      bulletDamage: CONFIG.bulletDamage + difficulty * 0.3,
      strikeDamage: CONFIG.strikeDamage + difficulty * 0.4,
      beamTickDamage: CONFIG.beamTickDamage + difficulty * 0.2,
      bulletColor: CONFIG.bulletColor,
      bulletAltColor: CONFIG.bulletAltColor,
      pickupDropMultiplier: 6,
    };
  },

  phases: [
    { name: "Prism", hpBelow: 1, tint: "#c58cff", moveStyle: "approach", tempo: 1, gap: 1.4, attacks: ["lanceCross", "gapRing", "constellation"] },
    {
      name: "Fracture",
      hpBelow: 0.66,
      tint: "#ff8ce6",
      moveStyle: "orbit",
      tempo: 0.9,
      gap: 1.1,
      attacks: ["spiralStorm", "gapRing", "sweepBeam", "lanceCross", "constellation"],
    },
    {
      name: "Shatter",
      hpBelow: 0.33,
      tint: "#ff5a7a",
      moveStyle: "orbit",
      tempo: 0.8,
      gap: 0.8,
      attacks: ["comboLanceRing", "closingCage", "sweepBeam", "spiralConstellation", "spiralStorm"],
      spawnModifier: { spawnRateMultiplier: 0.6, maxEnemiesMultiplier: 0.7, allowedTypes: ["chaser"] },
    },
  ],

  update({ gameState, boss, player, dt, phase }) {
    moveBoss(boss, player, dt, phase);
    if (boss.invulnerableTimer > 0) {
      return;
    }

    const scratch = boss.scratch;
    scratch.cooldown = (scratch.cooldown ?? 1.5) - dt;
    if (scratch.cooldown > 0) {
      return;
    }

    const attackId = phase.attacks[(scratch.cycle ?? 0) % phase.attacks.length];
    scratch.cycle = (scratch.cycle ?? 0) + 1;
    const busyFor = ATTACKS[attackId](gameState, boss, player, phase.tempo);
    scratch.cooldown = busyFor + phase.gap;
  },
};
