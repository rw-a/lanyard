import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { PagePreset, Row } from '../lib/types';
import { PAGE_PRESETS, PX_PER_MM, computeSheetLayout, type SheetLayout } from '../lib/template';
import { commit, rows, setTab, template, updateTemplate } from '../lib/store';
import Card from './Card';
import { Field, NumberField, Section, Select, TextField, Toggle } from './ui';

/** Parse "1-10, 15, 20-22" into zero-based row indexes (input is 1-based). */
function parseRange(spec: string, max: number): number[] | null {
  const s = spec.trim();
  if (!s) return null;
  const out = new Set<number>();
  for (const part of s.split(/[,\s]+/)) {
    if (!part) continue;
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= max) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

export default function PrintPanel() {
  const [rangeSpec, setRangeSpec] = createSignal('');
  const [pageIndex, setPageIndex] = createSignal(0);
  const [printing, setPrinting] = createSignal(false);
  const [zoom, setZoom] = createSignal(0.5);
  let viewport!: HTMLDivElement;

  const layout = createMemo(() => computeSheetLayout(template));
  /** How many cards the other orientation would fit — used for a hint. */
  const altLayout = createMemo(() =>
    computeSheetLayout({ ...template, page: { ...template.page, landscape: !template.page.landscape } }),
  );

  const selectedRows = createMemo(() => {
    const rs = rows();
    const idx = parseRange(rangeSpec(), rs.length);
    return idx ? idx.map((i) => rs[i]) : rs;
  });

  const cards = createMemo(() => {
    const out: Row[] = [];
    const copies = Math.max(1, Math.round(template.page.copies));
    for (const r of selectedRows()) for (let i = 0; i < copies; i++) out.push(r);
    return out;
  });

  const pages = createMemo(() => {
    const per = layout().perPage;
    const cs = cards();
    if (per === 0) return [] as Row[][];
    const out: Row[][] = [];
    for (let i = 0; i < cs.length; i += per) out.push(cs.slice(i, i + per));
    return out;
  });

  createEffect(() => {
    if (pageIndex() > Math.max(0, pages().length - 1)) setPageIndex(Math.max(0, pages().length - 1));
  });

  function fitZoom() {
    if (!viewport) return;
    const { pageWidth, pageHeight } = layout();
    const z = Math.min((viewport.clientWidth - 40) / (pageWidth * PX_PER_MM), (viewport.clientHeight - 40) / (pageHeight * PX_PER_MM));
    setZoom(Math.max(0.1, Math.min(2, z)));
  }
  onMount(() => {
    fitZoom();
    const ro = new ResizeObserver(fitZoom);
    ro.observe(viewport);
    onCleanup(() => ro.disconnect());
    const after = () => setPrinting(false);
    window.addEventListener('afterprint', after);
    // Some browsers only flip the print media query instead of firing afterprint.
    const mq = window.matchMedia('print');
    const onMq = (e: MediaQueryListEvent) => {
      if (!e.matches) after();
    };
    mq.addEventListener?.('change', onMq);
    onCleanup(() => {
      window.removeEventListener('afterprint', after);
      mq.removeEventListener?.('change', onMq);
    });
  });
  createEffect(() => {
    layout();
    fitZoom();
  });

  async function print() {
    if (pages().length === 0) return;
    setPrinting(true);
    // Let the portal mount and text boxes finish fitting before opening the dialog.
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 50));
    window.print();
    // The portal is removed again on `afterprint` (see onMount); it is invisible on screen anyway.
  }

  function setPreset(p: PagePreset) {
    updateTemplate((t) => {
      t.page.preset = p;
      if (p !== 'custom') {
        t.page.width = PAGE_PRESETS[p].width;
        t.page.height = PAGE_PRESETS[p].height;
      }
    });
  }

  const noFit = () => layout().perPage === 0;

  return (
    <div class="print-layout">
      <aside class="side left">
        <Section title="Paper" collapsible>
          <Field label="Size">
            <Select
              value={template.page.preset}
              options={[
                { value: 'A4', label: 'A4 (210 × 297 mm)' },
                { value: 'A3', label: 'A3 (297 × 420 mm)' },
                { value: 'Letter', label: 'US Letter (8.5 × 11 in)' },
                { value: 'Legal', label: 'US Legal (8.5 × 14 in)' },
                { value: 'custom', label: 'Custom' },
              ]}
              onChange={setPreset}
            />
          </Field>
          <Show when={template.page.preset === 'custom'}>
            <div class="grid2">
              <Field label="Width">
                <NumberField value={template.page.width} min={50} max={2000} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.width = v), false)} />
              </Field>
              <Field label="Height">
                <NumberField value={template.page.height} min={50} max={2000} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.height = v), false)} />
              </Field>
            </div>
          </Show>
          <Toggle checked={template.page.landscape} label="Landscape" onChange={(v) => updateTemplate((t) => (t.page.landscape = v))} />
          <div class="grid3">
            <Field label="Margin" hint="Most printers need ≥ 5 mm">
              <NumberField value={template.page.margin} min={0} max={50} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.margin = v), false)} />
            </Field>
            <Field label="Gap ↔">
              <NumberField value={template.page.gapX} min={0} max={50} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.gapX = v), false)} />
            </Field>
            <Field label="Gap ↕">
              <NumberField value={template.page.gapY} min={0} max={50} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.gapY = v), false)} />
            </Field>
          </div>
        </Section>

        <Section title="Cutting" collapsible>
          <Toggle checked={template.page.cutMarks} label="Crop marks in the margins" onChange={(v) => updateTemplate((t) => (t.page.cutMarks = v))} />
          <Toggle checked={template.page.outline} label="Thin grey outline around each card" onChange={(v) => updateTemplate((t) => (t.page.outline = v))} />
        </Section>

        <Section title="What to print" collapsible>
          <Field label="Copies of each card" hint="2 = fold-over or back-to-back in a double-sided holder">
            <NumberField value={template.page.copies} min={1} max={10} step={1} onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.copies = Math.max(1, Math.round(v))), false)} />
          </Field>
          <Field label="Only these rows" hint={`Leave empty for everyone. Example: 1-10, 14, 20-22 (of ${rows().length})`}>
            <TextField value={rangeSpec()} onInput={setRangeSpec} placeholder="all" />
          </Field>
        </Section>

        <Section title="Summary" data-testid="print-summary" collapsible>
          <Show when={rows().length > 0} fallback={<p class="muted small">No data loaded yet — add a CSV on the Data tab.</p>}>
            <Show
              when={!noFit()}
              fallback={
                <div class="notice warn small">
                  A {template.card.width} × {template.card.height} mm card does not fit on this paper with a {template.page.margin} mm margin. Reduce the
                  margin, switch to landscape or choose a bigger sheet.
                </div>
              }
            >
              <p class="small">
                <strong>{selectedRows().length}</strong> {selectedRows().length === 1 ? 'person' : 'people'}
                <Show when={template.page.copies > 1}> × {template.page.copies} copies</Show> = <strong>{cards().length}</strong>{' '}
                {cards().length === 1 ? 'card' : 'cards'}
                <br />
                {layout().cols} × {layout().rows} = {layout().perPage} per sheet → <strong>{pages().length}</strong> {pages().length === 1 ? 'sheet' : 'sheets'}
              </p>
              <Show when={altLayout().perPage > layout().perPage}>
                <div class="notice small" style={{ margin: '4px 0 8px' }}>
                  {template.page.landscape ? 'Portrait' : 'Landscape'} would fit {altLayout().perPage} per sheet.{' '}
                  <button class="link" onClick={() => updateTemplate((t) => (t.page.landscape = !t.page.landscape))}>
                    Switch
                  </button>
                </div>
              </Show>
            </Show>
          </Show>
          <button class="btn primary wide" disabled={pages().length === 0} onClick={() => void print()}>
            Print / Save as PDF…
          </button>
          <p class="muted small">
            In the print dialog choose <strong>Save as PDF</strong> or your printer, set paper size to match, scale <strong>100%</strong> (not "fit to
            page") and margins <strong>None</strong>. Turn on "Background graphics" if colours are missing.
          </p>
        </Section>
      </aside>

      <main class="center print-center">
        <div class="toolbar">
          <div class="row gap">
            <button class="btn" onClick={() => setTab('design')}>
              ← Back to design
            </button>
          </div>
          <Show when={pages().length > 0}>
            <div class="row gap">
              <button class="btn icon" disabled={pageIndex() === 0} onClick={() => setPageIndex((i) => i - 1)}>
                ‹
              </button>
              <span class="small">
                Sheet {pageIndex() + 1} of {pages().length}
              </span>
              <button class="btn icon" disabled={pageIndex() >= pages().length - 1} onClick={() => setPageIndex((i) => i + 1)}>
                ›
              </button>
            </div>
          </Show>
        </div>
        <div class="sheet-viewport" ref={viewport}>
          <Show
            when={pages().length > 0}
            fallback={
              <div class="empty-state muted">
                <Show when={rows().length === 0} fallback={<p>Nothing to show — adjust the paper settings.</p>}>
                  <p>Load a CSV first.</p>
                  <button class="btn" onClick={() => setTab('data')}>
                    Go to Data
                  </button>
                </Show>
              </div>
            }
          >
            <div
              class="sheet-stage"
              style={{
                width: `${layout().pageWidth * PX_PER_MM * zoom()}px`,
                height: `${layout().pageHeight * PX_PER_MM * zoom()}px`,
              }}
            >
              <div style={{ transform: `scale(${zoom()})`, 'transform-origin': '0 0' }}>
                <Sheet rows={pages()[pageIndex()] ?? []} layout={layout()} />
              </div>
            </div>
          </Show>
        </div>
      </main>

      {/* While printing, every sheet is mounted directly under <body>; print CSS hides the app and shows only these. */}
      <Show when={printing()}>
        <Portal>
          <div class="print-root">
            <style>{`@page { size: ${layout().pageWidth}mm ${layout().pageHeight}mm; margin: 0; }`}</style>
            <For each={pages()}>{(rowsOnPage, i) => <Sheet rows={rowsOnPage} layout={layout()} last={i() === pages().length - 1} />}</For>
          </div>
        </Portal>
      </Show>
    </div>
  );
}

