import type { RegionId } from '../schemas/regional';

/**
 * Per-region defaults per SPEC §6.2. These seed Ops Profile + Building Library
 * when a new engagement is created. User can override any default in the
 * Engagement Setup Wizard.
 */
export interface RegionalProfile {
  id: RegionId;
  label: string;
  primaryInboundPalletId: string;
  primaryOutboundPalletId: string;
  mixedPalletCommon: 'No' | 'Low' | 'Medium' | 'High' | 'Yes';
  seismicDesignCategory: string;
  seismicSoilClass: string;
  crossAisleSpacingM: number;
  crossAisleWidthM: number;
  typhoonDesignWindKmh: number;
  floodPlinthHeightM: number;
  monsoonDrainageMmPerHr: number;
  officeM2PerFte: number;
  halalCertification: 'No' | 'Partial' | 'Yes (JAKIM)' | 'Yes (MUI)';
  surauRequired: boolean;
  ramadanDerate: { active: boolean; factor: number; days: number };
  shiftsPerDay: number;
  hoursPerShift: number;
  workDaysPerWeek: number;
  publicHolidaysPerYear: number;
  coldChainAntechamberRequired: boolean;
  dehumidificationAllowancePct: number;
  customsBondedCommon: 'Low' | 'Medium' | 'High';
  tieredMezzanineCommon: 'Low' | 'Yes' | 'Yes (2-tier)' | 'Yes (3-tier)';
  gridReliabilityHoursPerDay: number;
  backupGeneratorMandatory: boolean;
  muslimWorkforcePct: number; // default assumption; user-editable
}

