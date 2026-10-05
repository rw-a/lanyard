import { For, Show, createSignal } from 'solid-js';
import { describeFit, elementLabel, newImageElement, newRectElement, newTextElement } from '../lib/template';
import { headers, selectedId, setSelectedId, template, updateElement, updateTemplate } from '../lib/store';
import type { FitStatus, TemplateElement } from '../lib/types';
import { IconArrowDown, IconArrowUp, IconEye, IconEyeOff, IconImage, IconLock, IconShape, IconText, IconUnlock } from './icons';
import { Section } from './ui';

interface Props {
  fitMap: Map<string, FitStatus>;
  onDuplicate: () => void;
  onRemove: () => void;
}

const KIND_ICON = { text: IconText, rect: IconShape, image: IconImage } as const;
const KIND_NAME = { text: 'Text', rect: 'Shape', image: 'Image' } as const;

export default function Layers(props: Props) {
  const [fieldPick, setFieldPick] = createSignal('');

  function add(el: TemplateElement) {
    updateTemplate((t) => {
      t.elements.push(el);
    });
    setSelectedId(el.id);
  }

  function addField(col: string) {
    if (!col) return;
    const W = template.card.width;
    add(
      newTextElement({
        name: col,
        content: `{{${col}}}`,
        x: 6,
        y: Math.min(template.card.height - 16, 10 + template.elements.length * 6),
        w: W - 12,
        h: 14,
        fontSize: 16,
        minFontSize: 8,
        align: 'center',
        vAlign: 'middle',
      }),
    );
    setFieldPick('');
  }

  function move(id: string, delta: number) {
    updateTemplate((t) => {
      const i = t.elements.findIndex((e) => e.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= t.elements.length) return;
      const [el] = t.elements.splice(i, 1);
      t.elements.splice(j, 0, el);
    });
  }

  // Top-most element first in the list.
  const ordered = () => [...template.elements].reverse();

  return (
    <>
      <Section title="Add">
        <div class="add-grid">
          <Show when={headers().length > 0}>
            <select
              class="input"
              value={fieldPick()}
              onChange={(e) => {
                addField(e.currentTarget.value);
                e.currentTarget.value = '';
                e.currentTarget.blur(); // so arrow keys / Delete act on the new element, not the dropdown
              }}
            >
              <option value="">＋ Field from CSV…</option>
              <For each={headers()}>{(h) => <option value={h}>{h}</option>}</For>
            </select>
          </Show>
          <button class="btn" onClick={() => add(newTextElement({ content: 'Static text', w: template.card.width - 12, x: 6, y: 10, h: 10 }))}>
            ＋ Text
          </button>
          <button class="btn" onClick={() => add(newRectElement({ x: 0, y: template.card.height - 20, w: template.card.width, h: 20 }))}>
            ＋ Shape
          </button>
          <button class="btn" onClick={() => add(newImageElement({ x: 6, y: 6, w: 25, h: 25 }))}>
            ＋ Image / logo
          </button>
        </div>
      </Section>

      <Section title={`Layers (${template.elements.length})`}>
        <Show when={template.elements.length === 0}>
          <p class="muted small">No elements yet. Add a field from your CSV, some text, a colour band or a logo.</p>
        </Show>
        <ul class="layers">
          <For each={ordered()}>
            {(el) => (
              <li
                class="layer"
                data-testid="layer"
                data-name={el.name}
                classList={{ active: selectedId() === el.id, hidden: el.hidden, locked: el.locked }}
                onClick={() => setSelectedId(el.id)}
                title={el.kind === 'text' ? el.content : el.name}
              >
                <span class="layer-kind" title={KIND_NAME[el.kind]}>
                  {(() => {
                    const Icon = KIND_ICON[el.kind];
                    return <Icon size={14} />;
                  })()}
                </span>
                <span class="layer-name">
                  <span class="layer-label">{elementLabel(el)}</span>
                  <Show when={describeFit(props.fitMap.get(el.id))}>
                    {(d) => (
                      <span class="overflow-dot" data-testid="layer-problem" title={`With the current preview data the ${d()}`}>
                        !
                      </span>
                    )}
                  </Show>
                </span>
                {/* Always-visible state markers, so a locked/hidden layer is recognisable without hovering. */}
                <span class="layer-flags" aria-hidden="true">
                  <Show when={el.locked}>
                    <IconLock size={13} />
                  </Show>
                  <Show when={el.hidden}>
                    <IconEyeOff size={13} />
                  </Show>
                </span>
                {/* Overlaid on the right of the row and faded in on hover/focus: never changes the row's size. */}
                <span class="layer-actions">
                  <button type="button" class="icon-btn" title="Move up (towards the front)" aria-label={`Move ${el.name} up`} onClick={(e) => {
                      e.stopPropagation();
                      move(el.id, +1);
                    }}>
                    <IconArrowUp />
                  </button>
                  <button type="button" class="icon-btn" title="Move down (towards the back)" aria-label={`Move ${el.name} down`} onClick={(e) => {
                      e.stopPropagation();
                      move(el.id, -1);
                    }}>
                    <IconArrowDown />
                  </button>
                  <button
                    type="button"
                    class="icon-btn"
                    aria-pressed={el.locked}
                    title={el.locked ? 'Unlock' : 'Lock (prevents dragging)'}
                    aria-label={`${el.locked ? 'Unlock' : 'Lock'} ${el.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(el.id, (x) => (x.locked = !x.locked));
                    }}
                  >
                    <Show when={el.locked} fallback={<IconUnlock />}>
                      <IconLock />
                    </Show>
                  </button>
                  <button
                    type="button"
                    class="icon-btn"
                    aria-pressed={el.hidden}
                    title={el.hidden ? 'Show' : 'Hide'}
                    aria-label={`${el.hidden ? 'Show' : 'Hide'} ${el.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(el.id, (x) => (x.hidden = !x.hidden));
                    }}
                  >
                    <Show when={el.hidden} fallback={<IconEye />}>
                      <IconEyeOff />
                    </Show>
                  </button>
                </span>
              </li>
            )}
          </For>
        </ul>
        <Show when={selectedId()}>
          <div class="row gap" style={{ 'margin-top': '8px' }}>
            <button class="btn small" onClick={props.onDuplicate}>
              Duplicate
            </button>
            <button class="btn small danger" onClick={props.onRemove}>
              Delete
            </button>
          </div>
        </Show>
      </Section>
    </>
  );
}
