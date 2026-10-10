import { For, Show, createSignal, createUniqueId, splitProps, type JSX } from 'solid-js';

/**
 * Labelled form row. Renders a <label> so clicking the caption focuses the control;
 * pass `block` when the content is buttons/lists rather than a single input, since a
 * <label> would otherwise forward clicks on the caption or hint to the first button.
 */
export function Field(props: { label: string; hint?: string; children: JSX.Element; inline?: boolean; block?: boolean }) {
  const inner = (
    <>
      <span class="field-label">{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <span class="field-hint">{props.hint}</span>
      </Show>
    </>
  );
  return (
    <Show
      when={props.block}
      fallback={
        <label class="field" data-field={props.label} classList={{ inline: props.inline }}>
          {inner}
        </label>
      }
    >
      <div class="field" data-field={props.label} classList={{ inline: props.inline }}>
        {inner}
      </div>
    </Show>
  );
}

export function NumberField(
  props: {
    value: number;
    onInput: (v: number) => void;
    onCommit?: () => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  } & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onInput' | 'min' | 'max' | 'step'>,
) {
  const [local, rest] = splitProps(props, ['value', 'onInput', 'onCommit', 'min', 'max', 'step', 'unit']);
  return (
    <span class="num-wrap">
      <input
        type="number"
        class="input num"
        value={Number.isFinite(local.value) ? +local.value.toFixed(2) : 0}
        min={local.min}
        max={local.max}
        step={local.step ?? 0.5}
        onFocus={() => local.onCommit?.()}
        onInput={(e) => {
          const v = parseFloat(e.currentTarget.value);
          if (Number.isFinite(v)) local.onInput(v);
        }}
        {...rest}
      />
      <Show when={local.unit}>
        <span class="unit">{local.unit}</span>
      </Show>
    </span>
  );
}

export function TextField(
  props: {
    value: string;
    onInput: (v: string) => void;
    onCommit?: () => void;
  } & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onInput'>,
) {
  const [local, rest] = splitProps(props, ['value', 'onInput', 'onCommit']);
  return (
    <input
      type="text"
      class="input"
      value={local.value}
      onFocus={() => local.onCommit?.()}
      onInput={(e) => local.onInput(e.currentTarget.value)}
      {...rest}
    />
  );
}

export function ColorField(props: { value: string; onInput: (v: string) => void; onCommit?: () => void; allowTransparent?: boolean }) {
  const isTransparent = () => props.value === 'transparent' || props.value === '';
  return (
    <span class="color-wrap">
      <input
        type="color"
        class="color"
        value={isTransparent() ? '#ffffff' : toHex(props.value)}
        onFocus={() => props.onCommit?.()}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      <Show when={props.allowTransparent}>
        <button
          type="button"
          class="btn tiny"
          classList={{ active: isTransparent() }}
          title="No fill"
          onClick={() => {
            props.onCommit?.();
            props.onInput(isTransparent() ? '#ffffff' : 'transparent');
          }}
        >
          {isTransparent() ? 'None' : 'Clear'}
        </button>
      </Show>
    </span>
  );
}

/** Best-effort conversion of a CSS colour to #rrggbb for <input type=color>. */
export function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((ch) => ch + ch).join('');
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillStyle = c;
      const v = ctx.fillStyle;
      if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    }
  }
  return '#000000';
}

export function Select<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  class?: string;
}) {
  return (
    <select class={`input ${props.class ?? ''}`} value={props.value} onChange={(e) => props.onChange(e.currentTarget.value as T)}>
      <For each={props.options}>{(o) => <option value={o.value} selected={o.value === props.value}>{o.label}</option>}</For>
    </select>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string }) {
  return (
    <label class="toggle" title={props.title}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

/**
 * On/off switch for settings that take effect immediately (e.g. "Ignore empty
 * cells"). A real checkbox underneath (role="switch"), so it is keyboard- and
 * screen-reader-friendly and the label is clickable. Never wraps.
 */
export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string; 'data-testid'?: string }) {
  return (
    <label class="switch" title={props.title} data-testid={props['data-testid']}>
      <input
        type="checkbox"
        role="switch"
        class="switch-input"
        checked={props.checked}
        aria-checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span class="switch-track" aria-hidden="true">
        <span class="switch-thumb" />
      </span>
      <span class="switch-label">{props.label}</span>
    </label>
  );
}

export function SegButtons<T extends string>(props: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <span class="seg">
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            class="seg-btn"
            classList={{ active: o.value === props.value }}
            title={o.title}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        )}
      </For>
    </span>
  );
}

export function Section(props: { title: string; children: JSX.Element; actions?: JSX.Element; collapsible?: boolean; 'data-testid'?: string }) {
  const [expanded, setExpanded] = createSignal(true);
  const bodyId = createUniqueId();
  return (
    <section class="section" data-testid={props['data-testid']}>
      <header class="section-head">
        <h3>
          <Show when={props.collapsible} fallback={props.title}>
            <button
              type="button"
              class="section-toggle"
              aria-expanded={expanded()}
              aria-controls={bodyId}
              onClick={() => setExpanded(!expanded())}
            >
              <span class="section-chevron" aria-hidden="true" />
              {props.title}
            </button>
          </Show>
        </h3>
        {props.actions}
      </header>
      <div id={bodyId} class="section-body" hidden={props.collapsible && !expanded()}>{props.children}</div>
    </section>
  );
}
