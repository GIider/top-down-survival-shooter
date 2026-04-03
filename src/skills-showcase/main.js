import { createRenderer } from "../core/renderer.js";
import { createGameServices } from "../core/gameServices.js";
import { createInitialState } from "../core/state.js";
import { createWorldSystem, updateBurningTrees } from "../systems/worldSystem.js";
import { updateEffects, updateFloatingTexts, updateSlashEffects } from "../systems/effectSystem.js";
import { updateIndicators } from "../systems/indicatorSystem.js";
import { updateCollisionSystem } from "../systems/collisionSystem.js";
import { updateBlinkCharges, updateBlinkPreview, tryBlink } from "../systems/skills/blink.js";
import { tryShout, updateShoutPreview, updateShoutWaves } from "../systems/skills/shout.js";
import { tryFireball, updateFireballs, updateLingeringZones } from "../systems/skills/fireball.js";
import { updateChaserSlimeBehavior } from "../systems/enemies/chaserSlime.js";
import { createEnemy } from "../entities/enemy.js";

const DT = 1 / 60;

const SKILL_DEFS = [
  {
    id: "blink",
    title: "Blink",
    badge: "Q",
    description: "Blink to target location",
    legend: "Hold Q to preview, release to blink.",
    key: "Q",
  },
  {
    id: "shout",
    title: "Shout",
    badge: "E",
    description: "Stun nearby enemies.",
    legend: "Hold E to preview, release to shout.",
    key: "E",
  },
  {
    id: "fireball",
    title: "Fireball",
    badge: "F",
    description:
      "Fireball ignites trees in flight, can be detonated with gun/bow shots or manually.",
    legend: "Second F press detonates mid-flight.",
    key: "F",
  },
];

const SHOUT_SPAWNS = [
  { x: 300, y: -90 },
  { x: 340, y: 0 },
  { x: 300, y: 90 },
  { x: 250, y: 46 },
];

const TREE_IDS = {
  flight: "skill-tree-flight",
  duoA: "skill-tree-duo-a",
  duoB: "skill-tree-duo-b",
};

function getSkillDef(id) {
  return SKILL_DEFS.find((entry) => entry.id === id) || SKILL_DEFS[0];
}

function createShowcaseWorld() {
  const world = createWorldSystem(424242);
  const healthy = () => ({ burnState: "healthy", burnTimer: 0 });

  world.treeStates.set(TREE_IDS.flight, healthy());
  world.treeStates.set(TREE_IDS.duoA, healthy());
  world.treeStates.set(TREE_IDS.duoB, healthy());

  world.chunkCache.set("-1,0", { cx: -1, cy: 0, obstacles: [] });
  world.chunkCache.set("0,0", {
    cx: 0,
    cy: 0,
    obstacles: [
      { type: "tree", treeId: TREE_IDS.flight, treeState: world.treeStates.get(TREE_IDS.flight), x: 40, y: 0, radius: 18 },
      { type: "tree", treeId: TREE_IDS.duoA, treeState: world.treeStates.get(TREE_IDS.duoA), x: 230, y: -58, radius: 18 },
      { type: "tree", treeId: TREE_IDS.duoB, treeState: world.treeStates.get(TREE_IDS.duoB), x: 230, y: 58, radius: 18 },
    ],
  });
  world.chunkCache.set("1,0", { cx: 1, cy: 0, obstacles: [] });

  return world;
}

function resetShowcaseTrees(sim) {
  for (const treeState of sim.state.systems.world.treeStates.values()) {
    treeState.burnState = "healthy";
    treeState.burnTimer = 0;
  }
}

function resetTransientState(sim) {
  sim.state.projectiles.length = 0;
  sim.state.indicators.length = 0;
  sim.state.effects.length = 0;
  sim.state.floatingTexts.length = 0;
  sim.state.slashEffects.length = 0;
  sim.state.shoutWaves.length = 0;
  sim.state.fireballs.length = 0;
  sim.state.lingeringZones.length = 0;
  sim.state.nukeWaves.length = 0;
  sim.state.drops.length = 0;
}

