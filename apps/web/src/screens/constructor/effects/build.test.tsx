// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS, LITE_WORLDS } from '@vtt/engine/samples';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within, stepCard, callIf, dragParamBefore, blocks, block, headOf, armLabel, addToArm, addArm, stopNote, lastNumber, outcomeIf, wrapIf, forkBy } from '../../../testing/cards.ts';
import { EffectsTab } from './effects-tab.tsx';
import { folded } from '../../../testing/folded.ts';

const worldOf = (id: string) => [...SAMPLE_WORLDS, ...LITE_WORLDS].find(w => w.system.id === id)!;

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

const marksUnder = (label: string, card: HTMLElement, tags: string[]): void => {
  for (const tag of tags) {
    if (tag.startsWith('=')) {
      within(card).select(label, ':formula');
      within(card).type(label, tag.slice(1));
      within(card).click('добавить');
    } else within(card).select(label, tag);
  }
};

const marks = (card: HTMLElement, ...tags: string[]): void => marksUnder('Метки', card, tags);

const fieldMarks = (card: HTMLElement, ...tags: string[]): void => marksUnder('Ещё метки', card, tags);

const savingThrow = (at: number, args: readonly (readonly [string, string])[]): void => {
  within().click('+ изменение');
  const made = () => stepCard(new RegExp(`^${at} · `));
  within(made()).click('вызов');
  within(made()).select('Какой эффект', 'saving_throw');
  for (const [name, text] of args) within(made()).formula(within(made()).arg(name), text);
  nameStep(made(), 'спас');
};

const viaLabels = (effect: Effect, text: string): string => {
  const said = new Map<string, string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const holder = value as Record<string, unknown>;
    if (typeof holder.type === 'string' && typeof holder.id === 'string' && typeof holder.label === 'string') said.set(holder.id, holder.label.trim().replace(/\s+/g, '_'));
    const item = holder.item as { key?: unknown; label?: unknown } | undefined;
    if (item && typeof item.key === 'string' && typeof item.label === 'string') said.set(item.key, item.label.trim().replace(/\s+/g, '_'));
    Object.values(holder).forEach(walk);
  };
  walk(effect);
  return text.replace(/@([\p{L}\p{N}_]+)/gu, (whole, name: string) => (said.has(name) ? `@${said.get(name)}` : whole));
};

