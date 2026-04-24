// SKU CSV ingestion. Streams through PapaParse in chunks so the UI
// stays responsive on 20k+ row files, validates every row at the
// boundary with Zod, builds a Float32Array of the 52-week demand curve,
// and hands batches to the SKU repository for bulk insertion into Dexie.
//
// CSV schema (header row required):
//   id,name,category,[subCategory],unitCubeCm3,unitWeightKg,caseQty,
//   inboundPalletId,outboundPalletId,palletTi,palletHi,stackable,
//   tempClass,[dgClass],[halalStatus],
//   channel_retailB2b,channel_ecomDtc,channel_marketplace,
//   [isEventDrivenSeasonal],[seasonalEventTag],
//   [slotTypeOverride],[velocityOverride],
//   week_01,week_02,...,week_52
//
// Case sensitivity: header match is case-sensitive. Missing week_01..52
// columns default the respective slots to 0 (warned at row level).

import Papa, { type ParseResult, type Parser } from 'papaparse';
import {
  SkuCsvRowSchema,
  type SkuCsvRow,
  type SkuRecord,
  type ValidationError,
  type ChannelMix,
} from '../schemas/sku';

export interface IngestionStats {
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  errors: ValidationError[];
  durationMs: number;
  firstRejectedIds: string[];
}

export interface IngestionProgress {
  phase: 'parsing' | 'persisting' | 'done';
  parsedRows: number;
  acceptedRows: number;
  rejectedRows: number;
}

export interface IngestOptions {
  engagementId: string;
  chunkSize?: number;
  /** Maximum validation errors kept in memory before dropping further entries. */
  maxErrors?: number;
  onProgress?: (p: IngestionProgress) => void;
  onBatch?: (batch: SkuRecord[]) => Promise<void>;
}

export type CsvSource = File | string;

const DEFAULT_CHUNK_BYTES = 1 << 20; // 1 MiB
const DEFAULT_MAX_ERRORS = 500;

type RawRow = Record<string, string>;

export async function ingestSkuCsv(
  source: CsvSource,
  opts: IngestOptions
): Promise<IngestionStats> {
  const start = performance.now();
  const stats: IngestionStats = {
    totalRows: 0,
    acceptedRows: 0,
    rejectedRows: 0,
    errors: [],
    durationMs: 0,
    firstRejectedIds: [],
  };
  const maxErrors = opts.maxErrors ?? DEFAULT_MAX_ERRORS;
  const onProgress = opts.onProgress;
  const onBatch = opts.onBatch;

  const flushProgress = (phase: IngestionProgress['phase']) => {
    onProgress?.({
      phase,
      parsedRows: stats.totalRows,
      acceptedRows: stats.acceptedRows,
      rejectedRows: stats.rejectedRows,
    });
  };

  await new Promise<void>((resolve, reject) => {
    Papa.parse<RawRow>(source as File, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // we coerce via Zod; avoid surprising "1.0" → 1 drift
      chunkSize: opts.chunkSize ?? DEFAULT_CHUNK_BYTES,
      worker: false,
      chunk: async (results: ParseResult<RawRow>, parser: Parser) => {
        parser.pause();
        try {
          const batch: SkuRecord[] = [];
          for (const raw of results.data) {
            stats.totalRows += 1;
            const outcome = parseRow(raw, opts.engagementId);
            if (outcome.ok) {
              batch.push(outcome.sku);
              stats.acceptedRows += 1;
            } else {
              stats.rejectedRows += 1;
              if (stats.errors.length < maxErrors) stats.errors.push(...outcome.errors);
              if (stats.firstRejectedIds.length < 20) {
                stats.firstRejectedIds.push(outcome.skuId);
              }
            }
          }
          if (batch.length && onBatch) {
            flushProgress('persisting');
            await onBatch(batch);
          }
          flushProgress('parsing');
        } catch (err) {
          parser.abort();
          reject(err);
          return;
        }
        parser.resume();
      },
      complete: () => {
        resolve();
      },
      error: (err) => {
        reject(err);
      },
    });
  });

  stats.durationMs = performance.now() - start;
  flushProgress('done');
  return stats;
}

type ParseOutcome =
  | { ok: true; sku: SkuRecord }
  | { ok: false; skuId: string; errors: ValidationError[] };

