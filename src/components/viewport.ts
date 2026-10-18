// The window's size in CSS px, kept up to date on resize, for the canvases
// redrawn every frame. Reading window.innerWidth/innerHeight in every frame's
// loop can make the browser lay the page out again mid-frame (after other
// loops have moved things), a little stutter each time.

export const viewport = { w: window.innerWidth, h: window.innerHeight };

window.addEventListener('resize', () => {
  viewport.w = window.innerWidth;
  viewport.h = window.innerHeight;
});
