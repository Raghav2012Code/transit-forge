// Pure simulation entry point. No React / Three.js imports allowed here.
import type { Zone } from '../types/index.ts';

export interface SimulationState {
  seed: number;
  tick: number;
  timeMinutes: number;
  zones: Zone[];
}

export function createSimulation(seed = 1337): SimulationState {
  // Deterministic scaffold state. City generation lands here next.
  return {
    seed,
    tick: 0,
    timeMinutes: 7 * 60,
    zones: [],
  };
}

export function stepSimulation(state: SimulationState, dtMinutes = 1): SimulationState {
  return {
    ...state,
    tick: state.tick + 1,
    timeMinutes: state.timeMinutes + dtMinutes,
  };
}
