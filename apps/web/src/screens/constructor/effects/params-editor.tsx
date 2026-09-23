import { kindsFor } from '@vtt/engine/words/kinds';
import { choiceTables } from '@vtt/engine/model/tables';
import { ASKABLE } from '@vtt/engine/model/asks';
import { freeId } from '../../../store/world.ts';
import { Card, CardHead, Input, Select, Button, Empty } from '../../../ui/primitives.tsx';
import type { Effect, Param, System } from '@vtt/schema';

const PARAM_KINDS = kindsFor('param');

const KIND_NOTE: Record<string, string> = {
  number: 'можно числом или формулой — она считается там, чьи поля в ней',
  dice: 'бросает тот, кто считает шаг',
  text: 'слово как есть',
  effect: 'какой эффект повесить или снять',
};

const MAIN_HINT = 'главное число — его правят сопротивления и уязвимости цели';

const ASK_OPTIONS = [
  ['', 'нет — обязан передать тот, кто вызывает'],
  ['actor', 'спросить игрока'],
  ['gm', 'спросить ведущего'],
] as const;

type Loose = Param & { role?: string; optional?: boolean };

export function ParamsEditor({ effect, system, onEdit }: {
  effect: Effect;
  system: System;
  onEdit: (change: (draft: Effect) => void) => void;
}) {
  const params = effect.params ?? [];
  const change = (key: string, fn: (target: Loose) => void) => onEdit(draft => {
    const target = draft.params?.find(p => p.key === key) as Loose | undefined;
    if (target) fn(target);
  });
  const addParam = () => onEdit(draft => {
    draft.params ??= [];
    draft.params.push({ key: freeId(draft.params.map(p => p.key), 'вход'), label: 'Новый вход', kind: 'number' });
  });
  const setMain = (key: string, on: boolean) => onEdit(draft => {
    for (const p of (draft.params ?? []) as Loose[]) {
      if (p.key === key && on) p.role = 'amount';
      else if (p.key === key || on) delete p.role;
    }
  });

  return (
    <Card>
      <CardHead title="Что приходит" />
      <p className="faint">
        Входы эффекта — как параметры функции: то, что у каждого вызова своё (кость меча, тип урона, дистанция).
        Поля листов объявлять не нужно — они пишутся прямо в шагах: @отправитель.…, @получатель.…, @стол.…
      </p>
      {params.length === 0 ? (
        <Empty
          title="Входов нет"
          hint="Всё, что лежит на листах и на столе, эффект читает сам. Вход нужен, когда значение приносит тот, кто вызывает, или его говорят за столом."
          action={<Button size="sm" onClick={addParam}>+ вход</Button>}
        />
      ) : (
        <div className="stack stack--tight">
          <div className="need-list__head">
            <span className="field__label">Название</span>
            <span className="field__label">Тип</span>
            <span className="field__label" />
            <span aria-hidden />
          </div>
          {(params as Loose[]).map(param => {
            const kind = String(param.kind ?? 'number');
            return (
              <div key={param.key} className="need">
                <Input value={param.label ?? ''} onChange={next => change(param.key, t => { t.label = next; })} />
                <Select
                  value={kind}
                  options={PARAM_KINDS}
                  onChange={next => change(param.key, t => {
                    t.kind = next;
                    if (next !== 'number') delete t.role;
                    if (!(ASKABLE as readonly string[]).includes(next)) delete t.ask;
                  })}
                />
                {kind === 'choice' ? (
                  <Select
                    value={String(param.from ?? '')}
                    options={[['', '— какая таблица —'],
                      ...choiceTables(system).map(([key, list]) => [key, list.label || key] as const)] as never}
                    onChange={next => change(param.key, t => { if (next) t.from = next; else delete t.from; })}
                  />
                ) : (
                  <span className="faint">{KIND_NOTE[kind] ?? ''}</span>
                )}
                <Button size="sm" variant="danger" onClick={() => onEdit(draft => {
                  draft.params = (draft.params ?? []).filter(p => p.key !== param.key);
                })}>
                  Убрать
                </Button>
                <div className="need__extra">
                  {kind === 'number' ? (
                    <label className="inline inline--tight" title={MAIN_HINT}>
                      <input
                        type="checkbox" checked={param.role === 'amount'}
                        onChange={e => setMain(param.key, e.target.checked)}
                      />
                      <span>{MAIN_HINT}</span>
                    </label>
                  ) : null}
                  <label className="inline inline--tight">
                    <input
                      type="checkbox" checked={!param.optional}
                      onChange={e => change(param.key, t => { if (e.target.checked) delete t.optional; else t.optional = true; })}
                    />
                    <span>обязателен</span>
                  </label>
                  {(ASKABLE as readonly string[]).includes(kind) ? (
                    <label className="inline inline--tight">
                      <span className="faint">если не передали:</span>
                      <Select
                        value={param.ask?.by ?? (param.ask ? 'actor' : '')}
                        options={ASK_OPTIONS}
                        onChange={next => change(param.key, t => {
                          if (next) t.ask = { ...(t.ask ?? {}), by: next };
                          else delete t.ask;
                        })}
                      />
                    </label>
                  ) : null}
                  {param.ask ? (
                    <Input
                      value={param.ask.hint ?? ''}
                      placeholder="что подсказать за столом"
                      onChange={next => change(param.key, t => {
                        if (!t.ask) return;
                        if (next) t.ask.hint = next; else delete t.ask.hint;
                      })}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {params.length ? <Button size="sm" onClick={addParam}>+ вход</Button> : null}
    </Card>
  );
}
