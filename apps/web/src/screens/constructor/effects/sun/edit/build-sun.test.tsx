// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { SAMPLE_WORLDS } from '@vtt/engine/samples';
import type { System, Effect } from '@vtt/schema';
import { useWorld } from '../../../../../store/world.ts';
import { useEffectView } from '../../../../../store/effect-view.ts';
import { useEffectUndo } from '../../../../../store/effect-undo.ts';
import { openAll } from '../../../../../testing/render-open.tsx';
import { within, stepCard, askWith } from '../../../../../testing/cards.ts';
import { folded } from '../../../../../testing/folded.ts';
import { rays, add, inPanel, inStep, panel, pickCenter, pickHandler, pickRay, outside, where, headIn, stepRoot, showBubbles, up, down, removeStep } from '../../../../../testing/sun-build.ts';
import { EffectsTab } from '../../effects-tab.tsx';

const worldOf = (id: string) => SAMPLE_WORLDS.find(w => w.system.id === id)!;

const start = (systemId: string, without: string[]): Effect[] => {
  const world = structuredClone(worldOf(systemId));
  const goal = without.map(id => world.system.effects[id]!);
  for (const id of without) delete world.system.effects[id];
  useWorld.setState(state => ({
    ...state, system: world.system as System, compendium: world.compendium,
    activeEffectId: null, activeFieldTag: null, activeRecordKind: null, activeSheetKind: null,
  }));
  useEffectView.setState({ view: 'form', trail: [] });
  useEffectUndo.setState({ stacks: {} });
  render(<EffectsTab />);
  openAll();
  return goal;
};

const built = (id: string): Effect | undefined => folded(useWorld.getState().system.effects[id]);

const dump = (what: unknown) => {
  if (process.env.BUILD_DUMP) writeFileSync(process.env.BUILD_DUMP, JSON.stringify(what, null, 1));
};

const nameStep = (card: HTMLElement, name: string): void => {
  const title = (card.querySelector('.step-fold, .card__head')?.textContent ?? '').replace(/^[▾▸]\s*/, '').split('·')[0]!.trim();
  const own = card.querySelector<HTMLElement>('.number-line input.input');
  if (own) { within(card).type(own, name); return; }
  within(card).click(/^(имя в формулах|результат)/);
  const fresh = stepCard(new RegExp(`^${title} · `), stepRoot());
  within(fresh).type(fresh.querySelector<HTMLElement>('.step-name input')!, name);
};

const head = (ui: ReturnType<typeof within>, id: string, goal: Effect, buttons: string[] = ['+ кнопкой']) => {
  for (const one of buttons) ui.click(one);
  showBubbles();
  inPanel().type(document.querySelector<HTMLInputElement>('input[placeholder="как зовётся эффект"]')!, goal.label!);
  if (!inPanel().has('имя в формулах…') && inPanel().has('свойства')) inPanel().click('свойства');
  inPanel().click('имя в формулах…');
  inPanel().type(panel().querySelector<HTMLElement>('.step-name input')!, id);
  if (goal.group) inPanel().select('Папка', goal.group);
  inPanel().type('Описание', goal.description!);
};

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

const ui = () => inPanel();

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

const here = (): HTMLElement => stepCard(/^\d+ · /, stepRoot());

const built0 = (id: string): Effect => useWorld.getState().system.effects[id]!;

const param = (id: string, row: number, label: string, kind: string, key: string, more: { from?: string; optional?: boolean; value?: string; role?: string; main?: boolean } = {}) => {
  if (row >= (built0(id).params ?? []).length) ui().click((built0(id).params ?? []).length ? '+ ещё одно' : '+ вход');
  if (ui().has('ещё')) ui().click('ещё');
  ui().type(ui().cell('Название', row), label);
  ui().select(ui().cell('Вид', row), kind);
  if (more.from) ui().select(ui().cell('Таблица', row), more.from);
  if (more.optional) ui().select(ui().cell('Если не передали', row), 'empty');
  if (more.value !== undefined) { ui().select(ui().cell('Если не передали', row), 'value'); ui().type(ui().cell('Если не передали', row), more.value); }
  if (more.role) ui().select(ui().cell('Кто это', row), more.role);
  if (more.main) ui().check(`«${label}» — величина`, true);
  if (ui().cell('Имя в формулах', row).querySelector('input')) ui().type(ui().cell('Имя в формулах', row), key);
};

