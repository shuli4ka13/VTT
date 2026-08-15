// apps/web/src/screens/constructor/card.tsx
// Карточка группы шагов: три понятия поверх пяти команд движка.
// Пересказ — сверху; контролы следуют за выбором (у «числа» видны только
// слоты выбранного источника); переключатели меняют step.type, ничего
// не стирая — вернул переключатель, вернулась и работа.

import { useState, type ReactNode } from 'react';
import type { System, Effect, Step, SlotRef } from '@vtt/schema';
import { Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input } from '../../ui/primitives.tsx';
import type { CardGroup } from './cards.ts';
import {
  checkReadback, changeReadback, numberReadback, amountValueSegments, joinReadback, type Segment,
} from './readback.ts';
import { parseRollExpr, formatRollExpr, notationOf } from './roll-expr.ts';
import { compile } from '@vtt/engine/formula';
import { FormulaChips } from '../../ui/formula-chips.tsx';
import { labelOfTag } from '../../ui/formula.tsx';
import { SlotInput, chipOf, type SlotOption } from './slot-input.tsx';
import type { SlotContext, EarlierStep } from './slots.tsx';
import type { Problem } from './step-card.tsx';

const TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };

type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;
type WithNumber = (change: (amount: Step, apply: Step, id: string) => void) => void;

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

export function Readback({ segments }: { segments: Segment[] }) {
  return (
    <p className="readback">
      {segments.map((part, i) => {
        // Пробел не ставится перед знаком препинания и внутри скобок:
        // «( Кость урона )» читается разорванно.
        const prev = segments[i - 1];
        const glue = ('text' in part && /^[.,)]/.test(part.text))
          || (prev !== undefined && 'text' in prev && prev.text.endsWith('('));
        const lead = i === 0 || glue ? '' : ' ';
        return 'text' in part
          ? <span key={i}>{lead}{part.text}</span>
          : <span key={i}>{lead}<span className="readback__hole">{part.hole}</span></span>;
      })}
    </p>
  );
}

export function GroupCard({
  group, position, system, effect, earlier, problem, problemAction,
  edit, withNumber, onDelete, onMoveUp, onMoveDown, onAddParam,
}: {
  group: CardGroup;
  position: number;
  system: System;
  effect: Effect;
  earlier: EarlierStep[];
  problem: Problem | null;
  /**
   * Лекарство рядом с диагнозом (задача 3): если беда в отсутствующем поле
   * и нашёлся донор, эффект-таб кладёт сюда кнопку «взять блок» — она
   * рендерится внутри того же Verdict, а не отдельной карточкой.
   */
  problemAction?: ReactNode;
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;
  /**
   * Правка «изменения» ВМЕСТЕ с его числом, одним движением.
   *
   * Число (шаг `amount`) не отдельная карточка, а внутренность изменения:
   * его заводит не автор, а сама карточка — в тот момент, когда в строке
   * появилось то, что считает ОТПРАВИТЕЛЬ (кость, значение из записи,
   * поле с его листа). Считать это у цели нельзя: у получателя нет ни
   * кости, ни чужого листа (tests/rule.sides.test.ts).
   *
   * Почему одним движением, а не «завести, потом дописать»: карточка
   * склеена из двух шагов по тому, что выражение зовёт число по имени.
   * Между двумя правками пара распалась бы надвое, экран перерисовал бы
   * две карточки вместо одной — и набранное в поле потерялось бы.
   */
  withNumber?: (change: (amount: Step, apply: Step, id: string) => void) => void;
  onDelete: () => void;
  /** Перенос карточки соседям навстречу. Нет обработчика — карточка с краю. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Заводит потребность на эффекте (не на шаге — `edit` шага сюда не
   * дотягивается) и возвращает её ключ. Задача 2, «согласованное
   * расширение пропсов»: потребность может родиться прямо там, где её
   * не хватило в слоте, а не только со вкладки эффекта.
   */
  onAddParam?: (label: string, kind: string) => string;
}) {
  const context: SlotContext = { system, effect, earlier };
  const step = group.step as any;
  // Удаление в два шага вместо подтверждения окном: первый клик взводит,
  // второй убирает. Карточка на восемь заполненных мест не должна умирать
  // от одного промаха мышью, а модальное окно ради этого — перебор.
  const [armed, setArmed] = useState(false);

  const actions = armed ? (
    <>
      <Button size="sm" variant="danger" onClick={onDelete}>убрать</Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>отмена</Button>
    </>
  ) : (
    <>
      <Button size="sm" variant="ghost" title="выше" disabled={!onMoveUp} onClick={onMoveUp}>↑</Button>
      <Button size="sm" variant="ghost" title="ниже" disabled={!onMoveDown} onClick={onMoveDown}>↓</Button>
      <Button size="sm" variant="ghost" title="убрать карточку" onClick={() => setArmed(true)}>×</Button>
    </>
  );

  if (group.kind === 'unknown') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={actions} />
      </Card>
    );
  }

  const segments = group.kind === 'check' ? checkReadback(group.step, system, effect)
    : group.kind === 'change' ? changeReadback(group.step, group.amount, system, effect)
      : numberReadback(group.step, system, effect);

  return (
    <>
      <Card tone={problem ? 'bad' : undefined}>
        <CardHead
          title={`${position} · ${TITLES[group.kind]}`}
          // Имя нужно всякому шагу, на результат которого ссылаются, а не
          // только «Числу»: без имени проверку нельзя назвать в слоте, и
          // «костей на максимуме» из неё не достать. Раньше поле стояло
          // только у «Числа» — потому свежесобранная проверка и была
          // невидима для последующих шагов.
          badge={group.kind === 'change' ? null : (
            <Input
              value={step.id ?? ''}
              mono
              placeholder="имя"
              onChange={next => edit(0, draft => {
                const id = next.trim();
                if (id) (draft as any).id = id; else delete (draft as any).id;
              })}
            />
          )}
          actions={actions}
        />
        {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
        <Readback segments={segments} />
        {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} withNumber={withNumber} system={system} onAddParam={onAddParam} /> : null}
        {group.kind === 'number' ? <NumberBody step={step} context={context} edit={edit} onAddParam={onAddParam} /> : null}
      </Card>
      {breakLine(group)}
    </>
  );
}