function parseRow(raw: RawRow, engagementId: string): ParseOutcome {
  const errors: ValidationError[] = [];
  const skuId = String(raw.id ?? '').trim() || '(blank)';

  const channelMix: ChannelMix = {
    retailB2bPct: num(raw.channel_retailB2b),
    ecomDtcPct: num(raw.channel_ecomDtc),
    marketplacePct: num(raw.channel_marketplace),
  };

  const csvInput: Partial<SkuCsvRow> = {
    id: String(raw.id ?? '').trim(),
    name: String(raw.name ?? '').trim(),
    category: String(raw.category ?? '').trim(),
    subCategory: raw.subCategory ? String(raw.subCategory).trim() : undefined,
    unitCubeCm3: num(raw.unitCubeCm3),
    unitWeightKg: num(raw.unitWeightKg),
    caseQty: int(raw.caseQty),
    inboundPalletId: String(raw.inboundPalletId ?? '').trim(),
    outboundPalletId: String(raw.outboundPalletId ?? '').trim(),
    palletTi: int(raw.palletTi),
    palletHi: int(raw.palletHi),
    stackable: bool(raw.stackable, true),
    tempClass: asTempClass(raw.tempClass),
    dgClass: raw.dgClass ? String(raw.dgClass).trim() : 'none',
    halalStatus: asHalal(raw.halalStatus),
    channelMix,
    isEventDrivenSeasonal: bool(raw.isEventDrivenSeasonal, false),
    seasonalEventTag: raw.seasonalEventTag ? asSeasonalTag(raw.seasonalEventTag) : undefined,
    slotTypeOverride: raw.slotTypeOverride ? asSlotType(raw.slotTypeOverride) : undefined,
    velocityOverride: raw.velocityOverride ? asVelocity(raw.velocityOverride) : undefined,
  };

  const validated = SkuCsvRowSchema.safeParse(csvInput);
  if (!validated.success) {
    for (const issue of validated.error.issues) {
      errors.push({
        skuId,
        field: issue.path.join('.') || '(row)',
        value: raw,
        code: 'NEGATIVE_DEMAND', // catchall until row-level codes land in Step 0
        message: issue.message,
        autoFixable: false,
      });
    }
    return { ok: false, skuId, errors };
  }

  const { weeklyUnits, weeksOnFile, weeklyErrors } = buildWeeklyUnits(raw, skuId);
  if (weeklyErrors.length) errors.push(...weeklyErrors);
  if (weeklyErrors.some((e) => e.code === 'NEGATIVE_DEMAND')) {
    return { ok: false, skuId, errors };
  }

  const sku: SkuRecord = {
    id: validated.data.id,
    engagementId,
    name: validated.data.name,
    category: validated.data.category,
    subCategory: validated.data.subCategory,
    weeklyUnits,
    weeksOnFile,
    unitCubeCm3: validated.data.unitCubeCm3,
    unitWeightKg: validated.data.unitWeightKg,
    caseQty: validated.data.caseQty,
    inboundPalletId: validated.data.inboundPalletId,
    outboundPalletId: validated.data.outboundPalletId,
    palletTi: validated.data.palletTi,
    palletHi: validated.data.palletHi,
    stackable: validated.data.stackable,
    tempClass: validated.data.tempClass,
    dgClass: validated.data.dgClass,
    halalStatus: validated.data.halalStatus,
    channelMix: validated.data.channelMix,
    isEventDrivenSeasonal: validated.data.isEventDrivenSeasonal,
    seasonalEventTag: validated.data.seasonalEventTag,
    slotTypeOverride: validated.data.slotTypeOverride,
    velocityOverride: validated.data.velocityOverride,
    validationStatus: errors.length ? 'warning' : 'clean',
    validationIssues: errors,
  };

  return { ok: true, sku };
}

function buildWeeklyUnits(
  raw: RawRow,
  skuId: string
): { weeklyUnits: Float32Array; weeksOnFile: number; weeklyErrors: ValidationError[] } {
  const arr = new Float32Array(52);
  let weeksOnFile = 0;
  const weeklyErrors: ValidationError[] = [];
  for (let i = 0; i < 52; i++) {
    const key = `week_${String(i + 1).padStart(2, '0')}`;
    const v = raw[key];
    if (v === undefined || v === '') {
      arr[i] = 0;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      arr[i] = 0;
      weeklyErrors.push({
        skuId,
        field: key,
        value: v,
        code: 'NEGATIVE_DEMAND',
        message: `non-numeric weekly demand: ${v}`,
        autoFixable: false,
      });
      continue;
    }
    if (n < 0) {
      arr[i] = 0;
      weeklyErrors.push({
        skuId,
        field: key,
        value: v,
        code: 'NEGATIVE_DEMAND',
        message: `negative weekly demand: ${n}`,
        autoFixable: true,
        suggestedFix: 'set to 0',
      });
      continue;
    }
    arr[i] = n;
    if (n > 0) weeksOnFile += 1;
  }
  return { weeklyUnits: arr, weeksOnFile, weeklyErrors };
}

// --- Coercion helpers (deliberately permissive; Zod is the safety net) ---

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function int(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : NaN;
}

function bool(v: unknown, dflt: boolean): boolean {
  if (v === undefined || v === null || v === '') return dflt;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return dflt;
}

function asTempClass(v: unknown): SkuCsvRow['tempClass'] {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'ambient' || s === 'chilled' || s === 'frozen' || s === 'controlled') return s;
  return 'ambient';
}

function asHalal(v: unknown): SkuCsvRow['halalStatus'] {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'halal' || s === 'non-halal' || s === 'pork' || s === 'alcohol') return s;
  return 'unclassified';
}

function asSeasonalTag(v: unknown): SkuCsvRow['seasonalEventTag'] {
  const s = String(v).trim().toLowerCase();
  const allowed = ['lunar_new_year', 'ramadan', 'diwali', 'tet', 'chuseok', 'christmas', 'other'];
  return (allowed.includes(s) ? s : 'other') as SkuCsvRow['seasonalEventTag'];
}

function asSlotType(v: unknown): SkuCsvRow['slotTypeOverride'] {
  const s = String(v).trim().toUpperCase();
  if (s === 'PFP' || s === 'CLS' || s === 'SHELF' || s === 'AUTO') {
    return s === 'SHELF' ? 'Shelf' : (s as SkuCsvRow['slotTypeOverride']);
  }
  return undefined;
}

function asVelocity(v: unknown): SkuCsvRow['velocityOverride'] {
  const s = String(v).trim().toUpperCase();
  if (s === 'A' || s === 'B' || s === 'C' || s === 'D') return s;
  return undefined;
}
