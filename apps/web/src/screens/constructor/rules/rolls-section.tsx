import { Card, CardHead, Input, Button } from '../../../ui/primitives.tsx';
import { newRoll } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

const addRoll = (editSystem: EditSystem) => editSystem(draft => {
  (draft.rolls ??= []).push(newRoll(draft));
});

export function RollsSection({ system, editSystem, usage }: Props) {
  const rolls = system.rolls ?? [];

  return (
    <Card>
      <CardHead
        title="Виды бросков"
        sub="Чтобы можно было сказать «помеха только на атаки». Бросок «Любой» есть всегда, заводить его не надо."
        actions={<Button size="sm" onClick={() => addRoll(editSystem)}>+ вид</Button>}
      />
      <div className="stack stack--tight">
        <span className="faint">Проверки по полям («Проверка Ловкости») включаются на «Листе».</span>
        {rolls.length === 0 ? (
          <span className="faint">Видов бросков пока нет.</span>
        ) : rolls.map((roll, index) => {
          const inUse = isUsed(usage, 'roll', roll.tag);
          return (
            <div key={index} className="dict-row">
              <Input
                value={roll.label}
                placeholder="название броска"
                onChange={label => editSystem(draft => {
                  draft.rolls ??= [];
                  const cur = draft.rolls?.[index];
                  if (cur) cur.label = label;
                })}
              />
              <span className="chip mono">{roll.tag}</span>
              <Button
                size="sm" variant="danger" disabled={inUse}
                title={inUse ? 'этот вид броска используется' : undefined}
                onClick={() => editSystem(draft => {
                  draft.rolls = (draft.rolls ?? []).filter((_, i) => i !== index);
                })}
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
