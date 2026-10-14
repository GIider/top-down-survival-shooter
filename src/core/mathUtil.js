/**
 * 2D vector length. Used instead of the built-in hypot, which allocates a heap number per
 * call in V8 and dominated young-generation GC in the update loop.
 */
export function hypot2(x, y) {
  return Math.sqrt(x * x + y * y);
}
