import { useState } from 'react';
import { Select, Input, Button } from '../../ui/primitives.tsx';
import { blockNames, NO_BLOCK } from '@vtt/engine/model/blocks';
import { groupChain } from './groups.ts';
import type { System } from '@vtt/schema';
import { fieldsOf } from '@vtt/engine/model/sheet-columns';
import { kindsOf } from '@vtt/engine/model/owned';

const depthOf = (system: System, name: string): number => groupChain(system, name).length - 1;

export type BlockOf = 'fields' | 'effects' | 'records';

function usedBy(system: System, of: BlockOf): Set<string> {
  const groups = of === 'fields' ? fieldsOf(system).map(f => f.group)
    : of === 'effects' ? Object.values(system.effects).map(e => e.group)
      : kindsOf(system).map(([, k]) => k.block);
  return new Set(groups.filter((g): g is string => Boolean(g)).flatMap(g => groupChain(system, g)));
}

export const fieldBlocks = (system: System): string[] =>
  [...usedBy(system, 'fields')].sort((a, b) => a.localeCompare(b, 'ru'));

export function BlockPick({ system, value, onChange, of }: {
  system: System;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  of: BlockOf;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const mine = usedBy(system, of);
  const others = new Set((['fields', 'effects', 'records'] as const).filter(o => o !== of).flatMap(o => [...usedBy(system, o)]));
  const names = blockNames(system)
    .filter(name => name !== NO_BLOCK && (name === value || mine.has(name) || !others.has(name)))
    .sort((a, b) => a.localeCompare(b, 'ru'));

  const add = () => {
    const clean = draft.trim();
    if (!clean) return;
    onChange(clean);
    setDraft('');
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="inline inline--tight">
        <Input
          value={draft}
          placeholder="как назвать блок"
          onChange={setDraft}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }}
        />
        <Button size="sm" variant="ghost" disabled={!draft.trim()} onClick={add}>завести</Button>
        <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(''); }}>отмена</Button>
      </div>
    );
  }

  return (
    <div className="inline inline--tight">
      <Select
        value={value ?? ''}
        options={[['', `— ${NO_BLOCK.toLowerCase()} —`],
          ...names.map(name => [name, `${'· '.repeat(depthOf(system, name))}${name}`] as const)] as never}
        onChange={next => onChange(next || undefined)}
      />
      <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>+ новый</Button>
    </div>
  );
}
