import { GAME_CONFIG } from "../../core/constants.js";
import { createProjectile } from "../../entities/projectile.js";
import { spawnIndicator } from "../indicatorSystem.js";
import { damagePlayer } from "../enemies/common.js";
import { playSfx } from "../../audio/sfx.js";
import { addBossEmitter, addBossTimer, ensureBossState } from "./bossState.js";
import { hypot2 } from "../../core/mathUtil.js";

// Reusable bullet-hell building blocks. Every attack = telegraph (indicator) -> onTrigger spawns bullets/damage.
// Each primitive returns how long (seconds) the attack keeps the boss "busy".

const BOSS_CONFIG = GAME_CONFIG.bosses;
const TAU = Math.PI * 2;
const TELEGRAPH_COLORS = {
  danger: "255,70,110",
  gap: "110,255,170",
  ray: "255,111,233",
};

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

export function fireBossBullet(gameState, boss, x, y, angle, speed, { radius = 7, lifetime = 3.5, color = null, damage = null } = {}) {
  if (gameState.projectiles.length >= BOSS_CONFIG.maxBullets) {
    return null;
  }
  const projectile = createProjectile({
    position: { x, y },
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    damage: damage ?? boss.bulletDamage,
    lifetime,
    owner: "enemy",
    color: color ?? boss.bulletColor,
    radius,
    modifiers: [],
    source: "boss",
    bossUid: boss.uid,
    ignoreTerrain: true,
  });
  gameState.projectiles.push(projectile);
  return projectile;
}

export function ringPoints(cx, cy, count, radius, startAngle = 0) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const angle = startAngle + (TAU * i) / count;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
}

export function spiralPoints(cx, cy, count, innerRadius, outerRadius, turns = 1, startAngle = 0) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0 : i / (count - 1);
    const angle = startAngle + TAU * turns * t;
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
}

// Straight bullet streams down telegraphed lanes. Stand between the lanes.
export function lanceBurst(gameState, boss, { origin, angles, width = 48, length = 950, telegraph = 0.9, speed = 900, streamDuration = 0.4, interval = 0.035 }) {
  angles.forEach((angle, index) => {
    spawnIndicator(gameState.indicators, {
      type: "rect",
      position: { x: origin.x, y: origin.y },
      angle,
      length,
      size: { radius: 0 },
      width,
      duration: telegraph,
      source: "boss",
      owner: boss.uid,
      color: TELEGRAPH_COLORS.danger,
      onTrigger() {
        if (index === 0) {
          playSfx("enemyShoot", { volume: 0.7 });
        }
        addBossEmitter(gameState, {
          owner: boss.uid,
          duration: streamDuration,
          interval,
          fire() {
            fireBossBullet(gameState, boss, origin.x, origin.y, angle, speed, { radius: 8, lifetime: length / speed + 0.1, color: boss.bulletAltColor });
          },
        });
      },
    });
  });
  return telegraph + streamDuration;
}

// Rings of bullets with one telegraphed safe wedge each. All gaps are shown up front so the player can plan a route.
export function gapRing(gameState, boss, { origin, gapCenter, gapWidth = 0.7, count = 36, speed = 210, rings = 3, firstDelay = 0.9, ringInterval = 0.7, gapShift = 0.7 }) {
  for (let ring = 0; ring < rings; ring += 1) {
    const center = gapCenter + ring * gapShift * (ring % 2 === 0 ? 1 : -1.6);
    const delay = firstDelay + ring * ringInterval;
    spawnIndicator(gameState.indicators, {
      type: "wedge",
      position: { x: origin.x, y: origin.y },
      angle: center,
      arc: gapWidth,
      size: { radius: 460 },
      duration: delay,
      source: "boss",
      owner: boss.uid,
      color: TELEGRAPH_COLORS.gap,
      onTrigger() {
        playSfx("enemyShoot", { volume: 0.6 });
        for (let i = 0; i < count; i += 1) {
          const angle = (TAU * i) / count + 0.03;
          if (angleDiff(angle, center) < gapWidth * 0.5) {
            continue;
          }
          fireBossBullet(gameState, boss, origin.x, origin.y, angle, speed, { radius: 7, color: ring % 2 === 0 ? boss.bulletColor : boss.bulletAltColor });
        }
      },
    });
  }
  return firstDelay + (rings - 1) * ringInterval + 0.2;
}

