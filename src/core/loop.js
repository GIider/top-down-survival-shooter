export function createLoop(update, render, { onFrame } = {}) {
  let lastTimestamp = 0;

  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTimestamp) / 1000 || 0, 0.05);
    lastTimestamp = timestamp;

    const t0 = onFrame ? performance.now() : 0;
    update(dt);
    const t1 = onFrame ? performance.now() : 0;
    render();
    if (onFrame) {
      onFrame(t1 - t0, performance.now() - t1);
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}
