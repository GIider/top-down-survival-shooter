const STORAGE_KEY = "shoot-em-up.run-history";
const MAX_RUN_HISTORY = 40;

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const startedAt = Number(entry.startedAt);
  const timeSurvived = Number(entry.timeSurvived);
  const kills = Number(entry.kills);
  const version = typeof entry.version === "string" && entry.version ? entry.version : "0.0";
  if (!Number.isFinite(startedAt) || !Number.isFinite(timeSurvived) || !Number.isFinite(kills)) {
    return null;
  }

  return {
    startedAt,
    timeSurvived: Math.max(0, timeSurvived),
    kills: Math.max(0, Math.floor(kills)),
    version,
  };
}

export function loadRunHistory(storage = globalThis.localStorage) {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(sanitizeEntry).filter(Boolean).slice(0, MAX_RUN_HISTORY);
  } catch {
    return [];
  }
}

export function saveRunHistory(history, storage = globalThis.localStorage) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_RUN_HISTORY)));
  } catch {
    // Ignore storage failures and continue without persistence.
  }
}

export function sortRunHistory(history, sortMode) {
  const list = [...history];
  if (sortMode === "time") {
    return list.sort((a, b) => b.timeSurvived - a.timeSurvived || b.kills - a.kills || b.startedAt - a.startedAt);
  }
  if (sortMode === "kills") {
    return list.sort((a, b) => b.kills - a.kills || b.timeSurvived - a.timeSurvived || b.startedAt - a.startedAt);
  }
  return list.sort((a, b) => b.startedAt - a.startedAt);
}

export function formatRunStartedAt(timestamp) {
  try {
    return new Date(timestamp).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(timestamp);
  }
}