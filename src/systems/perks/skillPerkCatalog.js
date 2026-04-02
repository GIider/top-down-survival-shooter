export const skillPerkCatalog = [
  {
    id: "blink-aim-behind",
    name: "Backstep Vector",
    description: "Blink aims 180 degrees behind your cursor.",
    tags: ["blink"],
    apply(player) {
      player.blinkAimsBehind = true;
    },
  },
  {
    id: "blink-target-explosion",
    name: "Blink Implosion",
    description: "Blink creates a stun explosion at the target location.",
    tags: ["blink"],
    apply(player) {
      player.blinkExplosionAtTarget = true;
    },
  },
  {
    id: "blink-source-explosion",
    name: "Blink Echo",
    description: "Blink creates a stun explosion at your source location.",
    tags: ["blink"],
    apply(player) {
      player.blinkExplosionAtSource = true;
    },
  },
  {
    id: "blink-reload",
    name: "Tactical Warp",
    description: "Blinking instantly reloads your gun.",
    tags: ["blink"],
    apply(player) {
      player.blinkReloadsGun = true;
    },
  },
  {
    id: "blink-fire-trail",
    name: "Scorch Line",
    description: "Blink leaves a lingering fire trail that damages enemies.",
    tags: ["blink", "fire"],
    apply(player) {
      player.blinkLeavesFireTrail = true;
    },
  },
  {
    id: "blink-ice-trail",
    name: "Frost Line",
    description: "Blink leaves a lingering ice trail that slows enemies.",
    tags: ["blink", "ice"],
    apply(player) {
      player.blinkLeavesIceTrail = true;
    },
  },
  {
    id: "blink-three-charges",
    name: "Triple Blink",
    description: "Blink gains 3 charges and regenerates one per cooldown.",
    tags: ["blink"],
    apply(player) {
      player.blinkMaxCharges = 3;
      player.blinkCharges = Math.max(player.blinkCharges, 3);
      player.blinkChargeTimer = 0;
      player.blinkCooldownRemaining = 0;
    },
  },
  {
    id: "shout-range",
    name: "Resonant Cone",
    description: "Increase shout range.",
    tags: ["shout"],
    apply(player) {
      player.shoutRangeBonus += 90;
    },
  },
  {
    id: "shout-stun",
    name: "Concussive Voice",
    description: "Increase shout stun duration.",
    tags: ["shout"],
    apply(player) {
      player.shoutStunDurationBonus += 0.75;
    },
  },
  {
    id: "shout-reflect",
    name: "Reflective Chorus",
    description: "Shout reflects enemy projectiles.",
    tags: ["shout"],
    apply(player) {
      player.shoutReflectProjectiles = true;
    },
  },
  {
    id: "fireball-impact-detonation",
    name: "Impact Burst",
    description: "Fireball detonates on enemy impact.",
    tags: ["fireball", "fire"],
    apply(player) {
      player.fireballDetonateOnImpact = true;
    },
  },
  {
    id: "fireball-bigger-detonation",
    name: "Overpressure Core",
    description: "Fireball detonation radius and damage are increased.",
    tags: ["fireball", "fire"],
    apply(player) {
      player.fireballDetonationRadiusMultiplier *= 1.35;
      player.fireballDetonationDamageMultiplier *= 1.35;
    },
  },
  {
    id: "fireball-impact-fire-trail",
    name: "Cinder Field",
    description: "Fireball detonation spawns a lingering fire field.",
    tags: ["fireball", "fire"],
    apply(player) {
      player.fireballSpawnsFireField = true;
    },
  },
  {
    id: "gun-triple-shot",
    name: "Scatter Cylinder",
    description: "Gun fires a spread of 3 bullets per shot.",
    tags: ["gun"],
    apply(player) {
      player.gunTripleShot = true;
    },
  },
  {
    id: "gun-perfect-window",
    name: "Calibrated Timing",
    description: "Increase gun perfect reload window by 25%.",
    tags: ["gun"],
    apply(player) {
      player.gunPerfectWindowMultiplier *= 1.25;
    },
  },
  {
    id: "gun-kill-reload",
    name: "Battle Feed",
    description: "Killing an enemy with a gun bullet restores 1 ammo.",
    tags: ["gun"],
    apply(player) {
      player.gunKillRestoresAmmo = true;
    },
  },
  {
    id: "gun-bouncing-bullets",
    name: "Ricochet Rounds",
    description: "Gun bullets bounce off enemies and mountains up to 3 times.",
    tags: ["gun"],
    apply(player) {
      player.gunBulletBounces = true;
    },
  },
  {
    id: "gun-perfect-speed",
    name: "Flow Reload",
    description: "Perfect reload grants 10% movement speed for 1 second.",
    tags: ["gun"],
    apply(player) {
      player.gunPerfectReloadMoveSpeedBoost = true;
    },
  },
  {
    id: "melee-projectile-reflect",
    name: "Deflecting Edge",
    description: "Melee slashes now reflect enemy projectiles.",
    tags: ["melee"],
    apply(player) {
      player.meleeReflectProjectiles = true;
    },
  },
  {
    id: "melee-skill-cooldown-kill",
    name: "Blade Tempo",
    description: "Melee kills reduce all skill cooldowns by 10%.",
    tags: ["melee", "utility"],
    apply(player) {
      player.swordSkillCooldownOnKill = true;
    },
  },
  {
    id: "bow-perfect-window",
    name: "Steady Draw",
    description: "Increase perfect arrow window by 25%.",
    tags: ["bow"],
    apply(player) {
      player.bowPerfectWindowMultiplier *= 1.25;
    },
  },
  {
    id: "bow-kill-reload",
    name: "Predator's Rhythm",
    description: "Arrow kills instantly finish bow reload.",
    tags: ["bow"],
    apply(player) {
      player.bowKillInstantReload = true;
    },
  },
  {
    id: "bow-ricochet-chain",
    name: "Hunting Ricochet",
    description: "Perfect arrows no longer pierce and instead bounce to closest enemy (max 5).",
    tags: ["bow"],
    apply(player) {
      player.bowRicochetToClosestEnemy = true;
    },
  },
  {
    id: "shared-laser-pointer",
    name: "Laserpointer",
    description: "Gun and bow draw a targeting laser toward your aim.",
    tags: ["gun", "bow"],
    apply(player) {
      player.weaponLaserPointer = true;
    },
  },
  {
    id: "pickup-magnet",
    name: "Vacuum Grip",
    description: "Pickups slowly move toward you.",
    tags: ["utility"],
    apply(player) {
      player.pickupMagnetEnabled = true;
    },
  },
  {
    id: "pickup-global-cooldown-reduction",
    name: "Supply Chain",
    description: "Reduce pickup global cooldown timers by 20%.",
    tags: ["utility"],
    apply(player) {
      player.pickupGlobalCooldownMultiplier *= 0.8;
    },
  },
];
