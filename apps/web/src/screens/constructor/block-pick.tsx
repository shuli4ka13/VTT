import { useState } from 'react';
import { Select, Input, Button } from '../../ui/primitives.tsx';
import { blockNames, NO_BLOCK } from '@vtt/engine/model/blocks';
import { groupChain } from './groups.ts';
import type { System } from '@vtt/schema';

const depthOf = (system: System, name: string): number => groupChain(system, name).length - 1;

export function BlockPick({ system, value, onChange }: {
  system: System;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const names = blockNames(system)
    .filter(name => name !== NO_BLOCK)
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
