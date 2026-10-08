import { Show, createMemo } from 'solid-js';
import { CARD_PRESETS } from '../lib/template';
import { commit, internImage, template, updateTemplate } from '../lib/store';
import { readImageFile } from '../lib/images';
import { IconSwap } from './icons';
import { ColorField, Field, NumberField, Section, Select, TextField } from './ui';

export default function TemplateBasics() {
  let bgInput!: HTMLInputElement;
  const presetValue = createMemo(() => {
    const preset = CARD_PRESETS.find((p) => p.width === template.card.width && p.height === template.card.height);
    return preset ? preset.label : 'custom';
  });

  return (
    <Section title="Card settings">
      <Field label="Name">
        <TextField value={template.name} onCommit={commit} onInput={(v) => updateTemplate((t) => (t.name = v), false)} />
      </Field>

      <h4 class="card-settings-subhead">Card size</h4>
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
        <button
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
          <IconSwap size={18} />
        </button>
      </div>
      <Field label="Corner radius">
        <NumberField value={template.card.borderRadius} min={0} max={30} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.borderRadius = v), false)} />
      </Field>

      <h4 class="card-settings-subhead">Card background</h4>
      <div class="card-background-controls">
        <Field label="Colour">
          <ColorField value={template.card.bg} onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.bg = v), false)} />
        </Field>
        <span class="card-background-separator">or</span>
        <Field label="Background image" block hint="Printed behind everything, scaled to cover the card.">
          <div class="row gap wrap">
            <button class="btn small" onClick={() => bgInput.click()}>
              {template.card.bgImage ? 'Replace…' : 'Upload…'}
            </button>
            <Show when={template.card.bgImage}>
              <button class="btn small" onClick={() => updateTemplate((t) => (t.card.bgImage = null))}>
                Remove
              </button>
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
              if (f) {
                const ref = internImage(await readImageFile(f, 2400));
                updateTemplate((t) => (t.card.bgImage = ref));
              }
              input.value = '';
            }}
          />
        </Field>
      </div>
    </Section>
  );
}
