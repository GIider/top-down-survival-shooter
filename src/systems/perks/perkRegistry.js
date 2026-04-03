import { combatPerks } from "./modules/combatPerks.js";
import { skillPerks } from "./modules/skillPerks.js";
import { utilityPerks } from "./modules/utilityPerks.js";

const perkDefinitions = [...combatPerks, ...skillPerks, ...utilityPerks];

export const perkRegistry = new Map(perkDefinitions.map((perk) => [perk.id, perk]));
