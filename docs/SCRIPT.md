# Walkthrough script — for recording

A 5-10 minute narration to record alongside a screen capture of the tool. Read
aloud verbatim, or paraphrase from the bullets. Bracketed notes are camera /
mouse direction — don't read them aloud. The whole thing breaks into 7 scenes
matching the in-app intro tour, plus a 30-second cold open.

> **Audience:** the second reviewer (a non-technical decision maker). Tone is
> confident but careful — the goal is for the reviewer to *trust* the output,
> not be dazzled by it.

---

## Cold open (~30 sec)

> *[Camera: full-screen on the SCConnect Help dialog open at the Glossary
> section. Pause for 2 seconds, then close it.]*

"This is the SCConnect DC Sizing Calculator — the tool we use to size
distribution centres for clients across Korea, Taiwan, Vietnam, Malaysia,
Singapore, and Indonesia. In the next ten minutes I'll show you how to take
a SKU master from a client, run it through the engine, and end up with a
sized building, a fleet plan, a labour estimate, and a block diagram you
can hand to an architect."

> *[Camera: switch to the Engagements tab.]*

"You won't need to know any code. Everything you see here also exists as a
download — Excel, PDF, PowerPoint, CSV — at the end."

---

## Scene 1 — Engagements (~45 sec)

> *[Mouse: hover over the New engagement button. Don't click yet.]*

"We start at the Engagements tab. An engagement is a single client project —
a SKU set, a region, the regional rules that apply, and the saved engine
results."

> *[Mouse: click New engagement, advance through wizard.]*

"The wizard takes four steps. First, I name it. Second, I pick the region
— let's say Malaysia. As soon as I do that, the third step pre-fills the
flags that apply: halal certification, a Surau prayer room, the Ramadan
productivity derate. Each comes with a citation — JAKIM 2018 for the
Surau ratio, the regulatory body for halal segregation."

> *[Mouse: hover the (i) icon on the halal row.]*

"This is intentional — every default in the tool can be traced back to a
source. If a reviewer pushes back on a number, we can show them where it
came from."

---

## Scene 2 — Inputs CSV upload (~60 sec)

> *[Mouse: switch to Inputs tab. Drop a CSV onto the upload area.]*

"On the Inputs tab I drop the client's SKU master — a CSV with one row per
SKU, 52 weeks of demand, and the channel mix. Twenty thousand rows
typically import in about half a second."

> *[Wait for upload to complete; the green success banner appears.]*

"Once the upload completes, the Data Quality Dashboard runs every SPEC §7
check. Fatal errors, warnings, suppressions — all surfaced before we let
the engine run."

---

## Scene 3 — Acknowledge data quality (~50 sec)

> *[Mouse: scroll down to the Data Quality Dashboard, hover the auto-fix
> toggles.]*

"There are four auto-fixes. Clamp negative weekly demand to zero — that's
common when the source WMS does returns net-out. Suppress zero-demand
SKUs — those probably shouldn't be sized for. Cap the CV outliers — one
spike week shouldn't dominate the peak uplift. Normalise the channel mix.
Each toggle has a tooltip explaining when to use it."

> *[Mouse: apply 1-2 toggles, click Apply selected fixes, then Acknowledge.]*

"Now I acknowledge. The engine refuses to run until I do — this is a hard
gate by design. It means the reviewer can't accuse me later of running on
bad data without seeing it."

---

## Scene 4 — Scenarios + Run (~75 sec)

> *[Mouse: switch to Scenarios tab.]*

"Now I'm on the Scenarios tab. I can pick an automation system — AutoStore,
Geek+, HaiPick, Quicktron, Libiao, pallet shuttle, mini-load ASRS,
pallet AGV — or leave it on Conventional pallet rack."

> *[Mouse: pick AutoStore from the dropdown.]*

"Let's say AutoStore. I press R, or click Run engine. The engine runs in a
Web Worker — five thousand SKUs in about thirty milliseconds, twenty
thousand in about a hundred and fifty."

> *[Wait for results to render.]*

"There's the feasibility verdict — feasible — and thirteen result cards
showing every step's output. Validation, throughput, slot sizing, footprint,
the two mandatory gates (clear height and seismic mass), labour, MHE,
docks, support areas, the footprint roll-up, automation override."

> *[Mouse: expand the "How it works" panel under any card, e.g. Step 7 Labour.]*

"And under each card is a 'how it works' expander — formula, inputs,
outputs, assumptions, sensitivity, and crucially, the ways the step could
be wrong. We don't hide our limitations."

---

## Scene 5 — Tornado sensitivity (~50 sec)

> *[Mouse: scroll to the bottom of the Scenarios tab. Click Run tornado.]*

"Now I press T for tornado. The engine sweeps seventeen SPEC parameters at
low and high — thirty-four variants — and ranks them by impact on
footprint and peak FTE."

> *[Wait for tornado to render. Switch metric toggle.]*

"This tells the reviewer which assumptions matter most. If 'travel
coefficient' is the top sensitivity, that's where we focus the calibration
conversation. If something at the top of the list is hatched red, that
variant is infeasible — flagging a constraint we should look at."

---

## Scene 6 — Layout (~60 sec)

> *[Mouse: switch to Layout tab.]*

"Layout tab. The block diagram is a Visio-grade SVG — eleven layers I can
toggle. Storage zones with per-zone aisle orientation. Dock doors. Support
cluster. Flow arrows — I, U, or L pattern. Fire egress — anything more than
forty-five metres from an egress is hatched red."

> *[Mouse: click a zone.]*

"Click any zone for details — label, role, dimensions, area, aisle
orientation. If a zone overflows the envelope, that gets hatched too, and
the in-canvas badge reports the magnitude. Same for any feasibility
shortfall."

> *[Mouse: hover SVG/PNG export buttons.]*

"Vector SVG for client decks; raster PNG for slides and email. Both named
after the engagement."

---

## Scene 7 — Outputs + close (~60 sec)

> *[Mouse: switch to Outputs tab.]*

"Last tab — Outputs. Five exports plus a snapshot import."

> *[Mouse: hover each card briefly.]*

"Schedule of Areas — Excel, multi-sheet. Assumptions CSV — every ops-profile
knob, ready for cross-engagement comparison. Summary report — A4 PDF, four
pages. Tornado deck — sixteen-by-nine PowerPoint with a native chart you
can edit in PPT. And the .scc snapshot — a gzipped JSON that round-trips
the whole engagement."

> *[Mouse: open the Help dialog with the ? key.]*

"Anything I haven't shown is in the Help dialog — keyboard shortcuts, tab
map, glossary, every step's formula, the consolidated 'ways it could be
wrong' panel, and the source citations. Press question mark anywhere."

---

## Outro (~30 sec)

> *[Mouse: close Help. Camera: full-screen on the Outputs tab.]*

"That's the tool. To recap: data in, validation, engine, sensitivity,
layout, exports. Every default is sourced. Every step is auditable. Every
limitation is documented in plain English. Reviewer questions get
specific, citable answers — not 'because the tool said so'."

"If you want to try it yourself, the calc lives at calc.scconnect.co.nz —
log in with your SCConnect Google or Microsoft account. Press question
mark anywhere for help. Thanks for watching."

---

## Recording notes

- **Length target:** 7-10 minutes total. If it runs over 10 min, cut Scene
  5 (tornado) — the in-app explanation is enough for first-time viewers.
- **Pace:** medium-slow. The audience is non-technical and needs a
  moment to absorb each screen.
- **Cuts:** OK to cut between scenes; don't cut mid-scene unless an obvious
  loading screen.
- **Voice:** confident, not pitchy. The product speaks for itself once the
  reviewer sees it.
- **Captions:** on. Glossary terms (PFP / CLS / VNA / ASRS / G2P) should
  show as captions when first spoken.
- **Music:** low ambient or none. Don't compete with the narration.
