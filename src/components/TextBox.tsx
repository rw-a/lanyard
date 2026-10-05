import { createEffect, createSignal, on, onCleanup, onMount, type JSX } from 'solid-js';
import type { FitStatus, Row, TextElement } from '../lib/types';
import { PX_PER_MM, resolveFill, substitute } from '../lib/template';

interface Props {
  el: TextElement;
  row: Row;
  /** Card size in mm – the text must stay inside this rectangle to print. */
  cardW: number;
  cardH: number;
  onFit?: (status: FitStatus) => void;
  onPointerDown?: (e: PointerEvent) => void;
  onDblClick?: () => void;
  style?: JSX.CSSProperties;
}

const V_ALIGN: Record<TextElement['vAlign'], string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
};

/** How far (in mm) text may poke past the card edge before we call it clipped – absorbs sub-pixel rounding. */
const CLIP_TOLERANCE_MM = 0.3;

/**
 * Renders one text element. When `shrinkToFit` is on, the font size is reduced
 * (binary search between fontSize and minFontSize) until the text fits the box.
 *
 * After fitting, the text is measured twice:
 *  - against its own box  → `overflow` (text is cut off by the box)
 *  - against the card     → `clipped`  (text is cut off by the card edge, because
 *    the card clips everything outside its bounds when printed)
 * Both are reported through `onFit` so the UI can flag them.
 */
