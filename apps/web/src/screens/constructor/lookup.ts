import { ownerOf, OWNER_WORDS } from '@vtt/engine/engine/owners';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { splitPath } from '@vtt/engine/engine/navigate';
import { choiceTableOf } from '@vtt/engine/model/lists';
import { recordsOf, argsWithProps, propKeysOf, recordKinds } from '@vtt/engine/model/owned';
import { kindWord } from '@vtt/engine/words/kinds';
import type { RefKind } from '@vtt/engine/model/references';
import type { System, Compendium, Effect } from '@vtt/schema';
import { fieldPaths } from '../../ui/paths.ts';
import { formulaAsLabels } from '../../ui/formula.tsx';
import { asDice } from '../../words.ts';
import { outputLabel, EVENT_NAMES } from './slots.tsx';
import type { EarlierStep } from './slots.tsx';
import { usersOf } from './usage.ts';
import type { UsageIndex } from './usage.ts';
import type { WorldState } from '../../store/world.ts';
import { fieldOf } from '@vtt/engine/model/sheet-columns';

type Pick = Parameters<WorldState['pick']>[0];

export interface Explained {
  kind: string;
  title: string;
  facts: [string, string][];
  from: string[];
  shown: string[];
  users: string[];
  field?: string;
  go?: { label: string; pick: Pick };
}

const ASK_WORDS: Record<string, string> = { actor: 'спросят игрока', gm: 'спросят ведущего' };


type Loose = Record<string, any>;

function stepsOf(effect: Effect | undefined): EarlierStep[] {
  const out: EarlierStep[] = [];
  const all = [...(effect?.self ?? []), ...(effect?.steps ?? [])] as Loose[];
  all.forEach((step, index) => { if (step.id) out.push({ id: String(step.id), type: String(step.type), at: index + 1 }); });
  return out;
}

const argText = (arg: unknown, props: ReadonlySet<string> = new Set()): string => {
  if (arg === null || arg === undefined || arg === '') return '';
  if (typeof arg !== 'object') return String(arg);
  const a = arg as Loose;
  if ('prop' in a) return `свойство записи «${a.prop}»`;
  if ('const' in a) return String(a.const);
  if ('expr' in a) {
    const lone = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String(a.expr));
    return lone && props.has(lone[1]!) ? `свойство записи «${lone[1]}»` : String(a.expr);
  }
  if ('table' in a) return `таблица «${a.table}» → ${a.column ?? 'значение'}`;
  if ('param' in a) return `вход «${a.param}»`;
  return JSON.stringify(a);
};

function callersOf(system: System, effectId: string, key: string): string[] {
  const out: string[] = [];
  for (const [kindKey, kind] of recordKinds(system)) {
    for (const binding of kind.bindings ?? []) {
      if (binding.effect !== effectId) continue;
      const props = propKeysOf(kind);
      const text = argText(argsWithProps(system, binding, props)?.[key], props);
      out.push(`тип записи «${kind.label ?? kindKey}»${binding.label ? ` · «${binding.label}»` : ''}: ${text || 'не передаёт'}`);
    }
  }
  for (const [id, effect] of Object.entries(system.effects ?? {})) {
    for (const step of [...(effect.self ?? []), ...(effect.steps ?? [])] as Loose[]) {
      if (step.type !== 'emit' || step.event !== effectId) continue;
      const text = argText(step.args?.[key]);
      out.push(`эффект «${effect.label ?? id}» зовёт: ${text || 'не передаёт'}`);
    }
  }
  return out;
}

const usersBy = (usage: UsageIndex, kind: RefKind, key: string, system: System) => usersOf(usage, kind, key, system);

