import { GAME_CONFIG } from "../constants.js";

const HUD = GAME_CONFIG.ui.hud;
const FONT = "monospace";

const PANEL_FILL = "rgba(8, 19, 33, 0.66)";
const PANEL_STROKE = "rgba(149, 203, 224, 0.34)";
const ACTIVE_FILL = "rgba(14, 35, 36, 0.82)";
const ACTIVE_STROKE = "rgba(146, 243, 210, 0.92)";
const READY_COLOR = "#8ef0c4";
const COOLDOWN_COLOR = "#ffd79a";

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function panel(ctx, x, y, width, height, { active = false, radius = 8 } = {}) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = active ? ACTIVE_FILL : PANEL_FILL;
  ctx.fill();
  ctx.strokeStyle = active ? ACTIVE_STROKE : PANEL_STROKE;
  ctx.lineWidth = active ? 2 : 1.5;
  ctx.stroke();
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function drawVitals(ctx, gameState, x, y) {
  const player = gameState.player;
  const maxHp = player.maxHp + player.maxHpBonus;
  const hpRatio = maxHp <= 0 ? 0 : clamp01(player.hp / maxHp);
  const xpRatio = player.xpToNext <= 0 ? 0 : clamp01(player.xp / player.xpToNext);
  const width = 260;
  const hpHeight = 20;

  ctx.fillStyle = "rgba(5, 11, 20, 0.7)";
  ctx.fillRect(x, y, width, hpHeight);
  const grad = ctx.createLinearGradient(x, 0, x + width, 0);
  grad.addColorStop(0, "#ff6078");
  grad.addColorStop(1, "#ff9e78");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, width * hpRatio, hpHeight);
  ctx.strokeStyle = "rgba(201, 246, 255, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, width, hpHeight);

  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(`♥ ${Math.ceil(player.hp)} / ${Math.ceil(maxHp)}`, x + 8, y + hpHeight * 0.5 + 1);

  const xpY = y + hpHeight + 6;
  const badgeWidth = 54;
  ctx.fillStyle = "rgba(5, 11, 20, 0.7)";
  ctx.fillRect(x, xpY, width, 10);
  const xpGrad = ctx.createLinearGradient(x, 0, x + width, 0);
  xpGrad.addColorStop(0, "#5ad7ff");
  xpGrad.addColorStop(1, "#7df0d4");
  ctx.fillStyle = xpGrad;
  ctx.fillRect(x, xpY, width * xpRatio, 10);
  ctx.strokeStyle = "rgba(201, 246, 255, 0.35)";
  ctx.strokeRect(x, xpY, width, 10);

  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#d4f3ff";
  ctx.fillText(`LV ${player.level}`, x, xpY + 24);
  return badgeWidth;
}

function drawRunInfo(ctx, gameState, view) {
  const cx = view.width * 0.5;
  const y = HUD.margin + 4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.8;
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillStyle = "#e9f6ff";
  ctx.fillText(formatClock(gameState.time), cx, y + 8);
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = "#a4c2d7";
  ctx.fillText(`☠ ${gameState.enemies.length}`, cx, y + 30);
  ctx.globalAlpha = 1;
}

// Ammo / charge readout for the selected weapon. Returns { text, ratio, color } or null ratio.
function weaponReadout(weaponSystem, player) {
  if (weaponSystem.isMeleeSelected()) {
    return { text: "—", ratio: null };
  }
  if (weaponSystem.isFlailSelected && weaponSystem.isFlailSelected()) {
    return { text: `${Math.round(weaponSystem.flailHeadSpeed || 0)}`, ratio: null, caption: "speed" };
  }
  if (weaponSystem.isBowSelected()) {
    const charge = weaponSystem.getBowChargeProgress();
    return { text: `${Math.round(charge * 100)}%`, ratio: charge, caption: "charge", color: "#ffd79a" };
  }
  const size = weaponSystem.getMagazineSize(player);
  if (weaponSystem.isReloading) {
    return { text: "RELOAD", ratio: weaponSystem.getReloadProgress(), color: "#ffd79a" };
  }
  return { text: `${weaponSystem.currentAmmo} / ${size}`, ratio: size > 0 ? weaponSystem.currentAmmo / size : 0, color: "#9fffe0" };
}

function selectedSlot(weaponSystem) {
  if (weaponSystem.isMeleeSelected()) return 1;
  if (weaponSystem.isGunSelected()) return 2;
  if (weaponSystem.isBowSelected()) return 3;
  return 4;
}

