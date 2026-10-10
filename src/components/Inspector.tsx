import { For, Show, createMemo, createSignal } from 'solid-js';
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Bold, CaseUpper, Italic, X } from 'lucide-solid';
import { unwrap } from 'solid-js/store';
import type { ColorRule, ImageElement, ImageRule, RectElement, SideId, TemplateElement, TextElement } from '../lib/types';
import {
  FONT_FAMILIES,
  buildColorRule,
  buildImageRule,
  defaultTemplate,
  distinctValues,
  imageUrl,
  matchFilesToValues,
  pruneAssets,
} from '../lib/template';
import { dataUrlBytes, formatBytes, readImageFile } from '../lib/images';
import {
  activeSide,
  beginAsyncEdit,
  commit,
  findElement,
  headers,
  internImage,
  missingColumns,
  replaceTemplate,
  rows,
  selectedElement,
  template,
  updateElement,
} from '../lib/store';
import { ColorField, Field, NumberField, SegButtons, Section, Select, TextField, Toggle, Button, Notice, Textarea, Input } from './ui';

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
  let importInput!: HTMLInputElement;
  const [confirmReset, setConfirmReset] = createSignal(false);
  const storedPictures = createMemo(() => Object.entries(template.assets).sort(([a], [b]) => a.localeCompare(b)));

  function exportTemplate() {
    const copy = structuredClone(unwrap(template));
    pruneAssets(copy);
    const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'template.lanyard.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importTemplate(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch (e) {
      alert(`Could not import template: ${(e as Error).message}`);
      return;
    }
    // An unreadable file leaves the current design, selection and undo history untouched.
    const result = replaceTemplate(parsed);
    if (!result.ok) alert(`Could not import template: ${result.error}`);
  }

  return (
    <>
      <Section title="Template Files" collapsible>
        <div class="row gap wrap">
          <Button variant="outline" size="xs" class="btn small" onClick={exportTemplate}>
            Export JSON
          </Button>
          <Button variant="outline" size="xs" class="btn small" onClick={() => importInput.click()}>
            Import JSON
          </Button>
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
              <Button variant="outline" size="xs" class="btn small" onClick={() => setConfirmReset(true)}>
                Reset to default
              </Button>
            }
          >
            <Button variant="outline" size="xs" colorPalette="red"
              class="btn small danger"
              onClick={() => {
                replaceTemplate(defaultTemplate(headers()));
                setConfirmReset(false);
              }}
            >
              Really reset?
            </Button>
            <Button variant="outline" size="xs" class="btn small" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </Show>
        </div>
        <p class="muted small">The template is saved in this browser automatically. Export it to keep a copy or share it.</p>
        <Show when={missingColumns().length > 0}>
          <Notice warning class="notice warn small">
            These fields are not in your CSV: {missingColumns().map((c) => `{{${c}}}`).join(', ')}. Select the element and pick a column from
            "Insert field".
          </Notice>
        </Show>
      </Section>

      <Section title="Pictures Stored" data-testid="asset-summary" collapsible>
        <Show when={storedPictures().length > 0} fallback={<p class="muted small">No pictures stored.</p>}>
          <ul class="stored-pictures">
            <For each={storedPictures()}>
              {([, url], index) => (
                <li class="stored-picture" data-testid="stored-picture">
                  <img class="thumb" src={url} alt={`Stored picture ${index() + 1}`} loading="lazy" />
                  <span class="stored-picture-name">Picture {index() + 1}</span>
                  <span class="stored-picture-size">{formatBytes(dataUrlBytes(url))}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Section>

      <Section title="Tips" collapsible>
        <ul class="tips small muted">
          <li>Click an element on the card to edit it. Click empty space to come back here.</li>
          <li>
            Text boxes shrink their font automatically down to a minimum size. Check the <strong>Longest</strong> preview to make sure nothing is
            clipped, and the <strong>Shortest</strong> one to see that short names still look balanced.
          </li>
          <li>Use "Colour by field" on a shape to colour-code badges by cabin or group.</li>
          <li>
            For double-sided badges choose <strong>Sides</strong> in Card Settings: the same design on both sides, or a different back that starts
            as a copy of the front.
          </li>
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
  // The inspector always shows a layer of the side being edited.
  const set = <T extends TemplateElement>(fn: (el: T) => void, record = false) => updateElement<T>(activeSide(), id(), fn, record);

  return (
    <>
      <Section title={props.el.kind === 'text' ? 'Text Box' : props.el.kind === 'rect' ? 'Shape' : 'Image'} collapsible>
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
          <Button variant="outline" size="xs" class="btn small" onClick={() => set((el) => (el.x = (template.card.width - el.w) / 2), true)}>
            Centre horizontally
          </Button>
          <Button variant="outline" size="xs" class="btn small" onClick={() => set((el) => (el.y = (template.card.height - el.h) / 2), true)}>
            Centre vertically
          </Button>
          <Button variant="outline" size="xs"
            class="btn small"
            onClick={() =>
              set((el) => {
                el.x = 0;
                el.w = template.card.width;
              }, true)
            }
          >
            Full width
          </Button>
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
  const set = (fn: (el: TextElement) => void, record = false) => updateElement<TextElement>(activeSide(), props.el.id, fn, record);
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
      <Section title="Content" collapsible>
        <Textarea
          id="content-editor"
          ref={textarea}
          class="input content"
          rows={3}
          value={props.el.content}
          onFocus={() => commit()}
          onInput={(e) => set((el) => (el.content = e.currentTarget.value))}
          placeholder="Type text and insert {{fields}}"
        />
        <div class="row gap">
          <Select
            label="Insert field"
            value=""
            placeholder="Insert field…"
            options={headers().map((h) => ({ value: h, label: h }))}
            onChange={insertField}
            onSelectionComplete={() => textarea.focus()}
          />
        </div>
        <p class="muted small">
          Mix fixed text with fields, e.g. <code>Cabin {'{{Accommodation}}'}</code>. Line breaks are kept.
        </p>
      </Section>

      <Section title="Font" collapsible>
        <Field label="Family">
          <Select value={props.el.fontFamily} options={FONT_FAMILIES} onChange={(v) => set((el) => (el.fontFamily = v), true)} />
        </Field>
        <div class="row gap wrap font-style-controls">
          <Button variant="outline" size="xs" class="btn small" aria-label="Bold" title="Bold" aria-pressed={props.el.bold} data-state={props.el.bold ? 'on' : 'off'} onClick={() => set((el) => (el.bold = !el.bold), true)}>
            <Bold size={16} aria-hidden="true" />
          </Button>
          <Button variant="outline" size="xs" class="btn small" aria-label="Italic" title="Italic" aria-pressed={props.el.italic} data-state={props.el.italic ? 'on' : 'off'} onClick={() => set((el) => (el.italic = !el.italic), true)}>
            <Italic size={16} aria-hidden="true" />
          </Button>
          <Button variant="outline" size="xs" class="btn small" aria-label="Uppercase" title="Uppercase" aria-pressed={props.el.uppercase} data-state={props.el.uppercase ? 'on' : 'off'} onClick={() => set((el) => (el.uppercase = !el.uppercase), true)}>
            <CaseUpper size={16} aria-hidden="true" />
          </Button>
        </div>
        <div class="grid2 font-size-controls">
          <Field label="Size">
            <NumberField value={props.el.fontSize} min={4} max={200} step={1} unit="pt" onCommit={commit} onInput={(v) => set((el) => (el.fontSize = v))} />
          </Field>
          <Field label="Min Shrinked Size">
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
        <div class="row gap wrap font-fit-options">
          <Toggle checked={props.el.shrinkToFit} label="Shrink to fit" onChange={(v) => set((el) => (el.shrinkToFit = v), true)} />
          <Toggle checked={props.el.wrap} label="Wrap lines" onChange={(v) => set((el) => (el.wrap = v), true)} />
        </div>
        <div class="grid2">
          <Field label="Align">
            <SegButtons
              value={props.el.align}
              options={[
                { value: 'left', label: 'Left', icon: <AlignLeft size={16} aria-hidden="true" />, title: 'Left' },
                { value: 'center', label: 'Centre', icon: <AlignCenter size={16} aria-hidden="true" />, title: 'Centre' },
                { value: 'right', label: 'Right', icon: <AlignRight size={16} aria-hidden="true" />, title: 'Right' },
              ]}
              onChange={(v) => set((el) => (el.align = v), true)}
            />
          </Field>
          <Field label="Vertical">
            <SegButtons
              value={props.el.vAlign}
              options={[
                { value: 'top', label: 'Top', icon: <AlignVerticalJustifyStart size={16} aria-hidden="true" />, title: 'Top' },
                { value: 'middle', label: 'Middle', icon: <AlignVerticalJustifyCenter size={16} aria-hidden="true" />, title: 'Middle' },
                { value: 'bottom', label: 'Bottom', icon: <AlignVerticalJustifyEnd size={16} aria-hidden="true" />, title: 'Bottom' },
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

      <Section title="Colours & Box" collapsible>
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
  const set = (fn: (el: RectElement) => void, record = false) => updateElement<RectElement>(activeSide(), props.el.id, fn, record);
  return (
    <Section title="Appearance" collapsible>
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
  const set = (fn: (el: ImageElement) => void, record = false) => updateElement<ImageElement>(activeSide(), props.el.id, fn, record);
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
    <Section title="Image" collapsible>
      <Field label="Picture source">
        <Select value={mode()} options={modeOptions()} onChange={setMode} />
      </Field>

      <Show when={mode() === 'fixed'}>
        <Field label="Picture" block hint="PNG/JPG/SVG. Stored inside the template (large photos are scaled down).">
          <div class="row gap">
            <Show when={props.el.src}>
              <img class="thumb" src={imageUrl(template.assets, props.el.src)} alt="" />
            </Show>
            <Button variant="outline" size="xs" class="btn small" onClick={() => input.click()}>
              {props.el.src ? 'Replace…' : 'Upload…'}
            </Button>
            <Show when={props.el.src}>
              <Button variant="outline" size="xs" class="btn small" onClick={() => set((el) => (el.src = ''), true)}>
                Remove
              </Button>
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
              input.value = '';
              if (!f) return;
              // Capture the target before reading: the user may switch sides or layers meanwhile.
              const side = activeSide();
              const id = props.el.id;
              const stillWanted = beginAsyncEdit(side, `${id}:src`);
              const dataUrl = await readImageFile(f);
              if (!stillWanted() || !findElement(side, id)) return;
              const ref = internImage(dataUrl);
              updateElement<ImageElement>(side, id, (el) => (el.src = ref), true);
            }}
          />
        </Field>
      </Show>

      <Show when={mode() === 'rule' && props.el.imageRule}>
        {(rule) => <ImageRuleEditor elementId={props.el.id} rule={rule()} onChange={(r) => set((el) => (el.imageRule = r), true)} />}
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
function ImageRuleEditor(props: { elementId: string; rule: ImageRule; onChange: (r: ImageRule) => void }) {
  const values = createMemo(() => distinctValues(rows(), props.rule.column));
  const assigned = createMemo(() => values().filter((v) => !!props.rule.map[v]).length);
  const [report, setReport] = createSignal<string | null>(null);
  let bulkInput!: HTMLInputElement;
  let fallbackInput!: HTMLInputElement;
  // One hidden file input per value would be wasteful; share one and remember the target.
  let singleInput!: HTMLInputElement;
  let singleTarget = '';

  /**
   * Uploads finish asynchronously, after the user may have switched sides, picked
   * another layer or changed the rule. Each picture therefore names its target up
   * front (side, layer, rule column, value) and is applied straight to that layer,
   * only if the target still exists and no newer upload for it has started.
   */
  type Slot = { kind: 'value'; value: string } | { kind: 'fallback' };
  function target(slot: Slot) {
    const side: SideId = activeSide();
    const id = props.elementId;
    const column = props.rule.column;
    const stillWanted = beginAsyncEdit(side, `${id}:rule:${slot.kind === 'value' ? `value:${slot.value}` : 'fallback'}`);
    const live = () => {
      const el = findElement(side, id);
      return stillWanted() && el?.kind === 'image' && el.imageRule?.column === column;
    };
    return { side, id, live };
  }

  /** Apply finished uploads (one undo step) to their own layer. */
  function applyPictures(side: SideId, id: string, slots: { slot: Slot; ref: string }[]) {
    if (slots.length === 0) return;
    updateElement<ImageElement>(
      side,
      id,
      (el) => {
        if (!el.imageRule) return;
        for (const { slot, ref } of slots) {
          if (slot.kind === 'value') el.imageRule.map[slot.value] = ref;
          else el.imageRule.fallback = ref;
        }
      },
      true,
    );
  }

  async function upload(slot: Slot, file: File) {
    const t = target(slot);
    const dataUrl = await readImageFile(file);
    if (!t.live()) return;
    applyPictures(t.side, t.id, [{ slot, ref: internImage(dataUrl) }]);
  }

  async function bulkUpload(files: File[]) {
    const matches = matchFilesToValues(
      files.map((f) => f.name),
      values(),
    );
    const unmatched: string[] = [];
    const side = activeSide();
    const id = props.elementId;
    const pending = matches.flatMap((m, i) => {
      if (m.value === null) {
        unmatched.push(m.fileName);
        return [];
      }
      const slot: Slot = { kind: 'value', value: m.value };
      return [{ slot, file: files[i], t: target(slot) }];
    });
    const read = await Promise.all(pending.map(async (p) => ({ ...p, dataUrl: await readImageFile(p.file) })));
    const done = read.filter((p) => p.t.live()).map((p) => ({ slot: p.slot, ref: internImage(p.dataUrl) }));
    applyPictures(side, id, done);
    const rule = (() => {
      const el = findElement(side, id);
      return el?.kind === 'image' ? el.imageRule : null;
    })();
    if (!rule) return; // the layer went away meanwhile; its editor is gone too
    const map = rule.map;
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
          <Button size="xs" class="btn small primary" data-testid="bulk-upload-button" onClick={() => bulkInput.click()}>
            Upload for all values…
          </Button>
          <Show when={assigned() > 0}>
            <Button variant="outline" size="xs" class="btn small" onClick={() => props.onChange({ ...props.rule, map: {} })}>
              Clear all
            </Button>
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
            input.value = '';
            if (files.length) await bulkUpload(files);
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
          input.value = '';
          if (f) await upload({ kind: 'value', value: singleTarget }, f);
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
                <Button variant="outline" size="2xs"
                  class="btn tiny"
                  onClick={() => {
                    singleTarget = v;
                    singleInput.click();
                  }}
                >
                  {props.rule.map[v] ? 'Replace' : 'Upload'}
                </Button>
                <Show when={props.rule.map[v]}>
                  <Button variant="outline" size="2xs"
                    class="btn tiny"
                    title="Remove this picture"
                    aria-label="Remove this picture"
                    onClick={() => {
                      const map = { ...props.rule.map };
                      delete map[v];
                      props.onChange({ ...props.rule, map });
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
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
            <Button variant="outline" size="2xs" class="btn tiny" onClick={() => fallbackInput.click()}>
              {props.rule.fallback ? 'Replace' : 'Upload'}
            </Button>
            <Show when={props.rule.fallback}>
              <Button variant="outline" size="2xs" class="btn tiny" title="Remove the fallback picture" aria-label="Remove the fallback picture" onClick={() => props.onChange({ ...props.rule, fallback: '' })}>
                <X aria-hidden="true" />
              </Button>
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
              input.value = '';
              if (f) await upload({ kind: 'fallback' }, f);
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
                  <Input
                    size="sm"
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
              <Input size="sm" type="color" class="color" value={rule().fallback} onInput={(e) => props.onChange({ ...rule(), fallback: e.currentTarget.value })} />
              <span class="val muted">Anything else</span>
            </label>
            <Button variant="outline" size="2xs" class="btn tiny" onClick={() => props.onChange(buildColorRule(rows(), rule().column))}>
              Re-assign palette
            </Button>
          </div>
        )}
      </Show>
    </Show>
  );
}
