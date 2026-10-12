// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within, stepCard, block, blocks, headOf, addArm, addToArm, callIf, outcomeIf, armWord, dragParamBefore } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';

const worldOf = (id: string) => SAMPLE_WORLDS.find(w => w.system.id === id)!;

const start = (systemId: string, without: string[]): Effect[] => {
  const world = structuredClone(worldOf(systemId));
  const goal = without.map(id => world.system.effects[id]!);
  for (const id of without) delete world.system.effects[id];
  useWorld.setState(state => ({
    ...state, system: world.system as System, compendium: world.compendium,
    activeEffectId: null, activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
  }));
  render(<EffectsTab />);
  openAll();
  return goal;
};

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const nameStep = (card: HTMLElement, name: string): void => {
  const title = (card.querySelector('.step-fold, .card__head')?.textContent ?? '').replace(/^[▾▸]\s*/, '').split('·')[0]!.trim();
  within(card).click(/^имя в формулах/);
  const fresh = stepCard(new RegExp(`^${title} · `), card.parentElement ?? document);
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
};

const savingThrow = (root: HTMLElement, at: number, args: readonly (readonly [string, string])[], plus = '+ изменение'): void => {
  within(root).click(plus);
  const made = () => stepCard(new RegExp(`^${at} · `), root);
  within(made()).click('вызов');
  within(made()).select('Какой эффект', 'saving_throw');
  for (const [name, text] of args) within(made()).formula(within(made()).arg(name), text);
  nameStep(made(), 'спас');
};

const marks = (card: HTMLElement, ...tags: string[]): void => {
  for (const tag of tags) {
    if (tag.startsWith('=')) {
      within(card).select('Метки', ':формула');
      within(card).type('Метки', tag.slice(1));
      within(card).click('добавить');
    } else within(card).select('Метки', tag);
  }
};

const built = (id: string): Effect | undefined => useWorld.getState().system.effects[id];

const dump = (what: unknown) => {
  if (process.env.BUILD_DUMP) writeFileSync(process.env.BUILD_DUMP, JSON.stringify(what, null, 1));
};

const fresh = (button: string, label: string, key: string, block: string, description: string) => {
  const ui = within();
  ui.click(button);
  ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, label);
  if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
  ui.click('имя в формулах…');
  ui.type(document.querySelector<HTMLElement>('.step-name input')!, key);
  ui.select('Папка', block);
  ui.type('Описание', description);
  return ui;
};

const modifierCards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.card')]
  .filter(card => /^(Правит поле|Правка вызова)/.test(textOf(card.querySelector('.card__head') ?? card)));
const lastModifier = (): HTMLElement => modifierCards().at(-1)!;

const handlerAt = (n: number): HTMLElement => stepCard(new RegExp(`^Когда №${n}`)).parentElement!;
const handlerHead = (n: number): HTMLElement => stepCard(new RegExp(`^Когда №${n}`));

const valueModifier = (target: string, op: string, value: string) => {
  within().click('+ правит поле');
  const card = lastModifier;
  within(card()).select('Что правим', target);
  within(card()).select('Как', op);
  within(card()).formula('На сколько', value);
};

const presetDefault = (goal: Effect, ...paths: string[][]): Effect => {
  const copy = structuredClone(goal) as unknown as Record<string, unknown>;
  for (const path of paths) {
    let at = copy as Record<string, unknown>;
    for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
    delete at[path.at(-1)!];
  }
  return copy as unknown as Effect;
};

const lifetime = (kind: string, reapply?: string) => {
  const ui = within();
  ui.select('Сколько висит', kind);
  if (reapply) ui.select('Если наложить второй раз', reapply);
};

