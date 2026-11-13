import type { System, Modifier, Table } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { tableBy, columnBy, fieldBy, same, reads, exprOf, errorsOf } from '../find.ts';
import { problemsClean } from './first-system.ts';
import { Views } from '@vtt/engine/core/view';
import { ROW } from '@vtt/engine/model/sheet-columns';
import type { System as EngineSystem, Sheet, Compendium } from '@vtt/engine/model/types';
import seed from '../seeds/templates.json' with { type: 'json' };

const CARD = 'Как считаются поля у этого типа';

const kind = (view: View): [string, { modifiers?: Modifier[] }] | undefined =>
  Object.entries(view.system.sheets ?? {}).find(([, one]) => same(one.label, 'По заготовке'));
const skills = (view: View): [string, Table] | undefined => tableBy(view.system, 'Навыки');
const presets = (view: View): [string, Table] | undefined => tableBy(view.system, 'Заготовки');
const rankKey = (view: View): string | undefined => columnBy(skills(view)?.[1], 'Ранг')?.key;
const presetTag = (view: View): string | undefined => fieldBy(view.system, 'Заготовка')?.tag;
const mods = (view: View): Modifier[] => (kind(view)?.[1].modifiers ?? []).filter(modifier => modifier.kind === 'value');
const loose = (modifier: Modifier) => modifier as unknown as { target?: string; op?: string; value?: unknown; if?: unknown };

const everyRank = (view: View, modifier: Modifier): boolean => {
  const table = skills(view)?.[0];
  const column = rankKey(view);
  return Boolean(table && column && loose(modifier).target === `cell:${table}.*.${column}`);
};

const aimed = (view: View): Modifier | undefined => mods(view).find(modifier => everyRank(view, modifier));
const fromPreset = (view: View): boolean => {
  const found = aimed(view);
  const tag = presetTag(view);
  return Boolean(found && tag && loose(found).op === 'set' && reads(loose(found).value, `@${tag}.[@${ROW}]`));
};
const whenPreset = (view: View): boolean => {
  const found = aimed(view);
  const tag = presetTag(view);
  return Boolean(found && tag && reads(loose(found).if, `@${tag}`) && exprOf(loose(found).if).includes('пусто'));
};

const ranksFollow = (view: View): boolean => {
  const id = kind(view)?.[0];
  const rows = presets(view)?.[1].rows ?? [];
  const names = (skills(view)?.[1].rows ?? []).map(row => String(row.value));
  const tag = presetTag(view);
  const table = skills(view)?.[0];
  const column = rankKey(view);
  if (!id || !tag || !table || !column || !rows.length) return false;
  try {
    return rows.every(row => {
      const pawn = { id: 'проба', systemId: 'x', of: id, name: 'проба', values: { [tag]: row.value }, has: [], effects: [] } as unknown as Sheet;
      const looked = new Views(view.system as unknown as EngineSystem, { records: [] } as unknown as Compendium).of([pawn], 'проба');
      return names.every(name => {
        const key = name.replace(/\s+/g, '_');
        return looked.resolve(`${table}.${key}.${column}`) === Number((row.cells ?? {})[key] ?? 0);
      });
    });
  } catch { return false; }
};

const taught = (view: View): boolean => {
  const rows = presets(view)?.[1].rows ?? [];
  return rows.length >= 3 && rows.some(row => Object.values(row.cells ?? {}).some(cell => typeof cell === 'number' && cell > 0));
};

