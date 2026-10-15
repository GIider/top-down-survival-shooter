import { GAME_CONFIG } from "../../core/constants.js";
import { chargeDash, gapRing, groundSlam, ringPoints, strikeField } from "./bossPatterns.js";
import { hypot2 } from "../../core/mathUtil.js";

const CONFIG = GAME_CONFIG.bosses.juggernaut;
const PHASE_SPEED = [1, 1.25, 1.5];

function angleToPlayer(boss, player) {
  return Math.atan2(player.y - boss.y, player.x - boss.x);
}

function telegraph(base, tempo) {
  return Math.max(0.55, base * tempo);
}

// Each attack returns how long the boss stays busy before the next one is picked.
const ATTACKS = {
  dash(gameState, boss, player, tempo) {
    return chargeDash(gameState, boss, { angle: angleToPlayer(boss, player), telegraph: telegraph(0.9, tempo) });
  },

  // Three dashes in a row, each re-aimed at the player's position when the previous one lands.
  tripleDash(gameState, boss, player, tempo) {
    boss.scratch.chain = 2;
    return chargeDash(gameState, boss, { angle: angleToPlayer(boss, player), telegraph: telegraph(0.8, tempo) });
  },

  slam(gameState, boss, player, tempo) {
    return groundSlam(gameState, boss, { center: { x: player.x, y: player.y }, telegraph: telegraph(1.0, tempo) });
  },

  // Slam, then debris raining around the impact.
  slamDebris(gameState, boss, player, tempo) {
    const center = { x: player.x, y: player.y };
    const slam = groundSlam(gameState, boss, { center, telegraph: telegraph(1.0, tempo) });
    const debris = strikeField(gameState, boss, {
      points: ringPoints(center.x, center.y, 6, 230, Math.random() * Math.PI * 2),
      firstDelay: telegraph(1.0, tempo) + 0.3,
      step: 0.18 * tempo,
    });
    return Math.max(slam, debris);
  },

  quakeRing(gameState, boss, player, tempo) {
    return gapRing(gameState, boss, {
      origin: { x: boss.x, y: boss.y },
      gapCenter: angleToPlayer(boss, player),
      rings: 2,
      speed: 240,
      firstDelay: telegraph(0.9, tempo),
      ringInterval: telegraph(0.6, tempo),
    });
  },
};

function moveBoss(gameState, boss, player, dt, phase) {
  const scratch = boss.scratch;

  if (scratch.dash) {
    const dash = scratch.dash;
    const step = Math.min(dash.remaining, dt);
    boss.x += dash.dx * dash.speed * step;
    boss.y += dash.dy * dash.speed * step;
    dash.remaining -= dt;
    if (dash.remaining <= 0) {
      scratch.dash = null;
      boss.contactDamage = boss.baseContactDamage;
      dash.onEnd();
      // Chained dash: re-aim immediately.
      if (scratch.chain > 0) {
        scratch.chain -= 1;
        const next = ATTACKS.dash(gameState, boss, player, phase.tempo);
        scratch.cooldown = next + phase.gap;
      }
    } else {
      boss.contactDamage = boss.baseContactDamage * CONFIG.dashContactMultiplier;
    }
    return;
  }

  if (scratch.rootTimer > 0) {
    scratch.rootTimer -= dt;
    return;
  }

  // Relentless chase; slows while winding up other attacks is handled by cooldown gaps.
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = hypot2(dx, dy) || 1;
  const speed = boss.speed * PHASE_SPEED[boss.phaseIndex] * (distance < boss.radius + 40 ? 0.4 : 1);
  boss.x += (dx / distance) * speed * dt;
  boss.y += (dy / distance) * speed * dt;
}

export const juggernaut = {
  id: "juggernaut",
  name: "The Juggernaut",
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
      baseContactDamage: CONFIG.contactDamage,
      xp: CONFIG.xp,
      bulletDamage: CONFIG.bulletDamage + difficulty * 0.3,
      strikeDamage: CONFIG.strikeDamage + difficulty * 0.4,
      beamTickDamage: 0,
      bulletColor: CONFIG.bulletColor,
      bulletAltColor: CONFIG.bulletAltColor,
      pickupDropMultiplier: 6,
    };
  },

  phases: [
    { name: "Rampage", hpBelow: 1, tint: "#ff9a5a", tempo: 1, gap: 1.6, attacks: ["dash", "slam", "dash", "quakeRing"] },
    {
      name: "Enrage",
      hpBelow: 0.6,
      tint: "#ff6a3a",
      tempo: 0.9,
      gap: 1.2,
      attacks: ["tripleDash", "slamDebris", "dash", "quakeRing"],
    },
    {
      name: "Berserk",
      hpBelow: 0.3,
      tint: "#ff3a3a",
      tempo: 0.8,
      gap: 0.8,
      attacks: ["tripleDash", "slamDebris", "quakeRing", "tripleDash"],
      spawnModifier: { spawnRateMultiplier: 0.7, maxEnemiesMultiplier: 0.8, allowedTypes: ["chaser", "slime"] },
    },
  ],

  update({ gameState, boss, player, dt, phase }) {
    if (boss.invulnerableTimer > 0) {
      // Phase transition: cancel any dash in flight.
      boss.scratch.dash = null;
      boss.scratch.chain = 0;
      boss.scratch.rootTimer = 0;
      boss.contactDamage = boss.baseContactDamage;
      return;
    }
    moveBoss(gameState, boss, player, dt, phase);

    const scratch = boss.scratch;
    scratch.cooldown = (scratch.cooldown ?? 1.5) - dt;
    if (scratch.cooldown > 0 || scratch.dash || scratch.rootTimer > 0) {
      return;
    }

    const attackId = phase.attacks[(scratch.cycle ?? 0) % phase.attacks.length];
    scratch.cycle = (scratch.cycle ?? 0) + 1;
    const busyFor = ATTACKS[attackId](gameState, boss, player, phase.tempo);
    scratch.cooldown = busyFor + phase.gap;
  },
};
