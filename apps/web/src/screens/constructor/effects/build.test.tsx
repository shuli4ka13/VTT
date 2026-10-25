// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within, stepCard, callIf, dragParamBefore, blocks, block, headOf, armLabel, addToArm, addArm, stopNote, lastNumber, outcomeIf, wrapIf, forkBy } from '../../../testing/cards.ts';
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

const nameStep = (card: HTMLElement, name: string): void => {
  const title = (card.querySelector('.step-fold, .card__head')?.textContent ?? '').replace(/^[▾▸]\s*/, '').split('·')[0]!.trim();
  const own = card.querySelector<HTMLElement>('.number-line input.input');
  if (own) { within(card).type(own, name); return; }
  within(card).click(/^(имя в формулах|результат)/);
  const fresh = stepCard(new RegExp(`^${title} · `));
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
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

const savingThrow = (at: number, args: readonly (readonly [string, string])[]): void => {
  within().click('+ изменение');
  const made = () => stepCard(new RegExp(`^${at} · `));
  within(made()).click('вызов');
  within(made()).select('Какой эффект', 'saving_throw');
  for (const [name, text] of args) within(made()).formula(within(made()).arg(name), text);
  nameStep(made(), 'спас');
};

const built = (id: string): Effect | undefined => useWorld.getState().system.effects[id];

const dump = (what: unknown) => {
  if (process.env.BUILD_DUMP) writeFileSync(process.env.BUILD_DUMP, JSON.stringify(what, null, 1));
};

describe('эффекты пресетов собираются в конструкторе руками', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('D&D «Атака» (strike)', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['strike']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Атака');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'strike');
    within(ui.cell('Блок')).click('+ новый');
    ui.type(ui.cell('Блок'), 'Атака');
    within(ui.cell('Блок')).click('завести');
    ui.select('Метки', 'атака');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, from?: string) => {
      if (row >= (built('strike')!.params ?? []).length) ui.click('+ ещё одно');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (from) ui.select(ui.cell('Таблица', row), from);
      if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
    };
    param(2, 'Бонус атаки', 'number', 'attack_with');
    param(3, 'Прибавка к урону', 'number', 'damage_with');
    param(4, 'Кость урона', 'dice', 'damage_dice');
    param(5, 'Сколько костей', 'number', 'dice');
    param(6, 'Тип урона', 'choice', 'damage_type', 'damage_types');
    param(7, 'Источник урона', 'choice', 'damage_source', 'damage_source');
    param(8, 'Состояние при попадании', 'effect', 'status');
    param(9, 'Плата', 'effect', 'цена');
    param(10, 'Круг заклинания', 'number', 'spell_level');
    ui.select(ui.cell('Если не передали', 3), 'value');
    ui.select(ui.cell('Если не передали', 5), 'value');
    ui.type(ui.cell('Если не передали', 5), '1');
    ui.select(ui.cell('Если не передали', 10), 'empty');
    ui.select(ui.cell('Если не передали', 9), 'value');
    ui.select(ui.cell('Если не передали', 9).querySelectorAll('select')[1]!, 'cost_attack');
    ui.select(ui.cell('Если не передали', 8), 'empty');
    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_attack');
    let cost = stepCard(/^1 · /);
    within(cost).select('Какой эффект', ':вход:цена');
    cost = stepCard(/^1 · /);
    within(cost).formula(within(cost).arg('Лист'), '@действующий');
    within(cost).formula(within(cost).arg('Источник'), '@действующий');
    useWorld.setState(state => {
      const effect = state.system.effects.strike!;
      const step = effect.cost![0] as unknown as { args: Record<string, unknown> };
      step.args = { ...step.args, spell_level: { expr: '@spell_level' } };
      return { ...state, system: { ...state.system, effects: { ...state.system.effects, strike: { ...effect } } } };
    });


    ui.click('+ изменение');
    let card = stepCard(/^3 · /);
    within(card).click('вызов');
    card = stepCard(/^3 · /);
    within(card).select('Какой эффект', 'attack_roll');
    within(card).formula(within(card).arg('Бонус атаки'), '@attack_with');
    nameStep(stepCard(/^3 · /), 'бросок');

    forkBy(stepCard(/^3 · /), 'исход', 'попал');
    const hit = blocks().length - 1;
    expect(armLabel(block(hit))).toBe('попадание · крит:');
    addToArm(block(hit), 0, 'number');
    card = stepCard(/^4 · /);
    within(card).formula('Формула', 'кинуть(@damage_dice, @dice * @бросок.исход.dice_mul) + @damage_with');
    nameStep(card, 'урон');

    addToArm(block(hit), 0, 'change');
    card = stepCard(/^5 · /);
    within(card).click('вызов');
    card = stepCard(/^5 · /);
    within(card).select('Какой эффект', 'damage');
    within(card).formula(within(card).arg('Сколько урона'), '@урон');

    addToArm(block(hit), 0, 'change');
    card = stepCard(/^6 · /);
    within(card).click('состояние');
    card = stepCard(/^6 · /);
    within(card).select('Какое', ':вход:status');
    within(card).formula('На кого', '@цель');
    card = stepCard(/^6 · /);
    within(card).formula('Запомнит: Кто наложил', '@действующий');
    wrapIf(() => stepCard(/^6 · /), '=не пусто(@status)');
    dump({ got: built('strike') ?? useWorld.getState().system.effects, goal });
    expect(built('strike')).toEqual(goal);
  });

  it('D&D «Адское возмездие» (hellish_rebuke)', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['hellish_rebuke']);
    const ui = within();
    ui.click('+ срабатывает сам');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Адское возмездие');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'hellish_rebuke');
    ui.select('Папка', 'Реакции');
    ui.type('Описание', goal!.description!);

    ui.select('Что именно', 'damage');
    ui.select('Когда именно', 'after');
    ui.select('Кого касается', '@лист == @носитель');
    ui.when('=не пусто(@источник) и @источник != @носитель');
    ui.select('Решение', 'ask');

    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_reaction');
    let card = stepCard(/^1 · /);
    within(card).formula(within(card).arg('Лист'), '@носитель');
    within(card).formula(within(card).arg('Источник'), '@носитель');
    ui.click('+ изменение');
    card = stepCard(/^2 · /);
    within(card).click('вызов');
    card = stepCard(/^2 · /);
    within(card).select('Какой эффект', 'spell_slot');
    for (const name of within(card).args()) {
      within(card).formula(within(card).arg(name), name === 'Лист' || name === 'Источник' ? '@носитель' : '1');
    }
    within(card).click('↑');

    savingThrow(3, [['Кто спасается', '@источник'], ['Чем спасается', '"ловкость"'], ['Сложность', '@носитель.spell_dc']]);

    ui.click('+ число');
    card = stepCard(/^4 · /);
    within(card).formula('Формула', "(кинуть('2d10'))");
    nameStep(card, 'урон_всего');

    ui.click('+ число');
    card = stepCard(/^5 · /);
    within(card).formula('Формула', 'если(@спас.прошёл, округлить вниз((@урон_всего) * (0.5)), @урон_всего)');
    nameStep(card, 'урон');

    ui.click('+ изменение');
    card = stepCard(/^6 · /);
    within(card).click('вызов');
    card = stepCard(/^6 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@урон'], ['Тип урона', '"огонь"'], ['Источник урона', '"магический"'], ['Лист', '@источник'], ['Источник', '@носитель']] as const) {
      within(card).formula(within(card).arg(name), text);
    }
    dump({ got: built('hellish_rebuke') ?? useWorld.getState().system.effects, goal });
    expect(built('hellish_rebuke')).toEqual(goal);
  });

  it('Cyberpunk «Выстрел» (shoot)', { timeout: 60000 }, () => {
    const [goal] = start('cp-slice', ['shoot']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Выстрел');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'shoot');
    within(ui.cell('Блок')).click('+ новый');
    ui.type(ui.cell('Блок'), 'Атака');
    within(ui.cell('Блок')).click('завести');
    ui.select('Метки', 'атака');
    ui.type('Значок', '🔫');
    ui.type('Описание', goal!.description!);

    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, more: { from?: string; ask?: string; hint?: string; min?: string; max?: string } = {}) => {
      if (row >= (built('shoot')!.params ?? []).length) ui.click((built('shoot')!.params ?? []).length ? '+ ещё одно' : '+ вход');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (more.from) ui.select(ui.cell('Таблица', row), more.from);
      if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
      if (more.hint) ui.type(ui.cell('Подсказка за столом', row), more.hint);
      if (more.min !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, more.min);
      if (more.max !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не выше"]')!, more.max);
      if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
    };
    const asked = (key: string) => (goal!.params ?? []).find(p => p.key === key)!.ask!.hint!;
    param(2, 'Тип урона', 'choice', 'damage_type', { from: 'damage_types' });
    param(3, 'Дистанция, метров', 'number', 'distance', { ask: 'gm', hint: asked('distance'), min: '0', max: '100' });
    param(4, 'Сколько удачи тратишь', 'number', 'spend_luck', { ask: 'actor', hint: asked('spend_luck'), min: '0', max: '@luck_left' });
    param(5, 'Кость урона', 'dice', 'damage_dice');
    param(6, 'Куда целишь', 'choice', 'aim', { from: 'aim_places', ask: 'actor', hint: asked('aim') });

    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_action');
    ui.click('+ изменение');
    let card = stepCard(/^3 · /);
    within(card).select('Какое поле', 'luck_left');
    within(card).formula('Сколько', '@spend_luck');
    within(card).click('↑');
    within(stepCard(/^2 · /)).click('↑');

    const number = (at: number, formula: string, name: string) => {
      ui.click('+ число');
      const made = stepCard(new RegExp(`^${at} · `));
      within(made).formula('Формула', formula);
      nameStep(made, name);
      return () => stepCard(new RegExp(`^${at} · `));
    };
    const up = (card: () => HTMLElement) => within(card()).click('↑');
    const aim = number(4, '@действующий.skills.пистолеты.total + (@spend_luck - если(@aim == "по голове", 8, 0))', 'прицел');
    up(aim);

    ui.click('+ число');
    card = stepCard(/^5 · /);
    within(card).formula('Формула', 'кинуть(@lead_die) + @прицел');
    within(card).select('Кто бросает', '@действующий');
    card = stepCard(/^5 · /);
    marks(card, 'атака');
    nameStep(card, 'попадание_бросок');
    within(card).click('↑');

    const dmg = number(6, '(кинуть(@damage_dice))', 'урон');
    up(dmg);
    const boom = number(7, '5', 'взрыв');
    wrapIf(boom, '=@урон.atMax >= 2');
    within(headOf(block(0))).click('↑');

    ui.click('+ таблица');
    card = stepCard(/^8 · /);
    within(card).select('Какая таблица', 'dv_range');
    within(card).select('По чему ищем строку', 'value');
    card = stepCard(/^8 · /);
    within(card).formula('Число', '@distance');
    nameStep(card, 'сложность');

    ui.click('+ проверка');
    card = stepCard(/^9 · /);
    within(card).formula('Проверка', '@попадание_бросок >= @сложность');
    nameStep(stepCard(/^9 · /), 'попадание');

    const hit = outcomeIf(9, true);
    const send = (at: number, args: [string, string][], when?: string) => {
      addToArm(block(hit), 0, 'change');
      within(stepCard(new RegExp(`^${at} · `))).click('вызов');
      const made = () => stepCard(new RegExp(`^${at} · `));
      within(made()).select('Какой эффект', 'damage');
      for (const [name, text] of args) within(made()).formula(within(made()).arg(name), text);
      if (when) {
        wrapIf(made, `=${when}`);
      }
    };
    send(10, [['Сколько урона', '@урон']]);
    send(11, [['Сколько урона', '@взрыв'], ['Тип урона', '"критический"']], '@урон.atMax >= 2');

    dump({ got: built('shoot') ?? useWorld.getState().system.effects, goal });
    expect(built('shoot')).toEqual(goal);
  });

  it('D&D «Концентрация» (concentration): висящий, подписка «урон — после», снимает себя', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['concentration']);
    const ui = within();
    ui.click('+ срабатывает сам');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Концентрация');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'concentration');
    ui.select('Папка', 'Заклинания');
    ui.type('Описание', goal!.description!);
    ui.select('Что именно', 'damage');
    ui.select('Когда именно', 'after');
    ui.select('Кого касается', '@лист == @носитель');

    savingThrow(1, [['Кто спасается', '@носитель'], ['Чем спасается', '"телосложение"'], ['Сложность', '(большее из(10, округлить вниз(@amount / 2)))']]);
    let card: HTMLElement;

    const kept = callIf(1, 'Спасбросок', 'не спасся');
    addToArm(block(kept), 0, 'change');
    card = stepCard(/^2 · /);
    within(card).click('состояние');
    card = stepCard(/^2 · /);
    within(card).select('Что делаем', 'remove');
    within(card).select('Какое', 'concentration');
    within(card).formula('С кого', '@носитель');

    dump({ got: built('concentration') ?? useWorld.getState().system.effects, goal });
    expect(built('concentration')).toEqual(goal);
  });

  it('D&D «Заклинание: усиление» (spell_buff): цена-вызов cost_spell, условное держание, состояние из входа', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['spell_buff']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, goal!.label!);
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'spell_buff');
    ui.select('Папка', 'Заклинания');
    ui.type('Описание', goal!.description!);

    const param = (row: number, label: string, kind: string, key: string, more: { ask?: string; hint?: string; min?: string; max?: string } = {}) => {
      if (row >= (built('spell_buff')!.params ?? []).length) ui.click((built('spell_buff')!.params ?? []).length ? '+ ещё одно' : '+ вход');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
      if (more.hint) ui.type(ui.cell('Подсказка за столом', row), more.hint);
      if (more.min !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, more.min);
      if (more.max !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не выше"]')!, more.max);
      if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
    };
    param(0, 'Кто действует', 'sheet', 'действующий');
    param(2, 'Круг заклинания', 'number', 'spell_level');
    ui.check('«Круг заклинания» — величина', false);
    param(3, 'Каким кругом', 'number', 'slot', { ask: 'actor', hint: (goal!.params ?? [])[2]!.ask!.hint!, min: '1', max: '9' });
    param(4, 'Состояние', 'effect', 'status');
    dragParamBefore('Цели', 'Состояние');
    ui.select(ui.cell('Если не передали', 4), 'empty');
    param(5, 'Держится концентрацией', 'boolean', 'holds');
    ui.select(ui.cell('Если не передали', 5), 'value');

    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_spell');
    let card = stepCard(/^1 · /);
    ui.click('+ держание');
    ui.select('Держит', 'concentration');
    ui.select('У кого', 'действующий');
    ui.when('=@holds');

    ui.click('+ изменение');
    let held = stepCard(/^3 · /);
    within(held).click('состояние');
    held = stepCard(/^3 · /);
    within(held).select('Какое', ':вход:status');
    within(held).formula('На кого', '@цель');
    held = stepCard(/^3 · /);
    within(held).formula('Запомнит: Кто наложил', '@действующий');
    dump({ got: built('spell_buff'), goal });
    expect(built('spell_buff')).toEqual(goal);
  });

  it('Daggerheart «Двойственность» (duality): подписки «завершено», поле стола, условие на шаге', { timeout: 90000 }, () => {
    const [goal] = start('daggerheart', ['duality']);
    const ui = within();
    ui.click('+ срабатывает сам');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Двойственность');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'duality');
    ui.select('Папка', 'Правила');
    ui.type('Описание', goal!.description!);

    const handlerAt = (n: number): HTMLElement => stepCard(new RegExp(`^Когда №${n}`)).parentElement!;
    const change = (n: number, at: number, owner: string, field: string, how: string, value: string, when?: string) => {
      within(handlerAt(n)).click('+ изменение');
      const card = () => stepCard(new RegExp(`^${at} · `), handlerAt(n));
      within(card()).select('У кого', owner);
      within(card()).select('Какое поле', field);
      within(card()).select('Как', how);
      within(card()).formula('Сколько', value);
      if (when) {
        wrapIf(card, `=${when}`, handlerAt(n));
      }
    };
    const cases: [string, string, string][] = [
      ['action_roll', '@бросок.parts.надежда > @бросок.parts.страх', 'hope'],
      ['action_roll', '@бросок.parts.страх > @бросок.parts.надежда', 'fear'],
      ['action_roll', '@бросок.parts.надежда == @бросок.parts.страх', 'crit'],
      ['hero_attack', '@бросок_бросок.parts.надежда > @бросок_бросок.parts.страх', 'hope'],
      ['hero_attack', '@бросок_бросок.parts.страх > @бросок_бросок.parts.надежда', 'fear'],
      ['hero_attack', '@бросок_бросок.parts.надежда == @бросок_бросок.parts.страх', 'crit'],
    ];
    cases.forEach(([listened, rule, gain], index) => {
      const n = index + 1;
      if (n > 1) ui.click('+ когда');
      const head = () => stepCard(new RegExp(`^Когда №${n}`));
      within(head()).select('Что именно', listened);
      within(head()).select('Когда именно', 'done');
      within(head()).select('Кого касается', '@действующий == @носитель');
      within(head()).when(`=${rule}`);
      if (gain === 'fear') change(n, 1, 'стол', 'fear', 'add', '1');
      else change(n, 1, 'носитель', 'hope', 'add', '1');
      if (gain === 'crit') change(n, 2, 'носитель', 'stress', 'subtract', '1', '@носитель.stress >= 1');
    });

    dump({ got: built('duality'), goal });
    expect(built('duality')).toEqual(goal);
  });

  it('Daggerheart «Атака героя» (hero_attack): кости двойственности, проверка-формула с заметкой', { timeout: 90000 }, () => {
    const [goal] = start('daggerheart', ['hero_attack']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Атака героя');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'hero_attack');
    ui.select('Папка', 'Атака');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, from?: string) => {
      if (row >= (built('hero_attack')!.params ?? []).length) ui.click((built('hero_attack')!.params ?? []).length ? '+ ещё одно' : '+ вход');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (from) ui.select(ui.cell('Таблица', row), from);
      if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
    };
    (goal!.params ?? []).slice(2).forEach((p, index) => param(index + 2, p.label!, p.kind!, p.key, p.from));

    ui.click('+ число');
    let card = stepCard(/^2 · /);
    within(card).formula('Формула', 'кинуть(@duality) + @trait.value + @attack_bonus');
    within(card).select('Кто бросает', '@действующий');
    card = stepCard(/^2 · /);
    marks(card, 'атака', 'герой');
    nameStep(card, 'бросок_бросок');
    within(stepCard(/^2 · /)).click('↑');

    ui.click('+ число');
    card = stepCard(/^3 · /);
    within(card).formula('Формула', String((goal!.steps![1] as { fixed: { expr: string } }).fixed.expr));
    nameStep(card, 'урон');
    within(stepCard(/^3 · /)).click('↑');

    ui.click('+ проверка');
    card = stepCard(/^4 · /);
    within(card).formula('Проверка', '@бросок_бросок >= @цель.difficulty');
    card = stepCard(/^4 · /);
    nameStep(card, 'бросок');

    ui.click('+ если');
    addToArm(block(0), 0, 'stop');
    within(headOf(block(0))).when('=если(@бросок.success или @бросок.parts.надежда == @бросок.parts.страх, 1, 0) < 1');
    stopNote(5, 'промах');

    ui.click('+ изменение');
    within(stepCard(/^6 · /)).click('вызов');
    card = stepCard(/^6 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@урон']] as const) {
      within(stepCard(/^6 · /)).formula(within(stepCard(/^6 · /)).arg(name), text);
    }
    dump({ got: built('hero_attack'), goal });
    expect(built('hero_attack')).toEqual(goal);
  });

  it('Shadowrun «Выстрелить» (shoot): по цели — вызов «Отразить атаку», промах — стоп, вызов «Нанести урон»', { timeout: 90000 }, () => {
    const world = structuredClone(worldOf('shadowrun6'));
    const goal = structuredClone(world.system.effects.shoot!);
    const steps = goal.steps! as { id?: string; type: string; args?: Record<string, { expr: string }> }[];
    const from = steps.findIndex(step => step.id === 'отпор');
    world.system.effects.shoot!.steps = goal.steps!.slice(0, from);
    useWorld.setState(state => ({
      ...state, system: world.system as System, compendium: world.compendium,
      activeEffectId: 'shoot', activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
    }));
    render(<EffectsTab />);
    openAll();
    const ui = within();
    const at = (n: number) => () => stepCard(new RegExp(`^${n} · `));
    const first = lastNumber() + 1;
    const shown = blocks().length;
    const call = (n: number, effect: string, name: string, args: Record<string, { expr: string }>, labels: Record<string, string>) => {
      ui.click('+ изменение');
      within(at(n)()).click('вызов');
      within(at(n)()).select('Какой эффект', effect);
      for (const [key, label] of Object.entries(labels)) within(at(n)()).formula(within(at(n)()).arg(label), args[key]!.expr);
      nameStep(at(n)(), name);
    };

    call(first, 'defend', 'отпор', steps[from]!.args!, { кто: 'Кто защищается', успехов: 'Успехов атаки', атк: 'Значение атаки', навык: 'Навык атаки', близко: 'Вплотную или близко' });
    ui.click('+ если');
    addToArm(block(shown), 0, 'stop');
    within(headOf(block(shown))).when('=не @отпор.попал');
    stopNote(first + 1, 'промах: успехов атаки меньше, чем у защиты');
    call(first + 2, 'strike_damage', 'вред', steps[from + 4]!.args!, { цель: 'Кого бьют', источник: 'Кто бьёт', су: 'Сила урона', физический: 'Урон физический', электричество: 'Электрический урон', вырубить: 'Вырубить ударом', без_урона: 'Без урона' });

    const got = built('shoot')!;
    dump({ got: got.steps, goal: goal.steps });
    expect(got.steps).toEqual(goal.steps);
  });

  it('Blades «Залечь на дно» (lay_low): условная метка броска, степени успеха, «стало» формулой', { timeout: 90000 }, () => {
    const [goal] = start('blades', ['lay_low']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Залечь на дно');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'lay_low');
    within(ui.cell('Блок')).click('+ новый');
    ui.type(ui.cell('Блок'), 'Банда');
    within(ui.cell('Блок')).click('завести');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    ui.click('+ ещё одно');
    ui.type(ui.cell('Название', 2), 'Рейтинг действия');
    ui.select(ui.cell('Если не передали', 2), 'actor');
    ui.type(ui.cell('Подсказка за столом', 2), (goal!.params ?? [])[2]!.ask!.hint!);
    ui.type(ui.cell('Границы', 2).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, '0');
    ui.type(ui.cell('Границы', 2).querySelector<HTMLInputElement>('input[placeholder="не выше"]')!, '4');
    ui.type(ui.cell('Имя в формулах', 2), 'rating');

    ui.click('+ число');
    const at = (n: number) => stepCard(new RegExp(`^${n} · `));
    within(at(2)).formula('Формула', 'кинуть(@pool)');
    within(at(2)).select('Кто бросает', '@действующий');
    marks(at(2), 'действие', '=если(@rating == 0, "нулевой", "")');
    nameStep(at(2), 'бросок_бросок');
    within(at(2)).click('↑');

    ui.click('+ проверка');
    within(at(3)).formula('Проверка', '@бросок_бросок >= 4');
    within(at(3)).select('Исход ступенями', 'outcome');
    nameStep(at(3), 'бросок');

    ui.click('+ изменение');
    within(at(4)).select('У кого', 'цель');
    within(at(4)).select('Какое поле', 'heat');
    within(at(4)).select('Как', 'set');
    within(at(4)).formula('Сколько', String((goal!.steps![3] as { value: { expr: string } }).value.expr));

    dump({ got: built('lay_low'), goal });
    expect(built('lay_low')).toEqual(goal);
  });
});
