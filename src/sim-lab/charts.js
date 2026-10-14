// Tiny dependency-free SVG chart helpers for the balance lab.

export const PALETTE = ["#4cc9f0", "#f72585", "#ffd166", "#06d6a0", "#b388ff", "#ff9f1c", "#90be6d", "#e56b6f", "#7bdff2", "#c77dff", "#f4a261", "#a8dadc"];

export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const fmt = (v, d = 1) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d));

export function legend(items) {
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join("")}</div>`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** rows: [{label, color, p10, q1, median, q3, p90, mean}] */
export function boxPlot(rows, { unit = "s", width = 720 } = {}) {
  const left = 130;
  const right = 24;
  const rowH = 30;
  const height = rows.length * rowH + 34;
  const max = niceMax(Math.max(...rows.map((r) => r.p90), 1));
  const x = (v) => left + (v / max) * (width - left - right);
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Survival time distribution">`;
  for (let i = 0; i <= 5; i += 1) {
    const v = (max / 5) * i;
    svg += `<line x1="${x(v)}" x2="${x(v)}" y1="6" y2="${height - 24}" stroke="rgba(255,255,255,0.07)"/>`;
    svg += `<text class="muted" x="${x(v)}" y="${height - 8}" text-anchor="middle">${fmt(v, 0)}${unit}</text>`;
  }
  rows.forEach((r, i) => {
    const y = 14 + i * rowH;
    svg += `<text x="${left - 8}" y="${y + 5}" text-anchor="end">${esc(r.label)}</text>`;
    svg += `<line x1="${x(r.p10)}" x2="${x(r.p90)}" y1="${y}" y2="${y}" stroke="${r.color}" stroke-width="2"/>`;
    svg += `<rect x="${x(r.q1)}" y="${y - 8}" width="${Math.max(1, x(r.q3) - x(r.q1))}" height="16" rx="3" fill="${r.color}" fill-opacity="0.45" stroke="${r.color}"/>`;
    svg += `<line x1="${x(r.median)}" x2="${x(r.median)}" y1="${y - 9}" y2="${y + 9}" stroke="#fff" stroke-width="2"/>`;
    svg += `<circle cx="${x(r.mean)}" cy="${y}" r="3" fill="#0a0f14" stroke="#fff"/>`;
    svg += `<text class="muted" x="${x(r.p90) + 6}" y="${y + 4}">med ${fmt(r.median)}${unit}</text>`;
  });
  return `<div class="chart">${svg}</svg></div>`;
}

