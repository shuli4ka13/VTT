// Словари системы: кости, мишени бросков, таблицы по диапазонам, типы
// действий. Раньше их заводил только образец (donor) — своей кости или
// своей таблицы завести было нельзя, и dogfood-критерий «образец D&D
// воспроизводим конструктором с нуля» был недостижим: бонус мастерства
// по уровню без таблиц по диапазонам не собрать.
//
// Своя вкладка, а не фолд внутри «Эффектов»: словарь принадлежит ВСЕЙ
// системе — на него ссылаются и «Лист», и «Эффекты», и «Записи», значит
// вкладке «Эффекты» он не принадлежит. В узкой (~280px) левой колонке
// строки к тому же резались по ширине — здесь у секций вся ширина центра.
//
// Список, а не карточки (design-note §4, «Плотность и тишина») ВНУТРИ
// каждой секции: строка ~32px, разделяет только тонкая линия. Таблица —
// исключение: у неё есть вложенные диапазоны, и она раскрывается фолдом,
// но сама остаётся строкой списка, не карточкой. Card здесь ровно один
// уровень — на секцию, не на строку: вложенные карточки запрещены.
//
// Инвариант «стабильный тег» соблюдён тем же приёмом, что и у поля
// (sheet-tab.tsx): ключ/тег свежей записи следует за лейблом, пока запись
// не встретилась нигде в мире; первая ссылка — замораживает его навсегда.

import { useState } from 'react';
import { readingKinds } from '@vtt/engine/engine/readings';
import { editPalette, paletteKeyOf } from '@vtt/engine/engine/roll-edits';
import { Readback } from './card.tsx';
import { editReadback, dieReadback } from './readback.ts';
import { useWorld, freeId, slugOf } from '../../store/world.ts';
import { Columns } from '../../ui/layout.tsx';
import { Card, CardHead, Input, NumInput, Button, Fold, Select, Verdict } from '../../ui/primitives.tsx';
import { diceCount } from './dice-expr.ts';
import type { System, Compendium, RangeTable, SystemConstant, DiceTerm } from '@vtt/schema';
import type { WorldState } from '../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; compendium: Compendium; editSystem: EditSystem }

/** Мир сериализован — тот же приём, что и у «кто на это поле смотрит»
 * (whoUses, sheet-tab.tsx), только маркер точнее: не тег целиком, а его
 * СТРУКТУРНАЯ форма ссылки — так собственное определение записи в словаре
 * не засчитывается как использование.
 *
 * Компендиум обязан сканироваться тоже: roll-модификатор (kind: 'roll')
 * бывает не только у системы, но и у предмета — `compendium.items[*]
 * .modifiers`. Без этого сторож удаления мишени бросков не видел вещь,
 * которая на неё смотрит, и мишень можно было убрать у неё из-под ног. */
const usedIn = (system: System, compendium: Compendium, ...markers: string[]): boolean => {
  const text = JSON.stringify({ system, compendium });
  return markers.some(marker => text.includes(marker));
};

const parseFree = (text: string): number | string | boolean =>
  /^-?\d+(\.\d+)?$/.test(text) ? Number(text)
    : text === 'true' ? true
      : text === 'false' ? false
        : text;

/** Диапазоны с дырой или нахлёстом: отсортировать по `from`, у соседних
 * `to + 1` обязано равняться следующему `from`. Предупреждение, не запрет. */
const rangesBroken = (ranges: { from: number; to: number }[]): boolean => {
  if (ranges.length < 2) return false;
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  return sorted.some((r, i) => i > 0 && sorted[i - 1]!.to + 1 !== r.from);
};

/**
 * Ключ записи словаря выдаётся ОДИН раз, при создании, и больше не меняется.
 *
 * Раньше он следовал за названием, пока запись нигде не использовалась —
 * и это ломало ввод: ключ стоит в React-key строки, смена ключа
 * пересоздавала строку вместе с полем, фокус терялся, и набрать больше
 * одного слова было нельзя. А смысла в этом не было: ключ автор нигде
 * не печатает — подсказка по «@» ищет по НАЗВАНИЮ, ссылки хранят ключ.
 * Значит переименование всегда безопасно и ничего не переносит.
 */

const addDie = (editSystem: EditSystem) => editSystem(draft => {
  draft.constants ??= {};
  const key = freeId(Object.keys(draft.constants), 'кость');
  draft.constants[key] = { label: '', kind: 'die', dice: [{ count: 1, sides: 20 }] };
});

const addRollEdit = (editSystem: EditSystem) => editSystem(draft => {
  draft.roll_edits ??= {};
  const key = freeId(Object.keys(draft.roll_edits), 'правка');
  // Пустая правка ничего не делает и об этом честно говорит приговором:
  // угадывать за автора «наверное, преимущество» — ровно то, чего мы избегаем.
  draft.roll_edits[key] = { label: '', ops: [] };
});

const addRoll = (editSystem: EditSystem) => editSystem(draft => {
  draft.rolls ??= [];
  const tag = freeId(draft.rolls.map(r => r.tag), 'бросок');
  draft.rolls.push({ tag, label: '' });
});

