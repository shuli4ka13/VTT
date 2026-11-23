import { useState } from 'react';
import { useWorld } from '../../../store/world.ts';
import { Columns, List, ListItem } from '../../../ui/layout.tsx';
import { useLookupPane } from '../lookup-panel.tsx';
import { useUsage } from '../usage.ts';
import { useProblems } from '../problems.ts';
import { DiceSection, dieEntries } from './dice-section.tsx';
import { RollEditsSection, AdvantagePalette } from './roll-edits-section.tsx';
import { TablesSection } from './tables-section.tsx';
import { RollsSection } from './rolls-section.tsx';
import { TogglesSection } from './toggles-section.tsx';
import { TagsSection } from './tags-section.tsx';
import { CombatSection } from './combat-section.tsx';
import { HealthSection } from './health-section.tsx';
import { LangsSection } from './langs-section.tsx';
import { critOf, armorOf, calledOf, rowTables, langsOf } from '@vtt/engine';
import type { System } from '@vtt/schema';
import { t as tg, useT } from '../../../i18n/author.ts'

type SectionKey = 'rolls' | 'tables' | 'tags' | 'combat' | 'vitals' | 'toggles' | 'langs';

interface Section {
  key: SectionKey;
  label: string;
  lint?: string;
  count: (system: System) => number;
}

const SECTIONS: Section[] = [
  { key: 'rolls', get label() { return tg('tables:section.rolls'); }, lint: 'roll_edits', count: system => dieEntries(system).length + Object.keys(system.rolls ?? {}).length + Object.keys(system.roll_edits ?? {}).length },
  { key: 'tables', get label() { return tg('tables:section.tables'); }, count: system => rowTables(system).length },
  { key: 'tags', get label() { return tg('tables:section.tags'); }, count: system => Object.keys(system.tags ?? {}).length },
  { key: 'combat', get label() { return tg('tables:section.combat'); }, count: system => (system.initiative ? 1 : 0) },
  { key: 'vitals', get label() { return tg('tables:section.vitals'); }, count: system => (system.health ? 1 : 0) },
  {
    key: 'toggles', get label() { return tg('tables:section.toggles'); },
    count: system => [
      critOf(system) !== 'off',
      calledOf(system).some(([key]) => armorOf(system, key).choice !== 'none'),
    ].filter(Boolean).length,
  },
  { key: 'langs', get label() { return tg('tables:section.langs'); }, count: system => langsOf(system).length - 1 },
];

export function RulesTab() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  const t = useT('tables');
  const usage = useUsage();
  const problems = useProblems();
  const [section, setSection] = useState<SectionKey>('tables');

  const broken = new Set(
    problems.filter(p => p.where.tab === 'rules' && p.where.section).map(p => p.where.section),
  );

  const right = useLookupPane({
    head: t('section.ready'),
    body: <AdvantagePalette system={system} editSystem={editSystem} onAdded={() => setSection('rolls')} />,
  });

  return (
    <Columns
      left={{
        head: t('section.title'),
        body: (
          <List>
            {SECTIONS.map(item => (
              <ListItem
                key={item.key}
                icon={(item.lint && broken.has(item.lint)) || broken.has(item.key) ? '!' : undefined}
                name={item.label}
                meta={t('section.count', { n: item.count(system) })}
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
            {section === 'rolls' ? (
              <div className="stack">
                <DiceSection system={system} editSystem={editSystem} usage={usage} />
                <RollsSection system={system} editSystem={editSystem} />
                <RollEditsSection system={system} editSystem={editSystem} usage={usage} />
              </div>
            ) : null}
            {section === 'tables' ? <TablesSection system={system} editSystem={editSystem} usage={usage} /> : null}
            {section === 'tags' ? <TagsSection system={system} editSystem={editSystem} /> : null}
            {section === 'combat' ? <CombatSection system={system} editSystem={editSystem} /> : null}
            {section === 'vitals' ? <HealthSection system={system} editSystem={editSystem} /> : null}
            {section === 'toggles' ? <TogglesSection system={system} editSystem={editSystem} /> : null}
            {section === 'langs' ? <LangsSection system={system} editSystem={editSystem} /> : null}
          </>
        ),
      }}
      right={right}
    />
  );
}
