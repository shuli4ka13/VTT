// apps/web/src/screens/constructor/card.tsx
// Карточка группы шагов: три понятия поверх пяти команд движка.
// Пересказ — сверху; контролы следуют за выбором (у «числа» видны только
// слоты выбранного источника); переключатели меняют step.type, ничего
// не стирая — вернул переключатель, вернулась и работа.

import { useState, type ReactNode } from 'react';
import type { System, Effect, Step, SlotRef } from '@vtt/schema';
import { Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input } from '../../ui/primitives.tsx';
import type { CardGroup } from './cards.ts';
import { checkReadback, changeReadback, numberReadback, type Segment } from './readback.ts';
import { parseRollExpr, formatRollExpr, parseAmountExpr, formatAmountExpr } from './roll-expr.ts';
import { FormulaChips } from '../../ui/formula-chips.tsx';
import { SlotInput, type SlotOption } from './slot-input.tsx';
import type { SlotContext } from './slots.tsx';
import type { Problem } from './step-card.tsx';

const TITLES: Record<string, string> = { check: 'Проверка', change: 'Изменение', number: 'Число' };

type EditFn = (slotIndexInGroup: number, change: (draft: Step) => void) => void;

const firstDie = (system: System): string | undefined => Object.keys(system.constants ?? {})[0];

export function Readback({ segments }: { segments: Segment[] }) {
  return (
    <p className="readback">
      {segments.map((part, i) => {
        const glue = 'text' in part && /^[.,]/.test(part.text);
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
  edit, onDelete, onMoveUp, onMoveDown, onAddParam,
}: {
  group: CardGroup;
  position: number;
  system: System;
  effect: Effect;
  earlier: string[];
  problem: Problem | null;
  /**
   * Лекарство рядом с диагнозом (задача 3): если беда в отсутствующем поле
   * и нашёлся донор, эффект-таб кладёт сюда кнопку «взять блок» — она
   * рендерится внутри того же Verdict, а не отдельной карточкой.
   */
  problemAction?: ReactNode;
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;
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
          badge={group.kind === 'number' ? (
            <Input
              value={step.id ?? ''}
              mono
              placeholder="имя"
              onChange={next => edit(0, draft => {
                const id = next.trim();
                if (id) (draft as any).id = id; else delete (draft as any).id;
              })}
            />
          ) : null}
          actions={actions}
        />
        {problem ? <Verdict tone="bad" action={problemAction}>{problem.text}</Verdict> : null}
        <Readback segments={segments} />
        {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} system={system} onAddParam={onAddParam} /> : null}
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
function RollExprInput({ step, context, edit }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const shown = draft ?? formatRollExpr(step.roll, context.system);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseRollExpr(draft, context.system);
    if (parsed.error) { setTrouble(parsed.error); return; }
    edit(0, target => {
      const roll = ((target as any).roll ??= {});
      roll.die = parsed.die;
      if (parsed.bonus === null) delete roll.bonus;
      else roll.bonus = parsed.bonus;
    });
    setDraft(null);
    setTrouble(null);
  };

  return (
    <Field label="бросок" error={trouble}>
      <FormulaChips
        value={shown}
        system={context.system}
        placeholder="1d20 + @Бонус атаки"
        onChange={next => { setDraft(next); setTrouble(null); }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(null); setTrouble(null); }
        }}
      />
    </Field>
  );
}


// Величина изменения одной строкой: «1d8 + ⟦Мод Силы⟧». Кость и прибавка
// живут в движке порознь (кость бросает отправитель, формулу считает лист),
// но набирают их вместе — парсер делит, формат собирает обратно.
function AmountExprInput({ amount, context, edit, onCreateFromRecord }: {
  amount: Step;
  context: SlotContext;
  edit: EditFn;
  onCreateFromRecord?: () => SlotRef;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const dice = (amount as any).dice;

  // Кость может прийти ИЗ ЗАПИСИ — такую строкой не напишешь, и строка её
  // молча стёрла бы. Тогда у кости свой слот, а строка остаётся прибавке.
  const structural = dice && typeof dice === 'object'
    && !('const' in dice) && !('constant' in dice);

  if (structural) {
    return (
      <>
        <Field label="сколько — кости">
          <SlotInput
            value={dice} context={context} dice
            placeholder="1d8, 2d6 — или из записи"
            onChange={next => edit(0, draft => { (draft as any).dice = next ?? undefined; })}
            onCreateFromRecord={onCreateFromRecord}
          />
        </Field>
        <Field label="и прибавка">
          <SlotInput
            value={(amount as any).bonus} context={context}
            onChange={next => edit(0, draft => { (draft as any).bonus = next ?? undefined; })}
          />
        </Field>
      </>
    );
  }

  const shown = draft ?? formatAmountExpr(amount, context.system);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseAmountExpr(draft, context.system);
    edit(0, target => {
      const t = target as any;
      if (parsed.die === undefined) delete t.dice; else t.dice = parsed.die;
      if (parsed.bonus === null) delete t.bonus; else t.bonus = parsed.bonus;
    });
    setDraft(null);
  };

  return (
    <Field label="сколько">
      <FormulaChips
        value={shown}
        system={context.system}
        placeholder="1d8 + @Мод Силы"
        onChange={setDraft}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    </Field>
  );
}

function CheckBody({ step, context, edit, system }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const mode = step.type === 'compare' ? 'plain' : 'roll';

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
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']}
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
              value={step.versus} context={context} allow={['tag', 'expr', 'const', 'param', 'ref']}
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
          {/* Мишень — крючок для преимуществ и бонусов (словарь «Мишени
              бросков»): всё, что повешено на мишень, ловит любой бросок
              по ней. Бросок без мишени не ловит ничего — сказать прямо. */}
          <Field label="какой это бросок" hint="Из словаря «Мишени бросков»: преимущества и бонусы вешаются на мишень, и этот бросок поймает всё, что на неё повешено.">
            <Select
              value={String(step.roll?.check ?? '')}
              options={[['', '— ничей: преимущества и бонусы не сработают —'],
                ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
              onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).check = next || null; })}
            />
          </Field>
        </Fold>
      ) : null}
    </>
  );
}

