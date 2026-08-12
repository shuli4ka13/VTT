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
import { useWorld, freeId, slugOf } from '../../store/world.ts';
import { Columns } from '../../ui/layout.tsx';
import { Card, CardHead, Input, Button, Fold, Verdict } from '../../ui/primitives.tsx';
import { normalizeDice } from './slot-input.tsx';
import type { System, Compendium, RangeTable } from '@vtt/schema';
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

/** Ключ записи словаря (кости, таблицы, типы действий — все `Record`)
 * следует за лейблом, пока запись нигде не используется; мутирует переданный
 * `dict` на месте — вызывающий уже держит клон-черновик из `editSystem`.
 *
 * Смена ключа не может быть delete+insert: у объекта это отправляет запись
 * в конец (порядок ключей — порядок вставки), а строки словаря рисуются по
 * этому же порядку. При двух и более записях автор печатает в поле первой,
 * а после первого же символа, сменившего ключ, оно физически уезжает вниз —
 * фокус остаётся на прежнем месте экрана, то есть теперь на ЧУЖОЙ строке.
 * Вместо этого объект пересобирается целиком, с новым ключом на месте
 * старого — позиция записи переживает переименование. */
function renameKeyed<T extends { label?: string }>(
  dict: Record<string, T>, id: string, label: string, inUse: boolean,
): void {
  const cur = dict[id];
  if (!cur) return;
  if (!inUse && slugOf(label)) {
    const fresh = freeId(Object.keys(dict).filter(k => k !== id), label);
    if (fresh !== id) {
      // Порядок читается ДО единой правки: если чистить и переставлять ключи
      // по одному, каждый нетронутый ключ тоже уедет в конец в момент своей
      // очереди — не поможет и та запись, которую переименовывать не просили.
      const ordered = Object.keys(dict).map((key): [string, T] =>
        key === id ? [fresh, { ...cur, label }] : [key, dict[key]!]);
      for (const key of Object.keys(dict)) delete dict[key];
      for (const [key, value] of ordered) dict[key] = value;
      return;
    }
  }
  cur.label = label;
}

/** То же самое для мишеней бросков — они не `Record`, а массив `{tag,label}`. */
function renameRoll(rolls: { tag: string; label: string }[], index: number, label: string, inUse: boolean): void {
  const cur = rolls[index];
  if (!cur) return;
  if (!inUse && slugOf(label)) {
    cur.tag = freeId(rolls.filter((_, i) => i !== index).map(r => r.tag), label);
  }
  cur.label = label;
}

const addDie = (editSystem: EditSystem) => editSystem(draft => {
  draft.constants ??= {};
  const key = freeId(Object.keys(draft.constants), 'кость');
  draft.constants[key] = { label: '', kind: 'die', dice: [{ count: 1, sides: 20 }] };
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
              <CardHead title="Кости" actions={<Button size="sm" onClick={() => addDie(editSystem)}>+ кость</Button>} />
              <DiceSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>

            <Card>
              <CardHead title="Мишени бросков" actions={<Button size="sm" onClick={() => addRoll(editSystem)}>+ мишень</Button>} />
              <RollsSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>

            <Card>
              <CardHead title="Таблицы по диапазонам" actions={<Button size="sm" onClick={() => addTable(editSystem)}>+ таблица</Button>} />
              <TablesSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>

            <Card>
              <CardHead title="Типы действий" actions={<Button size="sm" onClick={() => addActionType(editSystem)}>+ тип</Button>} />
              <ActionTypesSection system={system} compendium={compendium} editSystem={editSystem} />
            </Card>
          </>
        ),
      }}
    />
  );
}

// ── кости ────────────────────────────────────────────────────────────────

