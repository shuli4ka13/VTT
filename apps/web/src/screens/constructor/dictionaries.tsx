import { useState } from 'react';
import { readingKinds } from '@vtt/engine/engine/readings';
import { editPalette, paletteKeyOf } from '@vtt/engine/engine/roll-edits';
import { ADVANTAGE_METHODS, findMethod } from '@vtt/engine/model/advantage-methods';
import { Readback } from './card.tsx';
import { editReadback, dieReadback } from './readback.ts';
import { useWorld, slugOf } from '../../store/world.ts';
import { Columns } from '../../ui/layout.tsx';
import { Card, CardHead, Input, NumInput, Button, Fold, Select, Verdict } from '../../ui/primitives.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { diceCount } from './dice-expr.ts';
import {
  newDie, newRollEdit, newRoll, newTable, newEvent, newActionType, simpleReceive,
} from './factory.ts';
import type { System, Compendium, RangeTable, SystemConstant, DiceTerm } from '@vtt/schema';
import type { WorldState } from '../../store/world.ts';
import { useUsage, inUse as isUsed } from './usage.ts';
import type { UsageIndex } from './usage.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; compendium: Compendium; editSystem: EditSystem; usage: UsageIndex }

const parseFree = (text: string): number | string | boolean =>
  /^-?\d+(\.\d+)?$/.test(text) ? Number(text)
    : text === 'true' ? true
      : text === 'false' ? false
        : text;

const rangesBroken = (ranges: { from: number; to: number }[]): boolean => {
  if (ranges.length < 2) return false;
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  return sorted.some((r, i) => i > 0 && sorted[i - 1]!.to + 1 !== r.from);
};

const addDie = (editSystem: EditSystem) => editSystem(draft => {
  const made = newDie(draft);
  (draft.constants ??= {})[made.key] = made.value;
});

const addRollEdit = (editSystem: EditSystem) => editSystem(draft => {
  const made = newRollEdit(draft);
  (draft.roll_edits ??= {})[made.key] = made.value;
});

const addFromCatalog = (editSystem: EditSystem, methodId: string) => editSystem(draft => {
  const method = findMethod(methodId);
  if (!method) return;
  draft.roll_edits ??= {};
  for (const recipe of method.recipes) {
    if (draft.roll_edits[recipe.key]) continue;
    draft.roll_edits[recipe.key] = {
      label: recipe.label,
      ops: JSON.parse(JSON.stringify(recipe.ops)),
      ...(recipe.canceledBy ? { canceledBy: recipe.canceledBy } : {}),
    };
  }
});

const addRoll = (editSystem: EditSystem) => editSystem(draft => {
  (draft.rolls ??= []).push(newRoll(draft));
});

const addTable = (editSystem: EditSystem) => editSystem(draft => {
  const made = newTable(draft);
  (draft.tables ??= {})[made.key] = made.value;
});

const addEvent = (editSystem: EditSystem) => editSystem(draft => {
  const made = newEvent(draft);
  (draft.events ??= {})[made.key] = made.value;
});

const simpleReceiveOf = (receive: unknown): { tag: string; direction: 'subtract' | 'add'; targetModifiers: boolean } | null => {
  if (!Array.isArray(receive) || receive.length !== 1) return null;
  const step = receive[0] as Record<string, any>;
  if (step.type !== 'apply' || !step.target?.tag || step.value?.ref !== 'event.amount') return null;
  const direction = step.direction === 'add' ? 'add' : 'subtract';
  return { tag: String(step.target.tag), direction, targetModifiers: step.targetModifiers !== false };
};

const addActionType = (editSystem: EditSystem) => editSystem(draft => {
  const made = newActionType(draft);
  (draft.action_types ??= {})[made.key] = made.value;
});

