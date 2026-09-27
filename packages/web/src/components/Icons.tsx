// The rail's tool icons. Unicode glyphs (⚙ ☾ «) come from whichever font happens to carry them, so they never match
// in weight or optical size; these are one set — the same 24 viewBox, the same stroke, sized by the caller.
type IconProps = { size?: number };
const svg = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true, focusable: false,
});

export const IconSettings = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M12.8 2.4h-1.6a1.8 1.8 0 0 0-1.8 1.8v.3a1.6 1.6 0 0 1-.9 1.4l-.5.3a1.6 1.6 0 0 1-1.6 0l-.2-.2a1.8 1.8 0 0 0-2.4.7l-.8 1.4a1.8 1.8 0 0 0 .6 2.4l.3.2a1.6 1.6 0 0 1 .8 1.4v.6a1.6 1.6 0 0 1-.8 1.4l-.3.2a1.8 1.8 0 0 0-.6 2.4l.8 1.4a1.8 1.8 0 0 0 2.4.7l.2-.2a1.6 1.6 0 0 1 1.6 0l.5.3a1.6 1.6 0 0 1 .9 1.4v.3a1.8 1.8 0 0 0 1.8 1.8h1.6a1.8 1.8 0 0 0 1.8-1.8v-.3a1.6 1.6 0 0 1 .9-1.4l.5-.3a1.6 1.6 0 0 1 1.6 0l.2.2a1.8 1.8 0 0 0 2.4-.7l.8-1.4a1.8 1.8 0 0 0-.6-2.4l-.3-.2a1.6 1.6 0 0 1-.8-1.4v-.6a1.6 1.6 0 0 1 .8-1.4l.3-.2a1.8 1.8 0 0 0 .6-2.4l-.8-1.4a1.8 1.8 0 0 0-2.4-.7l-.2.2a1.6 1.6 0 0 1-1.6 0l-.5-.3a1.6 1.6 0 0 1-.9-1.4v-.3a1.8 1.8 0 0 0-1.8-1.8Z" />
    <circle cx="12" cy="12" r="2.9" />
  </svg>
);

export const IconSun = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.6v1.8M12 19.6v1.8M4.4 12H2.6M21.4 12h-1.8M6.6 6.6 5.3 5.3M18.7 18.7l-1.3-1.3M17.4 6.6l1.3-1.3M5.3 18.7l1.3-1.3" />
  </svg>
);

export const IconMoon = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5a8.5 8.5 0 1 0 10.9 10.9Z" />
  </svg>
);

export const IconChevronsLeft = ({ size = 17 }: IconProps) => (
  <svg {...svg(size)}>
    <path d="m11 17.5-5.5-5.5L11 6.5M18.5 17.5 13 12l5.5-5.5" />
  </svg>
);