// Нотация набирается посимвольно («1», «1d», «1d2» — ни одно не разбирается
// как NdM), а поле было управляемым и откатывало onChange на каждой такой
// промежуточной строке — набрать «1d20» с клавиатуры было нельзя, работала
// только вставка готовой строки целиком. Тот же приём, что RollExprInput
// (card.tsx) и SlotInput (slot-input.tsx): набор живёт в местном черновике
// и коммитится по уходу с поля или Enter; Escape возвращает как было.
// Неразобранное — не молча отбрасывается, а показывается ошибкой поля.
function DiceNotationInput({ notation, onCommit }: { notation: string; onCommit: (norm: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const shown = draft ?? notation;

  const commit = () => {
    if (draft === null) return;
    const norm = normalizeDice(draft);
    if (!norm) { setTrouble(`не разобрать «${draft}» — нужна запись вида 1d20`); return; }
    onCommit(norm);
    setDraft(null);
    setTrouble(null);
  };

  return (
    <>
      <Input
        mono
        value={shown}
        placeholder="1d20"
        onChange={text => { setDraft(text); setTrouble(null); }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(null); setTrouble(null); }
        }}
      />
      {trouble ? <span className="field__error">{trouble}</span> : null}
    </>
  );
}

function DiceSection({ system, compendium, editSystem }: Props) {
  const entries = Object.entries(system.constants ?? {}).filter(([, c]) => c.kind === 'die');

  return (
    <div className="stack stack--tight">
      {entries.length === 0 ? (
        <span className="faint">Своих костей нет — броски берут ведущую кость системы.</span>
      ) : entries.map(([key, constant]) => {
        const dice = constant.dice ?? [];
        const compound = dice.length > 1 || dice.some(d => d.name);
        const inUse = usedIn(system, compendium, `"constant":"${key}"`);
        const notation = dice[0] ? `${dice[0].count ?? 1}d${dice[0].sides}` : '';

        return (
          // Ключ строки — сам ключ словаря, не позиция: переименование
          // (renameKeyed) меняет ключ на месте, не сдвигая порядок, но
          // строка обязана остаться ПРИВЯЗАНА к записи, а не к позиции —
          // иначе после любой будущей перестановки набор снова уедет не туда.
          <div key={key} className="dict-row">
            {compound ? (
              <>
                <span className="dict-row__static">{constant.label || key}</span>
                <span className="dict-row__static">составная — правится в данных</span>
              </>
            ) : (
              <>
                <Input
                  value={constant.label ?? ''}
                  placeholder="кость"
                  onChange={label => editSystem(draft => {
                    draft.constants ??= {};
                    renameKeyed(draft.constants, key, label, inUse);
                  })}
                />
                <DiceNotationInput
                  notation={notation}
                  onCommit={norm => {
                    const m = /^(\d+)d(\d+)$/.exec(norm)!;
                    editSystem(draft => {
                      const cur = draft.constants?.[key];
                      if (cur) cur.dice = [{ count: Number(m[1]), sides: Number(m[2]) }];
                    });
                  }}
                />
              </>
            )}
            <Button
              size="sm" variant="danger" disabled={inUse}
              title={inUse ? 'кость используется' : undefined}
              onClick={() => editSystem(draft => { delete draft.constants?.[key]; })}
            >
              Убрать
            </Button>
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
      <span className="faint">Чек-мишени полей включаются на «Листе».</span>
      {rolls.length === 0 ? (
        <span className="faint">Мишеней пока нет.</span>
      ) : rolls.map((roll, index) => {
        const inUse = usedIn(system, compendium, `"check":"${roll.tag}"`, `"target":"${roll.tag}"`);
        return (
          <div key={index} className="dict-row">
            <Input
              value={roll.label}
              placeholder="название мишени"
              onChange={label => editSystem(draft => {
                draft.rolls ??= [];
                renameRoll(draft.rolls, index, label, inUse);
              })}
            />
            <span className="chip mono">{roll.tag}</span>
            <Button
              size="sm" variant="danger" disabled={inUse}
              title={inUse ? 'мишень используется' : undefined}
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
            renameKeyed(draft.tables, id, label, inUse);
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
          <Input
            type="number"
            value={range.from}
            onChange={next => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.from = Number(next) || 0;
            })}
          />
          <Input
            type="number"
            value={range.to}
            onChange={next => editSystem(draft => {
              const r = draft.tables?.[id]?.ranges[i];
              if (r) r.to = Number(next) || 0;
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
                renameKeyed(draft.action_types, key, label, inUse);
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
