import { useState } from 'react';
import type { System, Sheet } from '@vtt/schema';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { Card, CardHead, Field, Input, Segmented, Button } from '../../ui/primitives.tsx';
import { MANNEQUINS, mannequinsOf } from '../../engine/dry-run.ts';
import type { WorldState } from '../../store/world.ts';

export function Mannequins({ system, editSystem }: { system: System; editSystem: WorldState['editSystem'] }) {
  const [who, setWho] = useState(MANNEQUINS[0]!.id);
  const sheet = mannequinsOf(system).find(one => one.id === who)!;
  const stored = fieldsOf(system).filter(field => field.value.kind === 'stored' && !field.cell && (field.lives ?? 'sheet') === 'sheet');
  const kept = (system.mannequins ?? []).some(one => one.id === who);
  const put = (tag: string, text: string) => editSystem(draft => {
    const value = text.trim() === '' ? undefined : /^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text.trim()) : text;
    let own = (draft.mannequins ?? []).find(one => one.id === who);
    if (value === undefined) {
      if (!own) return;
      delete own.values[tag];
      if (Object.keys(own.values).length) return;
      draft.mannequins = draft.mannequins!.filter(one => one.id !== who);
      if (!draft.mannequins.length) delete draft.mannequins;
      return;
    }
    if (!own) { own = structuredClone(sheet) as Sheet; (draft.mannequins ??= []).push(own); }
    own.values[tag] = value;
  });
  return (
    <Card>
      <CardHead title="Манекены для пробы" sub="На них проба эффекта показывает, что он сделает. Пусто — значения по умолчанию." />
      <Segmented value={who} options={MANNEQUINS.map(one => ({ key: one.id, label: `манекен ${one.name}` }))} onChange={next => setWho(next)} />
      <div className="row">
        {stored.map(field => (
          <Field key={field.tag} label={field.label}>
            <DraftInput value={sheet.values?.[field.tag] === undefined ? '' : String(sheet.values[field.tag])} placeholder={String((field.value as { default?: unknown }).default ?? '')} onCommit={text => put(field.tag, text)} />
          </Field>
        ))}
      </div>
      {kept ? (
        <Button size="sm" variant="ghost" onClick={() => editSystem(draft => {
          draft.mannequins = (draft.mannequins ?? []).filter(one => one.id !== who);
          if (!draft.mannequins.length) delete draft.mannequins;
        })}>вернуть по умолчанию</Button>
      ) : null}
    </Card>
  );
}

function DraftInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null); };
  return (
    <Input mono value={draft ?? value} placeholder={placeholder} onChange={setDraft} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
