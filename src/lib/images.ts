import { readFileAsDataUrl } from './csv';

/**
 * Longest side (px) an uploaded raster image is scaled down to before being stored
 * in the template. Badge graphics are a few centimetres wide, so 1200 px is well
 * beyond 300 dpi while keeping several images per group inside localStorage limits.
 */
export const MAX_IMAGE_PX = 1200;

/**
 * Read an image file as a data URL suitable for storing in the template.
 * SVGs are kept verbatim (they scale losslessly); rasters larger than `maxPx`
 * are downscaled with canvas. PNG/GIF/WebP keep transparency (PNG output),
 * anything else becomes JPEG.
 */
export async function readImageFile(file: File, maxPx = MAX_IMAGE_PX): Promise<string> {
  const original = await readFileAsDataUrl(file);
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return original;
  if (typeof document === 'undefined') return original;

  const img = await loadImage(original).catch(() => null);
  if (!img) return original; // not decodable here – keep what we have

  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const keepsAlpha = /png|gif|webp/i.test(file.type);
  if (scale === 1 && (keepsAlpha || file.type === 'image/jpeg')) return original;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return keepsAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

/** Approximate size of a data URL's payload in bytes. */
export function dataUrlBytes(url: string): number {
  const i = url.indexOf(',');
  if (i < 0) return url.length;
  return Math.floor(((url.length - i - 1) * 3) / 4);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
