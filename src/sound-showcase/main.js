import { SFX_OVERRIDES_KEY, sfx } from "../audio/sfx.js";
import { SOUND_CATALOG } from "../audio/soundCatalog.js";
import { formatCatalogModule, parseSoundExport } from "../audio/soundCatalogFormat.js";
import { ZZFX_PARAMS, ZZFX_SAMPLE_RATE, buildSamples, normalizeParams, samplesToWav, trimParams } from "../audio/zzfx.js";

const LAB_STATE_KEY = "tdss.sfx.lab";
const PARAM_COUNT = ZZFX_PARAMS.length;

const els = {
  list: document.getElementById("sound-list"),
  volume: document.getElementById("master-volume"),
  title: document.getElementById("editor-title"),
  id: document.getElementById("editor-id"),
  cooldown: document.getElementById("cooldown"),
  duration: document.getElementById("duration"),
  wave: document.getElementById("wave"),
  grid: document.getElementById("param-grid"),
  autoPlay: document.getElementById("auto-play"),
  exportText: document.getElementById("export-text"),
  importText: document.getElementById("import-text"),
  status: document.getElementById("export-status"),
};

// Working copy of every sound; `baseline` is what the repo currently ships.
const baseline = new Map(
  SOUND_CATALOG.map((entry) => [entry.id, { params: normalizeParams(entry.params), cooldown: entry.cooldown ?? 0 }])
);
const working = new Map(
  SOUND_CATALOG.map((entry) => {
    const base = baseline.get(entry.id);
    return [entry.id, { params: [...base.params], cooldown: base.cooldown }];
  })
);
let selectedId = SOUND_CATALOG[0].id;
const paramInputs = [];

function paramsEqual(a, b) {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-9);
}

function isModified(id) {
  const current = working.get(id);
  const base = baseline.get(id);
  return !paramsEqual(current.params, base.params) || current.cooldown !== base.cooldown;
}

function loadStoredState() {
  try {
    const stored = JSON.parse(localStorage.getItem(LAB_STATE_KEY) || "null");
    if (!stored || typeof stored !== "object") {
      return;
    }
    Object.entries(stored).forEach(([id, value]) => {
      if (working.has(id) && value && Array.isArray(value.params)) {
        working.set(id, {
          params: normalizeParams(value.params),
          cooldown: Number.isFinite(Number(value.cooldown)) ? Number(value.cooldown) : baseline.get(id).cooldown,
        });
      }
    });
  } catch {
    // Corrupt or unavailable storage: start from the repo catalog.
  }
}

