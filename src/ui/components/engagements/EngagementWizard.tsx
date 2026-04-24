// Engagement Setup Wizard. 4 steps:
//   1. Name + client name
//   2. Region pick (6 cards + custom)
//   3. Review flags the region surfaces (halal/Surau/Ramadan/backup gen/antechamber)
//   4. Confirm → create in D1 (POST /api/engagements), write EngagementMeta +
//      OpsProfile into Dexie, open, and set as active.
//
// The wizard is fully local until step 4. On network failure during create
// we surface the error and keep the user in step 3 so they don't lose the
// form.

import { useState, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { newId } from '../../../utils/id';
import { REGION_LABELS, type RegionId } from '../../../schemas/regional';
import { REGIONAL_PROFILES } from '../../../regional/profiles';
import {
  buildDefaultOpsProfile,
  regionalFeatureFlags,
} from '../../../regional/opsProfileDefaults';
import { createEngagement, openEngagement } from '../../../sync';
import { engagementsLocalRepo, opsProfileRepo } from '../../../db/repositories';
import type { EngagementMeta } from '../../../schemas/engagement';

interface Props {
  onClose: () => void;
  onCreated: (engagementId: string) => void;
}

interface DraftState {
  name: string;
  clientName: string;
  region: RegionId | null;
  halalCertifiedRequired: boolean;
  isBonded: boolean;
}

const REGION_IDS: RegionId[] = ['KR', 'TW', 'VN', 'MY', 'SG', 'ID', 'custom'];

export function EngagementWizard({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [draft, setDraft] = useState<DraftState>({
    name: '',
    clientName: '',
    region: null,
    halalCertifiedRequired: false,
    isBonded: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flags = useMemo(
    () => (draft.region ? regionalFeatureFlags(draft.region) : null),
    [draft.region]
  );

  // When the user picks a region, auto-apply the region's halal/bonded
  // defaults. Later they can untick in step 3 without losing the region.
  function pickRegion(r: RegionId) {
    const f = regionalFeatureFlags(r);
    setDraft((d) => ({
      ...d,
      region: r,
      halalCertifiedRequired: f.halalCertifiedRequired,
      isBonded: f.customsBondedDefault,
    }));
  }

  const canNext =
    (step === 1 && draft.name.trim().length > 0) ||
    (step === 2 && draft.region !== null) ||
    (step === 3 && draft.region !== null);

  async function handleCreate() {
    if (!draft.region) return;
    setSubmitting(true);
    setError(null);
    try {
      const engagementId = newId('eng');
      const now = new Date();
      const userEmail = 'user@scconnect.co.nz'; // Overwritten by server audit; local only

      // 1. Create in D1 via API. Server returns the canonical row.
      const created = await createEngagement({
        id: engagementId,
        name: draft.name.trim(),
        clientName: draft.clientName.trim() || undefined,
        regionProfile: draft.region,
      });

      // 2. Build + persist OpsProfile locally
      const opsProfile = buildDefaultOpsProfile({
        engagementId,
        region: draft.region,
        halalCertifiedRequired: draft.halalCertifiedRequired,
      });
      await opsProfileRepo.put(opsProfile);

      // 3. Persist EngagementMeta locally so the list reflects immediately
      const meta: EngagementMeta = {
        id: engagementId,
        name: created.name,
        clientName: created.clientName ?? undefined,
        regionProfile: draft.region,
        createdAt: new Date(created.createdAt),
        createdBy: created.createdBy,
        lastModifiedAt: new Date(created.lastModifiedAt),
        lastModifiedBy: created.lastModifiedBy,
        etag: created.etag,
        status: 'active',
        skuCount: 0,
        scenarioCount: 1,
        halalCertifiedRequired: draft.halalCertifiedRequired,
        isBonded: draft.isBonded,
      };
      await engagementsLocalRepo.put(meta);

      // 4. Open (pulls blob if any; for first-time there's none, so noop)
      await openEngagement(engagementId);

      // Suppress unused-var warning on `now`/`userEmail` for future audit wiring
      void now;
      void userEmail;

      setSubmitting(false);
      onCreated(engagementId);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-card text-card-foreground rounded-lg shadow-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-base font-semibold">New engagement</h3>
            <p className="text-[11px] text-muted-foreground">
              Step {step} of 4 ·{' '}
              {step === 1
                ? 'Identify'
                : step === 2
                  ? 'Region'
                  : step === 3
                    ? 'Review defaults'
                    : 'Creating…'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent"
            aria-label="Close wizard"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 min-h-[280px]">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Engagement name *
                </label>
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Singha Vietnam DC2"
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Client name
                </label>
                <input
                  value={draft.clientName}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, clientName: e.target.value }))
                  }
                  placeholder="optional"
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-2">
              {REGION_IDS.map((r) => {
                const isActive = draft.region === r;
                const profile = r === 'custom' ? null : REGIONAL_PROFILES[r];
                const hint =
                  r === 'custom'
                    ? 'No regional defaults — configure manually'
                    : `Seismic ${profile!.seismicDesignCategory} · Pallet ${profile!.primaryInboundPalletId.replace(/_/g, ' ')}`;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => pickRegion(r)}
                    className={cn(
                      'text-left px-3 py-3 rounded-md border transition',
                      isActive
                        ? 'border-scc-gold bg-scc-charcoal text-scc-gold'
                        : 'border-border hover:bg-accent'
                    )}
                  >
                    <div className="text-sm font-medium">{REGION_LABELS[r]}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && flags && draft.region && (
            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                These flags were derived from the <strong>{REGION_LABELS[draft.region]}</strong>{' '}
                regional defaults (SPEC §6.2). Confirm or override — you can tune any of them
                later under Design Rules.
              </p>
              <FlagRow
                label="Halal certification required (zone duplication ~15% uplift)"
                checked={draft.halalCertifiedRequired}
                onChange={(b) => setDraft((d) => ({ ...d, halalCertifiedRequired: b }))}
                autoFrom={flags.halalCertifiedRequired}
              />
              <FlagRow
                label="Customs bonded (hold area, fenced cage, dedicated dock)"
                checked={draft.isBonded}
                onChange={(b) => setDraft((d) => ({ ...d, isBonded: b }))}
                autoFrom={flags.customsBondedDefault}
              />
              <ReadOnlyRow
                label="Surau (prayer room) — 15 m² per 50 Muslim staff + ablution"
                active={flags.surauRequired}
              />
              <ReadOnlyRow
                label={`Ramadan derate — ${flags.ramadanDerate.days} days × ${flags.ramadanDerate.factor}× FTE rate`}
                active={flags.ramadanDerate.active}
              />
              <ReadOnlyRow
                label="Backup generator mandatory"
                active={flags.backupGeneratorMandatory}
              />
              <ReadOnlyRow
                label="Cold-chain ante-chamber default (tropical)"
                active={flags.tempAntechamberRequired}
              />
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground py-10">
              {submitting && <p>Creating engagement…</p>}
              {error && (
                <div className="w-full px-3 py-2 rounded-md bg-destructive/10 text-destructive border border-destructive/30">
                  Create failed: {error}
                </div>
              )}
              {!submitting && !error && (
                <p>Review complete. Creating…</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));
            }}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 && (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-scc-charcoal text-scc-gold disabled:opacity-40"
            >
              Next
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              disabled={!canNext || submitting}
              onClick={() => {
                setStep(4);
                void handleCreate();
              }}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-scc-charcoal text-scc-gold disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Create engagement
            </button>
          )}
          {step === 4 && error && (
            <button
              type="button"
              onClick={() => {
                setStep(3);
                setError(null);
              }}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border"
            >
              Back to review
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FlagRow({
  label,
  checked,
  onChange,
  autoFrom,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  autoFrom: boolean;
}) {
  return (
    <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-scc-gold"
      />
      <div className="flex-1">
        <div>{label}</div>
        {autoFrom && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Auto-enabled by region default
          </div>
        )}
      </div>
    </label>
  );
}

function ReadOnlyRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded',
        active ? 'text-foreground' : 'text-muted-foreground line-through opacity-60'
      )}
    >
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          active ? 'bg-scc-gold' : 'bg-muted-foreground'
        )}
      />
      {label}
    </div>
  );
}
