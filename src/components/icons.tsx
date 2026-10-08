import type { JSX } from 'solid-js';

/**
 * Small stroke icons (24-unit grid, 1.75 stroke) used for icon-only buttons.
 * Inline SVG so they inherit `currentColor` and render the same on every
 * platform, unlike emoji.
 */
function Svg(props: { children: JSX.Element; size?: number }) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export const IconArrowUp = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M12 19V5" />
    <path d="m6 11 6-6 6 6" />
  </Svg>
);

export const IconArrowDown = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M12 5v14" />
    <path d="m18 13-6 6-6-6" />
  </Svg>
);

export const IconPlus = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const IconLock = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const IconUnlock = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.5-1.9" />
  </Svg>
);

export const IconEye = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const IconEyeOff = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M10.6 5.6A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.2" />
    <path d="M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m3 3 18 18" />
  </Svg>
);

export const IconText = (p: { size?: number }) => (
  <Svg size={p.size}>
    <path d="M5 6V5h14v1" />
    <path d="M12 5v14" />
    <path d="M9 19h6" />
  </Svg>
);

export const IconShape = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="4" y="6" width="16" height="12" rx="2" />
  </Svg>
);

export const IconImage = (p: { size?: number }) => (
  <Svg size={p.size}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m20.5 16-4.5-4.5L7 19.5" />
  </Svg>
);
