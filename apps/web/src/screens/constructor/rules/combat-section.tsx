import type { System } from '@vtt/schema';
import { DEFAULT_LIMITS } from '@vtt/engine';
import type { Limits } from '@vtt/engine';
import { Card, CardHead, Field, Fold, Select, NumInput, Button, Input } from '../../../ui/primitives.tsx';
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

const DIAGONALS = [['one', 'как одна клетка'], ['alt', 'через одну — две'], ['line', 'по прямой']] as const;

export function CombatSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const initiative = system.initiative;
  const grid = system.grid;
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
          <Field label="Прибавка" hint="Формула по листу того, кто бросает: ловкость.">
            <FormulaField
              value={String(initiative.bonus?.expr ?? '')}
              system={system}
              where="инициатива · прибавка"
              placeholder="например: инициатива"
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
      <Field label="Поле боя" hint="Клетки, на которых стоят фишки; от них считается дистанция до цели.">
        <label className="inline inline--tight">
          <input
            type="checkbox" className="sheet-grid__check"
            aria-label="Есть поле с клетками"
            checked={Boolean(grid)}
            onChange={e => editSystem(draft => { if (e.target.checked) draft.grid ??= { step: 1 }; else delete draft.grid; })}
          />
          <span>Есть поле с клетками</span>
        </label>
      </Field>
      {grid ? (
        <div className="row">
          <Field label="В клетке">
            <NumInput least={0.01} value={grid.step} onCommit={n => editSystem(draft => { if (draft.grid && n > 0) draft.grid.step = n; })} />
          </Field>
          <Field label="Единица" hint="например «м» или «фт»">
            <Input
              value={grid.unit ?? ''}
              placeholder="м"
              onChange={next => editSystem(draft => { if (!draft.grid) return; if (next) draft.grid.unit = next; else delete draft.grid.unit; })}
            />
          </Field>
          <Field label="Диагональ">
            <Select<string>
              value={grid.diagonal ?? 'one'}
              options={DIAGONALS}
              onChange={next => editSystem(draft => { if (!draft.grid) return; if (next === 'one') delete draft.grid.diagonal; else draft.grid.diagonal = next as 'alt' | 'line'; })}
            />
          </Field>
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
