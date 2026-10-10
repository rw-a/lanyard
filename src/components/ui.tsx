import { createListCollection } from '@ark-ui/solid/select';
import { For, Show, createContext, createMemo, splitProps, useContext, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Input } from './park/input';
import { Button } from './park/button';
import { Heading } from './park/heading';
import * as ParkField from './park/field';
import * as ParkSelect from './park/select';
import * as Checkbox from './park/checkbox';
import * as ParkSwitch from './park/switch';
import * as SegmentGroup from './park/segment-group';
import * as Accordion from './park/accordion';
import * as Alert from './park/alert';

export { Button } from './park/button';
export { IconButton } from './park/icon-button';
export { Input } from './park/input';
export { Textarea } from './park/textarea';
export { Badge } from './park/badge';
export { Heading } from './park/heading';
export * as Table from './park/table';
export * as Tabs from './park/tabs';
export * as Splitter from './park/splitter';
export * as Collapsible from './park/collapsible';
export * as SurfaceCard from './park/card';

const FieldLabel = createContext<string>();

/** Park UI fields keep labels and hints associated with their controls. */
export function Field(props: { label: string; labelContent?: JSX.Element; hint?: string; children: JSX.Element; inline?: boolean; block?: boolean }) {
  return (
    <ParkField.Root class={props.inline ? 'field inline' : 'field'} data-field={props.label}>
      <FieldLabel.Provider value={props.label}>
        <Show when={props.block} fallback={<ParkField.Label class="field-label" aria-label={props.labelContent ? props.label : undefined}>{props.labelContent ?? props.label}</ParkField.Label>}>
          <ParkField.Label as="span" class="field-label" aria-label={props.labelContent ? props.label : undefined}>{props.labelContent ?? props.label}</ParkField.Label>
        </Show>
        {props.children}
        <Show when={props.hint}>
          <ParkField.HelperText class="field-hint">{props.hint}</ParkField.HelperText>
        </Show>
      </FieldLabel.Provider>
    </ParkField.Root>
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
  } & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onInput' | 'min' | 'max' | 'step' | 'size'>,
) {
  const [local, rest] = splitProps(props, ['value', 'onInput', 'onCommit', 'min', 'max', 'step', 'unit']);
  return (
    <span class="num-wrap" classList={{ 'has-unit': !!local.unit }}>
      <Input
        type="number"
        size="sm"
        class="num"
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
      <Show when={local.unit}><span class="unit">{local.unit}</span></Show>
    </span>
  );
}

export function TextField(
  props: {
    value: string;
    onInput: (v: string) => void;
    onCommit?: () => void;
  } & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onInput' | 'size'>,
) {
  const [local, rest] = splitProps(props, ['value', 'onInput', 'onCommit']);
  return (
    <Input
      type="text"
      size="sm"
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
      <Input
        type="color"
        size="sm"
        class="color"
        value={isTransparent() ? '#ffffff' : toHex(props.value)}
        onFocus={() => props.onCommit?.()}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      <Show when={props.allowTransparent}>
        <Button
          variant="outline"
          size="2xs"
          title="No fill"
          aria-pressed={isTransparent()}
          onClick={() => {
            props.onCommit?.();
            props.onInput(isTransparent() ? '#ffffff' : 'transparent');
          }}
        >
          {isTransparent() ? 'None' : 'Clear'}
        </Button>
      </Show>
    </span>
  );
}

/** Best-effort conversion of a CSS colour to #rrggbb for the native colour input. */
export function toHex(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((ch) => ch + ch).join('');
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    const v = ctx.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  }
  return '#000000';
}

