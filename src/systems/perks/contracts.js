export const PERK_HOOKS = {
  onPerkApplied: "onPerkApplied",
  onWeaponFireRequest: "onWeaponFireRequest",
  onPerfectWindowCompute: "onPerfectWindowCompute",
  onPerfectReloadSuccess: "onPerfectReloadSuccess",
  onProjectileCreate: "onProjectileCreate",
  onDamageCompute: "onDamageCompute",
  onMeleeReflectQuery: "onMeleeReflectQuery",
  onRenderReticleCompute: "onRenderReticleCompute",
  onPickupMagnetQuery: "onPickupMagnetQuery",
  onPickupGlobalCooldownCompute: "onPickupGlobalCooldownCompute",
  onPlayerRuntimeUpdate: "onPlayerRuntimeUpdate",
  onEnemyHit: "onEnemyHit",
  onEnemyKilled: "onEnemyKilled",
  onBlinkDirectionCompute: "onBlinkDirectionCompute",
  onBlinkEffectsCompute: "onBlinkEffectsCompute",
  onShoutCreateWave: "onShoutCreateWave",
  onFireballCreate: "onFireballCreate",
};

export function createDefaultShotPlan({ player, target, spread }) {
  return {
    player,
    target,
    spread,
    shots: [
      {
        angleOffset: 0,
        reverse: false,
      },
    ],
  };
}

export function createDamageContext({ player, target, baseDamage, damageSource, gameState }) {
  return {
    player,
    target,
    baseDamage,
    damage: baseDamage,
    damageSource,
    gameState,
  };
}
