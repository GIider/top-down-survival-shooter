export function createLoop(update, render) {
  let lastTimestamp = 0;

  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTimestamp) / 1000 || 0, 0.05);
    lastTimestamp = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}
