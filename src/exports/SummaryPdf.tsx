// Phase 8 — Summary report PDF (react-pdf).
//
// SPEC §12 deliverable: a presentation-ready PDF with the engagement's
// assumptions, key metrics, schedule of areas summary, and (when
// available) the tornado top-N sensitivity ranking.
//
// Pages:
//   1. Cover           Engagement, region, generation timestamp, verdict
//   2. Key Metrics     GFA, FTE, MHE, doors, feasibility detail
//   3. Schedule        Storage zones + support areas summary tables
//   4. Tornado (opt.)  Top-10 most-sensitive params from latest tornado run
//
// react-pdf renders to a Blob via the wrapper in pdf-renderer.ts.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PipelineOutputs } from '../engine/pipeline';
import type { TornadoResult } from '../engine/tornado';

export interface SummaryPdfProps {
  result: PipelineOutputs;
  engagementName?: string;
  regionProfile?: string;
  generatedAt?: string;
  /** Optional latest tornado run output. When supplied, an extra page
   *  surfaces the ranked sensitivity table. */
  tornado?: TornadoResult | null;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#0f172a',
  },
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  small: { fontSize: 8, color: '#64748b', marginBottom: 4 },
  paragraph: { marginBottom: 6, lineHeight: 1.4 },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 3,
    fontSize: 9,
    color: 'white',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  badgePass: { backgroundColor: '#16a34a' },
  badgeFail: { backgroundColor: '#dc2626' },
  table: { display: 'flex', flexDirection: 'column', marginTop: 4, marginBottom: 8 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1', paddingVertical: 3 },
  rowHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#0f172a', paddingVertical: 3 },
  rowTotal: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#0f172a', paddingVertical: 3 },
  cellLabel: { flex: 2, paddingRight: 4 },
  cellValue: { flex: 1, textAlign: 'right' },
  cellNumeric: { flex: 1, textAlign: 'right', fontFamily: 'Courier' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: '#94a3b8',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export function SummaryPdf({
  result,
  engagementName,
  regionProfile,
  generatedAt,
  tornado,
}: SummaryPdfProps) {
  const generated = generatedAt ?? result.meta.completedAt;
  return (
    <Document>
      <CoverPage
        result={result}
        engagementName={engagementName}
        regionProfile={regionProfile}
        generatedAt={generated}
      />
      <KeyMetricsPage result={result} />
      <SchedulePage result={result} />
      {tornado && tornado.rows.length > 0 && <TornadoPage tornado={tornado} />}
    </Document>
  );
}

function CoverPage({
  result,
  engagementName,
  regionProfile,
  generatedAt,
}: {
  result: PipelineOutputs;
  engagementName?: string;
  regionProfile?: string;
  generatedAt: string;
}) {
  const overall = result.feasibility.overall;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.small}>SCConnect · DC Sizing Calculator</Text>
      <Text style={styles.h1}>{engagementName ?? 'Engagement'}</Text>
      <Text style={styles.paragraph}>
        Region: {regionProfile ?? '—'} · Generated {generatedAt}
      </Text>

      <Text style={styles.h2}>Engagement summary</Text>
      <Text style={styles.paragraph}>
        SKUs in scope: {result.meta.skuCount.toLocaleString()} ·
        Suppressed (Step 0): {result.meta.suppressedCount.toLocaleString()} ·
        Engine duration: {round1(result.meta.durationMs)} ms
      </Text>

      <Text style={styles.h2}>Feasibility verdict</Text>
      <Text style={[styles.badge, overall ? styles.badgePass : styles.badgeFail]}>
        {overall ? 'PASS — meets all gates' : 'FAIL — see flags below'}
      </Text>
      <View style={styles.table}>
        <FeasibilityRow label="Clear height (Step 4.5)" pass={result.feasibility.clearHeightOk} detail={
          `${round0(result.step4_5.requiredRackHeightMm)} mm req · ${round0(result.step4_5.usableRackHeightMm)} mm avail`
        } />
        <FeasibilityRow label="Seismic mass (Step 4.6)" pass={result.feasibility.seismicOk} detail={
          `${round0(result.step4_6.seismicMassT)} t vs ${round0(result.step4_6.allowableMassT)} t allowable`
        } />
        <FeasibilityRow label="Slab UDL (Step 11)" pass={result.feasibility.slabOk} detail={
          `${round1(result.step11.structural.staticSlabUdlTPerM2)} t/m² vs ${round1(result.step11.structural.slabLoadingTPerM2)} t/m²`
        } />
        <FeasibilityRow label="Envelope fit (Step 11)" pass={result.feasibility.envelopeOk} detail={
          result.step11.structural.overEnvelope
            ? `over by ${round0(result.step11.structural.envelopeShortfallM2)} m²`
            : 'within envelope'
        } />
      </View>

      <Footer page="1" />
    </Page>
  );
}

