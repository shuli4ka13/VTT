import { emittedChoices } from '@vtt/engine/model/payments';
import { TABS } from '../../words.ts';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { splitPath } from '@vtt/engine/engine/navigate';
import { choiceTableOf } from '@vtt/engine/model/lists';
import { recordsOf, argsWithProps, propKeysOf, recordKinds, isUnder } from '@vtt/engine/model/owned';
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
import { fieldOf, rowSteps, ROW } from '@vtt/engine/model/sheet-columns';

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
  const all = [...(effect?.cost ?? []), ...(effect?.steps ?? [])] as Loose[];
  all.forEach(step => { if (step.id) out.push({ id: String(step.id), type: String(step.type) }); });
  return out;
}

const argText = (arg: unknown, props: ReadonlySet<string> = new Set()): string => {
  if (arg === null || arg === undefined || arg === '') return '';
  if (typeof arg !== 'object') return String(arg);
  const a = arg as Loose;
  if ('expr' in a) {
    const lone = /^\s*@([\p{L}\p{N}_]+)\s*$/u.exec(String(a.expr));
    return lone && props.has(lone[1]!) ? `свойство записи «${lone[1]}»` : String(a.expr);
  }
  if ('table' in a) return `таблица «${a.table}» → ${a.column ?? 'значение'}`;
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
    for (const step of [...(effect.cost ?? []), ...(effect.steps ?? [])] as Loose[]) {
      if (step.type !== 'emit' || !emittedChoices(system, id, step.effect).includes(effectId)) continue;
      const text = argText(step.args?.[key]);
      out.push(`эффект «${effect.label ?? id}» зовёт: ${text || 'не передаёт'}`);
    }
  }
  return out;
}

const usersBy = (usage: UsageIndex, kind: RefKind, key: string, system: System) => usersOf(usage, kind, key, system);

function explainRow(system: System, tableId: string, name: string): Explained | null {
  const table = system.tables?.[tableId];
  const path = name.split('.').slice(1);
  if (!table || name.split('.')[0] !== ROW) return null;
  const rows = table.rows ?? [];
  const first = rows[0];
  const steps = rowSteps(system, tableId, path, first);
  if (path.length && !steps.length) return null;
  const tableName = table.label || tableId;
  const facts: [string, string][] = [['строка', `та же, что у клетки: своя у каждой строки «${tableName}»`]];
  steps.forEach((step, index) => {
    const linked = index < steps.length - 1;
    facts.push([step.column, linked
      ? `колонка таблицы «${step.table}» — ссылка: ведёт в строку другой таблицы`
      : `колонка таблицы «${step.table}»`]);
  });
  const example = first && steps.length
    ? `у «${first.label ?? String(first.value)}»: ${[...steps].reverse().find(step => step.via)?.via ?? first.label ?? String(first.value)} · ${steps[steps.length - 1]!.column}`
    : null;
  const target = steps.length ? steps[steps.length - 1]!.key : tableId;
  return {
    kind: 'клетка этой строки',
    title: steps.length ? steps.map(step => step.column).join(' · ') : 'эта строка',
    facts: example ? [...facts, ['пример', example]] : facts,
    from: [`формула колонки одна на все строки таблицы «${tableName}»; у каждой строки «строка» — она сама`],
    shown: [], users: [],
    ...(target ? { go: { label: 'открыть таблицу', pick: { activeTab: 'dictionaries', activeTableId: target } } } : {}),
  };
}

export function explainName(
  system: System, compendium: Compendium | undefined, effectId: string | null, name: string, usage: UsageIndex, tableId?: string,
): Explained {
  const own = tableId ? explainRow(system, tableId, name) : null;
  if (own) return own;
  const effect = effectId ? system.effects?.[effectId] : undefined;
  const params = effect?.params ?? [];
  const dot = name.indexOf('.');
  const sheet = dot > 0 ? params.find(p => p.kind === 'sheet' && p.key === name.slice(0, dot)) ?? (['носитель', 'стол', 'цель'].includes(name.slice(0, dot)) ? { key: name.slice(0, dot), label: name.slice(0, dot) } : undefined) : undefined;
  const rest = sheet ? name.slice(dot + 1) : name;
  const owner = sheet ? `лист «${sheet.label ?? sheet.key}»` : null;
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
          ...(column?.expr ? [['считается', `${owner ?? 'листом, где читают'} — формулой колонки`] as [string, string]] : [])],
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
      kind: field.lives === 'desk' ? 'колонка стола' : field.lives === 'group' ? 'колонка группы' : 'колонка листа',
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
      shown: [], users: [...new Set([...usersBy(usage, 'roll', rest, system), ...usersBy(usage, 'tag', rest, system)])],
      go: { label: `открыть таблицу «${table}»`, pick: { activeTab: 'dictionaries', activeTableId: tableKey } },
    };
  }

  for (const [kindKey, kind] of recordKinds(system)) {
    const prop = (kind.columns ?? []).find(p => p.key === head);
    if (!prop) continue;
    const records = recordsOf(compendium).filter(r => isUnder(system, r.table, kindKey));
    return {
      kind: 'свойство записи',
      title: `${prop.label ?? prop.key} · ${kind.label ?? kindKey}`,
      facts: [['тип', kindWord(prop.kind)]],
      from: [`заполняют записи компендиума типа «${kind.label ?? kindKey}»: ${records.length}`],
      shown: [], users: [],
      go: { label: `открыть «${TABS.records}»`, pick: { activeTab: 'records', activeRecordKind: kindKey } },
    };
  }

  return {
    kind: 'не найдено', title: name, facts: [], users: [], shown: [],
    from: ['такого имени нет ни в листе, ни во входах, ни в таблицах'],
  };
}