const addTable = (editSystem: EditSystem) => editSystem(draft => {
  draft.tables ??= {};
  const key = freeId(Object.keys(draft.tables), 'таблица');
  draft.tables[key] = { label: '', ranges: [] };
});

const addActionType = (editSystem: EditSystem) => editSystem(draft => {
  draft.action_types ??= {};
  const key = freeId(Object.keys(draft.action_types), 'действие');
  draft.action_types[key] = { label: '' };
});

export function DictionariesTab() {
  const system = useWorld(s => s.system);
  const compendium = useWorld(s => s.compendium);
  const editSystem = useWorld(s => s.editSystem);

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
              <DiceSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>

            <Card>
              <CardHead
                title="Правки броска"
                sub="Преимущество, помеха и всё, что меняет бросок. Здесь только ЧТО это значит; когда включается — говорит эффект."
                actions={<Button size="sm" onClick={() => addRollEdit(editSystem)}>+ правка</Button>}
              />
              <RollEditsSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>

            <Card>
              <CardHead
                title="Виды бросков"
                sub="Чтобы можно было сказать «помеха только на атаки». Бросок «Любой» есть всегда, заводить его не надо."
                actions={<Button size="sm" onClick={() => addRoll(editSystem)}>+ вид</Button>}
              />
              <RollsSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>

            <Card>
              <CardHead
                title="Таблицы"
                sub="Ступеньки, которые формулой не сказать: бонус мастерства по уровню, исход хода по итогу броска."
                actions={<Button size="sm" onClick={() => addTable(editSystem)}>+ таблица</Button>}
              />
              <TablesSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>

            <Card>
              <CardHead
                title="Чего стоит действие"
                sub="Из этого списка эффект выбирает свою цену: действие, бонусное действие, реакция."
                actions={<Button size="sm" onClick={() => addActionType(editSystem)}>+ тип</Button>}
              />
              <ActionTypesSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>
          </>
        ),
      }}
    />
  );
}

// ── кости ────────────────────────────────────────────────────────────────

/** Чтение — как выпавшие кости становятся числом (спека «Что такое бросок»):
 * сумма (5e), лучшая (Blades), счёт успехов (Shadowrun). Имена — реестр
 * движка (engine/readings.ts), словарь их только показывает. */
function readKindOf(constant: SystemConstant): string {
  const read = constant.read;
  return typeof read === 'string' ? read : read?.kind ?? 'sum';
}

// Нотация набирается посимвольно («1», «1d», «1d2» — ни одно не разбирается
// как NdM), а поле было управляемым и откатывало onChange на каждой такой
// промежуточной строке — набрать «1d20» с клавиатуры было нельзя, работала
// только вставка готовой строки целиком. Тот же приём, что RollExprInput
// (card.tsx) и SlotInput (slot-input.tsx): набор живёт в местном черновике
// и коммитится по уходу с поля или Enter; Escape возвращает как было.
// Неразобранное — не молча отбрасывается, а показывается ошибкой поля.
function DiceSection({ system, compendium, editSystem }: Props) {
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
        const inUse = usedIn(system, compendium, `"constant":"${key}"`);
        const total = diceCount(dice);
        // Выбор из одной кости — не выбор: спрашивать «что берём из выпавшего»
        // имеет смысл, только когда выпавшего больше одного.
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
          // Ключ строки — сам ключ словаря, не позиция: он неизменен,
          // поэтому строка привязана к записи и переживает и переименование,
          // и любую будущую перестановку.
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
                    // Сумма — умолчание движка: в данных её не пишем вовсе,
                    // старые миры и новые кости выглядят одинаково.
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

/**
 * Состав броска — строками, а не строкой текста.
 *
 * Было: одно поле, где «+» соединял части, а слово после кости молча
 * становилось её именем. Ни того, ни другого автор угадать не мог, а слово
 * «название» при этом стояло и слева, у самой записи. Здесь каждая часть —
 * своя строка со своими полями, «+ ещё часть» показывает, что части вообще
 * бывают, а счёт костей переключается между числом и полем листа кнопкой,
 * а не решёткой в тексте.
 */
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

// ── правки броска ───────────────────────────────────────────────────────
//
// Здесь автор заводит СВОЁ имя механики: «Преимущество», «Фора», «Ускорение».
// Слово доменное, а механике доменные слова запрещены — потому список имён
// нигде в коде не зашит. Что правка делает — набор примитивов из реестра
// движка; «гасится» — ссылка на другую правку, и это данные, а не закон.
//
// Строка устроена как карточка эффекта (card.tsx), а не как строка таблицы:
// сперва ПЕРЕСКАЗ словами — «Кинуть на кость больше, оставить лучшую» — и
// только под ним то, чем он набран. Машинный список «addDie · keepBest»
// не отвечает на вопрос «получилось ли то, что я хотел», а фраза отвечает.
// Карточки при этом не заводятся: Card в словарях один на секцию.

/** Короткая подпись примитива — только на фишке, фраза целиком в пересказе. */
function opWord(op: { op: string; [k: string]: unknown }): string {
  const key = paletteKeyOf(op);
  return editPalette().find(p => p.key === key)?.label ?? op.op;
}

/** Части составных костей мира: Надежда и Страх Daggerheart, десятки CoC.
 * Пусто — значит в этом мире составных костей нет, и спрашивать про часть
 * не у кого: селектор не появится вовсе. */
function partsOf(system: System): { name: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const constant of Object.values(system.constants ?? {})) {
    for (const term of constant.dice ?? []) {
      if (term.name && !seen.has(term.name)) seen.set(term.name, term.label || term.name);
    }
  }
  return [...seen].map(([name, label]) => ({ name, label }));
}

