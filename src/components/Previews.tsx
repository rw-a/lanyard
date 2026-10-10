import { button } from 'styled-system/recipes';
import { Check, TriangleAlert } from 'lucide-solid';
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { PX_PER_MM, elementLabel } from '../lib/template';
import { activeColumns, activeDesign, activeSide, extremes, ignoreEmpty, previewSource, rows, setIgnoreEmpty, setPreviewSource, setSelectedId, template } from '../lib/store';
import { editingLabel } from '../lib/sides';
import { fitProblem, type FitStatus, type Row, type SideId } from '../lib/types';
import Card from './Card';
import { Switch, Table, Collapsible, SurfaceCard, Heading } from './ui';

interface Variant {
  key: 'shortest' | 'median' | 'longest';
  title: string;
  blurb: string;
  row: () => Row;
}

/**
 * Three live previews: every field filled with its shortest, median and longest
 * value (by character count) across the whole CSV. The longest one is the stress
 * test for the layout; the shortest shows whether short values still look balanced.
 */
export default function Previews() {
  const [zoom, setZoom] = createSignal(0.6);
  let strip!: HTMLDivElement;

  const variants: Variant[] = [
    {
      key: 'shortest',
      title: 'Shortest',
      blurb: 'Every field at its shortest value',
      row: () => extremes().shortest,
    },
    {
      key: 'median',
      title: 'Median',
      blurb: 'Every field at its median length',
      row: () => extremes().median,
    },
    {
      key: 'longest',
      title: 'Longest',
      blurb: 'Every field at its longest value — worst case',
      row: () => extremes().longest,
    },
  ];

  function fit() {
    if (!strip) return;
    const columns = window.matchMedia('(max-width: 860px)').matches ? 1 : 3;
    const avail = strip.clientWidth - (columns - 1) * 16 - columns * 24;
    const z = avail / columns / (template.card.width * PX_PER_MM);
    const maxH = Math.min(240, Math.max(140, window.innerHeight * 0.24));
    const byHeight = maxH / (template.card.height * PX_PER_MM);
    setZoom(Math.max(0.15, Math.min(1, z, byHeight)));
  }
  onMount(() => {
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(strip);
    window.addEventListener('resize', fit);
    onCleanup(() => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    });
  });
  createEffect(() => {
    template.card.width;
    template.card.height;
    fit();
  });

  const hasData = () => rows().length > 0;
  /** The canvas is filled from the same shortest/median/longest rows when its "Preview with" is set to one of them. */
  const canvasUsesExtremes = () => previewSource().type !== 'row';
  const canvasVariantName = () => previewSource().type;
  const sideLabel = () => editingLabel(template, activeSide());
  /** Only the fields the design being checked reads from. */
  const activeStats = createMemo(() => {
    const cols = activeColumns();
    return extremes().stats.filter((s) => cols.includes(s.column));
  });

  return (
    <section class="previews">
      <header class="previews-head">
        <div class="previews-title">
          <Heading as="h3" textStyle="md" color="fg.default" data-testid="fit-check-title">Fit Check{template.sidedness === 'single' ? '' : ` — ${sideLabel()}`}</Heading>
        </div>
        <p class="muted small">
          <Show when={hasData()} fallback={<>Load a CSV to see your layout filled with the shortest, median and longest values of each field.</>}>
            Each field independently takes its shortest, median or longest value across all {rows().length} rows. Red outlines mean the text does not
            fit even at its minimum font size, or is cut off by the edge of the card.
            <Show when={template.sidedness === 'different'}> These checks cover the {sideLabel()} only; switch sides to check the other one.</Show>
          </Show>
        </p>
      </header>
      <div class="previews-strip" ref={strip}>
        {/* Keyed on the side: a switch remounts the previews so no result from the other side lingers. */}
        <Show when={activeSide()} keyed>
          {(side) => <For each={variants}>{(v) => <PreviewCard side={side} variant={v} zoom={zoom()} enabled={hasData()} />}</For>}
        </Show>
      </div>
      {/* Options that change how the three cards above are filled, kept right next to them. */}
      <Show when={hasData()}>
        <div class="previews-options" data-testid="previews-options">
          <Switch
            checked={ignoreEmpty()}
            onChange={setIgnoreEmpty}
            label="Ignore empty cells"
            title="When off, an empty cell counts as the shortest value"
            data-testid="ignore-empty"
          />
          <span class="muted small" data-testid="ignore-empty-hint">
            {ignoreEmpty() ? 'Blank cells are skipped when choosing these values' : 'Blank cells count as the shortest value'}
            <Show when={canvasUsesExtremes()}> · also used by the canvas preview ({canvasVariantName()})</Show>
          </span>
        </div>
      </Show>
      <Show when={hasData() && activeStats().length > 0}>
        <Collapsible.Root class="preview-details">
          <Collapsible.Trigger class={button({ variant: 'plain', size: 'xs' })}>Which values are being used?</Collapsible.Trigger>
          <Collapsible.Content>
            <Table.Root class="table small stats">
              <Table.Head>
                <Table.Row>
                  <Table.Header>Field</Table.Header>
                  <Table.Header>Shortest</Table.Header>
                  <Table.Header>Median</Table.Header>
                  <Table.Header>Longest</Table.Header>
                </Table.Row>
              </Table.Head>
              <Table.Body>
                <For each={activeStats()}>
                  {(s) => (
                    <Table.Row>
                      <Table.Cell>
                        <strong>{s.column}</strong>
                      </Table.Cell>
                      <Table.Cell>
                        <span class="val">{s.shortest || <em class="muted">(empty)</em>}</span> <span class="len">{s.minLen}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span class="val">{s.median || <em class="muted">(empty)</em>}</span> <span class="len">{s.medianLen}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span class="val">{s.longest || <em class="muted">(empty)</em>}</span> <span class="len">{s.maxLen}</span>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </For>
              </Table.Body>
            </Table.Root>
          </Collapsible.Content>
        </Collapsible.Root>
      </Show>
    </section>
  );
}

function PreviewCard(props: { side: SideId; variant: Variant; zoom: number; enabled: boolean }) {
  const [rawFitMap, setFitMap] = createSignal<Map<string, FitStatus>>(new Map());
  /** Results for layers that still exist and are shown on this side. */
  const fitMap = createMemo(() => {
    const visible = new Set(activeDesign().elements.filter((e) => !e.hidden).map((e) => e.id));
    return new Map([...rawFitMap()].filter(([id]) => visible.has(id)));
  });
  const names = (pick: (s: FitStatus) => boolean) =>
    [...fitMap().entries()]
      .filter(([, s]) => pick(s))
      .map(([id]) => activeDesign().elements.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map(elementLabel);
  const overflowNames = createMemo(() => names((s) => s.overflow));
  const clippedNames = createMemo(() => names((s) => s.clipped && !s.overflow));
  const hasProblem = () => fitMap().size > 0;
  const w = () => template.card.width * PX_PER_MM * props.zoom;
  const h = () => template.card.height * PX_PER_MM * props.zoom;

  return (
    <SurfaceCard.Root class={`preview${hasProblem() ? ' has-overflow' : ''}${!props.enabled ? ' disabled' : ''}`} data-testid={`preview-${props.variant.key}`}>
      <header>
        <Heading as="h4" textStyle="sm" color="fg.default">{props.variant.title}</Heading>
        <span class="muted small">{props.variant.blurb}</span>
      </header>
      <div
        class="preview-stage"
        style={{ width: `${w()}px`, height: `${h()}px` }}
        title="Click to edit the design with these values"
        onClick={() => {
          setPreviewSource({ type: props.variant.key });
          setSelectedId(null);
        }}
      >
        <div style={{ transform: `scale(${props.zoom})`, 'transform-origin': '0 0' }}>
          <Card
            template={template}
            side={props.side}
            row={props.enabled ? props.variant.row() : {}}
            class="preview-card"
            onFit={(id, status) =>
              props.side === activeSide() &&
              setFitMap((prev) => {
                const next = new Map(prev);
                if (fitProblem(status)) next.set(id, status);
                else next.delete(id);
                return next;
              })
            }
          />
        </div>
      </div>
      <footer class="small" data-testid="preview-status">
        <Show when={props.enabled}>
          <Show when={hasProblem()} fallback={<span class="ok"><Check size={14} class="preview-status-icon" aria-hidden="true" /> Everything fits</span>}>
            <span class="warn-text">
              <Show when={overflowNames().length > 0}><TriangleAlert size={14} class="preview-status-icon" aria-hidden="true" /> Overflows: {overflowNames().join(', ')}</Show>
              <Show when={overflowNames().length > 0 && clippedNames().length > 0}>
                <br />
              </Show>
              <Show when={clippedNames().length > 0}><TriangleAlert size={14} class="preview-status-icon" aria-hidden="true" /> Cut off by card edge: {clippedNames().join(', ')}</Show>
            </span>
          </Show>
        </Show>
      </footer>
    </SurfaceCard.Root>
  );
}
