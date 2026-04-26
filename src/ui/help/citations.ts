// Phase 10.3 — Source citations for the most-load-bearing library
// defaults. Surfaced inline next to the value (Reference tab tooltips +
// step explainer assumptions) and rolled up on the "Ways it could be
// wrong" panel in /help.
//
// Each citation answers a sceptical reviewer's question: "Where did
// THIS specific number come from?". Only the values that drive
// significant footprint / FTE / structural decisions are listed —
// everything else is noted as "internal SPEC heuristic" without a
// formal source.

export interface Citation {
  /** Library / value the citation is for. Used as the key. */
  topic: string;
  /** The specific value or rule cited (eg "1 m² per 50 muslim staff + 6 m² ablution"). */
  value: string;
  /** Source / standard / authority the value is drawn from. */
  source: string;
  /**
   * Document / clause / publication reference. Be specific enough that
   * a reviewer can find the source, not just google the body.
   */
  reference: string;
  /**
   * Optional URL to the source document. Empty string when the source
   * is paper-only (eg JAKIM physical guidance) or behind a paywall.
   */
  url?: string;
  /** Which engine step(s) consume this value. */
  consumedBy: readonly string[];
  /** Notes — caveats specific to the citation (eg "MY-only", "soft cap"). */
  notes?: string;
}

