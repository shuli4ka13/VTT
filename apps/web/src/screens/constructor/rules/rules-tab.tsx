import { useState } from 'react';
import { useWorld } from '../../../store/world.ts';
import { Columns, List, ListItem } from '../../../ui/layout.tsx';
import { useUsage } from '../usage.ts';
import { useProblems } from '../problems.ts';
import { DiceSection, dieEntries } from './dice-section.tsx';
import { RollEditsSection, AdvantagePalette } from './roll-edits-section.tsx';
import { RollsSection } from './rolls-section.tsx';
import { TablesSection } from './tables-section.tsx';
import { InitiativeSection } from './initiative-section.tsx';
import { ActionTypesSection } from './action-types-section.tsx';
import { TogglesSection } from './toggles-section.tsx';
import { ListsSection } from './lists-section.tsx';
import { critOf, armorOf } from '@vtt/engine/model/toggles';
import type { System } from '@vtt/schema';
import { calledOf } from '@vtt/engine/engine/effects';

type SectionKey = 'dice' | 'edits' | 'rolls' | 'tables' | 'lists' | 'initiative' | 'action_types' | 'toggles';

interface Section {
  key: SectionKey;
  label: string;
  lint?: string;
  count: (system: System) => number;
}

const SECTIONS: Section[] = [
  { key: 'dice', label: 'Кости', count: system => dieEntries(system).length },
  { key: 'edits', label: 'Правки броска', count: system => Object.keys(system.roll_edits ?? {}).length },
  { key: 'rolls', label: 'Виды бросков', count: system => (system.rolls ?? []).length },
  { key: 'tables', label: 'Таблицы', count: system => Object.keys(system.tables ?? {}).length },
  { key: 'lists', label: 'Словари', count: system => Object.keys(system.lists ?? {}).length },
  { key: 'initiative', label: 'Инициатива', lint: 'initiative', count: system => (system.initiative ? 1 : 0) },
  { key: 'action_types', label: 'Чего стоит действие', count: system => Object.keys(system.action_types ?? {}).length },
  {
    key: 'toggles', label: 'Тоглы',
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
  const [section, setSection] = useState<SectionKey>('dice');

  const broken = new Set(
    problems.filter(p => p.where.tab === 'rules' && p.where.section).map(p => p.where.section),
  );

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
        head: 'Правила системы',
        body: (
          <>
            {section === 'dice' ? <DiceSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'edits' ? <RollEditsSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'rolls' ? <RollsSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'tables' ? <TablesSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'lists' ? <ListsSection system={system} /> : null}
            {section === 'initiative' ? <InitiativeSection system={system} editSystem={editSystem} /> : null}
            {section === 'action_types'
              ? <ActionTypesSection system={system} editSystem={editSystem} usage={usage} />
              : null}
            {section === 'toggles' ? <TogglesSection system={system} editSystem={editSystem} /> : null}
          </>
        ),
      }}
      right={{
        head: 'Готовое',
        body: (
          <AdvantagePalette
            system={system}
            editSystem={editSystem}
            onAdded={() => setSection('edits')}
          />
        ),
      }}
    />
  );
}
