import { For, Show, type JSX } from 'solid-js';
import type { AssetStore, FitStatus, ImageElement, RectElement, Row, Template, TemplateElement } from '../lib/types';
import { imageUrl, resolveFill, resolveImageSrc } from '../lib/template';
import TextBox from './TextBox';

export interface CardProps {
  template: Template;
  row: Row;
  /** Editor mode: show placeholders for empty images, hidden elements stay hidden. */
  editor?: boolean;
  selectedId?: string | null;
  onElementPointerDown?: (e: PointerEvent, el: TemplateElement) => void;
  onElementDblClick?: (el: TemplateElement) => void;
  /** Called whenever a text element's fit changes (overflows its box / clipped by the card edge). */
  onFit?: (elId: string, status: FitStatus) => void;
  style?: JSX.CSSProperties;
  class?: string;
  ref?: (el: HTMLDivElement) => void;
}

/** Renders one badge card from a template and a data row. Used by the editor, previews and print sheets. */
export default function Card(props: CardProps) {
  const t = () => props.template;
  return (
    <div
      ref={props.ref}
      class={`card ${props.class ?? ''}`}
      style={{
        position: 'relative',
        width: `${t().card.width}mm`,
        height: `${t().card.height}mm`,
        background: t().card.bg,
        'background-image': t().card.bgImage ? `url(${imageUrl(t().assets, t().card.bgImage)})` : undefined,
        'background-size': 'cover',
        'background-position': 'center',
        'border-radius': `${t().card.borderRadius}mm`,
        overflow: 'hidden',
        'box-sizing': 'border-box',
        ...props.style,
      }}
    >
      <For each={t().elements}>
        {(el) => (
          <Show when={!el.hidden}>
            <ElementView
              el={el}
              row={props.row}
              editor={props.editor}
              cardW={t().card.width}
              cardH={t().card.height}
              assets={t().assets}
              onPointerDown={props.onElementPointerDown}
              onDblClick={props.onElementDblClick}
              onFit={props.onFit}
            />
          </Show>
        )}
      </For>
    </div>
  );
}

interface ElementViewProps {
  el: TemplateElement;
  row: Row;
  editor?: boolean;
  cardW: number;
  cardH: number;
  assets: AssetStore;
  onPointerDown?: (e: PointerEvent, el: TemplateElement) => void;
  onDblClick?: (el: TemplateElement) => void;
  onFit?: (elId: string, status: FitStatus) => void;
}

function ElementView(props: ElementViewProps) {
  const interactive = () => props.editor && !props.el.locked;
  const handlers = () => ({
    onPointerDown: interactive() ? (e: PointerEvent) => props.onPointerDown?.(e, props.el) : undefined,
    onDblClick: interactive() ? () => props.onDblClick?.(props.el) : undefined,
  });
  const common = (): JSX.CSSProperties => ({
    cursor: interactive() ? 'move' : undefined,
    'pointer-events': props.editor && props.el.locked ? 'none' : undefined,
  });

  return (
    <>
      <Show when={props.el.kind === 'text'}>
        <TextBox
          el={props.el as Extract<TemplateElement, { kind: 'text' }>}
          row={props.row}
          cardW={props.cardW}
          cardH={props.cardH}
          style={common()}
          onPointerDown={handlers().onPointerDown}
          onDblClick={handlers().onDblClick}
          onFit={(s) => props.onFit?.(props.el.id, s)}
        />
      </Show>
      <Show when={props.el.kind === 'rect'}>
        <RectView el={props.el as RectElement} row={props.row} style={common()} handlers={handlers()} />
      </Show>
      <Show when={props.el.kind === 'image'}>
        <ImageView el={props.el as ImageElement} row={props.row} assets={props.assets} editor={props.editor} style={common()} handlers={handlers()} />
      </Show>
    </>
  );
}

type Handlers = { onPointerDown?: (e: PointerEvent) => void; onDblClick?: () => void };

function RectView(props: { el: RectElement; row: Row; style: JSX.CSSProperties; handlers: Handlers }) {
  return (
    <div
      class="el el-rect"
      data-id={props.el.id}
      onPointerDown={props.handlers.onPointerDown}
      onDblClick={props.handlers.onDblClick}
      style={{
        position: 'absolute',
        left: `${props.el.x}mm`,
        top: `${props.el.y}mm`,
        width: `${props.el.w}mm`,
        height: `${props.el.h}mm`,
        background: resolveFill(props.el.bg, props.el.colorRule, props.row),
        'border-radius': `${props.el.borderRadius}mm`,
        border: props.el.borderWidth > 0 ? `${props.el.borderWidth}mm solid ${props.el.borderColor}` : 'none',
        'box-sizing': 'border-box',
        opacity: props.el.opacity,
        transform: props.el.rotation ? `rotate(${props.el.rotation}deg)` : undefined,
        ...props.style,
      }}
    />
  );
}

function ImageView(props: { el: ImageElement; row: Row; assets: AssetStore; editor?: boolean; style: JSX.CSSProperties; handlers: Handlers }) {
  const src = () => imageUrl(props.assets, resolveImageSrc(props.el, props.row));
  /** Editor-only hint explaining why nothing is shown. */
  const placeholder = () => {
    const rule = props.el.imageRule;
    if (rule) {
      const v = (props.row[rule.column] ?? '').trim();
      return v ? `No image for “${v}”` : `No image for empty ${rule.column}`;
    }
    if (props.el.srcColumn) return `No URL in ${props.el.srcColumn}`;
    return 'Image';
  };
  return (
    <div
      class="el el-image"
      data-id={props.el.id}
      onPointerDown={props.handlers.onPointerDown}
      onDblClick={props.handlers.onDblClick}
      style={{
        position: 'absolute',
        left: `${props.el.x}mm`,
        top: `${props.el.y}mm`,
        width: `${props.el.w}mm`,
        height: `${props.el.h}mm`,
        'border-radius': `${props.el.borderRadius}mm`,
        overflow: 'hidden',
        opacity: props.el.opacity,
        transform: props.el.rotation ? `rotate(${props.el.rotation}deg)` : undefined,
        ...props.style,
      }}
    >
      <Show
        when={src()}
        fallback={
          <Show when={props.editor}>
            <div class="image-placeholder" data-testid="image-placeholder">
              {placeholder()}
            </div>
          </Show>
        }
      >
        <img
          src={src()}
          alt=""
          data-testid="image"
          draggable={false}
          style={{ width: '100%', height: '100%', 'object-fit': props.el.fit, display: 'block' }}
        />
      </Show>
    </div>
  );
}
