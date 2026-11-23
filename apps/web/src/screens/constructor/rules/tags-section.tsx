import { useState } from 'react';
import type { System, TagContract } from '@vtt/schema';
import { tagWords } from '@vtt/engine';
import { Card, CardHead, Field, Fold, Select, Button, DangerButton, Chip, LabelInput } from '../../../ui/primitives.tsx';
import { freeId, slugOf } from '../../../store/world.ts';
import { KEYS } from '../factory.ts';
import { dataT, useT } from '../../../i18n/author.ts';
import { rowSaid } from '../tag-said.ts';
import { TagsField } from '../tags-field.tsx';
import type { WorldState } from '../../../store/world.ts';

type EditSystem = WorldState['editSystem'];

export function TagsSection({ system, editSystem }: { system: System; editSystem: EditSystem }) {
  const t = useT('tables');
  const td = dataT(system);
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
          title={t('tag.title')}
          sub={t('tag.sub')}
          actions={<Button size="sm" onClick={() => editSystem(draft => {
            const key = freeId(Object.keys(draft.tags ?? {}), KEYS.tag);
            (draft.tags ??= {})[key] = { label: td('tables:tag.new') };
            setOpen(key);
          })}>{t('tag.add')}</Button>}
        />
        {tags.length ? (
          <div className="inline inline--tight">
            {tags.map(([key, tag]) => (
              <Chip key={key} active={open === key} onClick={() => setOpen(open === key ? null : key)}>{tag.label ?? key}</Chip>
            ))}
          </div>
        ) : <span className="faint">{t('tag.empty')}</span>}
        {rows.length ? (
          <Fold title={t('tag.rolls')} summary={t('tag.rollsSummary', { n: rows.length })}>
            <span className="faint">{t('tag.rollsNote')}</span>
            <div className="inline inline--tight">
              {rows.map(([word, table]) => <Chip key={`${table}:${word}`} title={t('tag.fromTable', { table })}>{rowSaid(system, word)}</Chip>)}
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

const namesOf = (tag: TagContract): string[] => [...(tag.inputs ?? []).map(input => input.key), ...(tag.each ? [tag.each] : []), ...(tag.outputs ?? [])];

function keyed(draft: TagContract, typed: string, fixed?: string): string {
  const text = typed.trim().replace(/\s+/g, ' ');
  const key = fixed ?? (slugOf(text) || text);
  if (key && key !== text) draft.said = { ...(draft.said ?? {}), [key]: text };
  return key;
}

function tidySaid(draft: TagContract): void {
  const used = new Set(namesOf(draft));
  const said = Object.fromEntries(Object.entries(draft.said ?? {}).filter(([key]) => used.has(key)));
  if (Object.keys(said).length) draft.said = said; else delete draft.said;
}

const saidOf = (tag: TagContract, key: string): string => tag.said?.[key] ?? key;

function Contract({ id, tag, system, edit, onDelete }: {
  id: string; tag: TagContract; system: System;
  edit: (change: (tag: TagContract) => void) => void;
  onDelete: () => void;
}) {
  const t = useT('tables');
  const td = dataT(system);
  const inputs = tag.inputs ?? [];
  return (
    <Card>
      <CardHead
        title={<LabelInput value={tag.label ?? id} placeholder={t('common:name.tag')} onCommit={label => edit(draft => { draft.label = label; })} />}
        actions={<DangerButton size="sm" onConfirm={onDelete}>{t('common:delete')}</DangerButton>}
      />
      <Field label={t('tag.has')} hint={t('tag.hasHint')}>
        <div className="stack stack--tight">
          {inputs.map((input, index) => (
            <div key={index} className="inline inline--tight">
              <LabelInput value={saidOf(tag, input.key)} placeholder={t('tag.inputName')} onCommit={next => edit(draft => {
                const one = draft.inputs?.[index];
                if (!one || !next.trim()) return;
                one.key = keyed(draft, next);
                tidySaid(draft);
              })} />
              <Select<string>
                value={input.kind === 'sheet' ? (input.many ? 'sheets' : 'sheet') : String(input.kind)}
                options={[['sheet', t('tag.sheet')], ['sheets', t('tag.sheets')], ['number', t('tag.number')], ['choice', t('tag.choice')]]}
                onChange={next => edit(draft => {
                  const one = draft.inputs?.[index];
                  if (!one) return;
                  one.kind = next === 'sheets' ? 'sheet' : next as never;
                  if (next === 'sheets') one.many = true; else delete one.many;
                })}
              />
              <Button size="sm" variant="ghost" title={t('tag.removeInput')} onClick={() => edit(draft => {
                draft.inputs = (draft.inputs ?? []).filter((_, at) => at !== index);
                if (!draft.inputs.length) delete draft.inputs;
                tidySaid(draft);
              })}>×</Button>
            </div>
          ))}
          <Button size="sm" onClick={() => edit(draft => {
            const key = inputs.length ? keyed(draft, td('tables:tag.input', { n: inputs.length + 1 }), `vhod_${inputs.length + 1}`) : keyed(draft, td('tables:tag.actor'), KEYS.actor);
            (draft.inputs ??= []).push({ key, kind: 'sheet' });
          })}>{t('tag.addInput')}</Button>
        </div>
      </Field>
      <Fold title={t('common:more')} summary={t('tag.moreSummary')}>
        <div className="row">
          <Field label={t('tag.each')} hint={t('tag.eachHint')}>
            <LabelInput value={tag.each ? saidOf(tag, tag.each) : ''} placeholder={t('tag.eachPlaceholder')} onCommit={next => edit(draft => {
              if (next.trim()) draft.each = keyed(draft, next); else delete draft.each;
              tidySaid(draft);
            })} />
          </Field>
          <Field label={t('tag.outputs')} hint={t('tag.outputsHint')}>
            <LabelInput value={(tag.outputs ?? []).map(one => saidOf(tag, one)).join(', ')} placeholder={t('tag.outputsPlaceholder')}
              onCommit={next => edit(draft => {
                const list = next.split(',').map(one => one.trim()).filter(Boolean).map(one => keyed(draft, one));
                if (list.length) draft.outputs = list; else delete draft.outputs;
                tidySaid(draft);
              })} />
          </Field>
          <Field label={t('tag.includes')} hint={t('tag.includesHint')}>
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
