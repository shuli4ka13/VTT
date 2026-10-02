import { useState } from 'react';
import type { System, TagContract } from '@vtt/schema';
import { tagWords } from '@vtt/engine/engine/roll-tags';
import { Card, CardHead, Field, Fold, Input, Select, Button, DangerButton, Chip, LabelInput } from '../../../ui/primitives.tsx';
import { freeId } from '../../../store/world.ts';
import { TagsField } from '../tags-field.tsx';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

export function TagsSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const tags = Object.entries(system.tags ?? {});
  const rows = [...tagWords(system)];
  const [open, setOpen] = useState<string | null>(null);
  const editTag = (key: string, change: (tag: TagContract) => void) => editSystem(draft => {
    const tag = draft.tags?.[key];
    if (tag) change(tag);
  });

  return (
    <>
      <Card>
        <CardHead
          title="Метки"
          sub="Метка действия — например, «атака»: подписки слушают «всё с меткой», правки правят «по метке». Договор метки — что обязано быть у каждого действия с ней."
          actions={<Button size="sm" onClick={() => editSystem(draft => {
            const key = freeId(Object.keys(draft.tags ?? {}), 'метка');
            (draft.tags ??= {})[key] = { label: 'Новая метка' };
            setOpen(key);
          })}>+ метка</Button>}
        />
        {tags.length ? (
          <div className="inline inline--tight">
            {tags.map(([key, tag]) => (
              <Chip key={key} active={open === key} onClick={() => setOpen(open === key ? null : key)}>{tag.label ?? key}</Chip>
            ))}
          </div>
        ) : <span className="faint">Меток с договором нет.</span>}
        {rows.length ? (
          <Fold title="Метки бросков" summary={`из таблиц: ${rows.length}`}>
            <span className="faint">Метки бросков — строки таблиц; заводятся в «Таблицах».</span>
            <div className="inline inline--tight">
              {rows.map(([word, table]) => <Chip key={`${table}:${word}`} title={`из таблицы «${table}»`}>{word}</Chip>)}
            </div>
          </Fold>
        ) : null}
      </Card>

      {open && system.tags?.[open] ? (
        <Contract
          id={open} tag={system.tags[open]!} system={system}
          edit={change => editTag(open, change)}
          onDelete={() => { editSystem(draft => { delete draft.tags?.[open]; }); setOpen(null); }}
        />
      ) : null}
    </>
  );
}

function Contract({ id, tag, system, edit, onDelete }: {
  id: string; tag: TagContract; system: System;
  edit: (change: (tag: TagContract) => void) => void;
  onDelete: () => void;
}) {
  const inputs = tag.inputs ?? [];
  return (
    <Card>
      <CardHead
        title={<LabelInput value={tag.label ?? id} placeholder="как зовётся метка" onCommit={label => edit(draft => { draft.label = label; })} />}
        actions={<DangerButton size="sm" onConfirm={onDelete}>Удалить</DangerButton>}
      />
      <Field label="Что есть у действия с этой меткой" hint="Входы, которые обязан объявить каждый эффект с этой меткой: подписка на метку может на них опереться.">
        <div className="stack stack--tight">
          {inputs.map((input, index) => (
            <div key={index} className="inline inline--tight">
              <Input value={input.key} placeholder="имя входа" onChange={next => edit(draft => { const one = draft.inputs?.[index]; if (one) one.key = next; })} />
              <Select<string>
                value={input.kind === 'sheet' ? (input.many ? 'sheets' : 'sheet') : String(input.kind)}
                options={[['sheet', 'лист'], ['sheets', 'список листов'], ['number', 'число'], ['choice', 'выбор']]}
                onChange={next => edit(draft => {
                  const one = draft.inputs?.[index];
                  if (!one) return;
                  one.kind = next === 'sheets' ? 'sheet' : next as never;
                  if (next === 'sheets') one.many = true; else delete one.many;
                })}
              />
              <Button size="sm" variant="ghost" title="убрать вход" onClick={() => edit(draft => {
                draft.inputs = (draft.inputs ?? []).filter((_, at) => at !== index);
                if (!draft.inputs.length) delete draft.inputs;
              })}>×</Button>
            </div>
          ))}
          <Button size="sm" onClick={() => edit(draft => { (draft.inputs ??= []).push({ key: inputs.length ? `вход_${inputs.length + 1}` : 'действующий', kind: 'sheet' }); })}>+ вход</Button>
        </div>
      </Field>
      <Fold title="ещё" summary="цикл, выходы, что включает">
        <div className="row">
          <Field label="Имя каждого в цикле" hint="Если действие перебирает цели: «для каждого» обязан звать каждого этим именем.">
            <Input value={tag.each ?? ''} placeholder="например: цель" onChange={next => edit(draft => { if (next.trim()) draft.each = next.trim(); else delete draft.each; })} />
          </Field>
          <Field label="Выходы" hint="Имена шагов внутри цикла, которые обязаны быть: «hit» — попал ли.">
            <Input value={(tag.outputs ?? []).join(', ')} placeholder="через запятую"
              onChange={next => edit(draft => { const list = next.split(',').map(t => t.trim()).filter(Boolean); if (list.length) draft.outputs = list; else delete draft.outputs; })} />
          </Field>
          <Field label="Включает" hint="Метки, договор которых входит в этот: «рукопашная» включает «атаку».">
            <TagsField
              system={{ ...system, tables: {} }}
              value={tag.includes}
              known={Object.keys(system.tags ?? {}).filter(key => key !== id)}
              onChange={next => edit(draft => { const list = next.filter((t): t is string => typeof t === 'string'); if (list.length) draft.includes = list; else delete draft.includes; })}
            />
          </Field>
        </div>
      </Fold>
    </Card>
  );
}
