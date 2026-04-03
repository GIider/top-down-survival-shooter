import { GAME_CONFIG } from "../constants.js";
import { skillPerkCatalog } from "../../systems/perks/skillPerkCatalog.js";

export function renderPerkLibraryOverlay(ctx, canvas, gameState, wrapTextLines) {
  const ui = GAME_CONFIG.ui.perkLibrary;
  const totalPerks = skillPerkCatalog.length;
  let seenCount = 0;
  let acquiredCount = 0;
  for (let i = 0; i < skillPerkCatalog.length; i += 1) {
    const perk = skillPerkCatalog[i];
    if (gameState.perkProgress.seen[perk.id]) {
      seenCount += 1;
    }
    if (gameState.perkProgress.activated[perk.id]) {
      acquiredCount += 1;
    }
  }
  const notSeenCount = Math.max(0, totalPerks - seenCount);

  const allTags = new Set();
  for (let i = 0; i < skillPerkCatalog.length; i += 1) {
    const perk = skillPerkCatalog[i];
    for (let tagIndex = 0; tagIndex < (perk.tags || []).length; tagIndex += 1) {
      allTags.add(perk.tags[tagIndex]);
    }
  }

  const filterOptions = ["all", ...Array.from(allTags).sort()];
  if (!filterOptions.includes(gameState.titlePerkLibraryFilter)) {
    gameState.titlePerkLibraryFilter = "all";
  }

  const filterTag = gameState.titlePerkLibraryFilter || "all";
  const filteredPerks = skillPerkCatalog.filter((perk) => filterTag === "all" || (perk.tags || []).includes(filterTag));

  ctx.fillStyle = "rgba(4, 8, 14, 0.8)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const modalX = ui.modalInsetX;
  const modalY = ui.modalInsetY;
  const modalWidth = canvas.width - ui.modalInsetX * 2;
  const modalHeight = canvas.height - ui.modalInsetY * 2;
  gameState.titlePerkLibraryModalRect = {
    x: modalX,
    y: modalY,
    width: modalWidth,
    height: modalHeight,
  };

  ctx.fillStyle = "rgba(9, 18, 29, 0.97)";
  ctx.fillRect(modalX, modalY, modalWidth, modalHeight);
  ctx.strokeStyle = "rgba(136, 228, 255, 0.46)";
  ctx.lineWidth = 2;
  ctx.strokeRect(modalX, modalY, modalWidth, modalHeight);

  ctx.fillStyle = "#dff8ff";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Perk Library", modalX + 20, modalY + 40);

  const closeRect = {
    x: modalX + modalWidth - ui.closeButton.rightOffset,
    y: modalY + ui.closeButton.topOffset,
    width: ui.closeButton.width,
    height: ui.closeButton.height,
  };
  gameState.titlePerkLibraryCloseRect = closeRect;
  ctx.fillStyle = "rgba(52, 34, 42, 0.9)";
  ctx.fillRect(closeRect.x, closeRect.y, closeRect.width, closeRect.height);
  ctx.strokeStyle = "rgba(250, 180, 193, 0.85)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(closeRect.x, closeRect.y, closeRect.width, closeRect.height);
  ctx.fillStyle = "#ffe5ed";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Close", closeRect.x + closeRect.width * 0.5, closeRect.y + closeRect.height * 0.5 + 1);

  ctx.fillStyle = "#9ec5da";
  ctx.font = "11px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    `Acquired: ${acquiredCount}   Seen: ${seenCount}   Not Seen: ${notSeenCount}`,
    closeRect.x - 16,
    modalY + 40
  );

  const filterRect = {
    x: modalX + ui.filter.x,
    y: modalY + ui.filter.y,
    width: ui.filter.width,
    height: ui.filter.height,
  };
  gameState.titlePerkLibraryFilterRect = filterRect;

  ctx.fillStyle = "rgba(24, 37, 52, 0.92)";
  ctx.fillRect(filterRect.x, filterRect.y, filterRect.width, filterRect.height);
  ctx.strokeStyle = "rgba(108, 146, 174, 0.7)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(filterRect.x, filterRect.y, filterRect.width, filterRect.height);
  ctx.fillStyle = "#cde8f9";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`Filter: ${filterTag === "all" ? "All" : filterTag}`, filterRect.x + 10, filterRect.y + filterRect.height * 0.5 + 1);
  ctx.textAlign = "right";
  ctx.fillText(gameState.titlePerkLibraryFilterDropdownOpen ? "▲" : "▼", filterRect.x + filterRect.width - 10, filterRect.y + filterRect.height * 0.5 + 1);

  gameState.titlePerkLibraryFilterRects = [];
  const optionHeight = ui.filter.optionHeight;
  const optionWidth = filterRect.width;
  const dropdownY = filterRect.y + filterRect.height + 2;
  const dropdownHeight = filterOptions.length * optionHeight;

  if (gameState.titlePerkLibraryFilterDropdownOpen) {
    for (let i = 0; i < filterOptions.length; i += 1) {
      const option = filterOptions[i];
      gameState.titlePerkLibraryFilterRects.push({
        x: filterRect.x,
        y: dropdownY + i * optionHeight,
        width: optionWidth,
        height: optionHeight,
        filter: option,
      });
    }
  }

  const cardsTop = modalY + ui.cards.topOffset;
  const cardsBottom = modalY + modalHeight - ui.cards.bottomOffset;
  const cardGap = ui.cards.gap;
  const cardHeight = ui.cards.height;
  const cardStride = cardHeight + cardGap;
  const contentHeight = filteredPerks.length > 0 ? filteredPerks.length * cardStride - cardGap : 0;
  const viewHeight = Math.max(0, cardsBottom - cardsTop);
  const maxScroll = Math.max(0, contentHeight - viewHeight);
  gameState.titlePerkLibraryScrollMax = maxScroll;
  gameState.titlePerkLibraryScrollOffset = Math.max(0, Math.min(maxScroll, gameState.titlePerkLibraryScrollOffset || 0));

  gameState.titlePerkLibraryScrollAreaRect = {
    x: modalX + 16,
    y: cardsTop,
    width: modalWidth - 32,
    height: viewHeight,
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(modalX + 16, cardsTop, modalWidth - 32, viewHeight);
  ctx.clip();

  for (let i = 0; i < filteredPerks.length; i += 1) {
    const perk = filteredPerks[i];
    const cardY = cardsTop + i * cardStride - gameState.titlePerkLibraryScrollOffset;
    if (cardY + cardHeight < cardsTop || cardY > cardsBottom) {
      continue;
    }
    const seen = !!gameState.perkProgress.seen[perk.id];
    const activated = !!gameState.perkProgress.activated[perk.id];

    ctx.fillStyle = activated ? "rgba(38, 77, 99, 0.9)" : seen ? "rgba(28, 52, 68, 0.9)" : "rgba(44, 44, 50, 0.9)";
    ctx.fillRect(modalX + 20, cardY, modalWidth - 40, cardHeight);
    ctx.strokeStyle = activated ? "rgba(145, 231, 255, 0.92)" : seen ? "rgba(112, 178, 204, 0.72)" : "rgba(112, 112, 124, 0.62)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(modalX + 20, cardY, modalWidth - 40, cardHeight);

    if (!seen) {
      ctx.fillStyle = "#a2a7b8";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("????????????????", modalX + 34, cardY + 22);
      ctx.fillStyle = "#8f97aa";
      ctx.font = "11px monospace";
      ctx.fillText(`Tags: ${(perk.tags || []).join(", ")}`, modalX + 34, cardY + 42);
      continue;
    }

    ctx.fillStyle = "#e8f8ff";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(perk.name, modalX + 34, cardY + 20);

    ctx.fillStyle = "#9dc7ff";
    ctx.font = "11px monospace";
    ctx.fillText(`Tags: ${(perk.tags || []).join(", ")}`, modalX + 34, cardY + 36);

    if (activated) {
      ctx.fillStyle = "#cde6f3";
      ctx.font = "11px monospace";
      const lines = wrapTextLines(ctx, perk.description, modalWidth - 72);
      if (lines.length > 0) {
        ctx.fillText(lines[0], modalX + 34, cardY + 50);
      }
    }
  }

  ctx.restore();

  const scrollTrackX = modalX + modalWidth - ui.scroll.trackRightOffset;
  const scrollTrackY = cardsTop;
  const scrollTrackHeight = viewHeight;
  const scrollTrackWidth = ui.scroll.trackWidth;
  ctx.fillStyle = "rgba(19, 34, 49, 0.82)";
  ctx.fillRect(scrollTrackX, scrollTrackY, scrollTrackWidth, scrollTrackHeight);
  if (maxScroll > 0) {
    const thumbHeight = Math.max(ui.scroll.minThumbHeight, (viewHeight / contentHeight) * viewHeight);
    const thumbTravel = scrollTrackHeight - thumbHeight;
    const thumbY = scrollTrackY + (gameState.titlePerkLibraryScrollOffset / maxScroll) * thumbTravel;
    ctx.fillStyle = "rgba(124, 194, 227, 0.9)";
    ctx.fillRect(scrollTrackX, thumbY, scrollTrackWidth, thumbHeight);
  }

  ctx.fillStyle = "#9ec5da";
  ctx.font = "11px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Scroll: wheel or drag", modalX + modalWidth * 0.5, modalY + modalHeight - 20);

  if (gameState.titlePerkLibraryFilterDropdownOpen) {
    ctx.fillStyle = "rgba(11, 22, 35, 0.97)";
    ctx.fillRect(filterRect.x, dropdownY, optionWidth, dropdownHeight);
    ctx.strokeStyle = "rgba(108, 146, 174, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(filterRect.x, dropdownY, optionWidth, dropdownHeight);

    for (let i = 0; i < gameState.titlePerkLibraryFilterRects.length; i += 1) {
      const optionRect = gameState.titlePerkLibraryFilterRects[i];
      const option = optionRect.filter;
      const active = option === filterTag;
      ctx.fillStyle = active ? "rgba(48, 92, 120, 0.85)" : "rgba(18, 30, 46, 0.9)";
      ctx.fillRect(optionRect.x + 1, optionRect.y + 1, optionRect.width - 2, optionRect.height - 2);
      ctx.fillStyle = active ? "#effcff" : "#b8d4e6";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "12px monospace";
      ctx.fillText(option === "all" ? "All" : option, optionRect.x + 10, optionRect.y + optionRect.height * 0.5 + 1);
    }
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

export function renderPauseOverlay(ctx, canvas, gameState, renderControlsLegendPanel, renderPickupLegendPanel) {
  const ui = GAME_CONFIG.ui.pause;

  if (!gameState.paused || gameState.player.perkModalOpen || gameState.gameOver || gameState.titleScreen) {
    return;
  }

  ctx.fillStyle = "rgba(4, 10, 18, 0.5)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#dff8ff";
  ctx.font = "bold 46px monospace";
  ctx.fillText("PAUSED", canvas.width * 0.5, 112);
  ctx.font = "16px monospace";
  ctx.fillStyle = "rgba(212, 233, 255, 0.9)";
  ctx.fillText("Press SPACE to resume", canvas.width * 0.5, 146);

  renderControlsLegendPanel(ui.controlsPanelX, canvas.height - ui.panelBottomOffset, ui.panelWidth);
  renderPickupLegendPanel(canvas.width - ui.pickupPanelRightOffset, canvas.height - ui.panelBottomOffset, ui.panelWidth);
  ctx.textAlign = "start";
}

export function renderTitleScreen(ctx, canvas, gameState, renderControlsLegendPanel, renderTitleHistoryPanel, drawPerkLibraryOverlay) {
  const ui = GAME_CONFIG.ui.title;

  if (!gameState.titleScreen) {
    return;
  }

  ctx.fillStyle = "rgba(3, 8, 14, 0.78)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const historyWidth = Math.min(canvas.width - ui.history.widthMargin, ui.history.widthMax);
  const historyHeight = ui.history.height;
  const historyX = canvas.width * 0.5 - historyWidth * 0.5;
  const historyY = ui.history.y;
  const pulse = 0.55 + 0.45 * Math.sin(gameState.time * 2.4);

  gameState.titleStartRect = {
    x: canvas.width * 0.5 - ui.startButton.width * 0.5,
    y: canvas.height - ui.startButton.bottomOffset,
    width: ui.startButton.width,
    height: ui.startButton.height,
  };
  gameState.titlePerkLibraryToggleRect = {
    x: canvas.width - ui.libraryToggle.rightOffset,
    y: canvas.height - ui.libraryToggle.bottomOffset,
    width: ui.libraryToggle.width,
    height: ui.libraryToggle.height,
  };

  ctx.textAlign = "center";
  ctx.fillStyle = "#dff8ff";
  ctx.font = "bold 42px monospace";
  ctx.fillText("TOP-DOWN SURVIVAL SHOOTER", canvas.width * 0.5, ui.headingY);

  ctx.fillStyle = "rgba(181, 215, 234, 0.92)";
  ctx.font = "11px monospace";
  ctx.fillText(`v${gameState.appVersion || "0.0"}`, canvas.width * 0.5, ui.versionY);

  renderControlsLegendPanel(ui.controlsPanel.x, canvas.height - ui.controlsPanel.bottomOffset, ui.controlsPanel.width, "Action");

  const libraryOpen = !!gameState.titlePerkLibraryOpen;
  ctx.fillStyle = libraryOpen ? "rgba(61, 120, 150, 0.95)" : "rgba(28, 52, 68, 0.88)";
  ctx.fillRect(
    gameState.titlePerkLibraryToggleRect.x,
    gameState.titlePerkLibraryToggleRect.y,
    gameState.titlePerkLibraryToggleRect.width,
    gameState.titlePerkLibraryToggleRect.height
  );
  ctx.strokeStyle = libraryOpen ? "rgba(171, 240, 255, 0.95)" : "rgba(122, 186, 216, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    gameState.titlePerkLibraryToggleRect.x,
    gameState.titlePerkLibraryToggleRect.y,
    gameState.titlePerkLibraryToggleRect.width,
    gameState.titlePerkLibraryToggleRect.height
  );
  ctx.fillStyle = libraryOpen ? "#f2fdff" : "#d2e9f4";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    libraryOpen ? "Close Library" : "Open Perk Library",
    gameState.titlePerkLibraryToggleRect.x + gameState.titlePerkLibraryToggleRect.width * 0.5,
    gameState.titlePerkLibraryToggleRect.y + 18
  );

  ctx.fillStyle = `rgba(33, 67, 84, ${0.82 + pulse * 0.08})`;
  ctx.fillRect(gameState.titleStartRect.x, gameState.titleStartRect.y, gameState.titleStartRect.width, gameState.titleStartRect.height);
  ctx.strokeStyle = `rgba(255, 226, 166, ${0.75 + pulse * 0.25})`;
  ctx.strokeRect(gameState.titleStartRect.x, gameState.titleStartRect.y, gameState.titleStartRect.width, gameState.titleStartRect.height);
  ctx.fillStyle = `rgba(255, 238, 194, ${0.7 + pulse * 0.3})`;
  ctx.font = "bold 18px monospace";
  ctx.fillText("Press SPACE", gameState.titleStartRect.x + gameState.titleStartRect.width * 0.5, gameState.titleStartRect.y + 24);

  renderTitleHistoryPanel(historyX, historyY, historyWidth, historyHeight);
  if (libraryOpen) {
    drawPerkLibraryOverlay();
  } else {
    gameState.titlePerkLibraryModalRect = null;
    gameState.titlePerkLibraryCloseRect = null;
    gameState.titlePerkLibraryFilterRect = null;
    gameState.titlePerkLibraryFilterDropdownOpen = false;
    gameState.titlePerkLibraryFilterRects = [];
    gameState.titlePerkLibraryScrollAreaRect = null;
    gameState.titlePerkLibraryDragging = false;
    gameState.titlePerkLibraryScrollMax = 0;
  }
  ctx.textAlign = "start";
}
