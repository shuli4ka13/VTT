// Палитра доноров: готовые куски из образцовых систем.
//
// Правило копирования, выстраданное в PoC: блок приезжает ЦЕЛИКОМ и В ВЕРНОМ
// ПОРЯДКЕ. Навыки зависят от модификаторов, модификаторы — от характеристик;
// взять одни «Навыки» и получить восемнадцать полей со сломанными ссылками —
// не помощь, а ловушка. Поэтому берётся транзитивное замыкание по БЛОКАМ
// и раскладывается топологически: сначала то, от чего зависят.
//
// Что НЕ едет вместе с блоком: рода записей компендиума. Род — это форма
// заполнения компендиума, а не часть листа; заводить его за автора значит
// решать за него, что у него вообще бывают предметы.

import { useMemo, useState } from 'react';
import { useWorld } from '../../store/world.ts';
import { Select, Empty } from '../../ui/primitives.tsx';
import type { System, Field, Effect } from '@vtt/schema';
import { SAMPLE_SYSTEMS } from '@vtt/engine/model/systems';
import { compile } from '@vtt/engine/formula';

const DONORS = SAMPLE_SYSTEMS as System[];

export function DonorPalette({ kind }: { kind: 'blocks' | 'effects' }) {
  const [donorId, setDonorId] = useState<string>('*');
  const donors = donorId === '*' ? DONORS : DONORS.filter(d => d.id === donorId);

  return (
    <div className="stack">
      <Select
        value={donorId}
        options={[['*', 'все системы'], ...DONORS.map(d => [d.id ?? '', d.name ?? ''] as const)] as never}
        onChange={setDonorId}
      />
      {donors.map(donor => (
        <div key={donor.id} className="stack stack--tight">
          <span className="field__label">{donor.name}</span>
          {kind === 'blocks' ? <Blocks donor={donor} /> : <Effects donor={donor} />}
        </div>
      ))}
    </div>
  );
}

// ── блоки полей ─────────────────────────────────────────────────────────

/**
 * Ищет по образцам поле с данным тегом и возвращает его донора и блок.
 * Вход задачи 3: карточка шага знает только тег отсутствующего поля
 * (`problem.missingField`), а кнопка чинит его блоком — надо найти, откуда.
 */
export function findDonorBlock(tag: string): { donor: System; group: string } | null {
  for (const donor of DONORS) {
    const field = donor.fields.find(f => f.tag === tag);
    if (field) return { donor, group: field.group ?? 'Без блока' };
  }
  return null;
}

/**
 * Копирует блок целиком — с транзитивными зависимостями по блокам,
 * в топологическом порядке (см. заголовок файла). Вынесено из `Blocks`,
 * чтобы кнопка починки в карточке шага (задача 3) переиспользовала то же
 * правило копирования, а не заводила своё.
 */
export function copyDonorBlock(
  editSystem: (edit: (draft: System) => void) => void,
  donor: System,
  group: string,
): void {
  const order = orderedBlocks(donor, neededBlocks(donor, group));
  editSystem(draft => {
    const present = new Set(draft.fields.map(f => f.tag));
    for (const block of order) {
      for (const field of donor.fields.filter(f => (f.group ?? 'Без блока') === block)) {
        if (present.has(field.tag)) continue;
        draft.fields.push(structuredClone(field));
        present.add(field.tag);

        // Таблица — часть правила поля, без неё оно не считается.
        if (field.value.kind === 'table' && donor.tables?.[field.value.table]) {
          draft.tables = draft.tables ?? {};
          draft.tables[field.value.table] ??= structuredClone(donor.tables[field.value.table]!);
        }
      }
    }
  });
}

