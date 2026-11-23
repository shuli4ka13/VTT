import { ROW, compile, blockLabel } from '@vtt/engine';
import type { System } from '@vtt/schema';
import type { Lesson, View, Move } from '../types.ts';
import { tableBy, columnBy, rowIs, fieldBy, columnOf, figure, same, exprOf, errorsOf, FORMULA_DONE, barOpen, barText, problemsClean } from '../find.ts';
import { visible } from '../anchor.ts';
import { lazyLesson, seedIn } from '../lazy.ts';
import base from '../seeds/base.json' with { type: 'json' };

const parses = (text: string): boolean => {
  try { compile(text); return true; } catch { return false; }
};

const equalsAll = (formula: unknown, vars: (sample: number) => Record<string, unknown>, wanted: (sample: number) => number): boolean =>
  [-3, 0, 2, 7, 11].every(sample => figure(formula, vars(sample)) === wanted(sample));

const modifierWanted = (sample: number): number => Math.floor((sample - 10) / 2);

const squash = (text: string): string => text.replace(/\s+/g, '');

export const tables: Lesson = lazyLesson('tables', words => {
  const { t } = words;
  const STATS = t('lessonTables:name.stats');
  const SKILLS = t('lessonTables:name.skills');
  const MODIFIER = t('lessonTables:name.modifier');
  const ABILITY = t('lessonTables:name.ability');
  const TOTAL = t('lessonTables:name.total');
  const SAVE = t('lessonTables:name.save');
  const STRENGTH = t('lessonTables:name.strength');
  const DEXTERITY = t('lessonTables:name.dexterity');
  const ATHLETICS = t('lessonTables:name.athletics');
  const COMBAT = t('lessonTables:name.combat');
  const ARMOR = t('lessonTables:name.armor');
  const VALUE = t('records:table.column.value');
  const SHEETS = t('rolls:character.title');
  const ADD_BLOCK = t('rolls:character.addBlock');
  const ADD_TABLE = t('rolls:character.addTable');
  const ADD_ROW = t('tables:rows.add');
  const KINDS = t('sheetTab:tab.viewKinds');
  const SAMPLE = t('sheetTab:tab.viewSample');
  const NAME_BLOCK = t('common:name.block');
  const NAME_TABLE = t('common:name.table');
  const NAME_ROW = t('common:name.row');
  const NAME_COLUMN = t('common:name.column');
  const FOR_ROWS = t('tables:column.formulaRows');
  const FOR_SHEETS = t('tables:column.formulaSheets');
  const TYPE = t('tables:column.type');
  const FROM_TABLE = t('tables:column.fromTable');
  const ON_SHEET = t('lessonTables:chapter.onSheet.title');
  const HERO = t('lessonTables:chapter.hero.title');
  const SKILL_CHAPTER = t('lessonTables:chapter.skills.title');
  const ALONE = t('lessonTables:chapter.alone.title');
  const FORMULA_HINT = t('lessonTables:formulaHint');

  const stats = (view: View) => {
    const found = tableBy(view.system, STATS);
    return found && found[1].shape !== 'book' && found[1].shape !== 'single' ? found : undefined;
  };

  const skills = (view: View) => {
    const found = tableBy(view.system, SKILLS);
    return found && found[1].shape !== 'book' && found[1].shape !== 'single' ? found : undefined;
  };

  const blockNamed = (view: View, name: string) => (view.system.blocks ?? []).find(block => same(blockLabel(view.system, block.key), name));

  const placedIn = (view: View, name: string): boolean => {
    const block = blockNamed(view, name);
    return Boolean(block?.parts.some(part => {
      const table = view.system.tables?.[part.table];
      return table && table.shape !== 'book' && table.shape !== 'single' && table.owner === 'sheet';
    }));
  };

  const onSheetIn = (view: View, found: ReturnType<typeof stats>, name: string): boolean =>
    Boolean(found && found[1].owner === 'sheet' && blockNamed(view, name)?.parts.some(part => part.table === found[0]));

  const brokenModifier = (view: View): boolean => {
    const text = exprOf(columnBy(stats(view)?.[1], MODIFIER)?.expr).trim();
    return text !== '' && !parses(text);
  };

  const modifierRight = (view: View, formula: unknown): boolean => {
    const value = columnBy(stats(view)?.[1], VALUE);
    return Boolean(value && parses(exprOf(formula)) && equalsAll(formula, sample => ({ [`${ROW}.${value.key}`]: sample }), modifierWanted));
  };

  const valueRead = (view: View, text: string): boolean => {
    const value = columnBy(stats(view)?.[1], VALUE);
    return Boolean(value && text.replace(/\s+/g, '').includes(`@${ROW}.${value.key}`));
  };

  const armorRight = (view: View, formula: unknown): boolean => {
    const found = stats(view);
    const modifier = columnBy(found?.[1], MODIFIER);
    const dexterity = (found?.[1].rows ?? []).find(row => rowIs(row, DEXTERITY));
    return Boolean(found && modifier && dexterity && equalsAll(formula, sample => ({ [`${found[0]}.${String(dexterity.value)}.${modifier.key}`]: sample }), sample => 10 + sample));
  };

  const armorExpr = (view: View): unknown => columnOf(view.system, fieldBy(view.system, ARMOR))?.expr;

  const hasRows = (view: View, names: string[]): boolean => {
    const rows = stats(view)?.[1].rows ?? [];
    return names.every(name => rows.some(row => rowIs(row, name)));
  };

  const sampleShown = (): boolean =>
    [...document.querySelectorAll('.segmented__item[aria-pressed="true"]')].some(el => same(el.textContent, SAMPLE));

  const kindsFirst: Move = { at: { text: KINDS }, say: t('lessonTables:kindsFirst'), done: () => visible({ text: ADD_BLOCK, in: SHEETS }), maybe: true };

  const openTable = (name: string): boolean =>
    [...document.querySelectorAll<HTMLInputElement>(`input[placeholder="${NAME_TABLE}"]`)].some(el => same(el.value, name));

  const tableOpened = (name: string): Move => ({
    at: [{ text: `${name}:` }, { text: name, in: SHEETS }, { text: KINDS }],
    say: t('lessonTables:opened', { name }),
    done: () => openTable(name),
    maybe: true,
  });

  const throughRight = (view: View, formula: unknown): boolean => {
    const table = skills(view)?.[1];
    const link = columnBy(table, ABILITY);
    const value = columnBy(table, VALUE);
    const modifier = columnBy(stats(view)?.[1], MODIFIER);
    return Boolean(link && value && modifier
      && [-2, 0, 3].every(first => [0, 1, 5].every(second => figure(formula, {
        [`${ROW}.${link.key}.${modifier.key}`]: first, [`${ROW}.${value.key}`]: second,
      }) === first + second)));
  };

  const throughReads = (view: View, text: string): boolean => {
    const link = columnBy(skills(view)?.[1], ABILITY);
    const modifier = columnBy(stats(view)?.[1], MODIFIER);
    return Boolean(link && modifier && squash(text).includes(`@${ROW}.${link.key}.${modifier.key}`));
  };

  const copiesModifier = (view: View, label: string): boolean => {
    const table = stats(view)?.[1];
    const modifier = columnBy(table, MODIFIER);
    return Boolean(modifier && equalsAll(columnBy(table, label)?.expr, sample => ({ [`${ROW}.${modifier.key}`]: sample }), sample => sample));
  };

  return {
    id: 'tables',
    title: t('lessonTables:title'),
    sub: t('lessonTables:sub'),
    start: t('lessonTables:start'),
    seed: seedIn(base as unknown as System, words),
    tab: 'sheet',
    chapters: [
      { title: ON_SHEET, sum: t('lessonTables:chapter.onSheet.sum') },
      { title: HERO, sum: t('lessonTables:chapter.hero.sum') },
      { title: SKILL_CHAPTER, sum: t('lessonTables:chapter.skills.sum') },
      { title: ALONE, sum: t('lessonTables:chapter.alone.sum') },
    ],
    steps: [
      {
        id: 'block',
        chapter: ON_SHEET,
        lead: t('lessonTables:block.lead'),
        tab: 'sheet',
        say: t('lessonTables:block.say'),
        at: [
          kindsFirst,
          { at: { text: ADD_BLOCK, in: SHEETS }, say: t('lessonTables:block.add'), done: view => (view.system.blocks ?? []).length > 1 },
          { at: { input: NAME_BLOCK }, say: t('lessonTables:block.name') },
        ],
        done: view => Boolean(blockNamed(view, STATS)),
        result: () => t('lessonTables:block.result'),
      },
      {
        id: 'table',
        chapter: ON_SHEET,
        tab: 'sheet',
        say: t('lessonTables:table.say'),
        at: [
          { at: { text: ADD_TABLE, in: STATS }, say: t('lessonTables:table.add'), done: view => placedIn(view, STATS) },
          { at: { input: NAME_TABLE }, say: t('lessonTables:table.name') },
        ],
        via: [{ text: STATS, in: SHEETS }, { text: KINDS }],
        done: view => onSheetIn(view, stats(view), STATS),
        result: () => t('lessonTables:table.result'),
      },
      {
        id: 'rows',
        chapter: ON_SHEET,
        tab: 'sheet',
        say: t('lessonTables:rows.say'),
        at: [
          tableOpened(STATS),
          { at: { input: NAME_ROW }, say: t('lessonTables:rows.first'), done: view => (stats(view)?.[1].rows ?? []).some(row => rowIs(row, STRENGTH)) },
          { at: { text: ADD_ROW }, say: t('lessonTables:rows.add'), done: view => (stats(view)?.[1].rows ?? []).length > 1 },
          { at: { input: NAME_ROW }, say: t('lessonTables:rows.second') },
        ],
        done: view => {
          const rows = stats(view)?.[1].rows ?? [];
          return rows.some(row => rowIs(row, STRENGTH)) && rows.some(row => rowIs(row, DEXTERITY));
        },
        result: () => t('lessonTables:rows.result'),
      },
      {
        id: 'modifier',
        chapter: ON_SHEET,
        lead: t('lessonTables:modifier.lead'),
        tab: 'sheet',
        say: t('lessonTables:modifier.say'),
        at: [
          tableOpened(STATS),
          { at: { guide: 'add-column' }, say: t('lessonTables:modifier.plus'), done: view => (stats(view)?.[1].columns ?? []).length > 1 },
          { at: { input: NAME_COLUMN }, say: t('lessonTables:modifier.name'), done: view => Boolean(columnBy(stats(view)?.[1], MODIFIER)) },
          {
            at: { text: FOR_ROWS },
            say: t('lessonTables:modifier.floor'),
            hint: FORMULA_HINT,
            done: view => barText(view).includes('floor') || modifierRight(view, columnBy(stats(view)?.[1], MODIFIER)?.expr),
          },
          {
            at: { text: FOR_ROWS },
            say: t('lessonTables:modifier.value'),
            hint: FORMULA_HINT,
            done: view => valueRead(view, barText(view)) || modifierRight(view, columnBy(stats(view)?.[1], MODIFIER)?.expr),
          },
          {
            at: { text: FOR_ROWS },
            say: t('lessonTables:modifier.rest'),
            done: view => modifierRight(view, barText(view)) || modifierRight(view, columnBy(stats(view)?.[1], MODIFIER)?.expr),
          },
          { at: [FORMULA_DONE, { text: FOR_ROWS }], say: t('lessonTables:modifier.enter') },
        ],
        done: view => hasRows(view, [STRENGTH, DEXTERITY]) && modifierRight(view, columnBy(stats(view)?.[1], MODIFIER)?.expr),
        traps: [{
          when: brokenModifier,
          say: t('lessonTables:modifier.trap'),
        }],
        result: () => t('lessonTables:modifier.result'),
      },
      {
        id: 'sample',
        chapter: HERO,
        tab: 'sheet',
        say: t('lessonTables:sample.say'),
        at: { text: SAMPLE },
        done: view => view.tab === 'sheet' && sampleShown(),
        result: () => t('lessonTables:sample.result'),
      },
      {
        id: 'armor',
        chapter: HERO,
        lead: t('lessonTables:armor.lead'),
        tab: 'sheet',
        say: t('lessonTables:armor.say'),
        at: [
          {
            at: { text: FOR_SHEETS },
            say: t('lessonTables:armor.ten'),
            hint: FORMULA_HINT,
            done: view => squash(barText(view)).startsWith('10+') || armorRight(view, armorExpr(view)),
          },
          {
            at: { text: FOR_SHEETS },
            say: t('lessonTables:armor.pick'),
            hint: FORMULA_HINT,
            done: view => armorRight(view, barText(view)) || armorRight(view, armorExpr(view)),
          },
          { at: [FORMULA_DONE, { text: FOR_SHEETS }], say: t('lessonTables:armor.enter') },
        ],
        via: [{ text: ARMOR }, { text: COMBAT, in: SHEETS }],
        done: view => armorRight(view, armorExpr(view)),
        result: () => t('lessonTables:armor.result'),
      },
      {
        id: 'problems',
        chapter: HERO,
        say: t('lessonTables:problems.say'),
        at: { guide: 'problems' },
        done: problemsClean,
        result: () => t('lessonTables:problems.result'),
      },
      {
        id: 'skills',
        chapter: SKILL_CHAPTER,
        lead: t('lessonTables:skills.lead'),
        tab: 'sheet',
        say: t('lessonTables:skills.say'),
        at: [
          kindsFirst,
          { at: { text: ADD_BLOCK, in: SHEETS }, say: t('lessonTables:block.add'), done: view => (view.system.blocks ?? []).length > 2 },
          { at: { input: NAME_BLOCK }, say: t('lessonTables:skills.blockName'), done: view => Boolean(blockNamed(view, SKILLS)) },
          { at: { text: ADD_TABLE, in: SKILLS }, say: t('lessonTables:skills.add'), done: view => placedIn(view, SKILLS) },
          { at: { input: NAME_TABLE }, say: t('lessonTables:skills.tableName'), done: view => Boolean(skills(view)) },
          { at: { input: NAME_ROW }, say: t('lessonTables:skills.row') },
        ],
        done: view => onSheetIn(view, skills(view), SKILLS) && (skills(view)?.[1].rows ?? []).some(row => rowIs(row, ATHLETICS)),
        result: () => t('lessonTables:skills.result'),
      },
      {
        id: 'link',
        chapter: SKILL_CHAPTER,
        tab: 'sheet',
        say: t('lessonTables:link.say'),
        at: [
          tableOpened(SKILLS),
          { at: { guide: 'add-column' }, say: t('lessonTables:link.plus'), done: view => (skills(view)?.[1].columns ?? []).length > 1 },
          { at: { input: NAME_COLUMN }, say: t('lessonTables:link.name'), done: view => Boolean(columnBy(skills(view)?.[1], ABILITY)) },
          { at: { text: TYPE }, say: t('lessonTables:link.type'), done: view => columnBy(skills(view)?.[1], ABILITY)?.kind === 'choice' },
          { at: { text: FROM_TABLE }, say: t('lessonTables:link.from') },
        ],
        done: view => {
          const column = columnBy(skills(view)?.[1], ABILITY);
          const source = stats(view);
          return Boolean(column && column.kind === 'choice' && source && column.from === source[0]);
        },
        traps: [{
          when: view => {
            const column = columnBy(skills(view)?.[1], ABILITY);
            return Boolean(column && column.kind === 'choice' && !column.from);
          },
          say: t('lessonTables:link.trap'),
        }],
        result: () => t('lessonTables:link.result'),
      },
      {
        id: 'pick',
        chapter: SKILL_CHAPTER,
        tab: 'sheet',
        say: t('lessonTables:pick.say'),
        hint: t('lessonTables:pick.hint'),
        done: view => {
          const table = skills(view)?.[1];
          const column = columnBy(table, ABILITY);
          const row = (table?.rows ?? []).find(one => rowIs(one, ATHLETICS));
          const strength = (stats(view)?.[1].rows ?? []).find(one => rowIs(one, STRENGTH));
          return Boolean(column && strength && same(row?.cells?.[column.key], String(strength.value)));
        },
        result: () => t('lessonTables:pick.result'),
      },
      {
        id: 'through',
        chapter: SKILL_CHAPTER,
        lead: t('lessonTables:through.lead'),
        tab: 'sheet',
        say: t('lessonTables:through.say'),
        hint: FORMULA_HINT,
        at: [
          tableOpened(SKILLS),
          { at: { guide: 'add-column' }, say: t('lessonTables:link.plus'), done: view => (skills(view)?.[1].columns ?? []).length > 2 },
          { at: { input: NAME_COLUMN }, say: t('lessonTables:through.name'), done: view => Boolean(columnBy(skills(view)?.[1], TOTAL)) },
          { at: { text: FOR_ROWS }, say: t('lessonTables:through.start'), done: view => barOpen(view) || throughRight(view, columnBy(skills(view)?.[1], TOTAL)?.expr) },
          {
            at: { text: FOR_ROWS },
            say: t('lessonTables:through.pick'),
            done: view => throughReads(view, barText(view)) || throughRight(view, columnBy(skills(view)?.[1], TOTAL)?.expr),
          },
          {
            at: { text: FOR_ROWS },
            say: t('lessonTables:through.plus'),
            done: view => barText(view).includes('+') || throughRight(view, columnBy(skills(view)?.[1], TOTAL)?.expr),
          },
          {
            at: { text: FOR_ROWS },
            say: t('lessonTables:through.value'),
            done: view => throughRight(view, barText(view)) || throughRight(view, columnBy(skills(view)?.[1], TOTAL)?.expr),
          },
          { at: [FORMULA_DONE, { text: FOR_ROWS }], say: t('lessonTables:through.enter') },
        ],
        done: view => throughRight(view, columnBy(skills(view)?.[1], TOTAL)?.expr),
        result: () => t('lessonTables:through.result'),
      },
      {
        id: 'save',
        chapter: ALONE,
        alone: true,
        tab: 'sheet',
        say: t('lessonTables:save.say'),
        goal: t('lessonTables:save.goal'),
        hint: t('lessonTables:save.hint'),
        done: view => copiesModifier(view, SAVE) && errorsOf(view.system) === 0,
        traps: [{
          when: view => Boolean(fieldBy(view.system, SAVE)),
          say: t('lessonTables:save.trap'),
        }],
        result: () => t('lessonTables:save.result'),
      },
    ],
  };
});
