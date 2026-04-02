export function createFpsTracker(sampleWindow = 0.25) {
  let elapsed = 0;
  let frames = 0;
  let value = 0;

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