function FeasibilityRow({ label, pass, detail }: { label: string; pass: boolean; detail: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.cellLabel]}>{label}</Text>
      <Text style={[{ flex: 0.6 }, pass ? { color: '#16a34a' } : { color: '#dc2626' }]}>
        {pass ? 'pass' : 'fail'}
      </Text>
      <Text style={[styles.cellLabel, { flex: 2 }]}>{detail}</Text>
    </View>
  );
}

function KeyMetricsPage({ result }: { result: PipelineOutputs }) {
  const r = result.step11.rollup;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Key metrics</Text>

      <Text style={styles.h2}>Footprint</Text>
      <View style={styles.table}>
        <KvRow label="Operational (incl. halal uplift)" value={`${round0(r.operationalM2).toLocaleString()} m²`} />
        <KvRow label="Office + amenities" value={`${round0(r.officeAndAmenitiesM2).toLocaleString()} m²`} />
        <KvRow label="Building GFA" value={`${round0(r.buildingFootprintGfaM2).toLocaleString()} m²`} />
        <KvRow label="Canopy" value={`${round0(r.canopyAreaM2).toLocaleString()} m²`} />
        <KvRow label="Site coverage" value={`${round0(r.siteCoverageM2).toLocaleString()} m²`} />
        <KvRow label="Site area required" value={`${round0(r.siteAreaM2).toLocaleString()} m²`} />
        <KvRow label="Soft space (phase 2)" value={`${round0(r.softSpace.totalM2).toLocaleString()} m²`} />
        {r.automationSwapped && (
          <KvRow label="Automation savings" value={`${round0(r.automationSavingsM2).toLocaleString()} m²`} />
        )}
      </View>

      <Text style={styles.h2}>Labour</Text>
      <View style={styles.table}>
        <KvRow label="Total peak FTE" value={round1(result.step7.totalPeakFte).toString()} />
        <KvRow label="Total base FTE" value={round1(result.step7.totalBaseFte).toString()} />
        <KvRow label="Availability factor" value={round3(result.step7.availability).toString()} />
        {result.step7.ramadanAnnualImpact > 0 && (
          <KvRow label="Ramadan annual impact" value={`${(result.step7.ramadanAnnualImpact * 100).toFixed(1)}%`} />
        )}
      </View>

      <Text style={styles.h2}>MHE + docks</Text>
      <View style={styles.table}>
        <KvRow label="Total MHE units" value={result.step8.totalUnits.toString()} />
        <KvRow label="Charging footprint" value={`${round0(result.step8.totalChargingFootprintM2).toLocaleString()} m²`} />
        <KvRow label="Charging kVA" value={`${round0(result.step8.totalChargingKva).toLocaleString()} kVA`} />
        <KvRow label="Inbound doors" value={result.step9.inbound.doorsRequired.toString()} />
        <KvRow label="Outbound doors" value={result.step9.outbound.doorsRequired.toString()} />
        <KvRow label="Staging total" value={`${round0(result.step9.staging.totalM2).toLocaleString()} m²`} />
      </View>

      <Footer page="2" />
    </Page>
  );
}

