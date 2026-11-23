import type { System, Modifier, Table } from '@vtt/schema';
import type { Lesson, View } from '../types.ts';
import { tableBy, columnBy, fieldBy, same, is, figure, errorsOf, FORMULA_DONE, barOpen, barText } from '../find.ts';
import { problemsClean } from '../find.ts';
import { Views, ROW } from '@vtt/engine';
import type { System as EngineSystem, Sheet, Compendium } from '@vtt/engine';
import { lazyLesson, seedIn } from '../lazy.ts';
import seed from '../seeds/templates.json' with { type: 'json' };

const loose = (modifier: Modifier) => modifier as unknown as { target?: string; op?: string; value?: unknown; if?: unknown };

export const templates: Lesson = lazyLesson('templates', words => {
  const { t } = words;
  const KIND = t('lessonTemplates:name.kind');
  const SKILLS = t('lessonTemplates:name.skills');
  const PRESETS = t('lessonTemplates:name.presets');
  const RANK = t('lessonTemplates:name.rank');
  const PRESET = t('lessonTemplates:name.preset');
  const CARD = t('records:sheetKind.fields.title');
  const SHEETS = t('rolls:character.title');
  const KINDS = t('sheetTab:tab.viewKinds');
  const TARGET = t('fields:mod.target');
  const HOW = t('fields:mod.how');
  const AMOUNT = t('fields:mod.amount');
  const IF_ONLY = t('fields:cond.title');
  const COLUMN = t('lessonTemplates:chapter.column.title');
  const SOURCE = t('lessonTemplates:chapter.source.title');
  const ALONE = t('lessonTemplates:chapter.alone.title');
  const PROBE = 'probe';

  const kind = (view: View): [string, { modifiers?: Modifier[] }] | undefined =>
    Object.entries(view.system.sheets ?? {}).find(([, one]) => same(one.label, KIND));
  const skills = (view: View): [string, Table] | undefined => tableBy(view.system, SKILLS);
  const presets = (view: View): [string, Table] | undefined => tableBy(view.system, PRESETS);
  const rankKey = (view: View): string | undefined => columnBy(skills(view)?.[1], RANK)?.key;
  const presetTag = (view: View): string | undefined => fieldBy(view.system, PRESET)?.tag;
  const mods = (view: View): Modifier[] => (kind(view)?.[1].modifiers ?? []).filter(modifier => modifier.kind === 'value');

  const everyRank = (view: View, modifier: Modifier): boolean => {
    const table = skills(view)?.[0];
    const column = rankKey(view);
    return Boolean(table && column && loose(modifier).target === `cell:${table}.*.${column}`);
  };

  const aimed = (view: View): Modifier | undefined => mods(view).find(modifier => everyRank(view, modifier));
  const fromPreset = (view: View): boolean => {
    const found = aimed(view);
    const tag = presetTag(view);
    return Boolean(found && tag && loose(found).op === 'set' && is(loose(found).value, `@${tag}.[@${ROW}]`));
  };
  const whenHolds = (view: View, condition: unknown): boolean => {
    const tag = presetTag(view);
    const asked = (value: string) => figure(condition, { [tag!]: value });
    const named = (presets(view)?.[1].rows ?? []).map(row => String(row.value ?? '')).filter(Boolean);
    return Boolean(tag && named.length > 0 && asked('') === false && named.every(value => asked(value) === true));
  };
  const whenPreset = (view: View): boolean => {
    const found = aimed(view);
    return Boolean(found && whenHolds(view, loose(found).if));
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
        const pawn = { id: PROBE, systemId: 'x', of: id, name: PROBE, values: { [tag]: row.value }, has: [], effects: [] } as unknown as Sheet;
        const looked = new Views(view.system as unknown as EngineSystem, { records: [] } as unknown as Compendium).of([pawn], PROBE);
        return names.every(name => {
          const key = name.replace(/\s+/g, '_');
          return looked.resolve(`${table}.${key}.${column}`) === Number((row.cells ?? {})[key] ?? 0);
        });
      });
    } catch { return false; }
  };

  const taught = (view: View): boolean => {
    const rows = presets(view)?.[1].rows ?? [];
    return rows.length >= 3 && rows.every(row => String(row.value ?? '').trim() !== '' && Object.values(row.cells ?? {}).some(cell => typeof cell === 'number' && cell > 0));
  };

  const via = [{ text: KIND, in: SHEETS }, { text: KINDS }];

  return {
    id: 'templates',
    title: t('lessonTemplates:title'),
    sub: t('lessonTemplates:sub'),
    start: t('lessonTemplates:start'),
    seed: seedIn(seed as unknown as System, words),
    tab: 'sheet',
    chapters: [
      { title: COLUMN, sum: t('lessonTemplates:chapter.column.sum') },
      { title: SOURCE, sum: t('lessonTemplates:chapter.source.sum') },
      { title: ALONE, sum: t('lessonTemplates:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'open',
        chapter: COLUMN,
        lead: t('lessonTemplates:open.lead'),
        tab: 'sheet',
        say: t('lessonTemplates:open.say'),
        at: { text: KIND, in: SHEETS },
        via: { text: KINDS },
        done: view => Boolean(kind(view)) && view.sheetKind === kind(view)?.[0],
        result: () => t('lessonTemplates:open.result'),
      },
      {
        id: 'target',
        chapter: COLUMN,
        tab: 'sheet',
        say: t('lessonTemplates:target.say'),
        hint: t('lessonTemplates:target.hint'),
        at: [
          { at: { text: t('records:sheetKind.fields.add'), in: CARD }, say: t('lessonTemplates:target.add', { card: CARD }), done: view => mods(view).length > 0 },
          { at: { text: TARGET, in: CARD }, say: t('lessonTemplates:target.pick') },
        ],
        via,
        done: view => Boolean(aimed(view)),
        result: () => t('lessonTemplates:target.result'),
      },
      {
        id: 'op',
        chapter: COLUMN,
        tab: 'sheet',
        say: t('lessonTemplates:op.say'),
        at: { text: HOW, in: CARD },
        via,
        done: view => Boolean(aimed(view)) && loose(aimed(view)!).op === 'set',
        result: () => t('lessonTemplates:op.result'),
      },
      {
        id: 'value',
        chapter: SOURCE,
        lead: t('lessonTemplates:value.lead'),
        tab: 'sheet',
        say: t('lessonTemplates:value.say'),
        hint: t('lessonTemplates:value.hint'),
        at: [
          { at: { text: AMOUNT, in: CARD }, say: t('lessonTemplates:value.click'), done: view => barOpen(view) || fromPreset(view) },
          { at: { text: AMOUNT, in: CARD }, say: t('lessonTemplates:value.pick') },
        ],
        via,
        done: fromPreset,
        result: () => t('lessonTemplates:value.result'),
      },
      {
        id: 'when',
        chapter: SOURCE,
        tab: 'sheet',
        say: t('lessonTemplates:when.say'),
        hint: t('lessonTemplates:when.hint'),
        at: [
          { at: { text: IF_ONLY, in: CARD }, say: t('lessonTemplates:when.click'), done: view => barOpen(view) || whenPreset(view) },
          { at: { text: IF_ONLY, in: CARD }, say: t('lessonTemplates:when.pick'), done: view => whenHolds(view, barText(view)) || whenPreset(view) },
          { at: [FORMULA_DONE, { text: IF_ONLY, in: CARD }], say: t('lessonTemplates:when.enter') },
        ],
        via,
        done: view => fromPreset(view) && whenPreset(view),
        result: () => t('lessonTemplates:when.result'),
      },
      {
        id: 'problems',
        chapter: SOURCE,
        say: t('lessonTemplates:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonTemplates:problems.result'),
      },
      {
        id: 'more',
        chapter: ALONE,
        lead: t('lessonTemplates:more.lead'),
        alone: true,
        tab: 'dictionaries',
        goal: t('lessonTemplates:more.goal'),
        say: t('lessonTemplates:more.say'),
        hint: t('lessonTemplates:more.hint'),
        done: view => taught(view) && fromPreset(view) && ranksFollow(view) && errorsOf(view.system) === 0,
        result: () => t('lessonTemplates:more.result'),
      },
    ],
  };
});
