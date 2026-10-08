import { For, Show, createMemo, createSignal } from 'solid-js';
import { unwrap } from 'solid-js/store';
import type { ColorRule, ImageElement, ImageRule, RectElement, TemplateElement, TextElement } from '../lib/types';
import {
  CARD_PRESETS,
  FONT_FAMILIES,
  assetBytes,
  buildColorRule,
  buildImageRule,
  defaultTemplate,
  distinctValues,
  imageUrl,
  matchFilesToValues,
  pruneAssets,
} from '../lib/template';
import { formatBytes, readImageFile } from '../lib/images';
import {
  commit,
  headers,
  internImage,
  missingColumns,
  replaceTemplate,
  rows,
  selectedElement,
  setSelectedId,
  template,
  updateElement,
  updateTemplate,
} from '../lib/store';
import { ColorField, Field, NumberField, SegButtons, Section, Select, TextField, Toggle } from './ui';

export default function Inspector() {
  return (
    <Show when={selectedElement()} fallback={<CardInspector />}>
      {(el) => <ElementInspector el={el()} />}
    </Show>
  );
}

// ---------------------------------------------------------------------------
// Card / template settings (shown when nothing is selected)
// ---------------------------------------------------------------------------
function CardInspector() {
  let bgInput!: HTMLInputElement;
  let importInput!: HTMLInputElement;
  const [confirmReset, setConfirmReset] = createSignal(false);

  const presetValue = createMemo(() => {
    const p = CARD_PRESETS.find((p) => p.width === template.card.width && p.height === template.card.height);
    return p ? p.label : 'custom';
  });

  function exportTemplate() {
    const copy = structuredClone(unwrap(template));
    pruneAssets(copy);
    const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${template.name.replace(/[^\w-]+/g, '_') || 'template'}.lanyard.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importTemplate(file: File) {
    try {
      const text = await file.text();
      const t = JSON.parse(text);
      replaceTemplate(t);
      setSelectedId(null);
    } catch (e) {
      alert(`Could not import template: ${(e as Error).message}`);
    }
  }

  return (
    <>
      <Section title="Template">
        <Field label="Name">
          <TextField value={template.name} onCommit={commit} onInput={(v) => updateTemplate((t) => (t.name = v), false)} />
        </Field>
        <div class="row gap wrap">
          <button class="btn small" onClick={exportTemplate}>
            Export JSON
          </button>
          <button class="btn small" onClick={() => importInput.click()}>
            Import JSON
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void importTemplate(f);
              e.currentTarget.value = '';
            }}
          />
          <Show
            when={confirmReset()}
            fallback={
              <button class="btn small" onClick={() => setConfirmReset(true)}>
                Reset to default
              </button>
            }
          >
            <button
              class="btn small danger"
              onClick={() => {
                replaceTemplate(defaultTemplate(headers()));
                setConfirmReset(false);
                setSelectedId(null);
              }}
            >
              Really reset?
            </button>
            <button class="btn small" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </Show>
        </div>
        <p class="muted small">The template is saved in this browser automatically. Export it to keep a copy or share it.</p>
        <p class="muted small" data-testid="asset-summary">
          Pictures stored: {Object.keys(template.assets).length} ({formatBytes(assetBytes(template.assets))}). The same picture used in several
          places is stored once.
        </p>
        <Show when={missingColumns().length > 0}>
          <div class="notice warn small">
            These fields are not in your CSV: {missingColumns().map((c) => `{{${c}}}`).join(', ')}. Select the element and pick a column from
            "Insert field".
          </div>
        </Show>
      </Section>

      <Section title="Card size">
        <Field label="Preset">
          <Select
            value={presetValue()}
            options={[{ value: 'custom', label: 'Custom' }, ...CARD_PRESETS.map((p) => ({ value: p.label, label: p.label }))]}
            onChange={(v) => {
              const p = CARD_PRESETS.find((p) => p.label === v);
              if (p)
                updateTemplate((t) => {
                  t.card.width = p.width;
                  t.card.height = p.height;
                });
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
              const w = t.card.width;
              t.card.width = t.card.height;
              t.card.height = w;
            })
          }
        >
          Swap orientation
        </button>
      </Section>

      <Section title="Card background">
        <div class="grid2">
          <Field label="Colour">
            <ColorField value={template.card.bg} onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.bg = v), false)} />
          </Field>
          <Field label="Corner radius">
            <NumberField value={template.card.borderRadius} min={0} max={30} unit="mm" onCommit={commit} onInput={(v) => updateTemplate((t) => (t.card.borderRadius = v), false)} />
          </Field>
        </div>
        <Field label="Background image" block hint="Printed behind everything, scaled to cover the card.">
          <div class="row gap">
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
      </Section>

      <Section title="Tips">
        <ul class="tips small muted">
          <li>Click an element on the card to edit it. Click empty space to come back here.</li>
          <li>
            Text boxes shrink their font automatically down to a minimum size. Check the <strong>Longest</strong> preview to make sure nothing is
            clipped, and the <strong>Shortest</strong> one to see that short names still look balanced.
          </li>
          <li>Use "Colour by field" on a shape to colour-code badges by cabin or group.</li>
          <li>
            Add an <strong>Image</strong> and set its picture source to "Different picture per value of a field" to show, say, a bear for the Bears
            and a lion for the Lions. Name your files after the values and upload them all at once.
          </li>
        </ul>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Element settings
