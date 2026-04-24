import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type LayerId =
  | 'grid'
  | 'storage'
  | 'staging'
  | 'docks'
  | 'support'
  | 'flow'
  | 'fire_egress'
  | 'pedestrian'
  | 'labels'
  | 'scale'
  | 'north';

export type FlowPattern = 'I_flow' | 'U_flow' | 'L_flow' | 'custom';

export const DEFAULT_LAYER_VISIBILITY: Record<LayerId, boolean> = {
  grid: true,
  storage: true,
  staging: true,
  docks: true,
  support: true,
  flow: true,
  fire_egress: false,
  pedestrian: false,
  labels: true,
  scale: true,
  north: true,
};

interface LayoutViewState {
  zoom: number;
  panX: number;
  panY: number;
  visibleLayers: Record<LayerId, boolean>;
  selectedZoneId: string | null;
  flowPattern: FlowPattern;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  toggleLayer: (id: LayerId) => void;
  setSelectedZone: (id: string | null) => void;
  setFlowPattern: (p: FlowPattern) => void;
  reset: () => void;
}

export const useLayoutViewStore = create<LayoutViewState>()(
  immer((set) => ({
    zoom: 1,
    panX: 0,
    panY: 0,
    visibleLayers: { ...DEFAULT_LAYER_VISIBILITY },
    selectedZoneId: null,
    flowPattern: 'I_flow',
    setZoom: (z) =>
      set((s) => {
        s.zoom = Math.max(0.1, Math.min(10, z));
      }),
    setPan: (x, y) =>
      set((s) => {
        s.panX = x;
        s.panY = y;
      }),
    toggleLayer: (id) =>
      set((s) => {
        s.visibleLayers[id] = !s.visibleLayers[id];
      }),
    setSelectedZone: (id) =>
      set((s) => {
        s.selectedZoneId = id;
      }),
    setFlowPattern: (p) =>
      set((s) => {
        s.flowPattern = p;
      }),
    reset: () =>
      set((s) => {
        s.zoom = 1;
        s.panX = 0;
        s.panY = 0;
        s.visibleLayers = { ...DEFAULT_LAYER_VISIBILITY };
        s.selectedZoneId = null;
      }),
  }))
);
