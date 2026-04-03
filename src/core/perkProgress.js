const STORAGE_KEY = "shoot-em-up.perk-progress";

function sanitizeMap(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result = {};
  const entries = Object.entries(value);
  for (let i = 0; i < entries.length; i += 1) {
    const [key, entryValue] = entries[i];
    result[key] = entryValue === true;
  }
  return result;
}

export function loadPerkProgress(storage = globalThis.localStorage) {
  if (!storage) {
    return { seen: {}, activated: {}, disabled: {} };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { seen: {}, activated: {}, disabled: {} };
    }

    const parsed = JSON.parse(raw);
    return {
      seen: sanitizeMap(parsed?.seen),
      activated: sanitizeMap(parsed?.activated),
      disabled: sanitizeMap(parsed?.disabled),
    };
  } catch {
    return { seen: {}, activated: {}, disabled: {} };
  }
}

export function savePerkProgress(progress, storage = globalThis.localStorage) {
  if (!storage) {
    return;
  }

  try {
    const payload = {
      seen: sanitizeMap(progress?.seen),
      activated: sanitizeMap(progress?.activated),
      disabled: sanitizeMap(progress?.disabled),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore local storage failures.
  }
}
