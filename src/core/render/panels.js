import { GAME_CONFIG } from "../constants.js";
import { formatRunStartedAt, sortRunHistory } from "../runHistory.js";

export function renderPickupLegendPanel(ctx, x, y, width, wrapTextLines) {
  const rowsConfig = GAME_CONFIG.ui.legends.pickupRows;

  ctx.save();
  ctx.textAlign = "left";
  const headerHeight = 28;
  const nameColumnWidth = 118;
  const effectX = x + 18 + nameColumnWidth;
  const effectWidth = width - nameColumnWidth - 30;
  const rows = rowsConfig.map(([name, effect]) => {
    ctx.font = "12px monospace";
    const effectLines = wrapTextLines(ctx, effect, effectWidth);
    const rowHeight = Math.max(24, effectLines.length * 14 + 10);
    return { name, effectLines, rowHeight };
  });
  const contentHeight = rows.reduce((sum, row) => sum + row.rowHeight, 0);
  const height = headerHeight + contentHeight;

  ctx.fillStyle = "rgba(8, 18, 29, 0.9)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(150, 228, 255, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "rgba(88, 171, 206, 0.15)";
  ctx.fillRect(x, y, width, headerHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, width - 2, height - 2);
  ctx.clip();

  ctx.fillStyle = "#d8f6ff";
  ctx.font = "bold 11px monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("Pickup", x + 14, y + headerHeight * 0.5);
  ctx.fillText("Effect", effectX, y + headerHeight * 0.5);

  ctx.font = "12px monospace";
  let rowY = y + headerHeight;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    ctx.strokeStyle = "rgba(150, 228, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x, rowY);
    ctx.lineTo(x + width, rowY);
    ctx.stroke();

    ctx.fillStyle = "#f2fbff";
    ctx.fillText(row.name, x + 14, rowY + 15);
    ctx.fillStyle = "#cfe5f0";
    for (let lineIndex = 0; lineIndex < row.effectLines.length; lineIndex += 1) {
      ctx.fillText(row.effectLines[lineIndex], effectX, rowY + 15 + lineIndex * 14);
    }
    rowY += row.rowHeight;
  }

  ctx.restore();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "start";
  ctx.restore();
}

export function renderControlsLegendPanel(ctx, x, y, width, wrapTextLines, title = "Controls") {
  const rowsConfig = GAME_CONFIG.ui.legends.controlRows;

  ctx.save();
  ctx.textAlign = "left";
  const headerHeight = 28;
  const keyColumnWidth = 112;
  const actionX = x + 18 + keyColumnWidth;
  const actionWidth = width - keyColumnWidth - 30;
  const rows = rowsConfig.map(([keys, action]) => {
    ctx.font = "12px monospace";
    const actionLines = wrapTextLines(ctx, action, actionWidth);
    const rowHeight = Math.max(24, actionLines.length * 14 + 10);
    return { keys, actionLines, rowHeight };
  });
  const contentHeight = rows.reduce((sum, row) => sum + row.rowHeight, 0);
  const height = headerHeight + contentHeight;

  ctx.fillStyle = "rgba(8, 18, 29, 0.9)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(150, 228, 255, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "rgba(88, 171, 206, 0.15)";
  ctx.fillRect(x, y, width, headerHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, width - 2, height - 2);
  ctx.clip();

  ctx.fillStyle = "#d8f6ff";
  ctx.font = "bold 11px monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("Key", x + 14, y + headerHeight * 0.5);
  ctx.fillText(title, actionX, y + headerHeight * 0.5);

  ctx.font = "12px monospace";
  let rowY = y + headerHeight;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    ctx.strokeStyle = "rgba(150, 228, 255, 0.12)";
    ctx.beginPath();
    ctx.moveTo(x, rowY);
    ctx.lineTo(x + width, rowY);
    ctx.stroke();

    ctx.fillStyle = "#f2fbff";
    ctx.fillText(row.keys, x + 14, rowY + 15);
    ctx.fillStyle = "#cfe5f0";
    for (let lineIndex = 0; lineIndex < row.actionLines.length; lineIndex += 1) {
      ctx.fillText(row.actionLines[lineIndex], actionX, rowY + 15 + lineIndex * 14);
    }
    rowY += row.rowHeight;
  }

  ctx.restore();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "start";
  ctx.restore();
}

export function renderTitleHistoryPanel(ctx, gameState, x, y, width, height) {
  const titleUi = GAME_CONFIG.ui.title.history;
  const sortModes = [
    { key: "latest", label: "Latest Runs" },
    { key: "time", label: "Longest Time" },
    { key: "kills", label: "Most Kills" },
  ];
  const history = sortRunHistory(gameState.runHistory || [], gameState.runHistorySort || "latest").slice(0, titleUi.maxVisibleRuns);
  const buttonWidth = (width - titleUi.buttonGap * 2 - 32) / 3;
  const buttonY = y + titleUi.buttonY;
  const rowStartY = y + titleUi.rowStartY;
  const rowHeight = titleUi.rowHeight;

  gameState.titleSortRects = sortModes.map((mode, index) => ({
    sort: mode.key,
    x: x + 16 + index * (buttonWidth + titleUi.buttonGap),
    y: buttonY,
    width: buttonWidth,
    height: 28,
  }));

  ctx.fillStyle = "rgba(9, 18, 29, 0.9)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(136, 228, 255, 0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "#dff8ff";
  ctx.font = "bold 24px monospace";
  ctx.textAlign = "left";
  ctx.fillText("Run History", x + 16, y + 32);

  for (let i = 0; i < gameState.titleSortRects.length; i += 1) {
    const rect = gameState.titleSortRects[i];
    const active = rect.sort === gameState.runHistorySort;
    ctx.fillStyle = active ? "rgba(48, 92, 120, 0.92)" : "rgba(24, 37, 52, 0.88)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = active ? "rgba(154, 236, 255, 0.9)" : "rgba(108, 146, 174, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = active ? "#effcff" : "#b8d4e6";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sortModes[i].label, rect.x + rect.width * 0.5, rect.y + rect.height * 0.5 + 1);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#9ec5da";
  ctx.font = "11px monospace";
  ctx.fillText("Started", x + 16, rowStartY - 10);
  ctx.fillText("Time", x + 220, rowStartY - 10);
  ctx.fillText("Kills", x + 310, rowStartY - 10);

  if (history.length === 0) {
    ctx.fillStyle = "#b9d0df";
    ctx.font = "14px monospace";
    ctx.fillText("No runs recorded yet.", x + 16, rowStartY + 20);
    return;
  }

  for (let i = 0; i < history.length; i += 1) {
    const entry = history[i];
    const rowY = rowStartY + i * rowHeight;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)";
    ctx.fillRect(x + 12, rowY - 15, width - 24, rowHeight);
    ctx.fillStyle = "#eff7fb";
    ctx.font = "12px monospace";
    ctx.fillText(formatRunStartedAt(entry.startedAt), x + 16, rowY);
    ctx.fillText(`${entry.timeSurvived.toFixed(1)}s`, x + 220, rowY);
    ctx.fillText(String(entry.kills), x + 310, rowY);
    ctx.fillStyle = "#88aeca";
    ctx.font = "10px monospace";
    ctx.fillText(`v${entry.version || "0.0"}`, x + width - 56, rowY);
  }
}
