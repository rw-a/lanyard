import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { ArrowLeft, ChevronLeft, ChevronRight, MoveHorizontal, MoveVertical } from 'lucide-solid';
import { Portal } from 'solid-js/web';
import { unwrap } from 'solid-js/store';
import type { PagePreset, PrintMethod, Row, Template } from '../lib/types';
import { PAGE_PRESETS, PX_PER_MM, computeSheetLayout } from '../lib/template';
import { cropMarks, pagesOfSheet, planPrint, type PlannedPage, type PrintPlan } from '../lib/print-plan';
import { describeReadyFailure, prepareForPrint, type ReadyResult } from '../lib/print-ready';
import { commit, rows, setTab, template, updateTemplate } from '../lib/store';
import Card from './Card';
import { Text } from './park/text';
import * as SegmentGroup from './park/segment-group';
import { Field, NumberField, Section, Select, TextField, Toggle, Notice, Button, IconButton } from './ui';

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

const PRINT_METHOD_OPTIONS: { value: PrintMethod; label: string }[] = [
  { value: 'cutouts', label: 'Separate Cutouts' },
  { value: 'duplex', label: 'Duplex Sheets' },
];

/** Everything a print run uses, frozen when the user starts printing so later edits cannot change it. */
interface PrintJob {
  id: number;
  template: Template;
  rows: Row[];
  plan: PrintPlan;
  pages: PlannedPage[];
}

