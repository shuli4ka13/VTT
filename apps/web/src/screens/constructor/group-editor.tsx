import type { System } from '@vtt/schema';
import { useWorld } from '../../store/world.ts';
import { Card, CardHead, Field, Select, Button, DangerButton, LabelInput } from '../../ui/primitives.tsx';
import { renameGroup, freeGroupName, subtreeNames, groupChain } from './groups.ts';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';

export function GroupEditor({ name, system }: { name: string; system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const pick = useWorld(s => s.pick);

  const spec = system.groups?.[name];

  const inside = new Set(subtreeNames(system, name));
  const fieldCount = fieldsOf(system).filter(f => inside.has(f.group ?? 'Без блока')).length;
  const children = Object.entries(system.groups ?? {})
    .filter(([, s]) => s.parent === name).map(([child]) => child);

  const parents = [...new Set([
    ...Object.keys(system.groups ?? {}),
    ...fieldsOf(system).map(f => f.group ?? 'Без блока'),
  ])].filter(candidate => candidate !== name && !groupChain(system, candidate).includes(name));

  const rename = (next: string) => {
    const clean = next.trim();
    if (!clean || clean === name) return;
    const fresh = freeGroupName(system, clean) === clean ? clean : null;
    if (!fresh) return;
    editSystem(draft => renameGroup(draft, name, fresh));
    pick({ activeGroupName: fresh });
  };

  const addSubgroup = () => {
    const fresh = freeGroupName(system, 'Новая подгруппа');
    editSystem(draft => { (draft.groups ??= {})[fresh] = { parent: name }; });
    pick({ activeGroupName: fresh });
  };

  const removable = fieldCount === 0 && children.length === 0;

  return (
    <>
      <Card>
        <CardHead
          title={<LabelInput value={name} placeholder="как зовётся блок" onCommit={rename} />}
          actions={removable && spec ? (
            <DangerButton size="sm" onConfirm={() => {
              editSystem(draft => { if (draft.groups) delete draft.groups[name]; });
              pick({ activeGroupName: null });
            }}>
              Удалить
            </DangerButton>
          ) : undefined}
        />
        <div className="row">
          <Field label="Блок">
            <Select
              value={spec?.parent ?? ''}
              options={[['', '— сам по себе —'], ...parents.map(p => [p, p] as const)] as never}
              onChange={next => editSystem(draft => {
                const target = { ...draft.groups?.[name] };
                if (next) target.parent = next; else delete target.parent;
                (draft.groups ??= {})[name] = target;
              })}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Подгруппы" />
        <p className="faint">
          Блок в блоке: «Навыки от ловкости» внутри «Навыков».
        </p>
        <div className="inline">
          <Button size="sm" onClick={addSubgroup}>+ подгруппа</Button>
        </div>
      </Card>
    </>
  );
}
