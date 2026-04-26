// Phase 10.7.1 — Per-screen assumptions index.
//
// Sticky AssumptionsDrawer on every tab consults this file to surface
// the assumptions THAT tab consumes — not the whole CITATIONS list.
// Each entry is either an inline note (no formal citation) or a
// pointer at one entry in citations.ts. The drawer click-through
// opens HelpDialog so the reviewer can read the full citation.

export interface TabAssumption {
  /** Plain-language assumption / context note for this screen. */
  text?: string;
  /**
   * Topic of a citation in citations.ts. The drawer renders the
   * citation summary and links to the full entry in /help.
   */
  citationTopic?: string;
}

export type TabId =
  | 'engagements'
  | 'inputs'
  | 'reference'
  | 'design-rules'
  | 'scenarios'
  | 'outputs'
  | 'layout';

export const TAB_ASSUMPTIONS: Record<TabId, readonly TabAssumption[]> = {
  engagements: [
    {
      text: 'Region selection (KR / TW / VN / MY / SG / ID) loads the default Surau, halal, Ramadan derate, seismic category, and dock-cycle rules from src/regional/. Wizard-set flags can be overridden per engagement after creation.',
    },
    { citationTopic: 'Seismic design category' },
  ],
  inputs: [
    {
      text: 'Step 0 ValidationLayer flags every SPEC §7 code per SKU. Calibration warnings flag distributional patterns across the whole set (CV outliers, partial history, suppression rate).',
    },
    {
      text: 'Auto-fixes (clamp negatives, suppress zero, cap CV, normalise channel mix) write through src/db/repositories — non-destructive at the engine level, but they edit Dexie. Re-import the CSV to revert.',
    },
    { citationTopic: 'Peak uplift CV factor' },
    { citationTopic: 'DSOH per channel × velocity' },
  ],
  reference: [
    {
      text: 'Six libraries (productivity, pallets, MHE, racks, automation, sites) ship with SPEC seed data. Edits write back to Dexie and bump the engine cache hash.',
    },
    { citationTopic: 'T11 pallet (1100×1100)' },
    { citationTopic: 'Walking pick speed' },
    { citationTopic: 'Office area per FTE' },
    { citationTopic: 'Container packing — 40HC pal/floor' },
  ],
  'design-rules': [
    {
      text: 'Ops profile values flow into Step 6 throughput, Step 7 labour availability, Step 9 dock blending, Step 11 footprint roll-up, and the Step 14 tornado. Edit here BEFORE running the engine — most fields invalidate the cache.',
    },
    { citationTopic: 'Peak uplift CV factor' },
    { citationTopic: 'DSOH per channel × velocity' },
    { citationTopic: 'SCDF cross-aisle / fire compartment' },
    { citationTopic: 'Halal segregation uplift' },
  ],
  scenarios: [
    {
      text: 'Engine runs Steps 0-12 against the active engagement. Step 4.5 (clear height), 4.6 (seismic mass), and 11 (slab UDL + envelope fit) are mandatory feasibility gates — failing any of them sets infeasible.',
    },
    { citationTopic: 'Walking pick speed' },
    { citationTopic: 'Ramadan productivity derate' },
    { citationTopic: 'Halal segregation uplift' },
    { citationTopic: 'Slab UDL — typical industrial' },
    { citationTopic: 'ESFR sprinkler clearance' },
    { citationTopic: 'Surau (prayer room) ratio' },
  ],
  outputs: [
    {
      text: 'Schedule of Areas (xlsx), Assumptions CSV, Summary PDF, Tornado PPT, and .scc snapshot are all generated from the most recent engine run. PDF and PPT modules dynamic-import on click — first export takes 1-2 s extra.',
    },
    {
      text: '.scc envelope is gzipped JSON (schema v2). Importing a v1 envelope still works; exports always write v2.',
    },
  ],
  layout: [
    {
      text: 'Solver places Step 5 zones largest-first, Step 9 dock strip on the south wall (or as overridden), Step 10 support on the east. Polygon envelopes clip via ray-casting — overflow renders hatched red.',
    },
    {
      text: 'Egress rasterises the envelope at 5 m cells; cells exceeding 45 m worst-corner distance fail and render hatched. Configurable via the layer toggles.',
    },
    { citationTopic: 'SCDF cross-aisle / fire compartment' },
    { citationTopic: 'ESFR sprinkler clearance' },
  ],
};