export function Select<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  class?: string;
  label?: string;
  placeholder?: string;
  onSelectionComplete?: () => void;
}) {
  const fieldLabel = useContext(FieldLabel);
  const collection = createMemo(() => createListCollection({ items: props.options }));
  let selected = false;
  return (
    <ParkSelect.Root
      collection={collection()}
      value={props.options.some((o) => o.value === props.value) ? [props.value] : []}
      size="sm"
      class={props.class}
      onValueChange={(details) => {
        selected = true;
        props.onChange((details.value[0] ?? '') as T);
      }}
      onExitComplete={() => {
        if (selected) props.onSelectionComplete?.();
        selected = false;
      }}
    >
      <ParkSelect.Control>
        <ParkSelect.Trigger aria-label={props.label ?? fieldLabel}>
          <ParkSelect.ValueText placeholder={props.placeholder ?? props.options.find((o) => o.value === '')?.label} />
          <ParkSelect.Indicator />
        </ParkSelect.Trigger>
      </ParkSelect.Control>
      <Portal>
        <ParkSelect.Positioner>
          <ParkSelect.Content>
            <For each={collection().items}>
              {(item) => (
                <ParkSelect.Item item={item}>
                  <ParkSelect.ItemText>{item.label}</ParkSelect.ItemText>
                  <ParkSelect.ItemIndicator />
                </ParkSelect.Item>
              )}
            </For>
          </ParkSelect.Content>
        </ParkSelect.Positioner>
      </Portal>
      <ParkSelect.HiddenSelect />
    </ParkSelect.Root>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string }) {
  return (
    <Checkbox.Root checked={props.checked} onCheckedChange={(d) => props.onChange(d.checked === true)} title={props.title} size="sm">
      <Checkbox.HiddenInput />
      <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
      <Checkbox.Label>{props.label}</Checkbox.Label>
    </Checkbox.Root>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string; title?: string; 'data-testid'?: string }) {
  return (
    <ParkSwitch.Root checked={props.checked} onCheckedChange={(d) => props.onChange(d.checked)} title={props.title} size="sm" data-testid={props['data-testid']}>
      <ParkSwitch.HiddenInput role="switch" aria-checked={props.checked} />
      <ParkSwitch.Control class="switch-track" />
      <ParkSwitch.Label>{props.label}</ParkSwitch.Label>
    </ParkSwitch.Root>
  );
}

export function SegButtons<T extends string>(props: {
  value: T;
  options: { value: T; label: string; icon?: JSX.Element; title?: string }[];
  onChange: (v: T) => void;
}) {
  const label = useContext(FieldLabel);
  return (
    <SegmentGroup.Root size="xs" value={props.value} onValueChange={(d) => d.value && props.onChange(d.value as T)} aria-label={label}>
      <SegmentGroup.Indicator />
      <For each={props.options}>
        {(o) => (
          <SegmentGroup.Item value={o.value} title={o.title}>
            <SegmentGroup.ItemText aria-label={o.icon ? o.label : undefined}>{o.icon ?? o.label}</SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  );
}

export function Notice(props: { warning?: boolean; children: JSX.Element; class?: string; style?: JSX.CSSProperties; role?: JSX.AriaAttributes['role']; 'data-testid'?: string }) {
  return (
    <Alert.Root class={props.class} style={props.style} status={props.warning ? 'warning' : 'info'} role={props.role} data-testid={props['data-testid']}>
      <Alert.Indicator />
      <Alert.Content><Alert.Description>{props.children}</Alert.Description></Alert.Content>
    </Alert.Root>
  );
}

export function Section(props: { title: string; children: JSX.Element; actions?: JSX.Element; collapsible?: boolean; 'data-testid'?: string }) {
  return (
    <section class="section" data-testid={props['data-testid']}>
      <Show when={props.collapsible} fallback={
        <>
          <header class="section-head"><Heading as="h3" textStyle="md" color="fg.default">{props.title}</Heading>{props.actions}</header>
          <div class="section-body">{props.children}</div>
        </>
      }>
        <Accordion.Root collapsible defaultValue={['section']}>
          <Accordion.Item value="section">
            <Heading as="h3" textStyle="md" color="fg.default">
              <Accordion.ItemTrigger>
                {props.title}
                <Accordion.ItemIndicator />
              </Accordion.ItemTrigger>
            </Heading>
            {props.actions}
            <Accordion.ItemContent>
              <Accordion.ItemBody class="section-body">{props.children}</Accordion.ItemBody>
            </Accordion.ItemContent>
          </Accordion.Item>
        </Accordion.Root>
      </Show>
    </section>
  );
}