function setKeyHint(sim, mode, key) {
  if (!mode || !key) {
    sim.keyHint = "";
    return;
  }
  sim.keyHint = `${mode.toUpperCase()} ${key.toUpperCase()}`;
}

function setupBlinkScene(sim) {
  resetTransientState(sim);
  const player = sim.state.player;
  player.x = -140;
  player.y = 70;
  player.hp = player.maxHp;
  player.blinkMaxCharges = 1;
  player.blinkCharges = 1;
  player.blinkChargeTimer = 0;
  player.blinkCooldownRemaining = 0;
  player.blinkPreview.active = false;

  sim.sceneName = "Target And Blink";
  sim.phase = "preview";
  sim.phaseTimer = 1.35;
  sim.target = { x: 120, y: -20 };
  sim.castDone = false;
  setKeyHint(sim, "hold", "Q");
}

function updateBlinkScene(sim) {
  const worldPointer = { x: sim.target.x, y: sim.target.y };
  const player = sim.state.player;
  player.aim.x = worldPointer.x;
  player.aim.y = worldPointer.y;

  if (sim.phase === "preview") {
    updateBlinkPreview(sim.services, worldPointer, false);
    if (sim.phaseTimer <= 0) {
      sim.phase = "cast";
      sim.phaseTimer = 0.2;
      setKeyHint(sim, "release", "Q");
    }
  } else if (sim.phase === "cast") {
    updateBlinkPreview(sim.services, worldPointer, false);
    if (!sim.castDone) {
      tryBlink(sim.services, worldPointer);
      sim.castDone = true;
    }
    if (sim.phaseTimer <= 0) {
      sim.phase = "linger";
      sim.phaseTimer = 1.2;
      player.blinkPreview.active = false;
      setKeyHint(sim, "", "");
    }
  } else if (sim.phase === "linger") {
    player.blinkPreview.active = false;
    if (sim.phaseTimer <= 0) {
      sim.loopCount += 1;
      setupBlinkScene(sim);
    }
  }

  updateBlinkCharges(sim.services, DT);
  sim.phaseTimer -= DT;
}

function spawnShoutChasers(sim) {
  sim.state.enemies.length = 0;
  for (let i = 0; i < SHOUT_SPAWNS.length; i += 1) {
    const spawn = SHOUT_SPAWNS[i];
    const enemy = createEnemy("chaser", spawn.x, spawn.y, 8);
    enemy.speed *= 0.72;
    sim.state.enemies.push(enemy);
  }
}

function setupShoutScene(sim) {
  resetTransientState(sim);
  const player = sim.state.player;
  player.x = 0;
  player.y = 0;
  player.hp = player.maxHp;
  player.shoutCooldownRemaining = 0;
  player.shoutPreview.active = false;

  spawnShoutChasers(sim);

  sim.sceneName = "Approach, Stun, Recover";
  sim.phase = "preview";
  sim.phaseTimer = 1.45;
  sim.castDone = false;
  setKeyHint(sim, "hold", "E");
}

function updateShoutEnemies(sim) {
  const world = sim.state.systems.world;
  const player = sim.state.player;

  for (let i = 0; i < sim.state.enemies.length; i += 1) {
    const enemy = sim.state.enemies[i];
    enemy.stunnedTimer = Math.max(0, (enemy.stunnedTimer || 0) - DT);

    if (enemy.stunnedTimer <= 0) {
      updateChaserSlimeBehavior(enemy, player, world, DT, 0.6);
    }

    const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (dist < 150) {
      const spawn = SHOUT_SPAWNS[i % SHOUT_SPAWNS.length];
      enemy.x = spawn.x;
      enemy.y = spawn.y;
      enemy.stunnedTimer = Math.max(enemy.stunnedTimer, 0.25);
    }
  }
}

