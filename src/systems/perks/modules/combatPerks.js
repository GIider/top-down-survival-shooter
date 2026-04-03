import { PERK_HOOKS } from "../contracts.js";

function hasTag(damageSource, tag) {
  return Array.isArray(damageSource?.tags) && damageSource.tags.includes(tag);
}

const gunTripleShot = {
  id: "gun-triple-shot",
  priority: 90,
  hooks: {
    [PERK_HOOKS.onWeaponFireRequest](context) {
      context.shots = [
        { angleOffset: -0.14, reverse: false },
        { angleOffset: 0, reverse: false },
        { angleOffset: 0.14, reverse: false },
      ];
    },
  },
};

const gunBackwardShot = {
  id: "gun-backward-shot",
  priority: 100,
  hooks: {
    [PERK_HOOKS.onWeaponFireRequest](context) {
      const expanded = [];
      for (let i = 0; i < context.shots.length; i += 1) {
        const shot = context.shots[i];
        expanded.push(shot);
        expanded.push({ ...shot, reverse: true });
      }
      context.shots = expanded;
    },
  },
};

const gunBouncingBullets = {
  id: "gun-bouncing-bullets",
  hooks: {
    [PERK_HOOKS.onProjectileCreate](context) {
      if (context.weaponType !== "gun" || !context.projectile?.isGunBullet) {
        return;
      }
      context.projectile.bounceRemaining = 3;
    },
  },
};

const bowRicochetChain = {
  id: "bow-ricochet-chain",
  hooks: {
    [PERK_HOOKS.onProjectileCreate](context) {
      if (context.weaponType !== "bow" || !context.projectile?.isArrow || !context.isPerfect) {
        return;
      }
      context.projectile.pierceRemaining = 0;
      context.projectile.ricochetRemaining = 5;
    },
  },
};

const bowFireArrows = {
  id: "bow-fire-arrows",
  hooks: {
    [PERK_HOOKS.onProjectileCreate](context) {
      if (context.weaponType !== "bow" || !context.projectile?.isArrow) {
        return;
      }
      context.projectile.isFireArrow = true;
    },
    [PERK_HOOKS.onDamageCompute](context) {
      if (!hasTag(context.damageSource, "arrow")) {
        return;
      }
      context.damage *= 1.25;
    },
  },
};

const stunnedTargetDamage = {
  id: "utility-stunned-target-damage",
  hooks: {
    [PERK_HOOKS.onDamageCompute](context) {
      if ((context.target?.stunnedTimer || 0) > 0) {
        context.damage *= 1.5;
      }
    },
  },
};

const gunKillReload = {
  id: "gun-kill-reload",
  hooks: {
    [PERK_HOOKS.onEnemyKilled](context) {
      if (context.damageSource?.sourceType !== "gunProjectile") {
        return;
      }
      const weaponSystem = context.gameState.systems.weaponSystem;
      if (!weaponSystem) {
        return;
      }
      const maxAmmo = weaponSystem.getMagazineSize(context.player);
      weaponSystem.currentAmmo = Math.min(maxAmmo, weaponSystem.currentAmmo + 1);
      if (typeof weaponSystem.showAmmoBar === "function") {
        weaponSystem.showAmmoBar();
      }
    },
  },
};

const bowKillReload = {
  id: "bow-kill-reload",
  hooks: {
    [PERK_HOOKS.onEnemyKilled](context) {
      if (context.damageSource?.sourceType !== "arrowProjectile") {
        return;
      }
      const weaponSystem = context.gameState.systems.weaponSystem;
      if (!weaponSystem) {
        return;
      }
      weaponSystem.bowReloadTimer = 0;
      if (!weaponSystem.bowCharging) {
        weaponSystem.state = "ready";
      }
    },
  },
};

const meleeSkillCooldownKill = {
  id: "melee-skill-cooldown-kill",
  hooks: {
    [PERK_HOOKS.onEnemyKilled](context) {
      if (context.damageSource?.sourceType !== "meleeSwing") {
        return;
      }
      const player = context.player;
      player.shoutCooldownRemaining *= 0.9;
      player.fireballCooldownRemaining *= 0.9;
      player.blinkCooldownRemaining *= 0.9;
      player.blinkChargeTimer *= 0.9;
    },
  },
};

export const combatPerks = [
  gunTripleShot,
  gunBackwardShot,
  gunBouncingBullets,
  bowRicochetChain,
  bowFireArrows,
  stunnedTargetDamage,
  gunKillReload,
  bowKillReload,
  meleeSkillCooldownKill,
];
