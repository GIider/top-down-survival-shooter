import { CANVAS } from "./constants.js";
import { renderControlsLegendPanel, renderPickupLegendPanel, renderTitleHistoryPanel } from "./render/panels.js";
import { renderPauseOverlay, renderPerkLibraryOverlay, renderTitleScreen } from "./render/titleOverlays.js";
import { getVisibleObstacles } from "../systems/worldSystem.js";

function drawBar(ctx, x, y, width, height, value, max, fill, background = "rgba(255,255,255,0.12)") {
  ctx.fillStyle = background;
  ctx.fillRect(x, y, width, height);

  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width * ratio, height);
}

function normalizeRgbColor(color, fallback = "255,255,255") {
  if (!color) {
    return fallback;
  }

  if (color.includes(",")) {
    return color;
  }

  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return `${r},${g},${b}`;
    }
  }

  return fallback;
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (let i = 0; i < words.length; i += 1) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = words[i];
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

function perkTagEmoji(tag) {
  const map = {
    blink: "💨",
    shout: "🗣️",
    fireball: "🔥",
    fire: "🚒",
    ice: "❄️",
    gun: "🔫",
    bow: "🏹",
    melee: "⚔️",
    utility: "🧲",
  };
  return map[tag] || "✦";
}

function drawBorderProgress(ctx, x, y, width, height, progress, color, lineWidth = 2.5) {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) {
    return;
  }

  const perimeter = width * 2 + height * 2;
  let remaining = perimeter * p;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  const segments = [
    { from: [x, y], to: [x + width, y], len: width },
    { from: [x + width, y], to: [x + width, y + height], len: height },
    { from: [x + width, y + height], to: [x, y + height], len: width },
    { from: [x, y + height], to: [x, y], len: height },
  ];

  for (let i = 0; i < segments.length && remaining > 0; i += 1) {
    const segment = segments[i];
    const take = Math.min(segment.len, remaining);
    const ratio = segment.len <= 0 ? 0 : take / segment.len;
    const ex = segment.from[0] + (segment.to[0] - segment.from[0]) * ratio;
    const ey = segment.from[1] + (segment.to[1] - segment.from[1]) * ratio;

    ctx.moveTo(segment.from[0], segment.from[1]);
    ctx.lineTo(ex, ey);
    remaining -= take;
  }

  ctx.stroke();
}

