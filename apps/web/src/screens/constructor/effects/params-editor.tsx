import { freeId } from '../../../store/world.ts';
import { Card, CardHead, Input, Select, Button, Empty } from '../../../ui/primitives.tsx';
import type { Effect } from '@vtt/schema';

const PARAM_KINDS = [
  ['dice', 'кости'],
  ['number', 'число'],
  ['expr', 'формула'],
  ['effect', 'эффект-состояние'],
  ['choice', 'выбор'],
  ['tag', 'поле листа'],
] as const;

const PARAM_SIDES = [
  ['source', 'отправителя'],
  ['target', 'цели'],
] as const;

const FIXED_SIDE: Record<string, string> = {
  dice: 'бросает отправитель',
  tag: 'лист цели',
};

export function ParamsEditor({ effect, onEdit }: { effect: Effect; onEdit: (change: (draft: Effect) => void) => void }) {
  const params = effect.params ?? [];

  return (
    <Card>
      <CardHead title="Что эффект берёт из записи" />
      {params.length === 0 ? (
        <Empty
          title="Потребностей нет"
          hint="Значения шагов заполняются прямо на шагах. Заведите потребность, когда значение должно приходить от записи."
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
              {String(param.kind ?? 'expr') === 'expr' ? (
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
            </div>
          ))}
        </div>
      )}

      <Button size="sm" onClick={() => onEdit(draft => {
        draft.params ??= [];
        const key = freeId(draft.params.map(p => p.key), 'из_записи');
        draft.params.push({ key, label: 'Новая потребность', kind: 'expr' });
      })}>
        + брать из записи
      </Button>
    </Card>
  );
}