// Mortar-style circles detonating in order. `points` define the shape (ring, spiral, line...).
export function strikeField(gameState, boss, { points, radius = 64, firstDelay = 0.9, step = 0.25, damage = boss.strikeDamage }) {
  const player = gameState.player;
  points.forEach((point, index) => {
    spawnIndicator(gameState.indicators, {
      type: "circle",
      position: { x: point.x, y: point.y },
      size: { radius },
      duration: firstDelay + index * step,
      source: "boss",
      owner: boss.uid,
      color: TELEGRAPH_COLORS.danger,
      onTrigger() {
        playSfx("explosion", { volume: 0.5 });
        if (hypot2(player.x - point.x, player.y - point.y) <= radius + player.radius * 0.5) {
          damagePlayer(gameState, player, damage);
        }
        gameState.effects.push(
          { x: point.x, y: point.y, radius: 14, elapsed: 0, duration: 0.34, growth: 34, color: "255, 120, 200" },
          { x: point.x, y: point.y, radius: radius * 0.6, elapsed: 0, duration: 0.45, growth: 12, color: "255, 200, 245" }
        );
      },
    });
  });
  return firstDelay + points.length * step;
}

// Rotating spiral arms. Windup rays preview where each arm starts; rotation reverses halfway through.
export function spiralStorm(gameState, boss, { origin, arms = 3, duration = 4, interval = 0.07, speed = 250, rotationSpeed = 0.9, windup = 0.7, baseAngle = 0 }) {
  for (let arm = 0; arm < arms; arm += 1) {
    spawnIndicator(gameState.indicators, {
      type: "rect",
      position: { x: origin.x, y: origin.y },
      angle: baseAngle + (TAU * arm) / arms,
      length: 700,
      width: 8,
      size: { radius: 0 },
      duration: windup,
      source: "boss",
      owner: boss.uid,
      color: TELEGRAPH_COLORS.ray,
    });
  }

  addBossTimer(gameState, windup, () => {
    addBossEmitter(gameState, {
      owner: boss.uid,
      duration,
      interval,
      fire(elapsed) {
        const half = duration * 0.5;
        const sweep = elapsed < half ? elapsed : half - (elapsed - half);
        const rotation = baseAngle + rotationSpeed * sweep;
        for (let arm = 0; arm < arms; arm += 1) {
          fireBossBullet(gameState, boss, origin.x, origin.y, rotation + (TAU * arm) / arms, speed, {
            radius: 6,
            lifetime: 3.2,
            color: arm % 2 === 0 ? boss.bulletColor : boss.bulletAltColor,
          });
        }
      },
    });
  }, boss.uid);
  return windup + duration;
}

// Wide rotating beam; the swept arc is telegraphed first. Outrun it or blink through.
export function sweepBeam(gameState, boss, { origin, startAngle, sweep = 2.1, duration = 2, windup = 0.9, width = 30, length = 700, tickInterval = 0.2, tickDamage = boss.beamTickDamage }) {
  const state = ensureBossState(gameState);
  const player = gameState.player;
  spawnIndicator(gameState.indicators, {
    type: "wedge",
    position: { x: origin.x, y: origin.y },
    angle: startAngle + sweep * 0.5,
    arc: sweep,
    size: { radius: length },
    duration: windup,
    source: "boss",
    owner: boss.uid,
    color: TELEGRAPH_COLORS.danger,
    onTrigger() {
      playSfx("explosion", { volume: 0.4 });
      const beam = { x: origin.x, y: origin.y, angle: startAngle, length, width, owner: boss.uid };
      state.beams.push(beam);
      let tickTimer = 0;
      addBossEmitter(gameState, {
        owner: boss.uid,
        duration,
        update(dt, elapsed) {
          beam.angle = startAngle + sweep * (elapsed / duration);
          tickTimer += dt;
          if (tickTimer < tickInterval) {
            return;
          }
          tickTimer -= tickInterval;
          const dx = Math.cos(beam.angle);
          const dy = Math.sin(beam.angle);
          const along = Math.max(0, Math.min(length, (player.x - beam.x) * dx + (player.y - beam.y) * dy));
          const dist = hypot2(player.x - (beam.x + dx * along), player.y - (beam.y + dy * along));
          if (dist <= width * 0.5 + player.radius * 0.6) {
            damagePlayer(gameState, player, tickDamage, { shake: 1.2, flash: 0.12 });
          }
        },
        onEnd() {
          const index = state.beams.indexOf(beam);
          if (index >= 0) {
            state.beams.splice(index, 1);
          }
        },
      });
    },
  });
  return windup + duration;
}

