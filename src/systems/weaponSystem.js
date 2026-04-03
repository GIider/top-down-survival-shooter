import { BALANCE, GAME_CONFIG } from "../core/constants.js";
import {
  createBowProjectile,
  createGunProjectile,
  createMeleeSwing,
  getBowConfig,
  getGunConfig,
  getMeleeConfig,
  getMeleePreview,
} from "./weapons/index.js";
import { createDefaultShotPlan, PERK_HOOKS } from "./perks/contracts.js";

const GUN_CONFIG = getGunConfig();
const BOW_CONFIG = getBowConfig();
const MELEE_CONFIG = getMeleeConfig();
const FLAIL_CONFIG = GAME_CONFIG.weapons.flail;

export class Weapon {
  constructor(config) {
    this.type = config.type;
    this.damage = config.damage;
    this.fireRate = config.fireRate;
    this.spread = config.spread;
    this.magazineSize = config.magazineSize;
    this.reloadTime = config.reloadTime;

    this.currentAmmo = this.magazineSize;
    this.isReloading = false;
    this.reloadProgress = 0;
    this.state = "ready";
    this.cooldown = 0;
    this.perfectWindow = GUN_CONFIG.perfectReloadWindow;
    this.reloadFailed = false;
    this.reloadAttemptUsed = false;
    this.reloadFeedbackType = null;
    this.reloadFeedbackTimer = 0;
    this.reloadFeedbackDuration = 0;
    this.ammoBarTimer = 0;
    this.ammoBarDuration = GUN_CONFIG.ammoBarDuration;

    this.selectedSlot = 2;
    this.lastAimAngle = 0;
    this.meleeCooldown = 0;
    this.comboIndex = 0;
    this.comboTimer = 0;
    this.activeMeleeSwings = [];
    this.meleeAttackSequence = 0;
    this.arrowShotSequence = 0;

    this.bowChargeWindow = BOW_CONFIG.chargeWindow;
    this.bowChargeTime = BOW_CONFIG.chargeTime;
    this.bowCharging = false;
    this.bowChargeProgress = 0;
    this.bowReloadTime = BOW_CONFIG.reloadTime;
    this.bowReloadTimer = 0;
    this.bowMinDamage = BOW_CONFIG.minDamage;
    this.bowMaxDamage = BOW_CONFIG.maxDamage;
    this.bowMinSpeed = BOW_CONFIG.minSpeed;
    this.bowMaxSpeed = BOW_CONFIG.maxSpeed;

    this.flailInitialized = false;
    this.flailHeadX = 0;
    this.flailHeadY = 0;
    this.flailVelX = 0;
    this.flailVelY = 0;
    this.flailHeadSpeed = 0;
    this.flailTrail = [];
    this.flailTrailTimer = 0;
    this.flailImpactPulse = 0;
    this.flailHeadHitCooldowns = new Map();
    this.flailChainHitCooldowns = new Map();
  }

  static scaleWindow(windowRange, multiplier) {
    const [start, end] = windowRange;
    const center = (start + end) * 0.5;
    const halfWidth = (end - start) * 0.5 * Math.max(0, multiplier);
    return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
  }

  isMeleeSelected() {
    return this.selectedSlot === 1;
  }

  isGunSelected() {
    return this.selectedSlot === 2;
  }

  isBowSelected() {
    return this.selectedSlot === 3;
  }

  isFlailSelected() {
    return this.selectedSlot === 4;
  }

  switchWeapon(slot) {
    if (slot !== 1 && slot !== 2 && slot !== 3 && slot !== 4) {
      return;
    }

    this.selectedSlot = slot;
    this.bowCharging = false;
    this.bowChargeProgress = 0;
    if (slot === 1 || slot === 3 || slot === 4) {
      this.isReloading = false;
      this.reloadProgress = 0;
      this.reloadFailed = false;
      this.reloadAttemptUsed = false;
      this.state = "ready";
    }
  }