describe('эффекты D&D собираются в конструкторе руками (покрытие возможностей)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('D&D «Доспех мага» (mage_armored): до конца сцены, правит поле «задать» с наибольшим', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['mage_armored']);
    fresh('+ висит и правит', goal!.label!, 'mage_armored', 'Состояния', goal!.description!);
    lifetime('scene', 'refresh');
    valueModifier('ac_base', 'set', '13');
    dump({ got: built('mage_armored'), goal });
    expect(built('mage_armored')).toEqual(goal);
  });

  it('D&D «В рывке» (dashing): на 1 ход, спадает в конце хода, умножить; умолч: duration.ends = "turn-end"', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['dashing']);
    const ui = fresh('+ висит и правит', goal!.label!, 'dashing', 'Состояния', goal!.description!);
    lifetime('turns', 'refresh');
    ui.type('Сколько', '1');
    ui.select('Спадает', 'turn-end');
    valueModifier('speed', 'mul', '2');
    dump({ got: built('dashing'), goal });
    expect(built('dashing')).toEqual(presetDefault(goal!, ['duration', 'ends']));
  });

  it('D&D «Каменная кожа» (stoneskin): правка вызова урона — кроме меток, «где у метки»', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['stoneskin']);
    fresh('+ висит и правит', goal!.label!, 'stoneskin', 'Состояния', goal!.description!);
    lifetime('permanent', 'refresh');
    within().click('+ правка вызова');
    const card = lastModifier;
    within(card()).select('Чей вызов', 'damage');
    within(card()).formula('На сколько', '0.5');
    within(card()).select('Этап', 'сопротивление');
    within(card()).select('Кроме меток', 'магический');
    within(card()).select('Где у метки', 'damage_types\u0000nature');
    within(within(card()).field('Где у метки')).select(within(card()).field('Где у метки').querySelectorAll('select')[1] as HTMLElement, 'физический');
    within(card()).select('Кого касается', '@лист == @носитель');
    dump({ got: built('stoneskin'), goal });
    expect(built('stoneskin')).toEqual(goal);
  });

  it('D&D «Что доходит до меня» (taken_rule): две правки вызова урона — строка типа урона по значению, сопротивление и уязвимость по этапам', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['taken_rule']);
    fresh('+ висит и правит', goal!.label!, 'taken_rule', 'Общие правила', goal!.description!);
    for (const m of goal!.modifiers ?? []) {
      const one = m as { value: { expr: string }; stage: string };
      within().click('+ правка вызова');
      const card = lastModifier;
      within(card()).select('Чей вызов', 'damage');
      within(card()).formula('На сколько', one.value.expr);
      within(card()).select('Этап', one.stage);
      within(card()).select('Кого касается', '@лист == @носитель');
      within(card()).when('=не(пусто(@носитель.damage_types.[@damage_type].taken))');
    }
    dump({ got: built('taken_rule'), goal });
    expect(built('taken_rule')).toEqual(goal);
  });

  it('D&D «Недееспособен» (incapacitated): при наложении снимает концентрацию; обход: пустые modifiers снимаются только добавлением и удалением правки', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['incapacitated']);
    const ui = fresh('+ висит и правит', goal!.label!, 'incapacitated', 'Состояния', goal!.description!);
    lifetime('permanent', 'refresh');
    ui.click('+ правит поле');
    within(lastModifier()).click('Удалить');
    within(lastModifier()).click('точно убрать');
    ui.click('+ при наложении');
    ui.click('+ изменение');
    let card = stepCard(/^1 · /);
    within(card).click('состояние');
    card = stepCard(/^1 · /);
    within(card).select('Что делаем', 'remove');
    within(card).select('Какое', 'concentration');
    within(card).formula('С кого', '@носитель');
    dump({ got: built('incapacitated'), goal });
    expect(built('incapacitated')).toEqual(goal);
  });

  it('D&D «Парализован» (paralyzed): выдаёт «Беспомощен», вход-память, подписка на конец хода зовёт «Повторный спасбросок»', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['paralyzed']);
    const ui = fresh('+ висит и правит', goal!.label!, 'paralyzed', 'Состояния', goal!.description!);
    lifetime('permanent', 'refresh');
    ui.click('+ правит поле');
    within(lastModifier()).click('Удалить');
    within(lastModifier()).click('точно убрать');
    ui.click('+ что даёт');
    within(ui.field('Что даёт')).select(ui.field('Что даёт').querySelector('select') as HTMLElement, 'helpless');

    ui.click('+ ещё одно');
    ui.type(ui.cell('Название', 0), 'Запомненное число');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'запомнено');
    ui.select(ui.cell('Если не передали', 0), 'empty');

    ui.click('+ когда');
    within(handlerHead(1)).select('Что случилось', 'moment');
    within(handlerHead(1)).select('Когда', 'turn-end');
    within(handlerHead(1)).select('Кого касается', '@ходит == @носитель');
    within(handlerHead(1)).when('=или(@запомнено, 0) > 0');

    within(handlerAt(1)).click('+ изменение');
    const made = () => stepCard(/^1 · /, handlerAt(1));
    within(made()).click('вызов');
    within(made()).select('Какой эффект', 'repeat_save');
    within(made()).formula(within(made()).arg('Кто спасается'), '@носитель');
    within(made()).formula(within(made()).arg('Чем спасается'), '"мудрость"');
    within(made()).formula(within(made()).arg('Сложность'), '@запомнено');
    within(made()).select(within(made()).arg('Что снимается').querySelector('select')!, 'paralyzed');

    dump({ got: built('paralyzed'), goal });
    expect(built('paralyzed')).toEqual(goal);
  });

  it('D&D «Кость вдохновения наготове» (bardic_ready): вход-кость с умолчанием, на 1 срабатывание, «увидев кости» — прибавить кость из входа', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['bardic_ready']);
    const ui = fresh('+ срабатывает сам', goal!.label!, 'bardic_ready', 'Реакции', goal!.description!);
    ui.click('+ ещё одно');
    ui.type(ui.cell('Название', 0), 'Кость вдохновения');
    ui.select(ui.cell('Вид', 0), 'dice');
    ui.select(ui.cell('Если не передали', 0), 'value');
    ui.type(ui.cell('Если не передали', 0), '1к6');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'кость');
    lifetime('uses');
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerHead(1)).select('Кого касается', '@бросающий == @носитель');
    within(handlerHead(1)).select('Решение', 'ask');
    within(handlerAt(1)).click('+ прибавить');
    const card = stepCard(/^1 · /, handlerAt(1));
    within(card).formula('Сколько', 'кинуть(@кость)');
    dump({ got: built('bardic_ready'), goal });
    expect(built('bardic_ready')).toEqual(goal);
  });

  it('D&D «Героическое вдохновение» (inspire): «увидев кости», цена подписки — трата поля, перебросить одну меньшую кость; смена режима снимает порог', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['inspire']);
    fresh('+ срабатывает сам', goal!.label!, 'inspire', 'Реакции', goal!.description!);
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerHead(1)).select('Кого касается', '@бросающий == @носитель');
    within(handlerHead(1)).select('Решение', 'ask');

    within(handlerAt(1)).click('+ изменение');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).click('вызов');
    card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Какой эффект', 'spend');
    const args = (goal!.on![0]!.cost![0] as { args: Record<string, { expr: string }> }).args;
    const label: Record<string, string> = { what: 'Что тратим', amount: 'Сколько', note: 'Если не хватает', лист: 'Лист', источник: 'Источник' };
    for (const [key, value] of Object.entries(args)) {
      card = stepCard(/^1 · /, handlerAt(1));
      within(card).formula(within(card).arg(label[key]!), value.expr);
    }
    within(stepCard(/^1 · /, handlerAt(1))).click('↑');

    within(handlerAt(1)).click('+ перебросить');
    card = stepCard(/^2 · /, handlerAt(1));
    expect(within(card).field('Перебросить, где выпало не больше')).toBeTruthy();
    within(card).select('Что перебросить', 'lowest');
    card = stepCard(/^2 · /, handlerAt(1));
    expect(card.textContent).not.toContain('Перебросить, где выпало не больше');
    dump({ got: built('inspire'), goal });
    expect(built('inspire')).toEqual(goal);
  });

  it('«Перебросить»: назад к порогу — порог снова 1, режим в данных не пишется', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['inspire']);
    fresh('+ срабатывает сам', 'Проба режима', 'reroll_probe', 'Реакции', goal!.description!);
    within(handlerHead(1)).select('Что случилось', 'seen');
    within(handlerAt(1)).click('+ перебросить');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Что перебросить', 'lowest');
    expect((built('reroll_probe').on![0]!.steps![0] as Record<string, unknown>).upTo).toBeUndefined();
    card = stepCard(/^1 · /, handlerAt(1));
    within(card).select('Что перебросить', '');
    const step = built('reroll_probe').on![0]!.steps![0] as Record<string, unknown>;
    expect(step.which).toBeUndefined();
    expect(step.upTo).toEqual({ expr: '1' });
  });

  it('D&D «Щит» (shield): «до» всего с меткой «атака», цена реакцией и ячейкой, вешает состояние на себя', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['shield']);
    const ui = fresh('+ срабатывает сам', goal!.label!, 'shield', 'Реакции', goal!.description!);
    within(handlerHead(1)).select('Что именно', 'атака');
    within(handlerHead(1)).select('Когда именно', 'before');
    within(handlerHead(1)).select('Кого касается', '@цель == @носитель');
    within(handlerHead(1)).when('=@попадание.попал');
    within(handlerHead(1)).select('Решение', 'ask');

    ui.select(handlerAt(1).querySelector<HTMLElement>('.add-cost select')!, 'cost_reaction');
    let card = stepCard(/^1 · /, handlerAt(1));
    within(card).formula(within(card).arg('Лист'), '@носитель');
    within(card).formula(within(card).arg('Источник'), '@носитель');
    within(handlerAt(1)).click('+ изменение');
    card = stepCard(/^2 · /, handlerAt(1));
    within(card).click('вызов');
    card = stepCard(/^2 · /, handlerAt(1));
    within(card).select('Какой эффект', 'spell_slot');
    for (const name of within(card).args()) {
      within(card).formula(within(card).arg(name), name === 'Лист' || name === 'Источник' ? '@носитель' : '1');
    }
    within(stepCard(/^2 · /, handlerAt(1))).click('↑');

    within(handlerAt(1)).click('+ изменение');
    card = stepCard(/^3 · /, handlerAt(1));
    within(card).click('состояние');
    card = stepCard(/^3 · /, handlerAt(1));
    within(card).select('Какое', 'shield_up');
    within(card).formula('На кого', '@носитель');
    dump({ got: built('shield'), goal });
    expect(built('shield')).toEqual(goal);
  });

  it('D&D «Заклинание со спасброском» (spell_save): урон до цикла, спасбросок, провал — урон и состояние, успех — половина, условное держание', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['spell_save']);
    const ui = fresh('+ кнопкой', goal!.label!, 'spell_save', 'Заклинания', goal!.description!);
    const param = (row: number, label: string, kind: string, key: string, more: { ask?: string; hint?: string; min?: string; max?: string; from?: string; mode?: string; value?: string } = {}) => {
      if (row >= (built('spell_save')!.params ?? []).length) ui.click('+ ещё одно');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (more.from) ui.select(ui.cell('Таблица', row), more.from);
      if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
      if (more.mode) ui.select(ui.cell('Если не передали', row), more.mode);
      if (more.value !== undefined) ui.type(ui.cell('Если не передали', row), more.value);
      if (more.hint) ui.type(ui.cell('Подсказка за столом', row), more.hint);
      if (more.min !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, more.min);
      if (more.max !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не выше"]')!, more.max);
      if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
    };
    param(0, 'Кто действует', 'sheet', 'действующий');
    param(2, 'Круг заклинания', 'number', 'spell_level');
    ui.check('«Круг заклинания» — величина', false);
    param(3, 'Каким кругом', 'number', 'slot', { ask: 'actor', hint: (goal!.params ?? [])[2]!.ask!.hint!, min: '1', max: '9' });
    param(4, 'Чем спасаются', 'choice', 'save_by', { from: 'abilities' });
    dragParamBefore('Цели', 'Чем спасаются');
    param(5, 'Кость урона', 'dice', 'damage_die', { mode: 'empty' });
    param(6, 'Сколько костей', 'number', 'dice_count', { mode: 'value', value: '1' });
    param(7, 'Костей за каждый круг выше', 'number', 'dice_up', { mode: 'value' });
    param(8, 'Тип урона', 'choice', 'damage_type', { from: 'damage_types', mode: 'empty' });
    param(9, 'Состояние', 'effect', 'status', { mode: 'empty' });
    param(10, 'Половина при успехе', 'boolean', 'half', { mode: 'value' });
    param(11, 'Держится концентрацией', 'boolean', 'holds', { mode: 'value' });

    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_spell');
    ui.click('+ держание');
    ui.select('Держит', 'concentration');
    ui.select('У кого', 'действующий');
    ui.click('+ условие');
    ui.select(document.querySelector<HTMLElement>('.cond__fact')!, 'holds');
    const at = (n: number) => stepCard(new RegExp(`^${n} · `));
    const hit = (n: number, amount: string) => {
      within(at(n)).click('вызов');
      within(at(n)).select('Какой эффект', 'damage');
      for (const [name, text] of [['Сколько урона', amount], ['Источник урона', '"магический"']] as const) {
        within(at(n)).formula(within(at(n)).arg(name), text);
      }
    };
    ui.click('+ если');
    within(headOf(block(0))).when('=не(пусто(@damage_die))');
    addToArm(block(0), 0, 'number');
    within(headOf(block(0))).click('↑');
    within(at(2)).formula('Сколько', 'кинуть(@damage_die, @dice_count + (@slot - @spell_level) * @dice_up)');
    nameStep(at(2), 'урон_всего');

    savingThrow(document.body, 4, [['Чем спасается', '@save_by'], ['Сложность', '@действующий.spell_dc']]);

    const fail = callIf(4, 'Спасбросок', 'не спасся');
    addToArm(block(fail), 0, 'branch');
    const inner = blocks().length - 1;
    within(headOf(block(inner))).when('=не(пусто(@damage_die))');
    addToArm(block(inner), 0, 'change');
    hit(5, '@урон_всего');
    addToArm(block(fail), 0, 'branch');
    const second = blocks().length - 1;
    within(headOf(block(second))).when('=не(пусто(@status))');
    addToArm(block(second), 0, 'change');
    within(at(6)).click('состояние');
    within(at(6)).select('Какое', ':вход:status');
    within(at(6)).formula('На кого', '@цель');
    within(at(6)).formula('Запомнит: Запомненное число', '@действующий.spell_dc');
    within(at(6)).formula('Запомнит: Кто наложил', '@действующий');
    addArm(block(fail), '+ иначе, если');
    within(headOf(block(fail), 1)).when('=все(@half, не(пусто(@damage_die)))');
    addToArm(block(fail), 1, 'change');
    hit(7, 'округлить вниз(@урон_всего * 0.5)');
    dump({ got: built('spell_save'), goal });
    expect(built('spell_save')).toEqual(goal);
  });

  it('D&D «Не замечает» (hidden): срок 1 ход, спадает в начале хода листа из входа, две правки броска по двум листам', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['hidden']);
    const ui = fresh('+ висит и правит', goal!.label!, 'hidden', 'Состояния', goal!.description!);
    ui.click('+ ещё одно');
    ui.type(ui.cell('Название', 0), 'Кого не замечает');
    ui.select(ui.cell('Вид', 0), 'sheet');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 0), 'кого');
    lifetime('turns', 'refresh');
    ui.type('Сколько', '1');
    ui.select('Спадает', 'turn-start');
    ui.select('Чьи ходы считать', 'кого');

    const rollEdit = (edit: string, when: string) => {
      within().click('+ правка вызова');
      const card = lastModifier;
      within(card()).select('С метками', 'атака');
      within(card()).select('Какая правка', edit);
      within(card()).when(`=${when}`);
    };
    rollEdit('advantage', 'все(@против == @носитель, @бросающий == @кого)');
    rollEdit('disadvantage', 'все(@бросающий == @носитель, @против == @кого)');
    dump({ got: built('hidden'), goal });
    expect(built('hidden')).toEqual(goal);
  });

  it('D&D «Засада» (hide): один бросок Скрытности выше «Для каждого из», проверка против пассивной внимательности каждой цели, «Не замечает» с входом', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['hide']);
    const ui = fresh('+ кнопкой', goal!.label!, 'hide', 'Действия в бою', goal!.description!);
    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_action');
    let card = stepCard(/^1 · /);

    ui.click('+ число');
    card = stepCard(/^3 · /);
    within(card).formula('Бросает', '@действующий');
    card = stepCard(/^3 · /);
    within(card).formula('Сколько', 'кинуть(@lead_die) + @действующий.skills.скрытность.total');
    nameStep(stepCard(/^3 · /), 'скрытая_бросок');
    within(stepCard(/^3 · /)).click('↑');

    ui.click('+ проверка');
    card = stepCard(/^4 · /);
    within(card).formula('Проверка', '@скрытая_бросок >= @цель.passive_perception');
    nameStep(stepCard(/^4 · /), 'скрытая');
    marks(stepCard(/^2 · /), 'проверка', 'ловкость', 'скрытность');

    addToArm(block(outcomeIf(4, true)), 0, 'change');
    within(stepCard(/^5 · /)).click('состояние');
    card = stepCard(/^5 · /);
    within(card).select('Какое', 'hidden');
    within(stepCard(/^5 · /)).formula('На кого', '@цель');
    within(stepCard(/^5 · /)).formula('Запомнит: Кого не замечает', '@действующий');
    dump({ got: built('hide'), goal });
    expect(built('hide')).toEqual(goal);
  });

  it('D&D «Засада» (hide): у броска выше «Для каждого из» «Против кого» пусто — «ни против кого — бросок один на все цели»', { timeout: 30000 }, () => {
    const world = structuredClone(worldOf('dnd5e'));
    useWorld.setState(state => ({
      ...state, system: world.system as System, compendium: world.compendium,
      activeEffectId: 'hide', activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
    }));
    render(<EffectsTab />);
    openAll();
    const roll = stepCard(/^2 · Бросок/);
    const field = within(roll).field('Против кого');
    const shown = field.querySelector<HTMLElement>('[placeholder]');
    expect(shown?.getAttribute('placeholder')).toBe('ни против кого — бросок один на все цели');
    expect((shown as HTMLInputElement | null)?.value ?? shown?.textContent ?? '').toBe('');
    expect(useWorld.getState().system.effects.hide!.steps![0]).not.toHaveProperty('against');
  });
});