// Ring of bullets that contracts toward `center`, with telegraphed exits. Radius is viewport-limited.
export function closingCage(gameState, boss, { center, radius = 320, count = 56, gaps = 2, gapWidth = 0.6, speed = 110, telegraph = 1.0 }) {
  const gapOffset = Math.random() * TAU;
  const gapAngles = [];
  for (let g = 0; g < gaps; g += 1) {
    gapAngles.push(gapOffset + (TAU * g) / gaps);
  }

  spawnIndicator(gameState.indicators, {
    type: "ring",
    position: { x: center.x, y: center.y },
    size: { radius, thickness: 10 },
    duration: telegraph,
    source: "boss",
    owner: boss.uid,
    color: TELEGRAPH_COLORS.danger,
    onTrigger() {
      playSfx("enemyShoot", { volume: 0.7 });
      for (let i = 0; i < count; i += 1) {
        const angle = gapOffset + (TAU * i) / count;
        if (gapAngles.some((gap) => angleDiff(angle, gap) < gapWidth * 0.5)) {
          continue;
        }
        fireBossBullet(gameState, boss, center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, angle + Math.PI, speed, {
          radius: 8,
          lifetime: radius / speed + 0.4,
          color: i % 2 === 0 ? boss.bulletColor : boss.bulletAltColor,
        });
      }
    },
  });

  // Exits are marked with green wedges for the same duration.
  gapAngles.forEach((gap) => {
    spawnIndicator(gameState.indicators, {
      type: "wedge",
      position: { x: center.x, y: center.y },
      angle: gap,
      arc: gapWidth,
      size: { radius },
      duration: telegraph,
      source: "boss",
      owner: boss.uid,
      color: TELEGRAPH_COLORS.gap,
    });
  });
  return telegraph + radius / speed * 0.6;
}

function bulletRing(gameState, boss, x, y, count, speed, offset = 0) {
  for (let i = 0; i < count; i += 1) {
    fireBossBullet(gameState, boss, x, y, offset + (TAU * i) / count, speed, {
      radius: 7,
      lifetime: 2.6,
      color: i % 2 === 0 ? boss.bulletColor : boss.bulletAltColor,
    });
  }
}

// Telegraphed lane, then the boss barrels down it (movement is driven by boss.scratch.dash, see juggernaut.js).
// Ends with a shockwave ring. Contact damage is boosted while dashing.
export function chargeDash(gameState, boss, { angle, telegraph = 0.9, distance = 620, speed = 980, width = 96, shockwaveCount = 16 }) {
  const origin = { x: boss.x, y: boss.y };
  const duration = distance / speed;
  boss.scratch.rootTimer = telegraph;
  spawnIndicator(gameState.indicators, {
    type: "rect",
    position: { x: origin.x, y: origin.y },
    angle,
    length: distance,
    size: { radius: 0 },
    width,
    duration: telegraph,
    source: "boss",
    owner: boss.uid,
    color: TELEGRAPH_COLORS.danger,
    onTrigger() {
      if (!gameState.enemies.includes(boss)) {
        return;
      }
      playSfx("enemyShoot", { volume: 0.8 });
      boss.scratch.dash = {
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        speed,
        remaining: duration,
        onEnd() {
          playSfx("explosion", { volume: 0.6 });
          bulletRing(gameState, boss, boss.x, boss.y, shockwaveCount, 260, Math.random() * TAU);
          gameState.effects.push({ x: boss.x, y: boss.y, radius: boss.radius, elapsed: 0, duration: 0.5, growth: 140, color: "255, 150, 120" });
          gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 4);
        },
      };
    },
  });
  return telegraph + duration + 0.2;
}

// Big circle on the player's position; on impact it damages inside and throws a ring of bullets outward.
export function groundSlam(gameState, boss, { center, radius = 150, telegraph = 1.0, count = 20, speed = 230 }) {
  strikeField(gameState, boss, { points: [center], radius, firstDelay: telegraph, step: 0 });
  addBossTimer(gameState, telegraph, () => {
    bulletRing(gameState, boss, center.x, center.y, count, speed, Math.random() * TAU);
    gameState.screenFx.shake = Math.min(14, gameState.screenFx.shake + 3);
  }, boss.uid);
  return telegraph + 0.4;
}
