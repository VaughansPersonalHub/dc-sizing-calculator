// Hook that derives the current layout result from the engine output +
// the active engagement's building template. Memoised on the result hash
// so we don't re-run the solver until the engine produces a new result.

import { useMemo } from 'react';
import { useEngineStore } from '../../stores/engine.store';
import { useEngagementStore } from '../../stores/engagement.store';
import { useDataStore } from '../../stores/data.store';
import { runLayoutSolver } from './solver';
import type { LayoutResult } from './types';
import type { PipelineOutputs } from '../../engine/pipeline';
import type { EngineBuildingEnvelope } from '../../engine/models';
import type { BuildingTemplate } from '../../schemas/libraries';

export function useLayoutResult(): {
  layout: LayoutResult | null;
  buildingTemplate: BuildingTemplate | null;
} {
  const lastResult = useEngineStore((s) => s.lastResult) as PipelineOutputs | null;
  const lastResultHash = useEngineStore((s) => s.lastResultHash);
  const regionProfile = useEngagementStore((s) => s.regionProfile);
  const buildings = useDataStore((s) => s.libraries.buildings);

  const buildingTemplate = useMemo<BuildingTemplate | null>(() => {
    if (!regionProfile) return buildings[0] ?? null;
    return (
      buildings.find((b) => b.regionProfile === regionProfile) ??
      buildings[0] ??
      null
    );
  }, [regionProfile, buildings]);

  const layout = useMemo<LayoutResult | null>(() => {
    if (!lastResult || !buildingTemplate) return null;
    const envelope: EngineBuildingEnvelope = {
      envelope: {
        lengthM: buildingTemplate.envelope.lengthM,
        widthM: buildingTemplate.envelope.widthM,
        polygonVertices: buildingTemplate.envelope.polygonVertices,
      },
      clearHeights: {
        usableRackM: buildingTemplate.clearHeights.usableRackM,
        sprinklerClearanceM: buildingTemplate.clearHeights.sprinklerClearanceM,
      },
      floor: {
        slabLoadingTPerM2: buildingTemplate.floor.slabLoadingTPerM2,
        totalFloorAreaM2: buildingTemplate.floor.totalFloorAreaM2,
      },
      seismic: {
        designCategory: buildingTemplate.seismic.designCategory,
        allowableRatio: buildingTemplate.seismic.allowableRatio,
      },
      columnGrid: {
        spacingXM: buildingTemplate.columnGrid.spacingXM,
        spacingYM: buildingTemplate.columnGrid.spacingYM,
      },
      coldChain: {
        ambientZoneM2: buildingTemplate.coldChain.ambientZoneM2,
        chilledZoneM2: buildingTemplate.coldChain.chilledZoneM2,
        frozenZoneM2: buildingTemplate.coldChain.frozenZoneM2,
        antechamberRequired: buildingTemplate.coldChain.antechamberRequired,
        antechamberM2: buildingTemplate.coldChain.antechamberM2,
      },
      customsBonded: {
        required: buildingTemplate.customsBonded.required,
        holdAreaPct: buildingTemplate.customsBonded.holdAreaPct,
        fencedCageM2: buildingTemplate.customsBonded.fencedCageM2,
      },
      mezzanine: {
        available: buildingTemplate.mezzanine.available,
        tiers: buildingTemplate.mezzanine.tiers,
        perTierMaxM2: buildingTemplate.mezzanine.perTierMaxM2,
      },
      power: {
        backupGeneratorKva: buildingTemplate.power.backupGeneratorKva,
        gridReliabilityHoursPerDay: buildingTemplate.power.gridReliabilityHoursPerDay,
      },
    };
    return runLayoutSolver({ result: lastResult, envelope });
    // The hash captures every input that matters — when a new engine run
    // lands, lastResultHash flips and the memo recomputes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResultHash, buildingTemplate]);

  return { layout, buildingTemplate };
}