function persistState() {
  try {
    const changed = {};
    const overrides = {};
    working.forEach((value, id) => {
      if (isModified(id)) {
        changed[id] = { params: value.params, cooldown: value.cooldown };
        overrides[id] = value.params;
      }
    });
    localStorage.setItem(LAB_STATE_KEY, JSON.stringify(changed));
    localStorage.setItem(SFX_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Persistence is a convenience only.
  }
}

function setStatus(message) {
  els.status.textContent = message;
}

function currentEntry() {
  return working.get(selectedId);
}

function play(params = currentEntry().params) {
  sfx.unlock();
  sfx.playParams(params);
}

function buildExportEntries() {
  return SOUND_CATALOG.map((entry) => {
    const value = working.get(entry.id);
    return { ...entry, params: value.params, cooldown: value.cooldown };
  });
}

function renderExport() {
  els.exportText.value = formatCatalogModule(buildExportEntries());
}

function drawWave(params) {
  const canvas = els.wave;
  const ctx = canvas.getContext("2d");
  const samples = buildSamples(params, ZZFX_SAMPLE_RATE);
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  els.duration.textContent = `${(samples.length / ZZFX_SAMPLE_RATE).toFixed(2)} s, ${samples.length} samples`;
  if (samples.length === 0) {
    return;
  }
  ctx.strokeStyle = "#88e5b9";
  ctx.beginPath();
  const step = samples.length / width;
  for (let x = 0; x < width; x += 1) {
    const start = Math.floor(x * step);
    const end = Math.max(start + 1, Math.floor((x + 1) * step));
    let min = 1;
    let max = -1;
    for (let i = start; i < end && i < samples.length; i += 1) {
      min = Math.min(min, samples[i]);
      max = Math.max(max, samples[i]);
    }
    ctx.moveTo(x + 0.5, height / 2 - Math.max(-1, Math.min(1, max)) * (height / 2 - 4));
    ctx.lineTo(x + 0.5, height / 2 - Math.max(-1, Math.min(1, min)) * (height / 2 - 4));
  }
  ctx.stroke();
}

function refreshEditor() {
  const entry = currentEntry();
  const catalogEntry = SOUND_CATALOG.find((item) => item.id === selectedId);
  const base = baseline.get(selectedId);
  els.title.textContent = catalogEntry.label;
  els.id.textContent = `id: ${selectedId} · ${catalogEntry.group}`;
  els.cooldown.value = String(entry.cooldown);

  entry.params.forEach((value, index) => {
    const inputs = paramInputs[index];
    inputs.range.value = String(value);
    if (inputs.number) {
      inputs.number.value = String(Math.round(value * 1000) / 1000);
    }
    inputs.row.classList.toggle("changed", Math.abs(value - base.params[index]) > 1e-9);
  });
  drawWave(entry.params);
}

function refreshList() {
  els.list.querySelectorAll(".snd-item").forEach((button) => {
    const id = button.dataset.id;
    button.setAttribute("aria-current", String(id === selectedId));
    button.classList.toggle("modified", isModified(id));
  });
}

function afterEdit({ audition } = {}) {
  persistState();
  refreshEditor();
  refreshList();
  renderExport();
  if (audition && els.autoPlay.checked) {
    play();
  }
}

function selectSound(id, { audition = false } = {}) {
  selectedId = id;
  refreshEditor();
  refreshList();
  if (audition) {
    play();
  }
}

function buildList() {
  const groups = [...new Set(SOUND_CATALOG.map((entry) => entry.group))];
  groups.forEach((group) => {
    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = group;
    els.list.appendChild(title);
    SOUND_CATALOG.filter((entry) => entry.group === group).forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "snd-item";
      button.dataset.id = entry.id;
      button.innerHTML =
        '<span class="dot" title="Modified"></span><span class="name"></span><span class="play">▶</span>';
      const name = button.querySelector(".name");
      name.textContent = entry.label;
      const idLine = document.createElement("span");
      idLine.className = "id";
      idLine.textContent = entry.id;
      name.appendChild(idLine);
      button.addEventListener("click", () => selectSound(entry.id, { audition: true }));
      els.list.appendChild(button);
    });
  });
}

function setParam(index, value) {
  const def = ZZFX_PARAMS[index];
  const clamped = Number.isFinite(value) ? value : def.def;
  currentEntry().params[index] = clamped;
  afterEdit({ audition: true });
}

function buildParamGrid() {
  ZZFX_PARAMS.forEach((def, index) => {
    const row = document.createElement("label");
    row.className = "param";
    const name = document.createElement("span");
    name.textContent = def.label;
    row.appendChild(name);

    if (def.options) {
      const select = document.createElement("select");
      def.options.forEach((option, optionIndex) => {
        const node = document.createElement("option");
        node.value = String(optionIndex);
        node.textContent = option;
        select.appendChild(node);
      });
      select.addEventListener("change", () => setParam(index, Number(select.value)));
      row.appendChild(select);
      row.appendChild(document.createElement("span"));
      paramInputs[index] = { row, range: select, number: null };
    } else {
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(def.min);
      range.max = String(def.max);
      range.step = String(def.step);
      const number = document.createElement("input");
      number.type = "number";
      number.step = String(def.step);
      range.addEventListener("input", () => setParam(index, Number(range.value)));
      number.addEventListener("change", () => setParam(index, Number(number.value)));
      row.appendChild(range);
      row.appendChild(number);
      paramInputs[index] = { row, range, number };
    }
    els.grid.appendChild(row);
  });
}

