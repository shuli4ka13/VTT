import { useWorld } from '../../../store/world.ts';
import { Card, CardHead, Field, Input, Button, DangerButton, Empty, Chip } from '../../../ui/primitives.tsx';
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
        const edit = (change: (draft: { label: string; values: { value: unknown; label: string }[] }) => void) =>
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
              sub={users.length ? `берут отсюда: ${users.join(', ')}` : 'пока никто не берёт'}
              actions={
                <DangerButton size="sm" onConfirm={() => editSystem(draft => { delete draft.lists?.[key]; })}>
                  Удалить
                </DangerButton>
              }
            />

            <Field label="Значения" hint="Слева то, что ложится в поле; справа — что видит человек.">
              <div className="stack stack--tight">
                {list.values.map((option, at) => (
                  <div className="pair" key={at}>
                    <Input
                      value={String(option.value)}
                      placeholder="огонь или 0.5"
                      mono
                      onChange={next => edit(draft => {
                        const num = Number(next);
                        draft.values[at]!.value = next !== '' && Number.isFinite(num) ? num : next;
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
                  draft.values.push({ value: '', label: '' });
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
