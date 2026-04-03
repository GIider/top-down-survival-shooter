import { PERK_HOOKS } from "../contracts.js";

function handles(perkId, expectedPerkId) {
  return perkId === expectedPerkId;
}

const blinkAimBehind = {
  id: "blink-aim-behind",
  hooks: {
    [PERK_HOOKS.onBlinkDirectionCompute](context) {
      context.dirX *= -1;
      context.dirY *= -1;
    },
  },
};

const blinkTargetExplosion = {
  id: "blink-target-explosion",
  hooks: {
    [PERK_HOOKS.onBlinkEffectsCompute](context) {
      context.explodeTarget = true;
    },
  },
};

const blinkSourceExplosion = {
  id: "blink-source-explosion",
  hooks: {
    [PERK_HOOKS.onBlinkEffectsCompute](context) {
      context.explodeSource = true;
    },
  },
};

const blinkReload = {
  id: "blink-reload",
  hooks: {
    [PERK_HOOKS.onBlinkEffectsCompute](context) {
      context.reloadGun = true;
    },
  },
};

const blinkFireTrail = {
  id: "blink-fire-trail",
  hooks: {
    [PERK_HOOKS.onBlinkEffectsCompute](context) {
      context.spawnFireTrail = true;
    },
  },
};

const blinkIceTrail = {
  id: "blink-ice-trail",
  hooks: {
    [PERK_HOOKS.onBlinkEffectsCompute](context) {
      context.spawnIceTrail = true;
    },
  },
};

const blinkSwordKensei = {
  id: "blink-sword-kensei",
  hooks: {
    [PERK_HOOKS.onBlinkEffectsCompute](context) {
      context.swordStrike = true;
    },
  },
};

const blinkThreeCharges = {
  id: "blink-three-charges",
  hooks: {
    [PERK_HOOKS.onPerkApplied](context) {
      if (!handles(context.perkId, "blink-three-charges")) {
        return;
      }
      const player = context.player;
      player.blinkMaxCharges = 3;
      player.blinkCharges = Math.max(player.blinkCharges, 3);
      player.blinkChargeTimer = 0;
      player.blinkCooldownRemaining = 0;
    },
  },
};

const shoutRange = {
  id: "shout-range",
  hooks: {
    [PERK_HOOKS.onShoutCreateWave](context) {
      context.maxRadius += 90;
    },
  },
};

const shoutStun = {
  id: "shout-stun",
  hooks: {
    [PERK_HOOKS.onShoutCreateWave](context) {
      context.stunDuration += 0.75;
    },
  },
};

const shoutReflect = {
  id: "shout-reflect",
  hooks: {
    [PERK_HOOKS.onShoutCreateWave](context) {
      context.reflectProjectiles = true;
    },
  },
};

const shoutHalfMaxHp = {
  id: "shout-half-max-hp",
  hooks: {
    [PERK_HOOKS.onShoutCreateWave](context) {
      context.dealHalfMaxHp = true;
    },
  },
};

const shoutHealPerEnemy = {
  id: "shout-heal-per-enemy",
  hooks: {
    [PERK_HOOKS.onShoutCreateWave](context) {
      context.healPerEnemy = 10;
    },
  },
};

const fireballImpactDetonation = {
  id: "fireball-impact-detonation",
  hooks: {
    [PERK_HOOKS.onFireballCreate](context) {
      context.fireball.detonateOnImpact = true;
    },
  },
};

const fireballBiggerDetonation = {
  id: "fireball-bigger-detonation",
  hooks: {
    [PERK_HOOKS.onFireballCreate](context) {
      context.fireball.splashRadius *= 1.35;
      context.fireball.splashDamage *= 1.35;
    },
  },
};

const fireballImpactFireTrail = {
  id: "fireball-impact-fire-trail",
  hooks: {
    [PERK_HOOKS.onFireballCreate](context) {
      context.fireball.spawnFireField = true;
    },
  },
};

export const skillPerks = [
  blinkAimBehind,
  blinkTargetExplosion,
  blinkSourceExplosion,
  blinkReload,
  blinkFireTrail,
  blinkIceTrail,
  blinkSwordKensei,
  blinkThreeCharges,
  shoutRange,
  shoutStun,
  shoutReflect,
  shoutHalfMaxHp,
  shoutHealPerEnemy,
  fireballImpactDetonation,
  fireballBiggerDetonation,
  fireballImpactFireTrail,
];