// Исходы выводятся из оператора: у каждого сравнения есть отрицание
// (≥ ↔ <, = ↔ ≠), и проверка порождает ровно столько веток, сколько
// у неё исходов. Сегодня их два; настройки «когда обрыв» нет — есть
// выбор, какая ветка продолжает («дальше при» в тонкостях).
const OP_SIGN: Record<string, string> = { atLeast: '≥', notOver: '≤', over: '>', under: '<', equals: '=' };
const OP_NOT: Record<string, string> = { atLeast: '<', notOver: '>', over: '≤', under: '≥', equals: '≠' };

function breakLine(group: CardGroup) {
  if (group.kind !== 'check') return null;
  const s = group.step as any;
  if (group.step.type === 'compare') {
    if (s.breakIf === 'never') return null;
    const broken = s.breakIf === 'atMost' ? '≤' : '<';
    const pass = s.breakIf === 'atMost' ? '>' : '≥';
    return (
      <div className="card-forks">
        <p className="card-break card-break--on">{pass} — цепочка продолжается</p>
        <p className="card-break">{broken} — эффект кончается здесь</p>
      </div>
    );
  }
  const op = String(s.successWhen ?? 'atLeast');
  const onSuccess = (s.continueOn ?? 'success') === 'success';
  const sign = OP_SIGN[op] ?? '≥';
  const not = OP_NOT[op] ?? '<';
  return (
    <div className="card-forks">
      <p className="card-break card-break--on">{onSuccess ? sign : not} — цепочка продолжается</p>
      <p className="card-break">{onSuccess ? not : sign} — эффект кончается здесь</p>
    </div>
  );
}

// ── проверка ──────────────────────────────────────────────────────────────

// Одно поле на весь бросок: «1d20 + #бонус_атаки». Черновик держится
// локально и уходит в структуру по Enter/уходу с поля; ошибка разбора
// не затирает данные — остаётся в поле, пока автор не поправит.
/**
 * Строка броска — ОБЫЧНОЕ поле формулы: «1d20 + @Бонус атаки».
 *
 * Никаких декоративных знаков: всё, что видно в строке, автор и написал.
 * Прежняя версия рисовала кость фишкой и подставляла «+» за автора — и
 * человек, дописывая своё «+», получал два. Кость снова текстом: она и есть
 * математика, а ссылкой на словарь остаётся в данных — разбор сам узнаёт
 * записанную в словаре кость и ставит ссылку (roll-expr.ts).
 */
