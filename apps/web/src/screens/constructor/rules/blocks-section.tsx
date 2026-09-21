import { useState } from 'react';
import { useWorld } from '../../../store/world.ts';
import { List, ListItem } from '../../../ui/layout.tsx';
import { Button, Empty } from '../../../ui/primitives.tsx';
import { GroupEditor } from '../group-editor.tsx';
import { groupChain } from '../groups.ts';
import { blockNames, blockUse } from '@vtt/engine/model/blocks';
import { freeGroupName } from '../groups.ts';
import type { System } from '@vtt/schema';

const insideWords = (use: { fields: number; effects: number; records: number }): string => {
  const parts: string[] = [];
  if (use.fields) parts.push(`полей: ${use.fields}`);
  if (use.effects) parts.push(`эффектов: ${use.effects}`);
  if (use.records) parts.push(`типов записей: ${use.records}`);
  return parts.join(' · ') || 'пока пусто';
};

export function BlocksSection({ system }: { system: System }) {
  const editSystem = useWorld(s => s.editSystem);
  const names = blockNames(system).sort((a, b) => a.localeCompare(b, 'ru'));
  const [picked, setPicked] = useState<string | null>(names[0] ?? null);

  const add = () => {
    const name = freeGroupName(system, 'Новый блок');
    editSystem(draft => { (draft.groups ??= {})[name] = {}; });
    setPicked(name);
  };

  if (!names.length) {
    return (
      <Empty
        title="Блоков ещё нет"
        hint="Блок — папка. В ней лежат поля листа, эффекты и типы записей: «Характеристики», «Заклинания», «Снаряжение»."
        action={<Button size="sm" onClick={add}>+ блок</Button>}
      />
    );
  }

  const active = picked && names.includes(picked) ? picked : names[0]!;

  return (
    <div className="stack">
      <List>
        {names.map(name => {
          const depth = groupChain(system, name).length - 1;
          return (
            <ListItem
              key={name}
              name={`${'· '.repeat(depth)}${name}`}
              meta={insideWords(blockUse(system, name))}
              active={name === active}
              onClick={() => setPicked(name)}
            />
          );
        })}
      </List>

      <Button size="sm" wide onClick={add}>+ блок</Button>

      <GroupEditor name={active} system={system} />
    </div>
  );
}
