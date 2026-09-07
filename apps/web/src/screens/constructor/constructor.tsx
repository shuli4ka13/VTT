import { useState } from 'react';
import { Tabs } from '../../ui/layout.tsx';
import { SheetTab } from './sheet-tab.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { DictionariesTab } from './dictionaries.tsx';

type Tab = 'sheet' | 'effects' | 'records' | 'dictionaries';

const TABS = [
  { key: 'sheet' as const, label: 'Лист' },
  { key: 'dictionaries' as const, label: 'Правила' },
  { key: 'effects' as const, label: 'Эффекты' },
  { key: 'records' as const, label: 'Шаблон Компендиума' },
];

export function ConstructorScreen() {
  const [tab, setTab] = useState<Tab>('sheet');

  return (
    <>
      <Tabs value={tab} options={TABS} onChange={setTab} />
      {tab === 'sheet' ? <SheetTab /> : null}
      {tab === 'effects' ? <EffectsTab /> : null}
      {tab === 'records' ? <RecordsTab /> : null}
      {tab === 'dictionaries' ? <DictionariesTab /> : null}
    </>
  );
}
