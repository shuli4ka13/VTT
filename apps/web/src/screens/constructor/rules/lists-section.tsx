import { useWorld } from '../../../store/world.ts';
import { Card, CardHead, Field, Input, Select, Button, DangerButton, Empty, Chip } from '../../../ui/primitives.tsx';
import { listUsers } from '@vtt/engine/model/lists';
import { freeId } from '../../../store/world.ts';
import type { System } from '@vtt/schema';

export function ListsSection({ system }: { system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const lists = Object.entries(system.lists ?? {});

  const add = () => editSystem(draft => {
    const key = freeId(Object.keys(draft.lists ?? {}), 'список');
    (draft.lists ??= {})[key] = { label: '', values: [{ value: '', label: '' }] };
  });

  if (!lists.length) {
    return (
      <Empty
        title="Словарей ещё нет"
        hint="Словарь — набор значений под именем: виды урона, ступени стойкости, школы магии. На него ссылаются метки эффекта и варианты поля, чтобы список был написан один раз."
        action={<Button size="sm" onClick={add}>+ словарь</Button>}
      />
    );
  }

  return (
    <div className="stack">
      {lists.map(([key, list]) => {
        const users = listUsers(system, key);
        const numeric = (list.of ?? 'text') === 'number';
        const edit = (change: (draft: { label: string; of?: string; values: { value: unknown; label: string }[] }) => void) =>
          editSystem(draft => {
            const target = draft.lists?.[key];
            if (target) change(target as never);
          });

        return (
          <Card key={key}>
            <CardHead
              title={
                <Input
                  value={list.label}
                  placeholder="как зовётся словарь"
                  onChange={next => edit(draft => { draft.label = next; })}
                />
              }
              sub={users.length
                ? (users.length > 3
                  ? `берут отсюда: ${users.slice(0, 3).join(', ')} и ещё ${users.length - 3}`
                  : `берут отсюда: ${users.join(', ')}`)
                : 'пока никто не берёт'}
              actions={
                <DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.lists?.[key]; })}>
                  Удалить
                </DangerButton>
              }
            />

            <Field label="Что за значения">
              <Select
                value={list.of ?? 'text'}
                options={[['text', 'слова — огонь, холод, яд'], ['number', 'числа — 0, 0.5, 1, 2']] as const}
                onChange={next => editSystem(draft => {
                  const target = draft.lists?.[key];
                  if (!target) return;
                  target.of = next;
                  for (const option of target.values) {
                    const num = Number(option.value);
                    option.value = next === 'number' && Number.isFinite(num) ? num : String(option.value);
                  }
                })}
              />
            </Field>

            <Field label="Значения" hint="Слева то, что ложится в поле; справа — что видит человек.">
              <div className="stack stack--tight">
                {list.values.map((option, at) => (
                  <div className="pair" key={at}>
                    <Input
                      value={String(option.value)}
                      placeholder={numeric ? '0.5' : 'огонь'}
                      type={numeric ? 'number' : 'text'}
                      mono
                      invalid={numeric && option.value !== '' && !Number.isFinite(Number(option.value))}
                      onChange={next => edit(draft => {
                        const num = Number(next);
                        draft.values[at]!.value = numeric && Number.isFinite(num) && next !== '' ? num : next;
                      })}
                    />
                    <Input
                      value={option.label}
                      placeholder="как назвать"
                      onChange={next => edit(draft => { draft.values[at]!.label = next; })}
                    />
                    <Button
                      size="sm" variant="ghost" title="убрать значение"
                      disabled={list.values.length < 2}
                      onClick={() => edit(draft => { draft.values.splice(at, 1); })}
                    >×</Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => edit(draft => {
                  draft.values.push({ value: numeric ? draft.values.length : '', label: '' });
                })}>+ значение</Button>
              </div>
            </Field>

            <div className="inline inline--tight">
              {list.values.slice(0, 8).map((option, at) => (
                <Chip key={at}>{option.label || String(option.value) || '—'}</Chip>
              ))}
              {list.values.length > 8 ? <span className="faint">и ещё {list.values.length - 8}</span> : null}
            </div>
          </Card>
        );
      })}

      <Button size="sm" wide onClick={add}>+ словарь</Button>
    </div>
  );
}
