import type { IncidentKind } from '../../types/index.ts';

export interface IncidentDraft {
  kind: IncidentKind;
  targetRouteId: string;
  targetStationId: string;
  segFrom: string;
  segTo: string;
  edgeId: string;
  startInMin: number;
  durationMin: number;
  recoveryMin: number;
  severity: 'low' | 'medium' | 'high';
  headwayMult: number;
  delayMin: number;
  capacityMult: number;
  withReplacement: boolean;
  repBuses: number;
  repHeadwayMin: number;
}

export const EMPTY_DRAFT: IncidentDraft = {
  kind: 'segment-closure',
  targetRouteId: '',
  targetStationId: '',
  segFrom: '',
  segTo: '',
  edgeId: '',
  startInMin: 5,
  durationMin: 45,
  recoveryMin: 10,
  severity: 'high',
  headwayMult: 2,
  delayMin: 4,
  capacityMult: 0.5,
  withReplacement: false,
  repBuses: 4,
  repHeadwayMin: 6,
};
