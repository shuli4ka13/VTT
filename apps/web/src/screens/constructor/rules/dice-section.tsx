import { readingKinds } from '@vtt/engine/engine/readings';
import { Readback } from '../effects/cards/group-card.tsx';
import { dieReadback } from '../readback.ts';
import { slugOf } from '../../../store/world.ts';
import { Card, CardHead, Input, NumInput, Button, Select, Fold } from '../../../ui/primitives.tsx';
import { BoundField } from '../bound-field.tsx';
import { diceCount } from '../dice-expr.ts';
import { newDie, DIE_KINDS } from '../factory.ts';
import type { DieKind } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System, SystemConstant, DiceTerm } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

export const dieEntries = (system: System): [string, SystemConstant][] =>
  Object.entries(system.constants ?? {}).filter(([, c]) => c.kind === 'die');

const addDie = (editSystem: EditSystem, kind: DieKind) => editSystem(draft => {
  const made = newDie(draft, kind);
  (draft.constants ??= {})[made.key] = made.value;
});

function readKindOf(constant: SystemConstant): string {
  const read = constant.read;
  return typeof read === 'string' ? read : read?.kind ?? 'sum';
}


const ZERO_WORDS = [['', 'ничего не бросаем'], ['worst', 'бросаем две, берём худшую'], ['best', 'бросаем две, берём лучшую']] as const;
export function DiceSection({ system, editSystem, usage }: Props) {
  const entries = dieEntries(system);

  return (
    <Card>
      <CardHead
        title="Кости"
        sub="Чем бросают проверки в этом мире. Обычно тут одна запись; кости вещей живут в самих записях."
        actions={(
          <span className="head-pick">
            <Select<string> value="" label="добавить кость" title="Какая кость: заготовка встанет в список, дальше её можно править"
              options={[['', '+ кость'], ...DIE_KINDS]}
              onChange={kind => { if (kind) addDie(editSystem, kind as DieKind); }} />
          </span>
        )}
      />
      {entries.length === 0 ? (
        <span className="faint">
          Костей нет. Заведите ту, которой в этом мире бросают проверки.
        </span>
      ) : (
        <div className="stack">
          {entries.map(([key, constant]) => {
            const dice = constant.dice ?? [];
            const inUse = isUsed(usage, 'constant', key);
            const total = diceCount(dice);

            const readKind = readKindOf(constant);
            const asksReading = total !== 1 || readKind !== 'sum';
            const countRead = typeof constant.read === 'object' ? constant.read : null;

            const editDice = (change: (list: DiceTerm[]) => void) => editSystem(draft => {
              const cur = draft.constants?.[key];
              if (!cur) return;
              cur.dice ??= [];
              change(cur.dice);
            });

            const zero = (constant as { zero?: { count: number; keep?: 'best' | 'worst' } }).zero;
            const reading = (
              <>
                  <div className="dict-row">
                    <span className="dict-row__label">Из выпавшего берём</span>
                    <Select
                      value={readKind}
                      options={readingKinds().map(r => [r.kind, r.label] as const) as never}
                      onChange={kind => editSystem(draft => {
                        const cur = draft.constants?.[key];
                        if (!cur) return;

                        if (kind === 'sum') delete cur.read;
                        else if (kind === 'count') {
                          cur.read = { kind: 'count', atLeast: (dice[0]?.sides ?? 6) - 1 };
                        } else cur.read = kind;
                      })}
                    />
                    {readKind === 'count' ? (
                      <>
                        <span className="dict-row__label dict-row__label--tight">не ниже</span>
                        <span className="dict-row__num">
                          <Input
                            mono
                            value={String(countRead?.atLeast ?? '')}
                            onChange={text => editSystem(draft => {
                              const cur = draft.constants?.[key];
                              const n = Number(text);
                              if (cur && Number.isFinite(n)) cur.read = { kind: 'count', atLeast: n };
                            })}
                          />
                        </span>
                      </>
                    ) : null}
                  </div>
                  {dice.length === 1 ? (
                    <div className="dict-row">
                      <span className="dict-row__label">Если костей ноль</span>
                      <Select
                        value={zero ? zero.keep ?? 'worst' : ''}
                        options={ZERO_WORDS as never}
                        onChange={(next: string) => editSystem(draft => {
                          const cur = draft.constants?.[key] as { zero?: unknown } | undefined;
                          if (!cur) return;
                          if (next) cur.zero = next === 'worst' ? { count: 2 } : { count: 2, keep: 'best' }; else delete cur.zero;
                        })}
                      />
                    </div>
                  ) : null}
              </>
            );

            return (

              <div key={key} className="dict-block">
                <div className="dict-row">
                  <Input
                    value={constant.label ?? ''}
                    placeholder="название кости"
                    onChange={label => editSystem(draft => {
                      const cur = draft.constants?.[key];
                      if (cur) cur.label = label;
                    })}
                  />
                  <Button
                    size="sm" variant="danger" disabled={inUse}
                    title={inUse ? 'кость используется' : undefined}
                    onClick={() => editSystem(draft => { delete draft.constants?.[key]; })}
                  >
                    Убрать
                  </Button>
                </div>

                <Readback segments={dieReadback(constant, system)} />

                <DiceComposer dice={dice} onEdit={editDice} driven={Object.values(system.rolls ?? {}).some(roll => roll.die === key && roll.number === 'count')} />

                {asksReading ? reading : <Fold title="ещё" summary={readKind === 'sum' ? 'берём сумму' : 'чтение выпавшего'}>{reading}</Fold>}
              </div>
            );

          })}
        </div>
      )}
    </Card>
  );
}

