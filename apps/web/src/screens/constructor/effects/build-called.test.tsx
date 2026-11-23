// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
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

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const nameStep = (card: HTMLElement, name: string): void => {
  const title = (card.querySelector('.step-fold, .card__head')?.textContent ?? '').replace(/^[▾▸]\s*/, '').split('·')[0]!.trim();
  const own = card.querySelector<HTMLElement>('.number-line input.input');
  if (own) { within(card).type(own, name); return; }
  within(card).click(/^имя в формулах/);
  const fresh = stepCard(new RegExp(`^${title} · `));
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
};

const calledHead = (ui: ReturnType<typeof within>, id: string, goal: Effect) => {
  ui.click('+ кнопкой');
  ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, goal.label!);
  if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
  ui.click('имя в формулах…');
  ui.type(document.querySelector<HTMLElement>('.step-name input')!, id);
  ui.select('Папка', goal.group!);
  ui.type('Описание', goal.description!);
};

const param = (ui: ReturnType<typeof within>, id: string, row: number, label: string, kind: string, key: string, more: { from?: string; optional?: boolean; value?: string; role?: string } = {}) => {
  if (row >= (built(id)!.params ?? []).length) ui.click((built(id)!.params ?? []).length ? '+ ещё одно' : '+ вход');
  if (ui.has('ещё')) ui.click('ещё');
  ui.type(ui.cell('Название', row), label);
  ui.select(ui.cell('Вид', row), kind);
  if (more.from) ui.select(ui.cell('Таблица', row), more.from);
  if (more.optional) ui.select(ui.cell('Если не передали', row), 'empty');
  if (more.value !== undefined) { ui.select(ui.cell('Если не передали', row), 'value'); ui.type(ui.cell('Если не передали', row), more.value); }
  if (more.role) ui.select(ui.cell('Кто это', row), more.role);
  if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
};

const returns = (rows: readonly (readonly [string, string, string, string, string?, string?])[]) => {
  const card = () => [...document.querySelectorAll<HTMLElement>('.card')].find(c => /^Что получит тот, кто вызвал/.test(textOf(c)))!;
  rows.forEach(([label, kind, key, from, no, table], row) => {
    within(card()).click('+ итог');
    const box = within(card());
    box.type(box.cell('Название', row), label);
    box.select(box.cell('Вид', row), kind);
    if (table) within(card()).select(within(card()).cell('Таблица', row), table);
    if (from.startsWith('=')) {
      box.select(box.cell('Откуда', row), ':формула');
      within(card()).formula(within(card()).cell('Откуда', row), from.slice(1));
    } else box.select(box.cell('Откуда', row), from);
    if (no) within(card()).type(within(card()).cell('Как назвать «нет»', row), no);
    const named = within(card()).cell('Имя в формулах', row);
    if (named.querySelector('input')) within(card()).type(named, key);
  });
};

describe('вызываемые блоки D&D собираются руками', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('D&D «Бросок атаки» (attack_roll)', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['attack_roll']);
    const ui = within();
    calledHead(ui, 'attack_roll', goal!);
    param(ui, 'attack_roll', 0, 'Кто бросает', 'sheet', 'kto', { role: 'actor' });
    param(ui, 'attack_roll', 1, 'Против кого', 'sheet', 'protiv', { role: 'target' });
    param(ui, 'attack_roll', 2, 'Бонус атаки', 'number', 'bonus', { value: '0' });
    const at = (k: number) => () => stepCard(new RegExp(`^${k} · `));
    ui.click('+ бросок');
    within(at(1)()).select('Кто бросает', '@kto');
    within(at(1)()).select('Что бросает', 'die:lead_die');
    within(at(1)()).click('+ прибавка');
    within(at(1)()).formula('Прибавка', '@bonus');
    within(at(1)()).select('Метки', 'ataka');
    nameStep(at(1)(), 'бросок');
    ui.click('+ проверка');
    within(at(2)()).formula('Что проверяем', '@бросок');
    within(at(2)()).formula('С чем', '@protiv.ac');
    within(at(2)()).formula('Успех, если на кости не меньше', '@kto.crit_from');
    within(at(2)()).formula('Провал, если на кости не больше', '1');
    nameStep(at(2)(), 'проверка');
    returns([
      ['исход', 'choice', 'ishod', '=если(не @проверка.success, "promah", если(@проверка.natural >= @kto.crit_from, "krit", "popadanie"))', undefined, 'attack_outcomes'],
      ['на костях', 'number', 'na_kostyah', 'Проверка — что выпало на костях, без прибавок'],
    ]);
    dump({ got: built('attack_roll'), goal });
    expect(built('attack_roll')).toEqual(goal);
  });

  it('D&D «Спасбросок» (saving_throw)', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['saving_throw']);
    const ui = within();
    calledHead(ui, 'saving_throw', goal!);
    param(ui, 'saving_throw', 0, 'Кто спасается', 'sheet', 'kto', { role: 'target' });
    param(ui, 'saving_throw', 1, 'Чем спасается', 'choice', 'harakteristika', { from: 'abilities' });
    param(ui, 'saving_throw', 2, 'Сложность', 'number', 'slozhnost');
    const at = (k: number) => () => stepCard(new RegExp(`^${k} · `));
    ui.click('+ бросок');
    within(at(1)()).select('Что бросает', 'field:harakteristika.save');
    within(at(1)()).select('Ещё метки', 'spasbrosok');
    within(at(1)()).select('Ещё метки', ':формула');
    within(at(1)()).type('Ещё метки', '@harakteristika');
    within(at(1)()).click('добавить');
    nameStep(at(1)(), 'бросок');
    ui.click('+ проверка');
    within(at(2)()).formula('Что проверяем', '@бросок');
    within(at(2)()).formula('С чем', '@slozhnost');
    nameStep(at(2)(), 'проверка');
    returns([
      ['спасся', 'boolean', 'proshel', 'Проверка — пройдена', 'не спасся'],
      ['на костях', 'number', 'na_kostyah', 'Проверка — что выпало на костях, без прибавок'],
    ]);
    dump({ got: built('saving_throw'), goal });
    expect(built('saving_throw')).toEqual(goal);
  });
});
