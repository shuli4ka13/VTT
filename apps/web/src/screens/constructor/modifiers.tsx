// Редактор модификаторов — нагрузка пассивного эффекта.
//
// Две породы, и смешивать их нельзя:
//
//   ЗНАЧЕНИЕ — кольчуга +2 к классу брони. Обычная арифметика, складывается
//              по правилу стакинга.
//   БРОСОК   — преимущество: два кубика, берём лучший. Не число, не
//              складывается: два преимущества дают одно, а помеха гасит
//              преимущество целиком.
//
// Попытка выразить преимущество числом — самая частая ошибка в конструкторах
// систем: для 5e она не работает примерно никогда, а для WFRP, Fate и Blades
// не работает вовсе.

import type { System, Modifier } from '@vtt/schema';
import { Card, CardHead, Field, Input, Select, Button, Segmented, Empty } from '../../ui/primitives.tsx';
import { FormulaInput } from '../../ui/formula.tsx';
import { targets } from '@vtt/engine/engine/targets';

const OPS = [
  ['add', 'прибавить'],
  ['mul', 'умножить'],
  ['set', 'задать'],
] as const;

const STACKING = [
  ['sum', 'складываются'],
  ['max', 'берётся наибольший'],
  ['override', 'последний перебивает'],
] as const;

const EFFECTS = [
  { key: 'advantage' as const, label: 'Преимущество', icon: '▲' },
  { key: 'disadvantage' as const, label: 'Помеха', icon: '▼' },
];

export function ModifiersEditor({ system, modifiers, onEdit }: {
  system: System;
  modifiers: Modifier[];
  onEdit: (change: (draft: Modifier[]) => void) => void;
}) {
  const all = targets(system) as { tag: string; label: string; kind: string; group?: string }[];
  const valueTargets = all.filter(t => t.kind === 'value' || t.kind === 'incoming');
  const rollTargets = all.filter(t => t.kind === 'roll');

  return (
    <>
      <div className="inline">
        <span className="screen-title" style={{ fontSize: 'var(--fs-5)' }}>Что правит</span>
        <span className="spacer" />
        <Button size="sm" onClick={() => onEdit(draft => {
          draft.push({ kind: 'value', target: valueTargets[0]?.tag ?? '', op: 'add', value: 1, stacking: 'sum', condition: null });
        })}>
          + правит значение
        </Button>
        <Button size="sm" onClick={() => onEdit(draft => {
          draft.push({ kind: 'roll', target: rollTargets[0]?.tag ?? '', effect: 'advantage', method: 'rerollBest', condition: null });
        })} disabled={rollTargets.length === 0}>
          + правит бросок
        </Button>
      </div>

      {modifiers.length === 0 ? (
        <Empty
          title="Эффект пока ничего не делает"
          hint="Пассивный эффект правит цифры: даёт бонус к полю или вешает преимущество на бросок."
        />
      ) : null}

      {modifiers.map((modifier, index) => (
        <Card key={index}>
          <CardHead
            title={modifier.kind === 'value' ? 'Правит значение' : 'Правит бросок'}
            actions={
              <Button size="sm" variant="danger" onClick={() => onEdit(draft => { draft.splice(index, 1); })}>×</Button>
            }
          />

          {modifier.kind === 'value' ? (
            <div className="row">
              <Field label="Что правим" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите мишень —'],
                    ...valueTargets.map(t => [t.tag, t.kind === 'incoming' ? `${t.label}` : t.label] as const)] as never}
                  onChange={target => onEdit(draft => { (draft[index] as Modifier).target = target; })}
                />
              </Field>
              <Field label="Как">
                <Select
                  value={String(modifier.op)}
                  options={OPS}
                  onChange={op => onEdit(draft => { (draft[index] as { op: string }).op = op; })}
                />
              </Field>
              <Field label="На сколько">
                <Input
                  value={String(modifier.value ?? '')}
                  onChange={next => onEdit(draft => {
                    (draft[index] as { value: unknown }).value =
                      /^-?\d+(\.\d+)?$/.test(next) ? Number(next) : next === 'true' ? true : next === 'false' ? false : next;
                  })}
                />
              </Field>
              <Field label="Если таких несколько">
                <Select
                  value={String(modifier.stacking ?? 'sum')}
                  options={STACKING}
                  onChange={stacking => onEdit(draft => { (draft[index] as { stacking?: string }).stacking = stacking; })}
                />
              </Field>
            </div>
          ) : (
            <div className="row">
              <Field label="На какой бросок" needed={!modifier.target}>
                <Select
                  value={modifier.target}
                  options={[['', '— выберите бросок —'],
                    ...rollTargets.map(t => [t.tag, t.label] as const)] as never}
                  onChange={target => onEdit(draft => { (draft[index] as Modifier).target = target; })}
                />
              </Field>
              <Field label="Что делает">
                <Segmented
                  value={modifier.effect}
                  options={EFFECTS}
                  onChange={effect => onEdit(draft => { (draft[index] as { effect: string }).effect = effect; })}
                />
              </Field>
            </div>
          )}

          <Field
            label="Только когда"
            hint="Условие на листе владельца. Пусто — всегда."
          >
            <FormulaInput
              system={system}
              value={modifier.condition ?? ''}
              onChange={condition => onEdit(draft => {
                (draft[index] as { condition?: string | null }).condition = condition || null;
              })}
              placeholder="например: #armor_heavy"
            />
          </Field>
        </Card>
      ))}
    </>
  );
}