export const REGIONAL_PROFILES: Record<Exclude<RegionId, 'custom'>, RegionalProfile> = {
  KR: {
    id: 'KR',
    label: 'Korea',
    primaryInboundPalletId: 'T11_1100x1100',
    primaryOutboundPalletId: 'T11_1100x1100',
    mixedPalletCommon: 'No',
    seismicDesignCategory: 'C',
    seismicSoilClass: 'B',
    crossAisleSpacingM: 22,
    crossAisleWidthM: 2.4,
    typhoonDesignWindKmh: 180,
    floodPlinthHeightM: 0.3,
    monsoonDrainageMmPerHr: 80,
    officeM2PerFte: 9,
    halalCertification: 'No',
    surauRequired: false,
    ramadanDerate: { active: false, factor: 1, days: 0 },
    shiftsPerDay: 2,
    hoursPerShift: 8,
    workDaysPerWeek: 5.5,
    publicHolidaysPerYear: 15,
    coldChainAntechamberRequired: false,
    dehumidificationAllowancePct: 0.02,
    customsBondedCommon: 'Medium',
    tieredMezzanineCommon: 'Yes (2-tier)',
    gridReliabilityHoursPerDay: 24,
    backupGeneratorMandatory: false,
    muslimWorkforcePct: 0,
  },
  TW: {
    id: 'TW',
    label: 'Taiwan',
    primaryInboundPalletId: 'T11_1100x1100',
    primaryOutboundPalletId: 'T11_1100x1100',
    mixedPalletCommon: 'Yes',
    seismicDesignCategory: 'D',
    seismicSoilClass: 'C',
    crossAisleSpacingM: 22,
    crossAisleWidthM: 2.4,
    typhoonDesignWindKmh: 250,
    floodPlinthHeightM: 0.4,
    monsoonDrainageMmPerHr: 130,
    officeM2PerFte: 9,
    halalCertification: 'No',
    surauRequired: false,
    ramadanDerate: { active: false, factor: 1, days: 0 },
    shiftsPerDay: 2,
    hoursPerShift: 8,
    workDaysPerWeek: 5.5,
    publicHolidaysPerYear: 11,
    coldChainAntechamberRequired: false,
    dehumidificationAllowancePct: 0.03,
    customsBondedCommon: 'Low',
    tieredMezzanineCommon: 'Yes',
    gridReliabilityHoursPerDay: 24,
    backupGeneratorMandatory: false,
    muslimWorkforcePct: 0,
  },
  VN: {
    id: 'VN',
    label: 'Vietnam',
    primaryInboundPalletId: 'PAL_1200x1000',
    primaryOutboundPalletId: 'T11_1100x1100',
    mixedPalletCommon: 'Yes',
    seismicDesignCategory: 'B',
    seismicSoilClass: 'D',
    crossAisleSpacingM: 22,
    crossAisleWidthM: 2.4,
    typhoonDesignWindKmh: 220,
    floodPlinthHeightM: 0.8,
    monsoonDrainageMmPerHr: 150,
    officeM2PerFte: 10,
    halalCertification: 'No',
    surauRequired: false,
    ramadanDerate: { active: false, factor: 1, days: 0 },
    shiftsPerDay: 2,
    hoursPerShift: 10,
    workDaysPerWeek: 6,
    publicHolidaysPerYear: 11,
    coldChainAntechamberRequired: true,
    dehumidificationAllowancePct: 0.05,
    customsBondedCommon: 'High',
    tieredMezzanineCommon: 'Low',
    gridReliabilityHoursPerDay: 22,
    backupGeneratorMandatory: true,
    muslimWorkforcePct: 0,
  },
  MY: {
    id: 'MY',
    label: 'Malaysia',
    primaryInboundPalletId: 'T11_1100x1100',
    primaryOutboundPalletId: 'T11_1100x1100',
    mixedPalletCommon: 'Low',
    seismicDesignCategory: 'A-B',
    seismicSoilClass: 'B',
    crossAisleSpacingM: 22,
    crossAisleWidthM: 2.4,
    typhoonDesignWindKmh: 130,
    floodPlinthHeightM: 0.5,
    monsoonDrainageMmPerHr: 120,
    officeM2PerFte: 10,
    halalCertification: 'Yes (JAKIM)',
    surauRequired: true,
    ramadanDerate: { active: true, factor: 0.82, days: 30 },
    shiftsPerDay: 2,
    hoursPerShift: 10,
    workDaysPerWeek: 6,
    publicHolidaysPerYear: 14,
    coldChainAntechamberRequired: true,
    dehumidificationAllowancePct: 0.05,
    customsBondedCommon: 'High',
    tieredMezzanineCommon: 'Low',
    gridReliabilityHoursPerDay: 24,
    backupGeneratorMandatory: false,
    muslimWorkforcePct: 0.7,
  },
  SG: {
    id: 'SG',
    label: 'Singapore',
    primaryInboundPalletId: 'T11_1100x1100',
    primaryOutboundPalletId: 'T11_1100x1100',
    mixedPalletCommon: 'Medium',
    seismicDesignCategory: 'A',
    seismicSoilClass: 'B',
    crossAisleSpacingM: 20, // SCDF mandate
    crossAisleWidthM: 2.4,
    typhoonDesignWindKmh: 130,
    floodPlinthHeightM: 0.3,
    monsoonDrainageMmPerHr: 100,
    officeM2PerFte: 7,
    halalCertification: 'Partial',
    surauRequired: false,
    ramadanDerate: { active: true, factor: 0.9, days: 30 },
    shiftsPerDay: 3,
    hoursPerShift: 8,
    workDaysPerWeek: 6,
    publicHolidaysPerYear: 11,
    coldChainAntechamberRequired: true,
    dehumidificationAllowancePct: 0.04,
    customsBondedCommon: 'High',
    tieredMezzanineCommon: 'Yes (3-tier)',
    gridReliabilityHoursPerDay: 24,
    backupGeneratorMandatory: false,
    muslimWorkforcePct: 0.15,
  },
  ID: {
    id: 'ID',
    label: 'Indonesia',
    primaryInboundPalletId: 'PAL_1200x1000',
    primaryOutboundPalletId: 'T11_1100x1100',
    mixedPalletCommon: 'Yes',
    seismicDesignCategory: 'D-E',
    seismicSoilClass: 'D',
    crossAisleSpacingM: 22,
    crossAisleWidthM: 2.4,
    typhoonDesignWindKmh: 140,
    floodPlinthHeightM: 0.8,
    monsoonDrainageMmPerHr: 150,
    officeM2PerFte: 10,
    halalCertification: 'Yes (MUI)',
    surauRequired: true,
    ramadanDerate: { active: true, factor: 0.82, days: 30 },
    shiftsPerDay: 2,
    hoursPerShift: 10,
    workDaysPerWeek: 6,
    publicHolidaysPerYear: 16,
    coldChainAntechamberRequired: true,
    dehumidificationAllowancePct: 0.05,
    customsBondedCommon: 'High',
    tieredMezzanineCommon: 'Low',
    gridReliabilityHoursPerDay: 22,
    backupGeneratorMandatory: true,
    muslimWorkforcePct: 0.87,
  },
};

export function getRegionalProfile(id: RegionId): RegionalProfile | null {
  if (id === 'custom') return null;
  return REGIONAL_PROFILES[id];
}