export function DictionariesTab() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const editSystem = useWorld(s => s.editSystem);
  const usage = useUsage();

  return (
    <Columns
      main={{
        head: 'Словари системы',
        body: (
          <>
            <Card>
              <CardHead
                title="Кости"
                sub="Чем бросают проверки в этом мире. Обычно тут одна запись. Кость урона сюда не нужна — она живёт на самом мече."
                actions={<Button size="sm" onClick={() => addDie(editSystem)}>+ кость</Button>}
              />
              <DiceSection system={system} compendium={compendium} editSystem={editSystem} usage={usage} />
            </Card>

            <Card>
              <CardHead
                title="Правки броска"
                sub="Преимущество, помеха и всё, что меняет бросок. Здесь только ЧТО это значит; когда включается — говорит эффект."
                actions={
                  <>
                    <select
                      className="select"
                      style={{ width: 260 }}
                      value=""
                      onChange={e => { const id = e.target.value; if (id && findMethod(id)?.implemented) addFromCatalog(editSystem, id); }}
                    >
                      <option value="">+ из справочника…</option>
                      {ADVANTAGE_METHODS.map(m => (
                        <option key={m.id} value={m.id}>{m.implemented ? m.label : `${m.label} — пока нет`}</option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => addRollEdit(editSystem)}>+ правка</Button>
                  </>
                }
              />
              <RollEditsSection system={system} compendium={compendium} editSystem={editSystem} usage={usage} />
            </Card>

            <Card>
              <CardHead
                title="События"
                sub="Урон, лечение и другие вещи, которые один лист посылает другому. Здесь — как лист их принимает; кто и сколько посылает, говорит эффект."
                actions={<Button size="sm" onClick={() => addEvent(editSystem)}>+ событие</Button>}
              />
              <EventsSection system={system} compendium={compendium} editSystem={editSystem} usage={usage} />
            </Card>

            <Card>
              <CardHead
                title="Инициатива"
                sub="Чем решается порядок ходов в бою. Обычный бросок системы: правила комнаты и правки бросков действуют и на него."
              />
              <InitiativeSection system={system} compendium={compendium} editSystem={editSystem} usage={usage} />
            </Card>

            <Card>
              <CardHead
                title="Виды бросков"
                sub="Чтобы можно было сказать «помеха только на атаки». Бросок «Любой» есть всегда, заводить его не надо."
                actions={<Button size="sm" onClick={() => addRoll(editSystem)}>+ вид</Button>}
              />
              <RollsSection system={system} compendium={compendium} editSystem={editSystem} usage={usage} />
            </Card>

            <Card>
              <CardHead
                title="Таблицы"
                sub="Ступеньки, которые формулой не сказать: бонус мастерства по уровню, исход хода по итогу броска."
                actions={<Button size="sm" onClick={() => addTable(editSystem)}>+ таблица</Button>}
              />
              <TablesSection system={system} compendium={compendium} editSystem={editSystem} usage={usage} />
            </Card>

            <Card>
              <CardHead
                title="Чего стоит действие"
                sub="Из этого списка эффект выбирает свою цену: действие, бонусное действие, реакция."
                actions={<Button size="sm" onClick={() => addActionType(editSystem)}>+ тип</Button>}
              />
              <ActionTypesSection system={system} compendium={compendium} editSystem={editSystem} usage={usage} />
            </Card>
          </>
        ),
      }}
    />
  );
}

function readKindOf(constant: SystemConstant): string {
  const read = constant.read;
  return typeof read === 'string' ? read : read?.kind ?? 'sum';
}

function DiceSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.constants ?? {}).filter(([, c]) => c.kind === 'die');

  if (entries.length === 0) {
    return (
      <span className="faint">
        Костей нет. Заведите ту, которой в этом мире бросают проверки.
      </span>
    );
  }

  return (
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
  );
}

