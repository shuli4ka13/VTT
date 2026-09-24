import { readingKinds } from '@vtt/engine/engine/readings';
import { Readback } from '../effects/cards/group-card.tsx';
import { dieReadback } from '../readback.ts';
import { slugOf } from '../../../store/world.ts';
import { Card, CardHead, Input, NumInput, Button, Select } from '../../../ui/primitives.tsx';
import { diceCount } from '../dice-expr.ts';
import { newDie } from '../factory.ts';
import { inUse as isUsed } from '../usage.ts';
import type { UsageIndex } from '../usage.ts';
import type { System, SystemConstant, DiceTerm } from '@vtt/schema';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem; usage: UsageIndex }

export const dieEntries = (system: System): [string, SystemConstant][] =>
  Object.entries(system.constants ?? {}).filter(([, c]) => c.kind === 'die');

const addDie = (editSystem: EditSystem) => editSystem(draft => {
  const made = newDie(draft);
  (draft.constants ??= {})[made.key] = made.value;
});

function readKindOf(constant: SystemConstant): string {
  const read = constant.read;
  return typeof read === 'string' ? read : read?.kind ?? 'sum';
}

export function DiceSection({ system, editSystem, usage }: Props) {
  const entries = dieEntries(system);

  return (
    <Card>
      <CardHead
        title="Кости"
        sub="Чем бросают проверки в этом мире. Обычно тут одна запись. Кость урона сюда не нужна — она живёт на самом мече."
        actions={<Button size="sm" onClick={() => addDie(editSystem)}>+ кость</Button>}
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

            const asksReading = total !== 1;
            const readKind = readKindOf(constant);
            const countRead = typeof constant.read === 'object' ? constant.read : null;

            const editDice = (change: (list: DiceTerm[]) => void) => editSystem(draft => {
              const cur = draft.constants?.[key];
              if (!cur) return;
              cur.dice ??= [];
              change(cur.dice);
            });

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

                <DiceComposer dice={dice} system={system} onEdit={editDice} />

                {asksReading ? (
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
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function DiceComposer({ dice, system, onEdit }: {
  dice: DiceTerm[];
  system: System;
  onEdit: (change: (list: DiceTerm[]) => void) => void;
}) {
  const many = dice.length > 1;
  const numeric = system.fields.filter(f =>
    f.value.kind === 'formula' || (f.value.kind === 'stored' && f.value.type === 'number'));

  return (
    <div className="dice-composer">
      {dice.map((term, i) => {
        const fromField = typeof term.count === 'object' && term.count !== null;
        return (
          <div key={i} className="dice-term">
            {fromField ? (
              <Select
                value={String((term.count as { expr?: string }).expr ?? '').replace(/^@/, '')}
                options={[['', '— какое поле? —'],
                  ...numeric.map(f => [f.tag, f.label] as const)] as never}
                onChange={tag => onEdit(list => { list[i]!.count = { expr: `@${tag}` }; })}
              />
            ) : (
              <span className="dice-term__num">
                <DraftNum
                  value={Number(term.count ?? 1)}
                  least={1}
                  onCommit={n => onEdit(list => { list[i]!.count = n; })}
                />
              </span>
            )}

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
                  list[i]!.label = label;
                  list[i]!.name = slugOf(label) || `часть_${i + 1}`;
                })}
              />
            ) : null}

            <Button
              size="sm" variant="ghost"
              title={fromField ? 'задать числом' : 'взять число из поля листа'}
              disabled={!fromField && numeric.length === 0}
              onClick={() => onEdit(list => {
                list[i]!.count = fromField ? 1 : { expr: `@${numeric[0]?.tag ?? ''}` };
              })}
            >
              {fromField ? 'числом' : 'из поля'}
            </Button>

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
          list.push({ count: 1, sides: list[0]?.sides ?? 12 });
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
