import { useWorld } from '../../store/world.ts';
import { Button } from '../../ui/primitives.tsx';
import { copyDonorBlock } from './donors.tsx';
import { subtreeNames } from './groups.ts';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import type { System } from '@vtt/schema';

const DONORS = SAMPLE_SYSTEMS as System[];

export interface Starter { label: string; donor: string; group: string }

export const STARTERS: Starter[] = [
  { label: 'Характеристики к20', donor: 'dnd5e-slice', group: 'Характеристики' },
  { label: 'Хиты', donor: 'dnd5e-slice', group: 'Здоровье' },
  { label: 'Защита', donor: 'dnd5e-slice', group: 'Защита' },
  { label: 'Навыки RED', donor: 'cp-slice', group: 'Навыки' },
];

export const startersOf = (): Starter[] =>
  STARTERS.filter(starter => {
    const donor = DONORS.find(d => d.id === starter.donor);
    if (!donor) return false;
    const inside = new Set(subtreeNames(donor, starter.group));
    return donor.fields.some(field => inside.has(field.group ?? 'Без блока'));
  });

export function Starters() {
  const editSystem = useWorld(s => s.editSystem);
  const starters = startersOf();
  if (!starters.length) return null;

  return (
    <div className="inline inline--tight">
      {starters.map(starter => (
        <Button
          key={starter.label}
          size="sm"
          onClick={() => {
            const donor = DONORS.find(d => d.id === starter.donor)!;
            copyDonorBlock(editSystem, donor, starter.group);
          }}
        >
          {starter.label}
        </Button>
      ))}
    </div>
  );
}