/** series: [{label,color,points:[[x,y]]}] */
export function lineChart(series, { width = 720, height = 280, xLabel = "", yLabel = "", xMax, yMax, yPercent = false, xTickLabels = null } = {}) {
  const l = 46;
  const r = 16;
  const t = 12;
  const b = 34;
  const allX = series.flatMap((s) => s.points.map((p) => p[0]));
  const allY = series.flatMap((s) => s.points.map((p) => p[1]));
  const xm = xMax ?? Math.max(...allX, 1);
  const ym = yMax ?? niceMax(Math.max(...allY, 1));
  const X = (v) => l + (v / xm) * (width - l - r);
  const Y = (v) => height - b - (v / ym) * (height - t - b);
  let svg = `<svg viewBox="0 0 ${width} ${height}">`;
  for (let i = 0; i <= 4; i += 1) {
    const v = (ym / 4) * i;
    svg += `<line x1="${l}" x2="${width - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,0.07)"/>`;
    svg += `<text class="muted" x="${l - 6}" y="${Y(v) + 4}" text-anchor="end">${yPercent ? fmt(v * 100, 0) + "%" : fmt(v, 0)}</text>`;
  }
  if (xTickLabels) {
    xTickLabels.forEach((label, i) => {
      svg += `<text class="muted" x="${X(i)}" y="${height - 16}" text-anchor="middle">${esc(label)}</text>`;
    });
  } else {
    for (let i = 0; i <= 5; i += 1) {
      const v = (xm / 5) * i;
      svg += `<text class="muted" x="${X(v)}" y="${height - 16}" text-anchor="middle">${fmt(v, 0)}</text>`;
    }
  }
  svg += `<text class="muted" x="${(l + width - r) / 2}" y="${height - 2}" text-anchor="middle">${esc(xLabel)}</text>`;
  svg += `<text class="muted" x="10" y="${t + 8}">${esc(yLabel)}</text>`;
  series.forEach((s) => {
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    if (s.markers) {
      s.points.forEach((p) => {
        svg += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="${s.color}"/>`;
      });
    }
  });
  return `<div class="chart">${svg}</svg></div>${legend(series.map((s) => ({ label: s.label, color: s.color })))}`;
}

/** rows: [{label, parts:{key:value}}], colors:{key:color}. Bars share one scale so totals compare. */
export function stackedBars(rows, colors, { width = 720, unit = "" } = {}) {
  const left = 130;
  const right = 70;
  const rowH = 28;
  const height = rows.length * rowH + 10;
  const totals = rows.map((r) => Object.values(r.parts).reduce((s, v) => s + v, 0));
  const max = Math.max(...totals, 1e-9);
  const scale = (width - left - right) / max;
  let svg = `<svg viewBox="0 0 ${width} ${height}">`;
  rows.forEach((r, i) => {
    const y = 6 + i * rowH;
    svg += `<text x="${left - 8}" y="${y + 14}" text-anchor="end">${esc(r.label)}</text>`;
    let cx = left;
    Object.entries(r.parts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, value]) => {
        const w = value * scale;
        if (w <= 0) return;
        svg += `<rect x="${cx}" y="${y}" width="${w}" height="18" fill="${colors[key] ?? "#888"}"><title>${esc(key)}: ${fmt(value)}${unit}</title></rect>`;
        cx += w;
      });
    svg += `<text class="muted" x="${cx + 6}" y="${y + 14}">${fmt(totals[i])}${unit}</text>`;
  });
  return `<div class="chart">${svg}</svg></div>`;
}

/** rows: [{label, value, ci?, sub?}] diverging around zero. */
export function divergingBars(rows, { width = 720, unit = "s" } = {}) {
  const left = 190;
  const right = 90;
  const rowH = 24;
  const height = rows.length * rowH + 14;
  const max = niceMax(Math.max(...rows.map((r) => Math.abs(r.value) + (r.ci || 0)), 1));
  const zero = left + (width - left - right) / 2;
  const half = (width - left - right) / 2;
  const X = (v) => zero + (v / max) * half;
  let svg = `<svg viewBox="0 0 ${width} ${height}"><line x1="${zero}" x2="${zero}" y1="2" y2="${height - 4}" stroke="rgba(255,255,255,0.3)"/>`;
  rows.forEach((r, i) => {
    const y = 8 + i * rowH;
    const color = r.value >= 0 ? "#88e5b9" : "#ff8a98";
    svg += `<text x="${left - 8}" y="${y + 12}" text-anchor="end">${esc(r.label)}</text>`;
    svg += `<rect x="${Math.min(zero, X(r.value))}" y="${y}" width="${Math.abs(X(r.value) - zero)}" height="15" rx="2" fill="${color}" fill-opacity="0.75"/>`;
    if (r.ci) {
      svg += `<line x1="${X(r.value - r.ci)}" x2="${X(r.value + r.ci)}" y1="${y + 7.5}" y2="${y + 7.5}" stroke="#fff" stroke-width="1.5"/>`;
    }
    svg += `<text class="muted" x="${width - right + 8}" y="${y + 12}">${r.value >= 0 ? "+" : ""}${fmt(r.value)}${unit}${r.sub ? " · " + esc(r.sub) : ""}</text>`;
  });
  return `<div class="chart">${svg}</svg></div>`;
}