// ---------------------------------------------------------------------------
function ElementInspector(props: { el: TemplateElement }) {
  const id = () => props.el.id;
  const set = <T extends TemplateElement>(fn: (el: T) => void, record = false) => updateElement<T>(id(), fn, record);

  return (
    <>
      <Section title={props.el.kind === 'text' ? 'Text box' : props.el.kind === 'rect' ? 'Shape' : 'Image'}>
        <Field label="Layer name">
          <TextField value={props.el.name} onCommit={commit} onInput={(v) => set((el) => (el.name = v))} />
        </Field>
        <div class="grid2">
          <Field label="X">
            <NumberField value={props.el.x} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.x = v))} />
          </Field>
          <Field label="Y">
            <NumberField value={props.el.y} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.y = v))} />
          </Field>
          <Field label="W">
            <NumberField value={props.el.w} min={1} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.w = v))} />
          </Field>
          <Field label="H">
            <NumberField value={props.el.h} min={1} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.h = v))} />
          </Field>
        </div>
        <div class="grid2">
          <Field label="Rotation">
            <NumberField value={props.el.rotation} min={-180} max={180} step={1} unit="°" onCommit={commit} onInput={(v) => set((el) => (el.rotation = v))} />
          </Field>
          <Field label="Opacity">
            <NumberField value={props.el.opacity * 100} min={0} max={100} step={5} unit="%" onCommit={commit} onInput={(v) => set((el) => (el.opacity = v / 100))} />
          </Field>
        </div>
        <div class="row gap wrap">
          <button class="btn small" onClick={() => set((el) => (el.x = (template.card.width - el.w) / 2), true)}>
            Centre horizontally
          </button>
          <button class="btn small" onClick={() => set((el) => (el.y = (template.card.height - el.h) / 2), true)}>
            Centre vertically
          </button>
          <button
            class="btn small"
            onClick={() =>
              set((el) => {
                el.x = 0;
                el.w = template.card.width;
              }, true)
            }
          >
            Full width
          </button>
        </div>
      </Section>

      <Show when={props.el.kind === 'text'}>
        <TextInspector el={props.el as TextElement} />
      </Show>
      <Show when={props.el.kind === 'rect'}>
        <RectInspector el={props.el as RectElement} />
      </Show>
      <Show when={props.el.kind === 'image'}>
        <ImageInspector el={props.el as ImageElement} />
      </Show>
    </>
  );
}

