import { Card, CardHead, Select } from '../../../ui/primitives.tsx';
import { FormulaInput } from '../../../ui/formula.tsx';
import { dieEntries } from './dice-section.tsx';
import type { System } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';
import { RollTagsPick } from '../roll-tags-pick.tsx';

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
        sub="Чем решается порядок ходов в бою. Обычный бросок системы: правки броска действуют и на него."
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
                where="инициатива · прибавка"
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
              <span className="dict-row__label">Метки броска</span>
              <RollTagsPick
                system={system}
                value={spec.tags}
                onChange={tags => editSystem(draft => {
                  if (!draft.initiative) return;
                  if (tags.length) draft.initiative.tags = tags; else delete draft.initiative.tags;
                })}
              />
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