export function explainName(
  system: System, compendium: Compendium | undefined, effectId: string | null, name: string, usage: UsageIndex,
): Explained {
  const owned = ownerOf(name);
  const rest = owned?.rest ?? name;
  const owner = owned ? `лист ${OWNER_WORDS[owned.owner]}` : null;
  const effect = effectId ? system.effects?.[effectId] : undefined;
  const params = effect?.params ?? [];
  const head = splitPath(rest)?.head ?? rest;
  const earlier = stepsOf(effect);
  const ownerFact: [string, string][] = owner ? [['чьё', owner]] : [];

  const event = EVENT_NAMES.find(([key]) => key === rest);
  if (event) {
    return {
      kind: 'пришло в вызов', title: event[1], facts: [], users: [], shown: [],
      from: ['число, с которым этот эффект позвали; «после правок цели» — уже с сопротивлениями'],
    };
  }

  if (earlier.some(step => step.id === head) && !params.some(p => p.key === head)) {
    return {
      kind: 'результат шага', title: outputLabel(rest, earlier), facts: [], users: [], shown: [],
      from: ['считается выше по цепочке этого эффекта'],
    };
  }

  const param = params.find(p => p.key === head);
  if (param && effectId) {
    const decl = param as Loose;
    const table = decl.from ? system.tables?.[decl.from] : undefined;
    if (rest !== head) {
      const columnKey = rest.slice(head.length + 1);
      const column = table?.columns?.find(c => c.key === columnKey);
      return {
        kind: 'колонка по выбору',
        title: `${table?.label ?? decl.from} → ${column?.label ?? columnKey}`,
        facts: [...ownerFact, ['строка', `та, что пришла во входе «${param.label ?? param.key}»`],
          ...(column?.kind === 'expr' ? [['считается', `${owner ?? 'листом, где читают'} — формулой из ячейки`] as [string, string]] : [])],
        from: callersOf(system, effectId, param.key),
        shown: [], users: [],
        ...(decl.from ? { go: { label: `открыть таблицу «${table?.label ?? decl.from}»`, pick: { activeTab: 'dictionaries', activeTableId: decl.from } } } : {}),
      };
    }
    const asks = decl.ask ? ASK_WORDS[String(decl.ask.by ?? 'actor')] ?? 'спросят за столом' : null;
    return {
      kind: 'вход эффекта',
      title: param.label ?? param.key,
      facts: [
        ['тип', kindWord(decl.kind)],
        ...(table ? [['таблица', table.label ?? String(decl.from)] as [string, string]] : []),
        ['если не передали', asks ?? (decl.optional ? 'пусто' : 'эффект не сработает')],
      ],
      from: callersOf(system, effectId, param.key),
      shown: asks ? [`за столом: ${asks}${decl.ask?.hint ? ` — «${decl.ask.hint}»` : ''}`] : [],
      users: [],
    };
  }

  const field = fieldOf(system, rest);
  if (field) {
    const value = field.value as Loose;
    const how = value.kind === 'formula' ? `формула ${formulaAsLabels(system, String(value.expr))}`
      : value.kind === 'table' ? `по таблице «${system.tables?.[value.table]?.label ?? value.table}»`
        : `хранится, по умолчанию ${String(value.default ?? '—')}`;
    return {
      kind: field.lives === 'desk' ? 'поле стола' : field.lives === 'group' ? 'поле группы' : 'поле листа',
      title: field.label ?? field.tag,
      facts: [...ownerFact, ['как получается', how]],
      from: [value.kind === 'stored' ? 'вписывают на листе или меняют эффекты' : 'считается само из других полей'],
      shown: [field.lives === 'desk' ? 'на листе стола' : field.lives === 'group' ? 'на листе группы, если лист в группе; иначе на своём' : `на листе, блок «${field.group ?? 'без блока'}»`],
      users: usersBy(usage, 'field', field.tag, system),
      field: field.tag,
      go: { label: 'открыть на вкладке «Лист»', pick: { activeTab: 'sheet', activeFieldTag: field.tag } },
    };
  }

  const path = fieldPaths(system).get(rest);
  if (path) {
    const base = fieldOf(system, head);
    const table = choiceTableOf(base);
    return {
      kind: 'колонка по полю',
      title: path,
      facts: [...ownerFact, ['строка', `та, что выбрана в поле «${base?.label ?? head}»`]],
      from: [`таблица «${system.tables?.[table ?? '']?.label ?? table}»`],
      shown: [], users: [],
      ...(table ? { go: { label: 'открыть таблицу', pick: { activeTab: 'dictionaries', activeTableId: table } } } : {}),
    };
  }

  const hung = system.effects?.[rest];
  if (hung && rest !== effectId) {
    return {
      kind: 'висит на листе',
      title: hung.label ?? rest,
      facts: [...ownerFact, ['число', 'сколько раз висит: 0 — нет, 1 — висит, больше — наложен несколько раз']],
      from: ['вешают шаги «повесить» в эффектах и надетые вещи; снимают шаги, срок и связь'],
      shown: ['на листе среди висящих эффектов'],
      users: usersBy(usage, 'field', rest, system),
      go: { label: `открыть «${hung.label ?? rest}»`, pick: { activeTab: 'effects', activeEffectId: rest } },
    };
  }

  const constant = system.constants?.[rest];
  if (constant) {
    const dice = (constant.dice ?? []).map(d => asDice(`${typeof d.count === 'number' ? d.count : 1}d${d.sides}`)).join(' + ');
    return {
      kind: 'кость системы',
      title: constant.label ?? rest,
      facts: [...ownerFact, ['кости', dice || '—'], ...(owner ? [['кто бросает', owner.replace('лист ', '')] as [string, string]] : [])],
      from: ['раздел «Кости» на вкладке «Правила»'],
      shown: [], users: usersBy(usage, 'constant', rest, system),
      go: { label: 'открыть «Правила»', pick: { activeTab: 'dictionaries' } },
    };
  }

  const table = tagWords(system).get(rest);
  if (table) {
    const [tableKey, spec] = Object.entries(system.tables ?? {}).find(([, t]) => (t.rows ?? []).some(r => r.value === rest))!;
    const row = (spec.rows ?? []).find(r => r.value === rest);
    const cells = (spec.columns ?? []).map(c => [c.label ?? c.key, String((row?.cells ?? {})[c.key] ?? '—')] as [string, string]);
    return {
      kind: 'метка броска',
      title: rest,
      facts: [['таблица', table], ...cells],
      from: ['строка таблицы — бросок с этой меткой находят правки «на бросок с меткой»'],
      shown: [], users: usersBy(usage, 'roll', rest, system),
      go: { label: `открыть таблицу «${table}»`, pick: { activeTab: 'dictionaries', activeTableId: tableKey } },
    };
  }

  for (const [kindKey, kind] of recordKinds(system)) {
    const prop = (kind.columns ?? []).find(p => p.key === head);
    if (!prop) continue;
    const records = recordsOf(compendium).filter(r => r.table === kindKey);
    return {
      kind: 'свойство записи',
      title: `${prop.label ?? prop.key} · ${kind.label ?? kindKey}`,
      facts: [['тип', kindWord(prop.kind)]],
      from: [`заполняют записи компендиума типа «${kind.label ?? kindKey}»: ${records.length}`],
      shown: [], users: [],
      go: { label: 'открыть «Типы записей»', pick: { activeTab: 'records', activeRecordKind: kindKey } },
    };
  }

  return {
    kind: 'не найдено', title: name, facts: [], users: [], shown: [],
    from: ['такого имени нет ни в листе, ни во входах, ни в таблицах'],
  };
}