/** Примитивы, которые можно адресовать одной части броска. */
const PART_ABLE = ['addDie', 'keepBest', 'keepWorst', 'dieStep', 'explode'];

/** Параметр примитива правится прямо на фишке: он принадлежит ей, не строке. */
function OpChip({ op, parts, onNumber, onPart, onRemove }: {
  op: Record<string, unknown>;
  parts: { name: string; label: string }[];
  onNumber: (value: number) => void;
  onPart: (part: string) => void;
  onRemove: () => void;
}) {
  const numeric = 'n' in op ? 'n' : 'by' in op ? 'by' : null;
  // Про часть спрашиваем ТОЛЬКО там, где части есть. В мире с одной костью
  // (то есть почти всегда) этого селектора не существует.
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

function RollEditsSection({ system, compendium, editSystem }: Props) {
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
        const inUse = usedIn(system, compendium, `"edit":"${key}"`);
        // Ключ замораживает и ссылка «гасится» с чужой записи: без этого
        // переименование правки, которую никто не носит, но которой кто-то
        // гасится, рвало бы связь молча.
        const named = inUse || usedIn(system, compendium, `"canceledBy":"${key}"`);
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
                  // Забрать за собой встречную ссылку: «гасится тем, чего нет»
                  // — это ошибка, а не пустое поле.
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

            {/* Гашение — тонкость: в большинстве миров его либо нет вовсе,
                либо это одна привычная пара. На виду ему делать нечего —
                тот же приём, что у «Тонкостей» карточки шага.
                И ставится оно ОДИН раз на обе записи: гашение взаимно,
                а два поля про одно и то же — это старая стена настроек
                «что с чем взаимодействует». */}
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
                    // Прежняя пара распадается целиком, новая связывается тоже
                    // целиком: автор говорит «эти две гасят друг друга» один раз.
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


// ── мишени бросков ──────────────────────────────────────────────────────

function RollsSection({ system, compendium, editSystem }: Props) {
  const rolls = system.rolls ?? [];

  return (
    <div className="stack stack--tight">
      <span className="faint">Проверки по полям («Проверка Ловкости») включаются на «Листе».</span>
      {rolls.length === 0 ? (
        <span className="faint">Видов бросков пока нет.</span>
      ) : rolls.map((roll, index) => {
        const inUse = usedIn(system, compendium, `"check":"${roll.tag}"`, `"target":"${roll.tag}"`);
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

// ── таблицы по диапазонам ───────────────────────────────────────────────

function TablesSection({ system, compendium, editSystem }: Props) {
  const entries = Object.entries(system.tables ?? {});

  return (
    <div className="stack stack--tight">
      {entries.length === 0 ? (
        <span className="faint">Таблиц пока нет — например, бонус мастерства по уровню.</span>
      ) : entries.map(([key, table]) => (
        <TableRow key={key} id={key} table={table} system={system} compendium={compendium} editSystem={editSystem} />
      ))}
    </div>
  );
}

function TableRow({ id, table, system, compendium, editSystem }: Props & { id: string; table: RangeTable }) {
  const ranges = table.ranges ?? [];
  const inUse = usedIn(system, compendium, `"table":"${id}"`);
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

// ── типы действий ───────────────────────────────────────────────────────

function ActionTypesSection({ system, compendium, editSystem }: Props) {
  const entries = Object.entries(system.action_types ?? {});

  return (
    <div className="stack stack--tight">
      <span className="faint">Чего стоит активируемый эффект — выбирается из этого списка.</span>
      {entries.length === 0 ? (
        <span className="faint">Типов пока нет.</span>
      ) : entries.map(([key, type]) => {
        const inUse = usedIn(system, compendium, `"cost":"${key}"`);
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

/**
 * Число с черновиком: цифру можно СТЕРЕТЬ и набрать заново. Без черновика
 * пустота не проходила проверку и инпут тут же затирал её прежним значением —
 * «6 → 12» требовало выделить и перепечатать. Ушёл фокус — число из данных.
 */
function DraftNum({ value, least, onCommit }: {
  value: number;
  least: number;
  onCommit: (n: number) => void;
}) {
  return <NumInput mono int least={least} value={value} onCommit={onCommit} />;
}

/** Число в чипе примитива — тот же черновик, но своим классом. */
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
