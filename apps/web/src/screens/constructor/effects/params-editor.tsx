import { kindsFor } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { freeId, useWorld } from '../../../store/world.ts';
import { fillersOf } from './fillers.ts';
import { pickFor } from '../problems.ts';
import { Card, CardHead, Input, Select, Button, Empty } from '../../../ui/primitives.tsx';
import type { Effect, System } from '@vtt/schema';

const PARAM_KINDS = kindsFor('param');


const PARAM_SIDES = [
  ['source', 'отправителя'],
  ['target', 'цели'],
] as const;

const FIXED_SIDE: Record<string, string> = {
  dice: 'бросает отправитель',
  tag: 'лист цели',
  text: 'просто слово из записи',
  choice: 'выбирают в записи',
};

const MAIN_HINT = 'главное число — его правят сопротивления и уязвимости цели';

export function ParamsEditor({ id, effect, system, onEdit, called = false }: {
  id?: string;
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
  called?: boolean;
}) {
  const params = effect.params ?? [];
  const pick = useWorld(s => s.pick);
  const fillers = id ? fillersOf(system, id) : [];
  const addWord = '+ вход';
  const addParam = () => onEdit(draft => {
    draft.params ??= [];
    const key = freeId(draft.params.map(p => p.key), called ? 'вход' : 'из_записи');
    draft.params.push(called
      ? { key, label: 'Новый вход', kind: 'choice' }
      : { key, label: 'Новый вход', kind: 'expr' });
  });
  const setMain = (key: string, on: boolean) => onEdit(draft => {
    for (const p of draft.params ?? []) {
      const loose = p as { role?: string; key: string };
      if (loose.key === key && on) loose.role = 'amount';
      else if (loose.key === key || on) delete loose.role;
    }
  });
  const setOptional = (key: string, on: boolean) => onEdit(draft => {
    const target = draft.params?.find(p => p.key === key) as { optional?: boolean } | undefined;
    if (!target) return;
    if (on) target.optional = true; else delete target.optional;
  });

  return (
    <Card>
      <CardHead title="Что приходит" />
      <p className="faint">
        {called
          ? 'Входы эффекта, как у функции. Заполняет тот, кто зовёт этот эффект шагом «вызов». Выбор из таблицы — это ещё и метка вызова: по ней правки цели узнают, что за урон.'
          : 'Входы эффекта, как у функции. Заполняет запись, к которой привязан эффект, — оружие, заклинание; или спрашивают у игрока в момент действия.'}
        {' '}В шагах входы берут через @.
      </p>
      {id ? (
        <div className="fillers">
          <span className="field__label">Заполняют</span>
          {fillers.length ? fillers.map((filler, at) => (
            <button
              key={at} type="button"
              className={`fillers__item${filler.missing.length ? ' fillers__item--short' : ''}`}
              title={filler.missing.length ? `не заполнено: ${filler.missing.join(', ')}` : 'все входы заполнены'}
              onClick={() => pick(pickFor(filler.where))}
            >
              {filler.label}
              {filler.missing.length ? ` — не хватает: ${filler.missing.join(', ')}` : ' ✓'}
            </button>
          )) : (
            <span className="faint">
              {called ? 'пока никто не зовёт этот эффект шагом «вызов»' : 'пока ни одна запись не привязывает этот эффект к кнопке'}
            </span>
          )}
        </div>
      ) : null}
      {params.length === 0 ? (
        <Empty
          title="Входов нет"
          hint={called
            ? 'Заведите число, которое приходит, и выборы из таблиц — например «Тип урона».'
            : 'Значения шагов можно вписать прямо в шаги. Вход нужен, когда значение у каждой записи своё: кость меча, тип урона.'}
          action={<Button size="sm" onClick={addParam}>{addWord}</Button>}
        />
      ) : (
        <div className="stack stack--tight">
          <div className="need-list__head">
            <span className="field__label">Название</span>
            <span className="field__label">Чем заполняют</span>
            <span className="field__label">Чей лист</span>
            <span aria-hidden />
          </div>
          {params.map(param => (
            <div key={param.key} className="need">
              <Input
                value={param.label ?? ''}
                onChange={next => onEdit(draft => {
                  const target = draft.params?.find(p => p.key === param.key);
                  if (target) target.label = next;
                })}
              />
              <Select
                value={String(param.kind ?? 'expr')}
                options={PARAM_KINDS}
                onChange={next => onEdit(draft => {
                  const target = draft.params?.find(p => p.key === param.key);
                  if (target) target.kind = next;
                })}
              />
              {String(param.kind) === 'choice' ? (
                <Select
                  value={String(param.from ?? '')}
                  options={[['', '— какая таблица —'],
                    ...choiceTables(system)
                      .map(([key, list]) => [key, list.label || key] as const)] as never}
                  onChange={next => onEdit(draft => {
                    const target = draft.params?.find(p => p.key === param.key);
                    if (!target) return;
                    if (next) target.from = next; else delete target.from;
                  })}
                />
              ) : String(param.kind ?? 'expr') === 'expr' ? (
                <Select
                  value={param.of ?? 'source'}
                  options={PARAM_SIDES}
                  onChange={next => onEdit(draft => {
                    const target = draft.params?.find(p => p.key === param.key);
                    if (target) target.of = next === 'source' ? undefined : next;
                  })}
                />
              ) : (

                <span className="faint">{FIXED_SIDE[String(param.kind ?? '')] ?? '—'}</span>
              )}
              <Button size="sm" variant="danger" onClick={() => onEdit(draft => {
                draft.params = (draft.params ?? []).filter(p => p.key !== param.key);
              })}>
                Убрать
              </Button>
              {(
                <div className="need__extra">
                  {called && ['number', 'expr'].includes(String(param.kind ?? 'expr')) ? (
                    <label className="inline inline--tight" title={MAIN_HINT}>
                      <input
                        type="checkbox" checked={(param as { role?: string }).role === 'amount'}
                        onChange={e => setMain(param.key, e.target.checked)}
                      />
                      <span>{MAIN_HINT}</span>
                    </label>
                  ) : null}
                  <label className="inline inline--tight">
                    <input
                      type="checkbox" checked={!(param as { optional?: boolean }).optional}
                      onChange={e => setOptional(param.key, !e.target.checked)}
                    />
                    <span>обязателен</span>
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {params.length ? <Button size="sm" onClick={addParam}>{addWord}</Button> : null}
    </Card>
  );
}