function SchedulePage({ result }: { result: PipelineOutputs }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Schedule of areas</Text>

      <Text style={styles.h2}>Storage zones</Text>
      <View style={styles.table}>
        <View style={styles.rowHeader}>
          <Text style={styles.cellLabel}>Zone</Text>
          <Text style={styles.cellNumeric}>Bays</Text>
          <Text style={styles.cellNumeric}>Width m</Text>
          <Text style={styles.cellNumeric}>Depth m</Text>
          <Text style={styles.cellNumeric}>Aligned m²</Text>
        </View>
        {result.step5.zones.map((z) => (
          <View style={styles.row} key={z.zone}>
            <Text style={styles.cellLabel}>{z.zone}</Text>
            <Text style={styles.cellNumeric}>{z.alignedBays.toLocaleString()}</Text>
            <Text style={styles.cellNumeric}>{round1(z.zoneWidthRawM)}</Text>
            <Text style={styles.cellNumeric}>{round1(z.zoneDepthRawM)}</Text>
            <Text style={styles.cellNumeric}>{round0(z.alignedAreaM2).toLocaleString()}</Text>
          </View>
        ))}
        <View style={styles.rowTotal}>
          <Text style={styles.cellLabel}>TOTAL</Text>
          <Text style={styles.cellNumeric}> </Text>
          <Text style={styles.cellNumeric}> </Text>
          <Text style={styles.cellNumeric}> </Text>
          <Text style={styles.cellNumeric}>{round0(result.step5.totalAlignedAreaM2).toLocaleString()}</Text>
        </View>
      </View>

      <Text style={styles.h2}>Support areas</Text>
      <View style={styles.table}>
        {nonZeroSupportEntries(result).map(([label, value]) => (
          <KvRow key={label} label={label} value={`${round0(value).toLocaleString()} m²`} />
        ))}
        <View style={styles.rowTotal}>
          <Text style={styles.cellLabel}>Total support footprint</Text>
          <Text style={styles.cellValue}>{round0(result.step10.totalSupportM2).toLocaleString()} m²</Text>
        </View>
      </View>

      <Footer page="3" />
    </Page>
  );
}

function TornadoPage({ tornado }: { tornado: TornadoResult }) {
  const top = tornado.rows.slice(0, 10);
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Tornado — top sensitivities</Text>
      <Text style={styles.paragraph}>
        Baseline footprint {round0(tornado.baseline.footprintM2).toLocaleString()} m² ·
        baseline peak FTE {round1(tornado.baseline.peakFte)} ·
        feasible variants {tornado.feasibleVariantCount} / infeasible {tornado.infeasibleVariantCount}
      </Text>
      <View style={styles.table}>
        <View style={styles.rowHeader}>
          <Text style={[styles.cellLabel, { flex: 2.6 }]}>Parameter</Text>
          <Text style={styles.cellNumeric}>Δ low (m²)</Text>
          <Text style={styles.cellNumeric}>Δ high (m²)</Text>
          <Text style={styles.cellNumeric}>Δ low FTE</Text>
          <Text style={styles.cellNumeric}>Δ high FTE</Text>
        </View>
        {top.map((row) => (
          <View style={styles.row} key={row.paramId}>
            <Text style={[styles.cellLabel, { flex: 2.6 }]}>{row.label} ({row.deltaLabel})</Text>
            <Text style={styles.cellNumeric}>{round0(row.footprintDelta.low).toLocaleString()}</Text>
            <Text style={styles.cellNumeric}>{round0(row.footprintDelta.high).toLocaleString()}</Text>
            <Text style={styles.cellNumeric}>{round1(row.fteDelta.low)}</Text>
            <Text style={styles.cellNumeric}>{round1(row.fteDelta.high)}</Text>
          </View>
        ))}
      </View>
      <Footer page="4" />
    </Page>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

function Footer({ page }: { page: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>SCConnect · DC Sizing Calculator</Text>
      <Text>Page {page}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonZeroSupportEntries(result: PipelineOutputs): [string, number][] {
  const a = result.step10.areas;
  const all: [string, number][] = [
    ['Office', a.office],
    ['Amenities', a.amenities],
    ['Training', a.training],
    ['First aid', a.firstAid],
    ['Surau (worship)', a.surau],
    ['Surau ablution', a.ablution],
    ['Customs hold', a.customs],
    ['Customs cage', a.customsCage],
    ['VAS', a.vas],
    ['Returns', a.returns],
    ['QC hold', a.qc],
    ['DG cage', a.dg],
    ['Pack bench', a.packBench],
    ['Empty pallet store', a.emptyPallet],
    ['Waste', a.waste],
    ['Cold-chain antechamber', a.tempAntechamber],
    ['Battery / charging', a.battery],
    ['Lithium kVA buffer', a.lithiumKvaBufferM2],
  ];
  return all.filter(([, v]) => v > 0);
}

function round0(n: number): number {
  return Math.round(n);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