/** One printed sheet: a grid of cards plus optional crop marks / outlines. */
function Sheet(props: { rows: Row[]; layout: SheetLayout; last?: boolean }) {
  const L = () => props.layout;
  const cw = () => template.card.width;
  const ch = () => template.card.height;
  const pos = (i: number) => {
    const col = i % L().cols;
    const row = Math.floor(i / L().cols);
    return { x: L().offsetX + col * (cw() + template.page.gapX), y: L().offsetY + row * (ch() + template.page.gapY) };
  };
  const marks = createMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (!template.page.cutMarks) return lines;
    const { pageWidth: pw, pageHeight: ph, cols, rows: nrows, offsetX, offsetY } = L();
    const usedCols = Math.min(cols, props.rows.length);
    const usedRows = Math.ceil(props.rows.length / cols);
    const len = 4;
    const gapFromGrid = 1;
    const gridTop = offsetY;
    const gridBottom = offsetY + usedRows * ch() + (usedRows - 1) * template.page.gapY;
    const gridLeft = offsetX;
    const gridRight = offsetX + usedCols * cw() + (usedCols - 1) * template.page.gapX;
    const xs: number[] = [];
    for (let c = 0; c < usedCols; c++) {
      const x = offsetX + c * (cw() + template.page.gapX);
      xs.push(x, x + cw());
    }
    const ys: number[] = [];
    for (let r = 0; r < Math.min(usedRows, nrows); r++) {
      const y = offsetY + r * (ch() + template.page.gapY);
      ys.push(y, y + ch());
    }
    for (const x of xs) {
      // top & bottom margins
      lines.push({ x1: x, y1: Math.max(0, gridTop - gapFromGrid - len), x2: x, y2: Math.max(0, gridTop - gapFromGrid) });
      lines.push({ x1: x, y1: Math.min(ph, gridBottom + gapFromGrid), x2: x, y2: Math.min(ph, gridBottom + gapFromGrid + len) });
    }
    for (const y of ys) {
      lines.push({ x1: Math.max(0, gridLeft - gapFromGrid - len), y1: y, x2: Math.max(0, gridLeft - gapFromGrid), y2: y });
      lines.push({ x1: Math.min(pw, gridRight + gapFromGrid), y1: y, x2: Math.min(pw, gridRight + gapFromGrid + len), y2: y });
    }
    return lines;
  });

  return (
    <div
      class="sheet"
      classList={{ 'last-sheet': props.last }}
      style={{ width: `${L().pageWidth}mm`, height: `${L().pageHeight}mm` }}
    >
      <For each={props.rows}>
        {(row, i) => (
          <div class="sheet-card" style={{ position: 'absolute', left: `${pos(i()).x}mm`, top: `${pos(i()).y}mm` }}>
            <Card template={template} row={row} />
          </div>
        )}
      </For>
      <Show when={template.page.cutMarks || template.page.outline}>
        <svg
          class="sheet-marks"
          width={`${L().pageWidth}mm`}
          height={`${L().pageHeight}mm`}
          viewBox={`0 0 ${L().pageWidth} ${L().pageHeight}`}
          style={{ position: 'absolute', left: 0, top: 0, 'pointer-events': 'none' }}
        >
          <Show when={template.page.outline}>
            <For each={props.rows}>
              {(_r, i) => (
                <rect
                  x={pos(i()).x}
                  y={pos(i()).y}
                  width={cw()}
                  height={ch()}
                  rx={template.card.borderRadius}
                  fill="none"
                  stroke="#9ca3af"
                  stroke-width="0.15"
                />
              )}
            </For>
          </Show>
          <For each={marks()}>{(m) => <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#111" stroke-width="0.15" />}</For>
        </svg>
      </Show>
    </div>
  );
}