function mutateCurrent() {
  const entry = currentEntry();
  entry.params = entry.params.map((value, index) => {
    const def = ZZFX_PARAMS[index];
    if (def.options || value === 0 || index === 0) {
      return value;
    }
    const span = def.max - def.min;
    const jittered = value + (Math.random() * 2 - 1) * span * 0.04;
    return Math.min(def.max, Math.max(def.min, jittered));
  });
  afterEdit({ audition: true });
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage);
  } catch {
    setStatus("Clipboard unavailable - select the text and copy manually.");
  }
}

function download(filename, bytes, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyImport() {
  const parsed = parseSoundExport(els.importText.value);
  let applied = 0;
  Object.entries(parsed.entries).forEach(([id, value]) => {
    if (!working.has(id)) {
      return;
    }
    const entry = working.get(id);
    entry.params = normalizeParams(value.params);
    if (Number.isFinite(value.cooldown)) {
      entry.cooldown = value.cooldown;
    }
    applied += 1;
  });
  if (parsed.single) {
    currentEntry().params = normalizeParams(parsed.single);
    applied += 1;
  }
  if (applied === 0) {
    setStatus("Nothing imported: no recognised sound ids or ZzFX arrays found.");
    return;
  }
  afterEdit({ audition: true });
  setStatus(`Imported ${applied} sound${applied === 1 ? "" : "s"}.`);
}

function wireControls() {
  document.getElementById("btn-play").addEventListener("click", () => play());
  document.getElementById("btn-mutate").addEventListener("click", mutateCurrent);
  document.getElementById("btn-reset").addEventListener("click", () => {
    const base = baseline.get(selectedId);
    working.set(selectedId, { params: [...base.params], cooldown: base.cooldown });
    afterEdit({ audition: true });
  });
  document.getElementById("btn-reset-all").addEventListener("click", () => {
    baseline.forEach((base, id) => working.set(id, { params: [...base.params], cooldown: base.cooldown }));
    afterEdit();
    setStatus("All sounds reset to the repo catalog.");
  });
  document.getElementById("btn-copy-array").addEventListener("click", () => {
    const text = `[${trimParams(currentEntry().params).map((v) => Math.round(v * 1000) / 1000).join(", ")}]`;
    copyText(text, `Copied ${selectedId} array.`);
  });
  document.getElementById("btn-wav").addEventListener("click", () => {
    const wav = samplesToWav(buildSamples(currentEntry().params, ZZFX_SAMPLE_RATE), ZZFX_SAMPLE_RATE);
    download(`${selectedId}.wav`, wav, "audio/wav");
  });
  document.getElementById("btn-copy-export").addEventListener("click", () => {
    copyText(els.exportText.value, "Catalog module copied - paste over src/audio/soundCatalog.js.");
  });
  document.getElementById("btn-download-export").addEventListener("click", () => {
    download("soundCatalog.js", new TextEncoder().encode(els.exportText.value), "text/javascript");
    setStatus("Downloaded soundCatalog.js - replace src/audio/soundCatalog.js with it.");
  });
  document.getElementById("btn-copy-changed").addEventListener("click", () => {
    const changed = {};
    working.forEach((value, id) => {
      if (isModified(id)) {
        changed[id] = { params: trimParams(value.params), cooldown: value.cooldown };
      }
    });
    copyText(JSON.stringify(changed, null, 2), `Copied ${Object.keys(changed).length} changed sound(s).`);
  });
  document.getElementById("btn-import").addEventListener("click", applyImport);

  els.cooldown.addEventListener("change", () => {
    const value = Math.max(0, Math.round(Number(els.cooldown.value) || 0));
    currentEntry().cooldown = value;
    afterEdit();
  });

  els.volume.value = String(sfx.getVolume());
  els.volume.addEventListener("input", () => {
    sfx.setVolume(Number(els.volume.value));
  });
  els.volume.addEventListener("change", () => play());
}

buildList();
buildParamGrid();
loadStoredState();
wireControls();
refreshEditor();
refreshList();
renderExport();
persistState();
