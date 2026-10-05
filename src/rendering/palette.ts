// The map is drawn on paper, like the interface around it. Everything the
// scene paints that is not a line colour or a condition comes from here, so
// the 3D view and the CSS tokens (--plate, --paper) stay one surface.
//
// Hex values are the sRGB of the matching oklch tokens in index.css.
export const SCENE = {
  /** Same tone as --plate, so the map's edge and the page agree. */
  background: 0xe5e8eb,
  land: 0xf0f2f4,
  sea: 0xbed4e5,
  river: 0xabc8de,
  roadLocal: 0xc3c7cd,
  roadArterial: 0xa6acb5,
  bridge: 0x99a1ab,
} as const;

export const DISTRICT_COLORS = {
  cbd: 0x8ea4d0,
  residential: 0xc6cbd5,
  industrial: 0xcdbfa8,
  university: 0xa8c8b6,
  airport: 0xbec3cb,
  harbor: 0xa5bfd5,
  suburban: 0xd5d8df,
} as const;

/** Stations are ink-toned so they stand off pale ground and read as signage. */
export const STATION = {
  regular: 0x4b5563,
  interchange: 0x1f2937,
  glow: 0x334155,
} as const;

/** Marker colours tuned to hold contrast on a light ground. */
export const MARK = {
  /** Selection, draft geometry and hover: the interface's amber, deepened. */
  amber: 0xd48806,
  /** Measure, catchment and info: the interface's line blue. */
  blue: 0x1b6fc4,
  /** A valid placement. */
  green: 0x0e7a52,
  car: 0x6b7280,
} as const;

/** Two-ended ramps: pale for little, deep for a lot. */
export const RAMP = {
  paleBlue: 0xdfe7f5,
  navy: 0x1e3a8a,
  paleGreen: 0xdcefe3,
  deepGreen: 0x14532d,
  /** No data or unreachable. */
  none: 0x9aa3b2,
} as const;