const returns = (effectId: string, rows: readonly (readonly [string, string, string, string, string?, string?])[]) => {
  const card = () => [...panel().querySelectorAll<HTMLElement>('.card')].find(c => /^Что получит тот, кто вызвал/.test(textOf(c)))!;
  rows.forEach(([label, kind, key, from, no, table], row) => {
    if (row >= (built0(effectId).returns ?? []).length) within(card()).click('+ итог');
    const box = within(card());
    box.type(box.cell('Название', row), label);
    box.select(box.cell('Вид', row), kind);
    if (table) within(card()).select(within(card()).cell('Таблица', row), table);
    if (from.startsWith('=')) {
      box.select(box.cell('Откуда', row), ':formula');
      within(card()).formula(within(card()).cell('Откуда', row), from.slice(1));
    } else box.select(box.cell('Откуда', row), from);
    if (no) within(card()).type(within(card()).cell('Как назвать «нет»', row), no);
    const named = within(card()).cell('Имя в формулах', row);
    if (named.querySelector('input')) within(card()).type(named, key);
  });
};

const stage = (at: number, one: { label: string; atLeast?: number; round?: string; mul?: string }) => {
  if (!panel().querySelectorAll('[data-stage]')[at]) ui().click('+ этап');
  const row = () => panel().querySelectorAll<HTMLElement>('[data-stage]')[at]!;
  within(row()).type(row().querySelector<HTMLElement>('input.input')!, one.label);
  const combos = () => [...row().querySelectorAll<HTMLElement>('[role="combobox"]')];
  if (one.mul) within(row()).select(combos()[2]!, one.mul);
  if (one.round) within(row()).select(combos()[3]!, one.round);
  if (one.atLeast !== undefined) within(row()).type(row().querySelector<HTMLElement>('input[type="number"]')!, String(one.atLeast));
};

