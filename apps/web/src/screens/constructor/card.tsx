// apps/web/src/screens/constructor/card.tsx
// Карточка группы шагов: три понятия поверх пяти команд движка.
// Пересказ — сверху; контролы следуют за выбором (у «числа» видны только
// слоты выбранного источника); переключатели меняют step.type, ничего
// не стирая — вернул переключатель, вернулась и работа.

import type { System, Effect, Step } from '@vtt/schema';
import { Card, CardHead, Field, Fold, Segmented, Verdict, Button, Select, Input } from '../../ui/primitives.tsx';
import type { CardGroup } from './cards.ts';
import { checkReadback, changeReadback, numberReadback, type Segment } from './readback.ts';
import { SlotInput, type SlotOption } from './slot-input.tsx';
import type { SlotContext } from './slots.tsx';

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

export function GroupCard({ group, position, system, effect, earlier, problem, edit, onDelete }: {
  group: CardGroup;
  position: number;
  system: System;
  effect: Effect;
  earlier: string[];
  problem: string | null;
  edit: (slotIndexInGroup: number, change: (draft: Step) => void) => void;
  onDelete: () => void;
}) {
  const context: SlotContext = { system, effect, earlier };
  const step = group.step as any;

  if (group.kind === 'unknown') {
    return (
      <Card tone="bad">
        <CardHead title={`${position} · движок не знает типа «${group.step.type}»`}
          actions={<Button size="sm" variant="danger" onClick={onDelete}>×</Button>} />
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
          actions={<Button size="sm" variant="danger" onClick={onDelete}>×</Button>}
        />
        {problem ? <Verdict tone="bad">{problem}</Verdict> : null}
        <Readback segments={segments} />
        {group.kind === 'check' ? <CheckBody step={step} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'change' ? <ChangeBody group={group} context={context} edit={edit} system={system} /> : null}
        {group.kind === 'number' ? <NumberBody step={step} context={context} edit={edit} /> : null}
      </Card>
      {breakLine(group)}
    </>
  );
}

function breakLine(group: CardGroup) {
  if (group.kind !== 'check') return null;
  if (group.step.type === 'compare' && (group.step as any).breakIf === 'never') return null;
  return <p className="card-break">здесь эффект может оборваться</p>;
}

// ── проверка ──────────────────────────────────────────────────────────────

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

      {mode === 'roll' ? (
        <>
          <Field label="кость">
            <SlotInput
              value={step.roll?.die} context={context} allow={['constant']}
              onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).die = next ?? undefined; })}
            />
          </Field>
          <Field label="прибавка">
            <SlotInput
              value={step.roll?.bonus} context={context}
              onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).bonus = next ?? undefined; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'param', 'ref']}
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="что сравниваем">
            <SlotInput
              value={step.value} context={context} allow={['ref']}
              onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
            />
          </Field>
          <Field label="против">
            <SlotInput
              value={step.versus} context={context} allow={['tag', 'param', 'ref']}
              onChange={next => edit(0, draft => { (draft as any).versus = next ?? undefined; })}
            />
          </Field>
        </>
      )}

      <Fold title="Тонкости">
        {mode === 'roll' ? (
          <>
            <Field label="кто бросает">
              <Select
                value={String(step.side ?? 'sender')}
                options={[['sender', 'отправитель — это атака'], ['target', 'цель — это спасбросок']] as const}
                onChange={next => edit(0, draft => { (draft as any).side = next; })}
              />
            </Field>
            <Field label="направление успеха">
              <Select
                value={String(step.successWhen ?? 'atLeast')}
                options={[
                  ['atLeast', 'не меньше нужного'], ['notOver', 'не больше нужного'],
                  ['over', 'строго больше'], ['under', 'строго меньше'],
                ] as const}
                onChange={next => edit(0, draft => { (draft as any).successWhen = next; })}
              />
            </Field>
            <Field label="дальше при">
              <Select
                value={String(step.continueOn ?? 'success')}
                options={[['success', 'успехе'], ['fail', 'провале']] as const}
                onChange={next => edit(0, draft => { (draft as any).continueOn = next; })}
              />
            </Field>
            <Field label="мишень модификаторов">
              <Select
                value={String(step.roll?.check ?? '')}
                options={[['', '— нет —'], ...(context.system.rolls ?? []).map(r => [r.tag, r.label] as const)] as never}
                onChange={next => edit(0, draft => { ((draft as any).roll ??= {}).check = next || null; })}
              />
            </Field>
          </>
        ) : (
          <Field label="обрыв когда">
            <Select
              value={String(step.breakIf ?? 'less')}
              options={[['less', 'меньше'], ['atMost', 'не больше'], ['never', 'никогда']] as const}
              onChange={next => edit(0, draft => { (draft as any).breakIf = next; })}
            />
          </Field>
        )}
      </Fold>
    </>
  );
}

// ── изменение ─────────────────────────────────────────────────────────────

function ChangeBody({ group, context, edit, system }: {
  group: CardGroup;
  context: SlotContext;
  edit: EditFn;
  system: System;
}) {
  const step = group.step as any;
  const mode = step.type === 'status' ? 'status' : 'apply';
  const applyIndex = group.amount ? 1 : 0;

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
          <Field label="как">
            <Select
              value={String(step.direction ?? 'subtract')}
              options={[['subtract', 'вычесть'], ['add', 'прибавить'], ['set', 'задать']] as const}
              onChange={next => edit(applyIndex, draft => { (draft as any).direction = next; })}
            />
          </Field>

          {/* «Сколько» склеенного изменения: кости правят amount (индекс 0), поле — apply (индекс 1). */}
          {group.amount ? (
            <>
              <Field label="Сколько — кости">
                <SlotInput
                  value={(group.amount as any).dice} context={context} dice
                  placeholder="какие кости: 1к8, 2к6…"
                  onChange={next => edit(0, draft => { (draft as any).dice = next ?? undefined; })}
                />
              </Field>
              <Field label="и прибавка">
                <SlotInput
                  value={(group.amount as any).bonus} context={context}
                  onChange={next => edit(0, draft => { (draft as any).bonus = next ?? undefined; })}
                />
              </Field>
            </>
          ) : (
            <Field label="Сколько">
              <SlotInput
                value={step.value} context={context} allow={['ref', 'param', 'const']}
                onChange={next => edit(0, draft => { (draft as any).value = next ?? undefined; })}
              />
            </Field>
          )}

          <Fold title="Тонкости">
            <Field label="не ниже">
              <SlotInput
                value={step.floor} context={context} allow={['tag']}
                onChange={next => edit(applyIndex, draft => { (draft as any).floor = next ?? undefined; })}
              />
            </Field>
            <Field label="не выше">
              <SlotInput
                value={step.ceiling} context={context} allow={['tag']}
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
            />
          </Field>
        </>
      )}
    </>
  );
}

// ── число ─────────────────────────────────────────────────────────────────

function NumberBody({ step, context, edit }: {
  step: any;
  context: SlotContext;
  edit: EditFn;
}) {
  const source = typeof step.source === 'object' ? 'roll' : (step.source ?? 'roll');

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
              value={step.dice} context={context} dice placeholder="какие кости: 1к8, 2к6…"
              onChange={next => edit(0, draft => { (draft as any).dice = next ?? undefined; })}
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
          />
        </Field>
      ) : null}
    </>
  );
}
