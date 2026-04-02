export function createHud(documentRef, options = {}) {
  const isDebugMode = options.isDebugMode === true;
  const hpFill = documentRef.getElementById("hp-fill");
  const xpFill = documentRef.getElementById("xp-fill");
  const statHp = documentRef.getElementById("stat-hp");
  const statLvl = documentRef.getElementById("stat-lvl");
  const statAmmo = documentRef.getElementById("stat-ammo");
  const statPerks = documentRef.getElementById("stat-perks");
  const statEnemies = documentRef.getElementById("stat-enemies");
  const statTime = documentRef.getElementById("stat-time");
  const statFps = documentRef.getElementById("stat-fps");
  const weaponSlotMelee = documentRef.getElementById("weapon-slot-melee");
  const weaponSlotGun = documentRef.getElementById("weapon-slot-gun");
  const weaponSlotBow = documentRef.getElementById("weapon-slot-bow");
  const directorPoints = documentRef.getElementById("director-points");
  const directorRegen = documentRef.getElementById("director-regen");
  const directorStage = documentRef.getElementById("director-stage");
  const directorLog = documentRef.getElementById("director-log");
  const skillCooldownText = documentRef.getElementById("skill-cooldown-text");
  const skillBarFill = documentRef.getElementById("skill-bar-fill");
  const shoutCooldownText = documentRef.getElementById("shout-cooldown-text");
  const shoutBarFill = documentRef.getElementById("shout-bar-fill");
  const fireballCooldownText = documentRef.getElementById("fireball-cooldown-text");
  const fireballBarFill = documentRef.getElementById("fireball-bar-fill");

  return {
    update(services, fpsValue) {
      const gameState = services.gameState;
      const weaponSystem = services.getWeaponSystem();
      const player = gameState.player;
      const magazineSize = weaponSystem.getMagazineSize(player);
      const maxHp = player.maxHp + player.maxHpBonus;
      const hpRatio = maxHp <= 0 ? 0 : Math.max(0, Math.min(1, player.hp / maxHp));
      const xpRatio = player.xpToNext <= 0 ? 0 : Math.max(0, Math.min(1, player.xp / player.xpToNext));

      if (hpFill) {
        hpFill.style.width = `${hpRatio * 100}%`;
      }
      if (xpFill) {
        xpFill.style.width = `${xpRatio * 100}%`;
      }

      if (statHp) {
        statHp.textContent = `HP: ${Math.ceil(player.hp)} / ${Math.ceil(maxHp)}`;
      }
      if (statLvl) {
        statLvl.textContent = `LVL: ${player.level}`;
      }
      if (statAmmo) {
        if (weaponSystem.isMeleeSelected()) {
          statAmmo.textContent = "Ammo: -- (Melee)";
        } else if (weaponSystem.isBowSelected()) {
          const chargePct = Math.round(weaponSystem.getBowChargeProgress() * 100);
          statAmmo.textContent = `Ammo: 1 (Bow) | Charge: ${chargePct}%`;
        } else {
          statAmmo.textContent = `Ammo: ${weaponSystem.currentAmmo}/${magazineSize}`;
        }
      }
      if (statPerks) {
        statPerks.textContent = `Perks: ${player.ownedPerks.length}`;
      }
      if (statEnemies) {
        statEnemies.textContent = `Enemies: ${gameState.enemies.length}`;
      }
      if (statTime) {
        statTime.textContent = `Time: ${gameState.time.toFixed(1)}s`;
      }
      if (statFps) {
        statFps.textContent = `FPS: ${fpsValue}`;
      }

      const blinkRatio = player.blinkCooldown <= 0 ? 1 : 1 - player.blinkCooldownRemaining / player.blinkCooldown;
      if (skillBarFill) {
        skillBarFill.style.width = `${Math.max(0, Math.min(1, blinkRatio)) * 100}%`;
      }
      if (skillCooldownText) {
        if (player.blinkCooldownRemaining <= 0) {
          skillCooldownText.textContent = "Ready";
          skillCooldownText.style.color = "#8ef0c4";
        } else {
          skillCooldownText.textContent = `${player.blinkCooldownRemaining.toFixed(1)}s`;
          skillCooldownText.style.color = "#ffd79a";
        }
      }

      const shoutRatio = player.shoutCooldown <= 0 ? 1 : 1 - player.shoutCooldownRemaining / player.shoutCooldown;
      if (shoutBarFill) {
        shoutBarFill.style.width = `${Math.max(0, Math.min(1, shoutRatio)) * 100}%`;
      }
      if (shoutCooldownText) {
        if (player.shoutCooldownRemaining <= 0) {
          shoutCooldownText.textContent = "Ready";
          shoutCooldownText.style.color = "#8ef0c4";
        } else {
          shoutCooldownText.textContent = `${player.shoutCooldownRemaining.toFixed(1)}s`;
          shoutCooldownText.style.color = "#ffd79a";
        }
      }

      const fireballRatio = player.fireballCooldown <= 0 ? 1 : 1 - player.fireballCooldownRemaining / player.fireballCooldown;
      if (fireballBarFill) {
        fireballBarFill.style.width = `${Math.max(0, Math.min(1, fireballRatio)) * 100}%`;
      }
      if (fireballCooldownText) {
        if (player.fireballCooldownRemaining <= 0) {
          fireballCooldownText.textContent = "Ready";
          fireballCooldownText.style.color = "#8ef0c4";
        } else {
          fireballCooldownText.textContent = `${player.fireballCooldownRemaining.toFixed(1)}s`;
          fireballCooldownText.style.color = "#ffd79a";
        }
      }

      if (weaponSlotMelee && weaponSlotGun && weaponSlotBow) {
        weaponSlotMelee.classList.toggle("active", weaponSystem.isMeleeSelected());
        weaponSlotGun.classList.toggle("active", weaponSystem.isGunSelected());
        weaponSlotBow.classList.toggle("active", weaponSystem.isBowSelected());
      }

      if (isDebugMode && directorPoints && directorRegen && directorStage && directorLog) {
        const director = gameState.systems.director;
        if (director) {
          directorPoints.textContent = `Points: ${director.points.toFixed(1)} / ${director.maxPoints.toFixed(1)}`;
          directorRegen.textContent = `Regen: ${director.regenRate.toFixed(2)}/s`;
          directorStage.textContent = `Stage: ${director.stage}`;

          directorLog.innerHTML = "";
          const recent = director.purchaseLog.slice(-8).reverse();
          recent.forEach((entry) => {
            const item = documentRef.createElement("li");
            const status = entry.spawned ? "spawned" : "debug-dry";
            item.textContent = `t=${entry.time.toFixed(1)}s | ${entry.groupId} (-${entry.cost.toFixed(1)}) [${status}]`;
            directorLog.appendChild(item);
          });
        }
      }
    },
  };
}