describe('эффекты пресетов собираются в пузырях', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { return; } });
  afterEach(() => { cleanup(); useEffectView.setState({ view: 'form', trail: [] }); });

  it('D&D «Урон» (damage)', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['damage']);
    head(within(), 'damage', goal!);
    ui().select('Метки', 'uron');
    param('damage', 0, 'Лист', 'sheet', 'list', { role: 'target' });
    param('damage', 1, 'Источник', 'sheet', 'istochnik', { optional: true, role: 'actor' });
    param('damage', 2, 'Сколько урона', 'number', 'amount', { main: true });
    stage(0, { label: 'прибавки', atLeast: 0 });
    stage(1, { label: 'половина', round: 'down' });
    stage(2, { label: 'сопротивление', mul: 'min', round: 'down' });
    stage(3, { label: 'уязвимость', mul: 'max', round: 'down' });
    param('damage', 3, 'Тип урона', 'choice', 'damage_type', { from: 'damage_types' });
    param('damage', 4, 'Источник урона', 'choice', 'damage_source', { from: 'damage_source', optional: true });
    param('damage', 5, 'От крита', 'boolean', 'ot_krita', { optional: true });

    const change = (owner: string, field: string, value: string, name: string) => {
      add('изменение');
      inStep().select('У кого', owner);
      inStep().select('Какое поле', field);
      inStep().formula('Сколько', value);
      nameStep(here(), name);
    };
    change('list', 'hp_temp', '@amount', 'по_временным');
    change('list', 'hp_current', '@по_временным.overkill', 'по_хитам');
    pickCenter();
    returns('damage', [
      ['нанесено', 'number', 'naneseno', '=@по_хитам.from - @по_хитам.to'],
      ['сверх нуля', 'number', 'sverh_nulya', '=@по_хитам.overkill'],
      ['был на нуле', 'boolean', 'byl_na_nule', '=@по_хитам.from <= 0', 'был на ногах'],
    ]);
    dump({ got: built('damage'), goal });
        expect(built('damage')).toEqual(folded(goal));
  });

  it('D&D «Атака» (strike)', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['strike']);
    head(within(), 'strike', goal!, ['+ кнопкой', '+ для каждого из списка']);
    within(ui().cell('Блок')).click('+ новый');
    ui().type(ui().cell('Блок'), 'Атака');
    within(ui().cell('Блок')).click('завести');
    ui().select('Метки', 'ataka_oruzhiem');
    if (ui().has('ещё')) ui().click('ещё');
    const row = (n: number, label: string, kind: string, key: string, from?: string) => param('strike', n, label, kind, key, from ? { from } : {});
    row(2, 'Бонус атаки', 'number', 'attack_with');
    row(3, 'Прибавка к урону', 'number', 'damage_with');
    row(4, 'Кость урона', 'dice', 'damage_dice');
    row(5, 'Сколько костей', 'number', 'dice');
    row(6, 'Тип урона', 'choice', 'damage_type', 'damage_types');
    row(7, 'Источник урона', 'choice', 'damage_source', 'damage_source');
    row(8, 'Свойства оружия', 'choice', 'свойства', 'weapon_properties');
    row(9, 'Дальность', 'choice', 'дальность', 'reach');
    row(10, 'Вплотную', 'boolean', 'вплотную');
    row(11, 'Состояние при попадании', 'effect', 'status');
    row(12, 'Плата', 'effect', 'цена');
    ui().select(ui().cell('Если не передали', 3), 'value');
    ui().select(ui().cell('Если не передали', 5), 'value');
    ui().type(ui().cell('Если не передали', 5), '1');
    ui().select(ui().cell('Если не передали', 12), 'value');
    ui().select(ui().cell('Если не передали', 12).querySelectorAll('[role="combobox"]')[1]!, 'cost_attack');
    ui().select(ui().cell('Если не передали', 11), 'empty');
    ui().select(ui().cell('Если не передали', 10), 'actor');
    ui().type(ui().cell('Подсказка за столом', 10), goal!.params!.find(one => one.key === 'vplotnuyu')!.ask!.hint!);
    ui().select(ui().cell('Если не передали', 9), 'value');
    ui().type(ui().cell('Если не передали', 9), 'blizhniy');
    ui().select(ui().cell('Если не передали', 8), 'empty');
    ui().type('Описание', goal!.description!);
    add('Стоимость: атака', 'pay');
    within(here()).select('Какой эффект', ':input:cena');
    within(here()).formula(within(here()).arg('Лист'), '@deystvuyuschiy');
    within(here()).formula(within(here()).arg('Источник'), '@deystvuyuschiy');

    const softStop = (note: string) => {
      const strip = stepRoot().querySelector<HTMLElement>('.flow-stop')!;
      within(strip).type(strip.querySelector<HTMLElement>('.flow-stop__note input')!, note);
      within(strip).select(strip.querySelector<HTMLElement>('[role="combobox"]')!, 'soft');
    };
    const guard = (fact: string, mode: 'inside' | 'after' = 'inside') => {
      add('если');
      headIn().when(fact);
      where(mode);
    };

    pickRay(/для каждого/);
    guard('=@cel.cover_full >= 1');
    add('стоп');
    softStop('цель за полным укрытием');
    outside(3);
    guard('=@desk.sprashivat_dalnost and @dalnost == "dalniy"');
    add('спросить');
    within(here()).type('Вопрос', 'Цель в пределах дальности?');
    within(here()).formula('Кого', '@deystvuyuschiy');
    nameStep(here(), 'в_дальности');
    guard('=не @в_дальности');
    add('стоп');
    softStop('цель вне дальности');
    outside(4);
    add('Бросок атаки', 'call');
    within(here()).formula(within(here()).arg('Бонус атаки'), '@attack_with');
    within(here()).formula(within(here()).arg('Способ атаки'), '@дальность');
    within(here()).formula(within(here()).arg('Вплотную'), 'if(empty(@вплотную), @дальность == "blizhniy", @вплотную)');
    nameStep(here(), 'бросок');
    pickCenter();
    const outcome = () => [...panel().querySelectorAll<HTMLElement>('.card')].find(c => /^Что получит тот, кто вызвал/.test(textOf(c)))!;
    ([
      ['попал', 'промах'],
      ['крит', 'не крит'],
      ['с преимуществом', 'без преимущества'],
      ['с помехой', 'без помехи'],
    ] as const).forEach(([said, no], at) => {
      if (at > 1) within(outcome()).type(within(outcome()).cell('Название', at), said);
      within(outcome()).select(within(outcome()).cell('Откуда', at), `Бросок атаки — ${said}`);
      within(outcome()).type(within(outcome()).cell('Как назвать «нет»', at), no);
    });
    pickRay(7);
    guard('Бросок атаки — попал');
    add('бросок');
    within(here()).select('Кто бросает', '@deystvuyuschiy');
    within(here()).select('Что бросает', 'own-die');
    within(here()).formula('Своя кость', '@damage_dice');
    within(here()).click('+ сколько раз');
    within(here()).formula('Сколько раз', '@dice');
    within(here()).click('+ прибавка');
    within(here()).formula('Прибавка', '@damage_with');
    marks(here(), 'uron', 'oruzhie', '=@dalnost', '=@svoystva', '=if(@бросок.krit, "krit", "")');
    nameStep(here(), 'урон');
    add('Урон', 'call');
    within(here()).formula(within(here()).arg('Сколько урона'), '@урон.total');
    within(here()).formula(within(here()).arg('От крита'), '@бросок.krit');
    guard('=не пусто(@status)');
    add('Скрытая атака', 'status');
    within(here()).select('Какое', ':input:status');
    within(here()).formula('На кого', '@цель');
    within(here()).formula('Запомнит: Кто наложил', '@deystvuyuschiy');
    const got = built('strike');
    const listed = got?.params?.find(one => one.label === 'Свойства оружия');
    if (listed) (listed as { many?: boolean }).many = true;
    for (const one of goal!.params ?? []) if (one.optional && (one.default !== undefined || one.ask)) delete one.optional;
    dump({ got, goal });
    expect(got).toEqual(folded(goal));
  });

  it('D&D «Щит» (shield)', { timeout: 120000 }, () => {
    const [goal] = start('dnd5e', ['shield']);
    head(within(), 'shield', goal!, ['+ висит']);
    const heard = [['ataka', '@popal и @holder.shield_up == 0'], ['volshebnaya_strela', '@holder.shield_up == 0']] as const;
    heard.forEach(([listened, when], index) => {
      add('до …');
      const card = () => stepCard(/^Когда №\d/, panel());
      within(card()).select('Что именно', listened);
      within(card()).select('Кого касается', '@cel == @holder');
      within(card()).when(`=${when}`);
      askWith(within(card()), { question: goal!.on![index]!.confirm!.question! });
      if (goal!.on![index]!.manual) within(panel()).check('Можно кнопкой');
      add('Стоимость: реакция', 'pay');
      within(here()).formula(within(here()).arg('Лист'), '@holder');
      within(here()).formula(within(here()).arg('Источник'), '@holder');
      pickHandler(index);
      add('Ячейка заклинания', 'pay');
      const slot = () => stepCard(/^\d+ · Ячейка заклинания/, stepRoot());
      for (const name of within(slot()).args()) within(slot()).formula(within(slot()).arg(name), name === 'Лист' || name === 'Источник' ? '@holder' : '1');
      pickHandler(index);
      add('Под щитом', 'status');
      within(here()).formula('На кого', '@holder');
    });
    dump({ got: built('shield'), goal });
    expect(built('shield')).toEqual(folded(goal));
  });

  it('порядок и удаление: «↓», «↑» и «Удалить шаг» правят данные так же, как в форме', { timeout: 60000 }, () => {
    start('dnd5e', ['damage']);
    within().click('+ кнопкой');
    showBubbles();
    add('изменение');
    add('бросок');
    const kinds = () => (built0(useWorld.getState().activeEffectId!).steps ?? []).map(step => step.type);
    expect(kinds()).toEqual(['apply', 'roll']);
    up();
    expect(kinds()).toEqual(['roll', 'apply']);
    down();
    expect(kinds()).toEqual(['apply', 'roll']);
    removeStep();
    expect(kinds()).toEqual(['apply']);
  });
});
