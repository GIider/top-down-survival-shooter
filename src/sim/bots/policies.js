// Bot policies. A bot is { name, startWeapon, reset?, decide(game, dt, rng), choosePerk(player, choices, rng) }.
// decide() returns { movement, aim, fire, reload, weaponSlot, blink, shout, fireball }.

const WEAPON_SLOT = { sword: 1, gun: 2, bow: 3, flail: 4 };

function norm(x, y) {
  const len = Math.hypot(x, y);
  return len > 1e-6 ? { x: x / len, y: y / len, len } : { x: 0, y: 0, len: 0 };
}

function nearest(list, px, py, getPos = (e) => e) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i += 1) {
    const p = getPos(list[i]);
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < bestD) {
      bestD = d;
      best = list[i];
    }
  }
  return best ? { item: best, dist: bestD } : null;
}

function threatVector(game, params) {
  const { gameState, player } = game;
  let fx = 0;
  let fy = 0;
  let danger = 0;
  for (const enemy of gameState.enemies) {
    if (enemy.isRespawning) continue;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = Math.max(1, Math.hypot(dx, dy) - enemy.radius - player.radius);
    if (d > params.threatRange) continue;
    const w = (params.threatRange / d) ** 1.5 * (enemy.contactDamage ? 1 : 0.5);
    fx += (dx / (d + player.radius)) * w;
    fy += (dy / (d + player.radius)) * w;
    danger += w;
  }
  if (params.dodgeProjectiles) {
    for (const p of gameState.projectiles) {
      if (p.owner !== "enemy" || !p.alive) continue;
      const rx = player.x - p.position.x;
      const ry = player.y - p.position.y;
      const dist = Math.hypot(rx, ry);
      if (dist > 260) continue;
      const v = norm(p.velocity.x, p.velocity.y);
      const along = rx * v.x + ry * v.y;
      if (along < 0) continue;
      const side = rx * -v.y + ry * v.x; // signed lateral offset
      if (Math.abs(side) > player.radius + p.radius + 22) continue;
      // sidestep perpendicular to the bullet path
      const s = side >= 0 ? 1 : -1;
      const w = (260 - dist) / 26;
      fx += -v.y * s * w;
      fy += v.x * s * w;
      danger += w;
    }
    for (const ind of gameState.indicators) {
      const pos = ind.position;
      const r = ind.size?.radius;
      if (!pos || !r) continue;
      const dx = player.x - pos.x;
      const dy = player.y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d > r + 50) continue;
      const w = 14;
      const n = norm(dx || 1, dy);
      fx += n.x * w;
      fy += n.y * w;
      danger += w;
    }
  }
  return { fx, fy, danger };
}