export const CITATIONS: readonly Citation[] = [
  {
    topic: 'Surau (prayer room) ratio',
    value: '1 m² per 50 muslim staff + 6 m² ablution area',
    source: 'JAKIM (Jabatan Kemajuan Islam Malaysia)',
    reference:
      'JAKIM 2018 housing-guidance booklet for Halal-certified facilities; SPEC §6.2 MY/ID profiles encode the same ratio.',
    consumedBy: ['Step 10 · Support areas'],
    notes: 'Trigger threshold ≥ 40 muslim staff. Indonesia (MUI) defaults to the same ratio.',
  },
  {
    topic: 'Halal segregation uplift',
    value: '~15% operational area uplift when halalCertifiedRequired',
    source: 'JAKIM / MUI segregation rules',
    reference:
      'JAKIM Halal Manual Procedure 2014 (rack + dock + receiving lane segregation). 15% derived from prior SCConnect engagements in MY/ID.',
    consumedBy: ['Step 10 · Support areas', 'Step 11 · Footprint roll-up'],
    notes:
      'Engagement override available. Lower if existing rack inventory can be repurposed; higher for full duplication.',
  },
  {
    topic: 'SCDF cross-aisle / fire compartment',
    value: '20 m maximum cross-aisle / fire-compartment dimension (SG)',
    source: 'Singapore Civil Defence Force (SCDF)',
    reference:
      'SCDF Fire Code 2018 §6.4 (storage occupancy); applied to SG region defaults only.',
    url: 'https://www.scdf.gov.sg/firecode/',
    consumedBy: ['Step 5 · Storage footprint'],
    notes: 'Other ASEAN markets default to FM Global / NFPA 13.',
  },
  {
    topic: 'ESFR sprinkler clearance',
    value: '1 m vertical clearance between top of stored goods and ESFR sprinkler deflector',
    source: 'FM Global Data Sheet 8-9',
    reference:
      'FM Global Property Loss Prevention Data Sheet 8-9 (Storage of Class 1, 2, 3, 4 and Plastic Commodities); SPEC default for ESFR_K25.',
    url: 'https://www.fmglobaldatasheets.com/',
    consumedBy: ['Step 4.5 · Clear height'],
    notes:
      'In-rack sprinkler systems can reduce this — not modelled in v1; engagement override available.',
  },
  {
    topic: 'Walking pick speed',
    value: '~0.5 m/s laden walking, ~1.0 m/s empty walking',
    source: 'MTM-2 (Methods-Time Measurement)',
    reference:
      'MTM-2 standard times (1965, refined 2003). SPEC productivity library uses these as the floor for sqrt-area travel-coefficient calibration.',
    consumedBy: ['Step 7 · Labour'],
    notes:
      'Region-calibrated overrides apply: KR/SG dense layouts ≈ 0.45 m/s, MY/ID open layouts ≈ 0.55 m/s.',
  },
  {
    topic: 'Slab UDL — typical industrial',
    value: '5 t/m² (default for non-specified slab)',
    source: 'Industry rule of thumb (ASEAN industrial)',
    reference:
      'Common floor-loading spec for greenfield ASEAN logistics; SPEC default. Specialty cold-store / multi-story DCs typically 7-10 t/m².',
    consumedBy: ['Step 11 · Footprint roll-up (structural gate)'],
    notes:
      'CRITICAL: always validate against the actual building structural drawings — slab type / slab thickness / column-spacing all interact.',
  },
  {
    topic: 'Seismic design category',
    value: 'A-F per IBC 2018 / regional equivalents',
    source: 'IBC 2018; regional codes (KS in KR, GB/T in CN, SNI in ID, UBBL in MY)',
    reference:
      'International Building Code 2018 §1613; SPEC regional profiles encode a default per region (KR=D, TW=D, VN=C, MY=B, SG=A, ID=D).',
    consumedBy: ['Step 4.6 · Seismic mass'],
    notes: 'Site-specific PGA can shift the category by one bucket; engagement override critical.',
  },
  {
    topic: 'T11 pallet (1100×1100)',
    value: 'ISO 6780 Size 3 — 1100 × 1100 × 150 mm, max 1500 kg',
    source: 'ISO 6780 (Flat pallets for intercontinental materials handling)',
    reference: 'ISO 6780:2003. T11 is the dominant Asian pallet — JIS Z 0601 in JP, KS in KR.',
    url: 'https://www.iso.org/standard/35988.html',
    consumedBy: ['Step 3 · Slot sizing', 'Step 4 · Bays', 'Step 9 · Docks'],
  },
  {
    topic: 'Ramadan productivity derate',
    value: '30 days × 0.82× FTE rate (annual blanket)',
    source: 'SPEC §6.2 (synthesised from prior MY/ID engagements)',
    reference:
      'No published academic source — derived from ~6 SCConnect MY/ID engagement audits, 2018-2023. Phase 10.4 will generalise into a learning-curve.',
    consumedBy: ['Step 7 · Labour'],
    notes:
      'Conservative estimate; some operations report 0.75× during the last week of Ramadan; the blanket smooths the daily variation.',
  },
  {
    topic: 'Peak uplift CV factor',
    value: 'peak = avg × (1 + peakUpliftFactor × CV)',
    source: 'SPEC §6.3 heuristic',
    reference:
      'Synthesised from ~12 engagements 2019-2024. peakUpliftFactor ≈ 1.5 covers the 90th percentile day.',
    consumedBy: ['Step 6 · Throughput'],
    notes:
      'Engagement override expected — strict-SLA operations (e.g. medical, electronics) push this to 2.0+.',
  },
  {
    topic: 'DSOH per channel × velocity',
    value: 'A-class B2B: 7-14 d · A-class ecom: 5-10 d · C-class: 30-60 d',
    source: 'SPEC §6.2 regional defaults',
    reference: 'Region-tuned defaults per channel × velocity class. Engagement override expected.',
    consumedBy: ['Step 3 · Slot sizing'],
    notes: 'Highly engagement-specific — every client has its own DSOH policy.',
  },
  {
    topic: 'Container packing — 40HC pal/floor',
    value: '20-22 T11 pallets per 40HC (single-row, floor-stack)',
    source: 'Industry packing tables',
    reference:
      'Standard 40HC dimensions 12.03 × 2.35 × 2.69 m (internal); T11 1100×1100 floor-stack pattern. SPEC default 21.',
    consumedBy: ['Step 9 · Dock schedule'],
    notes: 'Cube-cap (volume) often binds before floor-stack count for low-density goods.',
  },
  {
    topic: 'Office area per FTE',
    value: '1 m² per FTE (operational support office)',
    source: 'SPEC §6.2 regional defaults',
    reference:
      'KR/SG: 0.7-1.0 m²/FTE (denser); MY/ID/VN: 1.0-1.5 m²/FTE. SPEC default 1.0 m²/FTE.',
    consumedBy: ['Step 10 · Support areas'],
    notes:
      'Excludes exec / meeting / break spaces — those are bundled into a separate amenities allowance.',
  },
];