function TextInspector(props: { el: TextElement }) {
  const set = (fn: (el: TextElement) => void, record = false) => updateElement<TextElement>(props.el.id, fn, record);
  let textarea!: HTMLTextAreaElement;

  function insertField(col: string) {
    if (!col) return;
    commit();
    const ins = `{{${col}}}`;
    const start = textarea.selectionStart ?? props.el.content.length;
    const end = textarea.selectionEnd ?? start;
    const next = props.el.content.slice(0, start) + ins + props.el.content.slice(end);
    set((el) => (el.content = next));
    queueMicrotask(() => {
      textarea.focus();
      textarea.setSelectionRange(start + ins.length, start + ins.length);
    });
  }

  return (
    <>
      <Section title="Content">
        <textarea
          id="content-editor"
          ref={textarea}
          class="input content"
          rows={3}
          value={props.el.content}
          onFocus={commit}
          onInput={(e) => set((el) => (el.content = e.currentTarget.value))}
          placeholder="Type text and insert {{fields}}"
        />
        <div class="row gap">
          <select
            class="input compact"
            onChange={(e) => {
              insertField(e.currentTarget.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="">Insert field…</option>
            <For each={headers()}>{(h) => <option value={h}>{h}</option>}</For>
          </select>
        </div>
        <p class="muted small">
          Mix fixed text with fields, e.g. <code>Cabin {'{{Accommodation}}'}</code>. Line breaks are kept.
        </p>
      </Section>

      <Section title="Font">
        <Field label="Family">
          <Select value={props.el.fontFamily} options={FONT_FAMILIES} onChange={(v) => set((el) => (el.fontFamily = v), true)} />
        </Field>
        <div class="grid2">
          <Field label="Size">
            <NumberField value={props.el.fontSize} min={4} max={200} step={1} unit="pt" onCommit={commit} onInput={(v) => set((el) => (el.fontSize = v))} />
          </Field>
          <Field label="Min size" hint={props.el.shrinkToFit ? 'Shrinks down to this to fit' : 'Only used when shrinking'}>
            <NumberField
              value={props.el.minFontSize}
              min={3}
              max={props.el.fontSize}
              step={1}
              unit="pt"
              disabled={!props.el.shrinkToFit}
              onCommit={commit}
              onInput={(v) => set((el) => (el.minFontSize = v))}
            />
          </Field>
        </div>
        <div class="row gap wrap">
          <Toggle checked={props.el.shrinkToFit} label="Shrink to fit" onChange={(v) => set((el) => (el.shrinkToFit = v), true)} />
          <Toggle checked={props.el.wrap} label="Wrap lines" onChange={(v) => set((el) => (el.wrap = v), true)} />
        </div>
        <div class="row gap wrap">
          <button class="btn small" classList={{ active: props.el.bold }} style={{ 'font-weight': '700' }} onClick={() => set((el) => (el.bold = !el.bold), true)}>
            B
          </button>
          <button class="btn small" classList={{ active: props.el.italic }} style={{ 'font-style': 'italic' }} onClick={() => set((el) => (el.italic = !el.italic), true)}>
            I
          </button>
          <button class="btn small" classList={{ active: props.el.uppercase }} onClick={() => set((el) => (el.uppercase = !el.uppercase), true)}>
            AA
          </button>
        </div>
        <div class="grid2">
          <Field label="Align">
            <SegButtons
              value={props.el.align}
              options={[
                { value: 'left', label: '⇤', title: 'Left' },
                { value: 'center', label: '↔', title: 'Centre' },
                { value: 'right', label: '⇥', title: 'Right' },
              ]}
              onChange={(v) => set((el) => (el.align = v), true)}
            />
          </Field>
          <Field label="Vertical">
            <SegButtons
              value={props.el.vAlign}
              options={[
                { value: 'top', label: '⤒', title: 'Top' },
                { value: 'middle', label: '↕', title: 'Middle' },
                { value: 'bottom', label: '⤓', title: 'Bottom' },
              ]}
              onChange={(v) => set((el) => (el.vAlign = v), true)}
            />
          </Field>
        </div>
        <div class="grid2">
          <Field label="Line height">
            <NumberField value={props.el.lineHeight} min={0.6} max={3} step={0.05} unit="×" onCommit={commit} onInput={(v) => set((el) => (el.lineHeight = v))} />
          </Field>
          <Field label="Letter spacing">
            <NumberField value={props.el.letterSpacing} min={-0.1} max={1} step={0.01} unit="em" onCommit={commit} onInput={(v) => set((el) => (el.letterSpacing = v))} />
          </Field>
        </div>
      </Section>

      <Section title="Colours & box">
        <div class="grid2">
          <Field label="Text colour">
            <ColorField value={props.el.color} onCommit={commit} onInput={(v) => set((el) => (el.color = v))} />
          </Field>
          <Field label="Fill">
            <ColorField value={props.el.bg} allowTransparent onCommit={commit} onInput={(v) => set((el) => (el.bg = v))} />
          </Field>
        </div>
        <ColorRuleEditor rule={props.el.colorRule} onChange={(r) => set((el) => (el.colorRule = r), true)} />
        <div class="grid3">
          <Field label="Padding">
            <NumberField value={props.el.padding} min={0} max={20} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.padding = v))} />
          </Field>
          <Field label="Radius">
            <NumberField value={props.el.borderRadius} min={0} max={50} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.borderRadius = v))} />
          </Field>
          <Field label="Border">
            <NumberField value={props.el.borderWidth} min={0} max={5} step={0.25} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.borderWidth = v))} />
          </Field>
        </div>
        <Show when={props.el.borderWidth > 0}>
          <Field label="Border colour">
            <ColorField value={props.el.borderColor} onCommit={commit} onInput={(v) => set((el) => (el.borderColor = v))} />
          </Field>
        </Show>
      </Section>
    </>
  );
}