export default function TextBox(props: Props) {
  let outer!: HTMLDivElement;
  let inner!: HTMLDivElement;
  const [fontSize, setFontSize] = createSignal(props.el.fontSize);
  const [breakWords, setBreakWords] = createSignal(false);
  const [status, setStatus] = createSignal<FitStatus>({ overflow: false, clipped: false });

  const text = () => substitute(props.el.content, props.row);

  /**
   * scrollWidth/scrollHeight/clientWidth are integers while the real box is
   * fractional (mm → px), so compare like with like: horizontal overflow is
   * scrollWidth vs the inner box's own clientWidth; vertical overflow allows 1px
   * of rounding slack against the available height.
   */
  function measureOverflows(availH: number): boolean {
    return inner.scrollHeight > availH + 1 || inner.scrollWidth > inner.clientWidth;
  }

  /**
   * True when any *visible* text lies (partly) outside the card.
   *
   * Each rendered line box is first intersected with the element's own box
   * (the box has overflow:hidden, so only that part is ever drawn – this also
   * discards the trailing space that hangs past the edge at every wrap point),
   * then compared with the card's rectangle. A wide box that hangs off the card
   * is therefore fine as long as the glyphs inside it are not.
   */
  function measureClipped(): boolean {
    const card = outer.closest('.card') as HTMLElement | null;
    if (!card || !text()) return false;
    const cr = card.getBoundingClientRect();
    if (cr.width === 0 || cr.height === 0) return false;
    // The card may be rendered scaled (zoomed canvas, small previews): derive the
    // on-screen pixels per mm from its real size so the tolerance stays in mm.
    const scale = cr.width / (props.cardW * PX_PER_MM);
    const tol = CLIP_TOLERANCE_MM * PX_PER_MM * scale;
    const box = outer.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(inner);
    for (const r of range.getClientRects()) {
      // visible part of this line = line ∩ box
      const left = Math.max(r.left, box.left);
      const right = Math.min(r.right, box.right);
      const top = Math.max(r.top, box.top);
      const bottom = Math.min(r.bottom, box.bottom);
      if (right - left <= tol || bottom - top <= tol) continue; // nothing of this line is drawn
      if (left < cr.left - tol || right > cr.right + tol || top < cr.top - tol || bottom > cr.bottom + tol) {
        return true;
      }
    }
    return false;
  }

  function fit() {
    if (!outer || !inner) return;
    const el = props.el;
    const padPx = el.padding * PX_PER_MM;
    const availH = outer.clientHeight - padPx * 2;
    if (outer.clientWidth === 0 && outer.clientHeight === 0) return; // not laid out yet (hidden) – ResizeObserver will call again

    // Reset to the ideal size first.
    inner.style.fontSize = `${el.fontSize}pt`;
    inner.style.overflowWrap = 'normal';
    let size = el.fontSize;
    let needsBreak = false;

    if (measureOverflows(availH)) {
      if (el.shrinkToFit && el.minFontSize < el.fontSize) {
        let lo = el.minFontSize;
        let hi = el.fontSize;
        // Does it fit at the minimum at all?
        inner.style.fontSize = `${lo}pt`;
        if (measureOverflows(availH)) {
          size = lo;
        } else {
          // Largest size in [lo, hi] that fits, to 0.25pt.
          for (let i = 0; i < 12 && hi - lo > 0.25; i++) {
            const mid = (lo + hi) / 2;
            inner.style.fontSize = `${mid}pt`;
            if (measureOverflows(availH)) hi = mid;
            else lo = mid;
          }
          size = lo;
        }
      }
      inner.style.fontSize = `${size}pt`;
      // Last resort: let long unbreakable words wrap mid-word if the text wraps anyway.
      if (el.wrap && inner.scrollWidth > inner.clientWidth) {
        needsBreak = true;
        inner.style.overflowWrap = 'anywhere';
      }
    }
    const next: FitStatus = { overflow: measureOverflows(availH), clipped: measureClipped() };
    setFontSize(size);
    setBreakWords(needsBreak);
    const prev = status();
    if (next.overflow !== prev.overflow || next.clipped !== prev.clipped) {
      setStatus(next);
      props.onFit?.(next);
    }
  }

  onMount(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    ro.observe(outer);
    // The card itself may be resized (card size change) without this box changing.
    const card = outer.closest('.card');
    if (card) ro.observe(card);
    onCleanup(() => ro.disconnect());
    // Re-fit once web fonts have settled (system fonts resolve immediately).
    document.fonts?.ready.then(() => fit());
  });

  // Re-run whenever anything that affects layout or position changes.
  createEffect(
    on(
      () => [
        text(),
        props.el.fontSize,
        props.el.minFontSize,
        props.el.shrinkToFit,
        props.el.x,
        props.el.y,
        props.el.w,
        props.el.h,
        props.el.rotation,
        props.el.padding,
        props.el.wrap,
        props.el.bold,
        props.el.italic,
        props.el.uppercase,
        props.el.fontFamily,
        props.el.lineHeight,
        props.el.letterSpacing,
        props.el.align,
        props.el.vAlign,
        props.el.borderWidth,
        props.cardW,
        props.cardH,
      ],
      () => queueMicrotask(fit),
      { defer: true },
    ),
  );

  return (
    <div
      ref={outer}
      class="el el-text"
      data-id={props.el.id}
      data-overflow={status().overflow ? 'true' : undefined}
      data-clipped={status().clipped ? 'true' : undefined}
      onPointerDown={props.onPointerDown}
      onDblClick={props.onDblClick}
      style={{
        position: 'absolute',
        left: `${props.el.x}mm`,
        top: `${props.el.y}mm`,
        width: `${props.el.w}mm`,
        height: `${props.el.h}mm`,
        padding: `${props.el.padding}mm`,
        'box-sizing': 'border-box',
        display: 'flex',
        'flex-direction': 'column',
        'justify-content': V_ALIGN[props.el.vAlign],
        overflow: 'hidden',
        background: resolveFill(props.el.bg, props.el.colorRule, props.row),
        'border-radius': `${props.el.borderRadius}mm`,
        border: props.el.borderWidth > 0 ? `${props.el.borderWidth}mm solid ${props.el.borderColor}` : 'none',
        opacity: props.el.opacity,
        transform: props.el.rotation ? `rotate(${props.el.rotation}deg)` : undefined,
        ...props.style,
      }}
    >
      <div
        ref={inner}
        style={{
          width: '100%',
          'font-size': `${fontSize()}pt`,
          'font-family': props.el.fontFamily,
          'font-weight': props.el.bold ? '700' : '400',
          'font-style': props.el.italic ? 'italic' : 'normal',
          'text-transform': props.el.uppercase ? 'uppercase' : 'none',
          'text-align': props.el.align,
          'white-space': props.el.wrap ? 'pre-wrap' : 'pre',
          'overflow-wrap': breakWords() ? 'anywhere' : 'normal',
          'line-height': String(props.el.lineHeight),
          'letter-spacing': `${props.el.letterSpacing}em`,
          color: props.el.color,
        }}
      >
        {text()}
      </div>
    </div>
  );
}
