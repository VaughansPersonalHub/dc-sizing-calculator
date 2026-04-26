// Phase 10.1 — static reference content surfaced in the Help dialog.
//
// Three sections for chunk 1: keyboard shortcuts, tab map, glossary.
// Phase 10.2 will add per-step explainers; Phase 10.3 will add a
// limitations section; Phase 10.6 will add calibration benchmarks.
// Each follow-up chunk appends a section to this file rather than
// introducing a new content surface.

export interface ShortcutEntry {
  keys: string[];
  description: string;
}

export const KEYBOARD_SHORTCUTS: readonly ShortcutEntry[] = [
  { keys: ['1'], description: 'Engagements tab' },
  { keys: ['2'], description: 'Inputs tab' },
  { keys: ['3'], description: 'Reference tab' },
  { keys: ['4'], description: 'Design Rules tab' },
  { keys: ['5'], description: 'Scenarios tab' },
  { keys: ['6'], description: 'Outputs tab' },
  { keys: ['7'], description: 'Layout tab' },
  { keys: ['R'], description: 'Run engine on the active scenario' },
  { keys: ['T'], description: 'Run tornado sensitivity (after engine)' },
  { keys: ['Esc'], description: 'Close help / clear layout selection' },
  { keys: ['?'], description: 'Open this help panel' },
];

export interface TabMapEntry {
  tab: string;
  purpose: string;
  whenToUse: string;
}