function drawWeaponBar(ctx, gameState, weaponSystem, view, usingGamepad) {
  const player = gameState.player;
  const active = selectedSlot(weaponSystem);
  const readout = weaponReadout(weaponSystem, player);
  const cx = view.width * 0.5;
  const bottom = view.height - HUD.margin;

  const size = 54;
  const gap = 8;
  const crossHeight = size * 3 + gap * 2;

  // Readout (weapon name + ammo/charge) sits above the keyboard row, or beside the D-pad cross.
  const readoutX = usingGamepad ? cx + size * 1.5 + gap + 76 : cx;
  const readoutY = usingGamepad ? bottom - crossHeight * 0.5 : bottom - size - 44;
  const def = HUD.weapons.find((w) => w.slot === active);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold 12px ${FONT}`;
  ctx.fillStyle = "#d8fff1";
  ctx.fillText(def.name.toUpperCase(), readoutX, readoutY - 24);
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = readout.color || "#d4f3ff";
  ctx.fillText(readout.text, readoutX, readoutY);
  if (readout.ratio !== null) {
    const barWidth = 120;
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(readoutX - barWidth * 0.5, readoutY + 16, barWidth, 5);
    ctx.fillStyle = readout.color || "#9fffe0";
    ctx.fillRect(readoutX - barWidth * 0.5, readoutY + 16, barWidth * clamp01(readout.ratio), 5);
  } else if (readout.caption) {
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = "#a4c2d7";
    ctx.fillText(readout.caption, readoutX, readoutY + 18);
  }

  function slot(def, x, y) {
    const isActive = def.slot === active;
    panel(ctx, x, y, size, size, { active: isActive });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${isActive ? 28 : 24}px ${FONT}`;
    ctx.globalAlpha = isActive ? 1 : 0.65;
    ctx.fillStyle = "#fff";
    ctx.fillText(def.icon, x + size * 0.5, y + size * 0.5 + 1);
    ctx.globalAlpha = 1;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = isActive ? "#cbffe8" : "#8fb5ca";
    ctx.textAlign = "left";
    ctx.fillText(usingGamepad ? def.glyph : def.key, x + 6, y + 10);
  }

  if (usingGamepad) {
    // D-pad cross: Up=Sword, Right=Gun, Down=Bow, Left=Flail.
    const originX = cx - size * 0.5;
    const originY = bottom - crossHeight;
    const pos = {
      up: [originX, originY],
      left: [originX - size - gap, originY + size + gap],
      right: [originX + size + gap, originY + size + gap],
      down: [originX, originY + (size + gap) * 2],
    };
    for (const def of HUD.weapons) {
      const [x, y] = pos[def.dpad];
      slot(def, x, y);
    }
  } else {
    const totalWidth = size * 4 + gap * 3;
    const startX = cx - totalWidth * 0.5;
    const y = bottom - size;
    HUD.weapons.forEach((def, i) => slot(def, startX + i * (size + gap), y));
  }
}

function skillState(player, id) {
  const cooldown = player[`${id}Cooldown`];
  const remaining = player[`${id}CooldownRemaining`];
  return { remaining, ratio: cooldown <= 0 ? 1 : clamp01(1 - remaining / cooldown) };
}

function drawSkillTiles(ctx, gameState, view, usingGamepad) {
  const player = gameState.player;
  const size = 62;
  const gap = 10;
  const x0 = HUD.margin;
  const y = view.height - HUD.margin - size - 16;

  HUD.skills.forEach((def, i) => {
    const x = x0 + i * (size + gap);
    const { remaining, ratio } = skillState(player, def.id);
    const ready = remaining <= 0;
    panel(ctx, x, y, size, size, { active: ready });

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `28px ${FONT}`;
    ctx.globalAlpha = ready ? 1 : 0.45;
    ctx.fillStyle = "#fff";
    ctx.fillText(def.icon, x + size * 0.5, y + size * 0.5 + 1);
    ctx.globalAlpha = 1;

    if (!ready) {
      // Clockwise radial sweep covering the not-yet-recharged part.
      const cx = x + size * 0.5;
      const cy = y + size * 0.5;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 8);
      ctx.clip();
      ctx.fillStyle = "rgba(4, 10, 18, 0.62)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, size, -Math.PI / 2 + ratio * Math.PI * 2, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.font = `bold 15px ${FONT}`;
      ctx.fillStyle = COOLDOWN_COLOR;
      ctx.fillText(`${remaining.toFixed(1)}`, cx, cy + 1);
    }

    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = ready ? READY_COLOR : "#8fb5ca";
    ctx.fillText(usingGamepad ? def.padKey : def.key, x + size * 0.5, y + size + 11);
  });
}