function updateShoutScene(sim) {
  const player = sim.state.player;

  if (sim.phase === "preview") {
    updateShoutPreview(sim.services, false);
    if (sim.phaseTimer <= 0) {
      sim.phase = "cast";
      sim.phaseTimer = 0.22;
      setKeyHint(sim, "release", "E");
    }
  } else if (sim.phase === "cast") {
    updateShoutPreview(sim.services, false);
    if (!sim.castDone) {
      tryShout(sim.services);
      sim.castDone = true;
    }
    if (sim.phaseTimer <= 0) {
      sim.phase = "stunned";
      sim.phaseTimer = 1.35;
      setKeyHint(sim, "", "");
      player.shoutPreview.active = false;
    }
  } else if (sim.phase === "stunned") {
    if (sim.phaseTimer <= 0) {
      sim.phase = "recovery";
      sim.phaseTimer = 1.2;
    }
  } else if (sim.phase === "recovery") {
    if (sim.phaseTimer <= 0) {
      sim.loopCount += 1;
      setupShoutScene(sim);
    }
  }

  player.shoutCooldownRemaining = Math.max(0, player.shoutCooldownRemaining - DT);
  updateShoutWaves(sim.services, DT);
  updateShoutEnemies(sim);
  sim.phaseTimer -= DT;
}

function setupFireballScene(sim) {
  resetTransientState(sim);
  resetShowcaseTrees(sim);

  const player = sim.state.player;
  player.x = -220;
  player.y = 0;
  player.hp = player.maxHp;
  player.fireballCooldownRemaining = 0;

  sim.sceneName = "Cast Through Tree, Manual Detonate";
  sim.phase = "cast";
  sim.phaseTimer = 0.26;
  sim.castDone = false;
  sim.manualDone = false;
  sim.fireballTarget = { x: 340, y: 0 };
  setKeyHint(sim, "press", "F");
}

function updateFireballScene(sim) {
  const player = sim.state.player;
  player.aim.x = sim.fireballTarget.x;
  player.aim.y = sim.fireballTarget.y;

  if (sim.phase === "cast") {
    if (!sim.castDone) {
      tryFireball(sim.services, sim.fireballTarget);
      sim.castDone = true;
    }
    if (sim.phaseTimer <= 0) {
      sim.phase = "travel";
      sim.phaseTimer = 1.0;
      setKeyHint(sim, "", "");
    }
  } else if (sim.phase === "travel") {
    const flightTreeState = sim.state.systems.world.treeStates.get(TREE_IDS.flight);
    const active = sim.state.fireballs[0];
    const passedFirstTree = active ? active.x > 70 : false;
    if ((flightTreeState?.burnState === "burning" && passedFirstTree) || sim.phaseTimer <= 0) {
      sim.phase = "manual";
      sim.phaseTimer = 0.35;
      setKeyHint(sim, "press", "F");
    }
  } else if (sim.phase === "manual") {
    if (!sim.manualDone) {
      tryFireball(sim.services, sim.fireballTarget);
      sim.manualDone = true;
    }
    if (sim.phaseTimer <= 0) {
      sim.phase = "after";
      sim.phaseTimer = 1.8;
      setKeyHint(sim, "", "");
    }
  } else if (sim.phase === "after") {
    if (sim.phaseTimer <= 0) {
      sim.loopCount += 1;
      setupFireballScene(sim);
    }
  }

  player.fireballCooldownRemaining = Math.max(0, player.fireballCooldownRemaining - DT);
  updateFireballs(sim.services, DT);
  updateLingeringZones(sim.services, DT);
  updateBurningTrees(sim.state.systems.world, DT);
  sim.phaseTimer -= DT;
}

