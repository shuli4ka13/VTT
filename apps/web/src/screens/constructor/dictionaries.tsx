// Словари системы: кости, мишени бросков, таблицы по диапазонам, типы
// действий. Раньше их заводил только образец (donor) — своей кости или
// своей таблицы завести было нельзя, и dogfood-критерий «образец D&D
// воспроизводим конструктором с нуля» был недостижим: бонус мастерства
// по уровню без таблиц по диапазонам не собрать.
//
// Список, а не карточки (design-note §4, «Плотность и тишина»): строка
// ~32px, разделяет только тонкая линия. Таблица — исключение: у неё есть
// вложенные диапазоны, и она раскрывается фолдом, но сама остаётся строкой
// списка, не карточкой.
//
// Инвариант «стабильный тег» соблюдён тем же приёмом, что и у поля
// (sheet-tab.tsx): ключ/тег свежей записи следует за лейблом, пока запись
// не встретилась нигде в мире; первая ссылка — замораживает его навсегда.

import { useWorld, freeId, slugOf } from '../../store/world.ts';
import { Input, Button, Fold, Verdict } from '../../ui/primitives.tsx';
import { normalizeDice } from './slot-input.tsx';
import type { System, RangeTable } from '@vtt/schema';
import type { WorldState } from '../../store/world.ts';

type EditSystem = WorldState['editSystem'];
interface Props { system: System; editSystem: EditSystem }

/** Мир сериализован — тот же приём, что и у «кто на это поле смотрит»
 * (whoUses, sheet-tab.tsx), только маркер точнее: не тег целиком, а его
 * СТРУКТУРНАЯ форма ссылки — так собственное определение записи в словаре
 * не засчитывается как использование. */
const usedIn = (system: System, ...markers: string[]): boolean => {
  const text = JSON.stringify({ system });
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
 * `dict` на месте — вызывающий уже держит клон-черновик из `editSystem`. */
function renameKeyed<T extends { label?: string }>(
  dict: Record<string, T>, id: string, label: string, inUse: boolean,
): void {
  const cur = dict[id];
  if (!cur) return;
  if (!inUse && slugOf(label)) {
    const fresh = freeId(Object.keys(dict).filter(k => k !== id), label);
    if (fresh !== id) {
      delete dict[id];
      dict[fresh] = { ...cur, label };
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

function SectionHead({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="inline">
      <span className="field__label">{title}</span>
      <span className="spacer" />
      <Button size="sm" onClick={onAction}>{action}</Button>
    </div>
  );
}

export function DictionariesFold({ system }: { system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const count = Object.keys(system.constants ?? {}).length
    + (system.rolls ?? []).length
    + Object.keys(system.tables ?? {}).length
    + Object.keys(system.action_types ?? {}).length;

  return (
    <Fold title="Словари" count={count}>
      <DiceSection system={system} editSystem={editSystem} />
      <RollsSection system={system} editSystem={editSystem} />
      <TablesSection system={system} editSystem={editSystem} />
      <ActionTypesSection system={system} editSystem={editSystem} />
    </Fold>
  );
}

// ── кости ────────────────────────────────────────────────────────────────

function DiceSection({ system, editSystem }: Props) {
  const entries = Object.entries(system.constants ?? {}).filter(([, c]) => c.kind === 'die');

  const add = () => editSystem(draft => {
    draft.constants ??= {};
    const key = freeId(Object.keys(draft.constants), 'кость');
    draft.constants[key] = { label: '', kind: 'die', dice: [{ count: 1, sides: 20 }] };
  });

  return (
    <div className="stack stack--tight">
      <SectionHead title="Кости" action="+ кость" onAction={add} />
      {entries.length === 0 ? (
        <span className="faint">Своих костей нет — броски берут ведущую кость системы.</span>
      ) : entries.map(([key, constant], index) => {
        const dice = constant.dice ?? [];
        const compound = dice.length > 1 || dice.some(d => d.name);
        const inUse = usedIn(system, `"constant":"${key}"`);
        const notation = dice[0] ? `${dice[0].count ?? 1}d${dice[0].sides}` : '';

        return (
          <div key={index} className="dict-row">
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
                <Input
                  mono
                  value={notation}
                  placeholder="1d20"
                  onChange={text => {
                    const norm = normalizeDice(text);
                    if (!norm) return;
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

function RollsSection({ system, editSystem }: Props) {
  const rolls = system.rolls ?? [];

  const add = () => editSystem(draft => {
    draft.rolls ??= [];
    const tag = freeId(draft.rolls.map(r => r.tag), 'бросок');
    draft.rolls.push({ tag, label: '' });
  });

  return (
    <div className="stack stack--tight">
      <SectionHead title="Мишени бросков" action="+ мишень" onAction={add} />
      <span className="faint">Чек-мишени полей включаются на «Листе».</span>
      {rolls.length === 0 ? (
        <span className="faint">Мишеней пока нет.</span>
      ) : rolls.map((roll, index) => {
        const inUse = usedIn(system, `"check":"${roll.tag}"`, `"target":"${roll.tag}"`);
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

function TablesSection({ system, editSystem }: Props) {
  const entries = Object.entries(system.tables ?? {});

  const add = () => editSystem(draft => {
    draft.tables ??= {};
    const key = freeId(Object.keys(draft.tables), 'таблица');
    draft.tables[key] = { label: '', ranges: [] };
  });

  return (
    <div className="stack stack--tight">
      <SectionHead title="Таблицы по диапазонам" action="+ таблица" onAction={add} />
      {entries.length === 0 ? (
        <span className="faint">Таблиц пока нет — например, бонус мастерства по уровню.</span>
      ) : entries.map(([key, table], index) => (
        <TableRow key={index} id={key} table={table} system={system} editSystem={editSystem} />
      ))}
    </div>
  );
}

function TableRow({ id, table, system, editSystem }: Props & { id: string; table: RangeTable }) {
  const ranges = table.ranges ?? [];
  const inUse = usedIn(system, `"table":"${id}"`);
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

function ActionTypesSection({ system, editSystem }: Props) {
  const entries = Object.entries(system.action_types ?? {});

  const add = () => editSystem(draft => {
    draft.action_types ??= {};
    const key = freeId(Object.keys(draft.action_types), 'действие');
    draft.action_types[key] = { label: '' };
  });

  return (
    <div className="stack stack--tight">
      <SectionHead title="Типы действий" action="+ тип" onAction={add} />
      <span className="faint">Чего стоит активируемый эффект — выбирается из этого списка.</span>
      {entries.length === 0 ? (
        <span className="faint">Типов пока нет.</span>
      ) : entries.map(([key, type], index) => {
        const inUse = usedIn(system, `"cost":"${key}"`);
        return (
          <div key={index} className="dict-row">
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
