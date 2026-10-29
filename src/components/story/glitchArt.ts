// The logo's art split for GlitchTeleport.tsx, made once and kept (StoryTitle
// asks for it as it starts, so it's ready the moment the glitch is): its red
// alone, and its green and blue alone, which add back up to it.

const ART = './brand/space-times/base.webp';

export interface GlitchArt {
  red: HTMLCanvasElement;
  cyan: HTMLCanvasElement;
}

let ready: GlitchArt | null = null;
let loading: Promise<GlitchArt> | null = null;

/** the art with only its red, or only its green and blue */
function channel(img: HTMLImageElement, tint: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  return c;
}

/** the split art, if it's made yet */
export const glitchArtNow = () => ready;

/** the split art, made the first time it's asked for */
export function loadGlitchArt(): Promise<GlitchArt> {
  if (!loading) {
    const img = new Image();
    img.src = ART;
    loading = img.decode().then(() => (ready = { red: channel(img, '#f00'), cyan: channel(img, '#0ff') }));
    // (asked again, it tries again)
    loading.catch(() => (loading = null));
  }
  return loading;
}
