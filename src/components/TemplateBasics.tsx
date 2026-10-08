import { createMemo } from 'solid-js';
import { CARD_PRESETS } from '../lib/template';
import { commit, template, updateTemplate } from '../lib/store';
import { Field, NumberField, Section, Select, TextField } from './ui';

export default function TemplateBasics() {
  const presetValue = createMemo(() => {
    const preset = CARD_PRESETS.find((p) => p.width === template.card.width && p.height === template.card.height);
    return preset ? preset.label : 'custom';
  });

  return (
    <>
      <Section title="Template">
        <Field label="Name">
          <TextField value={template.name} onCommit={commit} onInput={(v) => updateTemplate((t) => (t.name = v), false)} />
        </Field>
      </Section>

      <Section title="Card size">
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
        <div class="grid2">
          <Field label="Width">
            <NumberField value={template.card.width} min={20} max={400} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.width = v), false)} />
          </Field>
          <Field label="Height">
            <NumberField value={template.card.height} min={20} max={400} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.height = v), false)} />
          </Field>
        </div>
        <button
          class="btn small"
          onClick={() =>
            updateTemplate((t) => {
              const width = t.card.width;
              t.card.width = t.card.height;
              t.card.height = width;
            })
          }
        >
          Swap orientation
        </button>
      </Section>
    </>
  );
}
