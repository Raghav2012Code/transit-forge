// One icon set: 16px grid, 1.5 stroke, round caps, currentColor.
// Icon components never carry their own color or size — the CSS decides.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: IconProps) => (
  <Svg {...p}><path d="M5 3.2 12.5 8 5 12.8Z" fill="currentColor" stroke="none" /></Svg>
);

export const IconPause = (p: IconProps) => (
  <Svg {...p}><path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={2} /></Svg>
);

export const IconStep = (p: IconProps) => (
  <Svg {...p}><path d="M4 3.5 10 8l-6 4.5Z" fill="currentColor" stroke="none" /><path d="M12.5 3.5v9" strokeWidth={1.75} /></Svg>
);

export const IconReset = (p: IconProps) => (
  <Svg {...p}><path d="M13 8a5 5 0 1 1-1.9-3.85" /><path d="M13.2 2.6v3h-3" /></Svg>
);

export const IconSimulate = (p: IconProps) => (
  <Svg {...p}><path d="M1.5 8h2.2l1.6-4.4L7.4 12.4l1.7-4.4h1.6l1.3-2.6h1.5" /></Svg>
);

export const IconBuild = (p: IconProps) => (
  <Svg {...p}><path d="M10.4 2.6a3.1 3.1 0 0 0-3.6 4.5L2.6 11.3l2.1 2.1 4.2-4.2a3.1 3.1 0 0 0 4.5-3.6L11.7 7.3 8.7 4.3Z" /></Svg>
);

export const IconDisrupt = (p: IconProps) => (
  <Svg {...p}><path d="M8 2.4 14.4 13.2H1.6Z" /><path d="M8 6.6v3M8 11.5v.1" /></Svg>
);

export const IconPlan = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.6" /><circle cx="8" cy="8" r="2.1" /><path d="M8 0.8v2M8 13.2v2M0.8 8h2M13.2 8h2" /></Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}><path d="M8 1.9 14.4 5 8 8.1 1.6 5Z" /><path d="M2.6 8 8 10.7 13.4 8" /><path d="M2.6 11 8 13.7 13.4 11" /></Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}><path d="M8 2.4v7.4M5 7.1 8 10.1l3-3" /><path d="M2.8 12.2v1.4h10.4v-1.4" /></Svg>
);

export const IconUndo = (p: IconProps) => (
  <Svg {...p}><path d="M3 7.2h6.4a3.4 3.4 0 0 1 0 6.8H6.2" /><path d="M5.4 4.4 2.6 7.2l2.8 2.8" /></Svg>
);

export const IconRedo = (p: IconProps) => (
  <Svg {...p}><path d="M13 7.2H6.6a3.4 3.4 0 0 0 0 6.8h3.2" /><path d="M10.6 4.4l2.8 2.8-2.8 2.8" /></Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M8 3.6v8.8M3.6 8h8.8" /></Svg>
);

export const IconMinus = (p: IconProps) => (
  <Svg {...p}><path d="M3.6 8h8.8" /></Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}><path d="M2.8 4.4h10.4M6.2 4.4V2.8h3.6v1.6M4.2 4.4l.6 8.8h6.4l.6-8.8" /></Svg>
);

export const IconSave = (p: IconProps) => (
  <Svg {...p}><path d="M2.8 3.2h8.4l2 2v7.6H2.8Z" /><path d="M5.2 3.2v3.4h5.2V3.2M5.2 12.8V9.6h5.6v3.2" /></Svg>
);

export const IconChevron = (p: IconProps) => (
  <Svg {...p}><path d="M4.4 6.2 8 9.8l3.6-3.6" /></Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="6.2" /><path d="M8 7.2v4M8 4.9v.1" /></Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 14 14" /></Svg>
);

export const IconMeasure = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 13.5 13.5 2.5" /><path d="M5.5 12.5l1.5 1.5M8 10l1.5 1.5M10.5 7.5 12 9M3.5 10.5l1 1" /></Svg>
);

export const IconInspect = (p: IconProps) => (
  <Svg {...p}><path d="M1.8 8S4 4.2 8 4.2 14.2 8 14.2 8 12 11.8 8 11.8 1.8 8 1.8 8Z" /><circle cx="8" cy="8" r="1.8" /></Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="M3 8.4 6.4 11.8 13 4.6" /></Svg>
);
export const IconPanel = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="2.8" width="12" height="10.4" rx="1.4" /><path d="M10 2.8v10.4" /></Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}><circle cx="8" cy="8" r="2.9" /><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" /></Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" /></Svg>
);
