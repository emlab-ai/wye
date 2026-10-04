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

// The node column's tools (PeekPanel): open, graph, send, capture, delete — one set with the rail's.
export const IconOpen = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg>
);
export const IconGraph = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="8" r="2.4" /><circle cx="9" cy="18" r="2.4" /><path d="m8.2 7.2 7.6.6M7 8.3l1.4 7.4M16.4 10l-5.6 6.4" /></svg>
);
export const IconSend = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M4 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
export const IconPlus = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconTrash = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M4 7h16" /><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M10 11v6M14 11v6" /></svg>
);

// The Documents head's tools: show the open page in the tree, import, new page.
export const IconTarget = ({ size = 18 }: IconProps) => (
  <svg {...svg(size)}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></svg>
);
export const IconImport = ({ size = 18 }: IconProps) => (
  <svg {...svg(size)}><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" /></svg>
);
export const IconMore = ({ size = 16 }: IconProps) => (
  <svg {...svg(size)}><circle cx="5.5" cy="12" r="1.1" fill="currentColor" /><circle cx="12" cy="12" r="1.1" fill="currentColor" /><circle cx="18.5" cy="12" r="1.1" fill="currentColor" /></svg>
);
