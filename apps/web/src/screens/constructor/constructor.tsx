// Конструктор систем: три вкладки, разведённые по тому, ЧТО они правят.
//
//   Лист    — какие поля бывают и как считаются
//   Эффекты — что мир делает сам
//   Записи  — какие бывают рода записей компендиума, то есть формы заполнения
//
// Всё это — режим АВТОРА: здесь вводятся новые теги. Экран, который только
// комбинирует существующие, автору не принадлежит и живёт отдельно.

import { useState } from 'react';
import { Tabs } from '../../ui/layout.tsx';
import { SheetTab } from './sheet-tab.tsx';
import { EffectsTab } from './effects-tab.tsx';
import { RecordsTab } from './records-tab.tsx';
import { WorldBar } from './world-bar.tsx';

type Tab = 'sheet' | 'effects' | 'records';

const TABS = [
  { key: 'sheet' as const, label: 'Лист' },
  { key: 'effects' as const, label: 'Эффекты' },
  { key: 'records' as const, label: 'Записи' },
];

export function ConstructorScreen() {
  const [tab, setTab] = useState<Tab>('sheet');

  return (
    <>
      <WorldBar />
      <Tabs value={tab} options={TABS} onChange={setTab} />
      {tab === 'sheet' ? <SheetTab /> : null}
      {tab === 'effects' ? <EffectsTab /> : null}
      {tab === 'records' ? <RecordsTab /> : null}
    </>
  );
}