function drawPerkPoints(ctx, gameState, view) {
  const points = gameState.player.perkPoints;
  if (points <= 0 || gameState.player.perkModalOpen || gameState.gameOver) {
    return;
  }
  const t = gameState.time;
  const pulse = 0.96 + (Math.sin(t * 6.8) * 0.5 + 0.5) * 0.08;
  const label = `✦ Perk Points: ${points}`;
  ctx.save();
  ctx.font = `bold 16px ${FONT}`;
  const width = ctx.measureText(label).width + 28;
  const height = 32;
  ctx.translate(view.width - HUD.margin - width * 0.5, HUD.margin + height * 0.5);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.roundRect(-width * 0.5, -height * 0.5, width, height, 8);
  ctx.fillStyle = "rgba(18, 30, 44, 0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(126, 244, 210, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#9fffe0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function drawBossUi(ctx, gameState, view) {
  const state = gameState.systems?.boss;
  if (!state) {
    return;
  }
  const cx = view.width * 0.5;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const bosses = state.active || [];
  bosses.forEach((boss, index) => {
    if (!(boss.maxHp > 0)) {
      return;
    }
    const width = Math.min(560, view.width - 320);
    const x = cx - width * 0.5;
    const y = HUD.margin + 56 + index * 40;
    const ratio = clamp01(boss.hp / boss.maxHp);
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = boss.invulnerableTimer > 0 ? "#bff0ff" : "#ffd6f7";
    ctx.fillText(boss.name || boss.bossId, cx, y - 10);
    ctx.fillStyle = "rgba(8, 19, 33, 0.78)";
    ctx.fillRect(x - 2, y - 2, width + 4, 16);
    ctx.fillStyle = boss.invulnerableTimer > 0 ? "#9fdcff" : boss.color || "#c58cff";
    ctx.fillRect(x, y, width * ratio, 12);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2, y - 2, width + 4, 16);
    (boss.phaseMarkers || []).forEach((marker) => {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(x + width * marker - 1, y - 4, 2, 20);
    });
  });

  if (state.warning) {
    const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 10);
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = `rgba(255, 90, 120, ${0.65 + pulse * 0.35})`;
    ctx.fillText("WARNING", cx, view.height * 0.28);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = "#ffd6dc";
    ctx.fillText(`${state.warning.name} approaches`, cx, view.height * 0.28 + 30);
  }

  if (state.banner) {
    const fade = clamp01(Math.min(state.banner.timer, state.banner.duration - state.banner.timer) * 3);
    ctx.globalAlpha = fade;
    ctx.font = `bold ${state.banner.kind === "defeat" ? 40 : 30}px ${FONT}`;
    ctx.fillStyle = state.banner.kind === "defeat" ? "#9ff5c8" : "#ffd6f7";
    ctx.fillText(state.banner.text, cx, view.height * 0.3);
    if (state.banner.sub) {
      ctx.font = `15px ${FONT}`;
      ctx.fillStyle = "#e9f6ff";
      ctx.fillText(state.banner.sub, cx, view.height * 0.3 + 30);
    }
    ctx.globalAlpha = 1;
  }
}

export function renderHud(ctx, view, gameState, weaponSystem, { isDebugMode = false } = {}) {
  if (!weaponSystem || gameState.titleScreen || gameState.paused) {
    return;
  }

  const usingGamepad = gameState.inputDevice === "gamepad";
  ctx.save();
  drawVitals(ctx, gameState, HUD.margin, HUD.margin);
  drawRunInfo(ctx, gameState, view);
  drawBossUi(ctx, gameState, view);
  drawPerkPoints(ctx, gameState, view);
  drawSkillTiles(ctx, gameState, view, usingGamepad);
  drawWeaponBar(ctx, gameState, weaponSystem, view, usingGamepad);

  if (isDebugMode) {
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = "#ffdca7";
    const fpsY = HUD.margin + (gameState.player.perkPoints > 0 ? 50 : 10);
    ctx.fillText(`FPS ${gameState.fps ?? 0}`, view.width - HUD.margin, fpsY);
    const perf = gameState.perf;
    if (perf) {
      ctx.fillText(`upd ${perf.updateAvg.toFixed(2)} / ${perf.updateMax.toFixed(1)}ms`, view.width - HUD.margin, fpsY + 16);
      ctx.fillText(`rnd ${perf.renderAvg.toFixed(2)} / ${perf.renderMax.toFixed(1)}ms`, view.width - HUD.margin, fpsY + 32);
      ctx.fillText(
        `E ${gameState.enemies.length} P ${gameState.projectiles.length} FX ${gameState.effects.length} T ${gameState.floatingTexts.length}`,
        view.width - HUD.margin,
        fpsY + 48
      );
    }
  }
  ctx.restore();
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