function updateSharedSystems(sim) {
  updateCollisionSystem(sim.state, DT);
  const triggered = updateIndicators(sim.state.indicators, DT);
  for (let i = 0; i < triggered.length; i += 1) {
    if (typeof triggered[i].onTrigger === "function") {
      triggered[i].onTrigger();
    }
  }
  updateSlashEffects(sim.state, DT);
  updateEffects(sim.state, DT);
  updateFloatingTexts(sim.state, DT);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderKeyHint(sim) {
  if (!sim.keyHint) {
    return;
  }

  const ctx = sim.renderer.ctx;
  const centerX = canvas.width * 0.5;
  const y = canvas.height * 0.5 - sim.state.player.radius - 62;
  const text = sim.keyHint;
  const pressing = text.startsWith("PRESS");

  ctx.save();
  ctx.font = "bold 14px monospace";
  const paddingX = 11;
  const width = ctx.measureText(text).width + paddingX * 2;
  const height = 26;
  const x = centerX - width * 0.5;

  drawRoundedRect(ctx, x, y, width, height, 8);
  ctx.fillStyle = pressing ? "rgba(50, 86, 56, 0.9)" : "rgba(38, 56, 78, 0.9)";
  ctx.fill();
  ctx.strokeStyle = pressing ? "rgba(154, 246, 184, 0.9)" : "rgba(154, 224, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = pressing ? "#d7ffe8" : "#d9f4ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, centerX, y + height * 0.5 + 1);
  ctx.restore();
}

function createSimulation(skillId) {
  const state = createInitialState();
  state.running = true;
  state.paused = false;
  state.titleScreen = false;
  state.gameOver = false;
  state.systems.world = createShowcaseWorld();

  const services = createGameServices({
    gameState: state,
    canvas,
    documentRef: document,
    isDebugMode: false,
  });
  const renderer = createRenderer(canvas, state);

  const sim = {
    id: skillId,
    state,
    services,
    renderer,
    phase: "",
    phaseTimer: 0,
    sceneName: "",
    keyHint: "",
    loopCount: 0,
    castDone: false,
    manualDone: false,
    fireballTarget: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
  };

  if (skillId === "blink") {
    setupBlinkScene(sim);
  } else if (skillId === "shout") {
    setupShoutScene(sim);
  } else {
    setupFireballScene(sim);
  }

  return sim;
}

function updateSimulation(sim) {
  sim.state.time += DT;

  if (sim.id === "blink") {
    updateBlinkScene(sim);
  } else if (sim.id === "shout") {
    updateShoutScene(sim);
  } else {
    updateFireballScene(sim);
  }

  updateSharedSystems(sim);
}

function updateStats(sim) {
  const player = sim.state.player;
  const burning = [...sim.state.systems.world.treeStates.values()].filter((state) => state.burnState === "burning").length;
  const items = [
    `Scene ${sim.sceneName}`,
    `Phase ${sim.phase}`,
    `Loops ${sim.loopCount}`,
    `Player ${Math.round(player.x)}, ${Math.round(player.y)}`,
    `Burning Trees ${burning}`,
  ];
  statsEl.innerHTML = items.map((text) => `<span>${text}</span>`).join("");
}

const canvas = document.getElementById("skill-showcase-canvas");
const picker = document.getElementById("skill-picker");
const titleEl = document.getElementById("skill-showcase-title");
const badgeEl = document.getElementById("skill-showcase-badge");
const descEl = document.getElementById("skill-showcase-description");
const legendEl = document.getElementById("skill-showcase-legend");
const statsEl = document.getElementById("skill-showcase-stats");

for (let i = 0; i < SKILL_DEFS.length; i += 1) {
  const def = SKILL_DEFS[i];
  const option = document.createElement("option");
  option.value = def.id;
  option.textContent = `${def.title} (${def.badge})`;
  picker.appendChild(option);
}

function getInitialSkillFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("skill");
  if (!requested) {
    return SKILL_DEFS[0].id;
  }
  return getSkillDef(requested).id;
}

function setSkillInUrl(skillId) {
  const params = new URLSearchParams(window.location.search);
  params.set("skill", skillId);
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function syncMeta(skillId) {
  const def = getSkillDef(skillId);
  titleEl.textContent = def.title;
  badgeEl.textContent = def.badge;
  descEl.textContent = def.description;
  legendEl.textContent = def.legend;
}

let activeSim = createSimulation(getInitialSkillFromUrl());
picker.value = activeSim.id;
syncMeta(activeSim.id);
setSkillInUrl(activeSim.id);

picker.addEventListener("change", () => {
  const skillId = getSkillDef(picker.value).id;
  activeSim = createSimulation(skillId);
  syncMeta(skillId);
  setSkillInUrl(skillId);
});

function frame() {
  updateSimulation(activeSim);
  activeSim.renderer.render();
  renderKeyHint(activeSim);
  updateStats(activeSim);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
