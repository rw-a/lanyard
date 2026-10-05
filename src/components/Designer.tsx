import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { fitProblem, type FitStatus, type PreviewSource, type TemplateElement } from '../lib/types';
import { PX_PER_MM, clamp, describeFit, outsideCard, round } from '../lib/template';
import {
  canRedo,
  canUndo,
  commit,
  previewRow,
  previewSource,
  redo,
  rows,
  selectedElement,
  selectedId,
  setPreviewSource,
  setSelectedId,
  template,
  undo,
  updateElement,
  updateTemplate,
} from '../lib/store';
import Card from './Card';
import Inspector from './Inspector';
import Layers from './Layers';
import Previews from './Previews';
import { Select } from './ui';

type HandleDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface DragState {
  kind: 'move' | 'resize';
  dir?: HandleDir;
  id: string;
  startX: number;
  startY: number;
  orig: { x: number; y: number; w: number; h: number };
}

export default function Designer() {
  const [zoom, setZoom] = createSignal(1);
  const [snap, setSnap] = createSignal(true);
  const [grid, setGrid] = createSignal(true);
  /** Fit status per text element for the card currently on the canvas. */
  const [fitMap, setFitMap] = createSignal<Map<string, FitStatus>>(new Map());
  let canvasArea!: HTMLDivElement;
  let drag: DragState | null = null;

  const cardW = () => template.card.width;
  const cardH = () => template.card.height;

  function fitZoom() {
    if (!canvasArea) return;
    const pad = 48;
    const availW = canvasArea.clientWidth - pad;
    const availH = Math.max(320, canvasArea.clientHeight - pad);
    const z = Math.min(availW / (cardW() * PX_PER_MM), availH / (cardH() * PX_PER_MM));
    setZoom(clamp(Math.floor(z * 20) / 20, 0.25, 4));
  }

  // Fit the card into view initially and whenever its size changes.
  createEffect(() => {
    cardW();
    cardH();
    fitZoom();
  });

  // --- pointer interactions -------------------------------------------------
  function pxToMm(px: number) {
    return px / (PX_PER_MM * zoom());
  }

  function onElementPointerDown(e: PointerEvent, el: TemplateElement) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedId(el.id);
    beginDrag(e, { kind: 'move', id: el.id, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, w: el.w, h: el.h } });
  }

  function onHandlePointerDown(e: PointerEvent, dir: HandleDir) {
    const el = selectedElement();
    if (!el || e.button !== 0) return;
    e.stopPropagation();
    beginDrag(e, { kind: 'resize', dir, id: el.id, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, w: el.w, h: el.h } });
  }

  function beginDrag(e: PointerEvent, state: DragState) {
    e.preventDefault();
    commit();
    drag = state;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag, { once: true });
    window.addEventListener('pointercancel', endDrag, { once: true });
    document.body.classList.add('dragging');
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    const step = snap() && !e.altKey ? 1 : 0.1;
    const dx = pxToMm(e.clientX - d.startX);
    const dy = pxToMm(e.clientY - d.startY);
    if (d.kind === 'move') {
      updateElement(
        d.id,
        (el) => {
          el.x = round(d.orig.x + dx, step);
          el.y = round(d.orig.y + dy, step);
        },
        false,
      );
    } else {
      const o = d.orig;
      let { x, y, w, h } = o;
      const dir = d.dir!;
      if (dir.includes('e')) w = o.w + dx;
      if (dir.includes('s')) h = o.h + dy;
      if (dir.includes('w')) {
        w = o.w - dx;
        x = o.x + dx;
      }
      if (dir.includes('n')) {
        h = o.h - dy;
        y = o.y + dy;
      }
      if (e.shiftKey && dir.length === 2) {
        // keep aspect ratio from corners
        const ratio = o.w / o.h || 1;
        if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
        else w = h * ratio;
        if (dir.includes('n')) y = o.y + o.h - h;
        if (dir.includes('w')) x = o.x + o.w - w;
      }
      const minSize = 2;
      if (w < minSize) {
        if (dir.includes('w')) x = o.x + o.w - minSize;
        w = minSize;
      }
      if (h < minSize) {
        if (dir.includes('n')) y = o.y + o.h - minSize;
        h = minSize;
      }
      updateElement(
        d.id,
        (el) => {
          el.x = round(x, step);
          el.y = round(y, step);
          el.w = round(w, step);
          el.h = round(h, step);
        },
        false,
      );
    }
  }

  function endDrag() {
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    document.body.classList.remove('dragging');
  }

  // --- keyboard ---------------------------------------------------------------
  /** True when the key press belongs to a form control (so we must not hijack it). */
  function isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
    if (t.tagName === 'INPUT') {
      const type = (t as HTMLInputElement).type;
      // checkboxes / buttons don't use arrows or Delete, so shortcuts can still apply
      return !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(type);
    }
    return false;
  }
  function onKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      if (isTyping(e)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      if (isTyping(e)) return;
      e.preventDefault();
      redo();
      return;
    }
    if (isTyping(e)) return;
    const el = selectedElement();
    if (!el) return;
    if (e.key === 'Escape') {
      setSelectedId(null);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    const nudge = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-nudge, 0],
      ArrowRight: [nudge, 0],
      ArrowUp: [0, -nudge],
      ArrowDown: [0, nudge],
    };
    const m = moves[e.key];
    if (m && !el.locked) {
      e.preventDefault();
      updateElement(el.id, (x) => {
        x.x = round(x.x + m[0], 0.1);
        x.y = round(x.y + m[1], 0.1);
      });
    }
  }
  onMount(() => {
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  function removeSelected() {
    const id = selectedId();
    if (!id) return;
    updateTemplate((t) => {
      t.elements = t.elements.filter((e) => e.id !== id);
    });
    setSelectedId(null);
  }

  function duplicateSelected() {
    const el = selectedElement();
    if (!el) return;
    const copy = structuredClone({ ...el }) as TemplateElement;
    copy.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    copy.x += 3;
    copy.y += 3;
    copy.name = `${el.name} copy`;
    updateTemplate((t) => {
      const i = t.elements.findIndex((e) => e.id === el.id);
      t.elements.splice(i + 1, 0, copy);
    });
    setSelectedId(copy.id);
  }

  // --- preview source selector -----------------------------------------------
  const sourceOptions = createMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: 'shortest', label: 'Shortest values' },
      { value: 'median', label: 'Median values' },
      { value: 'longest', label: 'Longest values' },
    ];
    const rs = rows();
    const nameCol = template.elements.find((e) => e.kind === 'text' && /name/i.test(e.name));
    rs.forEach((r, i) => {
      let label = `Row ${i + 1}`;
      if (nameCol && nameCol.kind === 'text') {
        const m = nameCol.content.match(/\{\{\s*([^}]+?)\s*\}\}/);
        if (m && r[m[1]]) label += ` — ${r[m[1]]}`;
      } else {
        const first = Object.values(r)[0];
        if (first) label += ` — ${first}`;
      }
      opts.push({ value: `row:${i}`, label });
    });
    return opts;
  });
  const sourceValue = () => {
    const s = previewSource();
    return s.type === 'row' ? `row:${s.index}` : s.type;
  };
  function setSource(v: string) {
    const src: PreviewSource = v.startsWith('row:') ? { type: 'row', index: parseInt(v.slice(4), 10) } : ({ type: v } as PreviewSource);
    setPreviewSource(src);
  }

  function onFit(id: string, status: FitStatus) {
    setFitMap((prev) => {
      const next = new Map(prev);
      if (fitProblem(status)) next.set(id, status);
      else next.delete(id);
      return next;
    });
  }
  const problemIds = createMemo(() => new Set(fitMap().keys()));

  const handleSizePx = () => 9 / zoom();

  return (
    <div class="design-layout">
      <aside class="side left">
        <Layers fitMap={fitMap()} onDuplicate={duplicateSelected} onRemove={removeSelected} />
      </aside>

      <main class="center">
        <div class="toolbar">
          <div class="row gap">
            <button class="btn icon" title="Undo (Ctrl+Z)" disabled={!canUndo()} onClick={undo}>
              ↶
            </button>
            <button class="btn icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo()} onClick={redo}>
              ↷
            </button>
            <span class="sep" />
            <label class="row gap-s small">
              <span class="muted">Preview with</span>
              <span data-testid="preview-source">
                <Select value={sourceValue()} options={sourceOptions()} onChange={setSource} class="compact" />
              </span>
            </label>
          </div>
          <div class="row gap">
            <label class="toggle small" title="Snap positions to whole millimetres (hold Alt to override)">
              <input type="checkbox" checked={snap()} onChange={(e) => setSnap(e.currentTarget.checked)} />
              <span>Snap</span>
            </label>
            <label class="toggle small">
              <input type="checkbox" checked={grid()} onChange={(e) => setGrid(e.currentTarget.checked)} />
              <span>Grid</span>
            </label>
            <span class="sep" />
            <button class="btn icon" title="Zoom out" onClick={() => setZoom((z) => clamp(round(z - 0.1, 0.05), 0.25, 4))}>
              −
            </button>
            <button class="btn tiny" title="Fit to view" onClick={fitZoom}>
              {Math.round(zoom() * 100)}%
            </button>
            <button class="btn icon" title="Zoom in" onClick={() => setZoom((z) => clamp(round(z + 0.1, 0.05), 0.25, 4))}>
              +
            </button>
          </div>
        </div>

        <div
          ref={canvasArea}
          class="canvas-area"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-stage')) setSelectedId(null);
          }}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            setZoom((z) => clamp(round(z * (e.deltaY < 0 ? 1.1 : 0.9), 0.01), 0.25, 4));
          }}
        >
          <div
            class="canvas-stage"
            data-testid="canvas-stage"
            style={{
              width: `${cardW() * PX_PER_MM * zoom()}px`,
              height: `${cardH() * PX_PER_MM * zoom()}px`,
            }}
          >
            <div
              class="canvas-scaler"
              style={{ transform: `scale(${zoom()})`, 'transform-origin': '0 0' }}
              onPointerDown={(e) => {
                // A press on the card background (not on an element) clears the selection.
                if ((e.target as HTMLElement).classList.contains('card')) setSelectedId(null);
              }}
            >
              <Card
                template={template}
                row={previewRow()}
                editor
                selectedId={selectedId()}
                onElementPointerDown={onElementPointerDown}
                onElementDblClick={() => {
                  const ta = document.getElementById('content-editor') as HTMLTextAreaElement | null;
                  ta?.focus();
                  ta?.select();
                }}
                onFit={onFit}
                class="editor-card"
              />
              <Show when={grid()}>
                <div class="grid-overlay" style={{ width: `${cardW()}mm`, height: `${cardH()}mm` }} />
              </Show>
              {/* Selection box + handles live in the same scaled coordinate space as the card. */}
              <Show when={selectedElement()}>
                {(el) => (
                  <div
                    class="selection"
                    data-testid="selection"
                    classList={{
                      locked: el().locked,
                      overflow: problemIds().has(el().id),
                      outside: !problemIds().has(el().id) && outsideCard(el(), template.card),
                    }}
                    style={{
                      left: `${el().x}mm`,
                      top: `${el().y}mm`,
                      width: `${el().w}mm`,
                      height: `${el().h}mm`,
                      'outline-width': `${1.5 / zoom()}px`,
                      transform: el().rotation ? `rotate(${el().rotation}deg)` : undefined,
                    }}
                  >
                    <Show when={!el().locked}>
                      <For each={HANDLES}>
                        {(dir) => (
                          <div
                            class={`handle ${dir}`}
                            style={{ width: `${handleSizePx()}px`, height: `${handleSizePx()}px`, 'border-width': `${1 / zoom()}px` }}
                            onPointerDown={(e) => onHandlePointerDown(e, dir)}
                          />
                        )}
                      </For>
                    </Show>
                    <div class="sel-label" data-testid="selection-label" style={{ 'font-size': `${11 / zoom()}px`, top: `${-18 / zoom()}px` }}>
                      {el().name} · {el().w.toFixed(1)} × {el().h.toFixed(1)} mm
                      <Show when={describeFit(fitMap().get(el().id))}>{(d) => <> · {d()}!</>}</Show>
                      <Show when={!problemIds().has(el().id) && outsideCard(el(), template.card)}> · extends past the card edge</Show>
                    </div>
                  </div>
                )}
              </Show>
            </div>
          </div>
          <div class="canvas-caption muted small">
            {cardW()} × {cardH()} mm · drag to move, drag handles to resize (Shift = keep ratio) · arrows nudge 1 mm · Delete removes · double-click text to edit
          </div>
        </div>

        <Previews />
      </main>

      <aside class="side right">
        <Inspector />
      </aside>
    </div>
  );
}
