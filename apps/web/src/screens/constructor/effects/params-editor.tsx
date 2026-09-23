import { kindsFor } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { freeId } from '../../../store/world.ts';
import { Card, CardHead, Input, Select, Button, Empty } from '../../../ui/primitives.tsx';
import type { Effect, System } from '@vtt/schema';

const PARAM_KINDS = kindsFor('param');


const KIND_NOTE: Record<string, string> = {
  expr: 'чьи поля — видно по именам в формуле',
  dice: 'бросает отправитель',
  tag: 'поле получателя',
};

const MAIN_HINT = 'главное число — его правят сопротивления и уязвимости цели';

export function ParamsEditor({ effect, system, onEdit, called = false }: {
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
  called?: boolean;
}) {
  const params = effect.params ?? [];
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
        Входы эффекта — как параметры функции. В шагах их берут через @.
        {called ? ' Вход «из таблицы» — ещё и метка: по ней правки цели узнают, что пришло, например тип урона.' : ''}
      </p>
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
            <span className="field__label">Тип</span>
            <span className="field__label" />
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
              ) : (
                <span className="faint">{KIND_NOTE[String(param.kind ?? 'expr')] ?? ''}</span>
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
