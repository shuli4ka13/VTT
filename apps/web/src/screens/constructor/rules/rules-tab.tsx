import { useState } from 'react';
import { useWorld } from '../../../store/world.ts';
import { Columns, List, ListItem } from '../../../ui/layout.tsx';
import { useLookupPane } from '../lookup-panel.tsx';
import { useUsage } from '../usage.ts';
import { useProblems } from '../problems.ts';
import { DiceSection, dieEntries } from './dice-section.tsx';
import { RollEditsSection, AdvantagePalette } from './roll-edits-section.tsx';
import { TablesSection } from './tables-section.tsx';
import { TogglesSection } from './toggles-section.tsx';
import { TagsSection } from './tags-section.tsx';
import { CombatSection } from './combat-section.tsx';
import { critOf, armorOf } from '@vtt/engine/model/toggles';
import type { System } from '@vtt/schema';
import { calledOf } from '@vtt/engine/engine/effects';
import { rowTables } from '@vtt/engine/model/tables';

type SectionKey = 'dice' | 'edits' | 'tables' | 'tags' | 'combat' | 'toggles';

interface Section {
  key: SectionKey;
  label: string;
  lint?: string;
  count: (system: System) => number;
}

const SECTIONS: Section[] = [
  { key: 'dice', label: 'Кости', count: system => dieEntries(system).length },
  { key: 'edits', label: 'Правки броска', count: system => Object.keys(system.roll_edits ?? {}).length },
  { key: 'tables', label: 'Таблицы', count: system => rowTables(system).length },
  { key: 'tags', label: 'Метки', count: system => Object.keys(system.tags ?? {}).length },
  { key: 'combat', label: 'Бой', count: system => (system.initiative ? 1 : 0) },
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
  const [section, setSection] = useState<SectionKey>('tables');

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
            {section === 'dice' ? <DiceSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'edits' ? <RollEditsSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'tables' ? <TablesSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'tags' ? <TagsSection system={system} editSystem={editSystem} /> : null}
            {section === 'combat' ? <CombatSection system={system} editSystem={editSystem} /> : null}
            {section === 'toggles' ? <TogglesSection system={system} editSystem={editSystem} /> : null}
          </>
        ),
      }}
      right={right}
    />
  );
}
