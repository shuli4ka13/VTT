import { Card, CardHead, Select } from '../../../ui/primitives.tsx';
import { FormulaInput } from '../../../ui/formula.tsx';
import { dieEntries } from './dice-section.tsx';
import type { System } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem }

export function InitiativeSection({ system, editSystem }: Props) {
  const dice = dieEntries(system);
  const spec = system.initiative;
  const bonus = spec?.bonus && typeof spec.bonus === 'object' && 'expr' in spec.bonus ? String(spec.bonus.expr ?? '') : '';

  return (
    <Card>
      <CardHead
        title="Инициатива"
        sub="Чем решается порядок ходов в бою. Обычный бросок системы: правила комнаты и правки бросков действуют и на него."
      />
      <div className="stack stack--tight">
        <div className="dict-row">
          <span className="dict-row__label">Кость</span>
          <Select
            value={spec?.die?.constant ?? ''}
            options={[['', '— инициативы нет: порядок как перечислены листы —'],
              ...dice.map(([key, c]) => [key, c.label || key] as const)] as never}
            onChange={key => editSystem(draft => {
              if (!key) { delete draft.initiative; return; }
              draft.initiative = { ...(draft.initiative ?? {}), die: { constant: key } };
            })}
          />
        </div>
        {spec ? (
          <>
            <div className="dict-row">
              <span className="dict-row__label">Плюс</span>
              <FormulaInput
                system={system}
                value={bonus}
                placeholder="например: @Модификатор Ловкости"
                onChange={expr => editSystem(draft => {
                  if (!draft.initiative) return;
                  if (expr.trim()) draft.initiative.bonus = { expr }; else delete draft.initiative.bonus;
                })}
              />
            </div>
            <div className="dict-row">
              <span className="dict-row__label">Вид броска</span>
              <Select
                value={spec.check ?? ''}
                options={[['', '— просто бросок —'],
                  ...(system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
                onChange={tag => editSystem(draft => {
                  if (!draft.initiative) return;
                  if (tag) draft.initiative.check = tag; else delete draft.initiative.check;
                })}
              />
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