function RectInspector(props: { el: RectElement }) {
  const set = (fn: (el: RectElement) => void, record = false) => updateElement<RectElement>(props.el.id, fn, record);
  return (
    <Section title="Appearance">
      <Field label="Fill">
        <ColorField value={props.el.bg} allowTransparent onCommit={commit} onInput={(v) => set((el) => (el.bg = v))} />
      </Field>
      <ColorRuleEditor rule={props.el.colorRule} onChange={(r) => set((el) => (el.colorRule = r), true)} />
      <div class="grid2">
        <Field label="Corner radius">
          <NumberField value={props.el.borderRadius} min={0} max={100} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.borderRadius = v))} />
        </Field>
        <Field label="Border">
          <NumberField value={props.el.borderWidth} min={0} max={10} step={0.25} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.borderWidth = v))} />
        </Field>
      </div>
      <Show when={props.el.borderWidth > 0}>
        <Field label="Border colour">
          <ColorField value={props.el.borderColor} onCommit={commit} onInput={(v) => set((el) => (el.borderColor = v))} />
        </Field>
      </Show>
    </Section>
  );
}

type ImageSourceMode = 'fixed' | 'rule' | 'column';

function imageSourceMode(el: ImageElement): ImageSourceMode {
  if (el.imageRule) return 'rule';
  if (el.srcColumn) return 'column';
  return 'fixed';
}

function ImageInspector(props: { el: ImageElement }) {
  const set = (fn: (el: ImageElement) => void, record = false) => updateElement<ImageElement>(props.el.id, fn, record);
  let input!: HTMLInputElement;
  const mode = () => imageSourceMode(props.el);

  function setMode(m: ImageSourceMode) {
    set((el) => {
      if (m === 'rule') {
        el.srcColumn = null;
        if (!el.imageRule) {
          // Guess a sensible column: the first one with few distinct values, else the first header.
          const col =
            headers().find((h) => {
              const n = distinctValues(rows(), h).length;
              return n >= 2 && n <= 12;
            }) ?? headers()[0];
          el.imageRule = col ? buildImageRule(rows(), col) : null;
        }
      } else if (m === 'column') {
        el.imageRule = null;
        el.srcColumn = el.srcColumn ?? headers()[0] ?? null;
      } else {
        el.imageRule = null;
        el.srcColumn = null;
      }
    }, true);
  }

  const modeOptions = (): { value: ImageSourceMode; label: string }[] => [
    { value: 'fixed', label: 'Same picture on every card' },
    ...(headers().length > 0
      ? [
          { value: 'rule' as const, label: 'Different picture per value of a field' },
          { value: 'column' as const, label: 'Image URL stored in a field' },
        ]
      : []),
  ];

  return (
    <Section title="Image">
      <Field label="Picture source">
        <Select value={mode()} options={modeOptions()} onChange={setMode} />
      </Field>

      <Show when={mode() === 'fixed'}>
        <Field label="Picture" block hint="PNG/JPG/SVG. Stored inside the template (large photos are scaled down).">
          <div class="row gap">
            <Show when={props.el.src}>
              <img class="thumb" src={imageUrl(template.assets, props.el.src)} alt="" />
            </Show>
            <button class="btn small" onClick={() => input.click()}>
              {props.el.src ? 'Replace…' : 'Upload…'}
            </button>
            <Show when={props.el.src}>
              <button class="btn small" onClick={() => set((el) => (el.src = ''), true)}>
                Remove
              </button>
            </Show>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            data-testid="image-upload"
            onChange={async (e) => {
              const input = e.currentTarget; // null after the first await
              const f = input.files?.[0];
              if (f) {
                const ref = internImage(await readImageFile(f));
                set((el) => (el.src = ref), true);
              }
              input.value = '';
            }}
          />
        </Field>
      </Show>

      <Show when={mode() === 'rule' && props.el.imageRule}>
        {(rule) => <ImageRuleEditor rule={rule()} onChange={(r) => set((el) => (el.imageRule = r), true)} />}
      </Show>

      <Show when={mode() === 'column'}>
        <Field label="Field with the image URL" hint="A column containing a web address or data URL per person (e.g. a photo).">
          <Select
            value={props.el.srcColumn ?? ''}
            options={headers().map((h) => ({ value: h, label: h }))}
            onChange={(v) => set((el) => (el.srcColumn = v || null), true)}
          />
        </Field>
      </Show>

      <div class="grid2">
        <Field label="Fit">
          <Select
            value={props.el.fit}
            options={[
              { value: 'contain', label: 'Contain (whole image)' },
              { value: 'cover', label: 'Cover (fill box, crop)' },
              { value: 'fill', label: 'Stretch' },
            ]}
            onChange={(v) => set((el) => (el.fit = v), true)}
          />
        </Field>
        <Field label="Corner radius">
          <NumberField value={props.el.borderRadius} min={0} max={100} unit="mm" onCommit={commit} onInput={(v) => set((el) => (el.borderRadius = v))} />
        </Field>
      </div>
    </Section>
  );
}

