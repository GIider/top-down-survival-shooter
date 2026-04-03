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

const GUN_CONFIG = getGunConfig();
const BOW_CONFIG = getBowConfig();
const MELEE_CONFIG = getMeleeConfig();

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

  switchWeapon(slot) {
    if (slot !== 1 && slot !== 2 && slot !== 3) {
      return;
    }

    this.selectedSlot = slot;
    this.bowCharging = false;
    this.bowChargeProgress = 0;
    if (slot === 1 || slot === 3) {
      this.isReloading = false;
      this.reloadProgress = 0;
      this.reloadFailed = false;
      this.reloadAttemptUsed = false;
      this.state = "ready";
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

  getBowChargeWindow(player = null) {
    const multiplier = player?.bowPerfectWindowMultiplier ?? 1;
    return Weapon.scaleWindow(this.bowChargeWindow, multiplier);
  }

  getPerfectReloadWindow(player = null) {
    const multiplier = player?.gunPerfectWindowMultiplier ?? 1;
    return Weapon.scaleWindow(this.perfectWindow, multiplier);
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

  onReloadClick(player) {
    if (!this.isReloading || this.reloadAttemptUsed) {
      return false;
    }

    this.reloadAttemptUsed = true;

    const [start, end] = this.getPerfectReloadWindow(player);
    if (this.reloadProgress >= start && this.reloadProgress <= end) {
      this.triggerReloadFeedback("perfect", GUN_CONFIG.reloadFeedback.perfectDuration);
      this.finishReload(player);
      if (player.gunPerfectReloadMoveSpeedBoost) {
        player.perfectReloadMoveBoostTimer = 1;
      }
      return true;
    }

    this.reloadFailed = true;
    this.triggerReloadFeedback("miss", GUN_CONFIG.reloadFeedback.missDuration);

    return false;
  }

  tryFire(player, target, projectileList) {
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
    const reverseTarget = {
      x: player.x - (target.x - player.x),
      y: player.y - (target.y - player.y),
    };
    if (player.gunTripleShot) {
      const offsets = [-0.14, 0, 0.14];
      for (let index = 0; index < offsets.length; index += 1) {
        projectileList.push(createGunProjectile(player, target, spread, offsets[index]));
        if (player.gunBackwardShot) {
          projectileList.push(createGunProjectile(player, reverseTarget, spread, offsets[index]));
        }
      }
    } else {
      projectileList.push(createGunProjectile(player, target, spread));
      if (player.gunBackwardShot) {
        projectileList.push(createGunProjectile(player, reverseTarget, spread));
      }
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

  releaseBowShot(player, target, projectileList) {
    this.lastAimAngle = Math.atan2(target.y - player.y, target.x - player.x);

    if (!this.isBowSelected() || !this.bowCharging) {
      return false;
    }

    const ratio = Math.max(0, Math.min(1, this.bowChargeProgress));
    const projectile = createBowProjectile(player, this.lastAimAngle, ratio, ++this.arrowShotSequence);
    const [start, end] = this.getBowChargeWindow(player);
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

  update(dt, player) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
    }

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
  return new Weapon({
    ...BALANCE.baseWeapon,
    magazineSize: GAME_CONFIG.weapons.gun.magazineSize + player.ammoCapacityBonus,
  });
}
