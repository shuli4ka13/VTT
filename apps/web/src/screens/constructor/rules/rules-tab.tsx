import { useState } from 'react';
import { useWorld } from '../../../store/world.ts';
import { Columns, List, ListItem } from '../../../ui/layout.tsx';
import { useLookupPane } from '../lookup-panel.tsx';
import { useUsage } from '../usage.ts';
import { useProblems } from '../problems.ts';
import { DiceSection, dieEntries } from './dice-section.tsx';
import { RollEditsSection, AdvantagePalette } from './roll-edits-section.tsx';
import { TablesSection } from './tables-section.tsx';
import { InitiativeSection } from './initiative-section.tsx';
import { TogglesSection } from './toggles-section.tsx';
import { BlocksSection } from './blocks-section.tsx';
import { CharacterSection, isCharacterColumn } from './character-section.tsx';
import { critOf, armorOf } from '@vtt/engine/model/toggles';
import type { System } from '@vtt/schema';
import { calledOf } from '@vtt/engine/engine/effects';
import { blockNames } from '@vtt/engine/model/blocks';

type SectionKey = 'character' | 'dice' | 'edits' | 'tables' | 'blocks' | 'initiative' | 'toggles';

interface Section {
  key: SectionKey;
  label: string;
  lint?: string;
  count: (system: System) => number;
}

const SECTIONS: Section[] = [
  { key: 'character', label: 'Листы', count: system => system.fields.filter(isCharacterColumn).length },
  { key: 'dice', label: 'Кости', count: system => dieEntries(system).length },
  { key: 'edits', label: 'Правки броска', count: system => Object.keys(system.roll_edits ?? {}).length },
  { key: 'tables', label: 'Таблицы', count: system => Object.keys(system.tables ?? {}).length },
  { key: 'blocks', label: 'Блоки', count: system => blockNames(system).length },
  { key: 'initiative', label: 'Инициатива', lint: 'initiative', count: system => (system.initiative ? 1 : 0) },
  {
    key: 'toggles', label: 'Быстрые настройки',
    count: system => [
      critOf(system) !== 'off',
      calledOf(system).some(([key]) => armorOf(system, key).choice !== 'none'),
    ].filter(Boolean).length,
  },
];

export function RulesTab() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  const usage = useUsage();
  const problems = useProblems();
  const wantedTable = useWorld(s => s.activeTableId);
  const pick = useWorld(s => s.pick);
  const [section, setSection] = useState<SectionKey>(wantedTable ? 'tables' : 'character');

  const broken = new Set(
    problems.filter(p => p.where.tab === 'rules' && p.where.section).map(p => p.where.section),
  );

  const right = useLookupPane({
    head: 'Готовое',
    body: <AdvantagePalette system={system} editSystem={editSystem} onAdded={() => setSection('edits')} />,
  });

  return (
    <Columns
      left={{
        head: 'Разделы правил',
        body: (
          <List>
            {SECTIONS.map(item => (
              <ListItem
                key={item.key}
                icon={item.lint && broken.has(item.lint) ? '!' : undefined}
                name={item.label}
                meta={`записей: ${item.count(system)}`}
                active={item.key === section}
                onClick={() => setSection(item.key)}
              />
            ))}
          </List>
        ),
      }}
      main={{
        body: (
          <>
            {section === 'character' ? (
              <CharacterSection system={system} editSystem={editSystem} usage={usage}
                onTable={id => { pick({ activeTableId: id }); setSection('tables'); }} />
            ) : null}
            {section === 'dice' ? <DiceSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'edits' ? <RollEditsSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'tables' ? <TablesSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'blocks' ? <BlocksSection system={system} /> : null}
            {section === 'initiative' ? <InitiativeSection system={system} editSystem={editSystem} /> : null}
            {section === 'toggles' ? <TogglesSection system={system} editSystem={editSystem} /> : null}
          </>
        ),
      }}
      right={right}
    />
  );
}
