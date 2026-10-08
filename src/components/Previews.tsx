import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { PX_PER_MM, elementLabel } from '../lib/template';
import { extremes, ignoreEmpty, previewSource, rows, setIgnoreEmpty, setPreviewSource, setSelectedId, template, usedColumns } from '../lib/store';
import { fitProblem, type FitStatus, type Row } from '../lib/types';
import Card from './Card';
import { Switch } from './ui';

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

  return (
    <section class="previews">
      <header class="previews-head">
        <div class="previews-title">
          <h3>Fit check</h3>
        </div>
        <p class="muted small">
          <Show when={hasData()} fallback={<>Load a CSV to see your layout filled with the shortest, median and longest values of each field.</>}>
            Each field independently takes its shortest, median or longest value across all {rows().length} rows. Red outlines mean the text does not
            fit even at its minimum font size, or is cut off by the edge of the card.
          </Show>
        </p>
      </header>
      <div class="previews-strip" ref={strip}>
        <For each={variants}>{(v) => <PreviewCard variant={v} zoom={zoom()} enabled={hasData()} />}</For>
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
      <Show when={hasData() && usedColumns().length > 0}>
        <details class="preview-details">
          <summary class="small muted">Which values are being used?</summary>
          <table class="table small stats">
            <thead>
              <tr>
                <th>Field</th>
                <th>Shortest</th>
                <th>Median</th>
                <th>Longest</th>
              </tr>
            </thead>
            <tbody>
              <For each={extremes().stats}>
                {(s) => (
                  <tr>
                    <td>
                      <strong>{s.column}</strong>
                    </td>
                    <td>
                      <span class="val">{s.shortest || <em class="muted">(empty)</em>}</span> <span class="len">{s.minLen}</span>
                    </td>
                    <td>
                      <span class="val">{s.median || <em class="muted">(empty)</em>}</span> <span class="len">{s.medianLen}</span>
                    </td>
                    <td>
                      <span class="val">{s.longest || <em class="muted">(empty)</em>}</span> <span class="len">{s.maxLen}</span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </details>
      </Show>
    </section>
  );
}

function PreviewCard(props: { variant: Variant; zoom: number; enabled: boolean }) {
  const [fitMap, setFitMap] = createSignal<Map<string, FitStatus>>(new Map());
  const names = (pick: (s: FitStatus) => boolean) =>
    [...fitMap().entries()]
      .filter(([, s]) => pick(s))
      .map(([id]) => template.elements.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map(elementLabel);
  const overflowNames = createMemo(() => names((s) => s.overflow));
  const clippedNames = createMemo(() => names((s) => s.clipped && !s.overflow));
  const hasProblem = () => fitMap().size > 0;
  const w = () => template.card.width * PX_PER_MM * props.zoom;
  const h = () => template.card.height * PX_PER_MM * props.zoom;

  return (
    <div class="preview" data-testid={`preview-${props.variant.key}`} classList={{ 'has-overflow': hasProblem(), disabled: !props.enabled }}>
      <header>
        <strong>{props.variant.title}</strong>
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
            row={props.enabled ? props.variant.row() : {}}
            class="preview-card"
            onFit={(id, status) =>
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
          <Show when={hasProblem()} fallback={<span class="ok">✓ Everything fits</span>}>
            <span class="warn-text">
              <Show when={overflowNames().length > 0}>⚠ Overflows: {overflowNames().join(', ')}</Show>
              <Show when={overflowNames().length > 0 && clippedNames().length > 0}>
                <br />
              </Show>
              <Show when={clippedNames().length > 0}>⚠ Cut off by card edge: {clippedNames().join(', ')}</Show>
            </span>
          </Show>
        </Show>
      </footer>
    </div>
  );
}
