# Usage — happy path

A 7-step walkthrough for the SCConnect DC Sizing Calculator. Read top-to-bottom for
your first engagement; once you know the tool, the keyboard shortcuts (`?` for the
cheatsheet) get you through it in under 10 minutes.

> Screenshot slots are marked `<!-- screenshot: … -->`. Replace as needed when
> capturing for client decks; the captions describe what the screenshot should show.

---

## 1. Sign in

Navigate to **`calc.scconnect.co.nz`**. Cloudflare Access redirects you to SSO
(Google or Microsoft, per the allowlist). After authentication you land on the
**Engagements** tab.

If the tour modal opens, walk through it once — it covers the same ground as
this doc but in 7 short pages. Click **Skip** to dismiss permanently, or
**Replay the 7-step intro tour** in the Help dialog (open with `?`) to see it
again later.

<!-- screenshot: header w/ SCConnect logo, sync pill = "no engagement", help icon visible -->

---

## 2. Create an engagement

On the Engagements tab click **New engagement**. The 4-step wizard:

1. **Identify** — engagement name (required), client name (optional).
2. **Region** — pick KR / TW / VN / MY / SG / ID, or **Custom** to disable
   regional defaults.
3. **Review defaults** — confirm the regional flags the wizard pre-applied
   (halal, Surau, Ramadan, bonded, backup gen, antechamber). Each row has an
   `(i)` icon citing the regulatory source.
4. **Create** — writes to D1 (`engagements` table) + Dexie (`engagementsLocal`,
   `opsProfiles`).

The new engagement opens automatically and the sync pill in the header turns
green (`synced`).

<!-- screenshot: wizard step 3 for MY w/ halal + Surau + Ramadan flagged -->

---

## 3. Upload your SKU master

Switch to **Inputs** (or press `2`). Drop a CSV onto the upload area, or click
**choose a file**.

The CSV must have these columns:

```
id, name, category, unitCubeCm3, unitWeightKg, caseQty,
inboundPalletId, outboundPalletId, palletTi, palletHi,
stackable, tempClass,
channel_retailB2b, channel_ecomDtc, channel_marketplace,
week_01 … week_52
```

PapaParse streams the file in 1 MiB chunks; 20 000 rows ingest in ~500 ms.
Re-upload supersedes any previous import for this engagement.

<!-- screenshot: Inputs tab showing "Imported 18,432 / 18,432 SKUs in 0.51s" success banner -->

---

## 4. Acknowledge data quality

Below the upload area, the **Data Quality Dashboard** runs Step 0 validation
automatically and shows:

- **Issues by code** — fatal / warning counts per SPEC §7 code.
- **Auto-fix actions** — four toggles (clamp negatives, suppress zero-demand,
  cap CV at 3.0, normalise channel mix). Hover the `(i)` icon on each for the
  rationale.

Apply the fixes that match your data. Click **Acknowledge** when satisfied.
The engine refuses to run until acknowledged — this is intentional so a
sceptical reviewer can't accuse you of running on bad data without seeing it.

<!-- screenshot: dashboard with 12,400 SKUs / 12,300 clean / 100 warning, halal status fix toggle on, Acknowledge enabled -->

---

## 5. Run the engine

Switch to **Scenarios** (or `5`). Pick an automation system from the dropdown
(or leave **Conventional** to size for pallet rack), then click **Run engine
on baseline** — or press `R`.

The engine runs in a Web Worker. 5 000 SKUs complete in ~36 ms; 20 000 in
~150 ms. Progress shows live as `step N/12`. When it finishes, the **Feasible
/ Infeasible** banner appears, followed by 13 result cards covering Steps
0-12.

Each result card has a collapsible **How it works** beneath — click it to see
the formula, inputs, outputs, baked-in assumptions, sensitivity, and the
**ways it could be wrong** (caveats per step).

### Optional: Run the tornado

After the baseline runs, click **Run tornado** (or press `T`). This sweeps
17 SPEC parameters at low/high (34 variants), ranks by weighted footprint +
FTE delta, hatches infeasible variants, and tells you which assumptions are
worth scrutinising hardest.

<!-- screenshot: Scenarios tab with feasible-banner, all step cards visible, tornado chart at bottom -->

---

## 6. Review the layout

Switch to **Layout** (or `7`). The block diagram shows the full DC: column
grid, storage zones (with per-zone aisle orientation), staging, dock doors,
support cluster, flow arrows, fire egress, pedestrian routes, scale, compass.

- **Layer toggles** in the sidebar show / hide each layer.
- **Flow pattern** dropdown swaps between I / U / L / custom flow shapes.
- **Click a zone** for details (label, role, dimensions, area, origin, aisle
  orientation, overflow flag).
- **SVG / PNG export** buttons at the top-right download the diagram named
  after the engagement.

If the engagement is infeasible, the in-canvas red badge AND the multi-flag
banner above the diagram report the shortfalls (slab, seismic, envelope,
clear height) with magnitudes.

<!-- screenshot: Layout tab with envelope, storage zones, docks, flow arrows, all layers visible -->

---

## 7. Download the deliverables

Switch to **Outputs** (or `6`). Five export buttons + one import button:

| Export | Format | Use |
|---|---|---|
| Schedule of Areas | `.xlsx`, ~50-100 KB | Internal review, audit handoff |
| Assumptions | `.csv`, ~5-10 KB | Cross-engagement comparison |
| Summary report | `.pdf`, A4 portrait, 4 pages | Client deliverable |
| Tornado deck | `.pptx`, 16:9, 3 slides | Client deck or client board |
| `.scc` snapshot | gzip JSON, 10-200 KB | Migration / handoff / freeze |

Each download tooltip explains the format, size, and lazy-load cost. The PDF
and PPT renderers (1.4 MB and 372 KB respectively) only download on click —
the entry chunk stays under 800 KB.

The `.scc` import button at the bottom restores an engagement from a
previously-exported snapshot — replaces every row scoped to the embedded
engagement id.

<!-- screenshot: Outputs tab with all 5 export cards + import card visible -->

---

## What to do next

- Open the **Help** dialog (`?`) for the full keyboard cheatsheet, tab map,
  glossary, per-step explainers, the consolidated "ways it could be wrong"
  panel, and the sources & citations.
- See [HOW-IT-WORKS.md](./HOW-IT-WORKS.md) for an engine-internals tour.
- See [LIMITATIONS.md](./LIMITATIONS.md) for the consolidated list of what
  the engine does NOT model.
- See [SCRIPT.md](./SCRIPT.md) for a recorder-ready narration to walk a
  reviewer through the tool on video.
