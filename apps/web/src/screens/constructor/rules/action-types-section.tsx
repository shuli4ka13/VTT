import { Card, CardHead, Input, NumInput, Button } from '../../../ui/primitives.tsx';
import { newActionType } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const addActionType = (editSystem: EditSystem) => editSystem(draft => {
  const made = newActionType(draft);
  (draft.action_types ??= {})[made.key] = made.value;
});

export function ActionTypesSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.action_types ?? {});

  return (
    <Card>
      <CardHead
        title="Чего стоит действие"
        sub="Из этого списка эффект выбирает свою цену: действие, бонусное действие, реакция."
        actions={<Button size="sm" onClick={() => addActionType(editSystem)}>+ тип</Button>}
      />
      <div className="stack stack--tight">
        <span className="faint">Чего стоит активируемый эффект — выбирается из этого списка. «За ход» — сколько раз можно за один ход в бою; пусто или 0 — без счёта.</span>
        {entries.length === 0 ? (
          <span className="faint">Типов пока нет.</span>
        ) : entries.map(([key, type]) => {
          const inUse = isUsed(usage, 'actionType', key);
          return (
            <div key={key} className="dict-row">
              <Input
                value={type.label ?? ''}
                placeholder="действие"
                onChange={label => editSystem(draft => {
                  draft.action_types ??= {};
                  const cur = draft.action_types?.[key];
                  if (cur) cur.label = label;
                })}
              />
              <span className="dict-row__label">за ход</span>
              <NumInput
                int least={0} mono
                value={type.perTurn ?? 0}
                onCommit={n => editSystem(draft => {
                  const cur = draft.action_types?.[key];
                  if (!cur) return;
                  if (n > 0) cur.perTurn = n; else delete cur.perTurn;
                })}
              />
              <Button
                size="sm" variant="danger" disabled={inUse}
                title={inUse ? 'тип используется' : undefined}
                onClick={() => editSystem(draft => { delete draft.action_types?.[key]; })}
              >
                Убрать
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
