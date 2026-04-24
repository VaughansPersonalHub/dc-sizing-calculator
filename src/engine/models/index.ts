/**
 * Shared enums / types used by both the main thread and workers.
 * Keep this module dependency-free so workers can import it cheaply.
 */
export type SlotType = 'PFP' | 'CLS' | 'Shelf' | 'Auto';
export type VelocityBucket = 'A' | 'B' | 'C' | 'D';
export type TravelModelType =
  | 'sqrt_area'
  | 'sequential_hv'
  | 'shuttle_cycle'
  | 'crane_cycle'
  | 'g2p_port'
  | 'amr_fleet'
  | 'zero';
