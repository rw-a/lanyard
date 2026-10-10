import { Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import { CARD_PRESETS } from '../lib/template';
import { SIDEDNESS_OPTIONS, editingLabel, sideHasContent } from '../lib/sides';
import {
  activeDesign,
  activeSide,
  beginAsyncEdit,
  clearBack,
  commit,
  copyFrontToBack,
  internImage,
  setSidedness,
  template,
  updateSide,
  updateTemplate,
} from '../lib/store';
import { readImageFile } from '../lib/images';
import { ArrowLeftRight } from 'lucide-solid';
import { ColorField, Field, NumberField, Section, Select, IconButton, Button } from './ui';

export default function TemplateBasics() {
  let bgInput!: HTMLInputElement;
  const presetValue = createMemo(() => {
    const preset = CARD_PRESETS.find((p) => p.width === template.card.width && p.height === template.card.height);
    return preset ? preset.label : 'custom';
  });
  /** Which destructive back action is waiting for "Really…?" confirmation. */
  const [confirm, setConfirm] = createSignal<'copy' | 'clear' | null>(null);
  // A pending "Really…?" belongs to the back it was asked about.
  createEffect(on([activeSide, () => template.sidedness], () => setConfirm(null), { defer: true }));
  const editingBack = () => template.sidedness === 'different' && activeSide() === 'back';
  const savedBackInactive = () => template.sidedness !== 'different' && !!template.sides.back;

  function runBackAction(action: 'copy' | 'clear') {
    if (confirm() !== action && sideHasContent(template.sides.back)) {
      setConfirm(action);
      return;
    }
    setConfirm(null);
    if (action === 'copy') copyFrontToBack();
    else clearBack();
  }

  return (
    <Section title="Card Settings" collapsible>
      <Field label="Sides">
        <Select
          value={template.sidedness}
          options={SIDEDNESS_OPTIONS}
          onChange={(mode) => {
            setConfirm(null);
            setSidedness(mode);
          }}
        />
      </Field>
      <Show when={savedBackInactive()}>
        <p class="muted small side-note" data-testid="saved-back-note">
          Your separate back design is saved and will return when you choose different sides.
        </p>
      </Show>
      <Show when={editingBack()}>
        <div class="row gap wrap back-actions" data-testid="back-actions">
          <Show
            when={confirm() === 'copy'}
            fallback={
              <Button variant="outline" size="xs" class="btn small" onClick={() => runBackAction('copy')}>
                Copy Front to Back
              </Button>
            }
          >
            <Button variant="outline" size="xs" colorPalette="red" class="btn small danger" onClick={() => runBackAction('copy')}>
              Really replace the back?
            </Button>
            <Button variant="outline" size="xs" class="btn small" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </Show>
          <Show
            when={confirm() === 'clear'}
            fallback={
              <Button variant="outline" size="xs" class="btn small" onClick={() => runBackAction('clear')}>
                Clear Back
              </Button>
            }
          >
            <Button variant="outline" size="xs" colorPalette="red" class="btn small danger" onClick={() => runBackAction('clear')}>
              Really clear the back?
            </Button>
            <Button variant="outline" size="xs" class="btn small" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </Show>
        </div>
      </Show>

      <Field label="Preset">
        <Select
          value={presetValue()}
          options={[{ value: 'custom', label: 'Custom' }, ...CARD_PRESETS.map((p) => ({ value: p.label, label: p.label }))]}
          onChange={(value) => {
            const preset = CARD_PRESETS.find((p) => p.label === value);
            if (preset) {
              updateTemplate((t) => {
                t.card.width = preset.width;
                t.card.height = preset.height;
              });
            }
          }}
        />
      </Field>
      <div class="card-dimensions">
        <Field label="Width">
          <NumberField value={template.card.width} min={20} max={400} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.width = v), false)} />
        </Field>
        <Field label="Height">
          <NumberField value={template.card.height} min={20} max={400} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.height = v), false)} />
        </Field>
        <IconButton variant="outline" size="xs"
          type="button"
          class="btn icon"
          aria-label="Swap orientation"
          title="Swap orientation"
          onClick={() =>
            updateTemplate((t) => {
              const width = t.card.width;
              t.card.width = t.card.height;
              t.card.height = width;
            })
          }
        >
          <ArrowLeftRight size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <Field label="Corner radius">
        <NumberField value={template.card.borderRadius} min={0} max={30} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.borderRadius = v), false)} />
      </Field>
      <Show when={template.sidedness !== 'single'}>
        <p class="muted small side-note">Size and corners are shared by both sides.</p>
      </Show>

      <div class="card-background-controls" data-side={activeSide()}>
        <Field label="Background Colour">
          <ColorField value={activeDesign().bg} onCommit={commit} onInput={(v) => updateSide(activeSide(), (d) => (d.bg = v), false)} />
        </Field>
        <span class="card-background-separator" aria-hidden="true" />
        <Field label="Background Image" block>
          <div class="row gap wrap">
            <Button variant="outline" size="xs" class="btn small" onClick={() => bgInput.click()}>
              {activeDesign().bgImage ? 'Replace…' : 'Upload…'}
            </Button>
            <Show when={activeDesign().bgImage}>
              <Button variant="outline" size="xs" class="btn small" onClick={() => updateSide(activeSide(), (d) => (d.bgImage = null))}>
                Remove
              </Button>
            </Show>
          </div>
          <input
            ref={bgInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const input = e.currentTarget; // null after the first await
              const f = input.files?.[0];
              input.value = '';
              if (!f) return;
              // Remember which side this upload is for: the user may switch sides before it finishes.
              const side = activeSide();
              const stillWanted = beginAsyncEdit(side, 'bgImage');
              const dataUrl = await readImageFile(f, 2400);
              if (!stillWanted()) return;
              const ref = internImage(dataUrl);
              updateSide(side, (d) => (d.bgImage = ref));
            }}
          />
        </Field>
      </div>
      <Show when={template.sidedness !== 'single'}>
        <p class="muted small side-note" data-testid="background-scope">
          Background of the {editingLabel(template, activeSide())} design.
        </p>
      </Show>
    </Section>
  );
}
