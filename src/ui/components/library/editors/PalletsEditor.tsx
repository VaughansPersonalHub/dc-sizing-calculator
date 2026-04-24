import { useMemo } from 'react';
import { useDataStore } from '../../../../stores/data.store';
import { palletsRepo } from '../../../../db/repositories';
import { LibraryTable, type EditableColumn } from '../LibraryTable';
import type { PalletStandard } from '../../../../schemas/libraries';

export function PalletsEditor() {
  const rows = useDataStore((s) => s.libraries.pallets);

  const columns = useMemo<EditableColumn<PalletStandard>[]>(
    () => [
      { accessorKey: 'pallet_id', header: 'Pallet ID', meta: { kind: 'text' } },
      { accessorKey: 'name', header: 'Name', meta: { kind: 'text' } },
      {
        id: 'region',
        header: 'Region',
        accessorFn: (r) => r.region.join(', '),
        meta: { kind: 'readonly' },
      },
      {
        id: 'length',
        header: 'Length mm',
        accessorFn: (r) => r.dimensionsMm.length,
        meta: { kind: 'readonly', align: 'right' },
      },
      {
        id: 'width',
        header: 'Width mm',
        accessorFn: (r) => r.dimensionsMm.width,
        meta: { kind: 'readonly', align: 'right' },
      },
      {
        id: 'height',
        header: 'Height mm',
        accessorFn: (r) => r.dimensionsMm.height,
        meta: { kind: 'readonly', align: 'right' },
      },
      {
        accessorKey: 'maxLoadKg',
        header: 'Max load kg',
        meta: { kind: 'number', align: 'right' },
      },
      {
        accessorKey: 'emptyWeightKg',
        header: 'Empty kg',
        meta: { kind: 'number', align: 'right', step: 0.1 },
      },
      {
        accessorKey: 'typicalCubeM3',
        header: 'Cube m³',
        meta: { kind: 'number', align: 'right', step: 0.01 },
      },
      {
        accessorKey: 'fitsContainer40ftHc',
        header: '40HC',
        meta: { kind: 'number', align: 'right' },
      },
      {
        accessorKey: 'fitsContainer20ft',
        header: '20ft',
        meta: { kind: 'number', align: 'right' },
      },
      { accessorKey: 'isoReference', header: 'ISO ref', meta: { kind: 'text' } },
    ],
    []
  );

  return (
    <LibraryTable<PalletStandard, string>
      rows={rows}
      columns={columns}
      getRowId={(r) => r.pallet_id}
      onSave={(r) => palletsRepo.upsert(r).then(() => undefined)}
      onDelete={(id) => palletsRepo.remove(id)}
      onResetToSeed={() => palletsRepo.resetToSeed()}
      onAdd={() => newPalletTemplate(rows)}
    />
  );
}

function newPalletTemplate(rows: PalletStandard[]): PalletStandard {
  const id = nextId('custom_pallet', rows.map((r) => r.pallet_id));
  return {
    pallet_id: id,
    name: 'New pallet standard',
    region: [],
    dimensionsMm: { length: 1200, width: 1000, height: 150 },
    maxLoadKg: 1000,
    emptyWeightKg: 25,
    typicalCubeM3: 1.44,
    fitsContainer40ftHc: 40,
    fitsContainer20ft: 20,
  };
}

function nextId(prefix: string, existing: string[]): string {
  let n = 1;
  while (existing.includes(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