describe('общие эффекты D&D собираются руками: цикл по строкам, адрес через строку', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  const calledHead = (goal: Effect, key: string) => {
    const ui = fresh('+ шаг для других', goal.label!, key, goal.group!, goal.description!);
    within(stepCard(/^1 · /)).click('Удалить');
    within(stepCard(/^1 · /)).click('точно убрать');
    return ui;
  };

  const param = (ui: ReturnType<typeof within>, id: string, row: number, label: string, kind: string, key: string, more: { ask?: string; main?: boolean; role?: string } = {}) => {
    if (row >= (built(id)!.params ?? []).length) ui.click('+ ещё одно');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Название', row), label);
    ui.select(ui.cell('Вид', row), kind);
    if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
    if (more.main) ui.check(`«${label}» — величина`, true);
    if (more.role) ui.select(ui.cell('Приходит сам', row), more.role);
    if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
  };

  const dropParam = (row: number) => {
    const drops = [...document.querySelectorAll<HTMLElement>('button[title="убрать вход"]')];
    act(() => { fireEvent.click(drops[row]!); });
    openAll();
  };

  const change = (card: () => HTMLElement, owner: string, field: string, how: string, value: string) => {
    within(card()).select('У кого', owner);
    within(card()).select('Какое поле', field);
    within(card()).select('Как', how);
    within(card()).formula('Сколько', value);
  };

  const rows = (root: ParentNode, table: string, name: string) => {
    const strip = () => root.querySelector<HTMLElement>('.steps__split')!;
    within(strip()).select(strip().querySelector<HTMLElement>('select')!, `строки:${table}`);
    within(strip()).type(strip().querySelector<HTMLElement>('input')!, name);
  };

  it('D&D «Новый ход» (turn_reset): для каждой строки «За ход» — «Осталось» строки цикла задать «В начале хода»', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['turn_reset']);
    const ui = calledHead(goal!, 'turn_reset');
    if (ui.has('ещё')) ui.click('ещё');
    ui.select(ui.cell('Приходит сам', 0), 'actor');
    dropParam(1);
    ui.click('+ для каждого из списка');
    rows(document, 'turn', 'счётчик');
    ui.click('+ изменение');
    change(() => stepCard(/^2 · /), 'лист', 'счётчик.left', 'set', '@лист.счётчик.start');
    dump({ got: built('turn_reset'), goal });
    expect(built('turn_reset')).toEqual(goal);
  });

  it('D&D «Ячейка заклинания» (spell_slot): «Потратить» клетку строки по значению — @лист.slots.[@circle]', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['spell_slot']);
    const ui = calledHead(goal!, 'spell_slot');
    if (ui.has('ещё')) ui.click('ещё');
    ui.select(ui.cell('Приходит сам', 0), 'actor');
    dropParam(1);
    param(ui, 'spell_slot', 1, 'Источник', 'sheet', 'источник', { ask: 'empty', role: 'actor' });
    param(ui, 'spell_slot', 2, 'Круг ячейки', 'number', 'circle', { main: true });
    ui.click('+ изменение');
    const made = () => stepCard(/^1 · /);
    within(made()).click('вызов');
    within(made()).select('Какой эффект', 'spend');
    within(made()).formula(within(made()).arg('Что тратим'), '@лист.slots.[@circle].left');
    within(made()).formula(within(made()).arg('Сколько'), '1');
    within(made()).formula(within(made()).arg('Если не хватает'), '@лист.slots.[@circle].none');
    dump({ got: built('spell_slot'), goal });
    expect(built('spell_slot')).toEqual(goal);
  });

  it('D&D «Ресурсы классов после отдыха» (resources_rest): две подписки, цикл по строкам ресурсов, «Если» по колонке строки', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['resources_rest']);
    const ui = fresh('+ срабатывает сам', goal!.label!, 'resources_rest', goal!.group!, goal!.description!);
    lifetime('permanent');
    within(handlerHead(1)).select('Что случилось', 'moment');
    within(handlerHead(1)).select('Когда', 'short-rest');
    within(handlerAt(1)).click('+ для каждого из списка');
    rows(handlerAt(1), 'resources', 'ресурс');
    within(handlerAt(1)).click('+ если');
    within(headOf(block(0, handlerAt(1)))).when('=@носитель.ресурс.short');
    addToArm(block(0, handlerAt(1)), 0, 'change');
    change(() => stepCard(/^2 · /, handlerAt(1)), 'носитель', 'ресурс.left', 'set', '@носитель.ресурс.max');

    ui.click('+ когда');
    within(handlerHead(2)).select('Что случилось', 'moment');
    within(handlerHead(2)).select('Когда', 'long-rest');
    within(handlerAt(2)).click('+ для каждого из списка');
    rows(handlerAt(2), 'resources', 'ресурс');
    within(handlerAt(2)).click('+ изменение');
    change(() => stepCard(/^2 · /, handlerAt(2)), 'носитель', 'ресурс.left', 'set', '@носитель.ресурс.max');

    dump({ got: built('resources_rest'), goal });
    expect(built('resources_rest')).toEqual(goal);
  });
});