export const TAB_MAP: readonly TabMapEntry[] = [
  {
    tab: 'Engagements',
    purpose:
      'Open or create an engagement; pick region (KR / TW / VN / MY / SG / ID); see sync status against R2.',
    whenToUse:
      'Always start here. Each engagement has its own SKU set, ops profile, and saved engine results.',
  },
  {
    tab: 'Inputs',
    purpose:
      'Upload a SKU CSV; review data quality (Step 0 validation); acknowledge issues before running the engine.',
    whenToUse:
      'When you have a new SKU master. Re-upload supersedes the previous import; acknowledgement re-locks against the new hash.',
  },
  {
    tab: 'Reference',
    purpose:
      'Edit the six libraries: SKU classes, racks, MHE, productivity (LPH/CPH/UPH), automation systems, regional defaults.',
    whenToUse:
      'Tune defaults for your client (e.g. heavier pallets, narrower aisles, different rack spec). Edits invalidate cached engine runs.',
  },
  {
    tab: 'Design Rules',
    purpose:
      'Engagement-level rules: aisle widths, soft-space %, halal uplift, Surau toggle, customs trigger.',
    whenToUse:
      'Codify rules before running so you do not hand-tune outputs. Region defaults pre-fill on engagement creation.',
  },
  {
    tab: 'Scenarios',
    purpose:
      'Pick automation system (or none); run the engine; run the 17-parameter tornado sensitivity.',
    whenToUse:
      'Once Inputs and Reference are right. Press R to run the engine, T for the tornado.',
  },
  {
    tab: 'Outputs',
    purpose:
      'Download Schedule of Areas (Excel), Summary report (PDF), Tornado deck (PPT), Assumptions (CSV), or .scc snapshot. Import a .scc to restore.',
    whenToUse:
      'After the engine runs successfully. PDF and PPT include the tornado page if you ran it.',
  },
  {
    tab: 'Layout',
    purpose:
      'Block-diagram of the warehouse: storage zones, docks, support cluster, flow arrows, fire egress. Click a zone for details.',
    whenToUse:
      'After the engine runs. Toggle layers, swap flow patterns (I / U / L / custom), export SVG or PNG.',
  },
];

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    term: 'PFP',
    definition:
      'Pick-from-Pallet — full pallets staged at floor level for case picking (high-velocity SKUs).',
  },
  {
    term: 'CLS',
    definition:
      'Carton Live Storage — gravity-fed flow rack for case picks; lane-style fast-mover storage.',
  },
  {
    term: 'VNA',
    definition:
      'Very Narrow Aisle — pallet aisles ≈1.6 m. Requires guided turret truck. Higher density, longer travel cycle.',
  },
  {
    term: 'DSOH',
    definition:
      'Days Stock On Hand — inventory-cover target (per channel) driving stored quantity per SKU.',
  },
  {
    term: 'CV',
    definition:
      'Coefficient of Variation — std-dev ÷ mean of weekly demand. Drives Step 6 peak uplift.',
  },
  {
    term: 'VHC / HHC',
    definition:
      'Vertical / Horizontal Honeycombing — wasted slot space when rack levels or pallet positions are over-allocated.',
  },
  {
    term: 'TI / HI',
    definition:
      'Ties / Layers — case pattern on a pallet. TI = cases per layer; HI = layers per pallet.',
  },
  {
    term: 'ESFR',
    definition:
      'Early Suppression Fast Response — sprinkler class. Often dictates clear height and rack flue dimensions.',
  },
  {
    term: 'DG',
    definition:
      'Dangerous Goods — segregated storage with bunds, ventilation, and code compliance.',
  },
  {
    term: 'LPH / CPH / UPH',
    definition:
      'Lines / Cases / Units Per Hour — productivity unit your library is keyed against per task type.',
  },
  {
    term: 'UDL',
    definition:
      'Uniform Distributed Load — slab capacity in t/m². Drives Step 11 structural feasibility.',
  },
  {
    term: 'WERC',
    definition:
      'Warehousing Education and Research Council — source for many heuristic productivity defaults.',
  },
  {
    term: 'G2P',
    definition:
      'Goods-to-Person — operator at a port; system delivers totes/cartons/pallets (AutoStore, Geek+, HaiPick, etc).',
  },
  {
    term: 'ASRS',
    definition:
      'Automated Storage and Retrieval System — fixed-aisle crane or shuttle systems.',
  },
  {
    term: 'AMR',
    definition:
      'Autonomous Mobile Robot — sensor-guided, free-roaming (Geek+, Quicktron, HAI).',
  },
  {
    term: 'AGV',
    definition:
      'Automated Guided Vehicle — fixed-path (rail / magnet / QR) automated transport.',
  },
  {
    term: 'ACR',
    definition:
      'Autonomous Case-handling Robot — totes / cases (HAI HaiPick, Quicktron Quickbin).',
  },
  {
    term: 'JAKIM',
    definition:
      'Jabatan Kemajuan Islam Malaysia — Malaysian halal authority. Source for SPEC Surau ratio.',
  },
  {
    term: 'MUI',
    definition:
      'Majelis Ulama Indonesia — Indonesian halal authority. Equivalent compliance driver in ID.',
  },
  {
    term: 'Surau',
    definition:
      'Prayer room. SPEC default: 1 m² per 50 muslim staff + 6 m² ablution (MY / ID engagements).',
  },
  {
    term: 'SCDF',
    definition:
      'Singapore Civil Defence Force. Drives the SG 20 m maximum cross-aisle / fire compartment.',
  },
  {
    term: 'SNI',
    definition:
      'Standar Nasional Indonesia. Affects ID seismic and structural defaults.',
  },
  {
    term: 'JIS / KS / GB/T',
    definition:
      'Japanese / Korean / Chinese national standards. KR uses KS for racking; GB/T governs Chinese-vendor compliance.',
  },
  {
    term: 'UBBL',
    definition:
      'Uniform Building By-Laws (Malaysia). Drives MY structural and fire defaults.',
  },
  {
    term: 'FTZ / KPBPB',
    definition:
      'Free Trade Zone / Kawasan Perdagangan Bebas dan Pelabuhan Bebas — bonded customs designation. Drives Step 10 customs space.',
  },
  {
    term: 'T11',
    definition:
      'ISO 6780 Size 3 pallet, 1100×1100 mm. Asian standard. Differs from euro 1200×800 and US 1200×1000.',
  },
  {
    term: 'Ramadan',
    definition:
      'Annual fasting month. SPEC derate: 30 days × 0.82 productivity. Applied to MY / ID. Phase 10.4 will generalise into a learning curve.',
  },
  {
    term: '.scc',
    definition:
      'SCConnect snapshot file. Gzipped JSON containing engagement state, SKU set, and ops profile. Round-trips through R2.',
  },
];
