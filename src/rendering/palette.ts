// The map is painted from one palette per theme, so the 3D view and the CSS
// tokens (--plate, --paper) stay one surface in light and in dark.
//
// Everything the scene paints that is not a line colour or a condition comes
// from here. Hex values are the sRGB of the matching oklch tokens in index.css.
export type Theme = 'light' | 'dark';

export interface ScenePalette {
  scene: {
    /** Same tone as --plate, so the map's edge and the page agree. */
    background: number;
    land: number;
    sea: number;
    river: number;
    roadLocal: number;
    roadArterial: number;
    bridge: number;
  };
  district: Record<'cbd' | 'residential' | 'industrial' | 'university' | 'airport' | 'harbor' | 'suburban', number>;
  /** Stations contrast with the ground: ink on paper, pale on the dark plate. */
  station: { regular: number; interchange: number; glow: number };
  /** Selection, draft, measure and placement markers, tuned to hold contrast. */
  mark: { amber: number; blue: number; green: number; car: number };
  /** Two-ended ramps: the low end is the quiet one on either ground. */
  ramp: { blueLow: number; blueHigh: number; greenLow: number; greenHigh: number; none: number };
  label: {
    fill: string;
    text: string;
    zoneEdge: string;
    stationEdge: string;
    interchangeEdge: string;
    measureFill: string;
    measureText: string;
    measureEdge: string;
  };
  lighting: { ambient: number; sun: number; fogNear: number; fogFar: number };
}

const LIGHT: ScenePalette = {
  scene: {
    background: 0xe5e8eb,
    land: 0xf0f2f4,
    sea: 0xbed4e5,
    river: 0xabc8de,
    roadLocal: 0xc3c7cd,
    roadArterial: 0xa6acb5,
    bridge: 0x99a1ab,
  },
  district: {
    cbd: 0x8ea4d0,
    residential: 0xc6cbd5,
    industrial: 0xcdbfa8,
    university: 0xa8c8b6,
    airport: 0xbec3cb,
    harbor: 0xa5bfd5,
    suburban: 0xd5d8df,
  },
  station: { regular: 0x4b5563, interchange: 0x1f2937, glow: 0x334155 },
  mark: { amber: 0xd48806, blue: 0x1b6fc4, green: 0x0e7a52, car: 0x6b7280 },
  ramp: { blueLow: 0xdfe7f5, blueHigh: 0x1e3a8a, greenLow: 0xdcefe3, greenHigh: 0x14532d, none: 0x9aa3b2 },
  label: {
    fill: 'rgba(255,255,255,0.95)',
    text: '#1b2026',
    zoneEdge: '#aab3c4',
    stationEdge: '#97a1b3',
    interchangeEdge: '#d48806',
    measureFill: 'rgba(255,255,255,0.96)',
    measureText: '#1b2026',
    measureEdge: '#1b6fc4',
  },
  lighting: { ambient: 1.6, sun: 1.5, fogNear: 900, fogFar: 1900 },
};

const DARK: ScenePalette = {
  scene: {
    background: 0x0e1217,
    land: 0x141c33,
    sea: 0x0e2a44,
    river: 0x11405e,
    roadLocal: 0x2a3552,
    roadArterial: 0x39496e,
    bridge: 0x8b9cc7,
  },
  district: {
    cbd: 0x5b7fc4,
    residential: 0x3d4a6b,
    industrial: 0x7a6a55,
    university: 0x5f8f7b,
    airport: 0x6b7280,
    harbor: 0x4f7fa3,
    suburban: 0x35405a,
  },
  station: { regular: 0xcbd5e1, interchange: 0xf8fafc, glow: 0x334155 },
  mark: { amber: 0xfacc15, blue: 0x6ea8fe, green: 0x4ade80, car: 0xfbbf24 },
  ramp: { blueLow: 0x1e3a8a, blueHigh: 0xf1f5ff, greenLow: 0x14532d, greenHigh: 0xf1fff5, none: 0x475569 },
  label: {
    fill: 'rgba(11,16,32,0.88)',
    text: '#e8eefc',
    zoneEdge: '#33436e',
    stationEdge: '#5f6f95',
    interchangeEdge: '#facc15',
    measureFill: 'rgba(11,16,32,0.92)',
    measureText: '#dbe4ff',
    measureEdge: '#6ea8fe',
  },
  lighting: { ambient: 0.75, sun: 1.4, fogNear: 700, fogFar: 1600 },
};

export function getPalette(theme: Theme): ScenePalette {
  return theme === 'dark' ? DARK : LIGHT;
}
