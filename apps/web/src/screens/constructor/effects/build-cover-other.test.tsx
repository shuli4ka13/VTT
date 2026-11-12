// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/model/systems';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../store/world.ts';
import { openAll } from '../../../testing/render-open.tsx';
import { within, stepCard, block, headOf, addToArm, addArm, stopNote, wrapIf } from '../../../testing/cards.ts';
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

const head = (ui: ReturnType<typeof within>, create: string, label: string, key: string, goal: Effect) => {
  ui.click(create);
  ui.type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, label);
  if (!ui.has('имя в формулах…') && ui.has('свойства')) ui.click('свойства');
  ui.click('имя в формулах…');
  ui.type(document.querySelector<HTMLElement>('.step-name input')!, key);
  if (goal.group) ui.select('Папка', goal.group);
  if (goal.icon) ui.type('Значок', goal.icon);
  if (goal.description) ui.type('Описание', goal.description);
  for (const tag of goal.tags ?? []) {
    if (tag in (useWorld.getState().system.tags ?? {})) ui.select('Метки', tag);
    else { ui.select('Метки', ':своя'); ui.type('Метки', tag); ui.click('добавить'); }
  }
};

describe('эффекты пресетов собираются руками: Shadowrun, Cyberpunk, Daggerheart, Blades', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); });

  it('Shadowrun «Электрошок» (shocked): висит 2 раунда, правит поле', { timeout: 60000 }, () => {
    const [goal] = start('shadowrun6', ['shocked']);
    const ui = within();
    head(ui, '+ висит и правит', 'Электрошок', 'shocked', goal!);
    param(ui, 'shocked', 0, 'Раундов', 'number', 'level');
    ui.select(ui.cell('Если не передали', 0), 'value');
    ui.type(ui.cell('Если не передали', 0), '2');
    ui.type(ui.cell('Границы', 0).querySelector<HTMLInputElement>('input[placeholder="не ниже"]')!, '1');
    ui.select('Сколько висит', 'rounds');
    ui.formula('Сколько', '@level');
    for (const [target, value] of [['condition_mod', '-1'], ['init_mod', '-2']] as const) {
      ui.click('+ правит поле');
      const card = () => [...document.querySelectorAll<HTMLElement>('.card')].filter(c => (c.querySelector('.card__head')?.textContent ?? '').startsWith('Правит поле')).at(-1)!;
      within(card()).select('Что правим', target);
      within(card()).select('Как', 'add');
      within(card()).formula('На сколько', value);
    }
    dump({ got: built('shocked'), goal });
    expect(built('shocked')).toEqual(goal);
  });

  it('Cyberpunk «Тяжёлая рана» (serious_wound_rule): одна правка броска «прибавка» на любую из двух меток, умолчание «складываются» в данные не пишется', { timeout: 60000 }, () => {
    const [goal] = start('cp-slice', ['serious_wound_rule']);
    const ui = within();
    head(ui, '+ висит и правит', 'Тяжёлая рана', 'serious_wound_rule', goal!);
    const edits = () => [...document.querySelectorAll<HTMLElement>('.card')].filter(c => (c.querySelector('.card__head')?.textContent ?? '').startsWith('Правка вызова'));
    ui.click('+ правка вызова');
    const card = () => edits()[0]!;
    within(card()).select('Чей вызов', 'roll');
    within(card()).select('Что правим', 'bonus');
    within(card()).select('С любой из меток', 'атака');
    within(card()).select('С любой из меток', 'проверка');
    within(card()).formula('Сколько', '-2');
    within(card()).select('Кого касается', '@бросающий == @носитель');
    within(card()).when('=@носитель.seriously');
    dump({ got: built('serious_wound_rule'), goal });
    expect(built('serious_wound_rule')).toEqual(goal);
  });

  it('Shadowrun «Сбой» (glitch): подписка «бросок окончен», без шагов', { timeout: 60000 }, () => {
    const [goal] = start('shadowrun6', ['glitch']);
    const ui = within();
    head(ui, '+ срабатывает сам', 'Сбой', 'glitch', goal!);
    ui.select('Что случилось', 'rolled');
    ui.select('Кого касается', '@бросающий == @носитель');
    ui.when('=@roll.atMin * 2 > @roll.rolled и @roll.natural >= 1');
    ui.select('Кроме меток', 'инициатива');
    dump({ got: built('glitch'), goal });
    expect(built('glitch')).toEqual(goal);
  });

  const spendFromHolder = () => {
    const ui = within();
    ui.click('+ изменение');
    within(stepCard(/^1 · /)).click('вызов');
    const card = () => stepCard(/^1 · /);
    within(card()).select('Какой эффект', 'spend_edge');
    for (const [name, text] of [['Кто тратит', '@носитель'], ['Сколько очков', '4']] as const) {
      within(card()).formula(within(card()).arg(name), text);
    }
    within(card()).click('↑');
  };

  const seenHead = (ui: ReturnType<typeof within>) => {
    ui.select('Что случилось', 'seen');
    ui.select('Кого касается', '@бросающий == @носитель');
    ui.select('Решение', 'ask');
  };

  it('Shadowrun «Перебросить все неуспехи» (reroll_failures): «увидев кости», решает игрок, цена-вызов, переброс', { timeout: 60000 }, () => {
    const [goal] = start('shadowrun6', ['reroll_failures']);
    const ui = within();
    head(ui, '+ срабатывает сам', goal!.label!, 'reroll_failures', goal!);
    seenHead(ui);
    ui.when('=не @roll.atMin * 2 > @roll.rolled');
    ui.select('Кроме меток', 'инициатива');
    ui.select('Кроме меток', 'без Преимущества');
    spendFromHolder();
    ui.click('+ перебросить');
    const card = stepCard(/^2 · /);
    within(card).formula('Перебросить, где выпало не больше', '4');
    dump({ got: built('reroll_failures'), goal });
    expect(built('reroll_failures')).toEqual(goal);
  });

  it('Shadowrun «Добавить к набору» (push_edge): докинуть со взрывом', { timeout: 60000 }, () => {
    const [goal] = start('shadowrun6', ['push_edge']);
    const ui = within();
    head(ui, '+ срабатывает сам', goal!.label!, 'push_edge', goal!);
    seenHead(ui);
    ui.select('Кроме меток', 'инициатива');
    ui.select('Кроме меток', 'без Преимущества');
    spendFromHolder();
    ui.click('+ докинуть');
    const card = () => stepCard(/^2 · /);
    within(card()).formula('Сколько костей', '@носитель.edge');
    within(card()).select('Максимум', 'true');
    dump({ got: built('push_edge'), goal });
    expect(built('push_edge')).toEqual(goal);
  });
  const handlerAt = (n: number): HTMLElement => stepCard(new RegExp(`^Когда №${n}`)).parentElement!;

  const change = (root: () => HTMLElement, owner: string, field: string, how: string, value: string, when?: string) => {
    within(root()).select('У кого', owner);
    within(root()).select('Какое поле', field);
    within(root()).select('Как', how);
    within(root()).formula('Сколько', value);
    if (when) wrapIf(root, when.includes(' — ') ? when : `=${when}`);
  };

  const nameStep = (card: () => HTMLElement, name: string): void => {
    const own = card().querySelector<HTMLElement>('.number-line input.input');
    if (own) { within(card()).type(own, name); return; }
    within(card()).click(/^имя в формулах/);
    within(card()).type(card().querySelector<HTMLElement>('.step-name input')!, name);
  };

  it('Cyberpunk «Спасбросок от смерти» (death_save): момент хода и «поле стало верным», проверка «строго меньше»', { timeout: 90000 }, () => {
    const [goal] = start('cp-slice', ['death_save']);
    const ui = within();
    head(ui, '+ срабатывает сам', goal!.label!, 'death_save', goal!);

    let h = () => stepCard(/^Когда №1/);
    ui.select('Что случилось', 'moment');
    within(h()).select('Когда', 'turn-start');
    within(h()).select('Кого касается', '@ходит == @носитель');
    within(h()).when('=@носитель.mortal');

    const at = (n: number, k: number) => () => stepCard(new RegExp(`^${k} · `), handlerAt(n));
    within(handlerAt(1)).click('+ бросок');
    within(at(1, 1)()).select('Кто бросает', '@носитель');
    within(at(1, 1)()).select('Что бросает', 'die:lead_die');
    within(at(1, 1)()).click('+ прибавка');
    within(at(1, 1)()).formula('Прибавка', '@носитель.death_penalty');
    within(at(1, 1)()).select('Метки', 'спасбросок');
    nameStep(at(1, 1), 'спас_бросок');

    within(handlerAt(1)).click('+ проверка');
    within(at(1, 2)()).formula('Что проверяем', '@спас_бросок');
    within(at(1, 2)()).select('Знак', 'under');
    within(at(1, 2)()).formula('С чем', '@носитель.body');
    nameStep(at(1, 2), 'спас');

    within(handlerAt(1)).click('+ изменение');
    change(at(1, 3), 'носитель', 'death_penalty', 'add', '1');
    within(handlerAt(1)).click('+ изменение');
    change(at(1, 4), 'носитель', 'dead', 'set', 'да', 'Проверка — не пройдена');

    ui.click('+ когда');
    h = () => stepCard(/^Когда №2/);
    within(h()).select('Что случилось', 'field');
    within(h()).select('Какое', 'mortal');
    within(h()).select('Кого касается', '@лист == @носитель');
    within(handlerAt(2)).click('+ изменение');
    change(at(2, 1), 'носитель', 'death_penalty', 'set', '0');

    dump({ got: built('death_save'), goal });
    expect(built('death_save')).toEqual(goal);
  });

  const param = (ui: ReturnType<typeof within>, id: string, row: number, label: string, kind: string, key: string, more: { from?: string; ask?: string; main?: boolean; role?: string } = {}) => {
    if (row >= (built(id)!.params ?? []).length) ui.click((built(id)!.params ?? []).length ? '+ ещё одно' : '+ вход');
    if (ui.has('ещё')) ui.click('ещё');
    ui.type(ui.cell('Название', row), label);
    ui.select(ui.cell('Вид', row), kind);
    if (more.from) ui.select(ui.cell('Таблица', row), more.from);
    if (more.ask) ui.select(ui.cell('Если не передали', row), more.ask);
    if (more.main) ui.check(`«${label}» — величина`, true);
    if (more.role) ui.select(ui.cell('Приходит сам', row), more.role);
    if (ui.cell('Имя в формулах', row).querySelector('input')) ui.type(ui.cell('Имя в формулах', row), key);
  };

  const dropParam = (ui: ReturnType<typeof within>, row: number) => {
    const drops = [...document.querySelectorAll<HTMLElement>('button[title="убрать вход"]')];
    act(() => { fireEvent.click(drops[row]!); });
    openAll();
  };

  const calledHead = (ui: ReturnType<typeof within>, id: string, goal: Effect) => {
    head(ui, '+ шаг для других', goal.label!, id, goal);
    within(stepCard(/^1 · /)).click('Удалить');
    within(stepCard(/^1 · /)).click('точно убрать');
  };

  it('Daggerheart «Потратить» (spend): вход-поле, текстовый вход, проверка с заметкой, вычесть из поля-входа', { timeout: 90000 }, () => {
    const [goal] = start('daggerheart', ['spend']);
    const ui = within();
    calledHead(ui, 'spend', goal!);
    if (ui.has('ещё')) ui.click('ещё');
    ui.check('«Сколько» — величина', false);
    ui.select(ui.cell('Приходит сам', 0), 'actor');
    dropParam(ui, 1);
    param(ui, 'spend', 1, 'Источник', 'sheet', 'источник', { ask: 'empty', role: 'actor' });
    param(ui, 'spend', 2, 'Что тратим', 'field', 'what');
    param(ui, 'spend', 3, 'Сколько', 'number', 'amount');
    param(ui, 'spend', 4, 'Если не хватает', 'text', 'note', { ask: 'empty' });

    ui.click('+ если');
    addToArm(block(0), 0, 'stop');
    within(headOf(block(0))).when('=@what < @amount');
    stopNote(1, '@note');
    const at = (k: number) => () => stepCard(new RegExp(`^${k} · `));

    ui.click('+ изменение');
    within(at(2)()).select('У кого', ':what');
    within(at(2)()).select('Как', 'subtract');
    within(at(2)()).formula('Сколько', '@amount');

    dump({ got: built('spend'), goal });
    expect(built('spend')).toEqual(goal);
  });

  it('Cyberpunk «Урон» (damage): вызываемый, проверки без броска, условия на шагах, расчёты', { timeout: 120000 }, () => {
    const [goal] = start('cp-slice', ['damage']);
    const ui = within();
    calledHead(ui, 'damage', goal!);
    if (ui.has('ещё')) ui.click('ещё');
    ui.select(ui.cell('Приходит сам', 0), 'target');
    dropParam(ui, 1);
    param(ui, 'damage', 1, 'Источник', 'sheet', 'источник', { ask: 'empty', role: 'actor' });
    param(ui, 'damage', 2, 'Сколько урона', 'number', 'amount', { main: true });
    param(ui, 'damage', 3, 'Тип урона', 'choice', 'damage_type', { from: 'damage_types' });
    param(ui, 'damage', 4, 'Куда попали', 'choice', 'aim', { from: 'aim_places', ask: 'empty' });

    const at = (k: number) => () => stepCard(new RegExp(`^${k} · `));
    const body = '@aim == "по телу" и @damage_type.armor == "через броню"';
    const headshot = '@aim == "по голове" и @damage_type.armor == "через броню"';
    const guarded = (flow: number, expr: string) => {
      ui.click('+ если');
      within(headOf(block(flow))).when(`=${expr}`);
    };
    const check = (flow: number, k: number, formula: [string, string], name: string) => {
      addToArm(block(flow), 0, 'check');
      within(at(k)()).formula('Что проверяем', formula[0]);
      within(at(k)()).select('Знак', 'over');
      within(at(k)()).formula('С чем', formula[1]);
      nameStep(at(k), name);
      addToArm(block(flow), 0, 'branch');
      const failed = `Проверка «${name.replace(/_/g, ' ')}» — не пройдена`;
      within(headOf(block(flow + 1))).when(within(headOf(block(flow + 1))).whenOptions().includes(failed) ? failed : 'Проверка — не пройдена');
      addToArm(block(flow + 1), 0, 'stop');
      stopNote(k + 1, 'броня выдержала');
    };
    const number = (flow: number, k: number, formula: string, name: string) => {
      addToArm(block(flow), 0, 'number');
      within(at(k)()).formula('Формула', formula);
      nameStep(at(k), name);
    };
    const apply = (flow: number, k: number, field: string, value: string) => {
      addToArm(block(flow), 0, 'change');
      change(at(k), 'лист', field, 'subtract', value);
    };

    guarded(0, body);
    check(0, 1, ['@amount', '@лист.sp_body'], 'сквозь_броню');
    apply(0, 3, 'hp', '@сквозь_броню.margin');
    apply(0, 4, 'sp_body', '1');
    guarded(2, headshot);
    check(2, 5, ['@amount', '@лист.sp_head'], 'сквозь_шлем');
    number(2, 7, '@сквозь_шлем.margin', 'в_голову_всего');
    number(2, 8, 'если(да, округлить вниз((@в_голову_всего) * 2), @в_голову_всего)', 'в_голову');
    apply(2, 9, 'hp', '@в_голову');
    apply(2, 9, 'sp_head', '1');
    guarded(4, '@damage_type.armor == "мимо брони"');
    apply(4, 10, 'hp', '@amount');

    dump({ got: built('damage'), goal });
    expect(built('damage')).toEqual(goal);
  });

});
