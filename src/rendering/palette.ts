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
    /** Kerb and pavement beside roads, quay edge along the water. */
    sidewalk: number;
    marking: number;
    park: number;
    /** Embankment either side of the river, and the beach strip. */
    bank: number;
    shore: number;
    /** The slab the city stands on, seen from the side. */
    plateEdge: number;
    runway: number;
    tree: number;
    treeDark: number;
    /** Container stacks at the harbour. */
    container: [number, number, number];
  };
  /** Viaducts, piers and platforms: neutral concrete, so the line colour carries. */
  track: { deck: number; pier: number; platform: number; canopy: number };
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
  lighting: { ambient: number; hemi: number; sun: number; fogNear: number; fogFar: number };
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
    sidewalk: 0xe3e6ea,
    marking: 0xf7f8f9,
    park: 0xd3ddd0,
    bank: 0xc4cfd9,
    shore: 0xe2e5e8,
    plateEdge: 0xaab1ba,
    runway: 0x8a9099,
    tree: 0xb5c4b2,
    treeDark: 0x9db09b,
    container: [0x9fa9b8, 0xb7ab97, 0x8d9aa8],
  },
  track: { deck: 0xb4bbc5, pier: 0xa0a8b3, platform: 0xd4d8de, canopy: 0xf1f3f5 },
  district: {
    cbd: 0x8ea4d0,
    residential: 0xc6cbd5,
    industrial: 0xcdbfa8,
    university: 0xa8c8b6,
    airport: 0xbec3cb,
    harbor: 0xa5bfd5,
    suburban: 0xd5d8df,
  },
  station: { regular: 0xaab3bf, interchange: 0x8691a0, glow: 0x334155 },
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
  lighting: { ambient: 0.35, hemi: 1.15, sun: 2.3, fogNear: 1100, fogFar: 2300 },
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
    sidewalk: 0x3a4666,
    marking: 0x9aa7c4,
    park: 0x1f3a3a,
    bank: 0x1a2c4d,
    shore: 0x2b3656,
    plateEdge: 0x0b0f1a,
    runway: 0x2a3148,
    tree: 0x3a5f58,
    treeDark: 0x2c4a47,
    container: [0x4a5878, 0x6b5b45, 0x3f6a78],
  },
  track: { deck: 0x56627f, pier: 0x47526e, platform: 0x7886a8, canopy: 0x9fb0d4 },
  district: {
    cbd: 0x5b7fc4,
    residential: 0x3d4a6b,
    industrial: 0x625748,
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
  lighting: { ambient: 0.3, hemi: 0.8, sun: 1.7, fogNear: 900, fogFar: 2000 },
};

export function getPalette(theme: Theme): ScenePalette {
  return theme === 'dark' ? DARK : LIGHT;
}
