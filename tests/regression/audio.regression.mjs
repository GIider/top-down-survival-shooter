import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSfxEngine, playSfx } from "../../src/audio/sfx.js";
import { SOUND_CATALOG } from "../../src/audio/soundCatalog.js";
import { formatCatalogModule, parseSoundExport } from "../../src/audio/soundCatalogFormat.js";
import { ZZFX_PARAMS, buildSamples, normalizeParams, samplesToWav, trimParams } from "../../src/audio/zzfx.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function listSourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return listSourceFiles(full);
    }
    return full.endsWith(".js") ? [full] : [];
  });
}

function createFakeAudioContext() {
  const created = { sources: [], contexts: 0 };
  class FakeContext {
    constructor() {
      created.contexts += 1;
      this.state = "running";
      this.destination = {};
    }
    createDynamicsCompressor() {
      return { connect() {} };
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createBuffer(channels, length) {
      const data = new Float32Array(length);
      return { getChannelData: () => data, length };
    }
    createBufferSource() {
      const source = {
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
      };
      created.sources.push(source);
      return source;
    }
    resume() {}
  }
  return { FakeContext, created };
}

runTest("catalog ids are unique and params are valid", () => {
  const ids = new Set();
  SOUND_CATALOG.forEach((entry) => {
    assert.ok(!ids.has(entry.id), `duplicate sound id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.label && entry.group, `${entry.id} needs label and group`);
    assert.ok(entry.params.length <= ZZFX_PARAMS.length, `${entry.id} has too many params`);
    entry.params.forEach((value) => assert.ok(Number.isFinite(value), `${entry.id} has non-finite param`));
  });
});

runTest("every catalog sound synthesizes finite, non-silent, bounded samples", () => {
  SOUND_CATALOG.forEach((entry) => {
    const samples = buildSamples(entry.params, 44100, () => 0.5);
    assert.ok(samples.length > 400 && samples.length < 44100 * 3, `${entry.id} length ${samples.length}`);
    let peak = 0;
    samples.forEach((sample) => {
      assert.ok(Number.isFinite(sample), `${entry.id} produced a non-finite sample`);
      peak = Math.max(peak, Math.abs(sample));
    });
    assert.ok(peak > 0.02, `${entry.id} is silent (peak ${peak})`);
    assert.ok(peak <= 2.5, `${entry.id} is far too loud (peak ${peak})`);
  });
});

runTest("synthesis is deterministic for a fixed random source", () => {
  const params = SOUND_CATALOG[0].params;
  assert.deepEqual(buildSamples(params, 44100, () => 0.3), buildSamples(params, 44100, () => 0.3));
});

runTest("wav export has a valid header and sample count", () => {
  const wav = samplesToWav([0, 0.5, -0.5, 1], 44100);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
  assert.equal(wav.length, 44 + 4 * 2);
});

runTest("every catalog id is referenced by game code", () => {
  const srcDir = path.join(rootDir, "src");
  const catalogPath = path.join(srcDir, "audio", "soundCatalog.js");
  const code = listSourceFiles(srcDir)
    .filter((file) => file !== catalogPath && !file.includes(`${path.sep}sound-showcase${path.sep}`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  SOUND_CATALOG.forEach((entry) => {
    assert.ok(code.includes(`"${entry.id}"`), `sound "${entry.id}" is never played`);
  });
});

runTest("every played sound id exists in the catalog", () => {
  const ids = new Set(SOUND_CATALOG.map((entry) => entry.id));
  const srcDir = path.join(rootDir, "src");
  listSourceFiles(srcDir).forEach((file) => {
    const text = readFileSync(file, "utf8");
    const callRegex = /\b(?:playSfx|engine\.play|sfx\.play)\(([^)]*)\)/g;
    let match = callRegex.exec(text);
    while (match) {
      // Sound ids are the first argument or a ternary branch (`cond ? "a" : "b"`); a quoted
      // token inside the condition (e.g. `type === "bomber"`) is not a sound id.
      const literals = [...match[1].matchAll(/(?:^\s*|[?:]\s*)"([A-Za-z0-9]+)"/g)].map((entry) => entry[1]);
      literals.forEach((literal) => {
        assert.ok(ids.has(literal), `${path.relative(rootDir, file)} plays unknown sound "${literal}"`);
      });
      match = callRegex.exec(text);
    }
  });
});

runTest("exported catalog module is canonical and round-trips through the importer", () => {
  const generated = formatCatalogModule(SOUND_CATALOG);
  const onDisk = readFileSync(path.join(rootDir, "src", "audio", "soundCatalog.js"), "utf8");
  assert.equal(generated, onDisk, "src/audio/soundCatalog.js is not in canonical exported form");

  const parsed = parseSoundExport(generated);
  assert.equal(Object.keys(parsed.entries).length, SOUND_CATALOG.length);
  SOUND_CATALOG.forEach((entry) => {
    const imported = parsed.entries[entry.id];
    assert.ok(imported, `${entry.id} missing from import`);
    assert.deepEqual(normalizeParams(imported.params), normalizeParams(entry.params));
    assert.equal(imported.cooldown, entry.cooldown);
  });
});

runTest("importer accepts JSON maps and ZzFX designer arrays", () => {
  const json = parseSoundExport('{"gunShot": [1, 0.1, 300], "blink": {"params": [0.5], "cooldown": 99}}');
  assert.deepEqual(json.entries.gunShot.params, [1, 0.1, 300]);
  assert.equal(json.entries.blink.cooldown, 99);

  const designer = parseSoundExport("zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17]); // Powerup");
  assert.equal(designer.single[2], 925);
  assert.equal(designer.single[10], -184);
  assert.equal(normalizeParams(designer.single)[0], 1, "empty slots fall back to defaults");
  assert.deepEqual(trimParams([1, 0.05, 220, 0, 0, 0.1]), [1]);
});

runTest("engine plays sounds, honours cooldown, mute, silence and voice cap", () => {
  const { FakeContext, created } = createFakeAudioContext();
  let clock = 1000;
  const engine = createSfxEngine({ AudioContextCtor: FakeContext, now: () => clock, maxVoices: 2 });
  const gunCooldown = SOUND_CATALOG.find((entry) => entry.id === "gunShot").cooldown;

  assert.equal(engine.play("gunShot"), true);
  assert.equal(engine.play("gunShot"), false, "second play inside cooldown must be dropped");
  clock += gunCooldown + 1;
  assert.equal(engine.play("gunShot"), true);
  clock += gunCooldown + 1;
  assert.equal(engine.play("gunShot"), false, "voice cap of 2 must drop the third overlapping voice");
  assert.equal(engine.getStats().droppedPlays, 1);

  created.sources[0].onended();
  clock += gunCooldown + 1;
  assert.equal(engine.play("gunShot"), true, "a finished voice frees a slot");

  assert.equal(engine.play("doesNotExist"), false);

  engine.setMuted(true);
  clock += 1000;
  assert.equal(engine.play("blink"), false, "muted engine plays nothing");
  engine.setMuted(false);
  engine.silence(true);
  assert.equal(engine.play("blink"), false, "silenced engine plays nothing");
  engine.silence(false);
  created.sources.forEach((source) => source.onended?.());
  assert.equal(engine.getStats().activeVoices, 0);
  assert.equal(engine.play("blink"), true);
  assert.equal(created.contexts, 1, "one shared AudioContext");
});

runTest("engine overrides replace catalog params", () => {
  const { FakeContext, created } = createFakeAudioContext();
  const engine = createSfxEngine({ AudioContextCtor: FakeContext, now: () => 0 });
  engine.setOverrides({ blink: [1, 0, 440, 0, 0.5, 0] });
  engine.play("blink");
  // 0.5 s sustain at 44.1 kHz dwarfs the catalog's ~0.1 s blink.
  assert.ok(created.sources[0].buffer.length > 20000);
});

runTest("default engine is a safe no-op without Web Audio", () => {
  assert.equal(playSfx("gunShot"), false);
});
