export function updateEffects(gameState, dt) {
  for (let index = gameState.effects.length - 1; index >= 0; index -= 1) {
    const effect = gameState.effects[index];
    effect.elapsed += dt;
    if (effect.elapsed >= effect.duration) {
      gameState.effects.splice(index, 1);
    }
  }
}

export function updateSlashEffects(gameState, dt) {
  for (let index = gameState.slashEffects.length - 1; index >= 0; index -= 1) {
    const slash = gameState.slashEffects[index];
    slash.elapsed += dt;
    if (slash.elapsed >= slash.duration) {
      gameState.slashEffects.splice(index, 1);
    }
  }
}

export function updateFloatingTexts(gameState, dt) {
  for (let index = gameState.floatingTexts.length - 1; index >= 0; index -= 1) {
    const text = gameState.floatingTexts[index];
    text.elapsed += dt;
    text.x += text.vx * dt;
    text.y += text.vy * dt;
    text.vy += (text.gravity ?? -16) * dt;

    if (text.elapsed >= text.duration) {
      gameState.floatingTexts.splice(index, 1);
    }
  }

  gameState.screenFx.shake = Math.max(0, gameState.screenFx.shake - dt * 18);
  gameState.screenFx.damageFlash = Math.max(0, gameState.screenFx.damageFlash - dt * 2.8);
  gameState.screenFx.actionFlash = Math.max(0, gameState.screenFx.actionFlash - dt * 2.8);
}