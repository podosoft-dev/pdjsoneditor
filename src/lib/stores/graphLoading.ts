import { writable } from 'svelte/store';

export type GraphPhase = 'idle' | 'build' | 'layout' | 'finalize';

export interface GraphLoadingState {
  active: boolean;
  phase: GraphPhase;
  progress: number; // 0..1
}

export const graphLoading = writable<GraphLoadingState>({
  active: false,
  phase: 'idle',
  progress: 0
});

