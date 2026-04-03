import { PERK_HOOKS } from "../contracts.js";

const gunPerfectWindow = {
  id: "gun-perfect-window",
  hooks: {
    [PERK_HOOKS.onPerfectWindowCompute](context) {
      if (context.weaponType !== "gun") {
        return;
      }
      context.multiplier *= 1.25;
    },
  },
};

const bowPerfectWindow = {
  id: "bow-perfect-window",
  hooks: {
    [PERK_HOOKS.onPerfectWindowCompute](context) {
      if (context.weaponType !== "bow") {
        return;
      }
      context.multiplier *= 1.25;
    },
  },
};

const gunPerfectSpeed = {
  id: "gun-perfect-speed",
  hooks: {
    [PERK_HOOKS.onPerfectReloadSuccess](context) {
      context.player.perfectReloadMoveBoostTimer = Math.max(context.player.perfectReloadMoveBoostTimer || 0, 1);
    },
  },
};

const meleeProjectileReflect = {
  id: "melee-projectile-reflect",
  hooks: {
    [PERK_HOOKS.onMeleeReflectQuery](context) {
      context.enabled = true;
    },
  },
};

const sharedLaserPointer = {
  id: "shared-laser-pointer",
  hooks: {
    [PERK_HOOKS.onRenderReticleCompute](context) {
      if (context.weaponType === "gun" || context.weaponType === "bow") {
        context.enableLaser = true;
      }
    },
  },
};

const pickupMagnet = {
  id: "pickup-magnet",
  hooks: {
    [PERK_HOOKS.onPickupMagnetQuery](context) {
      context.enabled = true;
    },
  },
};

const pickupGlobalCooldownReduction = {
  id: "pickup-global-cooldown-reduction",
  hooks: {
    [PERK_HOOKS.onPickupGlobalCooldownCompute](context) {
      context.multiplier *= 0.8;
    },
  },
};

const utilityRegenHalfHp = {
  id: "utility-regen-half-hp",
  hooks: {
    [PERK_HOOKS.onPlayerRuntimeUpdate](context) {
      context.regenToHalfMaxHpPerSecond += 0.03;
    },
  },
};

export const utilityPerks = [
  gunPerfectWindow,
  bowPerfectWindow,
  gunPerfectSpeed,
  meleeProjectileReflect,
  sharedLaserPointer,
  pickupMagnet,
  pickupGlobalCooldownReduction,
  utilityRegenHalfHp,
];
