// Shared lightweight types. Simulation owns the full domain model;
// these are the minimal contracts rendering + UI may consume.
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type DistrictKind =
  | 'cbd'
  | 'residential'
  | 'industrial'
  | 'university'
  | 'airport'
  | 'harbor'
  | 'suburban';

export type TransportMode = 'metro' | 'rail' | 'bus' | 'road';

export interface Zone {
  id: string;
  name: string;
  kind: DistrictKind;
  center: Vec3;
  population: number;
  jobs: number;
}