  initializeFlailState(player, resetVelocity = true) {
    this.flailInitialized = true;
    const angle = Number.isFinite(this.lastAimAngle) ? this.lastAimAngle : 0;
    this.flailHeadX = player.x + Math.cos(angle) * FLAIL_CONFIG.targetRadius;
    this.flailHeadY = player.y + Math.sin(angle) * FLAIL_CONFIG.targetRadius;
    if (resetVelocity) {
      this.flailVelX = 0;
      this.flailVelY = 0;
    }
    this.flailTrail.length = 0;
    this.flailTrailTimer = 0;
  }

  getFlailImpactRatio(speed = this.flailHeadSpeed) {
    const range = Math.max(1, FLAIL_CONFIG.maxImpactSpeed - FLAIL_CONFIG.minImpactSpeed);
    return Math.max(0, Math.min(1, (speed - FLAIL_CONFIG.minImpactSpeed) / range));
  }

  getFlailHeadDamage(player, impactSpeed = this.flailHeadSpeed) {
    const ratio = this.getFlailImpactRatio(impactSpeed);
    const baseDamage = FLAIL_CONFIG.minDamage + (FLAIL_CONFIG.maxDamage - FLAIL_CONFIG.minDamage) * ratio;
    return baseDamage * player.damageMultiplier;
  }

  getFlailChainDamage(player, headSpeed = this.flailHeadSpeed) {
    const ratio = Math.max(0, Math.min(1, headSpeed / Math.max(1, FLAIL_CONFIG.maxImpactSpeed)));
    return (FLAIL_CONFIG.baseChainDamage + FLAIL_CONFIG.chainSpeedFactor * ratio) * player.damageMultiplier;
  }

  getFlailKnockback(impactSpeed, scale = 1) {
    const ratio = this.getFlailImpactRatio(impactSpeed);
    const amount = FLAIL_CONFIG.minKnockback + (FLAIL_CONFIG.maxKnockback - FLAIL_CONFIG.minKnockback) * ratio;
    return amount * Math.max(0, scale);
  }

  getFlailConfig() {
    return FLAIL_CONFIG;
  }

  canFlailHitEnemy(enemy, channel = "head") {
    const map = channel === "chain" ? this.flailChainHitCooldowns : this.flailHeadHitCooldowns;
    return !map.has(enemy);
  }

  markFlailEnemyHit(enemy, channel = "head") {
    const map = channel === "chain" ? this.flailChainHitCooldowns : this.flailHeadHitCooldowns;
    const duration = channel === "chain" ? FLAIL_CONFIG.chainPerEnemyHitCooldown : FLAIL_CONFIG.perEnemyHitCooldown;
    map.set(enemy, duration);
  }

  applyFlailImpactResponse(impactRatio = 0) {
    const momentumRetention = Math.min(0.9, FLAIL_CONFIG.onHitVelocityMultiplier + (1 - impactRatio) * 0.15);
    this.flailVelX *= momentumRetention;
    this.flailVelY *= momentumRetention;
    this.flailImpactPulse = Math.min(1, this.flailImpactPulse + 0.32 + impactRatio * 0.55);
  }