type JobStatus = { state: 'preparing' } | { state: 'failed'; result: ReadyResult } | { state: 'printing' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function PrintPanel() {
  const [rangeSpec, setRangeSpec] = createSignal('');
  /** The physical sheet shown in the preview, and (duplex only) which side of it. */
  const [sheetIndex, setSheetIndex] = createSignal(0);
  const [face, setFace] = createSignal<'front' | 'back'>('front');
  const [zoom, setZoom] = createSignal(0.5);
  const [job, setJob] = createSignal<PrintJob | null>(null);
  const [status, setStatus] = createSignal<JobStatus | null>(null);
  let viewport!: HTMLDivElement;
  let printRoot: HTMLDivElement | undefined;
  let jobCounter = 0;

  const layout = createMemo(() => computeSheetLayout(template));
  /** How many cards the other orientation would fit — used for a hint. */
  const altLayout = createMemo(() =>
    computeSheetLayout({ ...template, page: { ...template.page, landscape: !template.page.landscape } }),
  );

  /** Selected dataset rows (by index), in print order. */
  const rowIndexes = createMemo(() => parseRange(rangeSpec(), rows().length) ?? rows().map((_, i) => i));
  const plan = createMemo(() => planPrint(template, rowIndexes()));
  const duplex = () => plan().mode === 'duplex';
  const doubleSided = () => template.sidedness !== 'single';

  createEffect(() => {
    const last = Math.max(0, plan().physicalSheetCount - 1);
    if (sheetIndex() > last) setSheetIndex(last);
  });
  createEffect(() => {
    if (!duplex()) setFace('front');
  });

  const previewPage = createMemo(() => {
    const pages = plan().pages.filter((p) => p.sheetIndex === sheetIndex());
    return (duplex() ? pages.find((p) => p.face === face()) : pages[0]) ?? null;
  });

  function fitZoom() {
    if (!viewport) return;
    const { pageWidth, pageHeight } = layout();
    const z = Math.min((viewport.clientWidth - 40) / (pageWidth * PX_PER_MM), (viewport.clientHeight - 40) / (pageHeight * PX_PER_MM));
    setZoom(Math.max(0.1, Math.min(2, z)));
  }

  /** Remove the print sheets (after printing, on cancel, or when something failed). */
  function endJob() {
    jobCounter++;
    setJob(null);
    setStatus(null);
  }

  onMount(() => {
    fitZoom();
    const ro = new ResizeObserver(fitZoom);
    ro.observe(viewport);
    onCleanup(() => ro.disconnect());
    const after = () => {
      if (status()?.state === 'printing') endJob();
    };
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
      jobCounter++; // leaving the Print tab abandons a run that is still being prepared
    });
  });
  createEffect(() => {
    layout();
    fitZoom();
  });

  function openDialog() {
    setStatus({ state: 'printing' });
    try {
      window.print();
    } catch {
      endJob();
    }
    // The sheets are removed again on `afterprint` (see onMount).
  }

  async function prepare(id: number) {
    setStatus({ state: 'preparing' });
    // Wait for the portal to mount before measuring it.
    await new Promise((r) => requestAnimationFrame(r));
    if (id !== jobCounter || !printRoot) return;
    const result = await prepareForPrint(printRoot);
    if (id !== jobCounter) return; // cancelled meanwhile
    if (result.ok) openDialog();
    else setStatus({ state: 'failed', result });
  }

  /** Snapshot the design and rows, mount every page off-screen, wait until it is ready, then open the print dialog. */
  function startPrint(onlySheet?: number) {
    if (job()) return;
    const snapshot = structuredClone(unwrap(template));
    const p = planPrint(snapshot, rowIndexes());
    const pages = onlySheet === undefined ? p.pages : pagesOfSheet(p, onlySheet);
    if (pages.length === 0) return;
    const id = ++jobCounter;
    setJob({ id, template: snapshot, rows: rows(), plan: p, pages });
    void prepare(id);
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
  const people = () => rowIndexes().length;
  const copies = () => Math.max(1, Math.round(template.page.copies));
  const sheetLabel = () => `Sheet ${sheetIndex() + 1} of ${plan().physicalSheetCount}${duplex() ? ` — ${face() === 'front' ? 'Front' : 'Back'}` : ''}`;
  const busy = () => status()?.state === 'preparing' || status()?.state === 'printing';
  const failure = () => {
    const s = status();
    return s?.state === 'failed' ? s.result : null;
  };

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
          <div class="grid3 paper-spacing-controls">
            <Field label="Margin">
              <NumberField value={template.page.margin} min={0} max={50} unit="mm" aria-describedby="paper-margin-hint" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.margin = v), false)} />
            </Field>
            <Field label="Horizontal Gap" labelContent={<>Gap <MoveHorizontal size={14} aria-hidden="true" /></>}>
              <NumberField value={template.page.gapX} min={0} max={50} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.gapX = v), false)} />
            </Field>
            <Field label="Vertical Gap" labelContent={<>Gap <MoveVertical size={14} aria-hidden="true" /></>}>
              <NumberField value={template.page.gapY} min={0} max={50} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.page.gapY = v), false)} />
            </Field>
            <Text id="paper-margin-hint" textStyle="sm" color="fg.muted" gridColumn="1 / -1" margin="0">Most printers need ≥ 5 mm</Text>
          </div>
        </Section>

        <Show when={doubleSided()}>
          <Section title="Double-Sided Printing" data-testid="print-method" collapsible>
            <Field label="Printing method">
              <Select value={template.page.printMethod} options={PRINT_METHOD_OPTIONS} onChange={(v) => updateTemplate((t) => (t.page.printMethod = v))} />
            </Field>
            <p class="muted small">
              <Show
                when={duplex()}
                fallback={<>Each badge's front is printed with its back right beside it, on one side of the paper. Cut both out and put them back to back in the holder.</>}
              >
                Fronts are printed on one side of each sheet and backs on the other, so each cut-out card is already double-sided. Your printer must
                print on both sides.
              </Show>
            </p>
          </Section>
        </Show>

        <Section title="Cutting" collapsible>
          <Toggle checked={template.page.cutMarks} label="Crop marks in the margins" onChange={(v) => updateTemplate((t) => (t.page.cutMarks = v))} />
          <Toggle checked={template.page.outline} label="Thin grey outline around each card" onChange={(v) => updateTemplate((t) => (t.page.outline = v))} />
          <Show when={duplex()}>
            <p class="muted small">Cutting guides are printed on the front of each sheet only.</p>
          </Show>
        </Section>

        <Section title="What to Print" collapsible>
          <Field
            label="Copies of Each Badge"
            hint={doubleSided() ? 'Complete badges per person; each one has a front and a back.' : 'Complete badges per person.'}
          >
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
                <Notice warning class="notice warn small">
                  A {template.card.width} × {template.card.height} mm card does not fit on this paper with a {template.page.margin} mm margin. Reduce the
                  margin, switch to landscape or choose a bigger sheet.
                </Notice>
              }
            >
              <p class="small">
                <strong>{people()}</strong> {people() === 1 ? 'person' : 'people'}
                <Show when={copies() > 1}> × {copies()} copies</Show> = <strong data-testid="summary-badges">{plan().badgeCount}</strong>{' '}
                {plan().badgeCount === 1 ? 'badge' : 'badges'}
                <Show when={doubleSided()}>
                  <br />
                  front and back = <strong data-testid="summary-faces">{plan().printedFaceCount}</strong> printed {plan().printedFaceCount === 1 ? 'face' : 'faces'}
                </Show>
                <br />
                {layout().cols} × {layout().rows} = {layout().perPage} per sheet
                <Show when={plan().mode === 'cutouts' && layout().perPage > 1}> ({plural(plan().badgesPerSheet, 'badge', 'badges')}, front beside back)</Show>
                {' → '}
                <strong data-testid="summary-sheets">{plan().physicalSheetCount}</strong> {plan().physicalSheetCount === 1 ? 'sheet' : 'sheets'}
                <Show when={duplex()}>
                  , both sides = <strong data-testid="summary-pages">{plan().pages.length}</strong> PDF pages
                </Show>
              </p>
              <Show when={altLayout().perPage > layout().perPage}>
                <Notice class="notice small" style={{ margin: '4px 0 8px' }}>
                  {template.page.landscape ? 'Portrait' : 'Landscape'} would fit {altLayout().perPage} per sheet.{' '}
                  <Button variant="plain" size="md" class="link" onClick={() => updateTemplate((t) => (t.page.landscape = !t.page.landscape))}>
                    Switch
                  </Button>
                </Notice>
              </Show>
            </Show>
          </Show>
          <Button size="md" class="btn primary wide" disabled={plan().pages.length === 0 || busy()} onClick={() => startPrint()}>
            Print / Save as PDF…
          </Button>
          <Show when={duplex()}>
            <Button
              variant="outline"
              size="md"
              class="btn wide"
              disabled={plan().pages.length === 0 || busy()}
              title="Print the sheet shown in the preview, front and back, to check the alignment"
              onClick={() => startPrint(sheetIndex())}
            >
              Print Test Sheet ({sheetIndex() + 1})
            </Button>
          </Show>
          <Show when={status()}>
            {(s) => (
              <div data-testid="print-status">
                <Show when={s().state === 'preparing'}>
                  <p class="small muted" role="status">
                    Preparing {plural(job()?.pages.length ?? 0, 'page', 'pages')}…{' '}
                    <Button variant="plain" size="xs" class="link" onClick={endJob}>
                      Cancel
                    </Button>
                  </p>
                </Show>
                <Show when={failure()}>
                  {(r) => (
                    <Notice warning class="notice warn small" role="alert">
                      {describeReadyFailure(r())}
                      <span class="row gap wrap" style={{ 'margin-top': '6px' }}>
                        <Button variant="outline" size="xs" class="btn small" onClick={() => void prepare(jobCounter)}>
                          Try again
                        </Button>
                        <Button variant="outline" size="xs" class="btn small" onClick={openDialog}>
                          Print anyway
                        </Button>
                        <Button variant="outline" size="xs" class="btn small" onClick={endJob}>
                          Cancel
                        </Button>
                      </span>
                    </Notice>
                  )}
                </Show>
              </div>
            )}
          </Show>
          <div class="muted small print-instructions" data-testid="print-instructions">
            <Show when={duplex()} fallback={<p>Print <strong>one-sided</strong>{doubleSided() ? ', then cut out each front and the back next to it.' : '.'}</p>}>
              <p>
                Print <strong>double-sided</strong> with{' '}
                <strong data-testid="duplex-binding">{template.page.landscape ? 'flip on short edge' : 'flip on long edge'}</strong>
                {template.page.landscape ? ' (landscape paper)' : ' (portrait paper)'}. The backs are laid out for turning the sheet over from left to
                right. Print a test sheet first and hold it up to the light to check that fronts and backs line up.
              </p>
            </Show>
            <p>
              In the print dialog choose <strong>Save as PDF</strong> or your printer, set paper size to match, scale <strong>100%</strong> (not "fit to
              page"), margins <strong>None</strong> and headers and footers off. Turn on "Background graphics" if colours are missing.
              <Show when={doubleSided()}> A saved PDF must later be printed with the same settings.</Show>
            </p>
          </div>
        </Section>
      </aside>

      <main class="center print-center">
        <div class="toolbar">
          <div class="row gap">
            <Button variant="outline" size="md" class="btn" onClick={() => setTab('design')}>
              <ArrowLeft aria-hidden="true" /> Back to design
            </Button>
          </div>
          <Show when={plan().pages.length > 0}>
            <div class="row gap">
              <IconButton variant="outline" size="xs" class="btn icon" aria-label="Previous sheet" disabled={sheetIndex() === 0} onClick={() => setSheetIndex((i) => i - 1)}>
                <ChevronLeft aria-hidden="true" />
              </IconButton>
              <span class="small" data-testid="sheet-label">
                {sheetLabel()}
              </span>
              <IconButton
                variant="outline"
                size="xs"
                class="btn icon"
                aria-label="Next sheet"
                disabled={sheetIndex() >= plan().physicalSheetCount - 1}
                onClick={() => setSheetIndex((i) => i + 1)}
              >
                <ChevronRight aria-hidden="true" />
              </IconButton>
              <Show when={duplex()}>
                <SegmentGroup.Root size="xs" value={face()} onValueChange={(d) => d.value && setFace(d.value as 'front' | 'back')} aria-label="Side of the sheet">
                  <SegmentGroup.Indicator />
                  <SegmentGroup.Item value="front">
                    <SegmentGroup.ItemText>Front</SegmentGroup.ItemText>
                    <SegmentGroup.ItemHiddenInput />
                  </SegmentGroup.Item>
                  <SegmentGroup.Item value="back">
                    <SegmentGroup.ItemText>Back</SegmentGroup.ItemText>
                    <SegmentGroup.ItemHiddenInput />
                  </SegmentGroup.Item>
                </SegmentGroup.Root>
              </Show>
            </div>
          </Show>
        </div>
        <div class="sheet-viewport" ref={viewport}>
          <Show
            when={previewPage()}
            fallback={
              <div class="empty-state muted">
                <Show when={rows().length === 0} fallback={<p>Nothing to show — adjust the paper settings.</p>}>
                  <p>Load a CSV first.</p>
                  <Button variant="outline" size="md" class="btn" onClick={() => setTab('data')}>
                    Go to Data
                  </Button>
                </Show>
              </div>
            }
          >
            {(page) => (
              <div class="sheet-preview">
                <div
                  class="sheet-stage"
                  style={{
                    width: `${layout().pageWidth * PX_PER_MM * zoom()}px`,
                    height: `${layout().pageHeight * PX_PER_MM * zoom()}px`,
                  }}
                >
                  <div style={{ transform: `scale(${zoom()})`, 'transform-origin': '0 0' }}>
                    <Sheet template={template} rows={rows()} plan={plan()} page={page()} />
                  </div>
                </div>
                <Show when={duplex() && page().face === 'back'}>
                  <p class="muted small sheet-caption" data-testid="back-caption">
                    The back of the sheet, as seen after turning it over from left to right — the badges appear in mirrored order.
                  </p>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </main>

      {/* While printing, the planned pages are mounted directly under <body>: off-screen but laid out so text can be fitted, and the only thing print CSS shows. */}
      <Show when={job()}>
        {(j) => (
          <Portal>
            <div class="print-root" ref={printRoot} data-testid="print-root">
              <style>{`@page { size: ${j().plan.layout.pageWidth}mm ${j().plan.layout.pageHeight}mm; margin: 0; }`}</style>
              <For each={j().pages}>
                {(page, i) => <Sheet template={j().template} rows={j().rows} plan={j().plan} page={page} last={i() === j().pages.length - 1} />}
              </For>
            </div>
          </Portal>
        )}
      </Show>
    </div>
  );
}

/**
 * One printed page: the faces the plan put on it at their planned positions,
 * plus optional crop marks / outlines. Reads only what it is given, so the
 * preview (live design) and the print run (a snapshot) render identically.
 */
function Sheet(props: { template: Template; rows: Row[]; plan: PrintPlan; page: PlannedPage; last?: boolean }) {
  const L = () => props.plan.layout;
  const cw = () => props.template.card.width;
  const ch = () => props.template.card.height;
  const showGuides = () => props.page.guides && (props.template.page.cutMarks || props.template.page.outline);
  const marks = createMemo(() => (props.template.page.cutMarks ? cropMarks(props.page, L(), props.template.card) : []));

  return (
    <div
      class="sheet"
      classList={{ 'last-sheet': props.last }}
      data-face={props.page.face}
      data-sheet={props.page.sheetIndex}
      style={{ width: `${L().pageWidth}mm`, height: `${L().pageHeight}mm` }}
    >
      <For each={props.page.placements}>
        {(p) => {
          const badge = () => props.plan.instances[p.instanceIndex];
          return (
            <div
              class="sheet-card"
              data-side={p.side}
              data-instance={p.instanceIndex}
              data-row={badge().rowIndex}
              data-copy={badge().copyIndex}
              style={{ position: 'absolute', left: `${p.x}mm`, top: `${p.y}mm`, width: `${cw()}mm`, height: `${ch()}mm` }}
            >
              <Card template={props.template} side={p.side} row={props.rows[badge().rowIndex] ?? {}} />
            </div>
          );
        }}
      </For>
      <Show when={showGuides()}>
        <svg
          class="sheet-marks"
          width={`${L().pageWidth}mm`}
          height={`${L().pageHeight}mm`}
          viewBox={`0 0 ${L().pageWidth} ${L().pageHeight}`}
          style={{ position: 'absolute', left: 0, top: 0, 'pointer-events': 'none' }}
        >
          <Show when={props.template.page.outline}>
            <For each={props.page.placements}>
              {(p) => <rect x={p.x} y={p.y} width={cw()} height={ch()} rx={props.template.card.borderRadius} fill="none" stroke="#9ca3af" stroke-width="0.15" />}
            </For>
          </Show>
          <For each={marks()}>{(m) => <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke="#111" stroke-width="0.15" />}</For>
        </svg>
      </Show>
    </div>
  );
}