// ── изменение ─────────────────────────────────────────────────────────────

function ChangeBody({ group, context, edit, system, onAddParam }: {
  group: CardGroup;
  context: SlotContext;
  edit: EditFn;
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
          <Field label="какое поле">
            <SlotInput
              value={step.target} context={context} allow={['tag']}
              onChange={next => edit(applyIndex, draft => { (draft as any).target = next ?? undefined; })}
            />
          </Field>
          {/* Операция стоит МЕЖДУ полем и величиной — карточка читается
              уравнением: «Текущие ХП − 1d8 + Мод Силы». Отдельным знаком,
              а не формулой: на неё завязаны сопротивления цели (движок
              обязан знать, что это вычитание) и границы «не ниже/не выше»,
              а формула вдобавок не умеет бросать кости. */}
          <Field label="как">
            <Select
              value={String(step.direction ?? 'subtract')}
              options={[['subtract', '−'], ['add', '+'], ['set', '=']] as const}
              onChange={next => edit(applyIndex, draft => { (draft as any).direction = next; })}
            />
          </Field>

          {/* Величина — ОДНА строка, как в броске: кость и прибавка были
              двумя полями по устройству движка, а человек пишет их вместе. */}
          {group.amount ? (
            <AmountExprInput amount={group.amount} context={context} edit={edit}
              onCreateFromRecord={fromRecord('сколько — кости', 'dice')} />
          ) : (
            <Field label="сколько">
              <SlotInput
                value={step.value} context={context} allow={['ref', 'param', 'const']}
                onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
                onCreateFromRecord={fromRecord('сколько', 'expr')}
              />
            </Field>
          )}

          <Fold title="Тонкости">
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
              value={step.dice} context={context} dice placeholder="какие кости: 1d8, 2d6…"
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
