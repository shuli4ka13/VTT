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
  within(card).click('имя в формулах…');
  const fresh = stepCard(new RegExp(`^${title} · `));
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
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
      ui.type(ui.cell('Имя в формулах', row), key);
    };
    param(2, 'Бонус атаки', 'number', 'attack_with');
    param(3, 'Прибавка к урону', 'number', 'damage_with');
    param(4, 'Кость урона', 'dice', 'damage_dice');
    param(5, 'Тип урона', 'choice', 'damage_type', 'damage_types');
    param(6, 'Источник урона', 'choice', 'damage_source', 'damage_source');
    ui.select(document.querySelector<HTMLElement>('.add-cost select')!, 'cost_attack');
    const cost = stepCard(/^1 · /);
    within(cost).formula(within(cost).arg('Лист'), '@действующий');
    within(cost).formula(within(cost).arg('Источник'), '@действующий');

    ui.click('+ число');
    let card = stepCard(/^3 · /);
    within(card).select('Бросает', 'действующий');
    card = stepCard(/^3 · /);
    within(card).formula('Сколько', 'кинуть(@lead_die, @атака) + @attack_with');
    within(card).select('Против кого', 'первый(@цели)');
    nameStep(card, 'hit_бросок');
    within(card).click('↑');

    ui.click('+ число');
    card = stepCard(/^4 · /);
    within(card).formula('Сколько', '(кинуть(@damage_dice, (если(@hit_бросок.natural >= @действующий.crit_from, 2, 1))) + @damage_with)');
    nameStep(card, 'dmg');
    within(card).click('↑');

    ui.click('+ проверка');
    card = stepCard(/^5 · /);
    within(card).formula('Проверка', '@hit_бросок >= @цель.ac');
    card = stepCard(/^5 · /);
    nameStep(card, 'hit');
    within(card).formula('Всегда успех, если на кости не меньше', '20');
    within(card).formula('Всегда провал, если на кости не больше', '1');

    ui.click('+ изменение');
    card = stepCard(/^6 · /);
    within(card).click('вызов');
    card = stepCard(/^6 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@dmg'], ['Тип урона', '@damage_type'], ['Источник урона', '@damage_source'], ['Лист', '@цель'], ['Источник', '@действующий']] as const) {
      within(card).formula(within(card).arg(name), text);
    }
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
    within(card).formula('Проверка', 'кинуть(@lead_die, @спасбросок, @ловкость) + @источник.abilities.ловкость.save >= @носитель.spell_dc');
    within(card).select('Бросает', 'источник');
    within(card).select('Против кого', 'носитель');
    within(card).select('Дальше при', 'always');
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
    within(card).select('Бросает', 'действующий');
    card = stepCard(/^5 · /);
    within(card).formula('Сколько', 'кинуть(@lead_die, @атака) + @прицел');
    within(card).select('Против кого', 'первый(@цели)');
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
});
