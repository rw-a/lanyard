/**
 * Waiting until mounted print sheets are really ready to print: web fonts loaded,
 * every picture (including card backgrounds) loaded and decoded, and text boxes
 * finished shrinking to fit. A fixed delay is not enough for a large two-sided job.
 *
 * The sheets must be laid out (not `display: none`) while this runs, otherwise
 * text cannot be measured; the print root sits off-screen until printing.
 */

export interface ReadyResult {
  ok: boolean;
  /** How many pictures failed to load or decode. */
  failedImages: number;
  /** Preparation did not finish within the time limit. */
  timedOut: boolean;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve('timeout'), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      () => {
        window.clearTimeout(timer);
        resolve('timeout');
      },
    );
  });
}

/** Resolves true when the picture loaded and decoded, false when it is broken. */
async function imageReady(img: HTMLImageElement): Promise<boolean> {
  if (!img.complete) {
    await new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }
  if (img.naturalWidth === 0) return false;
  try {
    await img.decode();
    return true;
  } catch {
    return img.naturalWidth > 0;
  }
}

/** CSS background pictures (card backgrounds) are not <img>s; load each distinct one once. */
function backgroundUrls(root: HTMLElement): string[] {
  const urls = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('.card')) {
    const m = el.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    if (m?.[1]) urls.add(m[1]);
  }
  return [...urls];
}

function loadUrl(url: string): Promise<boolean> {
  const img = new Image();
  img.src = url;
  return imageReady(img);
}

/** A fingerprint of every text box's fitted font size and fit state. */
function textSignature(root: HTMLElement): string {
  return [...root.querySelectorAll<HTMLElement>('.el-text')]
    .map((el) => `${(el.firstElementChild as HTMLElement | null)?.style.fontSize}|${el.dataset.overflow ?? ''}|${el.dataset.clipped ?? ''}`)
    .join(';');
}

/** Wait until text fitting stops changing (it reruns after fonts and pictures settle). */
async function textSettled(root: HTMLElement): Promise<void> {
  let last = textSignature(root);
  let stable = 0;
  for (let i = 0; i < 60 && stable < 2; i++) {
    await nextFrame();
    const now = textSignature(root);
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
}

export async function prepareForPrint(root: HTMLElement, timeoutMs = 20_000): Promise<ReadyResult> {
  const work = (async () => {
    // Let the sheets mount and their text boxes run their first fit.
    await nextFrame();
    await nextFrame();
    await document.fonts?.ready;
    const results = await Promise.all([
      ...[...root.querySelectorAll('img')].map(imageReady),
      ...backgroundUrls(root).map(loadUrl),
    ]);
    await textSettled(root);
    return results.filter((ok) => !ok).length;
  })();
  const failed = await withTimeout(work, timeoutMs);
  if (failed === 'timeout') return { ok: false, failedImages: 0, timedOut: true };
  return { ok: failed === 0, failedImages: failed, timedOut: false };
}

/** Plain-language summary of a failed preparation. */
export function describeReadyFailure(r: ReadyResult): string {
  if (r.timedOut) return 'Preparing the pages took too long, so some pictures or text may not be ready.';
  return `${r.failedImages} ${r.failedImages === 1 ? 'picture' : 'pictures'} could not be loaded and would print blank.`;
}