const built = (id: string): Effect | undefined => folded(useWorld.getState().system.effects[id]);

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
    ui.click('+ для каждого из списка');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Атака');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'strike');
    within(ui.cell('Блок')).click('+ новый');
    ui.type(ui.cell('Блок'), 'Атака');
    within(ui.cell('Блок')).click('завести');
    ui.select('Метки', 'ataka');
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
    param(8, 'Свойства оружия', 'choice', 'свойства', 'weapon_properties');
    param(9, 'Дальность', 'choice', 'дальность', 'reach');
    param(10, 'Состояние при попадании', 'effect', 'status');
    param(11, 'Плата', 'effect', 'цена');
    ui.select(ui.cell('Если не передали', 3), 'value');
    ui.select(ui.cell('Если не передали', 5), 'value');
    ui.type(ui.cell('Если не передали', 5), '1');
    ui.select(ui.cell('Если не передали', 11), 'value');
    ui.select(ui.cell('Если не передали', 11).querySelectorAll('[role="combobox"]')[1]!, 'cost_attack');
    ui.select(ui.cell('Если не передали', 10), 'empty');
    ui.select(ui.cell('Если не передали', 9), 'empty');
    ui.select(ui.cell('Если не передали', 8), 'empty');
    ui.select(document.querySelector<HTMLElement>('.add-cost [role="combobox"]')!, 'cost_attack');
    let cost = stepCard(/^1 · /);
    within(cost).select('Какой эффект', ':input:cena');
    cost = stepCard(/^1 · /);
    within(cost).formula(within(cost).arg('Лист'), '@deystvuyuschiy');
    within(cost).formula(within(cost).arg('Источник'), '@deystvuyuschiy');


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
    addToArm(block(hit), 0, 'roll');
    card = stepCard(/^4 · /);
    within(card).select('Кто бросает', '@deystvuyuschiy');
    within(card).select('Что бросает', 'own-die');
    within(card).formula('Своя кость', '@damage_dice');
    within(card).click('+ сколько раз');
    within(card).formula('Сколько раз', '@dice * @бросок.ishod.dice_mul');
    within(card).click('+ прибавка');
    within(card).formula('Прибавка', '@damage_with');
    card = stepCard(/^4 · /);
    marks(card, 'uron', 'oruzhie', '=@dalnost', '=@svoystva');
    nameStep(card, 'урон');

    addToArm(block(hit), 0, 'change');
    card = stepCard(/^5 · /);
    within(card).click('вызов');
    card = stepCard(/^5 · /);
    within(card).select('Какой эффект', 'damage');
    within(card).formula(within(card).arg('Сколько урона'), '@урон.total');

    addToArm(block(hit), 0, 'change');
    card = stepCard(/^6 · /);
    within(card).click('состояние');
    card = stepCard(/^6 · /);
    within(card).select('Какое', ':input:status');
    within(card).formula('На кого', '@цель');
    card = stepCard(/^6 · /);
    within(card).formula('Запомнит: Кто наложил', '@deystvuyuschiy');
    wrapIf(() => stepCard(/^6 · /), '=не пусто(@status)');
    const got = built('strike');
    const listed = got?.params?.find(one => one.label === 'Свойства оружия');
    if (listed) (listed as { many?: boolean }).many = true;
    dump({ got: got ?? useWorld.getState().system.effects, goal });
    expect(got).toEqual(folded(goal));
  });

  it('D&D «Адское возмездие» (hellish_rebuke)', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['hellish_rebuke']);
    const ui = within();
    ui.click('+ висит');
    ui.click('+ когда');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Адское возмездие');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'hellish_rebuke');
    ui.select('Папка', 'reakcii');
    ui.type('Описание', goal!.description!);

    ui.select('Что именно', 'damage');
    ui.select('Когда именно', 'after');
    ui.select('Кого касается', '@list == @holder');
    ui.when('=не пусто(@источник) и @источник != @holder');
    ui.select('Решение', 'ask');

    ui.select(document.querySelector<HTMLElement>('.add-cost [role="combobox"]')!, 'cost_reaction');
    let card = stepCard(/^1 · /);
    within(card).formula(within(card).arg('Лист'), '@holder');
    within(card).formula(within(card).arg('Источник'), '@holder');
    ui.click('+ изменение');
    card = stepCard(/^2 · /);
    within(card).click('вызов');
    card = stepCard(/^2 · /);
    within(card).select('Какой эффект', 'spell_slot');
    for (const name of within(card).args()) {
      within(card).formula(within(card).arg(name), name === 'Лист' || name === 'Источник' ? '@holder' : '1');
    }
    within(card).click('↑');

    savingThrow(3, [['Кто спасается', '@источник'], ['Чем спасается', '"lovkost"'], ['Сложность', '@holder.spell_dc']]);

    ui.click('+ бросок');
    card = stepCard(/^4 · /);
    within(card).select('Кто бросает', '@holder');
    within(card).select('Что бросает', 'own-die');
    within(card).formula('Своя кость', "'2d10'");
    card = stepCard(/^4 · /);
    marks(card, 'uron', 'zaklinanie');
    nameStep(card, 'урон_всего');

    ui.click('+ число');
    card = stepCard(/^5 · /);
    within(card).formula('Формула', 'if(@спас.proshel, floor((@урон_всего.total) * (0.5)), @урон_всего.total)');
    nameStep(card, 'урон');

    ui.click('+ изменение');
    card = stepCard(/^6 · /);
    within(card).click('вызов');
    card = stepCard(/^6 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@урон'], ['Тип урона', '"ogon"'], ['Источник урона', '"magicheskiy"'], ['Лист', '@источник'], ['Источник', '@holder']] as const) {
      within(card).formula(within(card).arg(name), text);
    }
    dump({ got: built('hellish_rebuke') ?? useWorld.getState().system.effects, goal });
    expect(built('hellish_rebuke')).toEqual(folded(goal));
  });

  it('Cyberpunk «Выстрел» (shoot)', { timeout: 60000 }, () => {
    const [goal] = start('cp-slice', ['shoot']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.click('+ для каждого из списка');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Выстрел');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'shoot');
    within(ui.cell('Блок')).click('+ новый');
    ui.type(ui.cell('Блок'), 'Атака');
    within(ui.cell('Блок')).click('завести');
    ui.select('Метки', 'ataka');
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

    ui.select(document.querySelector<HTMLElement>('.add-cost [role="combobox"]')!, 'cost_action');
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
    ui.click('+ бросок');
    card = stepCard(/^4 · /);
    within(card).select('Кто бросает', '@deystvuyuschiy');
    within(card).select('Что бросает', 'field:skills.pistolety.total');
    within(stepCard(/^4 · /)).click('+ поправка к числу поля');
    within(stepCard(/^4 · /)).formula('Поправка к числу поля', '@spend_luck - if(@aim == "po_golove", 8, 0)');
    fieldMarks(stepCard(/^4 · /), 'ataka');
    nameStep(stepCard(/^4 · /), 'попадание_бросок');
    within(stepCard(/^4 · /)).click('↑');

    ui.click('+ бросок');
    card = stepCard(/^5 · /);
    within(card).select('Кто бросает', '');
    within(card).select('Что бросает', 'expr:@damage_dice');
    nameStep(stepCard(/^5 · /), 'урон');
    within(stepCard(/^5 · /)).click('↑');
    const boom = number(6, '5', 'взрыв');
    wrapIf(boom, '=@урон.atMax >= 2');
    within(headOf(block(0))).click('↑');

    ui.click('+ таблица');
    card = stepCard(/^7 · /);
    within(card).select('Какая таблица', 'dv_range');
    within(card).select('По чему ищем строку', 'value');
    card = stepCard(/^7 · /);
    within(card).formula('Число', '@distance');
    nameStep(card, 'сложность');

    ui.click('+ проверка');
    card = stepCard(/^8 · /);
    within(card).formula('Что проверяем', '@попадание_бросок');
    within(card).formula('С чем', '@сложность');
    nameStep(stepCard(/^8 · /), 'попадание');

    const hit = outcomeIf(8, true);
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
    send(9, [['Сколько урона', '@урон.total']]);
    send(10, [['Сколько урона', '@взрыв'], ['Тип урона', '"kriticheskiy"']], '@урон.atMax >= 2');

    dump({ got: built('shoot') ?? useWorld.getState().system.effects, goal });
    expect(built('shoot')).toEqual(folded(goal));
  });

  it('D&D «Концентрация» (concentration): висящий, подписка «урон — после», снимает себя', { timeout: 60000 }, () => {
    const [goal] = start('dnd5e', ['concentration']);
    const ui = within();
    ui.click('+ висит');
    ui.click('+ когда');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Концентрация');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'concentration');
    ui.select('Папка', 'zaklinaniya');
    ui.type('Описание', goal!.description!);
    ui.select('Что именно', 'damage');
    ui.select('Когда именно', 'after');
    ui.select('Кого касается', '@list == @holder');

    savingThrow(1, [['Кто спасается', '@holder'], ['Чем спасается', '"teloslozhenie"'], ['Сложность', '(max(10, floor(@amount / 2)))']]);
    let card: HTMLElement;

    const kept = callIf(1, 'Спасбросок', 'не спасся');
    addToArm(block(kept), 0, 'change');
    card = stepCard(/^2 · /);
    within(card).click('состояние');
    card = stepCard(/^2 · /);
    within(card).select('Что делаем', 'remove');
    within(card).select('Какое', 'concentration');
    within(card).formula('С кого', '@holder');

    dump({ got: built('concentration') ?? useWorld.getState().system.effects, goal });
    expect(built('concentration')).toEqual(folded(goal));
  });

  it('D&D «Заклинание: усиление» (spell_buff): цена-вызов cost_spell, условное держание, состояние из входа', { timeout: 90000 }, () => {
    const [goal] = start('dnd5e', ['spell_buff']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.click('+ для каждого из списка');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, goal!.label!);
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'spell_buff');
    ui.select('Папка', 'zaklinaniya');
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

    ui.select(document.querySelector<HTMLElement>('.add-cost [role="combobox"]')!, 'cost_spell');
    let card = stepCard(/^1 · /);

    ui.click('+ изменение');
    let held = stepCard(/^3 · /);
    within(held).click('состояние');
    held = stepCard(/^3 · /);
    within(held).select('Какое', ':input:status');
    within(held).formula('На кого', '@цель');
    held = stepCard(/^3 · /);
    within(held).formula('Запомнит: Кто наложил', '@deystvuyuschiy');

    ui.click('+ привязка к якорю');
    ui.select('Якорь', 'concentration');
    ui.select('У кого якорь', 'deystvuyuschiy');
    ui.when('=@holds');
    dump({ got: built('spell_buff'), goal });
    expect(built('spell_buff')).toEqual(folded(goal));
  });

  it('Daggerheart «Двойственность» (duality): подписки «завершено», поле стола, условие на шаге', { timeout: 90000 }, () => {
    const [goal] = start('daggerheart', ['duality']);
    const ui = within();
    ui.click('+ висит');
    ui.click('+ когда');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Двойственность');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'duality');
    ui.select('Папка', 'pravila');
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
      ['action_roll', '@brosok.parts.nadezhda > @brosok.parts.strah', 'hope'],
      ['action_roll', '@brosok.parts.strah > @brosok.parts.nadezhda', 'fear'],
      ['action_roll', '@brosok.parts.nadezhda == @brosok.parts.strah', 'crit'],
      ['hero_attack', '@brosok_brosok.parts.nadezhda > @brosok_brosok.parts.strah', 'hope'],
      ['hero_attack', '@brosok_brosok.parts.strah > @brosok_brosok.parts.nadezhda', 'fear'],
      ['hero_attack', '@brosok_brosok.parts.nadezhda == @brosok_brosok.parts.strah', 'crit'],
    ];
    cases.forEach(([listened, rule, gain], index) => {
      const n = index + 1;
      if (n > 1) ui.click('+ когда');
      const head = () => stepCard(new RegExp(`^Когда №${n}`));
      within(head()).select('Что именно', listened);
      within(head()).select('Когда именно', 'done');
      within(head()).select('Кого касается', '@deystvuyuschiy == @holder');
      within(head()).when(`=${rule}`);
      if (gain === 'fear') change(n, 1, 'desk', 'fear', 'add', '1');
      else change(n, 1, 'holder', 'hope', 'add', '1');
      if (gain === 'crit') change(n, 2, 'holder', 'stress', 'subtract', '1', '@holder.stress >= 1');
    });

    dump({ got: built('duality'), goal });
    expect(built('duality')).toEqual(folded(goal));
  });

  it('Daggerheart «Атака героя» (hero_attack): кости двойственности, проверка-формула с заметкой', { timeout: 90000 }, () => {
    const [goal] = start('daggerheart', ['hero_attack']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.click('+ для каждого из списка');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Атака героя');
    if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
    ui.click('имя в формулах…');
    ui.type(document.querySelector<HTMLElement>('.step-name input')!, 'hero_attack');
    ui.select('Папка', 'ataka');
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

    ui.click('+ бросок');
    let card = stepCard(/^2 · /);
    within(card).select('Кто бросает', '@deystvuyuschiy');
    within(card).select('Что бросает', 'own-field');
    within(card).formula('Адрес поля', '@deystvuyuschiy.[@trait.field]');
    within(stepCard(/^2 · /)).click('+ поправка к числу поля');
    within(stepCard(/^2 · /)).formula('Поправка к числу поля', '@attack_bonus');
    card = stepCard(/^2 · /);
    fieldMarks(card, 'ataka');
    nameStep(card, 'бросок_бросок');
    within(stepCard(/^2 · /)).click('↑');

    const damage = goal!.steps![1] as unknown as { die: { expr: string }; count: { expr: string }; keep: { expr: string }; bonus: { expr: string } };
    ui.click('+ бросок');
    card = stepCard(/^3 · /);
    within(card).select('Кто бросает', '');
    within(card).select('Что бросает', `expr:${damage.die.expr}`);
    within(card).click('+ сколько костей');
    within(card).formula('Сколько костей', viaLabels(goal!, damage.count.expr));
    within(card).click('+ оставить');
    within(card).formula('Сколько оставить', viaLabels(goal!, damage.keep.expr));
    within(card).click('+ прибавка');
    within(card).formula('Прибавка', viaLabels(goal!, damage.bonus.expr));
    card = stepCard(/^3 · /);
    nameStep(card, 'урон');
    within(stepCard(/^3 · /)).click('↑');

    ui.click('+ проверка');
    card = stepCard(/^4 · /);
    within(card).formula('Что проверяем', '@бросок_бросок');
    within(card).formula('С чем', '@цель.difficulty');
    const ladder = (goal!.steps![3] as unknown as { degrees: { label: string; if: { expr: string } }[] }).degrees;
    ladder.forEach((degree, at) => {
      within(stepCard(/^4 · /)).click(degree.if.expr === 'да' ? '+ иначе' : '+ ступень');
      const row = stepCard(/^4 · /).querySelectorAll<HTMLElement>('.roll-degree')[at]!;
      within(row).type(row.querySelector<HTMLElement>('input.input')!, degree.label);
      if (degree.if.expr !== 'да') within(stepCard(/^4 · /)).formula(stepCard(/^4 · /).querySelectorAll<HTMLElement>('.roll-degree')[at]!, viaLabels(goal!, degree.if.expr));
    });
    card = stepCard(/^4 · /);
    nameStep(card, 'бросок');

    ui.click('+ если');
    addToArm(block(0), 0, 'stop');
    within(headOf(block(0))).when('=если(@бросок.success или @бросок.parts.nadezhda == @бросок.parts.strah, 1, 0) < 1');
    stopNote(5, 'промах');

    ui.click('+ изменение');
    within(stepCard(/^6 · /)).click('вызов');
    card = stepCard(/^6 · /);
    within(card).select('Какой эффект', 'damage');
    for (const [name, text] of [['Сколько урона', '@урон.total']] as const) {
      within(stepCard(/^6 · /)).formula(within(stepCard(/^6 · /)).arg(name), text);
    }
    dump({ got: built('hero_attack'), goal });
    expect(built('hero_attack')).toEqual(folded(goal));
  });

  it('Shadowrun «Выстрелить» (shoot): по цели — вызов «Отразить атаку», промах — стоп, вызов «Нанести урон»', { timeout: 90000 }, () => {
    const world = structuredClone(worldOf('shadowrun6'));
    const goal = structuredClone(world.system.effects.shoot!);
    const steps = goal.steps! as { id?: string; type: string; args?: Record<string, { expr: string }> }[];
    const from = steps.findIndex(step => step.id === 'otpor');
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

    call(first, 'defend', 'отпор', steps[from]!.args!, { kto: 'Кто защищается', uspehov: 'Успехов атаки', atk: 'Значение атаки', navyk: 'Навык атаки', blizko: 'Вплотную или близко' });
    ui.click('+ если');
    addToArm(block(shown), 0, 'stop');
    within(headOf(block(shown))).when('=не @отпор.popal');
    stopNote(first + 1, 'промах: успехов атаки меньше, чем у защиты');
    call(first + 2, 'strike_damage', 'вред', steps[from + 4]!.args!, { cel: 'Кого бьют', istochnik: 'Кто бьёт', su: 'Сила урона', fizicheskiy: 'Урон физический', elektrichestvo: 'Электрический урон', vyrubit: 'Вырубить ударом', bez_urona: 'Без урона' });

    const got = built('shoot')!;
    dump({ got: got.steps, goal: goal.steps });
    expect(got.steps).toEqual(folded(goal)!.steps);
  });

  it('Blades «Залечь на дно» (lay_low): условная метка броска, степени успеха, «стало» формулой', { timeout: 90000 }, () => {
    const [goal] = start('blades', ['lay_low']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.click('+ для каждого из списка');
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

    ui.click('+ бросок');
    const at = (n: number) => stepCard(new RegExp(`^${n} · `));
    within(at(2)).select('Кто бросает', '@deystvuyuschiy');
    within(at(2)).select('Что бросает', 'die:pool');
    marks(at(2), 'действие', '=если(@rating == 0, "nulevoy", "")');
    nameStep(at(2), 'бросок_бросок');
    within(at(2)).click('↑');

    ui.click('+ проверка');
    within(at(3)).formula('Что проверяем', '@бросок_бросок');
    within(at(3)).formula('С чем', '4');
    within(at(3)).select('Ступени', 'outcome');
    nameStep(at(3), 'бросок');

    ui.click('+ изменение');
    within(at(4)).select('У кого', 'cel');
    within(at(4)).select('Какое поле', 'heat');
    within(at(4)).select('Как', 'set');
    within(at(4)).formula('Сколько', viaLabels(goal!, String((goal!.steps![3] as { value: { expr: string } }).value.expr)));

    dump({ got: built('lay_low'), goal });
    expect(built('lay_low')).toEqual(folded(goal));
  });

  it('Fabula «Проверка» (проверка): бросок двух полей по входам, сложность, критические ступени', { timeout: 90000 }, () => {
    const [goal] = start('fabula-ultima', ['proverka']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Проверка');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, more: { from?: string; ask?: string; hint?: string } = {}) => {
      if (row >= (built('proverka')!.params ?? []).length) ui.click('+ ещё одно');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (more.from) ui.select(ui.cell('Таблица', row), more.from);
      if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
      if (more.hint) ui.type(ui.cell('Подсказка за столом', row), more.hint);
      if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
    };
    const asked = (key: string) => (goal!.params ?? []).find(p => p.key === key)!.ask!.hint!;
    param(1, 'Первая характеристика', 'choice', 'первая', { from: 'harakteristiki', ask: 'actor', hint: asked('pervaya') });
    param(2, 'Вторая характеристика', 'choice', 'вторая', { from: 'harakteristiki', ask: 'actor', hint: asked('vtoraya') });
    param(3, 'Сложность', 'number', 'сложность', { ask: 'gm', hint: asked('slozhnost') });

    const rollTwo = (): void => {
      ui.click('+ бросок');
      within(stepCard(/^1 · /)).select('Кто бросает', '@deystvuyuschiy');
      within(stepCard(/^1 · /)).select('Что бросает', 'own-field');
      within(stepCard(/^1 · /)).formula('Адрес поля', '@deystvuyuschiy.[@pervaya.pole]');
      within(stepCard(/^1 · /)).select('Второе поле', 'own-field');
      within(stepCard(/^1 · /)).formula('Адрес второго поля', '@deystvuyuschiy.[@vtoraya.pole]');
    };
    rollTwo();
    nameStep(stepCard(/^1 · /), 'бросок');
    ui.click('+ проверка');
    const check = (n: number, versus: string, ladder: { label: string; if: { expr: string } }[]): void => {
      within(stepCard(new RegExp(`^${n} · `))).formula('Что проверяем', '@бросок');
      within(stepCard(new RegExp(`^${n} · `))).formula('С чем', versus);
      ladder.forEach((degree, at) => {
        within(stepCard(new RegExp(`^${n} · `))).click('+ ступень');
        const row = stepCard(new RegExp(`^${n} · `)).querySelectorAll<HTMLElement>('.roll-degree')[at]!;
        within(row).type(row.querySelector<HTMLElement>('input.input')!, degree.label);
        within(stepCard(new RegExp(`^${n} · `))).formula(stepCard(new RegExp(`^${n} · `)).querySelectorAll<HTMLElement>('.roll-degree')[at]!, viaLabels(goal!, degree.if.expr));
      });
      nameStep(stepCard(new RegExp(`^${n} · `)), 'проверка');
    };
    const verify = goal!.steps![1] as unknown as { versus: { expr: string }; degrees: { label: string; if: { expr: string } }[] };
    check(2, viaLabels(goal!, verify.versus.expr), verify.degrees);
    dump({ got: built('proverka'), goal });
    expect(built('proverka')).toEqual(folded(goal));
  });

  it('Fabula «Атака» (атака): бросок двух полей с прибавкой, проверка против Защиты, урон по попаданию', { timeout: 90000 }, () => {
    const [goal] = start('fabula-ultima', ['ataka']);
    const ui = within();
    ui.click('+ кнопкой');
    ui.click('+ для каждого из списка');
    ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, 'Атака');
    if (!ui.has('Описание') && ui.has('свойства')) ui.click('свойства');
    ui.type('Описание', goal!.description!);
    if (ui.has('ещё')) ui.click('ещё');
    const param = (row: number, label: string, kind: string, key: string, from?: string) => {
      if (row >= (built('ataka')!.params ?? []).length) ui.click('+ ещё одно');
      ui.type(ui.cell('Название', row), label);
      ui.select(ui.cell('Вид', row), kind);
      if (from) ui.select(ui.cell('Таблица', row), from);
      if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
    };
    param(2, 'Первая характеристика', 'choice', 'pervaya', 'harakteristiki');
    param(3, 'Вторая характеристика', 'choice', 'vtoraya', 'harakteristiki');
    param(4, 'Прибавка к меткости', 'number', 'точность');
    param(5, 'Урон сверх старшей кости', 'number', 'uron');

    ui.click('+ бросок');
    const at = (n: number) => stepCard(new RegExp(`^${n} · `));
    within(at(2)).select('Кто бросает', '@deystvuyuschiy');
    within(at(2)).select('Что бросает', 'own-field');
    within(at(2)).formula('Адрес поля', '@deystvuyuschiy.[@pervaya.pole]');
    within(at(2)).select('Второе поле', 'own-field');
    within(at(2)).formula('Адрес второго поля', '@deystvuyuschiy.[@vtoraya.pole]');
    within(at(2)).click('+ прибавка к итогу');
    within(at(2)).formula('Прибавка к итогу', '@tochnost');
    nameStep(at(2), 'бросок');
    within(at(2)).click('↑');

    const verify = goal!.steps![2] as unknown as { versus: { expr: string }; degrees: { label: string; if: { expr: string } }[] };
    ui.click('+ проверка');
    within(at(3)).formula('Что проверяем', '@бросок');
    within(at(3)).formula('С чем', viaLabels(goal!, verify.versus.expr));
    verify.degrees.forEach((degree, n) => {
      within(at(3)).click('+ ступень');
      const row = () => at(3).querySelectorAll<HTMLElement>('.roll-degree')[n]!;
      within(row()).type(row().querySelector<HTMLElement>('input.input')!, degree.label);
      within(at(3)).formula(row(), viaLabels(goal!, degree.if.expr));
    });
    nameStep(at(3), 'проверка');

    ui.click('+ если');
    within(headOf(block(0))).when('=@проверка.success');
    addToArm(block(0), 0, 'change');
    within(at(4)).select('У кого', 'cel');
    within(at(4)).select('Какое поле', 'oz');
    within(at(4)).select('Как', 'subtract');
    within(at(4)).formula('Сколько', 'max(@бросок.parts.pervaya, @бросок.parts.vtoraya) + @uron');
    dump({ got: built('ataka'), goal });
    expect(built('ataka')).toEqual(folded(goal));
  });
});