function createKiter(name, params) {
  const weaponSlot = WEAPON_SLOT[params.weapon ?? "gun"];
  let frame = 0;
  let held = { movement: { x: 0, y: 0 }, aimNoise: 0 };
  let bowCharge = 0;
  let nextPerkScore = null;

  return {
    name,
    startWeapon: weaponSlot,
    reset() {
      frame = 0;
      bowCharge = 0;
      held = { movement: { x: 0, y: 0 }, aimNoise: 0 };
      nextPerkScore = null;
    },
    decide(game, dt, rng) {
      const { gameState, player, weaponSystem } = game;
      frame += 1;
      const reactEvery = Math.max(1, Math.round(params.reactionSec / dt));
      const target = nearest(gameState.enemies.filter((e) => !e.isRespawning), player.x, player.y);
      const out = { fire: false, movement: held.movement, aim: { x: player.x + 1, y: player.y } };

      // Re-plan movement at the bot's reaction rate.
      if (frame % reactEvery === 1 || reactEvery === 1) {
        const threat = threatVector(game, params);
        let mx = threat.fx;
        let my = threat.fy;
        // seek heal drops / pickups when not in heavy danger
        if (threat.danger < params.seekBelowDanger) {
          const pickups = [...(gameState.drops ?? []), ...(gameState.pickups ?? [])];
          const near = nearest(pickups, player.x, player.y, (p) => p.position);
          if (near && near.dist < params.seekRange) {
            const n = norm(near.item.position.x - player.x, near.item.position.y - player.y);
            mx += n.x * 4;
            my += n.y * 4;
          }
        }
        // melee bots close in when it's calm
        if (params.weapon === "sword" && target && threat.danger < params.engageBelowDanger) {
          const n = norm(target.item.x - player.x, target.item.y - player.y);
          mx += n.x * 6;
          my += n.y * 6;
        }
        if (params.strafe && target) {
          const n = norm(target.item.x - player.x, target.item.y - player.y);
          mx += -n.y * 1.5;
          my += n.x * 1.5;
        }
        const m = norm(mx, my);
        held = {
          movement: m.len > 0.3 ? { x: m.x, y: m.y } : { x: 0, y: 0 },
          aimNoise: (rng() - 0.5) * 2 * params.aimNoise,
        };
        out.movement = held.movement;
      }

      if (target) {
        let ax = target.item.x;
        let ay = target.item.y;
        if (params.leadTargets) {
          const t = target.dist / 700;
          ax += (target.item.vx || 0) * t;
          ay += (target.item.vy || 0) * t;
        }
        const ang = Math.atan2(ay - player.y, ax - player.x) + held.aimNoise;
        const reach = Math.max(60, target.dist);
        out.aim = { x: player.x + Math.cos(ang) * reach, y: player.y + Math.sin(ang) * reach };

        const inRange = params.weapon === "sword" ? target.dist < 120 : target.dist < 520;
        if (params.weapon === "bow") {
          // charge to the perfect window (~0.75s) when skilled, otherwise release at random
          if (inRange) {
            bowCharge += dt;
            const releaseAt = params.perfectTiming ? 0.75 : 0.25 + rng() * 0.9;
            if (bowCharge >= releaseAt) {
              out.fire = false;
              bowCharge = 0;
            } else {
              out.fire = true;
            }
          } else {
            bowCharge = 0;
          }
        } else if (params.weapon === "flail") {
          const swing = frame * dt * 5;
          out.aim = { x: target.item.x + Math.cos(swing) * 90, y: target.item.y + Math.sin(swing) * 90 };
        } else {
          out.fire = inRange;
        }
      }

      // gun housekeeping
      if (weaponSystem.isGunSelected() && !weaponSystem.isReloading) {
        const empty = weaponSystem.currentAmmo <= 0;
        const lowAndSafe = weaponSystem.currentAmmo <= 3 && (!target || target.dist > 350);
        if (empty || lowAndSafe) out.reload = true;
      }

      // skills
      if (params.useSkills && target) {
        const near = gameState.enemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) < 160).length;
        const hpRatio = player.hp / Math.max(1, player.maxHp);
        if (near >= params.shoutAt && player.shoutCooldownRemaining <= 0) out.shout = true;
        if (target.dist > 120 && player.fireballCooldownRemaining <= 0 && rng() < 0.2) out.fireball = true;
        if ((hpRatio < 0.5 || near >= params.blinkAt) && player.blinkCharges >= 1) {
          // blink directly away from the threat centroid
          const t = threatVector(game, params);
          const n = norm(t.fx, t.fy);
          if (n.len > 0) {
            out.aim = { x: player.x + n.x * 220, y: player.y + n.y * 220 };
            out.blink = true;
            out.fire = false;
          }
        }
      }
      return out;
    },
    choosePerk(player, choices, rng) {
      if (params.perks === "first") return 0;
      if (params.perks === "synergy") {
        const own = params.weapon ?? "gun";
        const scored = choices.map((c, i) => ({
          i,
          s: (c.id.startsWith(own) ? 3 : 0) + (c.id.startsWith("shared") || c.id.startsWith("pickup") || c.id.startsWith("utility") ? 1 : 0) + rng(),
        }));
        scored.sort((a, b) => b.s - a.s);
        return scored[0].i;
      }
      return Math.floor(rng() * choices.length);
    },
  };
}

export const IDLE_BOT = {
  name: "idle",
  startWeapon: 2,
  decide: () => ({}),
  choosePerk: () => 0,
};

const TIERS = {
  novice: {
    reactionSec: 0.35, aimNoise: 0.45, threatRange: 140, dodgeProjectiles: false, seekBelowDanger: 4, seekRange: 150,
    engageBelowDanger: 2, strafe: false, leadTargets: false, perfectTiming: false, useSkills: false,
    shoutAt: 99, blinkAt: 99, perks: "first",
  },
  average: {
    reactionSec: 0.15, aimNoise: 0.18, threatRange: 200, dodgeProjectiles: true, seekBelowDanger: 6, seekRange: 260,
    engageBelowDanger: 4, strafe: true, leadTargets: false, perfectTiming: false, useSkills: true,
    shoutAt: 5, blinkAt: 7, perks: "random",
  },
  expert: {
    reactionSec: 1 / 60, aimNoise: 0.03, threatRange: 260, dodgeProjectiles: true, seekBelowDanger: 8, seekRange: 400,
    engageBelowDanger: 6, strafe: true, leadTargets: true, perfectTiming: true, useSkills: true,
    shoutAt: 4, blinkAt: 6, perks: "synergy",
  },
};

export function createBot(spec) {
  if (spec === "idle") return IDLE_BOT;
  const [tierName, weapon = "gun"] = spec.split(":");
  const tier = TIERS[tierName];
  if (!tier) throw new Error(`Unknown bot tier "${tierName}" (idle | novice | average | expert)[:sword|gun|bow|flail]`);
  if (!(weapon in WEAPON_SLOT)) throw new Error(`Unknown weapon "${weapon}"`);
  return createKiter(`${tierName}:${weapon}`, { ...tier, weapon });
}

export function createForcedPerkBot(baseSpec, perkId) {
  const base = createBot(baseSpec);
  return {
    ...base,
    name: `${base.name}+${perkId}`,
    choosePerk(player, choices, rng) {
      const i = choices.findIndex((c) => c.id === perkId);
      return i >= 0 ? i : base.choosePerk(player, choices, rng);
    },
  };
}
