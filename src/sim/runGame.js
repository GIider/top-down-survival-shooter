import { stepSim } from "../core/simStep.js";
import { applyPerk, getPerkChoices } from "../systems/perkSystem.js";
import { applyConfigOverrides } from "./configOverrides.js";
import { createHeadlessGame } from "./createHeadlessGame.js";
import { createSeededRandom, withSeededRandom } from "./seededRandom.js";

export const SIM_DT = 1 / 60;

function resolvePerks(game, bot, rng) {
  const { player, perkEngine } = game;
  let guard = 0;
  while (player.perkPoints > 0 && guard < 50) {
    guard += 1;
    const choices = getPerkChoices(player, [], []);
    if (choices.length === 0) {
      player.perkPoints = 0;
      break;
    }
    const index = Math.max(0, Math.min(choices.length - 1, bot.choosePerk(player, choices, rng) | 0));
    applyPerk(player, choices[index], { perkEngine });
    player.perkPoints -= 1;
  }
  player.perkChoices = [];
}

/**
 * A steppable bot-driven game. Math.random must already be seeded by the caller
 * (runGame does this for batch runs; the lab's watch mode seeds it itself).
 */
export function createBotSession({ seed = 1, bot, startWeapon, sampleEvery = 60 }) {
  const botRng = createSeededRandom(seed ^ 0x9e3779b9);
  const game = createHeadlessGame({ seed, startWeapon: startWeapon ?? bot.startWeapon ?? 2 });
  const { gameState, player } = game;
  bot.reset?.(game, botRng);

  const metrics = {
    seed,
    bot: bot.name,
    timeSurvived: 0,
    died: false,
    kills: 0,
    bossKills: 0,
    level: 1,
    perks: [],
    minHp: player.hp,
    peakEnemies: 0,
    damageTaken: 0,
    firstBossTime: null,
    firstBossKillTime: null,
    timeline: [],
    weaponTime: { 1: 0, 2: 0, 3: 0, 4: 0 },
  };
  let hpSum = 0;
  let hpSamples = 0;
  let down = false;
  let lastHp = player.hp;
  let frame = 0;

  function finalize() {
    metrics.timeSurvived = gameState.time;
    metrics.kills = gameState.runStats.kills;
    metrics.bossKills = gameState.runStats.bossKills ?? 0;
    metrics.level = player.level;
    metrics.perks = player.ownedPerks.map((perk) => perk.id);
    metrics.damageBySource = { ...(gameState.damageBySource ?? {}) };
    metrics.killsByType = { ...(gameState.killsByType ?? {}) };
    metrics.xpByType = { ...(gameState.xpByType ?? {}) };
    metrics.avgHp = hpSamples ? hpSum / hpSamples : 0;
    return metrics;
  }

  return {
    game,
    metrics,
    finalize,
    get finished() {
      return metrics.died;
    },
    /** Advances one fixed frame. Returns false once the player is dead. */
    step() {
      frame += 1;
      if (gameState.screenFx.hitStop > 0) {
        gameState.screenFx.hitStop = Math.max(0, gameState.screenFx.hitStop - SIM_DT);
        return true;
      }

      const decision = bot.decide(game, SIM_DT, botRng) ?? {};
      const wantsDown = !!decision.fire;
      const clicked = wantsDown && !down;
      const releasedClick = !wantsDown && down;
      down = wantsDown;

      stepSim(game.ctx, SIM_DT, decision.movement ?? { x: 0, y: 0 }, () => ({
        worldPointer: { x: decision.aim?.x ?? player.x + 1, y: decision.aim?.y ?? player.y, down: wantsDown },
        clicked,
        releasedClick,
        reloadPressed: !!decision.reload,
        weaponSlot: decision.weaponSlot ?? 0,
        blinkHeld: false,
        blinkReleased: !!decision.blink,
        shoutHeld: false,
        shoutReleased: !!decision.shout,
        fireballPressed: !!decision.fireball,
        cancelPressed: false,
      }));

      if (player.perkPoints > 0) {
        resolvePerks(game, bot, botRng);
      }

      metrics.weaponTime[game.weaponSystem.selectedSlot] += SIM_DT;
      const hp = player.hp;
      if (hp < lastHp) {
        metrics.damageTaken += lastHp - hp;
      }
      lastHp = hp;
      metrics.minHp = Math.min(metrics.minHp, hp);
      hpSum += hp;
      hpSamples += 1;
      metrics.peakEnemies = Math.max(metrics.peakEnemies, gameState.enemies.length);
      if (metrics.firstBossTime === null && gameState.systems.boss?.activeBoss) {
        metrics.firstBossTime = gameState.time;
      }
      if (metrics.firstBossKillTime === null && (gameState.runStats.bossKills ?? 0) > 0) {
        metrics.firstBossKillTime = gameState.time;
      }
      if (frame % sampleEvery === 0) {
        metrics.timeline.push({ t: +gameState.time.toFixed(1), hp: Math.round(hp), enemies: gameState.enemies.length, level: player.level, kills: gameState.runStats.kills });
      }
      if (hp <= 0) {
        metrics.died = true;
        return false;
      }
      return true;
    },
  };
}

/**
 * Plays one deterministic run. Returns a metrics object.
 * options: { seed, bot, duration=900, startWeapon, overrides, sampleEvery }
 */
export function runGame({ seed = 1, bot, duration = 900, startWeapon, overrides, sampleEvery = 60 } = {}) {
  const restoreConfig = applyConfigOverrides(overrides);
  try {
    return withSeededRandom(seed, () => {
      const session = createBotSession({ seed, bot, startWeapon, sampleEvery });
      const maxFrames = Math.ceil(duration / SIM_DT);
      for (let frame = 0; frame < maxFrames; frame += 1) {
        if (!session.step()) {
          break;
        }
      }
      return session.finalize();
    });
  } finally {
    restoreConfig();
  }
}
