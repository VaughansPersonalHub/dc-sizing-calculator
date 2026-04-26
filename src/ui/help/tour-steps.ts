// Phase 10.4 — first-run guided tour content.
//
// 7 steps walk a new user (or sceptical reviewer) through the happy
// path: Engagements → Inputs → Acknowledge data quality → Scenarios →
// Run engine → Layout → Outputs. Modal overlay; advances on Next.
//
// Localstorage key 'scconnect.intro_tour_v1.seen' marks the tour as
// completed. Setting key to 'skipped' also suppresses auto-open but
// distinguishes from a real completion in case we want to re-prompt.

import type { TabId } from '../../stores';

export interface TourStep {
  /** Step number (1-7) for display. */
  index: number;
  /** Tab the step is about — used for the side nav highlight + label. */
  tab: TabId;
  /** Headline shown in bold at the top of the modal step. */
  title: string;
  /** Body copy. Markdown-light: paragraph breaks via \n\n. */
  body: string;
  /** Optional one-line "what to look for" tip. */
  tip?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    index: 1,
    tab: 'engagements',
    title: 'Welcome — start with an engagement',
    body:
      'The Engagements tab is your home base. Every piece of work — SKU data, ops profile, saved results — is scoped to a single engagement.\n\n' +
      'Click "New engagement" and pick a region (KR / TW / VN / MY / SG / ID). The wizard will pre-fill regional defaults: halal segregation, Surau ratio, Ramadan derate, customs bonded, backup generator, antechamber.',
    tip:
      'Try the Malaysia (MY) preset — it auto-enables halal certification and Surau, so you can see how the engine reacts to those constraints.',
  },
  {
    index: 2,
    tab: 'inputs',
    title: 'Upload your SKU master',
    body:
      'On the Inputs tab, drag a CSV onto the upload area or click "choose a file". The format is documented inline — id, name, category, unitCubeCm3, unitWeightKg, caseQty, pallet IDs, channel mix, and 52 weeks of demand.\n\n' +
      '20 000 rows ingest in ~500 ms. The CSV stream parses in 1 MiB chunks so even very large masters won\'t lock up your browser.',
    tip:
      'Don\'t have a CSV handy? You can still complete the rest of the tour — most reviewer questions are about the engine logic and outputs, not the raw upload.',
  },
  {
    index: 3,
    tab: 'inputs',
    title: 'Acknowledge data quality',
    body:
      'Below the upload, the Data Quality Dashboard surfaces every issue Step 0 found — fatal errors, warnings, suppressions, and per-code counts.\n\n' +
      'Four auto-fixes are available (clamp negatives / suppress zero-demand / cap CV / normalise channel mix). Apply the ones that match your data, then click Acknowledge to lock the result.',
    tip:
      'The engine refuses to run until you acknowledge — this is intentional, so a sceptical reviewer can\'t accuse you of running on bad data without knowing.',
  },
  {
    index: 4,
    tab: 'scenarios',
    title: 'Pick automation, run the engine',
    body:
      'The Scenarios tab is where the calculation happens. Pick an automation system from the dropdown (or leave on Conventional) and click "Run engine on baseline" — or press R.\n\n' +
      'The engine runs in a Web Worker, so the UI stays responsive. 5 000 SKUs complete in ~36 ms; 20 000 in ~150 ms.',
    tip:
      'Each result card has a collapsible "How it works" beneath — click it for the formula, inputs, outputs, assumptions, sensitivity, and the ways the step could be wrong.',
  },
  {
    index: 5,
    tab: 'scenarios',
    title: 'Run the tornado sensitivity (T)',
    body:
      'Once the baseline runs, "Run tornado" sweeps 17 SPEC parameters at low/high (34 variants). The chart ranks the parameters by impact on footprint or peak FTE — toggle the metric switch.\n\n' +
      'Variants that exceed feasibility gates (slab, seismic, envelope, clear height) are hatched red. The top 3 sensitivities tell the reviewer which assumptions to scrutinise hardest.',
    tip:
      'Tornado runs 30+ variants in well under 1.5 s by distributing across a 4-worker pool.',
  },
  {
    index: 6,
    tab: 'layout',
    title: 'See the block diagram',
    body:
      'The Layout tab renders a Visio-grade SVG with 11 toggleable layers: column grid, storage zones, staging, docks, support cluster, flow arrows, fire egress, pedestrian routes, labels, scale, compass.\n\n' +
      'Click any zone for details. Switch flow patterns (I / U / L / custom). Export as SVG (vector, for client decks) or PNG (raster, for slides and email).',
    tip:
      'Polygon envelopes are supported — non-rectangular sites clip via ray-casting; cells more than 45 m from any egress hatch red.',
  },
  {
    index: 7,
    tab: 'outputs',
    title: 'Download the deliverables',
    body:
      'The Outputs tab packages five exports: Schedule of Areas (Excel, multi-sheet), Assumptions CSV (every ops-profile knob), Summary report (PDF, four-page A4), Tornado deck (PPT, native PowerPoint chart), and the .scc snapshot for round-tripping the engagement.\n\n' +
      'Heavy renderers (react-pdf 1.4 MB, pptxgenjs 372 KB, SheetJS 290 KB) lazy-load on click — first download takes ~1-2 s extra; subsequent downloads are instant.',
    tip:
      'Hit "?" any time to open the Help dialog with the keyboard cheatsheet, tab map, glossary, per-step explainers, limitations, and sources.',
  },
];

const STORAGE_KEY = 'scconnect.intro_tour_v1.seen';

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Storage may be unavailable (incognito, corporate policy). In that
    // case the tour will re-open every visit, which is fine for a
    // session-only mode.
    return false;
  }
}

export function markTourSeen(reason: 'completed' | 'skipped'): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, reason);
  } catch {
    // No-op on storage failure.
  }
}

export function clearTourSeen(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op.
  }
}
