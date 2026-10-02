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
    within(card).click('имя в формулах…');
    within(card).type(card.querySelector<HTMLElement>('.step-name input')!, 'hit_бросок');
    within(card).click('↑');

    ui.click('+ число');
    card = stepCard(/^4 · /);
    within(card).formula('Сколько', '(кинуть(@damage_dice, (если(@hit_бросок.natural >= @действующий.crit_from, 2, 1))) + @damage_with)');
    within(card).click('имя в формулах…');
    within(card).type(card.querySelector<HTMLElement>('.step-name input')!, 'dmg');
    within(card).click('↑');

    ui.click('+ проверка');
    card = stepCard(/^5 · /);
    within(card).formula('Проверка', '@hit_бросок >= @цель.ac');
    card = stepCard(/^5 · /);
    within(card).click('имя в формулах…');
    within(card).type(card.querySelector<HTMLElement>('.step-name input')!, 'hit');
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
});