export const templates: Lesson = {
  id: 'templates',
  title: 'Заготовки: правка всей колонки',
  sub: 'Тип листа «По заготовке» одной правкой заполняет колонку «Ранг» у всех навыков из выбранной заготовки.',
  seed: seed as unknown as System,
  tab: 'sheet',
  chapters: [
    { title: 'Правка колонки', sum: 'У типа «По заготовке» есть правка, которая целится в «Ранг» у каждого навыка сразу и задаёт его.' },
    { title: 'Откуда берём', sum: '«Ранг» навыка берётся из строки заготовки, в которой столбец называется как навык. Без выбранной заготовки правка молчит. Ошибок нет.' },
    { title: 'Сами', sum: 'Вы добавили новую заготовку, и ранги у листа с ней сошлись со строкой без подсказок.' },
  ],
  steps: [
    {
      id: 'open',
      chapter: 'Правка колонки',
      lead: 'Заготовка — готовый набор рангов: «Громила» силён в ближнем бою, «Стрелок» в стрельбе. Каждая заготовка — строка в таблице «Заготовки», а столбцы названы как навыки. Чтобы не заводить ранги руками, тип листа «По заготовке» заполнит всю колонку «Ранг» у навыков из выбранной заготовки.',
      tab: 'sheet',
      say: 'Откройте тип листа «По заготовке».',
      at: { text: 'По заготовке', in: 'Листы' },
      via: { text: 'блоки и типы листов' },
      done: view => Boolean(kind(view)) && view.sheetKind === kind(view)?.[0],
      result: () => 'Тип «По заготовке» открыт.',
    },
    {
      id: 'target',
      chapter: 'Правка колонки',
      tab: 'sheet',
      say: 'Добавьте правку и нацельте её на «Ранг» у каждого навыка сразу.',
      hint: 'В «Что правим» ищите «Навыки → Ранг — у каждой строки»: одна такая правка действует на все строки таблицы.',
      at: [
        { at: { text: '+ формула поля', in: CARD }, say: `В «${CARD}» нажмите «+ формула поля».`, done: view => mods(view).length > 0 },
        { at: { text: 'Что правим', in: CARD }, say: 'В «Что правим» выберите «Навыки → Ранг — у каждой строки».' },
      ],
      via: [{ text: 'По заготовке', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => Boolean(aimed(view)),
      result: () => 'Правка целится в «Навыки → Ранг — у каждой строки».',
    },
    {
      id: 'op',
      chapter: 'Правка колонки',
      tab: 'sheet',
      say: 'Пусть правка не прибавляет, а задаёт значение: в «Как» выберите «задать».',
      at: { text: 'Как', in: CARD },
      via: [{ text: 'По заготовке', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => Boolean(aimed(view)) && loose(aimed(view)!).op === 'set',
      result: () => 'Правка задаёт «Ранг».',
    },
    {
      id: 'value',
      chapter: 'Откуда берём',
      lead: 'Под правкой видно, что она делает словами. Теперь нужно сказать, какое число ставить: то, что стоит в строке выбранной заготовки на пересечении со столбцом навыка.',
      tab: 'sheet',
      say: 'В «На сколько» возьмите клетку заготовки по строке: название навыка совпадает со столбцом.',
      hint: 'Наберите «@» и в разделе «эта строка» выберите «Заготовка» → клетка этой строки. Его предлагают, потому что у «Заготовок» есть столбец на каждый навык.',
      at: { text: 'На сколько', in: CARD },
      via: [{ text: 'По заготовке', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: fromPreset,
      result: () => 'Ранг навыка берётся из столбца заготовки с тем же названием.',
    },
    {
      id: 'when',
      chapter: 'Откуда берём',
      tab: 'sheet',
      say: 'В «Только если» поставьте условие: заготовка выбрана.',
      hint: 'Нажмите на поле, наберите «@» и в «частых условиях» выберите «Заготовка» выбрано. Пока заготовки нет, правка не нужна.',
      at: { text: 'Только если', in: CARD },
      via: [{ text: 'По заготовке', in: 'Листы' }, { text: 'блоки и типы листов' }],
      done: view => fromPreset(view) && whenPreset(view),
      result: () => 'Правка действует, только если заготовка выбрана.',
    },
    {
      id: 'problems',
      chapter: 'Откуда берём',
      say: 'Нажмите «Проблемы» в шапке. Ошибок быть не должно.',
      at: { guide: 'problems' },
      done: problemsClean,
      result: () => 'Проблем нет.',
    },
    {
      id: 'more',
      chapter: 'Сами',
      lead: 'Последнее задание — без подсказок.',
      alone: true,
      tab: 'dictionaries',
      say: 'Заведите в «Заготовках» ещё одну заготовку с рангами, не равными нулю, и убедитесь, что лист с каждой заготовкой получает ранги из её строки.',
      hint: 'Таблица «Заготовки» — в «Правила» → «Таблицы». Новую строку заполните как «Громилу».',
      done: view => taught(view) && fromPreset(view) && ranksFollow(view) && errorsOf(view.system) === 0,
      result: () => 'У новой заготовки ранги берутся из её строки.',
    },
  ],
};