export function createRenderer(canvas, gameState) {
  const ctx = canvas.getContext("2d");

  const GAME_OVER_ANIMATION_TIME = 1.1;

  function getCameraOffset() {
    return {
      x: gameState.player.x - canvas.width * 0.5,
      y: gameState.player.y - canvas.height * 0.5,
    };
  }

  function renderBackground() {
    const camera = getCameraOffset();
    ctx.fillStyle = CANVAS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    const gridSize = 40;
    const offsetX = ((-camera.x % gridSize) + gridSize) % gridSize;
    const offsetY = ((-camera.y % gridSize) + gridSize) % gridSize;

    for (let x = offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function renderIndicators() {
    gameState.indicators.forEach((indicator) => {
      const progress = Math.max(0, Math.min(1, indicator.elapsed / indicator.duration));

      if (indicator.type === "circle") {
        ctx.strokeStyle = "rgba(255, 70, 70, 0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(indicator.position.x, indicator.position.y, indicator.size.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 70, 70, 0.25)";
        ctx.beginPath();
        ctx.moveTo(indicator.position.x, indicator.position.y);
        ctx.arc(
          indicator.position.x,
          indicator.position.y,
          indicator.size.radius,
          -Math.PI * 0.5,
          -Math.PI * 0.5 + progress * Math.PI * 2
        );
        ctx.closePath();
        ctx.fill();
      }
    });
  }

  function renderDrops() {
    gameState.drops.forEach((drop) => {
      const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 7 + drop.position.x * 0.03);
      ctx.fillStyle = drop.color || "rgba(56, 212, 122, 0.9)";
      ctx.beginPath();
      ctx.arc(drop.position.x, drop.position.y, drop.radius + 2 + pulse * 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "15px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.98)";
      ctx.fillText(drop.icon || "✨", drop.position.x, drop.position.y + 1);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    });
  }

  function renderNukeWaves() {
    gameState.nukeWaves.forEach((wave) => {
      const progress = wave.maxRadius <= 0 ? 1 : Math.max(0, Math.min(1, wave.radius / wave.maxRadius));
      const alpha = 0.34 * (1 - progress * 0.55);
      ctx.strokeStyle = `rgba(255, 206, 128, ${alpha})`;
      ctx.lineWidth = wave.lineWidth || 18;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 246, 198, ${alpha * 0.85})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, Math.max(0, wave.radius - (wave.lineWidth || 18) * 0.35), 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function drawPickupLegendPanel(x, y, width) {
    renderPickupLegendPanel(ctx, x, y, width, wrapTextLines);
  }

  function drawControlsLegendPanel(x, y, width, title = "Controls") {
    renderControlsLegendPanel(ctx, x, y, width, wrapTextLines, title);
  }

  function drawTitleHistoryPanel(x, y, width, height) {
    renderTitleHistoryPanel(ctx, gameState, x, y, width, height);
  }

  function drawPerkLibraryOverlay() {
    renderPerkLibraryOverlay(ctx, canvas, gameState, wrapTextLines);
  }

  function drawPauseOverlay() {
    renderPauseOverlay(ctx, canvas, gameState, drawControlsLegendPanel, drawPickupLegendPanel);
  }

  function drawTitleScreen() {
    renderTitleScreen(ctx, canvas, gameState, drawControlsLegendPanel, drawTitleHistoryPanel, drawPerkLibraryOverlay);
  }
  function renderWorldObstacles() {
    const world = gameState.systems.world;
    if (!world) {
      return;
    }

    const obstacles = getVisibleObstacles(world, gameState.player.x, gameState.player.y, canvas.width, canvas.height, 120);
    for (let index = 0; index < obstacles.length; index += 1) {
      const obstacle = obstacles[index];

      if (obstacle.type === "mountain") {
        const ridge = obstacle.radius * (obstacle.ridgeRadiusFactor || 0.42);
        ctx.fillStyle = "rgba(68, 78, 92, 0.92)";
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(106, 121, 138, 0.55)";
        ctx.beginPath();
        ctx.arc(
          obstacle.x + (obstacle.ridgeOffsetX || -obstacle.radius * 0.2),
          obstacle.y + (obstacle.ridgeOffsetY || -obstacle.radius * 0.24),
          ridge,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.strokeStyle = "rgba(172, 184, 199, 0.26)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(obstacle.x, obstacle.y, obstacle.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (obstacle.type === "tree") {
        const treeState = obstacle.treeState?.burnState || "healthy";
        if (treeState === "burned") {
          ctx.fillStyle = "rgba(34, 34, 34, 0.88)";
          ctx.beginPath();
          ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(96, 96, 96, 0.42)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(obstacle.x, obstacle.y, obstacle.radius + 1, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = treeState === "burning" ? "rgba(96, 82, 44, 0.84)" : "rgba(35, 120, 72, 0.72)";
          ctx.beginPath();
          ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
          ctx.fill();

          if (treeState === "burning") {
            const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 14 + obstacle.x * 0.03);
            ctx.fillStyle = `rgba(255, 132, 68, ${0.22 + pulse * 0.24})`;
            ctx.beginPath();
            ctx.arc(obstacle.x, obstacle.y, obstacle.radius + 4 + pulse * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 222, 146, ${0.4 + pulse * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(obstacle.x, obstacle.y, Math.max(4, obstacle.radius - 2), 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeStyle = "rgba(112, 208, 140, 0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(obstacle.x, obstacle.y, obstacle.radius + 1, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }
  }

  function renderEntities() {
    const player = gameState.player;

    if (player.blinkPreview?.active) {
      const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 10);
      ctx.strokeStyle = `rgba(126, 230, 255, ${0.45 + pulse * 0.45})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.blinkPreview.x, player.blinkPreview.y, player.radius + 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(126, 230, 255, 0.45)";
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.blinkPreview.x, player.blinkPreview.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (player.shoutPreview?.active) {
      const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 9);
      ctx.strokeStyle = `rgba(156, 255, 244, ${0.3 + pulse * 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.shoutRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = `rgba(196, 255, 248, ${0.22 + pulse * 0.24})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, Math.max(0, player.shoutRadius - 10), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "#6ec6ff";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    if (Array.isArray(player.activeDurationBars) && player.activeDurationBars.length > 0) {
      const barWidth = 54;
      const barHeight = 5;
      const barGap = 3;
      const startY = player.y + player.radius + 8;
      for (let i = 0; i < player.activeDurationBars.length; i += 1) {
        const bar = player.activeDurationBars[i];
        const ratio = bar.duration <= 0 ? 0 : Math.max(0, Math.min(1, bar.remaining / bar.duration));
        const x = player.x - barWidth * 0.5;
        const y = startY + i * (barHeight + barGap);

        ctx.fillStyle = "rgba(20, 20, 20, 0.68)";
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.fillStyle = bar.color || "rgba(255, 255, 255, 0.9)";
        ctx.fillRect(x, y, barWidth * ratio, barHeight);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
      }
    }

    gameState.enemies.forEach((enemy) => {
      if (enemy.isRespawning) {
        return;
      }

      if (enemy.type === "bomber") {
        const pulse = 0.45 + 0.55 * Math.sin(gameState.time * 8 + enemy.x * 0.01);
        const radius = enemy.explosionRadius || 78;
        ctx.strokeStyle = `rgba(255, 116, 144, ${0.24 + pulse * 0.28})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();

      if ((enemy.stunnedTimer || 0) > 0) {
        const pulse = 0.45 + 0.55 * Math.sin(gameState.time * 12 + enemy.x * 0.02);
        const markerY = enemy.y - enemy.radius - 18;
        ctx.strokeStyle = `rgba(176, 244, 255, ${0.5 + pulse * 0.45})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(enemy.x, markerY, 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(214, 250, 255, ${0.75 + pulse * 0.2})`;
        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.fillText("STUN", enemy.x, markerY + 4);
        ctx.textAlign = "start";
      }

      if (enemy.maxHp > 0 && enemy.hp > 0 && enemy.hp < enemy.maxHp) {
        const barWidth = Math.max(22, enemy.radius * 2.2);
        const barHeight = 4;
        const barX = enemy.x - barWidth * 0.5;
        const barY = enemy.y - enemy.radius - 10;
        drawBar(ctx, barX, barY, barWidth, barHeight, enemy.hp, enemy.maxHp, "#79e57e", "rgba(0,0,0,0.45)");
      }
    });
  }

  function renderPlayerReloadIndicator() {
    const player = gameState.player;
    const weapon = gameState.systems.weaponSystem;

    if (!weapon) {
      return;
    }

    const showChargeBar = weapon.isBowSelected && weapon.isBowSelected() && weapon.shouldShowChargeBar();
    const showBowReloadBar =
      weapon.isBowSelected && weapon.isBowSelected() && !showChargeBar && weapon.isBowReloading && weapon.isBowReloading();
    const showAmmoBar = weapon.isGunSelected && weapon.isGunSelected() && !weapon.isReloading && weapon.shouldShowAmmoBar();
    const showReloadBar = weapon.isGunSelected && weapon.isGunSelected() && (weapon.isReloading || weapon.currentAmmo <= 0);

    if (!showReloadBar && !showAmmoBar && !showChargeBar && !showBowReloadBar) {
      return;
    }

    const width = 96;
    const height = 10;
    const feedback = typeof weapon.getReloadFeedback === "function" ? weapon.getReloadFeedback() : null;
    const failedReload = typeof weapon.hasFailedReload === "function" ? weapon.hasFailedReload() : false;
    const feedbackStrength = feedback ? Math.max(0, Math.min(1, feedback.strength)) : 0;
    const shake = feedback?.type === "miss" ? Math.sin(gameState.time * 90) * 2.5 * feedbackStrength : 0;
    const x = player.x - width * 0.5 + shake;
    const y = player.y - player.radius - 28;
    if (showReloadBar) {
      const reloadRatio = Math.max(0, Math.min(1, weapon.getReloadProgress()));
      const [start, end] =
        typeof weapon.getPerfectReloadWindow === "function"
          ? weapon.getPerfectReloadWindow(player)
          : weapon.perfectWindow;
      const progressColor = failedReload ? "#ff4d67" : "#ff8a65";
      const windowColor = failedReload ? "rgba(255, 120, 140, 0.22)" : "rgba(119, 255, 177, 0.35)";
      const markerColor = failedReload ? "#ffd6dc" : "rgba(255, 222, 138, 0.95)";

      const magazineSize = Math.max(1, weapon.getMagazineSize(player));
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = windowColor;
      ctx.fillRect(x + width * start, y, width * (end - start), height);

      ctx.fillStyle = progressColor;
      ctx.fillRect(x, y, width * reloadRatio, height);

      const markerX = x + width * reloadRatio;
      ctx.strokeStyle = markerColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(markerX, y - 2);
      ctx.lineTo(markerX, y + height + 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 222, 138, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);

      if (failedReload) {
        const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 18);
        ctx.strokeStyle = `rgba(255, 99, 132, ${0.35 + pulse * 0.55})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
      } else if (weapon.isReloading && reloadRatio >= start && reloadRatio <= end) {
        const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 24);
        ctx.strokeStyle = `rgba(119, 255, 177, ${0.4 + pulse * 0.6})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
      }

      if (feedback) {
        const impactColor = feedback.type === "perfect" ? "109, 255, 181" : "255, 95, 121";
        const radius = 16 + (1 - feedbackStrength) * 20;
        ctx.strokeStyle = `rgba(${impactColor}, ${0.85 * feedbackStrength})`;
        ctx.lineWidth = 2 + feedbackStrength;
        ctx.beginPath();
        ctx.arc(player.x, y + height * 0.5, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(${impactColor}, ${0.3 * feedbackStrength})`;
        ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
      }
    }

    if (showChargeBar) {
      const chargeRatio = Math.max(0, Math.min(1, weapon.getBowChargeProgress()));
      const [start, end] = weapon.getBowChargeWindow(player);
      const pulse = chargeRatio >= start && chargeRatio <= end ? 0.5 + 0.5 * Math.sin(gameState.time * 26) : 0;

      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = "rgba(136, 255, 236, 0.34)";
      ctx.fillRect(x + width * start, y, width * (end - start), height);

      ctx.fillStyle = "#82d8ff";
      ctx.fillRect(x, y, width * chargeRatio, height);

      const markerX = x + width * chargeRatio;
      ctx.strokeStyle = "rgba(205, 246, 255, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(markerX, y - 2);
      ctx.lineTo(markerX, y + height + 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(147, 226, 255, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);

      if (pulse > 0) {
        ctx.strokeStyle = `rgba(133, 255, 214, ${0.42 + pulse * 0.58})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
      }
    }

    if (showBowReloadBar) {
      const reloadRatio = Math.max(0, Math.min(1, weapon.getBowReloadProgress()));
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = "#ff8a65";
      ctx.fillRect(x, y, width * reloadRatio, height);

      const markerX = x + width * reloadRatio;
      ctx.strokeStyle = "rgba(255, 222, 138, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(markerX, y - 2);
      ctx.lineTo(markerX, y + height + 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 222, 138, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
    }

    if (showAmmoBar) {
      const magazineSize = Math.max(1, weapon.getMagazineSize(player));
      const ammoRatio = Math.max(0, Math.min(1, weapon.currentAmmo / magazineSize));
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "#ffd76e";
      ctx.fillRect(x, y, width * ammoRatio, height);
      ctx.strokeStyle = "rgba(255, 222, 138, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
    }
  }

  function renderProjectiles() {
    gameState.projectiles.forEach((projectile) => {
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(projectile.position.x, projectile.position.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function renderFireballs() {
    gameState.fireballs.forEach((fireball) => {
      const pulse = 0.5 + 0.5 * Math.sin(gameState.time * 16 + fireball.x * 0.01);
      ctx.fillStyle = `rgba(255, 122, 72, ${0.72 + pulse * 0.18})`;
      ctx.beginPath();
      ctx.arc(fireball.x, fireball.y, fireball.radius + 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 108, 62, ${0.2 + pulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(fireball.x, fireball.y, fireball.radius + 8 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 224, 132, ${0.58 + pulse * 0.22})`;
      ctx.beginPath();
      ctx.arc(fireball.x, fireball.y, fireball.radius * 0.52, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 190, 122, ${0.55 + pulse * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fireball.x, fireball.y, fireball.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function renderLingeringZones() {
    gameState.lingeringZones.forEach((zone) => {
      const lifeRatio = zone.maxLifetime <= 0 ? 0 : Math.max(0, Math.min(1, zone.lifetime / zone.maxLifetime));
      const alpha = 0.15 + lifeRatio * 0.25;

      if (zone.type === "fire") {
        ctx.fillStyle = `rgba(255, 126, 64, ${alpha})`;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 194, 112, ${alpha + 0.1})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, Math.max(4, zone.radius - 3), 0, Math.PI * 2);
        ctx.stroke();
      } else if (zone.type === "ice") {
        ctx.fillStyle = `rgba(92, 204, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(198, 244, 255, ${alpha + 0.08})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, Math.max(4, zone.radius - 3), 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  function renderSlashEffects() {
    gameState.slashEffects.forEach((slash) => {
      const progress = Math.max(0, Math.min(1, slash.elapsed / slash.duration));
      const alpha = 1 - progress;
      const startAngle = slash.angle - slash.arc * 0.5;
      const sweep = slash.arc * (0.45 + progress * 0.55);
      const endAngle = startAngle + sweep;
      const radius = slash.range * (0.72 + progress * 0.28);

      ctx.strokeStyle = `rgba(${slash.color}, ${0.75 * alpha})`;
      ctx.lineWidth = 12 * (1 - progress * 0.45);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(slash.x, slash.y, radius, startAngle, endAngle);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,255,255, ${0.32 * alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(slash.x, slash.y, Math.max(8, radius - 10), startAngle, endAngle);
      ctx.stroke();
      ctx.lineCap = "butt";
    });
  }

  function renderShoutWaves() {
    gameState.shoutWaves.forEach((wave) => {
      const progress = Math.max(0, Math.min(1, wave.elapsed / wave.duration));
      const radius = wave.maxRadius * progress;
      const alpha = 1 - progress;

      ctx.strokeStyle = `rgba(158, 255, 246, ${0.65 * alpha})`;
      ctx.lineWidth = Math.max(2, wave.thickness * (0.35 - progress * 0.2));
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(225, 255, 252, ${0.35 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, Math.max(0, radius - 8), 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function renderWeaponReticle() {
    const weapon = gameState.systems.weaponSystem;
    const player = gameState.player;
    const aim = player.aim;
    if (!weapon || !aim) {
      return;
    }

    const dx = aim.x - player.x;
    const dy = aim.y - player.y;
    const angle = Math.atan2(dy, dx);
    const aimDistance = Math.hypot(dx, dy);

    const laserAllowed =
      player.weaponLaserPointer &&
      ((weapon.isGunSelected && weapon.isGunSelected()) || (weapon.isBowSelected && weapon.isBowSelected()));
    if (laserAllowed) {
      const maxLen = 900;
      const length = Math.min(maxLen, aimDistance);
      const endX = player.x + Math.cos(angle) * length;
      const endY = player.y + Math.sin(angle) * length;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(255, 110, 110, 0.72)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (weapon.isGunSelected && weapon.isGunSelected()) {
      const radius = 8;
      ctx.strokeStyle = "rgba(255, 215, 122, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(aim.x - 12, aim.y);
      ctx.lineTo(aim.x + 12, aim.y);
      ctx.moveTo(aim.x, aim.y - 12);
      ctx.lineTo(aim.x, aim.y + 12);
      ctx.stroke();
      return;
    }

    if (weapon.isMeleeSelected && weapon.isMeleeSelected()) {
      const preview = weapon.getMeleePreview ? weapon.getMeleePreview() : null;
      if (!preview) {
        return;
      }

      const start = angle - preview.arc * 0.5;
      const end = angle + preview.arc * 0.5;
      ctx.strokeStyle = "rgba(132, 255, 236, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, preview.range, start, end);
      ctx.stroke();

      ctx.strokeStyle = "rgba(126, 255, 220, 0.38)";
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + Math.cos(angle) * preview.range, player.y + Math.sin(angle) * preview.range);
      ctx.stroke();
      return;
    }

    if (weapon.isBowSelected && weapon.isBowSelected()) {
      const charge = weapon.getBowChargeProgress ? weapon.getBowChargeProgress() : 0;
      const ring = 7 + charge * 9;
      ctx.strokeStyle = "rgba(146, 228, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function renderFloatingTexts() {
    gameState.floatingTexts.forEach((entry) => {
      const progress = Math.max(0, Math.min(1, entry.elapsed / entry.duration));
      const alpha = 1 - progress;
      const startScale = 1.16;
      const endScale = 0.66;
      const scale = startScale + (endScale - startScale) * progress;
      const isXp = entry.kind === "xp";
      const color = normalizeRgbColor(entry.color, isXp ? "149,255,206" : "255,198,150");

      ctx.save();
      ctx.translate(entry.x, entry.y);
      ctx.scale(scale, scale);
      ctx.font = `bold ${entry.size || 22}px monospace`;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = isXp ? 4 : 3.5;
      ctx.strokeStyle = `rgba(12, 22, 35, ${alpha * 0.95})`;
      ctx.strokeText(entry.text, 0, 0);
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.fillText(entry.text, 0, 0);
      ctx.restore();
    });
  }

  function renderOffscreenEnemyIndicators() {
    const camera = getCameraOffset();
    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;
    const edgePadding = 28;
    const halfW = centerX - edgePadding;
    const halfH = centerY - edgePadding;

    gameState.enemies.forEach((enemy) => {
      if (enemy.isRespawning) {
        return;
      }

      const sx = enemy.x - camera.x;
      const sy = enemy.y - camera.y;
      if (sx >= edgePadding && sx <= canvas.width - edgePadding && sy >= edgePadding && sy <= canvas.height - edgePadding) {
        return;
      }

      const dx = sx - centerX;
      const dy = sy - centerY;
      const inv = 1 / Math.max(Math.abs(dx) / Math.max(1, halfW), Math.abs(dy) / Math.max(1, halfH));
      const ix = centerX + dx * inv;
      const iy = centerY + dy * inv;
      const angle = Math.atan2(dy, dx);

      const size = enemy.type === "mortar" ? 10 : enemy.type === "bomber" ? 9 : 8;
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(angle);
      ctx.fillStyle =
        enemy.type === "mortar"
          ? "rgba(255, 178, 122, 0.95)"
          : enemy.type === "bomber"
            ? "rgba(255, 106, 138, 0.95)"
            : "rgba(255, 126, 126, 0.9)";
      ctx.beginPath();
      ctx.moveTo(size + 3, 0);
      ctx.lineTo(-size, -size * 0.7);
      ctx.lineTo(-size, size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  function renderEffects() {
    gameState.effects.forEach((effect) => {
      const alpha = 1 - effect.elapsed / effect.duration;
      const color = effect.color || "255, 220, 120";
      const growth = effect.growth ?? 18;
      ctx.strokeStyle = `rgba(${color}, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius + effect.elapsed * growth, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function renderPerkModal() {
    const player = gameState.player;
    if (!player.perkModalOpen) {
      return;
    }

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cardWidth = 300;
    const cardHeight = 190;
    const gap = 24;
    const startX = (canvas.width - (cardWidth * 3 + gap * 2)) / 2;
    const topY = canvas.height / 2 - cardHeight / 2;
    const rerollAnimationDuration = 0.28;
    const rerollAnimationProgress =
      player.perkRerollAnimationTimer > 0
        ? Math.max(0, Math.min(1, player.perkRerollAnimationTimer / rerollAnimationDuration))
        : 0;

    player.perkChoices.forEach((choice, index) => {
      const x = startX + index * (cardWidth + gap);
      const y = topY;
      const wobble = Math.sin((1 - rerollAnimationProgress) * 26 + index * 1.5) * 8 * rerollAnimationProgress;
      const scale = 1 - rerollAnimationProgress * 0.08;

      ctx.save();
      ctx.translate(x + cardWidth * 0.5, y + cardHeight * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-cardWidth * 0.5 + wobble, -cardHeight * 0.5);

      ctx.fillStyle = "#1e2a3d";
      ctx.fillRect(0, 0, cardWidth, cardHeight);
      ctx.strokeStyle = "#86f0ff";
      ctx.strokeRect(0, 0, cardWidth, cardHeight);

      const innerX = 16;
      const innerY = 30;
      const innerWidth = cardWidth - 32;
      const innerBottom = cardHeight - 16;

      ctx.save();
      ctx.beginPath();
      ctx.rect(8, 8, cardWidth - 16, cardHeight - 16);
      ctx.clip();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px monospace";
      const titleLines = wrapTextLines(ctx, choice.name, innerWidth);
      let cursorY = innerY;
      for (let i = 0; i < titleLines.length && cursorY <= innerBottom; i += 1) {
        ctx.fillText(titleLines[i], innerX, cursorY);
        cursorY += 22;
      }

      ctx.font = "13px monospace";
      ctx.fillStyle = "#d4e9ff";
      const descriptionLines = wrapTextLines(ctx, choice.description, innerWidth);
      const tagLines = wrapTextLines(ctx, `Tags: ${(choice.tags || []).join(", ")}`, innerWidth);
      const tagBlockHeight = Math.max(12, tagLines.length * 13);
      const iconY = innerBottom - tagBlockHeight - 18;
      const descriptionLimit = iconY - 26;
      for (let i = 0; i < descriptionLines.length && cursorY <= descriptionLimit; i += 1) {
        ctx.fillText(descriptionLines[i], innerX, cursorY);
        cursorY += 17;
      }

      const tagEmojis = (choice.tags || []).map((tag) => perkTagEmoji(tag)).slice(0, 3);
      const emojiSpacing = 90;
      const emojiStartX = cardWidth * 0.5 - ((tagEmojis.length - 1) * emojiSpacing) / 2;
      ctx.font = "bold 40px monospace";
      ctx.fillStyle = `rgba(130, 184, 220, ${0.1 + rerollAnimationProgress * 0.12})`;
      ctx.textAlign = "center";
      for (let i = 0; i < tagEmojis.length; i += 1) {
        ctx.fillText(tagEmojis[i], emojiStartX + i * emojiSpacing, iconY);
      }

      ctx.fillStyle = "#9dc7ff";
      ctx.font = "11px monospace";
      let tagsY = innerBottom - (tagLines.length - 1) * 13;
      ctx.textAlign = "start";
      for (let i = 0; i < tagLines.length; i += 1) {
        ctx.fillText(tagLines[i], innerX, tagsY);
        tagsY += 13;
      }

      ctx.restore();

      choice.__cardRect = { x, y, width: cardWidth, height: cardHeight };
      ctx.restore();
    });

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`Choose a perk (${player.perkPoints} point${player.perkPoints === 1 ? "" : "s"} left)`, canvas.width / 2, topY - 20);

    const rerollWidth = 170;
    const rerollHeight = 34;
    const rerollX = canvas.width * 0.5 - rerollWidth * 0.5;
    const rerollY = topY + cardHeight + 16;
    const selectionLocked = player.perkSelectionLockTimer > 0;
    const rerollEnabled = !!player.perkRerollAvailable && !selectionLocked;
    const buttonPulse = rerollEnabled ? 0.5 + 0.5 * Math.sin(gameState.time * 8) : 0;
    const unlockProgress = 1 - Math.max(0, Math.min(1, player.perkSelectionLockTimer / 0.5));

    if (selectionLocked) {
      const overlayAlpha = 0.18 + 0.18 * Math.max(0, Math.min(1, player.perkSelectionLockTimer / 0.5));
      player.perkChoices.forEach((choice) => {
        const rect = choice.__cardRect;
        if (!rect) {
          return;
        }
        ctx.fillStyle = `rgba(8, 14, 24, ${overlayAlpha})`;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        drawBorderProgress(ctx, rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3, unlockProgress, "rgba(136, 228, 255, 0.95)");
      });
    }

    ctx.fillStyle = rerollEnabled ? `rgba(38, 66, 98, ${0.85 + buttonPulse * 0.1})` : "rgba(46, 46, 56, 0.8)";
    ctx.fillRect(rerollX, rerollY, rerollWidth, rerollHeight);
    ctx.strokeStyle = rerollEnabled ? "rgba(138, 228, 255, 0.95)" : "rgba(120, 120, 130, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rerollX, rerollY, rerollWidth, rerollHeight);

    ctx.fillStyle = rerollEnabled ? "#d9f8ff" : "#8d96a2";
    ctx.font = "bold 14px monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(
      selectionLocked ? `Unlocking ${player.perkSelectionLockTimer.toFixed(1)}s` : rerollEnabled ? "Reroll (1 left)" : "Reroll used",
      canvas.width * 0.5,
      rerollY + rerollHeight * 0.5 + 1
    );

    player.perkRerollRect = { x: rerollX, y: rerollY, width: rerollWidth, height: rerollHeight };

    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function renderPerkPointCounter() {
    const points = gameState.player.perkPoints;
    if (points <= 0 || gameState.player.perkModalOpen || gameState.gameOver) {
      return;
    }

    const baseX = canvas.width - 28;
    const baseY = canvas.height - 24;
    const t = gameState.time;
    const bobY = Math.sin(t * 5.2) * 5;
    const bobX = Math.sin(t * 3.8) * 2;
    const pulse = 0.92 + (Math.sin(t * 6.8) * 0.5 + 0.5) * 0.16;

    ctx.save();
    ctx.translate(baseX + bobX, baseY + bobY);
    ctx.scale(pulse, pulse);

    const label = `Perk Points: ${points}`;
    ctx.font = "bold 18px monospace";
    const textWidth = ctx.measureText(label).width;
    const paddingX = 14;
    const width = textWidth + paddingX * 2;
    const height = 34;

    ctx.fillStyle = "rgba(18, 30, 44, 0.82)";
    ctx.fillRect(-width, -height, width, height);
    ctx.strokeStyle = "rgba(126, 244, 210, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-width, -height, width, height);

    ctx.fillStyle = "#9fffe0";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, -paddingX, -height * 0.5 + 1);

    ctx.restore();
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function renderGameOverOverlay() {
    if (!gameState.gameOver) {
      return;
    }

    const progress = Math.max(0, Math.min(1, gameState.gameOverElapsed / GAME_OVER_ANIMATION_TIME));
    const eased = 1 - Math.pow(1 - progress, 3);

    ctx.fillStyle = `rgba(5, 0, 8, ${0.25 + 0.55 * eased})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const panelWidth = Math.min(canvas.width - 80, 560);
    const panelHeight = 220;
    const panelX = (canvas.width - panelWidth) * 0.5;
    const panelY = canvas.height * 0.5 - panelHeight * 0.5 + (1 - eased) * 18;

    ctx.fillStyle = `rgba(20, 12, 24, ${0.5 + 0.35 * eased})`;
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = `rgba(255, 118, 145, ${0.35 + 0.5 * eased})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255, 118, 145, ${0.5 + 0.5 * eased})`;
    ctx.font = "bold 56px monospace";
    ctx.fillText("GAME OVER", canvas.width * 0.5, panelY + 92);

    ctx.fillStyle = `rgba(237, 219, 228, ${0.45 + 0.55 * eased})`;
    ctx.font = "18px monospace";
    ctx.fillText(`Survived ${gameState.time.toFixed(1)}s`, canvas.width * 0.5, panelY + 132);

    if (progress >= 1) {
      const pulse = 0.65 + 0.35 * Math.sin(gameState.time * 6);
      ctx.fillStyle = `rgba(255, 224, 166, ${0.55 + 0.45 * pulse})`;
      ctx.font = "16px monospace";
      ctx.fillText("Press R for a new run or SPACE for title", canvas.width * 0.5, panelY + 172);
    }

    ctx.textAlign = "start";
  }

  return {
    ctx,
    render() {
      renderBackground();

      const camera = getCameraOffset();
      const shakePower = gameState.paused ? 0 : gameState.screenFx?.shake || 0;
      const shakeX = (Math.random() * 2 - 1) * shakePower;
      const shakeY = (Math.random() * 2 - 1) * shakePower;
      ctx.save();
      ctx.translate(shakeX - camera.x, shakeY - camera.y);
      renderWorldObstacles();
      renderIndicators();
      renderDrops();
      renderWeaponReticle();
      renderEntities();
      renderShoutWaves();
      renderPlayerReloadIndicator();
      renderLingeringZones();
      renderNukeWaves();
      renderFireballs();
      renderProjectiles();
      renderSlashEffects();
      renderFloatingTexts();
      renderEffects();
      ctx.restore();
      renderOffscreenEnemyIndicators();
      if (gameState.screenFx?.actionFlash > 0) {
        ctx.fillStyle = `rgba(126, 224, 255, ${Math.min(0.2, gameState.screenFx.actionFlash * 0.22)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (gameState.screenFx?.damageFlash > 0) {
        ctx.fillStyle = `rgba(255, 120, 120, ${Math.min(0.24, gameState.screenFx.damageFlash * 0.26)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      renderPerkPointCounter();
      drawPauseOverlay();
      renderPerkModal();
      renderGameOverOverlay();
      drawTitleScreen();
    },
  };
}

