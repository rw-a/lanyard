import { For, Show, createSignal } from 'solid-js';
import { describeFit, elementLabel, newImageElement, newRectElement, newTextElement } from '../lib/template';
import { activeDesign, activeSide, headers, selectedElement, selectedId, setSelectedId, template, updateElement, updateSide } from '../lib/store';
import type { FitStatus, TemplateElement } from '../lib/types';
import {
  ArrowDown as IconArrowDown,
  ArrowUp as IconArrowUp,
  CircleAlert,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Image as IconImage,
  Lock as IconLock,
  LockOpen as IconUnlock,
  Plus as IconPlus,
  RectangleHorizontal as IconShape,
  Type as IconText,
} from 'lucide-solid';
import TemplateBasics from './TemplateBasics';
import { Section, IconButton, Button, Select } from './ui';

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
    updateSide(activeSide(), (d) => {
      d.elements.push(el);
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
        y: Math.min(template.card.height - 16, 10 + activeDesign().elements.length * 6),
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
    updateSide(activeSide(), (d) => {
      const i = d.elements.findIndex((e) => e.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.elements.length) return;
      const [el] = d.elements.splice(i, 1);
      d.elements.splice(j, 0, el);
    });
  }

  // Top-most element first in the list.
  const ordered = () => [...activeDesign().elements].reverse();

  return (
    <>
      <TemplateBasics />
      <Section title="Add" collapsible>
        <div class="add-grid">
          <Show when={headers().length > 0}>
            <Select
              label="Add field from CSV"
              value={fieldPick()}
              placeholder="Field from CSV…"
              options={headers().map((h) => ({ value: h, label: h }))}
              onChange={addField}
              onSelectionComplete={() => (document.activeElement as HTMLElement)?.blur()}
            />
          </Show>
          <IconButton variant="outline" size="xs" class="btn add-icon" aria-label="Add text" title="Add text" onClick={() => add(newTextElement({ content: 'Static text', w: template.card.width - 12, x: 6, y: 10, h: 10 }))}>
            <IconPlus aria-hidden="true" size={12} />
            <IconText aria-hidden="true" size={20} />
          </IconButton>
          <IconButton variant="outline" size="xs" class="btn add-icon" aria-label="Add shape" title="Add shape" onClick={() => add(newRectElement({ x: 0, y: template.card.height - 20, w: template.card.width, h: 20 }))}>
            <IconPlus aria-hidden="true" size={12} />
            <IconShape aria-hidden="true" size={20} />
          </IconButton>
          <IconButton variant="outline" size="xs" class="btn add-icon" aria-label="Add image or logo" title="Add image or logo" onClick={() => add(newImageElement({ x: 6, y: 6, w: 25, h: 25 }))}>
            <IconPlus aria-hidden="true" size={12} />
            <IconImage aria-hidden="true" size={20} />
          </IconButton>
        </div>
      </Section>

      <Section title={`Layers (${activeDesign().elements.length})`} collapsible>
        <Show when={activeDesign().elements.length === 0}>
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
                    return <Icon aria-hidden="true" size={14} />;
                  })()}
                </span>
                <span class="layer-name">
                  <span class="layer-label">{elementLabel(el)}</span>
                  <Show when={describeFit(props.fitMap.get(el.id))}>
                    {(d) => (
                      <span class="overflow-dot" data-testid="layer-problem" title={`With the current preview data the ${d()}`}>
                        <CircleAlert size={14} aria-hidden="true" />
                      </span>
                    )}
                  </Show>
                </span>
                {/* Always-visible state markers, so a locked/hidden layer is recognisable without hovering. */}
                <span class="layer-flags" aria-hidden="true">
                  <Show when={el.locked}>
                    <IconLock aria-hidden="true" size={13} />
                  </Show>
                  <Show when={el.hidden}>
                    <IconEyeOff aria-hidden="true" size={13} />
                  </Show>
                </span>
                {/* Overlaid on the right of the row and faded in on hover/focus: never changes the row's size. */}
                <span class="layer-actions">
                  <IconButton variant="plain" size="2xs" type="button" class="icon-btn" title="Move up (towards the front)" aria-label={`Move ${el.name} up`} onClick={(e) => {
                      e.stopPropagation();
                      move(el.id, +1);
                    }}>
                    <IconArrowUp aria-hidden="true" />
                  </IconButton>
                  <IconButton variant="plain" size="2xs" type="button" class="icon-btn" title="Move down (towards the back)" aria-label={`Move ${el.name} down`} onClick={(e) => {
                      e.stopPropagation();
                      move(el.id, -1);
                    }}>
                    <IconArrowDown aria-hidden="true" />
                  </IconButton>
                  <IconButton variant="plain" size="2xs"
                    type="button"
                    class="icon-btn"
                    aria-pressed={el.locked}
                    title={el.locked ? 'Unlock' : 'Lock (prevents dragging)'}
                    aria-label={`${el.locked ? 'Unlock' : 'Lock'} ${el.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(activeSide(), el.id, (x) => (x.locked = !x.locked));
                    }}
                  >
                    <Show when={el.locked} fallback={<IconUnlock aria-hidden="true" />}>
                      <IconLock aria-hidden="true" />
                    </Show>
                  </IconButton>
                  <IconButton variant="plain" size="2xs"
                    type="button"
                    class="icon-btn"
                    aria-pressed={el.hidden}
                    title={el.hidden ? 'Show' : 'Hide'}
                    aria-label={`${el.hidden ? 'Show' : 'Hide'} ${el.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateElement(activeSide(), el.id, (x) => (x.hidden = !x.hidden));
                    }}
                  >
                    <Show when={el.hidden} fallback={<IconEye aria-hidden="true" />}>
                      <IconEyeOff aria-hidden="true" />
                    </Show>
                  </IconButton>
                </span>
              </li>
            )}
          </For>
        </ul>
        <Show when={selectedElement()}>
          <div class="row gap" style={{ 'margin-top': '8px' }}>
            <Button variant="outline" size="xs" class="btn small" onClick={props.onDuplicate}>
              Duplicate
            </Button>
            <Button variant="outline" size="xs" colorPalette="red" class="btn small danger" onClick={props.onRemove}>
              Delete
            </Button>
          </div>
        </Show>
      </Section>
    </>
  );
}