  boostFlailMomentum(multiplier = 1) {
    const clamped = Math.max(0.5, Math.min(2, multiplier));
    this.flailVelX *= clamped;
    this.flailVelY *= clamped;
    const speed = Math.hypot(this.flailVelX, this.flailVelY);
    const maxSpeed = FLAIL_CONFIG.maxImpactSpeed * 2;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.flailVelX *= scale;
      this.flailVelY *= scale;
    }
    this.flailHeadSpeed = Math.hypot(this.flailVelX, this.flailVelY);
    this.flailImpactPulse = Math.min(1, this.flailImpactPulse + 0.2);
  }

  getFlailSnapshot(player) {
    if (!this.flailInitialized) {
      this.initializeFlailState(player, true);
    }

    const segmentCount = Math.max(2, FLAIL_CONFIG.chainSegments);
    const points = [];
    for (let i = 0; i <= segmentCount; i += 1) {
      const t = i / segmentCount;
      points.push({
        x: player.x + (this.flailHeadX - player.x) * t,
        y: player.y + (this.flailHeadY - player.y) * t,
      });
    }

    return {
      x: this.flailHeadX,
      y: this.flailHeadY,
      radius: FLAIL_CONFIG.headRadius,
      velocity: { x: this.flailVelX, y: this.flailVelY },
      speed: this.flailHeadSpeed,
      impactPulse: this.flailImpactPulse,
      trail: this.flailTrail,
      chainPoints: points,
      chainHitRadius: FLAIL_CONFIG.chainHitRadius,
      chainVisualWidth: FLAIL_CONFIG.chainVisualWidth,
    };
  }

  decayHitCooldowns(map, dt) {
    for (const [enemy, remaining] of map.entries()) {
      const next = remaining - dt;
      if (next <= 0 || enemy?.hp <= 0) {
        map.delete(enemy);
      } else {
        map.set(enemy, next);
      }
    }
  }

  updateFlail(dt, player, pointer) {
    this.decayHitCooldowns(this.flailHeadHitCooldowns, dt);
    this.decayHitCooldowns(this.flailChainHitCooldowns, dt);

    if (!this.flailInitialized) {
      this.initializeFlailState(player, true);
    }

    this.flailImpactPulse = Math.max(0, this.flailImpactPulse - dt * 3.2);

    for (let i = this.flailTrail.length - 1; i >= 0; i -= 1) {
      const node = this.flailTrail[i];
      node.life -= dt;
      if (node.life <= 0) {
        this.flailTrail.splice(i, 1);
      }
    }

    if (!this.isFlailSelected() || !pointer) {
      this.flailHeadX += (player.x - this.flailHeadX) * Math.min(1, dt * 8);
      this.flailHeadY += (player.y - this.flailHeadY) * Math.min(1, dt * 8);
      this.flailVelX *= Math.max(0, 1 - dt * 9);
      this.flailVelY *= Math.max(0, 1 - dt * 9);
      this.flailHeadSpeed = Math.hypot(this.flailVelX, this.flailVelY);
      return;
    }

    const aimDx = pointer.x - player.x;
    const aimDy = pointer.y - player.y;
    const aimLength = Math.hypot(aimDx, aimDy);
    const dirX = aimLength > 0.001 ? aimDx / aimLength : Math.cos(this.lastAimAngle);
    const dirY = aimLength > 0.001 ? aimDy / aimLength : Math.sin(this.lastAimAngle);
    this.lastAimAngle = Math.atan2(dirY, dirX);

    const targetX = player.x + dirX * FLAIL_CONFIG.targetRadius;
    const targetY = player.y + dirY * FLAIL_CONFIG.targetRadius;
    const accelX = (targetX - this.flailHeadX) * FLAIL_CONFIG.springStrength - this.flailVelX * FLAIL_CONFIG.drag;
    const accelY = (targetY - this.flailHeadY) * FLAIL_CONFIG.springStrength - this.flailVelY * FLAIL_CONFIG.drag;

    this.flailVelX += accelX * dt;
    this.flailVelY += accelY * dt;
    this.flailHeadX += this.flailVelX * dt;
    this.flailHeadY += this.flailVelY * dt;

    const tetherDx = this.flailHeadX - player.x;
    const tetherDy = this.flailHeadY - player.y;
    const tetherLength = Math.hypot(tetherDx, tetherDy);
    if (tetherLength > FLAIL_CONFIG.maxRange) {
      const nx = tetherDx / tetherLength;
      const ny = tetherDy / tetherLength;
      this.flailHeadX = player.x + nx * FLAIL_CONFIG.maxRange;
      this.flailHeadY = player.y + ny * FLAIL_CONFIG.maxRange;

      const radialSpeed = this.flailVelX * nx + this.flailVelY * ny;
      if (radialSpeed > 0) {
        this.flailVelX -= radialSpeed * nx;
        this.flailVelY -= radialSpeed * ny;
      }
      this.flailVelX *= FLAIL_CONFIG.tangentialRetention;
      this.flailVelY *= FLAIL_CONFIG.tangentialRetention;
    }

    const maxSpeed = FLAIL_CONFIG.maxImpactSpeed * 2.25;
    const speed = Math.hypot(this.flailVelX, this.flailVelY);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.flailVelX *= scale;
      this.flailVelY *= scale;
    }
    this.flailHeadSpeed = Math.hypot(this.flailVelX, this.flailVelY);

    this.flailTrailTimer -= dt;
    if (this.flailTrailTimer <= 0) {
      this.flailTrail.push({
        x: this.flailHeadX,
        y: this.flailHeadY,
        life: FLAIL_CONFIG.trailLifetime,
      });
      this.flailTrailTimer = FLAIL_CONFIG.trailInterval;
    }
  }

  getMagazineSize(player) {
    return this.magazineSize + player.ammoCapacityBonus;
  }

  getReloadProgress() {
    if (this.isBowSelected() && this.bowCharging) {
      return this.bowChargeProgress;
    }

    return this.reloadProgress;
  }

  getBowChargeWindow(player = null, perkEngine = null) {
    const context = {
      weaponType: "bow",
      multiplier: 1,
      player,
    };
    const finalized = perkEngine ? perkEngine.runTransformHook(PERK_HOOKS.onPerfectWindowCompute, context, player) : context;
    return Weapon.scaleWindow(this.bowChargeWindow, finalized.multiplier);
  }

  getPerfectReloadWindow(player = null, perkEngine = null) {
    const context = {
      weaponType: "gun",
      multiplier: 1,
      player,
    };
    const finalized = perkEngine ? perkEngine.runTransformHook(PERK_HOOKS.onPerfectWindowCompute, context, player) : context;
    return Weapon.scaleWindow(this.perfectWindow, finalized.multiplier);
  }

  getBowChargeProgress() {
    return this.bowChargeProgress;
  }

  isBowCharging() {
    return this.bowCharging;
  }

  isBowReloading() {
    return this.bowReloadTimer > 0;
  }

  getBowReloadProgress() {
    if (this.bowReloadTime <= 0) {
      return 1;
    }

    return 1 - this.bowReloadTimer / this.bowReloadTime;
  }

  shouldShowChargeBar() {
    return this.isBowSelected() && this.bowCharging;
  }

  getMeleePreview() {
    return getMeleePreview(this.comboIndex);
  }

  shouldShowAmmoBar() {
    return this.ammoBarTimer > 0;
  }

  showAmmoBar(duration = this.ammoBarDuration) {
    this.ammoBarTimer = Math.max(this.ammoBarTimer, duration);
  }

  hasFailedReload() {
    return this.reloadFailed;
  }

  getReloadFeedback() {
    if (this.reloadFeedbackTimer <= 0 || !this.reloadFeedbackType) {
      return null;
    }

    return {
      type: this.reloadFeedbackType,
      strength: this.reloadFeedbackDuration <= 0 ? 0 : this.reloadFeedbackTimer / this.reloadFeedbackDuration,
    };
  }

  triggerReloadFeedback(type, duration) {
    this.reloadFeedbackType = type;
    this.reloadFeedbackDuration = duration;
    this.reloadFeedbackTimer = duration;
  }

  startReload(player) {
    if (this.isBowSelected()) {
      return;
    }

    if (this.isReloading || this.currentAmmo === this.getMagazineSize(player)) {
      return;
    }

    this.isReloading = true;
    this.reloadProgress = 0;
    this.reloadFailed = false;
    this.reloadAttemptUsed = false;
    this.state = "reloading";
  }

  finishReload(player) {
    this.isReloading = false;
    this.reloadProgress = 0;
    this.currentAmmo = this.getMagazineSize(player);
    this.reloadFailed = false;
    this.reloadAttemptUsed = false;
    this.state = "ready";
    this.showAmmoBar(1);
  }

  onReloadClick(player, perkEngine = null) {
    if (!this.isReloading || this.reloadAttemptUsed) {
      return false;
    }

    this.reloadAttemptUsed = true;

    const [start, end] = this.getPerfectReloadWindow(player, perkEngine);
    if (this.reloadProgress >= start && this.reloadProgress <= end) {
      this.triggerReloadFeedback("perfect", GUN_CONFIG.reloadFeedback.perfectDuration);
      this.finishReload(player);
      if (perkEngine) {
        perkEngine.emitSideEffectHook(PERK_HOOKS.onPerfectReloadSuccess, { player, weaponSystem: this }, player);
      }
      return true;
    }

    this.reloadFailed = true;
    this.triggerReloadFeedback("miss", GUN_CONFIG.reloadFeedback.missDuration);

    return false;
  }

  tryFire(player, target, projectileList, perkEngine = null) {
    this.lastAimAngle = Math.atan2(target.y - player.y, target.x - player.x);

    if (!this.isGunSelected()) {
      return false;
    }

    if (this.cooldown > 0 || this.isReloading) {
      return false;
    }

    const hasInfiniteAmmo = !!player.hasInfiniteAmmo;

    if (!hasInfiniteAmmo && this.currentAmmo <= 0) {
      this.state = "empty";
      this.startReload(player);
      return false;
    }

    const spread = this.spread * player.spreadMultiplier;
    const shotPlan = createDefaultShotPlan({ player, target, spread });
    const finalizedPlan = perkEngine
      ? perkEngine.runTransformHook(PERK_HOOKS.onWeaponFireRequest, shotPlan, player)
      : shotPlan;

    for (let index = 0; index < finalizedPlan.shots.length; index += 1) {
      const shot = finalizedPlan.shots[index];
      const shotTarget = shot.reverse
        ? {
            x: player.x - (target.x - player.x),
            y: player.y - (target.y - player.y),
          }
        : target;
      const projectile = createGunProjectile(player, shotTarget, spread, shot.angleOffset || 0);
      const projectileContext = {
        projectile,
        player,
        target: shotTarget,
        weaponType: "gun",
        gameState: null,
      };
      const finalizedProjectile = perkEngine
        ? perkEngine.runTransformHook(PERK_HOOKS.onProjectileCreate, projectileContext, player).projectile
        : projectile;
      projectileList.push(finalizedProjectile);
    }
    if (!hasInfiniteAmmo) {
      this.currentAmmo -= 1;
    }
    this.showAmmoBar();
    this.cooldown = 1 / (this.fireRate * player.fireRateMultiplier);
    this.state = "firing";

    if (!hasInfiniteAmmo && this.currentAmmo <= 0) {
      this.state = "empty";
      this.startReload(player);
    }

    return true;
  }

  startBowCharge() {
    if (!this.isBowSelected()) {
      return;
    }

    if (this.bowReloadTimer > 0) {
      return;
    }

    if (!this.bowCharging) {
      this.bowCharging = true;
      this.bowChargeProgress = 0;
      this.state = "charging";
    }
  }

  releaseBowShot(player, target, projectileList, perkEngine = null) {
    this.lastAimAngle = Math.atan2(target.y - player.y, target.x - player.x);

    if (!this.isBowSelected() || !this.bowCharging) {
      return false;
    }

    const ratio = Math.max(0, Math.min(1, this.bowChargeProgress));
    const projectile = createBowProjectile(player, this.lastAimAngle, ratio, ++this.arrowShotSequence, perkEngine);
    const [start, end] = this.getBowChargeWindow(player, perkEngine);
    const isPerfect = ratio >= start && ratio <= end;

    projectileList.push(projectile);
    this.bowCharging = false;
    this.bowChargeProgress = 0;
    this.bowReloadTimer = this.bowReloadTime;
    this.cooldown = 0.16;
    this.state = isPerfect ? "bow-perfect" : "bow-shot";
    return true;
  }

  tryMeleeAttack(player, target, slashEffectList = null) {
    this.lastAimAngle = Math.atan2(target.y - player.y, target.x - player.x);
    if (!this.isMeleeSelected() || this.meleeCooldown > 0) {
      return false;
    }

    const comboConfig = MELEE_CONFIG.combo[this.comboIndex];
    const swing = createMeleeSwing(this.comboIndex, ++this.meleeAttackSequence, player, this.lastAimAngle);

    this.activeMeleeSwings.push(swing);
    if (slashEffectList) {
      slashEffectList.push({
        x: swing.x,
        y: swing.y,
        angle: swing.angle,
        range: swing.range,
        arc: swing.arc,
        elapsed: 0,
        duration: swing.duration,
        color: swing.color,
      });
    }

    this.meleeCooldown = comboConfig.cooldown / Math.max(0.3, player.fireRateMultiplier);
    this.state = "melee";
    return true;
  }

  notifyMeleeSwingHit(attackId, comboStep) {
    const matchingSwing = this.activeMeleeSwings.find((entry) => entry.attackId === attackId);
    if (!matchingSwing || matchingSwing.didHit) {
      return;
    }

    matchingSwing.didHit = true;
    if (this.comboIndex === comboStep) {
      this.comboIndex = (comboStep + 1) % MELEE_CONFIG.combo.length;
      this.comboTimer = MELEE_CONFIG.comboResetTime;
    }
  }

  getActiveMeleeSwings() {
    return this.activeMeleeSwings;
  }

  update(dt, player, pointer = null) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
    }

    this.updateFlail(dt, player, pointer);

    if (this.bowCharging) {
      this.bowChargeProgress = Math.min(1, this.bowChargeProgress + dt / this.bowChargeTime);
    }

    if (this.bowReloadTimer > 0) {
      this.bowReloadTimer = Math.max(0, this.bowReloadTimer - dt);
      if (this.bowReloadTimer > 0 && this.isBowSelected()) {
        this.state = "bow-reloading";
      }
    }

    if (this.reloadFeedbackTimer > 0) {
      this.reloadFeedbackTimer = Math.max(0, this.reloadFeedbackTimer - dt);
      if (this.reloadFeedbackTimer === 0) {
        this.reloadFeedbackType = null;
      }
    }

    if (this.ammoBarTimer > 0) {
      this.ammoBarTimer = Math.max(0, this.ammoBarTimer - dt);
    }

    if (this.meleeCooldown > 0) {
      this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    }

    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer === 0) {
        this.comboIndex = 0;
      }
    }

    for (let i = this.activeMeleeSwings.length - 1; i >= 0; i -= 1) {
      const swing = this.activeMeleeSwings[i];
      swing.elapsed += dt;
      if (swing.elapsed >= swing.duration) {
        if (!swing.didHit) {
          this.comboIndex = 0;
          this.comboTimer = 0;
        }
        this.activeMeleeSwings.splice(i, 1);
      }
    }

    if (this.isReloading) {
      const reloadDuration = this.reloadTime / Math.max(0.2, player.reloadSpeedMultiplier);
      this.reloadProgress += dt / reloadDuration;

      if (this.reloadProgress >= 1) {
        this.finishReload(player);
      }
    }
  }
}

export function createWeaponSystem(player) {
  const weapon = new Weapon({
    ...BALANCE.baseWeapon,
    magazineSize: GAME_CONFIG.weapons.gun.magazineSize + player.ammoCapacityBonus,
  });
  weapon.initializeFlailState(player, true);
  return weapon;
}
