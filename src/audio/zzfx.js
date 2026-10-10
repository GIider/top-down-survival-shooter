// ZzFX-compatible sample generator (ZzFX by Frank Force, MIT license).
// Pure function: no Web Audio dependency, so it also runs under Node (tests, WAV export).

export const ZZFX_SAMPLE_RATE = 44100;

// Parameter order matches ZzFX so patches from the ZzFX designer can be pasted in directly.
export const ZZFX_PARAMS = [
  { key: "volume", label: "Volume", min: 0, max: 2, step: 0.01, def: 1 },
  { key: "randomness", label: "Randomness", min: 0, max: 0.5, step: 0.01, def: 0.05 },
  { key: "frequency", label: "Frequency", min: 20, max: 2000, step: 1, def: 220 },
  { key: "attack", label: "Attack", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "sustain", label: "Sustain", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "release", label: "Release", min: 0, max: 1, step: 0.01, def: 0.1 },
  { key: "shape", label: "Shape", min: 0, max: 5, step: 1, def: 0, options: ["sine", "triangle", "saw", "tan", "noise", "square"] },
  { key: "shapeCurve", label: "Shape curve", min: 0, max: 3, step: 0.01, def: 1 },
  { key: "slide", label: "Slide", min: -5, max: 5, step: 0.01, def: 0 },
  { key: "deltaSlide", label: "Delta slide", min: -5, max: 5, step: 0.01, def: 0 },
  { key: "pitchJump", label: "Pitch jump", min: -1200, max: 1200, step: 1, def: 0 },
  { key: "pitchJumpTime", label: "Pitch jump time", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "repeatTime", label: "Repeat time", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "noise", label: "Noise", min: 0, max: 3, step: 0.01, def: 0 },
  { key: "modulation", label: "Modulation", min: -100, max: 100, step: 1, def: 0 },
  { key: "bitCrush", label: "Bit crush", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "delay", label: "Delay", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "sustainVolume", label: "Sustain volume", min: 0, max: 1, step: 0.01, def: 1 },
  { key: "decay", label: "Decay", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "tremolo", label: "Tremolo", min: 0, max: 1, step: 0.01, def: 0 },
  { key: "filter", label: "Filter", min: -2000, max: 2000, step: 10, def: 0 },
];

export function defaultParams() {
  return ZZFX_PARAMS.map((entry) => entry.def);
}

// Fill missing/invalid entries with defaults so partial arrays (as ZzFX allows) are valid.
export function normalizeParams(params) {
  const source = Array.isArray(params) ? params : [];
  return ZZFX_PARAMS.map((entry, index) => {
    const value = Number(source[index]);
    return Number.isFinite(value) ? value : entry.def;
  });
}

// Compact a params array for export: drop trailing default values, keep `undefined`-free output.
export function trimParams(params) {
  const full = normalizeParams(params);
  let end = full.length;
  while (end > 1 && full[end - 1] === ZZFX_PARAMS[end - 1].def) {
    end -= 1;
  }
  return full.slice(0, end);
}

export function buildSamples(params, sampleRate = ZZFX_SAMPLE_RATE, random = Math.random) {
  const [
    volumeIn,
    randomness,
    frequencyIn,
    attackIn,
    sustainIn,
    releaseIn,
    shape,
    shapeCurve,
    slideIn,
    deltaSlideIn,
    pitchJumpIn,
    pitchJumpTimeIn,
    repeatTimeIn,
    noise,
    modulationIn,
    bitCrush,
    delayIn,
    sustainVolume,
    decayIn,
    tremolo,
    filter,
  ] = normalizeParams(params);

  const PI2 = Math.PI * 2;
  const sign = (v) => (v > 0 ? 1 : -1);

  let slide = slideIn * ((500 * PI2) / sampleRate ** 2);
  const startSlide = slide;
  let frequency = frequencyIn * (1 + randomness * 2 * random() - randomness) * (PI2 / sampleRate);
  let startFrequency = frequency;
  const buffer = [];
  let t = 0;
  let tm = 0;
  let i = 0;
  let j = 1;
  let r = 0;
  let c = 0;
  let s = 0;

  // Biquad low/high-pass (negative filter = high-pass).
  const quality = 2;
  const w = (PI2 * Math.abs(filter) * 2) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  const attack = attackIn * sampleRate + 9; // minimum attack prevents a pop
  const decay = decayIn * sampleRate;
  const sustain = sustainIn * sampleRate;
  const release = releaseIn * sampleRate;
  const delay = delayIn * sampleRate;
  const deltaSlide = deltaSlideIn * ((500 * PI2) / sampleRate ** 3);
  const modulation = modulationIn * (PI2 / sampleRate);
  const pitchJump = pitchJumpIn * (PI2 / sampleRate);
  const pitchJumpTime = pitchJumpTimeIn * sampleRate;
  const repeatTime = (repeatTimeIn * sampleRate) | 0;
  const volume = volumeIn;
  const length = (attack + decay + sustain + release + delay) | 0;
  const crush = (bitCrush * 100) | 0;

  for (; i < length; buffer[i++] = s * volume) {
    if (!crush || !(++c % crush)) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? (Math.sin(t) > 0 ? 1 : -1) // 5 square
                : Math.sin((t % PI2) ** 3) // 4 noise
              : Math.max(Math.min(Math.tan(t), 1), -1) // 3 tan
            : 1 - ((((2 * t) / PI2) % 2) + 2) % 2 // 2 saw
          : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2) // 1 triangle
        : Math.sin(t); // 0 sine

      s =
        (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        sign(s) *
        Math.abs(s) ** shapeCurve *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0);

      s = delay
        ? s / 2 + (delay > i ? 0 : (i < length - delay ? 1 : (length - i) / delay) * ((volume ? buffer[(i - delay) | 0] / volume : 0) / 2))
        : s;

      if (filter) {
        s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
      }
    }

    const f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++);
    t += f - f * noise * (1 - (((Math.sin(i) + 1) * 1e9) % 2));

    if (j && ++j > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      j = 0;
    }

    if (repeatTime && !(++r % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      j = j || 1;
    }
  }

  return buffer;
}

// Build a 16-bit mono PCM WAV (Uint8Array) for download/export.
export function samplesToWav(samples, sampleRate = ZZFX_SAMPLE_RATE) {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeString = (offset, text) => {
    for (let k = 0; k < text.length; k += 1) {
      view.setUint8(offset + k, text.charCodeAt(k));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  for (let k = 0; k < samples.length; k += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[k] || 0));
    view.setInt16(44 + k * 2, Math.round(clamped * 32767), true);
  }
  return bytes;
}
