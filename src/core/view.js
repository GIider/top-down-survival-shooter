// Fullscreen view: the canvas fills the window, while game logic keeps working in
// "logical" units where the visible area is always at least BASE_WIDTH x BASE_HEIGHT.
import { CANVAS } from "./constants.js";

const BASE_WIDTH = CANVAS.width;
const BASE_HEIGHT = CANVAS.height;
const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 21 / 9;

// The shared CANVAS config object doubles as the live logical viewport, so spawn/cull
// systems that read CANVAS.width/height always see the currently visible area.
export function createView(canvas, windowRef = window) {
  const view = CANVAS;
  Object.assign(view, {
    scale: 1,
    dpr: 1,
    resize() {
      const cssWidth = Math.max(1, windowRef.innerWidth);
      const cssHeight = Math.max(1, windowRef.innerHeight);
      const aspect = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, cssWidth / cssHeight));

      // Scale-to-fit: the 1280x720 area always fits; extra window area extends the view
      // (aspect clamped so extreme windows crop instead of revealing a lot more world).
      const fitWidth = aspect >= BASE_WIDTH / BASE_HEIGHT ? BASE_HEIGHT * aspect : BASE_WIDTH;
      const fitHeight = aspect >= BASE_WIDTH / BASE_HEIGHT ? BASE_HEIGHT : BASE_WIDTH / aspect;
      const scale = Math.max(cssWidth / fitWidth, cssHeight / fitHeight);

      view.scale = scale;
      view.width = cssWidth / scale;
      view.height = cssHeight / scale;
      view.dpr = Math.max(1, windowRef.devicePixelRatio || 1);

      const pixelWidth = Math.round(cssWidth * view.dpr);
      const pixelHeight = Math.round(cssHeight * view.dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
    },
  });

  view.resize();
  windowRef.addEventListener("resize", () => view.resize());
  return view;
}
