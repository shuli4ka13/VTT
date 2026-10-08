// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within, stepCard } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';
import { groupSteps } from '../cards.ts';

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
  within(card).click(/^имя в формулах/);
  const fresh = stepCard(new RegExp(`^${title} · `));
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
};

const groupsBefore = (effect: Effect): number => groupSteps(effect.cost ?? []).length + groupSteps(effect.steps ?? []).length;

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

describe('эффекты пресетов собираются в конструкторе руками', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('D&D «Атака» (strike)', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['strike']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Атака');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'strike');
    within(ui.cell('Блок')).click('+ новый');
    ui.type(ui.cell('Блок'), 'Атака');
    within(ui.cell('Блок')).click('завести');
    ui.select('Метки', 'атака');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, from?: string) => {
      if (row >= (built('strike')!.params ?? []).length) ui.click('+ вход');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Тип', row), kind);
      if (from) ui.select(ui.cell('Из таблицы', row), from);
      if (ui.cell('Имя в формулах', row).tagName !== 'SPAN') ui.type(ui.cell('Имя в формулах', row), key);
    };
    param(2, 'Бонус атаки', 'number', 'attack_with');
    param(3, 'Прибавка к урону', 'number', 'damage_with');
    param(4, 'Кость урона', 'dice', 'damage_dice');
    param(5, 'Сколько костей', 'number', 'dice');
    param(6, 'Тип урона', 'choice', 'damage_type', 'damage_types');
    param(7, 'Источник урона', 'choice', 'damage_source', 'damage_source');
    param(8, 'Состояние при попадании', 'effect', 'status');
    param(9, 'Цена', 'effect', 'цена');
    ui.select(ui.cell('Если не передали', 3), 'value');
    ui.select(ui.cell('Если не передали', 5), 'value');
    ui.type(ui.cell('Если не передали', 5), '1');
    ui.select(ui.cell('Если не передали', 9), 'value');
    ui.select(ui.cell('Если не передали', 9).querySelectorAll('select')[1]!, 'cost_attack');
    ui.select(ui.cell('Если не передали', 8), 'empty');
    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_attack');
    let cost = stepCard(/^1 · /);
    within(cost).select('Какой эффект', ':вход:цена');
    cost = stepCard(/^1 · /);
    within(cost).formula(within(cost).arg('Лист'), '@действующий');
    within(cost).formula(within(cost).arg('Источник'), '@действующий');


    ui.click('+ проверка');
    let card = stepCard(/^3 · /);
    within(card).formula('Проверка', 'кинуть(@lead_die) + @attack_with >= @цель.ac');
    card = stepCard(/^3 · /);
    within(card).formula('Бросает', '@действующий');
    card = stepCard(/^3 · /);
    within(card).formula('Против кого', '@цель');
    card = stepCard(/^3 · /);
    marks(card, 'атака');
    card = stepCard(/^3 · /);
    nameStep(card, 'hit');
    card = stepCard(/^3 · /);
    within(card).formula('Всегда успех, если на кости не меньше', '20');
    within(card).formula('Всегда провал, если на кости не больше', '1');

    ui.click('+ число');
    card = stepCard(/^4 · /);
    within(card).formula('Сколько', 'кинуть(@damage_dice, @dice * если(@hit_бросок.natural >= @действующий.crit_from, 2, 1)) + @damage_with');
    nameStep(card, 'dmg');

    ui.click('+ изменение');
    card = stepCard(/^5 · /);
    within(card).click('вызов');
    card = stepCard(/^5 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@dmg'], ['Тип урона', '@damage_type'], ['Источник урона', '@damage_source'], ['Лист', '@цель'], ['Источник', '@действующий']] as const) {
      within(card).formula(within(card).arg(name), text);
    }

    ui.click('+ изменение');
    card = stepCard(/^6 · /);
    within(card).click('состояние');
    card = stepCard(/^6 · /);
    within(card).select('Какое', ':вход:status');
    within(card).formula('На кого', '@цель');
    card = stepCard(/^6 · /);
    within(card).formula('Запомнит: Кто наложил', '@действующий');
    within(card).select('Делать', 'формулой…');
    within(card).formula('Условие', 'не(пусто(@status))');
    dump({ got: built('strike') ?? useWorld.getState().system.effects, goal });
    expect(built('strike')).toEqual(goal);
  });

  it('D&D «Адское возмездие» (hellish_rebuke)', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['hellish_rebuke']);
    const ui = within();
    ui.click('+ срабатывает сам');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Адское возмездие');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'hellish_rebuke');
    ui.select('Блок', 'Реакции');
    ui.type('Описание', goal!.description!);

    ui.select('Что именно', 'damage');
    ui.select('Когда именно', 'after');
    ui.select('Кого касается', '@лист == @носитель');
    ui.select('Ещё условие', 'формулой…');
    ui.formula('Условие', 'все(не(пусто(@источник)), @источник != @носитель)');
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
    within(card).click('цена');

    ui.click('+ проверка');
    card = stepCard(/^3 · /);
    within(card).formula('Проверка', 'кинуть(@lead_die) + @источник.abilities.ловкость.save >= @носитель.spell_dc');
    within(card).formula('Бросает', '@источник');
    within(card).formula('Против кого', '@носитель');
    marks(card, 'спасбросок', 'ловкость');
    within(card).select('Шаги ниже идут при', 'always');
    nameStep(card, 'save');

    ui.click('+ число');
    card = stepCard(/^4 · /);
    within(card).formula('Сколько', "(кинуть('2d10'))");
    nameStep(card, 'dmg_всего');

    ui.click('+ число');
    card = stepCard(/^5 · /);
    within(card).formula('Сколько', 'если(@save.success, округлить вниз((@dmg_всего) * (0.5)), @dmg_всего)');
    nameStep(card, 'dmg');

    ui.click('+ изменение');
    card = stepCard(/^6 · /);
    within(card).click('вызов');
    card = stepCard(/^6 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@dmg'], ['Тип урона', '"огонь"'], ['Источник урона', '"магический"'], ['Лист', '@источник'], ['Источник', '@носитель']] as const) {
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
      if (row >= (built('shoot')!.params ?? []).length) ui.click('+ вход');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Тип', row), kind);
      if (more.from) ui.select(ui.cell('Из таблицы', row), more.from);
      if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
      if (more.hint) ui.type(ui.cell('Подсказка за столом', row), more.hint);
      if (more.min !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, more.min);
      if (more.max !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не выше"]')!, more.max);
      ui.type(ui.cell('Имя в формулах', row), key);
    };
    const asked = (key: string) => (goal!.params ?? []).find(p => p.key === key)!.ask!.hint!;
    param(2, 'Тип урона', 'choice', 'damage_type', { from: 'damage_types' });
    param(3, 'Дистанция, метров', 'number', 'distance', { ask: 'gm', hint: asked('distance'), min: '0', max: '100' });
    param(4, 'Сколько удачи тратишь', 'number', 'spend_luck', { ask: 'actor', hint: asked('spend_luck'), min: '0', max: '@luck_left' });
    param(5, 'Кость урона', 'dice', 'damage_dice');
    param(6, 'Куда целишь', 'choice', 'aim', { from: 'aim_places', ask: 'actor', hint: asked('aim') });

    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_action');
    let card = stepCard(/^1 · /);
    within(card).formula(within(card).arg('Лист'), '@действующий');
    within(card).formula(within(card).arg('Источник'), '@действующий');
    ui.click('+ изменение');
    card = stepCard(/^3 · /);
    within(card).select('Какое поле', 'luck_left');
    within(card).formula('Сколько', '@spend_luck');
    within(card).click('цена');

    const number = (at: number, formula: string, name: string) => {
      ui.click('+ число');
      const made = stepCard(new RegExp(`^${at} · `));
      within(made).formula('Сколько', formula);
      nameStep(made, name);
      return () => stepCard(new RegExp(`^${at} · `));
    };
    const up = (card: () => HTMLElement) => within(card()).click('↑');
    const aim = number(4, '@действующий.skills.пистолеты.total + (@spend_luck - если(@aim == "по голове", 8, 0))', 'прицел');
    up(aim);

    ui.click('+ число');
    card = stepCard(/^5 · /);
    within(card).formula('Бросает', '@действующий');
    card = stepCard(/^5 · /);
    within(card).formula('Сколько', 'кинуть(@lead_die) + @прицел');
    marks(card, 'атака');
    nameStep(card, 'hit_бросок');
    within(card).click('↑');

    const dmg = number(6, '(кинуть(@damage_dice))', 'dmg');
    up(dmg);
    const boom = number(7, '5', 'boom');
    within(boom()).select('Делать', 'формулой…');
    within(boom()).formula('Условие', '@dmg.atMax >= 2');
    up(boom);

    ui.click('+ таблица');
    card = stepCard(/^8 · /);
    within(card).select('Какая таблица', 'dv_range');
    within(card).select('По чему ищем строку', 'value');
    card = stepCard(/^8 · /);
    within(card).formula('Число', '@distance');
    nameStep(card, 'dv');

    ui.click('+ проверка');
    card = stepCard(/^9 · /);
    within(card).formula('Проверка', '@hit_бросок >= @dv');
    nameStep(stepCard(/^9 · /), 'hit');

    const send = (at: number, args: [string, string][], when?: string) => {
      ui.click('+ изменение');
      within(stepCard(new RegExp(`^${at} · `))).click('вызов');
      const made = () => stepCard(new RegExp(`^${at} · `));
      within(made()).select('Какой эффект', 'damage');
      for (const [name, text] of args) within(made()).formula(within(made()).arg(name), text);
      if (when) {
        within(made()).select('Делать', 'формулой…');
        within(made()).formula('Условие', when);
      }
    };
    send(10, [['Сколько урона', '@dmg'], ['Тип урона', '@damage_type'], ['Куда попали', '@aim'], ['Лист', '@цель'], ['Источник', '@действующий']]);
    send(11, [['Сколько урона', '@boom'], ['Тип урона', '"критический"'], ['Куда попали', '@aim'], ['Лист', '@цель'], ['Источник', '@действующий']], '@dmg.atMax >= 2');

    dump({ got: built('shoot') ?? useWorld.getState().system.effects, goal });
    expect(built('shoot')).toEqual(goal);
  });

  it('D&D «Концентрация» (concentration): висящий, подписка «урон — после», снимает себя', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['concentration']);
    const ui = within();
    ui.click('+ срабатывает сам');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Концентрация');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'concentration');
    ui.select('Блок', 'Заклинания');
    ui.type('Описание', goal!.description!);
    ui.select('Что именно', 'damage');
    ui.select('Когда именно', 'after');
    ui.select('Кого касается', '@лист == @носитель');

    ui.click('+ проверка');
    let card = stepCard(/^1 · /);
    within(card).formula('Проверка', 'кинуть(@lead_die) + @носитель.abilities.телосложение.save >= (большее из(10, округлить вниз(@amount / 2)))');
    marks(card, 'спасбросок', 'телосложение');
    within(card).select('Шаги ниже идут при', 'fail');
    nameStep(card, 'save');

    ui.click('+ изменение');
    card = stepCard(/^2 · /);
    within(card).click('состояние');
    card = stepCard(/^2 · /);
    within(card).select('Что делаем', 'remove');
    within(card).select('Какое', 'concentration');
    within(card).formula('С кого', '@носитель');

    dump({ got: built('concentration') ?? useWorld.getState().system.effects, goal });
    expect(built('concentration')).toEqual(goal);
  });

  it('D&D «Заклинание» и «усиление с концентрацией»: основа с ценой, потомок с держанием и состоянием из входа', { timeout: 90000 }, () => {
    const [goalBase, goalHeld] = start('dnd5e', ['spell', 'spell_buff_held']);
    const ui = within();
    ui.click('+ вызываемый');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Заклинание');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'spell');
    ui.select('Блок', 'Заклинания');
    ui.type('Описание', goalBase!.description!);
    within(stepCard(/^1 · /)).click('Удалить');
    within(stepCard(/^1 · /)).click('точно убрать');

    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, more: { ask?: string; hint?: string; min?: string; max?: string } = {}) => {
      if (row >= (built('spell')!.params ?? []).length) ui.click('+ вход');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Тип', row), kind);
      if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
      if (more.hint) ui.type(ui.cell('Подсказка за столом', row), more.hint);
      if (more.min !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, more.min);
      if (more.max !== undefined) ui.type(ui.cell('Границы', row).querySelector<HTMLInputElement>('input[placeholder="не выше"]')!, more.max);
      ui.type(ui.cell('Имя в формулах', row), key);
    };
    param(0, 'Кто действует', 'sheet', 'действующий');
    param(1, 'Круг заклинания', 'number', 'spell_level');
    ui.check('«Круг заклинания» правят сопротивления', false);
    param(2, 'Каким кругом', 'number', 'slot', { ask: 'actor', hint: (goalBase!.params ?? [])[2]!.ask!.hint!, min: '1', max: '9' });

    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_action');
    let card = stepCard(/^1 · /);
    within(card).formula(within(card).arg('Лист'), '@действующий');
    within(card).formula(within(card).arg('Источник'), '@действующий');
    ui.click('+ проверка');
    card = stepCard(/^2 · /);
    within(card).formula('Проверка', '@slot >= @spell_level');
    card = stepCard(/^2 · /);
    within(card).type('Что сказать при остановке', 'круг ячейки ниже круга заклинания');
    nameStep(card, '');
    within(stepCard(/^2 · /)).click('цена');
    ui.click('+ изменение');
    card = stepCard(/^3 · /);
    within(card).click('вызов');
    card = stepCard(/^3 · /);
    within(card).select('Какой эффект', 'spell_slot');
    for (const [name, text] of [['Круг ячейки', '@slot'], ['Лист', '@действующий'], ['Источник', '@действующий']] as const) {
      within(card).formula(within(card).arg(name), text);
    }
    within(stepCard(/^3 · /)).click('цена');
    expect(built('spell')).toEqual(goalBase);

    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, goalHeld!.label!);
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'spell_buff_held');
    ui.select('Блок', 'Заклинания');
    ui.type('Описание', goalHeld!.description!);
    ui.select('На основе', 'spell');
    within(ui.cell('Название', 0).parentElement!).click('×');
    ui.click('+ вход');
    ui.type(ui.cell('Название', 1), 'Состояние');
    ui.select(ui.cell('Тип', 1), 'effect');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Имя в формулах', 1), 'status');
    ui.select(ui.cell('Если не передали', 1), 'empty');
    ui.click('+ держание');
    ui.select('Держит', 'concentration');
    ui.select('У кого', 'действующий');

    ui.click('+ изменение');
    let held = stepCard(/^2 · /);
    within(held).click('состояние');
    held = stepCard(/^2 · /);
    within(held).select('Какое', ':вход:status');
    within(held).formula('На кого', '@цель');
    held = stepCard(/^2 · /);
    within(held).formula('Запомнит: Кто наложил', '@действующий');
    dump({ got: built('spell_buff_held'), goal: goalHeld });
    expect(built('spell_buff_held')).toEqual(goalHeld);
  });

  it('Daggerheart «Двойственность» (duality): подписки «завершено», поле стола, условие на шаге', { timeout: 90000 }, () => {
    const [goal] = start('daggerheart', ['duality']);
    const ui = within();
    ui.click('+ срабатывает сам');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Двойственность');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'duality');
    ui.select('Блок', 'Правила');
    ui.type('Описание', goal!.description!);

    const handlerAt = (n: number): HTMLElement => stepCard(new RegExp(`^Подписка №${n}`)).parentElement!;
    const change = (n: number, at: number, owner: string, field: string, how: string, value: string, when?: string) => {
      within(handlerAt(n)).click('+ изменение');
      const card = () => stepCard(new RegExp(`^${at} · `), handlerAt(n));
      within(card()).select('У кого', owner);
      within(card()).select('Какое поле', field);
      within(card()).select('Как', how);
      within(card()).formula('Сколько', value);
      if (when) {
        within(card()).select('Делать', 'формулой…');
        within(card()).formula('Условие', when);
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
      const head = () => stepCard(new RegExp(`^Подписка №${n}`));
      within(head()).select('Что именно', listened);
      within(head()).select('Когда именно', 'done');
      within(head()).select('Кого касается', '@действующий == @носитель');
      within(head()).select('Ещё условие', 'формулой…');
      within(head()).formula('Условие', rule);
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
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'hero_attack');
    ui.select('Блок', 'Атака');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, from?: string) => {
      if (row >= (built('hero_attack')!.params ?? []).length) ui.click('+ вход');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Тип', row), kind);
      if (from) ui.select(ui.cell('Из таблицы', row), from);
      ui.type(ui.cell('Имя в формулах', row), key);
    };
    (goal!.params ?? []).slice(2).forEach((p, index) => param(index + 2, p.label!, p.kind!, p.key, p.from));

    ui.click('+ число');
    let card = stepCard(/^2 · /);
    within(card).formula('Бросает', '@действующий');
    card = stepCard(/^2 · /);
    within(card).formula('Сколько', 'кинуть(@duality) + @trait.value + @attack_bonus');
    within(card).formula('Против кого', 'первый(@цели)');
    marks(card, 'атака', 'герой');
    nameStep(card, 'бросок_бросок');
    within(stepCard(/^2 · /)).click('↑');

    ui.click('+ число');
    card = stepCard(/^3 · /);
    within(card).formula('Сколько', String((goal!.steps![1] as { fixed: { expr: string } }).fixed.expr));
    nameStep(card, 'урон');
    within(stepCard(/^3 · /)).click('↑');

    ui.click('+ проверка');
    card = stepCard(/^4 · /);
    within(card).formula('Проверка', '@бросок_бросок >= @цель.difficulty');
    card = stepCard(/^4 · /);
    within(card).select('Шаги ниже идут при', 'always');
    nameStep(card, 'бросок');

    ui.click('+ проверка');
    card = stepCard(/^5 · /);
    within(card).formula('Проверка', 'если(любое(@бросок.success, @бросок.parts.надежда == @бросок.parts.страх), 1, 0) >= 1');
    card = stepCard(/^5 · /);
    within(card).type('Что сказать при остановке', 'промах');
    nameStep(card, '');

    ui.click('+ изменение');
    within(stepCard(/^6 · /)).click('вызов');
    card = stepCard(/^6 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@урон'], ['Лист', '@цель'], ['Источник', '@действующий']] as const) {
      within(stepCard(/^6 · /)).formula(within(stepCard(/^6 · /)).arg(name), text);
    }
    dump({ got: built('hero_attack'), goal });
    expect(built('hero_attack')).toEqual(goal);
  });

  it('Shadowrun «Атаковать» (ranged_attack) по формам: защита и сопротивление в цикле, счёт успехов', { timeout: 90000 }, () => {
    const world = structuredClone(worldOf('shadowrun6'));
    const goal = structuredClone(world.system.effects.ranged_attack!);
    world.system.effects.ranged_attack!.steps = goal.steps!.slice(0, 6);
    useWorld.setState(state => ({
      ...state, system: world.system as System, compendium: world.compendium,
      activeEffectId: 'ranged_attack', activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
    }));
    render(<EffectsTab />);
    openAll();
    const ui = within();
    const at = (n: number) => stepCard(new RegExp(`^${n} · `));
    const first = groupsBefore(world.system.effects.ranged_attack!) + 1;

    ui.click('+ число');
    within(at(first)).formula('Бросает', '@цель');
    within(at(first)).formula('Сколько', 'кинуть(@pool, @цель.defense_pool)');
    within(at(first)).formula('Против кого', '@действующий');
    marks(at(first), 'защита');
    nameStep(at(first), 'атака_против');

    ui.click('+ проверка');
    within(at(first + 1)).formula('Проверка', '@атака_бросок >= @атака_против');
    within(at(first + 1)).select('Шаги ниже идут при', 'always');
    nameStep(at(first + 1), 'атака');

    ui.click('+ проверка');
    within(at(first + 2)).formula('Проверка', '@атака.natural + (если(или(@успех_за_преимущество, 0) >= 1, 1, 0)) - @атака_против.natural >= 0');
    within(at(first + 2)).type('Что сказать при остановке', 'промах: успехов атаки меньше, чем у защиты');
    nameStep(at(first + 2), '');

    ui.click('+ проверка');
    within(at(first + 3)).formula('Проверка', 'кинуть(@pool, @цель.body) >= 0');
    within(at(first + 3)).formula('Бросает', '@цель');
    within(at(first + 3)).formula('Против кого', '@действующий');
    marks(at(first + 3), 'сопротивление');
    within(at(first + 3)).select('Шаги ниже идут при', 'always');
    nameStep(at(first + 3), 'сопротивление');

    const got = built('ranged_attack')!;
    dump({ got: { ...got, steps: got.steps }, goal: { ...goal, steps: goal.steps!.slice(0, 11) } });
    expect(got.steps).toEqual(goal.steps!.slice(0, 11));
  });

  it('Blades «Залечь на дно» (lay_low): условная метка броска, степени успеха, «стало» формулой', { timeout: 90000 }, () => {
    const [goal] = start('blades', ['lay_low']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Залечь на дно');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'lay_low');
    within(ui.cell('Блок')).click('+ новый');
    ui.type(ui.cell('Блок'), 'Банда');
    within(ui.cell('Блок')).click('завести');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    ui.click('+ вход');
    ui.type(ui.cell('Название', 2), 'Рейтинг действия');
    ui.select(ui.cell('Если не передали', 2), 'actor');
    ui.type(ui.cell('Подсказка за столом', 2), (goal!.params ?? [])[2]!.ask!.hint!);
    ui.type(ui.cell('Границы', 2).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, '0');
    ui.type(ui.cell('Границы', 2).querySelector<HTMLInputElement>('input[placeholder="не выше"]')!, '4');
    ui.type(ui.cell('Имя в формулах', 2), 'rating');

    ui.click('+ число');
    const at = (n: number) => stepCard(new RegExp(`^${n} · `));
    within(at(2)).formula('Бросает', '@действующий');
    within(at(2)).formula('Сколько', 'кинуть(@pool)');
    marks(at(2), 'действие', '=если(@rating == 0, "нулевой", "")');
    nameStep(at(2), 'бросок_бросок');
    within(at(2)).click('↑');

    ui.click('+ проверка');
    within(at(3)).formula('Проверка', '@бросок_бросок >= 4');
    within(at(3)).select('Шаги ниже идут при', 'always');
    within(at(3)).select('Степени успеха', 'outcome');
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
