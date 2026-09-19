import { useState } from 'react';
import { Tabs } from '../../ui/layout.tsx';
import { TABS } from '../../words.ts';
import { SheetTab } from './sheet-tab.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { DictionariesTab } from './dictionaries.tsx';

type Tab = 'sheet' | 'effects' | 'records' | 'dictionaries';

const TAB_LIST = [
  { key: 'sheet' as const, label: TABS.sheet },
  { key: 'dictionaries' as const, label: TABS.rules },
  { key: 'effects' as const, label: TABS.effects },
  { key: 'records' as const, label: TABS.records },
];

export function ConstructorScreen() {
  const [tab, setTab] = useState<Tab>('sheet');

  return (
    <>
      <Tabs value={tab} options={TAB_LIST} onChange={setTab} />
      {tab === 'sheet' ? <SheetTab /> : null}
      {tab === 'effects' ? <EffectsTab /> : null}
      {tab === 'records' ? <RecordsTab /> : null}
      {tab === 'dictionaries' ? <DictionariesTab /> : null}
    </>
  );
}
