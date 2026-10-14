import { createBot, createForcedPerkBot } from "./bots/policies.js";
import { runGame } from "./runGame.js";

/** Runs a serialisable job: { bot, forcedPerk?, seed, duration, overrides } -> metrics. */
export function runJob(job) {
  const bot = job.forcedPerk ? createForcedPerkBot(job.bot, job.forcedPerk) : createBot(job.bot);
  return runGame({ seed: job.seed, bot, duration: job.duration, overrides: job.overrides });
}
