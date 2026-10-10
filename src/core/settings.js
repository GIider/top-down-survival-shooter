const STORAGE_KEY = "shoot-em-up.settings";

export const AUTO_AIM_SNAP_MAX = 10;

export const DEFAULT_SETTINGS = {
  // 0 = off, 1..10 = increasingly snappy controller auto-aim.
  autoAimSnap: 6,
};

function sanitize(value) {
  const snap = Number(value?.autoAimSnap);
  return {
    autoAimSnap: Number.isFinite(snap)
      ? Math.max(0, Math.min(AUTO_AIM_SNAP_MAX, Math.round(snap)))
      : DEFAULT_SETTINGS.autoAimSnap,
  };
}

export function loadSettings(storage = globalThis.localStorage) {
  if (!storage) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitize(settings)));
  } catch {
    // Storage may be unavailable (private mode); settings just won't persist.
  }
}