function DiceComposer({ dice, system, onEdit }: {
  dice: DiceTerm[];
  system: System;
  onEdit: (change: (list: DiceTerm[]) => void) => void;
}) {
  const many = dice.length > 1;
  const numeric = system.fields.filter(f =>
    f.value.kind === 'formula' || f.value.kind === 'table'
    || (f.value.kind === 'stored' && f.value.type === 'number'));

  return (
    <div className="dice-composer">
      {dice.map((term, i) => {
        const fromField = typeof term.count === 'object' && term.count !== null;
        return (
          <div key={i} className="dice-term">
            {fromField ? (
              <Select
                value={String((term.count as { tag?: string }).tag ?? '')}
                options={[['', '— какое поле? —'],
                  ...numeric.map(f => [f.tag, f.label] as const)] as never}
                onChange={tag => onEdit(list => { list[i]!.count = { tag } as never; })}
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
                list[i]!.count = fromField ? 1 : ({ tag: numeric[0]?.tag ?? '' } as never);
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

function opWord(op: { op: string; [k: string]: unknown }): string {
  const key = paletteKeyOf(op);
  return editPalette().find(p => p.key === key)?.label ?? op.op;
}

function partsOf(system: System): { name: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const constant of Object.values(system.constants ?? {})) {
    for (const term of constant.dice ?? []) {
      if (term.name && !seen.has(term.name)) seen.set(term.name, term.label || term.name);
    }
  }
  return [...seen].map(([name, label]) => ({ name, label }));
}

const PART_ABLE = ['addDie', 'keepBest', 'keepWorst', 'dieStep', 'explode', 'flip', 'reroll'];

function OpChip({ op, parts, onNumber, onPart, onRemove }: {
  op: Record<string, unknown>;
  parts: { name: string; label: string }[];
  onNumber: (value: number) => void;
  onPart: (part: string) => void;
  onRemove: () => void;
}) {
  const numeric = 'n' in op ? 'n' : 'by' in op ? 'by' : null;

  const askPart = parts.length > 0 && PART_ABLE.includes(String(op.op));
  return (
    <span className="chip">
      {opWord(op as { op: string })}
      {numeric ? (
        <ChipNum value={Number(op[numeric] ?? 0)} onCommit={onNumber} />
      ) : null}
      {askPart ? (
        <select
          className="chip__part"
          aria-label="чему именно"
          value={String(op.part ?? '')}
          onChange={e => onPart(e.target.value)}
        >
          <option value="">всему броску</option>
          {parts.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
        </select>
      ) : null}
      <button className="chip__x" type="button" title="убрать" onClick={onRemove}>×</button>
    </span>
  );
}

function RollEditsSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.roll_edits ?? {});
  const palette = editPalette();
  const parts = partsOf(system);

  if (entries.length === 0) {
    return (
      <span className="faint">
        Правок нет — броски идут как есть. Заведите свою: «Преимущество»,
        «Фора», «Ускорение» — как это зовётся в вашем мире.
      </span>
    );
  }

  return (
    <div className="stack">
      {entries.map(([key, edit]) => {
        const inUse = isUsed(usage, 'rollEdit', key);
        const ops = edit.ops ?? [];
        const counter = edit.canceledBy ? entries.find(([k]) => k === edit.canceledBy)?.[1] : null;
        return (
          <div key={key} className="dict-block">
            <div className="dict-row">
              <Input
                value={edit.label ?? ''}
                placeholder="как это зовётся в вашем мире"
                onChange={label => editSystem(draft => {
                  const cur = draft.roll_edits?.[key];
                  if (cur) cur.label = label;
                })}
              />
              <Button
                size="sm" variant="danger" disabled={inUse}
                title={inUse ? 'правка используется эффектом' : undefined}
                onClick={() => editSystem(draft => {
                  delete draft.roll_edits?.[key];

                  for (const other of Object.values(draft.roll_edits ?? {})) {
                    if (other.canceledBy === key) delete other.canceledBy;
                  }
                })}
              >
                Убрать
              </Button>
            </div>

            <Readback segments={editReadback(edit, system)} />

            <div className="dict-row dict-row--wrap">
              <span className="dict-row__label">Что делает</span>
              {ops.map((op, i) => (
                <OpChip
                  key={i}
                  op={op}
                  parts={parts}
                  onNumber={value => editSystem(draft => {
                    const target = draft.roll_edits?.[key]?.ops?.[i];
                    if (!target) return;
                    if ('n' in target) target.n = value; else target.by = value;
                  })}
                  onPart={part => editSystem(draft => {
                    const target = draft.roll_edits?.[key]?.ops?.[i];
                    if (!target) return;
                    if (part) target.part = part; else delete target.part;
                  })}
                  onRemove={() => editSystem(draft => {
                    draft.roll_edits?.[key]?.ops?.splice(i, 1);
                  })}
                />
              ))}
              <Select
                value=""
                options={[['', '+ добавить…'],
                  ...palette.map(p => [p.key, p.label] as const)] as never}
                onChange={pick => {
                  if (!pick) return;
                  const chosen = palette.find(p => p.key === pick);
                  if (!chosen) return;
                  editSystem(draft => {
                    const edit = draft.roll_edits?.[key];
                    if (!edit) return;
                    edit.ops ??= [];
                    edit.ops.push(JSON.parse(JSON.stringify(chosen.op)));
                  });
                }}
              />
            </div>

            {}
            <Fold
              title="Гашение"
              summary={counter ? `гасится: ${counter.label || edit.canceledBy}` : 'ничем — складывается'}
            >
              <div className="dict-row">
                <span className="dict-row__label">Гасится</span>
                <Select
                  value={String(edit.canceledBy ?? '')}
                  options={[['', '— ничем, складывается —'],
                    ...entries.filter(([k]) => k !== key).map(([k, e]) => [k, e.label || k] as const),
                  ] as never}
                  onChange={other => editSystem(draft => {
                    const dict = draft.roll_edits;
                    const cur = dict?.[key];
                    if (!dict || !cur) return;

                    if (cur.canceledBy && dict[cur.canceledBy]?.canceledBy === key) {
                      delete dict[cur.canceledBy]!.canceledBy;
                    }
                    if (other) {
                      cur.canceledBy = other;
                      dict[other]!.canceledBy = key;
                    } else {
                      delete cur.canceledBy;
                    }
                  })}
                />
              </div>
            </Fold>
          </div>
        );
      })}
    </div>
  );
}

function RollsSection({ system, editSystem, usage }: Props) {
  const rolls = system.rolls ?? [];

  return (
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
  );
}

function TablesSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.tables ?? {});

  return (
    <div className="stack stack--tight">
      {entries.length === 0 ? (
        <span className="faint">Таблиц пока нет — например, бонус мастерства по уровню.</span>
      ) : entries.map(([key, table]) => (
        <TableRow key={key} id={key} table={table} editSystem={editSystem} usage={usage} />
      ))}
    </div>
  );
}

function TableRow({ id, table, editSystem, usage }: Omit<Props, 'system' | 'compendium'> & { id: string; table: RangeTable }) {
  const ranges = table.ranges ?? [];
  const inUse = isUsed(usage, 'table', id);
  const broken = rangesBroken(ranges);

  return (
    <Fold title={table.label || id} count={ranges.length}>
      <div className="dict-row">
        <Input
          value={table.label ?? ''}
          placeholder="таблица"
          onChange={label => editSystem(draft => {
            draft.tables ??= {};
            const cur = draft.tables?.[id];
            if (cur) cur.label = label;
          })}
        />
        <Button
          size="sm" variant="danger" disabled={inUse}
          title={inUse ? 'таблица используется' : undefined}
          onClick={() => editSystem(draft => { delete draft.tables?.[id]; })}
        >
          Убрать
        </Button>
      </div>

      {broken ? <Verdict tone="warn">диапазоны перекрываются или дырявы</Verdict> : null}

      {ranges.map((range, i) => (
        <div key={i} className="range-row">
          <NumInput
            value={range.from}
            onCommit={n => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.from = n;
            })}
          />
          <NumInput
            value={range.to}
            onCommit={n => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.to = n;
            })}
          />
          <Input
            value={String(range.value)}
            onChange={next => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.value = parseFree(next);
            })}
          />
          <Button
            size="sm" variant="danger"
            onClick={() => editSystem(draft => { draft.tables?.[id]?.ranges.splice(i, 1); })}
          >
            ×
          </Button>
        </div>
      ))}

      <Button
        size="sm"
        onClick={() => editSystem(draft => {
          const list = draft.tables?.[id]?.ranges;
          if (!list) return;
          const from = list.length ? list[list.length - 1]!.to + 1 : 1;
          list.push({ from, to: from, value: 0 });
        })}
      >
        + диапазон
      </Button>
    </Fold>
  );
}

function EventsSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.events ?? {});
  const numeric = system.fields.filter(f => f.value.kind === 'stored' && f.value.type === 'number');

  if (entries.length === 0) {
    return <span className="faint">Событий нет. Без них атака пишет прямо в поле цели; с ними — посылает «Урон», а сопротивления и реакции слушают слово.</span>;
  }

  return (
    <div className="stack">
      {entries.map(([key, event]) => {
        const inUse = isUsed(usage, 'event', key);
        const simple = simpleReceiveOf(event.receive);
        const custom = Boolean(event.receive?.length) && !simple;
        const mode = !event.receive?.length ? 'signal' : simple ? 'field' : 'custom';
        const edit = (change: (cur: Record<string, any>) => void) => editSystem(draft => {
          const cur = draft.events?.[key];
          if (cur) change(cur as Record<string, any>);
        });
        return (
          <div key={key} className="dict-block">
            <div className="dict-row">
              <Input
                value={event.label ?? ''}
                placeholder="название события"
                onChange={label => edit(cur => { cur.label = label; })}
              />
              <span className="chip mono">{key}</span>
              <Button
                size="sm" variant="danger" disabled={inUse}
                title={inUse ? 'событие используется' : undefined}
                onClick={() => editSystem(draft => { delete draft.events?.[key]; })}
              >
                Убрать
              </Button>
            </div>
            <div className="dict-row">
              <span className="dict-row__label">Теги</span>
              <Input
                value={(event.tags ?? []).join(', ')}
                placeholder="огонь, холод, яд — через запятую"
                onChange={text => edit(cur => {
                  const list = text.split(',').map(s => s.trim()).filter(Boolean);
                  if (list.length) cur.tags = list; else delete cur.tags;
                })}
              />
            </div>
            <div className="dict-row dict-row--wrap">
              <span className="dict-row__label">Приём</span>
              <Select
                value={mode}
                disabled={custom}
                title={custom ? 'правило приёма собрано из нескольких шагов — переключатель его стёр бы' : undefined}
                options={[
                  ['field', 'поле листа'],
                  ['signal', 'только сигнал'],
                  ...(custom ? [['custom', 'своё правило'] as const] : []),
                ] as never}
                onChange={next => edit(cur => {
                  if (custom) return;
                  if (next === 'signal') delete cur.receive;
                  else if (next === 'field') cur.receive = [simpleReceive(numeric[0]?.tag ?? '', 'subtract', true)];
                })}
              />
              {simple ? (
                <>
                  <Select
                    value={simple.direction}
                    options={[['subtract', 'вычесть из'], ['add', 'прибавить к']] as const}
                    onChange={direction => edit(cur => {
                      cur.receive = [simpleReceive(simple.tag, direction, simple.targetModifiers)];
                    })}
                  />
                  <Select
                    value={simple.tag}
                    options={[['', '— поле —'], ...numeric.map(f => [f.tag, f.label] as const)] as never}
                    onChange={tag => edit(cur => {
                      cur.receive = [simpleReceive(tag, simple.direction, simple.targetModifiers)];
                    })}
                  />
                </>
              ) : null}
              {custom ? <span className="faint">шагов приёма: {event.receive!.length}</span> : null}
            </div>
            {simple ? (
              <div className="dict-row dict-row--wrap">
                <span className="dict-row__label">Сопротивления</span>
                <Select
                  value={simple.targetModifiers ? 'yes' : 'no'}
                  options={[['yes', 'на событии и на поле'], ['no', 'только на событии']] as const}
                  onChange={v => edit(cur => {
                    cur.receive = [simpleReceive(simple.tag, simple.direction, v === 'yes')];
                  })}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function InitiativeSection({ system, editSystem }: Props) {
  const dice = Object.entries(system.constants ?? {}).filter(([, c]) => c.kind === 'die');
  const spec = system.initiative;
  const bonus = spec?.bonus && typeof spec.bonus === 'object' && 'expr' in spec.bonus ? String(spec.bonus.expr ?? '') : '';

  return (
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
  );
}

function ActionTypesSection({ system, editSystem, usage }: Props) {
  const entries = Object.entries(system.action_types ?? {});

  return (
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
  );
}

function DraftNum({ value, least, onCommit }: {
  value: number;
  least: number;
  onCommit: (n: number) => void;
}) {
  return <NumInput mono int least={least} value={value} onCommit={onCommit} />;
}

function ChipNum({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="chip__num"
      aria-label="сколько"
      value={draft ?? String(value)}
      onChange={e => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (Number.isFinite(n) && e.target.value.trim() !== '') onCommit(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
