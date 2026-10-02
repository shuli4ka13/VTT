import type { System } from '@vtt/schema';
import { DEFAULT_LIMITS } from '@vtt/engine/core/limits';
import type { Limits } from '@vtt/engine/core/limits';
import { Card, CardHead, Field, Fold, Select, NumInput, Button } from '../../../ui/primitives.tsx';
import { FormulaField } from '../../../ui/formula-field.tsx';
import { TagsField } from '../tags-field.tsx';
import { dieEntries } from './dice-section.tsx';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

const LIMIT_LABELS: Record<keyof Limits, string> = {
  handlerDepth: 'сколько раз одна подписка в цепочке',
  budget: 'вложенных вызовов на одну цепочку',
  settleRounds: 'кругов пересчёта',
  callDepth: 'глубина вложенных вызовов',
  probes: 'пересчётов в одном окне вопросов',
};

export function CombatSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const initiative = system.initiative;
  const limits = (system as { limits?: Partial<Limits> }).limits ?? {};
  return (
    <Card>
      <CardHead
        title="Бой"
        sub="Как стол строит порядок ходов. Пусто — ведущий расставляет порядок руками."
        actions={initiative ? null : (
          <Button size="sm" onClick={() => editSystem(draft => {
            const die = dieEntries(draft)[0]?.[0];
            if (die) draft.initiative = { die };
          })} disabled={!dieEntries(system).length}>+ инициатива</Button>
        )}
      />
      {initiative ? (
        <div className="row">
          <Field label="Кость инициативы">
            <Select<string>
              value={initiative.die}
              options={dieEntries(system).map(([key, c]) => [key, c.label || key] as const)}
              onChange={next => editSystem(draft => { if (draft.initiative) draft.initiative.die = next; })}
            />
          </Field>
          <Field label="Прибавка" hint="Формула по листу того, кто бросает: @ловкость.">
            <FormulaField
              value={String(initiative.bonus?.expr ?? '')}
              system={system}
              where="инициатива · прибавка"
              placeholder="например: @initiative"
              onCommit={text => editSystem(draft => { if (!draft.initiative) return; if (text.trim()) draft.initiative.bonus = { expr: text.trim() }; else delete draft.initiative.bonus; })}
            />
          </Field>
          <Field label="Метки броска">
            <TagsField
              system={system} value={initiative.tags}
              onChange={next => editSystem(draft => { if (!draft.initiative) return; const list = next.filter((t): t is string => typeof t === 'string'); if (list.length) draft.initiative.tags = list; else delete draft.initiative.tags; })}
            />
          </Field>
          <Button size="sm" variant="ghost" onClick={() => editSystem(draft => { delete draft.initiative; })}>убрать инициативу</Button>
        </div>
      ) : null}
      <Fold title="ещё" summary="пределы цепочек реакций">
        <span className="faint">Пределы обрывают бесконечные цепочки ответов. Обычно их не трогают.</span>
        <div className="row">
          {(Object.keys(DEFAULT_LIMITS) as (keyof Limits)[]).map(key => (
            <Field key={key} label={LIMIT_LABELS[key]}>
              <NumInput int least={1} value={limits[key] ?? DEFAULT_LIMITS[key]} onCommit={n => editSystem(draft => {
                const own = { ...((draft as { limits?: Partial<Limits> }).limits ?? {}) };
                if (n === DEFAULT_LIMITS[key]) delete own[key]; else own[key] = n;
                if (Object.keys(own).length) (draft as { limits?: Partial<Limits> }).limits = own;
                else delete (draft as { limits?: unknown }).limits;
              })} />
            </Field>
          ))}
        </div>
      </Fold>
    </Card>
  );
}