/**
 * "Picture by field": pick a CSV column, then give each distinct value its own
 * image – one at a time, or all at once by uploading files named after the values.
 */
function ImageRuleEditor(props: { rule: ImageRule; onChange: (r: ImageRule) => void }) {
  const values = createMemo(() => distinctValues(rows(), props.rule.column));
  const assigned = createMemo(() => values().filter((v) => !!props.rule.map[v]).length);
  const [report, setReport] = createSignal<string | null>(null);
  let bulkInput!: HTMLInputElement;
  let fallbackInput!: HTMLInputElement;
  // One hidden file input per value would be wasteful; share one and remember the target.
  let singleInput!: HTMLInputElement;
  let singleTarget = '';

  async function assign(value: string, file: File) {
    const ref = internImage(await readImageFile(file));
    props.onChange({ ...props.rule, map: { ...props.rule.map, [value]: ref } });
  }

  async function bulkUpload(files: File[]) {
    const matches = matchFilesToValues(
      files.map((f) => f.name),
      values(),
    );
    const map = { ...props.rule.map };
    const unmatched: string[] = [];
    await Promise.all(
      matches.map(async (m, i) => {
        if (m.value === null) {
          unmatched.push(m.fileName);
          return;
        }
        map[m.value] = internImage(await readImageFile(files[i]));
      }),
    );
    props.onChange({ ...props.rule, map });
    const matched = matches.length - unmatched.length;
    const stillMissing = values().filter((v) => !map[v]);
    const parts = [`${matched} of ${files.length} ${files.length === 1 ? 'file' : 'files'} matched`];
    if (unmatched.length) parts.push(`no value named like: ${unmatched.join(', ')}`);
    if (stillMissing.length) parts.push(`still without a picture: ${stillMissing.map((v) => v || '(empty)').join(', ')}`);
    setReport(parts.join(' · '));
  }

  return (
    <>
      <Field label="Field" hint="Each distinct value of this field can get its own picture.">
        <Select
          value={props.rule.column}
          options={headers().map((h) => ({ value: h, label: h }))}
          onChange={(col) => {
            setReport(null);
            props.onChange(buildImageRule(rows(), col, props.rule));
          }}
        />
      </Field>

      <Field
        label={`Pictures (${assigned()} of ${values().length} values)`}
        block
        hint="Upload several at once: files are matched to values by name, e.g. bears.png → “Bears”."
      >
        <div class="row gap wrap">
          <button class="btn small primary" data-testid="bulk-upload-button" onClick={() => bulkInput.click()}>
            Upload for all values…
          </button>
          <Show when={assigned() > 0}>
            <button class="btn small" onClick={() => props.onChange({ ...props.rule, map: {} })}>
              Clear all
            </button>
          </Show>
        </div>
        <input
          ref={bulkInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="bulk-upload"
          onChange={async (e) => {
              const input = e.currentTarget; // null after the first await
            const files = [...(input.files ?? [])];
            if (files.length) await bulkUpload(files);
            input.value = '';
          }}
        />
        <Show when={report()}>
          <p class="small muted" data-testid="bulk-report">
            {report()}
          </p>
        </Show>
      </Field>

      <input
        ref={singleInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="value-upload"
        onChange={async (e) => {
              const input = e.currentTarget; // null after the first await
          const f = input.files?.[0];
          if (f) await assign(singleTarget, f);
          input.value = '';
        }}
      />

      <div class="image-rule" data-testid="image-rule">
        <For each={values()}>
          {(v) => (
            <div class="image-rule-row" data-testid="image-rule-row" data-value={v}>
              <Show when={props.rule.map[v]} fallback={<span class="thumb empty" title="No picture yet" />}>
                <img class="thumb" src={imageUrl(template.assets, props.rule.map[v])} alt="" />
              </Show>
              <span class="val" title={v}>
                {v || <em class="muted">(empty)</em>}
              </span>
              <span class="row gap-s">
                <button
                  class="btn tiny"
                  onClick={() => {
                    singleTarget = v;
                    singleInput.click();
                  }}
                >
                  {props.rule.map[v] ? 'Replace' : 'Upload'}
                </button>
                <Show when={props.rule.map[v]}>
                  <button
                    class="btn tiny"
                    title="Remove this picture"
                    onClick={() => {
                      const map = { ...props.rule.map };
                      delete map[v];
                      props.onChange({ ...props.rule, map });
                    }}
                  >
                    ✕
                  </button>
                </Show>
              </span>
            </div>
          )}
        </For>
        <div class="image-rule-row fallback" data-testid="image-rule-fallback">
          <Show when={props.rule.fallback} fallback={<span class="thumb empty" title="Nothing is shown for other values" />}>
            <img class="thumb" src={imageUrl(template.assets, props.rule.fallback)} alt="" />
          </Show>
          <span class="val muted">Anything else</span>
          <span class="row gap-s">
            <button class="btn tiny" onClick={() => fallbackInput.click()}>
              {props.rule.fallback ? 'Replace' : 'Upload'}
            </button>
            <Show when={props.rule.fallback}>
              <button class="btn tiny" title="Remove the fallback picture" onClick={() => props.onChange({ ...props.rule, fallback: '' })}>
                ✕
              </button>
            </Show>
          </span>
          <input
            ref={fallbackInput}
            type="file"
            accept="image/*"
            hidden
            data-testid="fallback-upload"
            onChange={async (e) => {
              const input = e.currentTarget; // null after the first await
              const f = input.files?.[0];
              if (f) props.onChange({ ...props.rule, fallback: internImage(await readImageFile(f)) });
              input.value = '';
            }}
          />
        </div>
      </div>
    </>
  );
}

/** "Colour by field": pick a CSV column and assign a fill colour to each distinct value. */
function ColorRuleEditor(props: { rule: ColorRule | null; onChange: (r: ColorRule | null) => void }) {
  const values = createMemo(() => (props.rule ? distinctValues(rows(), props.rule.column) : []));
  const options = createMemo(() => [{ value: '', label: '— fixed colour —' }, ...headers().map((h) => ({ value: h, label: h }))]);

  return (
    <Show when={headers().length > 0}>
      <Field label="Colour by field" hint={props.rule ? 'Each value gets its own fill; the fixed colour above is ignored.' : undefined}>
        <Select
          value={props.rule?.column ?? ''}
          options={options()}
          onChange={(col) => props.onChange(col ? buildColorRule(rows(), col, props.rule) : null)}
        />
      </Field>
      <Show when={props.rule}>
        {(rule) => (
          <div class="color-rule">
            <For each={values()}>
              {(v) => (
                <label class="color-rule-row">
                  <input
                    type="color"
                    class="color"
                    value={rule().map[v] ?? rule().fallback}
                    onInput={(e) => {
                      const next = { ...rule(), map: { ...rule().map, [v]: e.currentTarget.value } };
                      props.onChange(next);
                    }}
                  />
                  <span class="val">{v || <em class="muted">(empty)</em>}</span>
                </label>
              )}
            </For>
            <label class="color-rule-row">
              <input type="color" class="color" value={rule().fallback} onInput={(e) => props.onChange({ ...rule(), fallback: e.currentTarget.value })} />
              <span class="val muted">Anything else</span>
            </label>
            <button class="btn tiny" onClick={() => props.onChange(buildColorRule(rows(), rule().column))}>
              Re-assign palette
            </button>
          </div>
        )}
      </Show>
    </Show>
  );
}
