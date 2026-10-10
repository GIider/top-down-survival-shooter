import { SOUND_CATALOG } from "./soundCatalog.js";
import { ZZFX_SAMPLE_RATE, buildSamples, normalizeParams } from "./zzfx.js";

export const SFX_SETTINGS_KEY = "tdss.sfx.settings";
// Working copy written by the Sound Showcase page; only read by the game when `?sfxLab=1`.
export const SFX_OVERRIDES_KEY = "tdss.sfx.overrides";

const DEFAULT_SETTINGS = { volume: 0.6, muted: false };
const VARIANTS_PER_SOUND = 3;
const MAX_VOICES = 24;
const PITCH_JITTER = 0.03;

function readStorageJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorageJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota); settings simply won't persist.
  }
}

/**
 * Runtime sound player. All dependencies are injectable so the engine can run
 * (as a silent no-op) under Node tests where there is no Web Audio.
 */
export function createSfxEngine({
  AudioContextCtor = null,
  storage = null,
  catalog = SOUND_CATALOG,
  now = () => Date.now(),
  maxVoices = MAX_VOICES,
} = {}) {
  const definitions = new Map(catalog.map((entry) => [entry.id, entry]));
  const paramOverrides = new Map();
  const variantCache = new Map();
  const lastPlayedAt = new Map();
  const variantCursor = new Map();
  const settings = { ...DEFAULT_SETTINGS, ...(readStorageJson(storage, SFX_SETTINGS_KEY) || {}) };
  let context = null;
  let masterGain = null;
  let activeVoices = 0;
  let droppedPlays = 0;
  let silenced = false;

  function ensureContext() {
    if (context) {
      return context;
    }
    if (!AudioContextCtor) {
      return null;
    }
    try {
      context = new AudioContextCtor();
      const compressor = context.createDynamicsCompressor();
      masterGain = context.createGain();
      masterGain.gain.value = settings.muted ? 0 : settings.volume;
      masterGain.connect(compressor);
      compressor.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  function persistSettings() {
    writeStorageJson(storage, SFX_SETTINGS_KEY, { volume: settings.volume, muted: settings.muted });
  }

  function applyMasterGain() {
    if (masterGain) {
      masterGain.gain.value = settings.muted ? 0 : settings.volume;
    }
  }

  function getParams(id) {
    return paramOverrides.get(id) ?? definitions.get(id)?.params ?? null;
  }

  function startBuffer(buffer, { pitch = 1, volume = 1 } = {}) {
    const ctx = ensureContext();
    if (!ctx) {
      return false;
    }
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume();
    }
    if (activeVoices >= maxVoices) {
      droppedPlays += 1;
      return false;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * PITCH_JITTER);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(masterGain);
    activeVoices += 1;
    source.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    return true;
  }

  function createBuffer(params) {
    const samples = buildSamples(params, ZZFX_SAMPLE_RATE);
    if (samples.length === 0) {
      return null;
    }
    const buffer = context.createBuffer(1, samples.length, ZZFX_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  return {
    hasCatalogEntry(id) {
      return definitions.has(id);
    },

    // Play a catalogued sound. Returns true when a voice was actually started.
    play(id, options = {}) {
      if (silenced || settings.muted || settings.volume <= 0) {
        return false;
      }
      const definition = definitions.get(id);
      const params = getParams(id);
      if (!definition || !params || !ensureContext()) {
        return false;
      }

      const time = now();
      if (time - (lastPlayedAt.get(id) ?? -Infinity) < (definition.cooldown ?? 0)) {
        return false;
      }
      lastPlayedAt.set(id, time);

      // Each play of a sound rotates through a few pre-generated variants (ZzFX bakes the
      // randomness into the samples), generating them lazily to spread the cost.
      let variants = variantCache.get(id);
      if (!variants) {
        variants = [];
        variantCache.set(id, variants);
      }
      let buffer;
      if (variants.length < VARIANTS_PER_SOUND) {
        buffer = createBuffer(params);
        if (buffer) {
          variants.push(buffer);
        }
      } else {
        const cursor = ((variantCursor.get(id) ?? 0) + 1) % variants.length;
        variantCursor.set(id, cursor);
        buffer = variants[cursor];
      }
      return buffer ? startBuffer(buffer, options) : false;
    },

    // Play raw params (used by the showcase page); ignores cooldowns and the catalog.
    playParams(params, options = {}) {
      if (!ensureContext()) {
        return false;
      }
      const buffer = createBuffer(normalizeParams(params));
      return buffer ? startBuffer(buffer, options) : false;
    },

    setOverrides(map) {
      paramOverrides.clear();
      variantCache.clear();
      variantCursor.clear();
      Object.entries(map || {}).forEach(([id, params]) => {
        if (definitions.has(id) && Array.isArray(params)) {
          paramOverrides.set(id, normalizeParams(params));
        }
      });
    },

    // Non-persistent hard stop for pages that reuse game systems but must stay quiet (showcases).
    silence(value = true) {
      silenced = !!value;
    },

    getVolume() {
      return settings.volume;
    },
    setVolume(value) {
      settings.volume = Math.max(0, Math.min(1, Number(value) || 0));
      applyMasterGain();
      persistSettings();
    },
    isMuted() {
      return settings.muted;
    },
    setMuted(value) {
      settings.muted = !!value;
      applyMasterGain();
      persistSettings();
    },
    toggleMuted() {
      this.setMuted(!settings.muted);
      return settings.muted;
    },

    // Browsers keep the context suspended until a user gesture; call from a gesture handler.
    unlock() {
      const ctx = ensureContext();
      if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume();
      }
    },

    getStats() {
      return { activeVoices, droppedPlays };
    },
  };
}

function createDefaultEngine() {
  if (typeof window === "undefined") {
    return createSfxEngine();
  }
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const engine = createSfxEngine({
    AudioContextCtor: window.AudioContext || window.webkitAudioContext || null,
    storage,
    now: () => performance.now(),
  });

  // `?sfxLab=1` plays the game with the tweaks saved by the Sound Showcase page.
  try {
    if (new URLSearchParams(window.location.search).get("sfxLab") === "1") {
      const overrides = readStorageJson(storage, SFX_OVERRIDES_KEY);
      if (overrides) {
        engine.setOverrides(overrides);
      }
    }
  } catch {
    // Ignore malformed URLs/overrides and fall back to the catalog.
  }

  const unlock = () => engine.unlock();
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyM" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return;
    }
    if (!engine.toggleMuted()) {
      engine.play("uiClick");
    }
  });
  return engine;
}

export const sfx = createDefaultEngine();

export function playSfx(id, options) {
  return sfx.play(id, options);
}
