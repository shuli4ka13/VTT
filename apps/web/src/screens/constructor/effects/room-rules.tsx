import { useWorld } from '../../../store/world.ts';
import { Fold, Chip } from '../../../ui/primitives.tsx';
import type { System } from '@vtt/schema';

export function RoomRules({ system }: { system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const enabled = new Set(system.grants ?? []);
  const passives = Object.entries(system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') === 'passive');

  return (
    <Fold title="Действуют на всех" count={enabled.size}>
      {passives.length === 0
        ? <span className="faint">Пассивных эффектов пока нет.</span>
        : (
          <div className="inline inline--tight">
            {passives.map(([id, effect]) => (
              <Chip
                key={id}
                active={enabled.has(id)}
                onClick={() => editSystem(draft => {
                  const list = draft.grants ??= [];
                  const at = list.indexOf(id);
                  if (at < 0) list.push(id); else list.splice(at, 1);
                })}
              >
                {effect.label ?? id}
              </Chip>
            ))}
          </div>
        )}
    </Fold>
  );
}
