function createEventBus() {
  const listeners = new Map();

  return {
    on(eventName, handler) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName).add(handler);
      return () => {
        listeners.get(eventName)?.delete(handler);
      };
    },
    emit(eventName, payload) {
      const handlers = listeners.get(eventName);
      if (!handlers) {
        return;
      }
      handlers.forEach((handler) => handler(payload));
    },
    clear() {
      listeners.clear();
    },
  };
}

export function createGameServices({ gameState, canvas, documentRef, isDebugMode }) {
  const events = createEventBus();
  let weaponSystem = gameState.systems.weaponSystem ?? null;

  return {
    canvas,
    document: documentRef,
    events,
    gameState,
    isDebugMode,
    getPlayer() {
      return gameState.player;
    },
    getWorld() {
      return gameState.systems.world;
    },
    setWorld(world) {
      gameState.systems.world = world;
      events.emit("world:changed", world);
    },
    getWeaponSystem() {
      return weaponSystem;
    },
    setWeaponSystem(nextWeaponSystem) {
      weaponSystem = nextWeaponSystem;
      gameState.systems.weaponSystem = nextWeaponSystem;
      events.emit("weaponSystem:changed", nextWeaponSystem);
    },
    resetEvents() {
      events.clear();
    },
  };
}