function RollExprInput({ step, context, edit }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  // Какую кость человек взял из подсказки. Нотация её не заменяет: чтение
  // («считать успехи») по «5d10» не восстановить.
  const [picked, setPicked] = useState<string | null>(null);
  const shown = draft ?? formatRollExpr(step.roll, context.system);

  const commit = () => {
    if (draft === null) return;
    if (!draft.trim()) {
      edit(0, target => { delete ((target as any).roll ??= {}).bonus; });
      setDraft(null); setTrouble(null); setPicked(null);
      return;
    }
    const parsed = parseRollExpr(draft, context.system, picked);
    if (parsed.error) { setTrouble(parsed.error); return; }
    const bad = badFormula(parsed.bonus);
    if (bad) { setTrouble(bad); return; }
    edit(0, target => {
      const roll = ((target as any).roll ??= {});
      roll.die = parsed.die;
      if (parsed.bonus === null) delete roll.bonus; else roll.bonus = parsed.bonus;
    });
    setDraft(null);
    setTrouble(null);
    setPicked(null);
  };

  return (
    <Field label="бросок" error={trouble}>
      <FormulaChips
        value={shown}
        system={context.system}
        side={String(step.side ?? 'sender') === 'target' ? 'target' : 'self'}
        placeholder="1d20 + @поле"
        extraOptions={Object.entries(context.system.constants ?? {})
          .filter(([, c]) => c.kind === 'die')
          .map(([key, c]) => ({
            group: 'кость системы',
            label: c.label ?? key,
            // Кость вставляется ТЕКСТОМ, как её и пишут: «1d20» — строка
            // остаётся обычным выражением. Ссылкой на словарь она станет
            // при разборе: по выбору (picked) или по совпадению нотации.
            onPick: (insert: (piece: string) => string) => {
              setPicked(key);
              setDraft(insert(notationOf(context.system, key)));
            },
          }))}
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(null); setTrouble(null); setPicked(null); }
        }}
      />
    </Field>
  );
}