function Blocks({ donor }: { donor: System }) {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);

  const blocks = useMemo(() => {
    const names = new Map<string, number>();
    for (const field of donor.fields) {
      const key = field.group ?? 'Без блока';
      names.set(key, (names.get(key) ?? 0) + 1);
    }
    return [...names];
  }, [donor]);

  const have = new Set(system.fields.map(f => f.tag));

  const copy = (group: string) => copyDonorBlock(editSystem, donor, group);

  return (
    <div className="palette">
      {blocks.map(([group, count]) => {
        const fields = donor.fields.filter(f => (f.group ?? 'Без блока') === group);
        const already = fields.every(f => have.has(f.tag));
        const brings = orderedBlocks(donor, neededBlocks(donor, group));

        return (
          <button
            key={group}
            type="button"
            className="card card--pick"
            disabled={already}
            onClick={() => copy(group)}
            style={already ? { opacity: 0.5, cursor: 'default' } : undefined}
          >
            <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{group}</span>
            <span className="card__sub">
              {already ? 'уже в системе' : `полей: ${count}`}
              {!already && brings.length > 1 ? ` · приедет с ${brings.length - 1} блоком(ами)` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Транзитивное замыкание по БЛОКАМ: поле тянет блок целиком, а не одно поле. */
function neededBlocks(donor: System, group: string): Set<string> {
  const blockOf = new Map(donor.fields.map(f => [f.tag, f.group ?? 'Без блока']));
  const need = new Set([group]);
  const queue = [group];

  while (queue.length) {
    const current = queue.shift()!;
    for (const tag of blockDeps(donor, current)) {
      const block = blockOf.get(tag);
      if (!block || need.has(block)) continue;
      need.add(block);
      queue.push(block);
    }
  }
  return need;
}

function blockDeps(donor: System, group: string): string[] {
  const out: string[] = [];
  for (const field of donor.fields) {
    if ((field.group ?? 'Без блока') !== group) continue;
    const source = field.value.kind === 'formula' ? field.value.expr
      : field.value.kind === 'table' ? field.value.arg : '';
    if (!source) continue;
    try { out.push(...compile(source).deps); } catch { /* недописанная формула зависимостей не даёт */ }
  }
  return out;
}

/** Топологический порядок: сначала то, от чего зависят. */
function orderedBlocks(donor: System, blocks: Set<string>): string[] {
  const blockOf = new Map(donor.fields.map(f => [f.tag, f.group ?? 'Без блока']));
  const done: string[] = [];
  const seen = new Set<string>();

  const visit = (block: string) => {
    if (seen.has(block)) return;
    seen.add(block);
    for (const tag of blockDeps(donor, block)) {
      const dependency = blockOf.get(tag);
      if (dependency && dependency !== block && blocks.has(dependency)) visit(dependency);
    }
    done.push(block);
  };

  for (const block of blocks) visit(block);
  return done;
}

// ── эффекты ─────────────────────────────────────────────────────────────

function Effects({ donor }: { donor: System }) {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);

  const list = Object.entries(donor.effects);
  if (!list.length) return <Empty title="У этого донора эффектов нет" />;

  const copy = (id: string, effect: Effect) => {
    editSystem(draft => {
      draft.effects[id] = structuredClone(effect);

      // Законы мира, без которых эффект не заработает, едут вместе с ним:
      // кости, мишени бросков, типы действий. Поля листа — НЕ едут: это
      // отдельное решение автора, и оно принимается на вкладке «Лист».
      const text = JSON.stringify(effect);
      for (const [name, constant] of Object.entries(donor.constants ?? {})) {
        if (text.includes(`"constant":"${name}"`)) {
          draft.constants = draft.constants ?? {};
          draft.constants[name] ??= structuredClone(constant);
        }
      }
      for (const roll of donor.rolls ?? []) {
        if (text.includes(`"${roll.tag}"`)) {
          draft.rolls = draft.rolls ?? [];
          if (!draft.rolls.some(r => r.tag === roll.tag)) draft.rolls.push({ ...roll });
        }
      }
      // Правки броска — такой же закон мира: эффект «Тяжёлый доспех мешает»
      // ссылается на запись «Помеха», и без неё приедет ссылка в пустоту.
      // Вместе с записью едет и та, которой она гасится: пара «преимущество —
      // помеха» без второй половины гасить нечем.
      const bringEdit = (key: string) => {
        const edit = donor.roll_edits?.[key];
        if (!edit) return;
        draft.roll_edits = draft.roll_edits ?? {};
        if (draft.roll_edits[key]) return;
        draft.roll_edits[key] = structuredClone(edit);
        if (edit.canceledBy) bringEdit(edit.canceledBy);
      };
      for (const mod of effect.modifiers ?? []) {
        if (mod.kind === 'roll' && mod.edit) bringEdit(mod.edit);
      }
      if (effect.cost && donor.action_types?.[effect.cost]) {
        draft.action_types = draft.action_types ?? {};
        draft.action_types[effect.cost] ??= structuredClone(donor.action_types[effect.cost]!);
      }
    });
    pick({ activeEffectId: id });
  };

  return (
    <div className="palette">
      {list.map(([id, effect]) => {
        const already = Boolean(system.effects[id]);
        return (
          <button
            key={id}
            type="button"
            className="card card--pick"
            disabled={already}
            onClick={() => copy(id, effect)}
            style={already ? { opacity: 0.5, cursor: 'default' } : undefined}
          >
            <span className="card__title" style={{ fontSize: 'var(--fs-4)' }}>{effect.label ?? id}</span>
            <span className="card__sub">
              {already ? 'уже в системе' : `${effect.category ?? 'Механики'} · ${activationWord(effect)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const activationWord = (effect: Effect) =>
  effect.activation === 'passive' ? 'пассивный'
    : effect.activation === 'triggered' ? 'триггерный' : 'активируемый';