function DiceComposer({ dice, onEdit, driven = false }: {
  driven?: boolean;
  dice: DiceTerm[];
  onEdit: (change: (list: DiceTerm[]) => void) => void;
}) {
  const many = dice.length > 1;

  return (
    <div className="dice-composer">
      {dice.map((term, i) => {
        return (
          <div key={i} className="dice-term">
            <span className={`dice-term__num dice-term__num--wide${driven && !many ? ' dice-term__num--said' : ''}`}>
              <BoundField value={term.count ?? (driven && !many ? null : 1)} placeholder={driven && !many ? 'задаёт бросок' : 'сколько'}
                onChange={next => onEdit(list => { if (next === null || next === 1) delete list[i]!.count; else list[i]!.count = next; })} />
            </span>

            <span className="dice-term__d">к</span>

            <span className="dice-term__num">
              <DraftNum
                value={term.sides}
                least={2}
                onCommit={n => onEdit(list => { list[i]!.sides = n; })}
              />
            </span>

            {many ? (
              <Input
                value={term.label ?? term.name ?? ''}
                placeholder="как зовётся эта часть"
                onChange={label => onEdit(list => {
                  const name = slugOf(label) || `часть_${i + 1}`;
                  list[i]!.name = name;
                  if (label && label !== name) list[i]!.label = label; else delete list[i]!.label;
                })}
              />
            ) : null}

            <Fold title="ещё" summary={term.bonus ? 'сверх' : term.minus ? 'вычитается' : ''}>
              <div className="inline inline--tight">
                <Select
                  value={term.bonus ? 'bonus' : term.minus ? 'minus' : ''}
                  options={[['', 'обычная часть'], ['bonus', 'сверх — «оставить лучшую» её не трогает'], ['minus', 'вычитается из суммы']] as const}
                  onChange={next => onEdit(list => {
                    const t = list[i]!;
                    delete t.bonus; delete t.minus;
                    if (next === 'bonus') t.bonus = true;
                    if (next === 'minus') t.minus = true;
                  })}
                />
              </div>
            </Fold>

            {many ? (
              <Button
                size="sm" variant="ghost" title="убрать часть"
                onClick={() => onEdit(list => {
                  list.splice(i, 1);
                  if (list.length === 1) { delete list[0]!.name; delete list[0]!.label; }
                })}
              >
                ×
              </Button>
            ) : null}
          </div>
        );
      })}

      <Button
        size="sm" variant="ghost"
        title="Бросок из названных половин: Надежда и Страх в Daggerheart"
        onClick={() => onEdit(list => {
          if (list.length === 1) {
            list[0]!.label ??= 'Первая';
            list[0]!.name ??= 'первая';
          }
          list.push({ sides: list[0]?.sides ?? 12 });
        })}
      >
        + ещё часть
      </Button>
    </div>
  );
}

function DraftNum({ value, least, onCommit }: {
  value: number;
  least: number;
  onCommit: (n: number) => void;
}) {
  return <NumInput mono int least={least} value={value} onCommit={onCommit} />;
}