// Величина изменения одной строкой: «1d8 + ⟦Мод Силы⟧». Кость и прибавка
// живут в движке порознь (кость бросает отправитель, формулу считает лист),
// но набирают их вместе — парсер делит, формат собирает обратно.
function ChangeValue({ amount, apply, applyIndex, context, edit, withNumber, onCreateFromRecord }: {
  /** Величина карточки, если она есть: только она умеет бросать кость. */
  amount?: Step;
  /** Шаг «применить»: он несёт поле цели и новое значение. */
  apply: Step;
  applyIndex: number;
  context: SlotContext;
  edit: EditFn;
  /** Завести число, если его ещё нет, и править пару разом. */
  withNumber?: WithNumber;
  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const target = (apply as Record<string, any>).target;

  // Имя, которым выражение зовёт брошенное число. У склеенной пары это имя
  // её же величины: она бросает кость (или берёт значение из записи), а
  // выражение ниже с ним считает.
  const amountId = String((amount as Record<string, any> | undefined)?.id ?? '');

  // Показываем ровно то, что посчитается. Старые эффекты (и образцы) хранят
  // «направление + величина» — их выражение собирается для показа, а при
  // первой же правке ложится в данные тем, чем читается.
  const asExpr = (): string => {
    const a = apply as Record<string, any>;
    const value = a.value;
    if (value && typeof value === 'object' && 'expr' in value) return String(value.expr);
    // Число стоит ОДНОЙ фишкой, и это не косметика: оно целиком посчитано
    // ОТПРАВИТЕЛЕМ — кость брошена им, прибавка взята с его листа — и
    // приехало в конверте готовым. Разобрать его на слагаемые прямо здесь
    // нельзя: выражение считает лист ЦЕЛИ, и «Мод Силы» в нём стал бы
    // силой жертвы, а не бьющего (tests/rule.sides.test.ts).
    const amountName = amountId ? `#${amountId}` : '';
    const targetName = target && typeof target === 'object' && 'tag' in target ? `#${target.tag}` : '';
    const direction = String(a.direction ?? 'subtract');
    if (direction === 'set') return amountName;
    if (!targetName) return amountName;
    // Минус здесь ОБЫЧНЫЙ дефис, а не типографский «−»: строка уходит
    // в формулу, и красивый знак парсер не понимает.
    return `${targetName} ${direction === 'add' ? '+' : '-'} ${amountName}`;
  };

  const shown = draft ?? asExpr();

  // Имя числа в строке подписано его содержимым: «Кость урона + Мод Силы»,
  // а не «dmg». Машинное имя нужно данным, человеку — нет.
  // Присланное число — не один ком, а свои слагаемые: кость и прибавка,
  // каждая своей фишкой со своим крестиком. Считает их ОТПРАВИТЕЛЬ (потому
  // и «прислано»), но видеть и править автор должен по отдельности.
  const dice = (amount as Record<string, any> | undefined)?.dice;
  const bonus = (amount as Record<string, any> | undefined)?.bonus;
  const diceChip = chipOf(dice, context);
  const bonusText = exprText(bonus);
  const both = Boolean(diceChip && bonusText);

  const sentChip = (label: ReactNode, onRemove: () => void, key: string, onBack?: () => void) => (
    <span key={key} className="chips__chip chips__chip--sent">
      {label}
      {onBack ? (
        <button
          type="button" className="chips__side chips__side--pick"
          title="вернуть цели: считать это её листом"
          onMouseDown={e => { e.preventDefault(); onBack(); }}
        >у отправителя ⇄</button>
      ) : (
        // Кость возвращать некуда: её бросает отправитель, у цели её нет.
        <span className="chips__side" title="кость бросает отправитель">у отправителя</span>
      )}
      <button
        type="button" className="chips__x" aria-label="убрать слагаемое"
        onMouseDown={e => { e.preventDefault(); onRemove(); }}
      >×</button>
    </span>
  );

  const names = amountId && amount ? {
    [amountId]: (
      <>
        {both ? <span className="chips__paren" aria-hidden>(</span> : null}
        {diceChip ? sentChip(
          diceChip.label,
          () => edit(0, step => { delete (step as Record<string, unknown>).dice; }),
          'dice',
        ) : null}
        {both ? <span className="chips__plus" aria-hidden>+</span> : null}
        {bonusText ? sentChip(
          bonusText.replace(/#([\p{L}\p{N}_]+)/gu, (_, tag: string) => labelOfTag(context.system, tag)),
          () => edit(0, step => { delete (step as Record<string, unknown>).bonus; }),
          'bonus',
          withNumber ? backToTarget : undefined,
        ) : null}
        {both ? <span className="chips__paren" aria-hidden>)</span> : null}
      </>
    ),
  } : undefined;

  // Кость в формуле не считается: её бросает ОТПРАВИТЕЛЬ при упаковке, а
  // выражение считает лист цели. Поэтому набранная нотация уезжает в
  // величину карточки, а в тексте остаётся имя — то же, что и было бы,
  // выбери человек кость из подсказки.
  const DICE = /(\d+)?\s*[dдк]\s*(\d+)/iu;

  /** Убрать след вынутого слагаемого: висящий знак и двойные пробелы. */
  const tidy = (text: string) => text
    .replace(/\+\s*\+/g, '+')
    .replace(/[-+*/]\s*$/, '')
    .replace(/^\s*\+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  /** Стоит ли имя числа в строке. Второй раз дописывать его нельзя. */
  const mentions = (text: string, id: string) =>
    new RegExp(`#${id}(?![\\p{L}\\p{N}_])`, 'u').test(text);

  /**
   * Всё, что считает отправитель, попадает в строку одинаково: кладём это
   * в число карточки (заводя его при надобности) и дописываем в выражение
   * имя числа. Правка одна на пару — иначе карточка на миг распалась бы
   * надвое и набранное потерялось.
   */
  const sendThrough = (
    fill: (amount: Record<string, any>) => void,
    /** Куда поставить имя числа. По умолчанию — в хвост строки. */
    place?: (name: string) => string,
  ) => {
    const line = (draft ?? asExpr()).trim();
    const put = (a: Step, apply: Step, id: string) => {
      fill(a as Record<string, any>);
      const name = `#${id}`;
      const next = (place ? place(name) : (mentions(line, id) ? line : (line ? `${line} + ${name}` : name)))
        .replace(/\s+/g, ' ').trim();
      const target = apply as Record<string, any>;
      target.direction = 'set';
      target.value = { expr: next, of: 'target' };
    };
    if (!withNumber && !amountId) {
      // Завести число некому (так карточка живёт в своих тестах) — молча
      // терять набранное нельзя.
      setTrouble('кость бросает отправитель — заведите карточку «число» и назовите её');
      return;
    }
    if (withNumber) withNumber(put);
    else {
      // Число уже есть — обойдёмся обычной правкой пары (так живут тесты
      // карточки, где вставлять шаги некуда).
      edit(0, a => fill(a as Record<string, any>));
      edit(applyIndex, apply => put({} as Step, apply, amountId));
    }
    setDraft(null);
    setTrouble(null);
  };

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();

    // Набрана кость — она уезжает в число, а в строке остаётся его имя.
    const rolled = text.match(DICE);
    if (rolled) {
      const notation = `${rolled[1] ?? 1}d${rolled[2]}`;
      const picked = parseRollExpr(notation, context.system).die;
      // Имя встаёт ровно туда, где стояла нотация: «#хп − 1d8» читается
      // «#хп − #n», а не «#хп − + #n». А если имя в строке уже стоит —
      // кость уехала ВНУТРЬ него, и второй раз называть его не нужно:
      // «#n + 1d8» это «#n», а не «#n + #n».
      sendThrough(a => { a.dice = picked; }, name => (mentions(text, name.slice(1))
        ? tidy(text.replace(DICE, ''))
        : text.replace(DICE, name)));
      return;
    }

    edit(applyIndex, step => {
      const a = step as Record<string, any>;
      if (!text) { delete a.value; return; }
      a.direction = 'set';
      a.value = { expr: text, of: 'target' };
    });
    setDraft(null);
    setTrouble(null);
  };

  // «Из записи» тоже приносит ЧИСЛО, которого у формулы нет: его берёт
  // величина карточки, а выражение зовёт её по имени — как и кость.
  const putIntoAmount = (ref: SlotRef, place?: (name: string) => string) =>
    sendThrough(a => { a.dice = ref; }, place);

  /**
   * Поле, которое надо взять У ОТПРАВИТЕЛЯ.
   *
   * Оно уезжает в число: отправитель считает его своим листом при упаковке
   * и присылает готовым. Иначе «Мод Силы» в выражении цели стал бы силой
   * ЖЕРТВЫ — молча и с другим результатом (tests/rule.sides.test.ts).
   *
   * Если имени числа в строке ещё нет — оно просто встаёт на место
   * слагаемого: и место, и знак перед ним остаются те же. Если уже
   * стоит, слагаемое складывается с содержимым числа, и вот тут знак
   * приходится считать: «ХП − #n + Сила» это «ХП − (урон − Сила)»,
   * а не «− (урон + Сила)».
   */
  const takeFromSender = (tag: string, place: (name: string) => string) => {
    const line = place('');
    const marked = place('§');
    // Умножение и деление так не переносятся: «(a − b)·c» и «a − b·c» —
    // разные числа, и молча подменять одно другим нельзя.
    if (/[*/]\s*§|§\s*[*/]/.test(marked)) {
      setTrouble('это слагаемое умножается — вынесите его отдельной карточкой «число»');
      return;
    }
    /** С каким знаком слагаемое стоит в строке. */
    const signOf = (what: string) => {
      const at = marked.indexOf(what);
      return at > 0 && marked.slice(0, at).trimEnd().endsWith('-') ? '-' : '+';
    };

    // Имя числа уже в строке — слагаемое складывается с его содержимым,
    // и знак считается относительно знака самого числа: «ХП − #n + Сила»
    // это «ХП − (урон − Сила)», а не «− (урон + Сила)».
    const folding = Boolean(amountId && mentions(line, amountId));
    const sign = folding && signOf('§') !== signOf(`#${amountId}`) ? '-' : '+';
    const was = exprText((amount as Record<string, any> | undefined)?.bonus).trim();
    const expr = was ? `${was} ${sign} #${tag}`
      : sign === '-' ? `0 - #${tag}` : `#${tag}`;

    sendThrough(a => { a.bonus = { expr }; }, name => (folding ? tidy(line) : place(name)));
  };

  /** Обратно: присланное слагаемое считает цель — вернуть его в строку. */
  // Объявлением, а не переменной: карточка выше (присланная фишка) зовёт
  // его до этого места.
  function backToTarget() {
    const was = exprText((amount as Record<string, any> | undefined)?.bonus).trim();
    if (!was) return;
    const line = (draft ?? asExpr()).trim();
    const put = (a: Step, apply: Step, id: string) => {
      delete (a as Record<string, any>).bonus;
      const dice = (a as Record<string, any>).dice;
      // Число осталось только костью — имя в строке живёт дальше; если и
      // кости нет, имени ссылаться не на что, и оно уходит вместе с ним.
      const next = dice
        ? `${line} + ${was}`
        : line.replace(new RegExp(`#${id}(?![\\p{L}\\p{N}_])`, 'u'), was).trim();
      const t = apply as Record<string, any>;
      t.direction = 'set';
      t.value = { expr: next, of: 'target' };
    };
    if (withNumber) withNumber(put);
    setDraft(null);
  }

  const needs = (context.effect.params ?? []).map(p => ({
    group: 'из записи',
    label: p.label ?? p.key,
    onPick: (insert: (piece: string) => string) => putIntoAmount({ param: p.key } as SlotRef, insert),
  }));
  if (onCreateFromRecord) {
    needs.push({
      group: 'из записи',
      label: 'новая потребность…',
      onPick: (insert: (piece: string) => string) => putIntoAmount(onCreateFromRecord(), insert),
    });
  }

  return (
    <>
      {/* Две подписанные вещи: ЧТО меняем и ЧЕМ ОНО СТАНЕТ. Вторая —
          обычная математика, без знаков-выпадашек: «#хп − #урон», «0»,
          «#максхп / 2» — всё это законные ответы. */}
      <Field
        label="что меняется"
        needed={!target}
        hint={target ? undefined : 'Поле цели: что этот шаг поменяет.'}
      >
        <SlotInput
          value={target}
          context={context}
          allow={['tag', 'param']}
          side="target"
          placeholder="поле цели"
          onChange={next => edit(applyIndex, target => {
            const t = target as Record<string, unknown>;
            if (next) t.target = next; else delete t.target;
          })}
          onCreateFromRecord={onCreateFromRecord}
        />
      </Field>

      {/* Вторая строка — ЧЕМ ПОЛЕ СТАНЕТ, и это обычная математика.
          Ни знака-выпадашки, ни обязательного поля впереди: «#хп − #урон»,
          «0», «#максхп / 2» — всё это законные ответы на один и тот же
          вопрос. Кость, брошенную отправителем, формула зовёт по имени
          шага (engine/refs.ts): без этого выражение пришлось бы разбирать
          на «направление» и «величину», чем карточка и занималась раньше. */}
      <Field
        label="станет"
        error={trouble}
        hint="Математика по листу ЦЕЛИ. Слагаемому, которое надо взять у бьющего, щёлкните подпись «у цели» — он посчитает его своим листом и пришлёт готовым."
      >
        <FormulaChips
          value={shown}
          system={context.system}
          names={names}
          side="target"
          placeholder="например: #хп − #урон"
          extraOptions={needs}
          onFlipSide={withNumber ? takeFromSender : undefined}
          onChange={setDraft}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(null); setTrouble(null); }
          }}
        />
      </Field>
    </>
  );
}

