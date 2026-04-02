export function spawnIndicator(list, indicator) {
  list.push({
    elapsed: 0,
    color: "red",
    ...indicator,
  });
}

export function updateIndicators(list, dt) {
  const triggered = [];

  for (let index = list.length - 1; index >= 0; index -= 1) {
    const indicator = list[index];
    indicator.elapsed += dt;

    if (indicator.elapsed >= indicator.duration) {
      triggered.push(indicator);
      list.splice(index, 1);
    }
  }

  return triggered;
}
