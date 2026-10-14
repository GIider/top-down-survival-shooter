export function createFpsTracker(sampleWindow = 0.25) {
  let elapsed = 0;
  let frames = 0;
  let value = 0;
  const RING = 120;
  const updateMs = new Float32Array(RING);
  const renderMs = new Float32Array(RING);
  let ringIndex = 0;
  let ringCount = 0;

  return {
    update(dt) {
      if (dt <= 0) {
        return value;
      }

      elapsed += dt;
      frames += 1;
      if (elapsed >= sampleWindow) {
        value = Math.round(frames / elapsed);
        elapsed = 0;
        frames = 0;
      }

      return value;
    },
    /** Records CPU ms spent in update and render for one frame (debug overlay only). */
    recordFrame(updateTime, renderTime) {
      updateMs[ringIndex] = updateTime;
      renderMs[ringIndex] = renderTime;
      ringIndex = (ringIndex + 1) % RING;
      ringCount = Math.min(ringCount + 1, RING);
    },
    /** Rolling avg and worst of the last ~120 frames. */
    getTimings() {
      let uSum = 0;
      let rSum = 0;
      let uMax = 0;
      let rMax = 0;
      for (let i = 0; i < ringCount; i += 1) {
        uSum += updateMs[i];
        rSum += renderMs[i];
        uMax = Math.max(uMax, updateMs[i]);
        rMax = Math.max(rMax, renderMs[i]);
      }
      const n = Math.max(1, ringCount);
      return { updateAvg: uSum / n, updateMax: uMax, renderAvg: rSum / n, renderMax: rMax };
    },
    getValue() {
      return value;
    },
    reset() {
      elapsed = 0;
      frames = 0;
      value = 0;
    },
  };
}