/**
 * Формулу, которую не разобрать, нельзя пускать в данные молча: набранное
 * «@…», которое ничего не выбрало, — обычный случай, и человек должен
 * увидеть, что строка не понята, а не гадать за столом.
 */
function badFormula(bonus: unknown): string | null {
  if (!bonus || typeof bonus !== 'object' || !('expr' in (bonus as object))) return null;
  const text = String((bonus as { expr: unknown }).expr ?? '').trim();
  if (!text) return null;
  try { compile(text); return null; } catch (err) {
    return (err as Error).message;
  }
}

/** Текст прибавки как её набирают: формула строкой, число числом. */
function exprText(bonus: unknown): string {
  if (!bonus || typeof bonus !== 'object') return '';
  const b = bonus as Record<string, unknown>;
  if ('expr' in b) return String(b.expr ?? '');
  if ('const' in b) return String(b.const ?? '');
  return '';
}

function CheckBody({ step, context, edit, system }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const mode = step.type === 'compare' ? 'plain' : 'roll';
  const tables = Object.entries(system.tables ?? {});

  return (
    <>
      {/* Переключатель проверки: тип меняется, чужая нагрузка остаётся. */}
      <Segmented
        value={mode}
        options={[{ key: 'roll', label: 'броском' }, { key: 'plain', label: 'без броска' }]}
        onChange={next => edit(0, draft => {
          const d = draft as any;
          if (next === 'roll') {
            draft.type = 'threshold';
            d.roll ??= { die: firstDie(system) ? { constant: firstDie(system) } : undefined, check: null };
            d.side ??= 'sender'; d.successWhen ??= 'atLeast'; d.continueOn ??= 'success';
          } else {
            draft.type = 'compare';
            d.breakIf ??= 'less';
          }
        })}
      />

      {/* Проверка — уравнение: слева строка броска, оператор, справа порог.
          Строку разбирает парсер: голова — кость (преимуществу есть что
          удваивать), хвост после «+» — число или формула. */}
      {mode === 'roll' ? (
        <div className="row">
          <RollExprInput step={step} context={context} edit={edit} />
          <Field label="успех">
            <Select
              value={String(step.successWhen ?? 'atLeast')}
              options={[['atLeast', '≥'], ['notOver', '≤'],
                ['over', '>'], ['under', '<'], ['equals', '=']] as const}
              onChange={next => edit(0, draft => { (draft as any).successWhen = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      ) : (
        <div className="row">
          <Field label="что сравниваем">
            <SlotInput
              value={step.value} context={context} allow={['ref']}
              onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
            />
          </Field>
          <Field label="обрыв, если">
            <Select
              value={String(step.breakIf ?? 'less')}
              options={[['less', '< меньше правого'], ['atMost', '≤ не больше правого'],
                ['never', 'обрыва нет — разница идёт дальше']] as const}
              onChange={next => edit(0, draft => { (draft as any).breakIf = next; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']} side="target"
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </div>
      )}

      {mode === 'roll' ? (
        <Fold title="Тонкости">
          <Field label="кто бросает">
            <Select
              value={String(step.side ?? 'sender')}
              options={[['sender', 'отправитель'], ['target', 'цель']] as const}
              onChange={next => edit(0, draft => { (draft as any).side = next; })}
            />
          </Field>
          <Field label="дальше при">
            <Select
              value={String(step.continueOn ?? 'success')}
              options={[['success', 'успехе'], ['fail', 'провале']] as const}
              onChange={next => edit(0, draft => { (draft as any).continueOn = next; })}
            />
          </Field>
          {/* Мишень — КЛАСС броска, крючок для узких правил: «преимущество
              на атаки». Правки «на любой бросок» ловятся и без неё — всякий
              бросок принадлежит общей мишени, ничего не объявляя. */}
          <Field label="какой это бросок" hint="Вид броска из словаря — чтобы правило «преимущество на атаки» знало, куда целиться. Правки «на любой бросок» этот бросок поймает в любом случае.">
            <Select
              value={String(step.roll?.check ?? '')}
              options={[['', '— просто бросок: только общие правки —'],
                ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
              onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).check = next || null; })}
            />
          </Field>
          {/* Степени успеха — мирам PbtA и PF2e мало «да/нет». Строка живёт
              в тонкостях и по умолчанию выключена: кто играет в 5e, её
              не встретит. Шкала — обычная таблица из словарей. */}
          <Field
            label="степени успеха"
            hint={tables.length
              ? 'Вместо «да/нет» исход читается ступенями по таблице: «провал / успех с ценой / полный успех».'
              : 'Сначала заведите таблицу ступеней в «Словарях».'}
          >
            <Select
              value={String(step.degrees?.table ?? '')}
              options={[['', '— не считать, просто да/нет —'],
                ...tables.map(([key, t]) => [key, t.label || key] as const)] as never}
              onChange={next => edit(0, draft => {
                const d = draft as any;
                if (!next) delete d.degrees;
                else d.degrees = { table: next, of: d.degrees?.of ?? 'total' };
              })}
            />
          </Field>
          {step.degrees?.table ? (
            <Field label="ступень по">
              <Select
                value={String(step.degrees.of ?? 'total')}
                options={[['total', 'итогу броска'], ['margin', 'запасу против порога']] as const}
                onChange={next => edit(0, draft => { (draft as any).degrees.of = next; })}
              />
            </Field>
          ) : null}
        </Fold>
      ) : null}
    </>
  );
}

// ── изменение ─────────────────────────────────────────────────────────────

function ChangeBody({ group, context, edit, withNumber, system, onAddParam }: {
  group: CardGroup;
  context: SlotContext;
  edit: EditFn;
  withNumber?: WithNumber;
  system: System;
  onAddParam?: (label: string, kind: string) => string;
}) {
  const step = group.step as any;
  const mode = step.type === 'status' ? 'status' : 'apply';
  const applyIndex = group.amount ? 1 : 0;

  // Потребность рождается по подписи слота: dice-слоту — «кости», карточке
  // состояния — «эффект-состояние», остальным — «формула». Без колбэка
  // (например, в тестах карточки) пункт «новая потребность…» просто не
  // появляется — SlotInput проверяет это сам.
  const fromRecord = (label: string, kind: string) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  // Состояния для карточки «изменение → состояние»: пассивные эффекты системы.
  const statusOptions: SlotOption[] = Object.entries(system.effects ?? {})
    .filter(([, e]) => (e.activation ?? 'manual') === 'passive')
    .map(([id, e]) => ({ group: 'Состояния', label: e.label ?? id, ref: { const: id } }));

  return (
    <>
      {/* Переключатель изменения: тип меняется, чужая нагрузка остаётся. */}
      <Segmented
        value={mode}
        options={[{ key: 'apply', label: 'поле' }, { key: 'status', label: 'состояние' }]}
        onChange={next => edit(applyIndex, draft => {
          const d = draft as any;
          if (next === 'status') {
            draft.type = 'status';
            d.mode ??= 'apply';
          } else {
            draft.type = 'apply';
            d.direction ??= 'subtract';
            d.targetModifiers ??= true;
          }
        })}
      />

      {mode === 'apply' ? (
        <>
          {/* Карточка «изменение» выглядит одинаково, есть у неё величина
              или нет: поле цели и выражение. Раньше без величины показывался
              другой набор полей («сколько»), и одна и та же карточка
              выглядела двумя разными. */}
          <ChangeValue
            amount={group.amount ?? undefined} apply={step} applyIndex={applyIndex}
            context={context} edit={edit} withNumber={withNumber}
            onCreateFromRecord={fromRecord('сколько — кости', 'dice')} />


          <Fold title="Тонкости">
            {/* Само число живёт ВНУТРИ изменения — так и было решено: атака
                это две карточки, а не три. В строке выше оно читается тем,
                чем является («Кость урона + Мод Силы»), а его устройство
                правится здесь, не занимая места у главного. */}
            {group.amount ? (
              <NumberBody
                step={group.amount}
                context={context}
                edit={(_, change) => edit(0, change)}
                onAddParam={onAddParam}
              />
            ) : null}
            <Field label="не ниже">
              <SlotInput
                value={step.floor} context={context} allow={['const', 'tag']}
                onChange={next => edit(applyIndex, draft => { (draft as any).floor = next ?? undefined; })}
              />
            </Field>
            <Field label="не выше">
              <SlotInput
                value={step.ceiling} context={context} allow={['const', 'tag']}
                onChange={next => edit(applyIndex, draft => { (draft as any).ceiling = next ?? undefined; })}
              />
            </Field>
            <Field label="сопротивления цели">
              <Select
                value={String(step.targetModifiers ?? true)}
                options={[['true', 'учитываются'], ['false', 'не учитываются']] as const}
                onChange={next => edit(applyIndex, draft => { (draft as any).targetModifiers = next === 'true'; })}
              />
            </Field>
          </Fold>
        </>
      ) : (
        <>
          {/* Состоянию число не нужно, но выбрасывать набранное нельзя:
              вернул переключатель — вернулась и величина. Говорим об этом,
              чтобы «куда делась кость урона» не пришлось гадать. */}
          {group.amount ? (
            <span className="faint">
              величина сохранена — вернётся, если снова выбрать «поле»
            </span>
          ) : null}
          <Field label="что делаем">
            <Select
              value={String(step.mode ?? 'apply')}
              options={[['apply', 'вешаем'], ['remove', 'снимаем']] as const}
              onChange={next => edit(applyIndex, draft => { (draft as any).mode = next; })}
            />
          </Field>
          <Field label="какое">
            <SlotInput
              value={step.effect} context={context} extraOptions={statusOptions}
              onChange={next => edit(applyIndex, draft => { (draft as any).effect = next ?? undefined; })}
              onCreateFromRecord={fromRecord('какое', 'effect')}
            />
          </Field>
        </>
      )}
    </>
  );
}

// ── число ─────────────────────────────────────────────────────────────────

function NumberBody({ step, context, edit, onAddParam }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  onAddParam?: (label: string, kind: string) => string;
}) {
  const source = typeof step.source === 'object' ? 'roll' : (step.source ?? 'roll');
  const fromRecord = (label: string, kind: string) =>
    onAddParam ? () => ({ param: onAddParam(label, kind) }) : undefined;

  return (
    <>
      <Field label="откуда">
        <Select
          value={String(source)}
          options={[
            ['roll', 'свой бросок'], ['margin', 'превышение проверки'], ['item', 'фикс записи'],
          ] as const}
          onChange={next => edit(0, draft => { (draft as any).source = next; })}
        />
      </Field>

      {source === 'roll' ? (
        <>
          <Field label="кости">
            <SlotInput
              value={step.dice} context={context} dice placeholder="кости или из записи"
              onChange={next => edit(0, draft => { (draft as any).dice = next ?? undefined; })}
              onCreateFromRecord={fromRecord('кости', 'dice')}
            />
          </Field>
          <Field label="прибавка">
            <SlotInput
              value={step.bonus} context={context}
              onChange={next => edit(0, draft => { (draft as any).bonus = next ?? undefined; })}
            />
          </Field>
        </>
      ) : null}

      {source === 'margin' ? (
        <Field label="какое превышение">
          <SlotInput
            value={step.margin} context={context} allow={['ref']}
            onChange={next => edit(0, draft => { (draft as any).margin = next ?? undefined; })}
          />
        </Field>
      ) : null}

      {source === 'item' ? (
        <Field label="фикс записи">
          <SlotInput
            value={step.fixed} context={context}
            onChange={next => edit(0, draft => { (draft as any).fixed = next ?? undefined; })}
            onCreateFromRecord={fromRecord('фикс записи', 'expr')}
          />
        </Field>
      ) : null}
    </>
  );
}
